/**
 * AgentTreeTracker - reconstructs the parent/child agent tree of one feature run
 * from the message stream, and nothing else.
 *
 * The SDK gives us exactly three facts to work with (see the header of
 * `libs/types/src/agent-tree.ts` for the full reasoning):
 *
 * 1. `parent_tool_use_id` names the agent that produced a message; absent/null
 *    means the root. That is the OWNER of the message.
 * 2. The `id` of a `tool_use` block named `Task` is the id the spawned child's
 *    messages will carry as their `parent_tool_use_id`. It is the child's
 *    primary key and the only parent->child link that exists.
 * 3. The matching `tool_result` is the ONLY completion signal a sub-agent has:
 *    it gets no `result` message and no `system/init` of its own.
 *
 * Because a child is parented to the owner of the message that CONTAINS its
 * Task block, the same rule builds the tree correctly at any depth without
 * guessing.
 *
 * This tracker is pure and synchronous: no I/O, no timers, no events. It is
 * called from inside four hot stream loops in `auto-mode-service.ts`, so
 * `observe()` must never throw - a malformed block may cost a node, never the
 * run.
 */

import {
  MASTER_AGENT_ID,
  MASTER_AGENT_NAME,
  type AgentNode,
  type AgentNodeId,
  type AgentNodeStatus,
  type AgentTree,
  type AgentTreeChange,
  type SubagentSummary,
} from '@dmaker/types';
import { createLogger } from '@dmaker/utils';

const logger = createLogger('AgentTree');

/** The tool whose `tool_use` blocks spawn sub-agents. */
const TASK_TOOL_NAME = 'Task';

/**
 * Name given to a node inferred from a child message whose Task block was never
 * seen. Replaced by the real `subagent_type` if that block turns up later.
 */
const INFERRED_AGENT_NAME = 'Sub-agent';

/** A Task result can be the whole of a sub-agent's work; it is not stored whole. */
const MAX_RESULT_CHARS = 4000;

/** Guards the parent walk in `recomputeDepths` against a malformed cycle. */
const MAX_TREE_DEPTH = 64;

/** The subset of a content block this tracker reads. All fields are untrusted. */
interface ObservedBlock {
  type?: unknown;
  id?: unknown;
  name?: unknown;
  input?: unknown;
  tool_use_id?: unknown;
  content?: unknown;
  is_error?: unknown;
}

/** The `Task` tool's input - the SDK's `AgentInput` (`sdk-tools.d.ts:31-59`). */
interface TaskInput {
  description?: unknown;
  prompt?: unknown;
  subagent_type?: unknown;
  model?: unknown;
  run_in_background?: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * A `tool_result`'s content is an array of blocks from Claude and a plain string
 * from every CLI-backed provider. Both flatten to the text a human would read.
 */
function flattenResultContent(content: unknown): string | undefined {
  if (typeof content === 'string') return content.slice(0, MAX_RESULT_CHARS) || undefined;
  if (!Array.isArray(content)) return undefined;

  const parts: string[] = [];
  let length = 0;
  for (const part of content) {
    let text: unknown;
    if (typeof part === 'string') {
      text = part;
    } else if (part && typeof part === 'object') {
      text = (part as { text?: unknown }).text;
    }
    if (typeof text !== 'string') continue;
    parts.push(text);
    // Stop as soon as the cap is reachable: a sub-agent's result can be its
    // entire output, and there is no point concatenating megabytes to slice
    // 4000 characters out of them.
    length += text.length + 1;
    if (length >= MAX_RESULT_CHARS) break;
  }

  const flattened = parts.join('\n').slice(0, MAX_RESULT_CHARS);
  return flattened || undefined;
}

export class AgentTreeTracker {
  private readonly featureId: string;
  private readonly nodes = new Map<AgentNodeId, AgentNode>();
  private readonly order: AgentNodeId[] = [];
  /**
   * tool_use block ids already counted. A resumed session replays messages it
   * has already delivered, and `observe()` is wired into four loops that can
   * see the same stream; counting by id makes `toolCallCount` idempotent.
   */
  private readonly countedToolUseIds = new Set<string>();
  private nextIndex = 1;

  constructor(featureId: string, startedAt: string = new Date().toISOString()) {
    this.featureId = featureId;
    const master: AgentNode = {
      id: MASTER_AGENT_ID,
      parentId: null,
      depth: 0,
      name: MASTER_AGENT_NAME,
      status: 'running',
      startedAt,
      toolCallCount: 0,
      index: 0,
    };
    this.nodes.set(master.id, master);
    this.order.push(master.id);
  }

