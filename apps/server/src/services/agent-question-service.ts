/**
 * AgentQuestionService - the single owner of the "an agent needs the user to
 * decide something" lifecycle.
 *
 * Questions used to be hand-rolled inside IssueDraftService, which meant the
 * numbering, the choice shape and the resume rule were all specific to the
 * issue drafter. Now three producers park questions on a feature (the drafter,
 * planning and a running implementation agent) and they must agree on all
 * three, because one panel renders them and one endpoint answers them.
 *
 * The two rules worth stating out loud, because both have bitten:
 *
 * 1. `number` is assigned from the very array being appended to, inside a
 *    per-feature critical section. `FeatureLoader.update()` is an unlocked
 *    read-modify-write, so a counter read anywhere else - even one line
 *    earlier - lets two concurrent asks both see "2 questions so far" and
 *    write two "Question 3"s.
 * 2. `answerSource` is DERIVED here, never taken from the request body. The
 *    client says what was picked; the server says what that means.
 */

import { randomUUID } from 'crypto';
import { createLogger } from '@dmaker/utils';
import type { AgentQuestion, AgentQuestionOption, Feature } from '@dmaker/types';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';
import type { AutoModeService } from './auto-mode-service.js';

const logger = createLogger('AgentQuestions');

/** A choice as a producer supplies it, before ids are handed out. */
export interface AskQuestionChoice {
  /** Optional caller-supplied id. Anything empty or duplicated is replaced. */
  id?: string;
  label: string;
  description?: string;
}

/** One question as a producer supplies it. */
export interface AskQuestionInput {
  question: string;
  header?: string;
  /** Legacy plain-string suggestions. Normalised into `choices`. */
  options?: string[];
  choices?: AskQuestionChoice[];
  /** Defaults to true - the user always gets an "Other..." path. */
  allowCustomAnswer?: boolean;
  multiSelect?: boolean;
}

/** What the answer endpoint was given. `answerSource` is deliberately absent. */
export interface AnswerQuestionInput {
  answer?: string;
  selectedOptionIds?: string[];
  skipped?: boolean;
}

export type AnswerQuestionStatus =
  | 'ok'
  /** The feature is gone - the caller should 404. */
  | 'feature-not-found'
  /** The feature exists but carries no such question. Not an error. */
  | 'question-not-found'
  /** Nothing usable was submitted: no text, no known option, no skip. */
  | 'empty-answer';

export interface AnswerQuestionResult {
  status: AnswerQuestionStatus;
  feature: Feature | null;
  /** The question as it was written back, or null unless status is 'ok'. */
  question: AgentQuestion | null;
  /**
   * True only when an agent in THIS process was parked on the question and has
   * now been handed the answer. False is normal and not a failure: the run may
   * have ended, the question may have been asked by the other half of the
   * dev/prod pair, or it may never have blocked anyone.
   */
  resumed: boolean;
}

export class AgentQuestionService {
  private events: EventEmitter;
  private featureLoader: FeatureLoader;
  private settingsService?: SettingsService;
  private autoModeService?: AutoModeService;

  /**
   * One promise chain per feature. Both `ask` and `answer` are
   * read-modify-write over `feature.agentQuestions`, so two of them in flight
   * for one feature would lose whichever wrote first.
   */
  private chains = new Map<string, Promise<void>>();

  constructor(
    events: EventEmitter,
    featureLoader: FeatureLoader,
    settingsService?: SettingsService,
    autoModeService?: AutoModeService
  ) {
    this.events = events;
    this.featureLoader = featureLoader;
    this.settingsService = settingsService;
    this.autoModeService = autoModeService;
  }

  /**
   * Supply a dependency the first caller did not have.
   *
   * The route layer and the runner can each be the first to reach the
   * singleton and they do not hold the same objects; without this an answer
   * could reach a process that has an AutoModeService but no reference to it,
   * and a blocked agent would wait out its 30-minute ceiling.
   */
  attachDependencies(settingsService?: SettingsService, autoModeService?: AutoModeService): void {
    if (settingsService && !this.settingsService) this.settingsService = settingsService;
    if (autoModeService && !this.autoModeService) this.autoModeService = autoModeService;
  }

