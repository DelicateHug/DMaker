/**
 * IssueDraftService - Files a GitHub issue for a newly added task, in the background.
 *
 * Adding a task no longer blocks on GitHub. The task is free to start, plan and
 * create its branch while this runs; only the commit waits (see
 * `AutoModeService.commitFeature`), so nothing lands on a branch that has no
 * issue behind it.
 *
 * The issue body is written by Haiku — short and readable, not a spec. When the
 * task note is too thin to describe what "done" looks like, the drafter parks a
 * question on the feature instead of inventing requirements; the task view
 * surfaces it and `resumeAfterAnswer()` resumes the draft.
 *
 * The question itself belongs to AgentQuestionService — numbering, choices and
 * the answer shape are shared with the planning and implementation agents. What
 * stays here is drafter policy: how many questions, how many rounds, and when
 * it is safe to carry on.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@dmaker/utils';
import { getExtendedPath } from '@dmaker/platform';
import { CLAUDE_MODEL_MAP } from '@dmaker/model-resolver';
import type {
  AgentQuestion,
  Feature,
  GitHubIssueDraft,
  GitHubIssueDraftStatus,
} from '@dmaker/types';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';
import { getGitHubSyncService } from './github-sync-service.js';
import { simpleQuery } from '../providers/simple-query-service.js';
import { extractJson } from '../lib/json-extractor.js';
import { getPromptCustomization } from '../lib/settings-helpers.js';
import { getAgentQuestionService, type AskQuestionChoice } from './agent-question-service.js';

const execFileAsync = promisify(execFile);
const logger = createLogger('IssueDraft');

const execEnv = { ...process.env, PATH: getExtendedPath() };

/** Label applied to new issues so the board can map them back to a column. */
const BACKLOG_LABEL = 'label-backlog';

/**
 * How many times the drafter may stop and ask before it must write the issue
 * from what it has. One round is plenty — the point is to unblock a hopeless
 * note, not to interview the user.
 */
const MAX_CLARIFICATION_ROUNDS = 1;

/** Ceiling on how long a commit will wait for the issue to exist. */
const DEFAULT_WAIT_TIMEOUT_MS = 120_000;

/** How often `waitForIssue` re-reads the feature while waiting. */
const WAIT_POLL_INTERVAL_MS = 1_500;

/** Guard against a hung provider call leaving a task stuck in 'drafting'. */
const DRAFT_QUERY_TIMEOUT_MS = 60_000;

const ISSUE_DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    needsClarification: {
      type: 'boolean',
      description: 'True only when the task note is too vague to write an issue from',
    },
    questions: {
      type: 'array',
      description: 'Questions to ask the user. Empty unless needsClarification is true.',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          header: {
            type: 'string',
            description: 'Two or three word label for the question, e.g. "Scope"',
          },
          options: {
            type: 'array',
            description:
              'Optional suggested answers the user can pick from. The user is always offered a free-text path as well, so never include an "Other" option.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'The choice itself, 1-5 words' },
                description: {
                  type: 'string',
                  description: 'What picking this option would mean for the issue',
                },
              },
              required: ['label'],
              additionalProperties: false,
            },
          },
        },
        required: ['question'],
        additionalProperties: false,
      },
    },
    title: {
      type: 'string',
      description: 'Issue title. Required unless needsClarification is true.',
    },
    body: {
      type: 'string',
      description: 'Issue body in markdown. Required unless needsClarification is true.',
    },
  },
  required: ['needsClarification'],
  additionalProperties: false,
} as const;

interface IssueDraftQuestion {
  question: string;
  header?: string;
  /**
   * Objects since the schema widened. Plain strings are still accepted because
   * the `extractJson` fallback is not schema-enforced, so a model that ignored
   * the schema must not cost the user their clarification round.
   */
  options?: Array<string | { label?: string; description?: string }>;
}

interface IssueDraftResult {
  needsClarification?: boolean;
  questions?: IssueDraftQuestion[];
  title?: string;
  body?: string;
}

/** Flatten either option shape into what AgentQuestionService takes. */
function toChoices(options: IssueDraftQuestion['options']): AskQuestionChoice[] {
  return (options || [])
    .map((option) =>
      typeof option === 'string'
        ? { label: option }
        : { label: option?.label ?? '', description: option?.description }
    )
    .filter((option) => option.label.trim().length > 0);
}

