import { useEffect, useRef, useState } from 'react';
import { getElectronAPI, type AutoModeEvent, type ElectronAPI } from '@/lib/electron';
import { createLogger } from '@dmaker/utils/logger';
import {
  MASTER_AGENT_ID,
  MASTER_AGENT_NAME,
  type AgentNode,
  type AgentNodeId,
  type AgentTree,
} from '@dmaker/types';

const logger = createLogger('useAgentOutputStream');

/** Format an event timestamp the same way the agent output log does. */
export function formatTimestamp(timestamp?: string): string {
  const date = timestamp ? new Date(timestamp) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return `[${date.toLocaleTimeString()}] `;
}

/**
 * Render a live auto-mode event as a line of agent output.
 *
 * Returns an empty string for events that carry no user-visible text, so the
 * caller can skip appending. Several event types deliberately return '' —
 * `auto_mode_phase`, `auto_mode_task_started`, `planning_started`, the metrics
 * events and the agent-tree trio's snapshot all change structured state rather
 * than the transcript.
 */
export function eventToText(event: AutoModeEvent): string {
  switch (event.type) {
    case 'auto_mode_progress':
      return event.content || '';
    case 'auto_mode_tool': {
      const input = event.input ? JSON.stringify(event.input, null, 2) : '';
      return `\n${formatTimestamp(event.timestamp)}🔧 Tool: ${event.tool || 'Unknown Tool'}\n${
        input ? `Input: ${input}\n` : ''
      }`;
    }
    case 'auto_mode_subagent_started': {
      const description = event.description ? ` — ${event.description}` : '';
      return `\n${formatTimestamp(event.timestamp)}⚡ Sub-agent started: ${
        event.name
      }${description}\n`;
    }
    case 'auto_mode_subagent_finished': {
      const seconds = (event.durationMs / 1000).toFixed(1);
      const tools = `${event.toolCallCount} tool call${event.toolCallCount === 1 ? '' : 's'}`;
      const icon = event.status === 'completed' ? '✅' : '⚠️';
      return `\n${formatTimestamp(event.timestamp)}${icon} Sub-agent ${
        event.status
      } after ${seconds}s · ${tools}\n`;
    }
    case 'auto_mode_error':
      return `\n${formatTimestamp(event.timestamp)}❌ Error: ${event.error}\n`;
    case 'auto_mode_feature_complete':
      return `\n${formatTimestamp(event.timestamp)}${event.passes ? '✅' : '⚠️'} ${event.message}\n`;
    case 'pipeline_step_started':
      return `\n${formatTimestamp(event.timestamp)}▶ Step ${event.stepIndex + 1}/${
        event.totalSteps
      }: ${event.stepName}\n`;
    case 'pipeline_step_complete':
      return `\n${formatTimestamp(event.timestamp)}✔ Completed: ${event.stepName}\n`;
    default:
      return '';
  }
}

/**
 * The change-of-author marker the server writes into `agent-output.md`:
 * `[timestamp:<ISO>] [agent:<id>] ▶ <name>`. Mirrored here — and matched with
 * the same shape — because live events are appended to the same string the
 * file was read into, and `parseLogOutput` attributes an entry to whichever
 * marker it last saw. Without the marker every sub-agent's live output would be
 * filed under whoever happened to author the tail of the historical file.
 */
const TRANSCRIPT_AGENT_MARKER_REGEX =
  /^\[timestamp:(?:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\]\s*\[agent:([^\]]+)\]/;

/** Any embedded timestamp marker, used to date a transcript we have no tree for. */
const TRANSCRIPT_TIMESTAMP_REGEX =
  /\[timestamp:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\]/;

/** Which agent authored an event. Absent means the run itself, i.e. master. */
function agentIdOf(event: AutoModeEvent): AgentNodeId {
  return 'agentId' in event && event.agentId ? event.agentId : MASTER_AGENT_ID;
}

function displayNameFor(
  tree: AgentTree | null,
  agentId: AgentNodeId,
  event: AutoModeEvent
): string {
  if ('agentName' in event && event.agentName) return event.agentName;
  if (agentId === MASTER_AGENT_ID) return MASTER_AGENT_NAME;
  return tree?.nodes[agentId]?.name ?? agentId;
}