  /**
   * Park questions on a feature and tell the UI they exist.
   *
   * @returns The questions as written, in order. Empty when the feature is
   * gone or nothing survived normalisation - callers must not assume a
   * one-to-one mapping with what they passed in.
   */
  async ask(
    projectPath: string,
    featureId: string,
    source: AgentQuestion['source'],
    questions: AskQuestionInput[]
  ): Promise<AgentQuestion[]> {
    const askable = questions.filter((q) => q.question?.trim());
    if (askable.length === 0) return [];

    const created = await this.runExclusive(projectPath, featureId, async () => {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) {
        logger.warn(`Cannot ask on ${featureId}: feature not found`);
        return [];
      }

      const existing = feature.agentQuestions || [];
      const askedAt = new Date().toISOString();

      // Derived from the array being appended to, in one step, so it cannot
      // disagree with what actually lands on disk.
      let next = existing.reduce((max, q) => Math.max(max, q.number ?? 0), 0);

      const newQuestions: AgentQuestion[] = askable.map((input) => {
        next += 1;
        const choices = normaliseChoices(input);
        return {
          id: randomUUID(),
          source,
          number: next,
          question: input.question.trim(),
          ...(input.header?.trim() ? { header: input.header.trim() } : {}),
          ...(choices.length > 0
            ? {
                choices,
                // Also written as plain strings so the panel that still reads
                // `options` keeps rendering chips until it is migrated.
                options: choices.map((c) => c.label),
              }
            : {}),
          allowCustomAnswer: input.allowCustomAnswer ?? true,
          ...(input.multiSelect ? { multiSelect: true } : {}),
          askedAt,
        };
      });

      await this.featureLoader.update(projectPath, featureId, {
        agentQuestions: [...existing, ...newQuestions],
      });

      return newQuestions;
    });

    for (const question of created) {
      this.events.emit('feature:question-asked', { projectPath, featureId, question });
    }