export interface WaitForIssueResult {
  /** True when an issue number exists for the feature */
  ready: boolean;
  issueNumber?: number;
  /** Terminal state reached, or 'timeout' when the wait ran out */
  status: GitHubIssueDraftStatus | 'timeout' | 'none';
  /** Human-readable explanation when `ready` is false */
  reason?: string;
}

export class IssueDraftService {
  private events: EventEmitter;
  private featureLoader: FeatureLoader;
  private settingsService?: SettingsService;

  /** Featured currently being drafted, so a double-start is a no-op. */
  private inFlight = new Set<string>();

  constructor(
    events: EventEmitter,
    featureLoader: FeatureLoader,
    settingsService?: SettingsService
  ) {
    this.events = events;
    this.featureLoader = featureLoader;
    this.settingsService = settingsService;
  }

  /**
   * Kick off issue drafting and return immediately.
   *
   * Errors are recorded on the feature rather than thrown — the caller is a
   * fire-and-forget "task was added" path and must not fail because GitHub is
   * unreachable.
   */
  start(projectPath: string, featureId: string): void {
    void this.run(projectPath, featureId).catch((err) => {
      logger.error(`Issue draft for ${featureId} crashed:`, err);
    });
  }

  /**
   * Carry on drafting now that one of the drafter's questions has been
   * answered. AgentQuestionService owns recording the answer; what is drafter
   * policy is *when* it is safe to continue.
   *
   * The drafter is restarted rather than resumed — it has no live session to
   * hand an answer to — so restarting while another of its own questions is
   * still outstanding would re-ask with half the picture.
   *
   * @param questions The feature's questions as they now stand on disk.
   * @returns Whether drafting was actually restarted.
   */
  resumeAfterAnswer(projectPath: string, featureId: string, questions: AgentQuestion[]): boolean {
    const stillWaiting = questions.some(
      (q) => q.source === 'issue-draft' && !q.answeredAt && !q.skipped && !q.expiredAt
    );
    if (stillWaiting) return false;

    this.start(projectPath, featureId);
    return true;
  }

