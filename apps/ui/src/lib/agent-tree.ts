import { MASTER_AGENT_ID, type AgentNode, type AgentNodeId, type AgentTree } from '@dmaker/types';

/**
 * Miller-column derivations over an `AgentTree`.
 *
 * The Agents pane shows a run as one row per level: the root ("Master") on top,
 * and a new row for each agent you click into that has children. The selection
 * is a plain array of ids indexed by row depth, which is what makes the whole
 * interaction rule one line — `[...path.slice(0, rowDepth), agentId]` — with no
 * ancestor walk anywhere.
 *
 * Two invariants hold throughout, both for the same reason: an agent that
 * exists but renders nowhere is the one failure this pane must not have.
 *
 * - A node whose `parentId` names an agent that is not in the tree is re-parented
 *   onto the root rather than dropped. The server legitimately emits inferred
 *   placeholders (a resumed session that starts mid-sub-agent), and a snapshot
 *   can reach the UI before the parent's own Task block does.
 * - Every walk carries a visited set. A malformed tree with a parent cycle must
 *   degrade, not hang the pane.
 */

export interface AgentIndex {
  /** The run's root agent, or null for an absent/empty tree. */
  root: AgentNode | null;
  /** The tree's nodes, unchanged — kept here so callers need only one object. */
  nodes: Record<AgentNodeId, AgentNode>;
  /** Children keyed by parent id, each list in spawn order. Leaves are absent. */
  childrenByParent: Record<AgentNodeId, AgentNode[]>;
}

const EMPTY_INDEX: AgentIndex = { root: null, nodes: {}, childrenByParent: {} };

/**
 * Spawn order: `startedAt`, then `index` for two agents spawned in the same
 * millisecond, then the id so the sort is total and a re-render cannot reorder
 * a row under the pointer.
 *
 * `startedAt` is compared as a string on purpose. Every writer stamps it with
 * `toISOString()`, so the format is fixed-width UTC and lexicographic order is
 * chronological order — without parsing several dates per render.
 */
function compareNodes(a: AgentNode, b: AgentNode): number {
  const left = a.startedAt ?? '';
  const right = b.startedAt ?? '';
  if (left !== right) return left < right ? -1 : 1;
  if (a.index !== b.index) return a.index - b.index;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Group a tree's nodes by parent, once, so a render does not re-scan per row. */
export function indexAgents(tree: AgentTree | null | undefined): AgentIndex {
  const nodes = tree?.nodes;
  if (!nodes) return EMPTY_INDEX;

  const ordered = Object.values(nodes)
    .filter((node): node is AgentNode => Boolean(node?.id))
    .sort(compareNodes);

  // `MASTER_AGENT_ID` is the documented root of every tree. The two fallbacks
  // cover a sidecar written by something that disagreed rather than returning
  // "no agents" for a run that plainly had one.
  const root =
    nodes[MASTER_AGENT_ID] ?? ordered.find((node) => node.parentId === null) ?? ordered[0];
  if (!root) return EMPTY_INDEX;

  const childrenByParent: Record<AgentNodeId, AgentNode[]> = {};
  for (const node of ordered) {
    if (node.id === root.id) continue;
    const declared = node.parentId;
    const parentId = declared && declared !== node.id && nodes[declared] ? declared : root.id;
    (childrenByParent[parentId] ??= []).push(node);
  }

  return { root, nodes, childrenByParent };
}

/** The agents spawned directly by `agentId`, in spawn order. */
export function childrenOf(tree: AgentTree | null | undefined, agentId: AgentNodeId): AgentNode[] {
  return indexAgents(tree).childrenByParent[agentId] ?? [];
}

/**
 * The rows to render for a given selection.
 *
 * Row 0 is always the root on its own. Row `k` holds the children of
 * `path[k - 1]`, so a row appears the moment its parent is selected and
 * disappears again when the selection moves back up. An agent with no children
 * ends the chain.
 */
export function buildChainRows(
  tree: AgentTree | null | undefined,
  path: readonly AgentNodeId[]
): AgentNode[][] {
  const index = indexAgents(tree);
  if (!index.root) return [];

  const rows: AgentNode[][] = [[index.root]];
  const seen = new Set<AgentNodeId>();
  for (const agentId of path) {
    if (seen.has(agentId)) break;
    seen.add(agentId);
    const children = index.childrenByParent[agentId];
    if (!children || children.length === 0) break;
    rows.push(children);
  }
  return rows;
}

function sameIds(a: readonly AgentNodeId[], b: readonly AgentNodeId[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, position) => id === b[position]);
}