  /**
   * Which agent produced this message. `parent_tool_use_id` is `null` on the
   * root's messages and absent entirely on non-Claude providers, and both mean
   * the same thing.
   */
  agentIdFor(msg: unknown): AgentNodeId {
    if (!msg || typeof msg !== 'object') return MASTER_AGENT_ID;
    const parent = (msg as { parent_tool_use_id?: unknown }).parent_tool_use_id;
    return asString(parent) ?? MASTER_AGENT_ID;
  }

  /** Display name for an agent id, for transcript markers and event payloads. */
  nameOf(id: AgentNodeId): string {
    const node = this.nodes.get(id);
    if (node) return node.name;
    return id === MASTER_AGENT_ID ? MASTER_AGENT_NAME : INFERRED_AGENT_NAME;
  }

  /**
   * Fold one stream message into the tree and report what changed.
   *
   * Accepts `unknown` deliberately: the four call sites hold four differently
   * typed messages (the service already casts them to `Record<string, unknown>`
   * for `accumulateFromMessage`), and every field is validated here anyway.
   */
  observe(msg: unknown): AgentTreeChange[] {
    const changes: AgentTreeChange[] = [];
    try {
      if (!msg || typeof msg !== 'object') return changes;
      const record = msg as {
        type?: unknown;
        subtype?: unknown;
        model?: unknown;
        message?: { content?: unknown } | null;
      };

      // Attribute the message before reading it: an owner we have not seen must
      // get a node, or every event stamped with that agentId is unattributable.
      const owner = this.ensureNode(this.agentIdFor(msg), changes);

      // `system/init` is the only message carrying the resolved model id, and it
      // is always the root's - a sub-agent never gets one.
      if (record.type === 'system' && record.subtype === 'init' && !owner.model) {
        owner.model = asString(record.model);
      }

      const content = record.message?.content;
      if (!Array.isArray(content)) return changes;

      for (const raw of content) {
        if (!raw || typeof raw !== 'object') continue;
        const block = raw as ObservedBlock;
        if (block.type === 'tool_use') {
          this.observeToolUse(block, owner, changes);
        } else if (block.type === 'tool_result') {
          this.observeToolResult(block, changes);
        }
      }
    } catch (error) {
      logger.warn('Ignoring an unreadable stream message:', error);
    }
    return changes;
  }

  /** The tree as it stands. Copied: the caller emits and persists it while this keeps mutating. */
  snapshot(): AgentTree {
    const nodes: Record<AgentNodeId, AgentNode> = {};
    for (const [id, node] of this.nodes) {
      nodes[id] = { ...node };
    }
    return {
      featureId: this.featureId,
      nodes,
      order: [...this.order],
      updatedAt: new Date().toISOString(),
    };
  }

  /** Roll-up for `executionMetrics.subagents`, in spawn order. Master is not a sub-agent. */
  toSummaries(): SubagentSummary[] {
    const summaries: SubagentSummary[] = [];
    for (const id of this.order) {
      if (id === MASTER_AGENT_ID) continue;
      const node = this.nodes.get(id);
      if (!node) continue;
      const summary: SubagentSummary = {
        agentId: node.id,
        parentAgentId: node.parentId ?? MASTER_AGENT_ID,
        depth: node.depth,
        name: node.name,
        status: node.status,
        startedAt: node.startedAt,
        toolCallCount: node.toolCallCount,
      };
      if (node.description !== undefined) summary.description = node.description;
      if (node.endedAt !== undefined) summary.endedAt = node.endedAt;
      summaries.push(summary);
    }
    return summaries;
  }

