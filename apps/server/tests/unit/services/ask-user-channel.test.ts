import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Feature } from '@dmaker/types';

/**
 * The ask channel end to end, minus the CLI: the tool handler wired to a real
 * AgentQuestionService and a real AutoModeService, exactly as `runAgent` wires
 * it.
 *
 * The unit tests either side of this one prove the pieces. This proves the
 * seam, which is where the channel actually breaks: the tool registers its
 * waiter against a question id that only exists after the write, and the
 * answer arrives from a completely different call stack (an HTTP handler).
 * Nothing else in the suite exercises that hand-off.
 */

vi.mock('@/services/issue-draft-service.js', () => ({
  getIssueDraftService: () => ({ resumeAfterAnswer: () => true }),
}));

import { AgentQuestionService } from '@/services/agent-question-service.js';
import { AutoModeService } from '@/services/auto-mode-service.js';
import { createAskUserHandler } from '@/lib/ask-user-tool.js';

describe('the ask_user channel, end to end', () => {
  const projectPath = '/test/project';
  const featureId = 'feature-123';

  let stored: Feature | null;
  let events: { emit: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
  let featureLoader: { get: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let questions: AgentQuestionService;
  let autoMode: AutoModeService;

  /** The tool deps `runAgent` builds, against the real services. */
  function toolDeps() {
    return {
      ask: (asked: Parameters<AgentQuestionService['ask']>[3]) =>
        questions.ask(projectPath, featureId, 'implementation', asked),
      waitForAnswer: (questionId: string) =>
        autoMode.waitForQuestionAnswer(featureId, projectPath, questionId),
      expire: (ids: string[]) => questions.expire(projectPath, featureId, ids),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    stored = { id: featureId, category: 'ui', description: 'Add dark mode' } as Feature;

    events = { emit: vi.fn(), subscribe: vi.fn() };
    featureLoader = {
      get: vi.fn(async () => (stored ? structuredClone(stored) : null)),
      update: vi.fn(async (_p: string, _id: string, updates: Partial<Feature>) => {
        stored = { ...(stored as Feature), ...updates };
        return structuredClone(stored);
      }),
    };

    autoMode = new AutoModeService(events as never, undefined, featureLoader as never);
    questions = new AgentQuestionService(
      events as never,
      featureLoader as never,
      undefined,
      autoMode
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parks the agent, releases it on the answer, and hands back the chosen label', async () => {
    const handler = createAskUserHandler(toolDeps());

    const call = handler({
      questions: [
        {
          question: 'Which storage should the cache use?',
          header: 'Storage',
          options: [
            { label: 'In memory', description: 'Fast, lost on restart' },
            { label: 'SQLite', description: 'Survives a restart' },
          ],
        },
      ],
    });

    // The question must be on disk and the waiter registered before anything
    // could answer it - both are true by the time the write has flushed.
    await vi.waitFor(() => expect(stored?.agentQuestions?.length).toBe(1));
    const asked = stored!.agentQuestions![0];
    expect(asked.number).toBe(1);
    expect(asked.header).toBe('Storage');
    expect(asked.choices?.map((c) => c.label)).toEqual(['In memory', 'SQLite']);
    expect(autoMode.getPendingQuestionIds(featureId)).toEqual([asked.id]);

    const result = await questions.answer(projectPath, featureId, asked.id, {
      selectedOptionIds: [asked.choices![1].id],
    });
    expect(result.resumed).toBe(true);

    const returned = await call;
    expect(returned.isError).toBeUndefined();
    expect(returned.content[0].text).toContain('SQLite');
    // Derived server-side from the option ids, never taken from the request.
    expect(stored!.agentQuestions![0].answerSource).toBe('option');
    expect(autoMode.getPendingQuestionIds(featureId)).toEqual([]);
  });

  it('releases the agent when the user skips rather than decides', async () => {
    const handler = createAskUserHandler(toolDeps());
    const call = handler({ questions: [{ question: 'Rename the endpoint?' }] });

    await vi.waitFor(() => expect(stored?.agentQuestions?.length).toBe(1));
    const asked = stored!.agentQuestions![0];

    await questions.answer(projectPath, featureId, asked.id, { skipped: true });

    const returned = await call;
    expect(returned.content[0].text).toContain('the user skipped this');
    expect(returned.isError).toBeUndefined();
  });

  it('gives up after 30 minutes and stamps the question expired', async () => {
    // The ceiling is the whole reason this is safe to ship: an unbounded await
    // holds a worktree, a concurrency slot and a subprocess, and under
    // maxConcurrency it deadlocks the queue behind whoever went to lunch.
    vi.useFakeTimers();
    const handler = createAskUserHandler(toolDeps());
    const call = handler({ questions: [{ question: 'Which approach?' }] });

    await vi.waitFor(async () => {
      await Promise.resolve();
      expect(stored?.agentQuestions?.length).toBe(1);
    });
    const asked = stored!.agentQuestions![0];
    expect(autoMode.getPendingQuestionIds(featureId)).toEqual([asked.id]);

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 1000);

    const returned = await call;
    expect(returned.isError).toBe(true);
    expect(returned.content[0].text).toContain('timed out after 30 minutes');
    // Without the expiry stamp the question would sit "outstanding" on the
    // board for ever, on a task nobody is working on.
    expect(stored!.agentQuestions![0].expiredAt).toBeTruthy();
    expect(autoMode.getPendingQuestionIds(featureId)).toEqual([]);
  });

  it('answers a question this process never parked without releasing anything', async () => {
    // The dev half of the dev/prod pair answers questions the runner asked.
    // `resumed: false` is routine there, not a failure.
    await questions.ask(projectPath, featureId, 'implementation', [
      { question: 'Asked by another process?', choices: [] },
    ]);
    const asked = stored!.agentQuestions![0];

    const result = await questions.answer(projectPath, featureId, asked.id, { answer: 'yes' });

    expect(result.status).toBe('ok');
    expect(result.resumed).toBe(false);
  });
});