function isoTimestamp(timestamp?: string): string {
  const date = timestamp ? new Date(timestamp) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function agentMarkerLine(agentId: AgentNodeId, name: string, timestamp?: string): string {
  return `\n[timestamp:${isoTimestamp(timestamp)}] [agent:${agentId}] ▶ ${name}\n`;
}

/**
 * Split a transcript into per-agent slices on the server's change-of-author
 * markers, and report who authored its tail.
 *
 * A file written before markers existed has none, so the whole thing lands
 * under master — which is exactly right. The tail author comes out of the same
 * pass because a transcript is routinely megabytes and this runs on every load.
 */
function splitTranscriptByAgent(text: string): {
  byAgent: Record<AgentNodeId, string>;
  lastAgentId: AgentNodeId;
} {
  const byAgent: Record<AgentNodeId, string> = {};
  let current: AgentNodeId = MASTER_AGENT_ID;
  if (!text) return { byAgent, lastAgentId: current };

  const buckets = new Map<AgentNodeId, string[]>();

  for (const line of text.split('\n')) {
    const marker = line.match(TRANSCRIPT_AGENT_MARKER_REGEX);
    // The marker line belongs to the agent it introduces, matching how
    // parseLogOutput opens that agent's first entry on it.
    if (marker) current = marker[1];
    const bucket = buckets.get(current);
    if (bucket) bucket.push(line);
    else buckets.set(current, [line]);
  }

  for (const [agentId, lines] of buckets) byAgent[agentId] = lines.join('\n');
  return { byAgent, lastAgentId: current };
}

/**
 * The one-node tree used whenever the runner has none to give.
 *
 * This is not an error path. Every run recorded before agent-tree tracking
 * shipped has no sidecar, and neither does a run by a provider that never sets
 * `parent_tool_use_id` (Codex, Cursor, OpenCode) or a read-only run with `Task`
 * stripped from its tool list. One row reading "Master" over exactly today's
 * transcript is the correct rendering, and it is the path most users hit first.
 */
function synthesiseMasterTree(featureId: string, transcript: string): AgentTree {
  const startedAt = transcript.match(TRANSCRIPT_TIMESTAMP_REGEX)?.[1] ?? new Date().toISOString();
  const master: AgentNode = {
    id: MASTER_AGENT_ID,
    parentId: null,
    depth: 0,
    name: MASTER_AGENT_NAME,
    // A reconstruction of a finished transcript until an event proves
    // otherwise; see reviveSynthesisedMaster.
    status: 'completed',
    startedAt,
    toolCallCount: 0,
    index: 0,
  };
  return {
    featureId,
    nodes: { [MASTER_AGENT_ID]: master },
    order: [MASTER_AGENT_ID],
    updatedAt: new Date().toISOString(),
  };
}

interface StreamState {
  output: string;
  byAgent: Record<AgentNodeId, string>;
  tree: AgentTree | null;
  /** Author of the last text appended, so a marker is written only on a change. */
  lastAgentId: AgentNodeId;
  /** `tree` was built by synthesiseMasterTree rather than served by the runner. */
  synthesised: boolean;
}

const EMPTY_STATE: StreamState = {
  output: '',
  byAgent: {},
  tree: null,
  lastAgentId: MASTER_AGENT_ID,
  synthesised: false,
};

function loadedState(featureId: string, transcript: string, tree: AgentTree | null): StreamState {
  const { byAgent, lastAgentId } = splitTranscriptByAgent(transcript);
  return {
    output: transcript,
    byAgent,
    tree: tree ?? synthesiseMasterTree(featureId, transcript),
    lastAgentId,
    synthesised: tree === null,
  };
}

/**
 * Upsert a spawned node by id — never append.
 *
 * The server legitimately sends `auto_mode_subagent_started` twice for one
 * node: once as an inferred placeholder built from a child message whose Task
 * block was never seen, then again when that Task block turns up carrying the
 * real name and parent. Appending would double the tree. The node's own
 * progress (status, result, tool count) is kept, because the backfill only ever
 * knows more about where it came from, not about how it has been getting on.
 */
function upsertSpawnedNode(
  tree: AgentTree,
  event: Extract<AutoModeEvent, { type: 'auto_mode_subagent_started' }>
): AgentTree {
  const existing = tree.nodes[event.agentId];
  // Written out field by field rather than spread over `existing`: the event is
  // the authority on identity and the existing node on progress, and a spread
  // would leave the placeholder's `inferred: true` on a node the Task block has
  // since explained.
  const node: AgentNode = {
    id: event.agentId,
    parentId: event.parentAgentId,
    depth: event.depth,
    index: event.index,
    name: event.name,
    description: event.description,
    prompt: event.prompt,
    model: event.model,
    background: event.background,
    status: existing?.status ?? 'running',
    startedAt: existing?.startedAt ?? isoTimestamp(event.timestamp),
    endedAt: existing?.endedAt,
    toolCallCount: existing?.toolCallCount ?? 0,
    result: existing?.result,
    isError: existing?.isError,
  };

  return {
    ...tree,
    nodes: { ...tree.nodes, [event.agentId]: node },
    order: tree.order.includes(event.agentId) ? tree.order : [...tree.order, event.agentId],
    updatedAt: isoTimestamp(event.timestamp),
  };
}

/**
 * Close a node out. A finish for a node we never saw start happens whenever the
 * pane is opened mid-run, so it creates the placeholder rather than dropping
 * the only completion signal a sub-agent ever gets.
 */
function finishNode(
  tree: AgentTree,
  event: Extract<AutoModeEvent, { type: 'auto_mode_subagent_finished' }>
): AgentTree {
  const existing = tree.nodes[event.agentId];
  const endedAt = isoTimestamp(event.timestamp);
  const closed = {
    status: event.status,
    endedAt,
    toolCallCount: event.toolCallCount,
    isError: event.isError,
    result: event.result,
  };
  const node: AgentNode = existing
    ? { ...existing, ...closed }
    : {
        id: event.agentId,
        // All we know: it was a sub-agent of something. The next tree snapshot
        // corrects the parent and the name; `inferred` says not to trust them.
        parentId: MASTER_AGENT_ID,
        depth: 1,
        name: 'Sub-agent',
        index: tree.order.length,
        inferred: true,
        startedAt: endedAt,
        ...closed,
      };

  return {
    ...tree,
    nodes: { ...tree.nodes, [event.agentId]: node },
    order: tree.order.includes(event.agentId) ? tree.order : [...tree.order, event.agentId],
    updatedAt: isoTimestamp(event.timestamp),
  };
}

/**
 * Keep a synthesised master honest about whether it is still working.
 *
 * It starts 'completed' because a synthesised tree is a reconstruction of a
 * transcript that has already been written. But a live run by a provider that
 * emits no tree also lands here, and labelling a visibly streaming agent
 * "completed" is the one wrong answer a user would actually notice. Any event
 * for this feature means it is working; `endedAt` then pins the ending so a
 * late metrics or error event cannot resurrect a finished run.
 */
function reviveSynthesisedMaster(state: StreamState, event: AutoModeEvent): StreamState {
  if (!state.synthesised || !state.tree) return state;

  const master = state.tree.nodes[MASTER_AGENT_ID];
  if (!master) return state;

  const complete = event.type === 'auto_mode_feature_complete';
  if (!complete && (master.status !== 'completed' || master.endedAt)) return state;

  const next: AgentNode = complete
    ? {
        ...master,
        status: event.passes ? 'completed' : 'failed',
        endedAt: isoTimestamp(event.timestamp),
      }
    : { ...master, status: 'running' };

  return {
    ...state,
    tree: {
      ...state.tree,
      nodes: { ...state.tree.nodes, [MASTER_AGENT_ID]: next },
      updatedAt: isoTimestamp(event.timestamp),
    },
  };
}

/**
 * Fold one live event into the transcript and the tree.
 *
 * Pure, so buffered events can be replayed onto the historical state in exactly
 * the order they arrived.
 */
function applyEvent(state: StreamState, event: AutoModeEvent): StreamState {
  let next = state;

  switch (event.type) {
    case 'auto_mode_agent_tree':
      // The late-join resync. It replaces the tree wholesale: a pane opened
      // mid-run missed every spawn event and would otherwise show a partial
      // tree for the rest of the run.
      next = { ...next, tree: event.tree, synthesised: false };
      break;
    case 'auto_mode_subagent_started':
      if (next.tree) next = { ...next, tree: upsertSpawnedNode(next.tree, event) };
      break;
    case 'auto_mode_subagent_finished':
      if (next.tree) next = { ...next, tree: finishNode(next.tree, event) };
      break;
    default:
      break;
  }

  const text = eventToText(event);
  if (text) {
    const agentId = agentIdOf(event);
    const chunk =
      agentId === next.lastAgentId
        ? text
        : agentMarkerLine(agentId, displayNameFor(next.tree, agentId, event), event.timestamp) +
          text;
    next = {
      ...next,
      output: next.output + chunk,
      byAgent: { ...next.byAgent, [agentId]: (next.byAgent[agentId] ?? '') + chunk },
      lastAgentId: agentId,
    };
  }

  return reviveSynthesisedMaster(next, event);
}

async function loadAgentTree(
  api: ElectronAPI,
  projectPath: string,
  featureId: string
): Promise<AgentTree | null> {
  try {
    if (!api?.runningAgents?.getTree) return null;
    const result = await api.runningAgents.getTree(projectPath, featureId);
    return result.success ? (result.tree ?? null) : null;
  } catch (treeError) {
    // Never fatal: a missing tree is the documented answer for most runs, so a
    // failed lookup is treated the same as one that answered `null`.
    logger.warn('Failed to load agent tree; synthesising one instead', treeError);
    return null;
  }
}

export interface UseAgentOutputStreamResult {
  /** The whole transcript, historical plus live, in arrival order. */
  output: string;
  /** The same text sliced per agent, keyed by `AgentNode.id`. */
  byAgent: Record<AgentNodeId, string>;
  /** Never null once a load has settled — synthesised when the runner has none. */
  tree: AgentTree | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Loads a feature's persisted agent output and keeps appending live auto-mode
 * events for that same feature.
 *
 * Events that arrive while the historical fetch is still in flight are buffered
 * and replayed afterwards, so nothing is dropped and nothing is duplicated.
 */
export function useAgentOutputStream(
  projectPath: string | null,
  featureId: string | null
): UseAgentOutputStreamResult {
  const [state, setState] = useState<StreamState>(EMPTY_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Buffers events that land before the historical output resolves. Whole
  // events rather than rendered text, so a tree change made while the fetch is
  // in flight is replayed too and not just the line it printed.
  const pendingEventsRef = useRef<AutoModeEvent[]>([]);
  const isLoadingRef = useRef(false);

  // Load historical output.
  useEffect(() => {
    if (!projectPath || !featureId) {
      setState(EMPTY_STATE);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    isLoadingRef.current = true;
    pendingEventsRef.current = [];
    setError(null);

    const load = async () => {
      let base = EMPTY_STATE;

      try {
        const api = getElectronAPI();
        if (api?.features?.getAgentOutput) {
          const [result, tree] = await Promise.all([
            api.features.getAgentOutput(projectPath, featureId),
            loadAgentTree(api, projectPath, featureId),
          ]);
          if (cancelled) return;

          let historical = result.success ? result.content || '' : '';

          // No transcript on disk — fall back to whatever summaries the run left
          // behind. A finished task with nothing to show reads as "the agent did
          // nothing", when in fact it may simply have no transcript: runs from
          // before the output-path fix wrote theirs into the status directory
          // they started in and lost it on the next board refresh. The summary is
          // written through a freshly resolved path, so it usually survived.
          if (!historical && api.features.getSummaryFiles) {
            const summaryResult = await api.features.getSummaryFiles(projectPath, featureId);
            if (cancelled) return;
            const summaries = ('summaries' in summaryResult && summaryResult.summaries) || [];
            if (summaries.length > 0) {
              historical = [
                '_No agent transcript was saved for this run — showing the summaries it left behind._',
                ...summaries
                  .slice()
                  .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
                  .map((entry) => `\n---\n\n### ${entry.timestamp}\n\n${entry.summary}`),
              ].join('\n');
            }
          }

          base = loadedState(featureId, historical, tree);
        }
      } catch (loadError) {
        if (cancelled) return;
        logger.warn('Failed to load agent output', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Failed to load agent output');
      }

      // One settle point for every path, including the failed one: buffered
      // events belong to *this* feature, so replaying them onto a base built
      // for it is what stops them being dropped or landing on stale text.
      const buffered = pendingEventsRef.current;
      pendingEventsRef.current = [];
      setState(buffered.reduce(applyEvent, base));
      setIsLoading(false);
      isLoadingRef.current = false;
    };

    void load();

    return () => {
      cancelled = true;
      isLoadingRef.current = false;
    };
  }, [projectPath, featureId, refreshCounter]);

  // Append live events for this feature.
  useEffect(() => {
    if (!featureId) return;

    const api = getElectronAPI();
    if (!api?.autoMode?.onEvent) return;

    const unsubscribe = api.autoMode.onEvent((event) => {
      // Events without a featureId are global (e.g. run-level errors); anything
      // carrying a different featureId belongs to another feature's pane.
      if ('featureId' in event && event.featureId !== featureId) return;

      // Still fetching history — buffer so ordering stays correct.
      if (isLoadingRef.current) {
        pendingEventsRef.current.push(event);
        return;
      }
      setState((previous) => applyEvent(previous, event));
    });

    return unsubscribe;
  }, [featureId]);

  return {
    output: state.output,
    byAgent: state.byAgent,
    tree: state.tree,
    isLoading,
    error,
    refresh: () => setRefreshCounter((count) => count + 1),
  };
}