/**
 * Bring a selection back into agreement with the tree, truncating at the first
 * id that has gone or whose parent link no longer holds. An empty path becomes
 * the root, which is how the pane opens.
 *
 * Returns the array it was given, by reference, when nothing moved. That is
 * load-bearing rather than a micro-optimisation: every streamed event rebuilds
 * the tree, so a reconcile that always allocated would churn the selection
 * state on every token and remount the transcript underneath the reader.
 */
export function reconcilePath(
  tree: AgentTree | null | undefined,
  path: AgentNodeId[]
): AgentNodeId[] {
  const index = indexAgents(tree);
  if (!index.root) return path.length === 0 ? path : [];

  const next: AgentNodeId[] = [index.root.id];
  for (let depth = 1; depth < path.length; depth++) {
    const candidate = index.nodes[path[depth]];
    if (!candidate) break;
    // Membership in the parent's row, not `candidate.parentId`, so a re-parented
    // orphan stays reachable and this agrees with buildChainRows exactly.
    const siblings = index.childrenByParent[next[depth - 1]];
    if (!siblings?.some((sibling) => sibling.id === candidate.id)) break;
    next.push(candidate.id);
  }

  return sameIds(next, path) ? path : next;
}

/**
 * `agentId` followed by everything beneath it, depth-first in spawn order.
 *
 * Depth-first because that is the order the work happened in: an agent's own
 * children ran inside its turn, not after it.
 */
export function collectSubtreeIds(
  tree: AgentTree | null | undefined,
  agentId: AgentNodeId
): AgentNodeId[] {
  const index = indexAgents(tree);
  if (!index.nodes[agentId]) return [];

  const ids: AgentNodeId[] = [];
  const seen = new Set<AgentNodeId>();
  const visit = (id: AgentNodeId) => {
    if (seen.has(id)) return;
    seen.add(id);
    ids.push(id);
    for (const child of index.childrenByParent[id] ?? []) visit(child.id);
  };

  visit(agentId);
  return ids;
}

/**
 * The server's change-of-author marker, `[timestamp:<ISO>] [agent:<id>] ▶ <name>`.
 *
 * Restated here rather than imported because the writers are a server service
 * and a UI hook that both own their own copy; a third import would not make the
 * format any more shared than it already is. The unit test pins the exact
 * string a transcript carries, so a drift fails loudly instead of silently
 * filing every sub-agent's output under whoever wrote the previous line.
 */
const TRANSCRIPT_AGENT_MARKER_REGEX =
  /^\[timestamp:(?:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\]\s*\[agent:([^\]]+)\]/;

/**
 * The lines of `transcript` authored by any of `agentIds`, in the order they
 * were written.
 *
 * Chronological across agents rather than grouped per agent: a parent and the
 * sub-agent it spawned interleave in real time, and re-ordering them would
 * misrepresent what happened. Text before the first marker belongs to master,
 * which is exactly how every pre-marker transcript reads.
 *
 * Passing every id in the tree returns the input byte for byte — `split('\n')`
 * followed by `join('\n')` is lossless — which is what keeps "Master selected,
 * sub-agents included" identical to the transcript this pane replaces.
 */
export function sliceTranscriptForAgents(
  transcript: string,
  agentIds: Iterable<AgentNodeId>
): string {
  const allowed = new Set(agentIds);
  if (!transcript || allowed.size === 0) return '';

  const kept: string[] = [];
  let current: AgentNodeId = MASTER_AGENT_ID;
  for (const line of transcript.split('\n')) {
    const marker = line.match(TRANSCRIPT_AGENT_MARKER_REGEX);
    // The marker line belongs to the agent it introduces, matching how the
    // parser opens that agent's first entry on it.
    if (marker) current = marker[1];
    if (allowed.has(current)) kept.push(line);
  }
  return kept.join('\n');
}