  /**
   * Block until the feature has a GitHub issue number, or until the draft
   * reaches a state where waiting is pointless.
   *
   * This is the commit gate. A task with no draft job at all (issue drafting
   * disabled, or a project with no GitHub remote) resolves immediately as
   * ready — the gate must never wedge a commit that was never going to have an
   * issue behind it.
   */
  async waitForIssue(
    projectPath: string,
    featureId: string,
    timeoutMs = DEFAULT_WAIT_TIMEOUT_MS
  ): Promise<WaitForIssueResult> {
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const feature = await this.featureLoader.get(projectPath, featureId);

      if (!feature) {
        return { ready: true, status: 'none', reason: 'Feature no longer exists' };
      }

      const issueNumber = feature.githubIssue?.number;
      if (issueNumber) {
        return { ready: true, status: 'created', issueNumber };
      }

      const draft = feature.githubIssueDraft;

      // No draft job was ever started for this task — nothing to wait for.
      if (!draft) {
        return { ready: true, status: 'none' };
      }

      if (draft.status === 'skipped') {
        return { ready: true, status: 'skipped', reason: draft.skipReason };
      }

      if (draft.status === 'failed') {
        return { ready: false, status: 'failed', reason: draft.error };
      }

      if (draft.status === 'awaiting_clarification') {
        const pending = (feature.agentQuestions || []).find(
          (q) => q.source === 'issue-draft' && !q.answeredAt && !q.skipped
        );
        return {
          ready: false,
          status: 'awaiting_clarification',
          reason: pending
            ? `Waiting on your answer: ${pending.question}`
            : 'Waiting on clarification',
        };
      }

      if (Date.now() >= deadline) {
        return {
          ready: false,
          status: 'timeout',
          reason: `GitHub issue was not created within ${Math.round(timeoutMs / 1000)}s`,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_INTERVAL_MS));
    }
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private async run(projectPath: string, featureId: string): Promise<void> {
    if (this.inFlight.has(featureId)) {
      logger.debug(`Issue draft already running for ${featureId}`);
      return;
    }
    this.inFlight.add(featureId);

    try {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) {
        logger.warn(`Cannot draft issue: feature ${featureId} not found`);
        return;
      }

      // Already linked — nothing to do.
      if (feature.githubIssue?.number) {
        await this.setDraft(projectPath, featureId, {
          status: 'created',
          finishedAt: new Date().toISOString(),
        });
        return;
      }

      if (!(await this.hasGitHubRemote(projectPath))) {
        await this.setDraft(projectPath, featureId, {
          status: 'skipped',
          skipReason: 'This project has no GitHub repository behind it',
          finishedAt: new Date().toISOString(),
        });
        return;
      }

      await this.setDraft(projectPath, featureId, {
        status: 'drafting',
        startedAt: feature.githubIssueDraft?.startedAt || new Date().toISOString(),
      });

      const draft = await this.draftIssue(projectPath, feature);

      const rounds = feature.githubIssueDraft?.clarificationRounds ?? 0;
      const wantsClarification =
        draft.needsClarification &&
        (draft.questions?.length ?? 0) > 0 &&
        rounds < MAX_CLARIFICATION_ROUNDS;

      if (wantsClarification) {
        await this.askQuestions(projectPath, featureId, draft.questions || [], rounds + 1);
        return;
      }

      await this.createIssue(projectPath, feature, draft);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Issue draft failed for ${featureId}:`, error);
      await this.setDraft(projectPath, featureId, {
        status: 'failed',
        error: message,
        finishedAt: new Date().toISOString(),
      });
    } finally {
      this.inFlight.delete(featureId);
    }
  }

  /**
   * Does this project push to GitHub?
   *
   * Checked locally rather than through the github route module, which imports
   * this layer — going the other way would make the two files circular. `gh`
   * is only consulted when origin does not obviously point at github.com, so
   * the common case costs one `git` call.
   */
  private async hasGitHubRemote(projectPath: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
        cwd: projectPath,
        env: execEnv,
        timeout: 10_000,
      });
      if (/github\.com/i.test(stdout)) return true;
    } catch {
      // No origin, or not a git repo — fall through to gh.
    }

    try {
      await execFileAsync('gh', ['repo', 'view', '--json', 'name'], {
        cwd: projectPath,
        env: execEnv,
        timeout: 15_000,
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Ask Haiku for an issue, or for the questions it needs answered first. */
  private async draftIssue(projectPath: string, feature: Feature): Promise<IssueDraftResult> {
    const prompts = await getPromptCustomization(this.settingsService, '[IssueDraft]');
    const systemPrompt = prompts.issueDraft.systemPrompt;

    const parts = [
      `Task title: ${feature.title?.trim() || '(none given)'}`,
      '',
      'Task description:',
      feature.description?.trim() || '(none given)',
    ];

    // Feed prior answers back in so a second pass does not re-ask.
    const answered = (feature.agentQuestions || []).filter(
      (q) => q.source === 'issue-draft' && (q.answeredAt || q.skipped)
    );
    if (answered.length > 0) {
      parts.push('', 'Clarifications already given by the user:');
      for (const q of answered) {
        parts.push(`- Q: ${q.question}`);
        parts.push(
          `  A: ${q.skipped ? '(user declined to answer — proceed without it)' : q.answer}`
        );
      }
      parts.push('', 'You have already asked once. Write the issue now — do not ask again.');
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), DRAFT_QUERY_TIMEOUT_MS);

    try {
      const result = await simpleQuery({
        prompt: parts.join('\n'),
        systemPrompt,
        model: CLAUDE_MODEL_MAP.haiku,
        cwd: projectPath,
        maxTurns: 1,
        allowedTools: [],
        readOnly: true,
        abortController,
        outputFormat: {
          type: 'json_schema',
          schema: ISSUE_DRAFT_SCHEMA as unknown as Record<string, unknown>,
        },
      });

      const parsed =
        (result.structured_output as IssueDraftResult | undefined) ??
        extractJson<IssueDraftResult>(result.text, { logger });

      if (!parsed) {
        // A drafter that returned nothing usable should not block the task —
        // fall back to the raw note rather than asking or failing.
        logger.warn(`No usable draft for ${feature.id}; falling back to the task description`);
        return { needsClarification: false };
      }

      return parsed;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Park questions on the feature and stop until they are answered. */
  private async askQuestions(
    projectPath: string,
    featureId: string,
    questions: IssueDraftQuestion[],
    round: number
  ): Promise<void> {
    // Two questions is drafter policy, not a global cap: the point is to
    // unblock a hopeless note, not to interview the user.
    const askable = questions.filter((q) => q.question?.trim()).slice(0, 2);

    if (askable.length === 0) {
      // The model claimed it needed clarification but gave nothing to ask.
      // Write the issue from what we have rather than stalling the task.
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) return;
      const draft = await this.draftIssue(projectPath, feature);
      await this.createIssue(projectPath, feature, { ...draft, needsClarification: false });
      return;
    }

    const asked = await getAgentQuestionService(
      this.events,
      this.featureLoader,
      this.settingsService
    ).ask(
      projectPath,
      featureId,
      'issue-draft',
      askable.map((q) => ({
        question: q.question,
        header: q.header,
        choices: toChoices(q.options),
      }))
    );

    if (asked.length === 0) {
      // The feature vanished between drafting and asking. Leaving the draft in
      // 'drafting' would wedge the commit gate, so let the run's catch record
      // it as failed rather than reporting a wait on questions that do not
      // exist.
      throw new Error(`Could not park clarification questions on ${featureId}`);
    }

    await this.setDraft(projectPath, featureId, {
      status: 'awaiting_clarification',
      clarificationRounds: round,
    });

    logger.info(`Issue draft for ${featureId} is waiting on ${asked.length} question(s)`);
  }

  /** File the issue and link it back to the feature. */
  private async createIssue(
    projectPath: string,
    feature: Feature,
    draft: IssueDraftResult
  ): Promise<void> {
    await this.setDraft(projectPath, feature.id, { status: 'creating' });

    const description = feature.description || '';
    const title =
      draft.title?.trim() ||
      feature.title?.trim() ||
      description.slice(0, 100).trim() ||
      'Untitled task';
    const body = draft.body?.trim() || description.trim();

    const syncService = getGitHubSyncService(this.events);
    const result = await syncService.createIssue(projectPath, title, body, [BACKLOG_LABEL]);

    if (!result.success || !result.issueNumber) {
      await this.setDraft(projectPath, feature.id, {
        status: 'failed',
        error: result.error || 'Failed to create GitHub issue',
        finishedAt: new Date().toISOString(),
      });
      return;
    }

    const current = await this.featureLoader.get(projectPath, feature.id);

    const updated = await this.featureLoader.update(projectPath, feature.id, {
      githubIssue: {
        number: result.issueNumber,
        url: result.url || '',
        assignees: [],
        // Record what GitHub actually has, not what we asked for.
        labels: result.appliedLabels ?? [BACKLOG_LABEL],
        state: 'open',
        syncedAt: new Date().toISOString(),
      },
      githubIssueDraft: {
        ...(current?.githubIssueDraft || feature.githubIssueDraft || {}),
        status: 'created',
        finishedAt: new Date().toISOString(),
        error: undefined,
      },
    });

    this.events.emit('feature:issue-draft-updated', {
      projectPath,
      featureId: feature.id,
      draft: updated.githubIssueDraft,
      githubIssue: updated.githubIssue,
    });

    logger.info(`Filed issue #${result.issueNumber} for feature ${feature.id}`);
  }

  /** Merge a partial draft state onto the feature and tell the UI. */
  private async setDraft(
    projectPath: string,
    featureId: string,
    patch: Partial<GitHubIssueDraft>
  ): Promise<void> {
    try {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) return;

      const draft: GitHubIssueDraft = {
        status: 'pending',
        ...(feature.githubIssueDraft || {}),
        ...patch,
      };

      await this.featureLoader.update(projectPath, featureId, { githubIssueDraft: draft });

      this.events.emit('feature:issue-draft-updated', {
        projectPath,
        featureId,
        draft,
      });
    } catch (err) {
      logger.error(`Failed to record issue draft state for ${featureId}:`, err);
    }
  }
}

let instance: IssueDraftService | null = null;

/**
 * Shared instance. The first call wires the dependencies; later calls reuse it
 * so `inFlight` bookkeeping is global rather than per-router.
 */
export function getIssueDraftService(
  events?: EventEmitter,
  featureLoader?: FeatureLoader,
  settingsService?: SettingsService
): IssueDraftService {
  if (!instance) {
    if (!events || !featureLoader) {
      throw new Error('IssueDraftService must be initialised with events and a feature loader');
    }
    instance = new IssueDraftService(events, featureLoader, settingsService);
  }
  return instance;
}
