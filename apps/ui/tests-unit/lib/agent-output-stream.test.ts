import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MASTER_AGENT_ID, MASTER_AGENT_NAME, type AgentTree } from '@dmaker/types';
import type { AutoModeEvent, ElectronAPI } from '@/lib/electron';

const { mockGetElectronAPI } = vi.hoisted(() => ({ mockGetElectronAPI: vi.fn() }));
vi.mock('@/lib/electron', () => ({ getElectronAPI: mockGetElectronAPI }));

const { eventToText, formatTimestamp, useAgentOutputStream } =
  await import('@/hooks/use-agent-output-stream');

const FEATURE_ID = 'feature-1';
const PROJECT_PATH = '/repo';
const TS = '2026-08-28T10:00:00.000Z';

function progress(content: string, extra: Partial<Record<string, unknown>> = {}): AutoModeEvent {
  return {
    type: 'auto_mode_progress',
    timestamp: TS,
    featureId: FEATURE_ID,
    content,
    ...extra,
  } as AutoModeEvent;
}

function spawned(overrides: Partial<Record<string, unknown>> = {}): AutoModeEvent {
  return {
    type: 'auto_mode_subagent_started',
    timestamp: TS,
    featureId: FEATURE_ID,
    agentId: 'toolu_01',
    parentAgentId: MASTER_AGENT_ID,
    depth: 1,
    index: 1,
    name: 'code-reviewer',
    description: 'Review the diff',
    ...overrides,
  } as AutoModeEvent;
}

// ── eventToText / formatTimestamp ────────────────────────────────────────────

describe('eventToText', () => {
  it('returns auto_mode_progress content verbatim, with no timestamp prefix', () => {
    // Progress is model prose mid-sentence: prefixing it would splice a
    // timestamp into the middle of a word.
    expect(eventToText(progress('half a sen'))).toBe('half a sen');
  });

  it('renders a tool call as the 🔧 line plus pretty-printed input', () => {
    const text = eventToText({
      type: 'auto_mode_tool',
      timestamp: TS,
      featureId: FEATURE_ID,
      tool: 'Read',
      input: { file_path: '/a.ts' },
    } as AutoModeEvent);

    expect(text).toContain('🔧 Tool: Read');
    expect(text).toContain('Input: {\n  "file_path": "/a.ts"\n}');
  });

  it('renders the two sub-agent lifecycle events', () => {
    expect(eventToText(spawned())).toContain(
      '⚡ Sub-agent started: code-reviewer — Review the diff'
    );

    const finished = eventToText({
      type: 'auto_mode_subagent_finished',
      timestamp: TS,
      featureId: FEATURE_ID,
      agentId: 'toolu_01',
      status: 'completed',
      durationMs: 12340,
      toolCallCount: 5,
    } as AutoModeEvent);

    expect(finished).toContain('✅ Sub-agent completed after 12.3s · 5 tool calls');
  });

  it('returns an empty string for an event that carries no transcript text', () => {
    // auto_mode_phase is one of several types that change structured state
    // rather than the transcript; the caller skips appending on ''.
    const text = eventToText({
      type: 'auto_mode_phase',
      timestamp: TS,
      featureId: FEATURE_ID,
      phase: 'planning',
      message: 'Planning',
    } as AutoModeEvent);

    expect(text).toBe('');
  });

  it('returns an empty string for the agent-tree snapshot, which is state and not text', () => {
    const text = eventToText({
      type: 'auto_mode_agent_tree',
      timestamp: TS,
      featureId: FEATURE_ID,
      tree: { featureId: FEATURE_ID, nodes: {}, order: [], updatedAt: TS },
    } as AutoModeEvent);

    expect(text).toBe('');
  });
});

describe('formatTimestamp', () => {
  it('returns an empty string for an unparseable timestamp rather than "Invalid Date"', () => {
    expect(formatTimestamp('not-a-date')).toBe('');
  });
});

// ── the hook ─────────────────────────────────────────────────────────────────

interface Harness {
  api: ElectronAPI;
  emit: (event: AutoModeEvent) => void;
  getAgentOutput: ReturnType<typeof vi.fn>;
  getTree: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
}

