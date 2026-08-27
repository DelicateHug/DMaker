/**
 * The parent/child agent tree for a single feature run.
 *
 * Every Claude run is a tree: one root agent (shown as "Master") plus a node
 * for each `Task` tool call it makes, recursively. The whole structure is
 * reconstructed from three facts the SDK gives us and nothing else:
 *
 * 1. `parent_tool_use_id` on every assistant/user/stream/tool_progress message
 *    (`agentSdkTypes.d.ts:371,403,475,512`) says which agent produced it —
 *    `null` means the root.
 * 2. The `id` of a `tool_use` block named `Task` is the id the child's messages
 *    will carry in their `parent_tool_use_id`. That block id is therefore the
 *    child's primary key, and it is the only thing that links parent to child.
 * 3. The matching `tool_result` is the ONLY completion signal a sub-agent has.
 *    A sub-agent gets no `result` message and no `system/init` of its own, so
 *    without the `tool_result` a finished child is indistinguishable from a
 *    running one.
 *
 * What deliberately is NOT here, because the SDK cannot supply it:
 * - Per-agent cost and token counts. `SDKResultMessage` and `SDKSystemMessage`
 *   carry no `parent_tool_use_id`, so all usage is whole-run. Do not add a cost
 *   field and do not render a cost column per agent.
 * - Sub-agent prose. The Task progress emitter forwards a child message only
 *   when it holds `tool_use` or `tool_result` blocks, so a child's observable
 *   activity is tool calls plus its final result — never narration.
 *
 * Non-Claude providers (Codex, Cursor, OpenCode) never set
 * `parent_tool_use_id`, and a read-only run has `Task` stripped from its tool
 * list. Both produce a correct one-node tree; that is not a bug and the UI must
 * render it as such.
 */

/** The root agent of every run. Its messages carry `parent_tool_use_id: null`. */
export const MASTER_AGENT_ID = 'master';

/**
 * Display name of the root agent. Shared so the server tracker, the persisted
 * sidecar and the UI's synthesised fallback tree cannot drift apart on the one
 * label a user always sees.
 */
export const MASTER_AGENT_NAME = 'Master';

/**
 * `MASTER_AGENT_ID` for the root; otherwise the `id` of the `Task` tool_use
 * block that spawned this agent.
 */
export type AgentNodeId = string;

export type AgentNodeStatus = 'running' | 'completed' | 'failed' | 'aborted';

export interface AgentNode {
  id: AgentNodeId;
  /** null only for the master node. */
  parentId: AgentNodeId | null;
  /** 0 for master, 1 for its direct sub-agents. */
  depth: number;
  /** `MASTER_AGENT_NAME` for the root; otherwise the Task input's `subagent_type`. */
  name: string;
  /** The Task input's `description` — its 3-5 word label. Absent on master. */
  description?: string;
  /** The Task input's `prompt`, verbatim. Absent on master. */
  prompt?: string;
  /**
   * The Task input's `model` when the caller pinned one ('sonnet'|'opus'|'haiku');
   * master carries the resolved bare model id instead.
   */
  model?: string;
  /**
   * The Task input's `run_in_background`. A background Task returns
   * `{status:"async_launched"}` and never gets an in-turn `tool_result`, so
   * this node will never stream and never completes on its own.
   */
  background?: boolean;
  status: AgentNodeStatus;
  startedAt: string;
  endedAt?: string;
  /** tool_use blocks attributed to this node, Task blocks included. */
  toolCallCount: number;
  /** Spawn order across the whole tree. Master is 0. */
  index: number;
  /** Flattened text of the Task tool_result, capped at 4000 chars. Absent while running. */
  result?: string;
  /** The Task tool_result carried `is_error`. */
  isError?: boolean;
  /**
   * The node was inferred from a child message whose spawning Task block was
   * never seen — a resumed session that starts mid-sub-agent does this. Better
   * a placeholder than a dropped message; the tracker backfills it if the Task
   * block turns up later.
   */
  inferred?: boolean;
}

export interface AgentTree {
  featureId: string;
  /** Always contains `MASTER_AGENT_ID`. */
  nodes: Record<AgentNodeId, AgentNode>;
  /** Spawn-ordered ids, master first. */
  order: AgentNodeId[];
  updatedAt: string;
}

/** What one observed message did to the tree. Emitted, not persisted. */
export type AgentTreeChange =
  | { kind: 'spawned'; node: AgentNode }
  | { kind: 'finished'; node: AgentNode; durationMs: number };

/**
 * Roll-up persisted into `feature.executionMetrics.subagents`, so a completed
 * feature can show its tree shape without reading the sidecar file.
 * Master is NOT included.
 */
export interface SubagentSummary {
  agentId: AgentNodeId;
  parentAgentId: AgentNodeId;
  depth: number;
  name: string;
  description?: string;
  status: AgentNodeStatus;
  startedAt: string;
  endedAt?: string;
  toolCallCount: number;
}

// ── Wire payloads ───────────────────────────────────────────────────────────
// All three ride inside the existing 'auto-mode:event' envelope; there are no
// new EventType names. `emitAutoModeEvent` stamps `type` and `timestamp`, so a
// caller passes the remaining fields. All three MUST be in the server's
// NEVER_THROTTLE set: a coalesced spawn event is a node missing from the tree.

/**
 * Emitted the instant a `Task` tool_use block is observed, before the
 * `auto_mode_tool` event for the same block — so a client never sees an event
 * carrying an `agentId` it has no node for.
 */
export interface AutoModeSubagentStartedEvent {
  type: 'auto_mode_subagent_started';
  timestamp: string;
  featureId: string;
  projectPath?: string;
  /** The Task tool_use block id — the node's primary key. */
  agentId: AgentNodeId;
  /** `MASTER_AGENT_ID` or another node id. */
  parentAgentId: AgentNodeId;
  depth: number;
  index: number;
  /** The Task input's `subagent_type`. */
  name: string;
  description?: string;
  /** Verbatim; the UI truncates. Omitted from the periodic snapshot to save bandwidth. */
  prompt?: string;
  model?: string;
  background?: boolean;
}

/** Emitted on the matching `tool_result`, or from the tracker's `finalize()` at run end. */
export interface AutoModeSubagentFinishedEvent {
  type: 'auto_mode_subagent_finished';
  timestamp: string;
  featureId: string;
  projectPath?: string;
  agentId: AgentNodeId;
  status: Exclude<AgentNodeStatus, 'running'>;
  durationMs: number;
  toolCallCount: number;
  isError?: boolean;
  /** Flattened tool_result text, capped at 4000 chars. */
  result?: string;
}

/**
 * Full snapshot, emitted on the existing 10s metrics interval and once at
 * teardown. This is the late-join resync: without it a UI opened mid-run shows
 * a partial tree forever, because it missed the spawn events.
 */
export interface AutoModeAgentTreeEvent {
  type: 'auto_mode_agent_tree';
  timestamp: string;
  featureId: string;
  projectPath?: string;
  tree: AgentTree;
}
