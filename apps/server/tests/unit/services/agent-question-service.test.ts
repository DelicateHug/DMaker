import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentQuestion, Feature } from '@dmaker/types';

/**
 * The question lifecycle is shared by three producers now, so the things this
 * pins are the ones that only break when they disagree: numbers that are
 * unique per feature, choices that survive being written and read back, and an
 * `answerSource` the client cannot lie about.
 */

const mocks = vi.hoisted(() => ({
  resumeAfterAnswer: vi.fn<(...args: unknown[]) => boolean>(),
}));

// The service reaches the drafter through a dynamic import (a static one would
// make the two modules circular), which this still intercepts.
vi.mock('@/services/issue-draft-service.js', () => ({
  getIssueDraftService: () => ({ resumeAfterAnswer: mocks.resumeAfterAnswer }),
}));

import {
  AgentQuestionService,
  getAgentQuestionService,
  resetAgentQuestionService,
  questionChoices,
} from '@/services/agent-question-service.js';

describe('agent-question-service.ts', () => {
  const projectPath = '/test/project';
  const featureId = 'feature-123';

  let events: { emit: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
  let autoMode: { resolveQuestionAnswer: ReturnType<typeof vi.fn> };
  let stored: Feature | null;
  let featureLoader: { get: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let service: AgentQuestionService;

  const questionsOnDisk = (): AgentQuestion[] => stored?.agentQuestions ?? [];

  const emitted = (type: string): unknown[] =>
    events.emit.mock.calls.filter((call) => call[0] === type).map((call) => call[1]);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resumeAfterAnswer.mockReturnValue(true);

    stored = {
      id: featureId,
      category: 'ui',
      description: 'Add dark mode',
    } as Feature;

    events = { emit: vi.fn(), subscribe: vi.fn() };
    autoMode = { resolveQuestionAnswer: vi.fn().mockReturnValue(true) };
    featureLoader = {
      get: vi.fn(async () => (stored ? structuredClone(stored) : null)),
      update: vi.fn(async (_p: string, _id: string, updates: Partial<Feature>) => {
        stored = { ...(stored as Feature), ...updates };
        return structuredClone(stored);
      }),
    };

    service = new AgentQuestionService(
      events as never,
      featureLoader as never,
      undefined,
      autoMode as never
    );
  });

  describe('ask', () => {
    it('numbers questions from one and keeps going across calls', async () => {
      const first = await service.ask(projectPath, featureId, 'issue-draft', [{ question: 'A?' }]);
      const rest = await service.ask(projectPath, featureId, 'issue-draft', [
        { question: 'B?' },
        { question: 'C?' },
      ]);

      expect(first.map((q) => q.number)).toEqual([1]);
      expect(rest.map((q) => q.number)).toEqual([2, 3]);
    });

    it('never reuses a number after a question is answered or skipped', async () => {
      const [one] = await service.ask(projectPath, featureId, 'implementation', [
        { question: 'A?' },
      ]);
      const [two] = await service.ask(projectPath, featureId, 'implementation', [
        { question: 'B?' },
      ]);

      await service.answer(projectPath, featureId, one.id, { skipped: true });
      await service.answer(projectPath, featureId, two.id, { answer: 'yes' });

      const [three] = await service.ask(projectPath, featureId, 'implementation', [
        { question: 'C?' },
      ]);

      expect(three.number).toBe(3);
    });

    it('gives two concurrent asks two different numbers', async () => {
      // FeatureLoader.update is an unlocked read-modify-write: without the
      // per-feature critical section both of these read "0 questions so far"
      // and both write "Question 1".
      const [a, b] = await Promise.all([
        service.ask(projectPath, featureId, 'planning', [{ question: 'A?' }]),
        service.ask(projectPath, featureId, 'planning', [{ question: 'B?' }]),
      ]);

      expect(new Set([a[0].number, b[0].number]).size).toBe(2);
      expect(questionsOnDisk()).toHaveLength(2);
    });

    it('turns plain-string options into identified choices and keeps the strings', async () => {
      const [question] = await service.ask(projectPath, featureId, 'issue-draft', [
        { question: 'Which screen?', options: ['The board', 'Settings'] },
      ]);

      expect(question.choices).toEqual([
        { id: 'opt-1', label: 'The board' },
        { id: 'opt-2', label: 'Settings' },
      ]);
      // Written as well so the panel that still reads `options` keeps its chips.
      expect(question.options).toEqual(['The board', 'Settings']);
    });

    it('keeps descriptions and gives every choice a unique id', async () => {
      const [question] = await service.ask(projectPath, featureId, 'implementation', [
        {
          question: 'Which store?',
          choices: [
            { id: 'zustand', label: 'Zustand', description: 'What the app already uses' },
            { id: '  ', label: 'Redux' },
            { id: 'zustand', label: 'Context' },
          ],
        },
      ]);

      expect(question.choices?.map((c) => c.id)).toEqual(['zustand', 'opt-2', 'opt-3']);
      expect(question.choices?.[0].description).toBe('What the app already uses');
    });

    it('offers a free-text path unless the asker turns it off', async () => {
      const [withDefault] = await service.ask(projectPath, featureId, 'implementation', [
        { question: 'A?' },
      ]);
      const [locked] = await service.ask(projectPath, featureId, 'implementation', [
        { question: 'B?', allowCustomAnswer: false, multiSelect: true },
      ]);

      expect(withDefault.allowCustomAnswer).toBe(true);
      expect(withDefault.multiSelect).toBeUndefined();
      expect(locked.allowCustomAnswer).toBe(false);
      expect(locked.multiSelect).toBe(true);
    });

    it('announces every question it parked', async () => {
      await service.ask(projectPath, featureId, 'issue-draft', [
        { question: 'A?' },
        { question: '   ' },
        { question: 'B?' },
      ]);

      const asked = emitted('feature:question-asked');
      expect(asked).toHaveLength(2);
      expect(asked[0]).toMatchObject({ projectPath, featureId });
    });

    it('writes nothing when the feature is gone', async () => {
      stored = null;

      const asked = await service.ask(projectPath, featureId, 'issue-draft', [{ question: 'A?' }]);

      expect(asked).toEqual([]);
      expect(featureLoader.update).not.toHaveBeenCalled();
    });
  });

  describe('answer', () => {
    const askOne = async (
      source: AgentQuestion['source'],
      options = ['The board', 'Settings']
    ): Promise<AgentQuestion> => {
      const [question] = await service.ask(projectPath, featureId, source, [
        { question: 'Which screen?', options },
      ]);
      return question;
    };

    it('derives an option answer and its text from the ids that were picked', async () => {
      const question = await askOne('implementation');

      const result = await service.answer(projectPath, featureId, question.id, {
        selectedOptionIds: ['opt-2'],
      });

      expect(result.status).toBe('ok');
      expect(result.question).toMatchObject({
        answerSource: 'option',
        selectedOptionIds: ['opt-2'],
        answer: 'Settings',
      });
    });

    it('joins the labels when several options are picked', async () => {
      const question = await askOne('implementation');

      const result = await service.answer(projectPath, featureId, question.id, {
        selectedOptionIds: ['opt-1', 'opt-2'],
      });

      expect(result.question?.answer).toBe('The board, Settings');
    });

    it('records free text as custom and keeps no option ids', async () => {
      const question = await askOne('implementation');

      const result = await service.answer(projectPath, featureId, question.id, {
        answer: '  the dashboard  ',
      });

      expect(result.question?.answerSource).toBe('custom');
      expect(result.question?.answer).toBe('the dashboard');
      expect(result.question?.selectedOptionIds).toBeUndefined();
    });

    it('ignores the client when it names an answerSource of its own', async () => {
      const question = await askOne('implementation');

      const result = await service.answer(projectPath, featureId, question.id, {
        answer: 'typed instead',
        answerSource: 'option',
        selectedOptionIds: [],
      } as never);

      expect(result.question?.answerSource).toBe('custom');
    });

    it('drops option ids the question never offered', async () => {
      const question = await askOne('implementation');

      const result = await service.answer(projectPath, featureId, question.id, {
        selectedOptionIds: ['opt-9'],
        answer: 'something else',
      });

      expect(result.question?.answerSource).toBe('custom');
      expect(result.question?.selectedOptionIds).toBeUndefined();
    });

    it('refuses a submission of nothing but unknown option ids', async () => {
      const question = await askOne('implementation');

      const result = await service.answer(projectPath, featureId, question.id, {
        selectedOptionIds: ['opt-9'],
      });

      expect(result.status).toBe('empty-answer');
      expect(questionsOnDisk()[0].answeredAt).toBeUndefined();
    });

    it('records a skip as an empty answer rather than a missing one', async () => {
      const question = await askOne('implementation');

      const result = await service.answer(projectPath, featureId, question.id, {
        skipped: true,
        answer: 'ignored',
      });

      expect(result.question).toMatchObject({
        answerSource: 'skipped',
        answer: '',
        skipped: true,
      });
    });

    it('clears the skip when a skipped question is answered after all', async () => {
      const question = await askOne('implementation');
      await service.answer(projectPath, featureId, question.id, { skipped: true });

      const result = await service.answer(projectPath, featureId, question.id, {
        selectedOptionIds: ['opt-1'],
      });

      expect(result.question?.answerSource).toBe('option');
      expect(result.question?.skipped).toBeUndefined();
    });

    it('answers a legacy question that has only string options and no number', async () => {
      // Everything already on disk looks like this.
      stored = {
        ...(stored as Feature),
        agentQuestions: [
          {
            id: 'legacy-1',
            source: 'issue-draft',
            question: 'Which screen?',
            options: ['The board', 'Settings'],
            askedAt: '2026-08-25T00:00:00.000Z',
          },
        ],
      };

      const result = await service.answer(projectPath, featureId, 'legacy-1', {
        selectedOptionIds: ['opt-1'],
      });

      expect(result.status).toBe('ok');
      expect(result.question).toMatchObject({
        answerSource: 'option',
        answer: 'The board',
        selectedOptionIds: ['opt-1'],
      });
    });

    it('hands the answer to the agent parked on it', async () => {
      const question = await askOne('implementation');

      const result = await service.answer(projectPath, featureId, question.id, {
        answer: 'the dashboard',
      });

      expect(autoMode.resolveQuestionAnswer).toHaveBeenCalledWith(featureId, question.id, {
        answer: 'the dashboard',
        skipped: false,
      });
      expect(result.resumed).toBe(true);
      expect(mocks.resumeAfterAnswer).not.toHaveBeenCalled();
    });

    it('still records the answer when no agent was waiting', async () => {
      // The run ended, or the other half of the dev/prod pair asked it.
      autoMode.resolveQuestionAnswer.mockReturnValue(false);
      const question = await askOne('planning');

      const result = await service.answer(projectPath, featureId, question.id, { answer: 'yes' });

      expect(result.status).toBe('ok');
      expect(result.resumed).toBe(false);
      expect(questionsOnDisk()[0].answer).toBe('yes');
    });

    it('resumes the drafter instead of the agent tree for an issue-draft question', async () => {
      const question = await askOne('issue-draft');

      const result = await service.answer(projectPath, featureId, question.id, {
        selectedOptionIds: ['opt-1'],
      });

      expect(autoMode.resolveQuestionAnswer).not.toHaveBeenCalled();
      expect(result.resumed).toBe(true);
      const [, , questions] = mocks.resumeAfterAnswer.mock.calls[0] as [
        string,
        string,
        AgentQuestion[],
      ];
      // The drafter's rule reads the list as it now stands, not as it was.
      expect(questions[0].answeredAt).toBeTruthy();
    });

    it('announces the answer with what was actually recorded', async () => {
      const question = await askOne('implementation');

      await service.answer(projectPath, featureId, question.id, { selectedOptionIds: ['opt-1'] });

      expect(emitted('feature:question-answered')[0]).toMatchObject({
        projectPath,
        featureId,
        questionId: question.id,
        answer: 'The board',
        answerSource: 'option',
        selectedOptionIds: ['opt-1'],
        skipped: false,
      });
    });

    it('reports a missing feature and a missing question differently', async () => {
      const present = await service.answer(projectPath, featureId, 'nope', { answer: 'x' });
      expect(present.status).toBe('question-not-found');
      expect(present.feature?.id).toBe(featureId);
      expect(featureLoader.update).not.toHaveBeenCalled();

      stored = null;
      const gone = await service.answer(projectPath, featureId, 'nope', { answer: 'x' });
      expect(gone.status).toBe('feature-not-found');
      expect(gone.feature).toBeNull();
    });

    it('keeps both answers when two questions are answered at once', async () => {
      const [a, b] = await service.ask(projectPath, featureId, 'implementation', [
        { question: 'A?' },
        { question: 'B?' },
      ]);

      await Promise.all([
        service.answer(projectPath, featureId, a.id, { answer: 'first' }),
        service.answer(projectPath, featureId, b.id, { answer: 'second' }),
      ]);

      expect(questionsOnDisk().map((q) => q.answer)).toEqual(['first', 'second']);
    });
  });

  describe('expire', () => {
    it('stamps only the questions nobody can act on any more', async () => {
      const [a, b] = await service.ask(projectPath, featureId, 'implementation', [
        { question: 'A?' },
        { question: 'B?' },
      ]);
      await service.answer(projectPath, featureId, a.id, { answer: 'done' });

      const count = await service.expire(projectPath, featureId, [a.id, b.id]);

      expect(count).toBe(1);
      expect(questionsOnDisk().find((q) => q.id === a.id)?.expiredAt).toBeUndefined();
      expect(questionsOnDisk().find((q) => q.id === b.id)?.expiredAt).toBeTruthy();
      expect(emitted('feature:question-expired')[0]).toMatchObject({ featureId, count: 1 });
    });

    it('says nothing when there was nothing to expire', async () => {
      const count = await service.expire(projectPath, featureId, ['nope']);

      expect(count).toBe(0);
      expect(emitted('feature:question-expired')).toHaveLength(0);
    });
  });

  describe('questionChoices', () => {
    it('gives a legacy string question the same ids ask() would have', () => {
      const legacy = { options: ['One', 'Two'] } as AgentQuestion;

      expect(questionChoices(legacy)).toEqual([
        { id: 'opt-1', label: 'One' },
        { id: 'opt-2', label: 'Two' },
      ]);
    });

    it('prefers recorded choices over the legacy strings', () => {
      const both = {
        options: ['One'],
        choices: [{ id: 'a', label: 'Alpha' }],
      } as AgentQuestion;

      expect(questionChoices(both)).toEqual([{ id: 'a', label: 'Alpha' }]);
    });
  });

  describe('getAgentQuestionService', () => {
    beforeEach(() => resetAgentQuestionService());

    it('fills in a dependency the first caller did not have', async () => {
      // The route and the runner reach the singleton in either order, and only
      // one of them holds the AutoModeService a blocked agent is waiting on.
      const first = getAgentQuestionService(events as never, featureLoader as never);
      const second = getAgentQuestionService(
        events as never,
        featureLoader as never,
        undefined,
        autoMode as never
      );

      expect(second).toBe(first);

      const [question] = await first.ask(projectPath, featureId, 'implementation', [
        { question: 'A?' },
      ]);
      await first.answer(projectPath, featureId, question.id, { answer: 'yes' });

      expect(autoMode.resolveQuestionAnswer).toHaveBeenCalled();
    });

    it('refuses to be built without the things it writes through', () => {
      expect(() => getAgentQuestionService()).toThrow(/events and a feature loader/);
    });
  });
});