    return created;
  }

  /**
   * Record an answer and hand it to whoever was waiting.
   *
   * The answer is written whatever happens to the resume - a run that has
   * already ended still leaves a task view that should show what the user
   * said.
   */
  async answer(
    projectPath: string,
    featureId: string,
    questionId: string,
    input: AnswerQuestionInput
  ): Promise<AnswerQuestionResult> {
    const outcome = await this.runExclusive(projectPath, featureId, async () => {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) {
        return { status: 'feature-not-found' as const, feature: null, question: null };
      }

      const questions = feature.agentQuestions || [];
      const target = questions.find((q) => q.id === questionId);
      if (!target) {
        logger.warn(`Question ${questionId} not found on feature ${featureId}`);
        return { status: 'question-not-found' as const, feature, question: null };
      }

      const resolved = deriveAnswer(target, input);
      if (!resolved) {
        return { status: 'empty-answer' as const, feature, question: null };
      }

      const answeredAt = new Date().toISOString();
      // Every field of the answer is rewritten rather than merged, so
      // re-answering a question that was skipped cannot leave `skipped: true`
      // sitting beside a custom answer. `undefined` is dropped on write.
      const answered: AgentQuestion = {
        ...target,
        answer: resolved.answer,
        answerSource: resolved.answerSource,
        selectedOptionIds:
          resolved.selectedOptionIds.length > 0 ? resolved.selectedOptionIds : undefined,
        skipped: resolved.answerSource === 'skipped' ? true : undefined,
        answeredAt,
      };

      const updatedQuestions = questions.map((q) => (q.id === questionId ? answered : q));
      const updated = await this.featureLoader.update(projectPath, featureId, {
        agentQuestions: updatedQuestions,
      });

      return {
        status: 'ok' as const,
        feature: updated,
        question: answered,
        questions: updatedQuestions,
      };
    });

    if (outcome.status !== 'ok' || !outcome.question) {
      return { status: outcome.status, feature: outcome.feature, question: null, resumed: false };
    }

    const { question } = outcome;
    this.events.emit('feature:question-answered', {
      projectPath,
      featureId,
      questionId,
      answer: question.answer,
      skipped: question.skipped ?? false,
      answerSource: question.answerSource,
      selectedOptionIds: question.selectedOptionIds,
    });

    const resumed = await this.dispatch(
      projectPath,
      featureId,
      question,
      outcome.questions ?? [question]
    );

    return { status: 'ok', feature: outcome.feature, question, resumed };
  }

  /**
   * Stamp `expiredAt` on questions nobody can act on any more.
   *
   * AutoModeService expires its own waiters at teardown; this is for producers
   * that give up without a run behind them.
   */
  async expire(projectPath: string, featureId: string, questionIds: string[]): Promise<number> {
    if (questionIds.length === 0) return 0;

    const count = await this.runExclusive(projectPath, featureId, async () => {
      const feature = await this.featureLoader.get(projectPath, featureId);
      const questions = feature?.agentQuestions;
      if (!questions?.length) return 0;

      const now = new Date().toISOString();
      let expired = 0;
      const updatedQuestions = questions.map((q) => {
        if (!questionIds.includes(q.id) || q.answeredAt || q.expiredAt) return q;
        expired += 1;
        return { ...q, expiredAt: now };
      });
      if (expired === 0) return 0;

      await this.featureLoader.update(projectPath, featureId, {
        agentQuestions: updatedQuestions,
      });
      return expired;
    });

    if (count > 0) {
      this.events.emit('feature:question-expired', { projectPath, featureId, count });
    }
    return count;
  }

  // --- Internals ----------------------------------------------------------

  /**
   * Route the answer back to whatever is blocked on it.
   *
   * @returns Whether a waiter in this process was actually released.
   */
  private async dispatch(
    projectPath: string,
    featureId: string,
    question: AgentQuestion,
    allQuestions: AgentQuestion[]
  ): Promise<boolean> {
    if (question.source === 'issue-draft') {
      try {
        // Imported here rather than at module scope: IssueDraftService imports
        // THIS module for ask(), and a static import back would make the two
        // circular. Whether it is safe to carry on is the drafter's own rule,
        // which is why the decision lives there and not here.
        const { getIssueDraftService } = await import('./issue-draft-service.js');
        return getIssueDraftService(
          this.events,
          this.featureLoader,
          this.settingsService
        ).resumeAfterAnswer(projectPath, featureId, allQuestions);
      } catch (error) {
        logger.error(`Failed to resume the issue draft for ${featureId}:`, error);
        return false;
      }
    }

    // Everything else is a live agent parked on a promise. False here is
    // routine - see AnswerQuestionResult.resumed.
    const resumed =
      this.autoModeService?.resolveQuestionAnswer(featureId, question.id, {
        answer: question.answer ?? '',
        skipped: question.skipped ?? false,
      }) ?? false;

    if (!resumed) {
      logger.debug(
        `No agent in this process was waiting on question ${question.id} (${question.source})`
      );
    }
    return resumed;
  }

  /**
   * Serialise a read-modify-write against one feature's question list.
   * The task runs whether the previous one resolved or rejected.
   */
  private runExclusive<T>(
    projectPath: string,
    featureId: string,
    task: () => Promise<T>
  ): Promise<T> {
    const key = `${projectPath}::${featureId}`;
    const previous = this.chains.get(key) ?? Promise.resolve();
    const result = previous.then(task, task);
    const tail = result.then(
      () => undefined,
      () => undefined
    );
    this.chains.set(key, tail);
    void tail.then(() => {
      // Only the last link may clear the entry, or a queued task loses its
      // predecessor and the section stops being exclusive.
      if (this.chains.get(key) === tail) this.chains.delete(key);
    });
    return result;
  }
}