  /**
   * Close the run. Anything still running takes the run's own outcome: a
   * sub-agent with no `tool_result` never reported one of its own, and a
   * background Task never will.
   *
   * Returns one `finished` change per sub-agent so the caller can emit the
   * closing events. Master is finalized too but is deliberately not reported -
   * it is not a sub-agent, exactly as `toSummaries()` excludes it. Idempotent:
   * a second call reports nothing.
   */
  finalize(status: Exclude<AgentNodeStatus, 'running'>): AgentTreeChange[] {
    const changes: AgentTreeChange[] = [];
    for (const id of this.order) {
      const node = this.nodes.get(id);
      if (!node || node.status !== 'running') continue;
      const change = this.complete(node, status);
      if (id !== MASTER_AGENT_ID) changes.push(change);
    }
    return changes;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private ensureNode(id: AgentNodeId, changes: AgentTreeChange[]): AgentNode {
    const existing = this.nodes.get(id);
    if (existing) return existing;

    // An owner whose Task block was never on this stream - a resumed session can
    // start mid-sub-agent. A placeholder keeps the message attributed; dropping
    // it loses transcript and folding it into master loses the distinction. If
    // the Task block turns up later this node is backfilled, not replaced.
    const node = this.addNode(id, {
      parentId: MASTER_AGENT_ID,
      name: INFERRED_AGENT_NAME,
      inferred: true,
    });
    changes.push({ kind: 'spawned', node });
    return node;
  }

  private addNode(
    id: AgentNodeId,
    fields: { parentId: AgentNodeId; name: string; inferred?: boolean }
  ): AgentNode {
    const parent = this.nodes.get(fields.parentId);
    const node: AgentNode = {
      id,
      parentId: fields.parentId,
      depth: (parent?.depth ?? 0) + 1,
      name: fields.name,
      status: 'running',
      startedAt: new Date().toISOString(),
      toolCallCount: 0,
      index: this.nextIndex++,
    };
    if (fields.inferred) node.inferred = true;
    this.nodes.set(id, node);
    this.order.push(id);
    return node;
  }

  private observeToolUse(block: ObservedBlock, owner: AgentNode, changes: AgentTreeChange[]): void {
    const blockId = asString(block.id);
    if (!blockId || !this.countedToolUseIds.has(blockId)) {
      if (blockId) this.countedToolUseIds.add(blockId);
      owner.toolCallCount++;
    }

    // Only a Task block spawns an agent, and only its `id` can be the child's key.
    if (block.name !== TASK_TOOL_NAME || !blockId) return;

    const input = (block.input && typeof block.input === 'object' ? block.input : {}) as TaskInput;
    const existing = this.nodes.get(blockId);

    if (existing && !existing.inferred) return; // The same Task block, seen twice.

    if (existing) {
      // Backfill the placeholder in place. Re-creating the node would orphan
      // every message already attributed to it and duplicate it in `order`.
      existing.parentId = owner.id;
      delete existing.inferred;
      this.applyTaskInput(existing, input);
      this.recomputeDepths();
      // Re-announced so the client can upsert the real name and parent over the
      // placeholder it was given; both events key on the same node id.
      changes.push({ kind: 'spawned', node: existing });
      return;
    }

    const node = this.addNode(blockId, {
      parentId: owner.id,
      name: asString(input.subagent_type) ?? INFERRED_AGENT_NAME,
    });
    this.applyTaskInput(node, input);
    changes.push({ kind: 'spawned', node });
  }

  private applyTaskInput(node: AgentNode, input: TaskInput): void {
    const name = asString(input.subagent_type);
    if (name) node.name = name;
    const description = asString(input.description);
    if (description) node.description = description;
    const prompt = asString(input.prompt);
    if (prompt) node.prompt = prompt;
    const model = asString(input.model);
    if (model) node.model = model;
    if (input.run_in_background === true) node.background = true;
  }

  private observeToolResult(block: ObservedBlock, changes: AgentTreeChange[]): void {
    const targetId = asString(block.tool_use_id);
    if (!targetId) return;

    // Every tool_result carries a tool_use_id; only the ones matching a Task
    // block id name an agent. The rest are ordinary tool calls and are ignored.
    const node = this.nodes.get(targetId);
    if (!node || node.status !== 'running') return;

    const isError = block.is_error === true;
    const result = flattenResultContent(block.content);
    if (result !== undefined) node.result = result;
    if (isError) node.isError = true;
    changes.push(this.complete(node, isError ? 'failed' : 'completed'));
  }

  private complete(
    node: AgentNode,
    status: Exclude<AgentNodeStatus, 'running'>
  ): { kind: 'finished'; node: AgentNode; durationMs: number } {
    node.status = status;
    node.endedAt = new Date().toISOString();
    const startedAt = Date.parse(node.startedAt);
    const endedAt = Date.parse(node.endedAt);
    const durationMs =
      Number.isFinite(startedAt) && Number.isFinite(endedAt) ? Math.max(0, endedAt - startedAt) : 0;
    return { kind: 'finished', node, durationMs };
  }

  /**
   * Re-derive every depth from the parent links. Only needed after a backfill:
   * a placeholder is created parented to master, so its own children were given
   * depths measured from the wrong root.
   */
  private recomputeDepths(): void {
    for (const node of this.nodes.values()) {
      let depth = 0;
      let cursor = node;
      const seen = new Set<AgentNodeId>([node.id]);
      while (cursor.parentId && depth < MAX_TREE_DEPTH) {
        const parent = this.nodes.get(cursor.parentId);
        if (!parent || seen.has(parent.id)) break;
        seen.add(parent.id);
        cursor = parent;
        depth++;
      }
      node.depth = depth;
    }
  }
}