function buildHarness(transcript = ''): Harness {
  let listener: ((event: AutoModeEvent) => void) | null = null;

  const getAgentOutput = vi.fn(async () => ({ success: true, content: transcript }));
  const getSummaryFiles = vi.fn(async () => ({ success: true, summaries: [] }));
  const getTree = vi.fn(async () => ({ success: true, tree: null }));
  const unsubscribe = vi.fn();

  const api = {
    features: { getAgentOutput, getSummaryFiles },
    runningAgents: { getTree },
    autoMode: {
      onEvent: (callback: (event: AutoModeEvent) => void) => {
        listener = callback;
        return unsubscribe;
      },
    },
  } as unknown as ElectronAPI;

  return {
    api,
    getAgentOutput,
    getTree,
    unsubscribe,
    emit: (event: AutoModeEvent) => {
      if (!listener) throw new Error('nothing subscribed to auto-mode events');
      act(() => listener!(event));
    },
  };
}

function render() {
  return renderHook(() => useAgentOutputStream(PROJECT_PATH, FEATURE_ID));
}

describe('useAgentOutputStream', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = buildHarness();
    mockGetElectronAPI.mockReturnValue(harness.api);
  });

  it('synthesises a one-node Master tree when the runner has none', async () => {
    harness = buildHarness('[timestamp:2026-08-27T09:00:00.000Z] doing work\n');
    mockGetElectronAPI.mockReturnValue(harness.api);

    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Every run recorded before agent-tree tracking shipped takes this path, so
    // it is the common case rather than an error case.
    expect(result.current.tree).not.toBeNull();
    expect(result.current.tree?.order).toEqual([MASTER_AGENT_ID]);
    expect(result.current.tree?.nodes[MASTER_AGENT_ID]?.name).toBe(MASTER_AGENT_NAME);
    // Dated from the transcript, not from "now" — a run from last week must not
    // report a zero-second duration.
    expect(result.current.tree?.nodes[MASTER_AGENT_ID]?.startedAt).toBe('2026-08-27T09:00:00.000Z');
    expect(result.current.output).toContain('doing work');
  });

  it('keeps the served tree and does not synthesise over it', async () => {
    const served: AgentTree = {
      featureId: FEATURE_ID,
      nodes: {
        [MASTER_AGENT_ID]: {
          id: MASTER_AGENT_ID,
          parentId: null,
          depth: 0,
          name: MASTER_AGENT_NAME,
          status: 'completed',
          startedAt: TS,
          toolCallCount: 3,
          index: 0,
        },
        toolu_01: {
          id: 'toolu_01',
          parentId: MASTER_AGENT_ID,
          depth: 1,
          name: 'code-reviewer',
          status: 'completed',
          startedAt: TS,
          toolCallCount: 2,
          index: 1,
        },
      },
      order: [MASTER_AGENT_ID, 'toolu_01'],
      updatedAt: TS,
    };
    harness.getTree.mockResolvedValue({ success: true, tree: served });

    const { result } = render();
    await waitFor(() => expect(result.current.tree?.order).toHaveLength(2));

    expect(result.current.tree).toEqual(served);
  });

  it('replaces the tree wholesale on auto_mode_agent_tree', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    harness.emit(spawned({ agentId: 'toolu_stale' }));
    expect(result.current.tree?.order).toContain('toolu_stale');

    const resync: AgentTree = {
      featureId: FEATURE_ID,
      nodes: {
        [MASTER_AGENT_ID]: {
          id: MASTER_AGENT_ID,
          parentId: null,
          depth: 0,
          name: MASTER_AGENT_NAME,
          status: 'running',
          startedAt: TS,
          toolCallCount: 0,
          index: 0,
        },
      },
      order: [MASTER_AGENT_ID],
      updatedAt: TS,
    };

    harness.emit({
      type: 'auto_mode_agent_tree',
      timestamp: TS,
      featureId: FEATURE_ID,
      tree: resync,
    } as AutoModeEvent);

    // The snapshot is the late-join resync and is authoritative: a pane opened
    // mid-run missed the spawn events, so merging would preserve a partial tree
    // forever.
    expect(result.current.tree).toEqual(resync);
  });

  it('upserts a repeated spawn event by node id instead of appending', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The server sends this twice for one node: once as an inferred
    // placeholder, once when the Task block explaining it turns up.
    harness.emit(spawned({ name: 'Sub-agent', description: undefined }));
    harness.emit(spawned({ name: 'code-reviewer', description: 'Review the diff' }));

    expect(result.current.tree?.order).toEqual([MASTER_AGENT_ID, 'toolu_01']);
    expect(result.current.tree?.nodes.toolu_01?.name).toBe('code-reviewer');
    expect(result.current.tree?.nodes.toolu_01?.description).toBe('Review the diff');
  });

  it('closes a node out on auto_mode_subagent_finished', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    harness.emit(spawned());
    expect(result.current.tree?.nodes.toolu_01?.status).toBe('running');

    harness.emit({
      type: 'auto_mode_subagent_finished',
      timestamp: TS,
      featureId: FEATURE_ID,
      agentId: 'toolu_01',
      status: 'failed',
      durationMs: 1000,
      toolCallCount: 4,
      isError: true,
    } as AutoModeEvent);

    expect(result.current.tree?.nodes.toolu_01?.status).toBe('failed');
    expect(result.current.tree?.nodes.toolu_01?.toolCallCount).toBe(4);
    expect(result.current.tree?.nodes.toolu_01?.isError).toBe(true);
  });

  it('buffers events that arrive during the historical fetch and replays them in order', async () => {
    let resolveOutput!: (value: { success: boolean; content: string }) => void;
    harness.getAgentOutput.mockImplementation(
      () =>
        new Promise<{ success: boolean; content: string }>((resolve) => {
          resolveOutput = resolve;
        })
    );

    const { result } = render();
    expect(result.current.isLoading).toBe(true);

    harness.emit(progress('first'));
    harness.emit(progress('second'));
    // Nothing may land before the history it has to sit after.
    expect(result.current.output).toBe('');

    await act(async () => {
      resolveOutput({ success: true, content: 'history.' });
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.output).toBe('history.firstsecond');
  });

  it('slices the historical transcript per agent on the change-of-author markers', async () => {
    const transcript = [
      'master prose',
      '[timestamp:2026-08-28T10:00:00.000Z] [agent:toolu_01] ▶ code-reviewer',
      'child prose',
    ].join('\n');
    harness = buildHarness(transcript);
    mockGetElectronAPI.mockReturnValue(harness.api);

    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.byAgent[MASTER_AGENT_ID]).toBe('master prose');
    expect(result.current.byAgent.toolu_01).toContain('child prose');
    // The flat string is unchanged — agent-pane and the Agents pane both read it.
    expect(result.current.output).toBe(transcript);
  });

  it('marks a change of author in the flat transcript so live text stays attributable', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    harness.emit(progress('master says hi'));
    harness.emit(progress('child says hi', { agentId: 'toolu_01', agentName: 'code-reviewer' }));
    harness.emit(progress('child again', { agentId: 'toolu_01', agentName: 'code-reviewer' }));

    // Master authored the transcript's head, so no marker is written for it.
    expect(result.current.output).toContain('[agent:toolu_01] ▶ code-reviewer');
    expect(result.current.output.match(/\[agent:/g)).toHaveLength(1);
    expect(result.current.byAgent[MASTER_AGENT_ID]).toBe('master says hi');
    expect(result.current.byAgent.toolu_01).toContain('child says hi');
    expect(result.current.byAgent.toolu_01).toContain('child again');
  });

  it('attributes an event with no agentId to master rather than dropping it', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Pipeline steps, spec regeneration and every pre-change session emit none.
    harness.emit({
      type: 'pipeline_step_complete',
      timestamp: TS,
      featureId: FEATURE_ID,
      stepId: 's1',
      stepName: 'Lint',
      stepIndex: 0,
      totalSteps: 2,
    } as AutoModeEvent);

    expect(result.current.byAgent[MASTER_AGENT_ID]).toContain('✔ Completed: Lint');
    expect(result.current.output).toContain('✔ Completed: Lint');
  });

  it('ignores events belonging to another feature', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    harness.emit(progress('not mine', { featureId: 'someone-else' }));

    expect(result.current.output).toBe('');
  });

  it('shows a synthesised master as running once it starts streaming, then as complete', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // A live run by a provider that never sets parent_tool_use_id also gets no
    // tree; labelling a visibly streaming agent "completed" is the one wrong
    // answer a user would notice.
    expect(result.current.tree?.nodes[MASTER_AGENT_ID]?.status).toBe('completed');

    harness.emit(progress('working'));
    expect(result.current.tree?.nodes[MASTER_AGENT_ID]?.status).toBe('running');

    harness.emit({
      type: 'auto_mode_feature_complete',
      timestamp: TS,
      featureId: FEATURE_ID,
      passes: true,
      message: 'Done',
    } as AutoModeEvent);
    expect(result.current.tree?.nodes[MASTER_AGENT_ID]?.status).toBe('completed');

    // A late metrics event must not resurrect a finished run.
    harness.emit({
      type: 'auto_mode_metrics_update',
      timestamp: TS,
      featureId: FEATURE_ID,
      metrics: {},
    } as unknown as AutoModeEvent);
    expect(result.current.tree?.nodes[MASTER_AGENT_ID]?.status).toBe('completed');
  });
});