// --- Pure helpers ---------------------------------------------------------

/**
 * Turn whatever a producer supplied into `choices` with ids that are unique
 * within the question. Ids are positional so a feature.json stays readable;
 * a caller-supplied id is honoured unless it is blank or already taken.
 */
function normaliseChoices(input: AskQuestionInput): AgentQuestionOption[] {
  const raw: AskQuestionChoice[] =
    input.choices && input.choices.length > 0
      ? input.choices
      : (input.options || []).map((label) => ({ label }));

  const used = new Set<string>();
  const choices: AgentQuestionOption[] = [];

  for (const candidate of raw) {
    const label = candidate.label?.trim();
    if (!label) continue;

    const supplied = candidate.id?.trim();
    let id = supplied && !used.has(supplied) ? supplied : '';
    if (!id) {
      let n = choices.length + 1;
      id = `opt-${n}`;
      while (used.has(id)) id = `opt-${++n}`;
    }
    used.add(id);

    choices.push({
      id,
      label,
      ...(candidate.description?.trim() ? { description: candidate.description.trim() } : {}),
    });
  }

  return choices;
}

/**
 * The choices this question actually offered, whether it was written with
 * `choices` or with the legacy `options: string[]`.
 *
 * A legacy question has no ids at all, so it gets the same positional ones
 * `ask()` hands out - which is what lets the panel answer an old question by
 * option rather than forcing free text.
 */
export function questionChoices(question: AgentQuestion): AgentQuestionOption[] {
  if (question.choices?.length) return question.choices;
  return (question.options || []).map((label, index) => ({ id: `opt-${index + 1}`, label }));
}

interface DerivedAnswer {
  answer: string;
  answerSource: NonNullable<AgentQuestion['answerSource']>;
  selectedOptionIds: string[];
}

/**
 * Decide what the submission means. The client never gets a say in this: it
 * reports what was picked, and the source is read off that.
 *
 * @returns null when nothing usable was submitted.
 */
export function deriveAnswer(
  question: AgentQuestion,
  input: AnswerQuestionInput
): DerivedAnswer | null {
  // Skipping is the user saying "decide without me", so an empty answer is the
  // expected shape rather than a missing one.
  if (input.skipped) {
    return { answer: '', answerSource: 'skipped', selectedOptionIds: [] };
  }

  const offered = questionChoices(question);
  const requested = input.selectedOptionIds ?? [];
  const matched = offered.filter((choice) => requested.includes(choice.id));

  if (matched.length > 0) {
    // Ids the question never offered are dropped rather than recorded, so the
    // resolved card can never show a choice that was not on screen.
    return {
      answer: matched.map((choice) => choice.label).join(', '),
      answerSource: 'option',
      selectedOptionIds: matched.map((choice) => choice.id),
    };
  }

  const text = input.answer?.trim();
  if (!text) return null;
  return { answer: text, answerSource: 'custom', selectedOptionIds: [] };
}

let instance: AgentQuestionService | null = null;

/**
 * Shared instance. The pending-answer bookkeeping and the per-feature write
 * lock are only meaningful process-wide, so this mirrors getIssueDraftService
 * rather than living on a router.
 */
export function getAgentQuestionService(
  events?: EventEmitter,
  featureLoader?: FeatureLoader,
  settingsService?: SettingsService,
  autoModeService?: AutoModeService
): AgentQuestionService {
  if (!instance) {
    if (!events || !featureLoader) {
      throw new Error('AgentQuestionService must be initialised with events and a feature loader');
    }
    instance = new AgentQuestionService(events, featureLoader, settingsService, autoModeService);
  } else {
    instance.attachDependencies(settingsService, autoModeService);
  }
  return instance;
}

/** Test-only: drop the singleton so each suite starts from a clean process. */
export function resetAgentQuestionService(): void {
  instance = null;
}
