import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueDraftService } from '@/services/issue-draft-service.js';
import type { Feature } from '@dmaker/types';

/**
 * The commit gate is the part of issue drafting that can wedge real work, so
 * these tests pin its exits: it must let a commit through whenever waiting
 * could not possibly help, and hold it only while an issue is genuinely on its
 * way.
 */
describe('issue-draft-service.ts', () => {
  const projectPath = '/test/project';
  const featureId = 'feature-123';

  let events: { emit: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
  let featureLoader: { get: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let service: IssueDraftService;

  const feature = (overrides: Partial<Feature>): Feature =>
    ({
      id: featureId,
      category: 'ui',
      description: 'Add dark mode',
      ...overrides,
    }) as Feature;

  beforeEach(() => {
    vi.clearAllMocks();
    events = { emit: vi.fn(), subscribe: vi.fn() };
    featureLoader = { get: vi.fn(), update: vi.fn() };
    service = new IssueDraftService(events as never, featureLoader as never);
  });

  describe('waitForIssue', () => {
    it('resolves ready with the issue number once one is linked', async () => {
      featureLoader.get.mockResolvedValue(
        feature({
          githubIssue: {
            number: 42,
            url: 'https://github.com/o/r/issues/42',
            assignees: [],
            labels: [],
            state: 'open',
          },
        })
      );

      const result = await service.waitForIssue(projectPath, featureId, 1000);

      expect(result).toEqual({ ready: true, status: 'created', issueNumber: 42 });
    });

    it('resolves ready when no draft job was ever started', async () => {
      // A project that does not file issues must never have its commits held.
      featureLoader.get.mockResolvedValue(feature({}));

      const result = await service.waitForIssue(projectPath, featureId, 1000);

      expect(result.ready).toBe(true);
      expect(result.status).toBe('none');
    });

    it('resolves ready when the draft was skipped', async () => {
      featureLoader.get.mockResolvedValue(
        feature({
          githubIssueDraft: {
            status: 'skipped',
            skipReason: 'This project has no GitHub repository behind it',
          },
        })
      );

      const result = await service.waitForIssue(projectPath, featureId, 1000);

      expect(result.ready).toBe(true);
      expect(result.reason).toContain('no GitHub repository');
    });

    it('resolves ready when the feature has been removed', async () => {
      featureLoader.get.mockResolvedValue(null);

      const result = await service.waitForIssue(projectPath, featureId, 1000);

      expect(result.ready).toBe(true);
    });

    it('blocks when the draft failed', async () => {
      featureLoader.get.mockResolvedValue(
        feature({ githubIssueDraft: { status: 'failed', error: 'gh not authenticated' } })
      );

      const result = await service.waitForIssue(projectPath, featureId, 1000);

      expect(result.ready).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.reason).toBe('gh not authenticated');
    });

    it('blocks with the outstanding question when clarification is pending', async () => {
      featureLoader.get.mockResolvedValue(
        feature({
          githubIssueDraft: { status: 'awaiting_clarification' },
          agentQuestions: [
            {
              id: 'q1',
              source: 'issue-draft',
              question: 'Which screen is "the thing"?',
              askedAt: '2026-08-25T00:00:00.000Z',
            },
          ],
        })
      );

      const result = await service.waitForIssue(projectPath, featureId, 1000);

      expect(result.ready).toBe(false);
      expect(result.status).toBe('awaiting_clarification');
      expect(result.reason).toContain('Which screen');
    });

    it('times out rather than waiting forever on a stuck draft', async () => {
      featureLoader.get.mockResolvedValue(feature({ githubIssueDraft: { status: 'drafting' } }));

      const result = await service.waitForIssue(projectPath, featureId, 0);

      expect(result.ready).toBe(false);
      expect(result.status).toBe('timeout');
    });

    it('lets the commit through as soon as the issue lands mid-wait', async () => {
      featureLoader.get
        .mockResolvedValueOnce(feature({ githubIssueDraft: { status: 'drafting' } }))
        .mockResolvedValue(
          feature({
            githubIssueDraft: { status: 'created' },
            githubIssue: {
              number: 7,
              url: '',
              assignees: [],
              labels: [],
              state: 'open',
            },
          })
        );

      const result = await service.waitForIssue(projectPath, featureId, 10_000);

      expect(result).toEqual({ ready: true, status: 'created', issueNumber: 7 });
      expect(featureLoader.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('answerQuestion', () => {
    it('records the answer and stamps when it was given', async () => {
      const stored = feature({
        githubIssueDraft: { status: 'awaiting_clarification' },
        agentQuestions: [
          {
            id: 'q1',
            source: 'issue-draft',
            question: 'Which screen?',
            askedAt: '2026-08-25T00:00:00.000Z',
          },
        ],
      });
      featureLoader.get.mockResolvedValue(stored);
      featureLoader.update.mockImplementation(
        async (_p: string, _id: string, updates: Partial<Feature>) => ({ ...stored, ...updates })
      );

      const result = await service.answerQuestion(projectPath, featureId, 'q1', 'The board');

      const answered = result?.agentQuestions?.[0];
      expect(answered?.answer).toBe('The board');
      expect(answered?.answeredAt).toBeTruthy();
      expect(events.emit).toHaveBeenCalledWith(
        'feature:question-answered',
        expect.objectContaining({ featureId, questionId: 'q1', answer: 'The board' })
      );
    });

    it('leaves the feature alone when the question is unknown', async () => {
      featureLoader.get.mockResolvedValue(feature({ agentQuestions: [] }));

      const result = await service.answerQuestion(projectPath, featureId, 'nope', 'x');

      expect(result?.id).toBe(featureId);
      expect(featureLoader.update).not.toHaveBeenCalled();
    });

    it('returns null when the feature is gone', async () => {
      featureLoader.get.mockResolvedValue(null);

      const result = await service.answerQuestion(projectPath, featureId, 'q1', 'x');

      expect(result).toBeNull();
    });
  });
});
