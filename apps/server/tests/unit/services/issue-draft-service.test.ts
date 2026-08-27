import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueDraftService } from '@/services/issue-draft-service.js';
import type { AgentQuestion, Feature } from '@dmaker/types';

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

  /**
   * Recording an answer belongs to AgentQuestionService now; what is still the
   * drafter's own is deciding when it may carry on. It restarts rather than
   * resumes, so a restart with one of its questions still open re-asks with
   * half the picture.
   */
  describe('resumeAfterAnswer', () => {
    const question = (overrides: Partial<AgentQuestion>): AgentQuestion => ({
      id: 'q1',
      source: 'issue-draft',
      question: 'Which screen?',
      askedAt: '2026-08-25T00:00:00.000Z',
      ...overrides,
    });

    let started: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      started = vi.fn();
      vi.spyOn(service, 'start').mockImplementation(started);
    });

    it('restarts drafting once nothing of its own is outstanding', () => {
      const resumed = service.resumeAfterAnswer(projectPath, featureId, [
        question({ answer: 'The board', answeredAt: '2026-08-25T00:01:00.000Z' }),
      ]);

      expect(resumed).toBe(true);
      expect(started).toHaveBeenCalledWith(projectPath, featureId);
    });

    it('waits while another of its own questions is still unanswered', () => {
      const resumed = service.resumeAfterAnswer(projectPath, featureId, [
        question({ answer: 'The board', answeredAt: '2026-08-25T00:01:00.000Z' }),
        question({ id: 'q2' }),
      ]);

      expect(resumed).toBe(false);
      expect(started).not.toHaveBeenCalled();
    });

    it('counts a skipped question as no longer outstanding', () => {
      const resumed = service.resumeAfterAnswer(projectPath, featureId, [
        question({ answer: '', answeredAt: '2026-08-25T00:01:00.000Z', skipped: true }),
      ]);

      expect(resumed).toBe(true);
    });

    it('is not held up by a question whose run ended without an answer', () => {
      // Nobody can answer an expired question, so leaving it counted would
      // wedge the draft for good.
      const resumed = service.resumeAfterAnswer(projectPath, featureId, [
        question({ answer: 'The board', answeredAt: '2026-08-25T00:01:00.000Z' }),
        question({ id: 'q2', expiredAt: '2026-08-25T00:02:00.000Z' }),
      ]);

      expect(resumed).toBe(true);
    });

    it('ignores outstanding questions belonging to another agent', () => {
      const resumed = service.resumeAfterAnswer(projectPath, featureId, [
        question({ answer: 'The board', answeredAt: '2026-08-25T00:01:00.000Z' }),
        question({ id: 'q2', source: 'implementation' }),
      ]);

      expect(resumed).toBe(true);
    });
  });
});
