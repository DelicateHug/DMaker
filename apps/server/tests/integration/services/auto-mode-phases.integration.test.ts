import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoModeService } from '@/services/auto-mode-service.js';
import { ProviderFactory } from '@/providers/provider-factory.js';
import { FeatureLoader } from '@/services/feature-loader.js';
import { MASTER_AGENT_ID } from '@dmaker/types';
import { createTestGitRepo, createTestFeature, type TestRepo } from '../helpers/git-test-repo.js';

vi.mock('@/providers/provider-factory.js');

// Same reason as auto-mode-service.integration.test.ts: ownership is settled by
// shelling out to `gh`, which this suite has no business depending on.
vi.mock('@/services/github-sync-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/github-sync-service.js')>();
  const stub = {
    resolveOwnership: async () => ({ canWrite: true, owner: 'test-user' }),
    canExecute: async () => ({ allowed: true }),
    getCurrentUser: async () => 'test-user',
    syncIssueData: async () => null,
  };
  return { ...actual, getGitHubSyncService: () => stub };
});

/** The sub-agent's primary key: the id of the Task tool_use block that spawned it. */
const TASK_BLOCK_ID = 'toolu_01SubAgentBlock';

type EmittedEvent = Record<string, unknown>;

describe('auto-mode-service.ts — progress markers and the agent tree', () => {
  let service: AutoModeService;
  let featureLoader: FeatureLoader;
  let testRepo: TestRepo;
  const mockEvents = {
    subscribe: vi.fn(),
    emit: vi.fn(),
  };

  /** Auto-mode sub-events of one type, in emission order. */
  const emittedOfType = (type: string): EmittedEvent[] =>
    mockEvents.emit.mock.calls
      .filter((call) => (call[1] as EmittedEvent | undefined)?.type === type)
      .map((call) => call[1] as EmittedEvent);

  beforeEach(async () => {
    vi.clearAllMocks();
    featureLoader = new FeatureLoader();
    service = new AutoModeService(mockEvents as any, undefined, featureLoader);
    testRepo = await createTestGitRepo();
  });

  afterEach(async () => {
    await service.stopAutoLoop();
    if (testRepo) await testRepo.cleanup();
  });

  const assistantText = (text: string, parentToolUseId: string | null = null) => ({
    type: 'assistant',
    parent_tool_use_id: parentToolUseId,
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  });

  const assistantTool = (
    block: Record<string, unknown>,
    parentToolUseId: string | null = null
  ) => ({
    type: 'assistant',
    parent_tool_use_id: parentToolUseId,
    message: { role: 'assistant', content: [{ type: 'tool_use', ...block }] },
  });

  /**
   * A run that plans in lite mode and then implements inline — the default path,
   * and the one that used to report 0/N for its whole duration. The
   * [TASK_START] marker is deliberately split across two streamed chunks.
   */
  async function runLiteFeature(featureId: string): Promise<void> {
    await createTestFeature(testRepo.path, featureId, {
      id: featureId,
      category: 'test',
      description: 'Feature implemented inline after a lite plan',
      status: 'pending',
      requirePlanApproval: false,
      skipTests: true,
    });

    const mockProvider = {
      getName: () => 'claude',
      executeQuery: async function* () {
        yield { type: 'system', subtype: 'init', model: 'claude-sonnet-4-5-20250929' };
        yield assistantText('Reading the repo first.');
        yield assistantText(
          [
            'Small change, going straight in.',
            '',
            '```tasks',
            '- [ ] T001: Create the user model | File: src/models/user.ts',
            '```',
            '',
            '[PLAN_GENERATED] Planning outline complete.',
          ].join('\n')
        );
        // A marker straddling a chunk boundary must still fire exactly once.
        yield assistantText('\n[TASK_START] T0');
        yield assistantText('01: Create the user model\n');
        yield assistantTool({
          id: TASK_BLOCK_ID,
          name: 'Task',
          input: {
            subagent_type: 'code-reviewer',
            description: 'Review the model',
            prompt: 'Review src/models/user.ts',
            model: 'sonnet',
          },
        });
        // The child's own activity, attributed by parent_tool_use_id.
        yield assistantTool(
          { id: 'toolu_child_read', name: 'Read', input: { file_path: 'a.ts' } },
          TASK_BLOCK_ID
        );
        yield assistantText('Looks fine to me.', TASK_BLOCK_ID);
        // The tool_result is the ONLY completion signal a sub-agent has.
        yield {
          type: 'user',
          parent_tool_use_id: null,
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: TASK_BLOCK_ID,
                content: [{ type: 'text', text: 'No problems found.' }],
              },
            ],
          },
        };
        yield assistantText('\n[TASK_COMPLETE] T001: Added the model\n');
        yield assistantText('[PHASE_COMPLETE] Phase 1 complete\n');
        yield { type: 'result', subtype: 'success' };
      },
    };

    vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);
    await service.executeFeature(testRepo.path, featureId, false);
  }

  describe('lite-mode task progress', () => {
    it('reports the task the agent started, from the marker alone', async () => {
      await runLiteFeature('marker-feature');

      const started = emittedOfType('auto_mode_task_started');
      expect(started).toHaveLength(1);
      expect(started[0]).toMatchObject({
        featureId: 'marker-feature',
        projectPath: testRepo.path,
        taskId: 'T001',
        taskDescription: 'Create the user model',
        taskIndex: 0,
        tasksTotal: 1,
      });
    });

    it('fires a marker split across two chunks exactly once', async () => {
      await runLiteFeature('split-marker-feature');

      // The scan runs on a growing accumulator, so without a seen-set this
      // fires again for every text block that follows it.
      expect(emittedOfType('auto_mode_task_started')).toHaveLength(1);
      expect(emittedOfType('auto_mode_task_complete')).toHaveLength(1);
      expect(emittedOfType('auto_mode_phase_complete')).toHaveLength(1);
    });

    it('advances the completed count and the phase', async () => {
      await runLiteFeature('progress-feature');

      expect(emittedOfType('auto_mode_task_complete')[0]).toMatchObject({
        taskId: 'T001',
        tasksCompleted: 1,
        tasksTotal: 1,
      });
      expect(emittedOfType('auto_mode_phase_complete')[0]).toMatchObject({
        phase: 'Phase 1',
        phaseNumber: 1,
      });
    });

    it('persists per-task status and timestamps, which used to stay pending forever', async () => {
      await runLiteFeature('persist-feature');

      const feature = await featureLoader.get(testRepo.path, 'persist-feature');
      expect(feature?.planSpec?.tasksCompleted).toBe(1);
      const task = feature?.planSpec?.tasks?.[0];
      expect(task?.id).toBe('T001');
      expect(task?.status).toBe('completed');
      expect(task?.startedAt).toEqual(expect.any(String));
      expect(task?.completedAt).toEqual(expect.any(String));
    });
  });

  describe('agent tree', () => {
    it('announces the sub-agent before the tool event that describes it', async () => {
      await runLiteFeature('tree-feature');

      const emittedTypes = mockEvents.emit.mock.calls
        .map((call) => (call[1] as EmittedEvent | undefined)?.type)
        .filter((type) => type === 'auto_mode_subagent_started' || type === 'auto_mode_tool');

      // A client must never see an event carrying an agentId it has no node for.
      const spawnIndex = emittedTypes.indexOf('auto_mode_subagent_started');
      const taskToolIndex = mockEvents.emit.mock.calls.findIndex(
        (call) => (call[1] as EmittedEvent | undefined)?.toolUseId === TASK_BLOCK_ID
      );
      expect(spawnIndex).toBeGreaterThanOrEqual(0);
      expect(taskToolIndex).toBeGreaterThanOrEqual(0);

      const spawn = emittedOfType('auto_mode_subagent_started')[0];
      expect(spawn).toMatchObject({
        agentId: TASK_BLOCK_ID,
        parentAgentId: MASTER_AGENT_ID,
        depth: 1,
        name: 'code-reviewer',
        description: 'Review the model',
        model: 'sonnet',
      });
    });

    it('completes the sub-agent on its tool_result', async () => {
      await runLiteFeature('finish-feature');

      const finished = emittedOfType('auto_mode_subagent_finished');
      expect(finished).toHaveLength(1);
      expect(finished[0]).toMatchObject({
        agentId: TASK_BLOCK_ID,
        status: 'completed',
        result: 'No problems found.',
      });
      expect(finished[0].durationMs).toEqual(expect.any(Number));
    });

    it('attributes each event to the agent that produced it', async () => {
      await runLiteFeature('attribution-feature');

      const toolEvents = emittedOfType('auto_mode_tool');
      const taskCall = toolEvents.find((event) => event.tool === 'Task');
      const childCall = toolEvents.find((event) => event.tool === 'Read');

      // agentId must sit at the top level of the payload: the event throttler
      // keys its accumulation buffer off payload.agentId, and nested or renamed
      // it silently splices Master's prose into the sub-agent's.
      expect(taskCall).toMatchObject({ agentId: MASTER_AGENT_ID, agentName: 'Master' });
      expect(childCall).toMatchObject({ agentId: TASK_BLOCK_ID, agentName: 'code-reviewer' });
      expect(taskCall?.toolUseId).toBe(TASK_BLOCK_ID);

      const masterProse = emittedOfType('auto_mode_progress').find(
        (event) => event.content === 'Reading the repo first.'
      );
      expect(masterProse).toMatchObject({ agentId: MASTER_AGENT_ID, agentName: 'Master' });
    });

    /**
     * Not something this change introduced, and not something it fixes: the
     * main loop has always gated `auto_mode_progress` on `!specDetected`, so
     * once a lite plan is detected none of the implementation prose that
     * follows is streamed. It still reaches the transcript, which is why the
     * Agents pane reads the transcript rather than the event stream.
     */
    it('streams no progress events after a lite plan is detected — pre-existing', async () => {
      await runLiteFeature('post-plan-feature');

      const prose = emittedOfType('auto_mode_progress').map((event) => event.content);
      expect(prose).toContain('Reading the repo first.');
      expect(prose).not.toContain('Looks fine to me.');
    });

    it('writes the tree sidecar beside the transcript', async () => {
      await runLiteFeature('sidecar-feature');

      const tree = await featureLoader.getAgentTree(testRepo.path, 'sidecar-feature');
      expect(tree?.featureId).toBe('sidecar-feature');
      expect(tree?.order).toEqual([MASTER_AGENT_ID, TASK_BLOCK_ID]);
      expect(tree?.nodes[MASTER_AGENT_ID]).toMatchObject({
        status: 'completed',
        model: 'claude-sonnet-4-5-20250929',
      });
      expect(tree?.nodes[TASK_BLOCK_ID]).toMatchObject({
        status: 'completed',
        name: 'code-reviewer',
        parentId: MASTER_AGENT_ID,
      });
      expect(featureLoader.getAgentTreePath(testRepo.path, 'sidecar-feature')).toContain('logs');
    });

    it('rolls the tree up into the feature metrics so a finished task needs no sidecar read', async () => {
      await runLiteFeature('metrics-feature');

      const feature = await featureLoader.get(testRepo.path, 'metrics-feature');
      // finalize() has to run before the roll-up, or a sub-agent whose result
      // never arrived is recorded as still running.
      expect(feature?.executionMetrics?.subagents).toEqual([
        expect.objectContaining({
          agentId: TASK_BLOCK_ID,
          parentAgentId: MASTER_AGENT_ID,
          name: 'code-reviewer',
          status: 'completed',
        }),
      ]);
    });

    it('marks the change of author in the transcript', async () => {
      await runLiteFeature('transcript-feature');

      const output = await featureLoader.getAgentOutput(testRepo.path, 'transcript-feature');
      expect(output).toContain(`[agent:${TASK_BLOCK_ID}] ▶ code-reviewer`);
      // Back to master afterwards, or everything the master says next is read
      // as the sub-agent's.
      expect(output).toContain(`[agent:${MASTER_AGENT_ID}] ▶ Master`);
      // Enormous and already consumed by the tracker.
      expect(output).not.toContain('No problems found.');
    });

    it('drops the live tree once the run ends', async () => {
      await runLiteFeature('cleanup-feature');

      expect(service.getInMemoryAgentTree('cleanup-feature')).toBeNull();
    });
  });
});
