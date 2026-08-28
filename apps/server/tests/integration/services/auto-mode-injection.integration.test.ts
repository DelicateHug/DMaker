import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoModeService } from '@/services/auto-mode-service.js';
import { ProviderFactory } from '@/providers/provider-factory.js';
import { FeatureLoader } from '@/services/feature-loader.js';
import type { AgentInputChannel } from '@/lib/agent-input-channel.js';
import type { AgentInputMessage, ExecuteOptions } from '@dmaker/types';
import { createTestGitRepo, createTestFeature, type TestRepo } from '../helpers/git-test-repo.js';

vi.mock('@/providers/provider-factory.js');

// Same reason as the other auto-mode integration suites: ownership is settled
// by shelling out to `gh`, which this suite has no business depending on.
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

/**
 * THE LEAK GUARD.
 *
 * Passing the SDK a generator prompt removes its own "close stdin on the first
 * result" rule, so an input channel that never completes holds an ~11MB CLI
 * child process open with nothing reading its output — once per run, forever.
 *
 * Every case here asserts the same thing the operating system would: the
 * consumer that stands in for the SDK's stdin writer actually FINISHED. A flag
 * on the channel would only prove we set a boolean; a completed consumer is
 * what closes the pipe.
 */
describe('auto-mode-service.ts — mid-flight input channel lifetime', () => {
  let service: AutoModeService;
  let featureLoader: FeatureLoader;
  let testRepo: TestRepo;
  const mockEvents = { subscribe: vi.fn(), emit: vi.fn() };

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

  const assistantText = (text: string) => ({
    type: 'assistant',
    parent_tool_use_id: null,
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  });

  const successResult = () => ({
    type: 'result',
    subtype: 'success' as const,
    session_id: 'session-under-test',
  });

  /** A promise plus its resolver, for stepping through a run in flight. */
  function gate() {
    let open!: () => void;
    const reached = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { reached, open };
  }

  /**
   * Stand in for the SDK's stdin writer: consume the channel to completion and
   * record when that completion happens.
   */
  function drain(iterable: AsyncIterable<AgentInputMessage>) {
    const received: AgentInputMessage[] = [];
    let finished = false;
    const done = (async () => {
      for await (const message of iterable) received.push(message);
      finished = true;
    })();
    return { received, done, isFinished: () => finished };
  }

  /** True only if the consumer completed within a beat of the run ending. */
  async function completedPromptly(done: Promise<void>): Promise<boolean> {
    const pending = Symbol('pending');
    const outcome = await Promise.race([
      done.then(() => 'done'),
      new Promise((resolve) => setTimeout(() => resolve(pending), 50)),
    ]);
    return outcome === 'done';
  }

  interface Harness {
    /** Options the run handed the provider, first call only. */
    options: ExecuteOptions | null;
    channel: AgentInputChannel | null;
    consumer: ReturnType<typeof drain> | null;
  }

  /**
   * Register a provider whose first `executeQuery` runs `script`, and whose
   * later calls (nested runs, pipeline steps) end immediately.
   */
  function installProvider(
    harness: Harness,
    name: string,
    script: (harness: Harness) => AsyncGenerator<unknown>
  ) {
    let calls = 0;
    const mockProvider = {
      getName: () => name,
      executeQuery: async function* (options: ExecuteOptions) {
        calls++;
        if (calls > 1) {
          yield successResult();
          return;
        }
        harness.options = options;
        if (options.followUpInput) {
          harness.channel = options.followUpInput as AgentInputChannel;
          harness.consumer = drain(options.followUpInput);
        }
        yield* script(harness);
      },
    };
    vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);
  }

  async function seedFeature(featureId: string): Promise<void> {
    await createTestFeature(testRepo.path, featureId, {
      id: featureId,
      category: 'test',
      description: 'A feature used to test the input channel lifetime',
      status: 'pending',
      requirePlanApproval: false,
      skipTests: true,
    });
  }

  it('opens a channel for a Claude run and closes it on the result', async () => {
    const state = { closedAtResult: null as boolean | null };
    const harness: Harness = { options: null, channel: null, consumer: null };
    installProvider(harness, 'claude', async function* () {
      yield assistantText('Doing the work.');
      yield successResult();
      // Resumed only after the run has handled that result and before its
      // `finally` runs, so this pins the RESULT HANDLER as the closer rather
      // than letting the teardown cover for it.
      state.closedAtResult = harness.channel?.isClosed ?? null;
    });

    await seedFeature('normal-completion');
    await service.executeFeature(testRepo.path, 'normal-completion', false);

    expect(harness.options?.followUpInput).toBeDefined();
    expect(state.closedAtResult).toBe(true);
    expect(harness.channel?.isClosed).toBe(true);
    // The consumer finishing is the process actually being allowed to exit.
    expect(await completedPromptly(harness.consumer!.done)).toBe(true);
    expect(harness.consumer!.isFinished()).toBe(true);
  });

  it('closes the channel from the finally when the run throws', async () => {
    // Nothing else can close it on this path: the stream never reaches a
    // result. This is the case that leaks a process if the `finally` is wrong.
    const harness: Harness = { options: null, channel: null, consumer: null };
    installProvider(harness, 'claude', async function* () {
      yield assistantText('About to fall over.');
      throw new Error('the model exploded');
    });

    await seedFeature('failing-run');
    await service.executeFeature(testRepo.path, 'failing-run', false).catch(() => {
      // The run's failure is not what this test is about.
    });

    expect(harness.channel?.isClosed).toBe(true);
    expect(await completedPromptly(harness.consumer!.done)).toBe(true);
  });

  it('closes the channel when the run is stopped mid-stream', async () => {
    const streaming = gate();
    const harness: Harness = { options: null, channel: null, consumer: null };
    installProvider(harness, 'claude', async function* () {
      yield assistantText('Working away.');
      streaming.open();
      // Long enough that the stop below lands while this run is in flight.
      await new Promise((resolve) => setTimeout(resolve, 200));
      yield assistantText('Should not get this far.');
      yield successResult();
    });

    await seedFeature('stopped-run');
    const run = service.executeFeature(testRepo.path, 'stopped-run', false).catch(() => {});
    await streaming.reached;

    expect(await service.stopFeature('stopped-run')).toBe(true);
    // Closed by stopFeature, and the run's own finally is idempotent behind it.
    expect(harness.channel?.isClosed).toBe(true);
    expect(await completedPromptly(harness.consumer!.done)).toBe(true);

    await run;
  });

  it('delivers an injected message as a second turn and only then closes', async () => {
    const streaming = gate();
    const injected = gate();
    const state = { closedAfterFirstResult: null as boolean | null };
    const harness: Harness = { options: null, channel: null, consumer: null };

    installProvider(harness, 'claude', async function* () {
      yield assistantText('First turn.');
      streaming.open();
      await injected.reached;

      yield successResult();
      // Control comes back here only after the run has handled that result, so
      // this is the state of the channel at the moment it decided.
      state.closedAfterFirstResult = harness.channel?.isClosed ?? null;

      yield assistantText('Second turn, doing what you asked.');
      yield successResult();
    });

    await seedFeature('steered-run');
    const run = service.executeFeature(testRepo.path, 'steered-run', false).catch(() => {});
    await streaming.reached;

    const result = await service.injectMessage('steered-run', 'also update the README');
    expect(result).toEqual({ status: 'delivered', interrupted: false });

    // Wait for the SDK stand-in to actually take it, then let the run continue.
    await vi.waitFor(() => expect(harness.consumer!.received).toHaveLength(1));
    injected.open();
    await run;

    expect(harness.consumer!.received[0]).toEqual({ content: 'also update the README' });
    // The turn accounting: result #1 belongs to the initial prompt, and the
    // injected turn was still owed one. Closing here would have killed the
    // process before the message ever ran.
    expect(state.closedAfterFirstResult).toBe(false);
    expect(harness.channel?.isClosed).toBe(true);
    expect(await completedPromptly(harness.consumer!.done)).toBe(true);

    // The message is echoed into the transcript, so the run's own record shows
    // what it was told and when.
    const transcript = await featureLoader.getAgentOutput(testRepo.path, 'steered-run');
    expect(transcript).toContain('Message from you');
    expect(transcript).toContain('also update the README');
  });

  it('refuses to steer a run once its session has settled', async () => {
    const harness: Harness = { options: null, channel: null, consumer: null };
    installProvider(harness, 'claude', async function* () {
      yield assistantText('Done already.');
      yield successResult();
    });

    await seedFeature('settled-run');
    await service.executeFeature(testRepo.path, 'settled-run', false);

    // The run is over and the entry is gone, so this is the honest answer.
    expect(await service.injectMessage('settled-run', 'too late')).toEqual({
      status: 'not_running',
      interrupted: false,
    });
  });

  it('opens no channel for another provider, and says so', async () => {
    // Codex/Cursor/OpenCode have no equivalent mechanism. The run must keep the
    // plain prompt, and an injection must degrade to a follow-up rather than
    // silently doing nothing.
    const streaming = gate();
    const harness: Harness = { options: null, channel: null, consumer: null };
    installProvider(harness, 'codex', async function* () {
      yield assistantText('Working away.');
      streaming.open();
      await new Promise((resolve) => setTimeout(resolve, 100));
      yield successResult();
    });

    await seedFeature('codex-run');
    const run = service.executeFeature(testRepo.path, 'codex-run', false).catch(() => {});
    await streaming.reached;

    expect(harness.options?.followUpInput).toBeUndefined();
    expect(harness.options?.onSessionControl).toBeUndefined();
    expect(await service.injectMessage('codex-run', 'hello')).toEqual({
      status: 'unsupported_provider',
      interrupted: false,
    });

    await run;
  });

  it('opens no channel when the kill switch is set', async () => {
    const original = process.env.DMAKER_DISABLE_MESSAGE_INJECTION;
    process.env.DMAKER_DISABLE_MESSAGE_INJECTION = 'true';
    try {
      const harness: Harness = { options: null, channel: null, consumer: null };
      installProvider(harness, 'claude', async function* () {
        yield assistantText('Working away.');
        yield successResult();
      });

      await seedFeature('kill-switch-run');
      await service.executeFeature(testRepo.path, 'kill-switch-run', false);

      // Back to the plain string prompt, where the SDK closes stdin itself.
      expect(harness.options?.followUpInput).toBeUndefined();
    } finally {
      if (original === undefined) delete process.env.DMAKER_DISABLE_MESSAGE_INJECTION;
      else process.env.DMAKER_DISABLE_MESSAGE_INJECTION = original;
    }
  });
});
