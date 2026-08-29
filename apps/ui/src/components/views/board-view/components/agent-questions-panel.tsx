/**
 * Agent Questions panel — where an agent asks the user something and gets an
 * answer, and where the record of what was asked and what was picked lives.
 *
 * Lives in the task view and in the workbench's Questions pane. Its first
 * producer was the background GitHub issue drafter, which parks a question
 * here rather than inventing requirements when a task note is too thin; the
 * panel is deliberately source-agnostic, so anything that writes an
 * `agentQuestions` entry shows up here and the reply is routed back by the
 * question's `source`.
 *
 * Two rules the server owns and this panel must not second-guess:
 *
 * - **The choices are the record.** An answer submitted as `selectedOptionIds`
 *   is recorded as `answerSource: 'option'` with the ids; submitting the
 *   option's *label* as free text records `'custom'` and loses which choice was
 *   taken. So picking a row sends ids and the server synthesises the text.
 * - **"Other" is always on offer.** The asking agent is told never to invent an
 *   "Other" option because the UI supplies one, which is why the free-text box
 *   is a deliberate choice here rather than an always-open box beside the
 *   options.
 *
 * The task keeps running while a question is outstanding — planning and branch
 * creation are unaffected. Only the commit waits on the issue.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CircleSlash,
  Github,
  HelpCircle,
  Loader2,
  MessageCircleQuestion,
  PenLine,
  RefreshCw,
  SkipForward,
} from 'lucide-react';
import type { AgentQuestion, AgentQuestionOption, Feature, GitHubIssueDraft } from '@dmaker/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/forms';
import { Badge } from '@/components/ui/layout';
import { getElectronAPI } from '@/lib/electron';
import { cn } from '@/lib/utils';
import { createLogger } from '@dmaker/utils/logger';
import { toast } from 'sonner';

const logger = createLogger('AgentQuestions');

/**
 * Safety net, not the delivery mechanism.
 *
 * Questions arrive on `features.onQuestionEvent`. This poll exists for the two
 * cases that channel cannot cover: a socket that dropped without the client
 * noticing, and the mock API (the whole Playwright suite), whose
 * `onQuestionEvent` never fires. Anything faster is a re-read of a file nothing
 * has changed.
 */
const POLL_INTERVAL_MS = 30_000;

export interface AgentQuestionsPanelProps {
  projectPath: string;
  featureId: string;
  /** Feature to render before the first fetch lands */
  initialFeature?: Feature | null;
  /**
   * Whether this surface is on screen. The workbench keeps every visited pane
   * mounted, so the poll is gated on it. Defaults to true for callers that are
   * only rendered when visible.
   */
  isActive?: boolean;
  className?: string;
}

/**
 * The choices a question actually offered.
 *
 * Mirrors `questionChoices()` in the server's AgentQuestionService, including
 * the positional `opt-N` ids it hands a legacy question that carries only
 * `options: string[]`. Those ids are what makes the entire existing corpus
 * answerable by choice rather than forced into free text — the two copies of
 * this one-line rule must never disagree.
 */
function questionChoices(question: AgentQuestion): AgentQuestionOption[] {
  if (question.choices?.length) return question.choices;
  return (question.options ?? []).map((label, index) => ({ id: `opt-${index + 1}`, label }));
}

/** A question nobody can act on any more: answered, skipped, or expired. */
function isResolved(question: AgentQuestion): boolean {
  return !!(question.answeredAt || question.skipped || question.expiredAt);
}

/**
 * Display number for a question.
 *
 * The server assigns a real `number` at ask time. Every question written before
 * it did carries none, so those fall back to their position in askedAt order.
 */
function buildQuestionNumbers(questions: AgentQuestion[]): Map<string, number> {
  const numbers = new Map<string, number>();
  const byAskedAt = [...questions].sort((a, b) => (a.askedAt ?? '').localeCompare(b.askedAt ?? ''));
  byAskedAt.forEach((question, index) => {
    numbers.set(question.id, question.number ?? index + 1);
  });
  return numbers;
}

/**
 * Group questions into batches by proximity in time.
 * Questions asked within 120s of each other are in the same group.
 */
function groupQuestionsByBatch(
  questions: AgentQuestion[]
): { group: AgentQuestion[]; setNumber: number }[] {
  if (questions.length === 0) return [];
  const sorted = [...questions].sort((a, b) => (a.askedAt ?? '').localeCompare(b.askedAt ?? ''));
  const groups: { group: AgentQuestion[]; setNumber: number }[] = [];
  const BATCH_WINDOW_MS = 120_000; // 2 minutes

  let currentGroup: AgentQuestion[] = [];
  let lastTime: number | null = null;

  sorted.forEach((q) => {
    const time = q.askedAt ? new Date(q.askedAt).getTime() : Date.now();
    if (lastTime === null || time - lastTime <= BATCH_WINDOW_MS) {
      currentGroup.push(q);
    } else {
      if (currentGroup.length > 0) {
        groups.push({ group: currentGroup, setNumber: groups.length + 1 });
      }
      currentGroup = [q];
    }
    lastTime = time;
  });

  if (currentGroup.length > 0) {
    groups.push({ group: currentGroup, setNumber: groups.length + 1 });
  }

  return groups;
}

interface SubmitPayload {
  answer: string;
  skipped?: boolean;
  selectedOptionIds?: string[];
}

// ---------------------------------------------------------------------------
// Draft status strip
// ---------------------------------------------------------------------------

interface DraftStatusView {
  icon: React.ElementType;
  spin?: boolean;
  tone: string;
  label: string;
  detail?: string;
}

function describeDraft(
  draft: GitHubIssueDraft | undefined,
  issueNumber: number | undefined
): DraftStatusView | null {
  if (issueNumber) {
    return {
      icon: Github,
      tone: 'text-emerald-600 dark:text-emerald-400',
      label: `Issue #${issueNumber} filed`,
      detail: 'Commits for this task are unblocked.',
    };
  }

  if (!draft) return null;

  switch (draft.status) {
    case 'pending':
    case 'drafting':
      return {
        icon: Loader2,
        spin: true,
        tone: 'text-muted-foreground',
        label: 'Writing the GitHub issue…',
        detail: 'The task can plan and branch meanwhile. Its first commit waits for this.',
      };
    case 'awaiting_clarification':
      return {
        icon: MessageCircleQuestion,
        tone: 'text-amber-600 dark:text-amber-400',
        label: 'Waiting on your answer',
        detail: 'The issue cannot be written from the task note alone.',
      };
    case 'creating':
      return {
        icon: Loader2,
        spin: true,
        tone: 'text-muted-foreground',
        label: 'Filing the issue on GitHub…',
      };
    case 'skipped':
      return {
        icon: CheckCircle2,
        tone: 'text-muted-foreground',
        label: 'No issue for this task',
        detail: draft.skipReason,
      };
    case 'failed':
      return {
        icon: AlertCircle,
        tone: 'text-destructive',
        label: 'Could not create the issue',
        detail: draft.error,
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Question header (shared by the outstanding and resolved cards)
// ---------------------------------------------------------------------------

function QuestionHeading({
  question,
  number,
  tone,
}: {
  question: AgentQuestion;
  number: number;
  tone: 'open' | 'resolved';
}) {
  return (
    <div className="flex items-center gap-2">
      <p
        className={cn(
          'text-xs font-medium',
          tone === 'open' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
        )}
        data-testid={`agent-question-title-${question.id}`}
      >
        Question {number}
      </p>
      {question.header && (
        <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
          {question.header}
        </Badge>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outstanding question
// ---------------------------------------------------------------------------

const QuestionCard = memo(function QuestionCard({
  question,
  number,
  isSubmitting,
  onAnswer,
  onSkip,
}: {
  question: AgentQuestion;
  number: number;
  isSubmitting: boolean;
  onAnswer: (payload: SubmitPayload) => void;
  onSkip: () => void;
}) {
  const choices = useMemo(() => questionChoices(question), [question]);
  const [draft, setDraft] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [wantsCustom, setWantsCustom] = useState(false);

  // With nothing on offer the free-text box is the only way to answer, so it is
  // shown outright rather than behind an "Other" nobody could have skipped.
  const freeTextOnly = choices.length === 0;
  const offersCustom = freeTextOnly || question.allowCustomAnswer !== false;
  const showTextarea = freeTextOnly || wantsCustom;

  const toggleChoice = useCallback(
    (choiceId: string) => {
      setWantsCustom(false);
      setSelectedIds((previous) => {
        if (!question.multiSelect) return [choiceId];
        return previous.includes(choiceId)
          ? previous.filter((id) => id !== choiceId)
          : [...previous, choiceId];
      });
    },
    [question.multiSelect]
  );

  const chooseCustom = useCallback(() => {
    setSelectedIds([]);
    setWantsCustom(true);
  }, []);

  const canSubmit = showTextarea ? draft.trim().length > 0 : selectedIds.length > 0;

  const submit = useCallback(() => {
    if (showTextarea) {
      const trimmed = draft.trim();
      if (!trimmed) return;
      onAnswer({ answer: trimmed });
      return;
    }
    if (selectedIds.length === 0) return;
    // The ids are the answer. The server derives the text from the labels it
    // recorded, so sending our own would only be a second copy that can drift.
    onAnswer({ answer: '', selectedOptionIds: selectedIds });
  }, [showTextarea, draft, selectedIds, onAnswer]);

  return (
    <div
      className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
      data-testid={`agent-question-${question.id}`}
    >
      <div className="flex items-start gap-2">
        <HelpCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1 space-y-1">
          <QuestionHeading question={question} number={number} tone="open" />
          <p className="text-sm leading-relaxed">{question.question}</p>
        </div>
      </div>

      {choices.length > 0 && (
        <div
          className="space-y-1 pl-6"
          role={question.multiSelect ? 'group' : 'radiogroup'}
          aria-label={`Answers for question ${number}`}
        >
          {choices.map((choice) => {
            const isSelected = selectedIds.includes(choice.id);
            return (
              <button
                key={choice.id}
                type="button"
                role={question.multiSelect ? 'checkbox' : 'radio'}
                aria-checked={isSelected}
                disabled={isSubmitting}
                onClick={() => toggleChoice(choice.id)}
                data-testid={`agent-question-choice-${question.id}-${choice.id}`}
                data-selected={isSelected ? 'true' : 'false'}
                className={cn(
                  'flex w-full cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                  isSelected
                    ? 'border-amber-500/60 bg-amber-500/10'
                    : 'border-border/50 hover:bg-accent/40',
                  isSubmitting && 'cursor-not-allowed opacity-60'
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 size-3.5 shrink-0 border',
                    question.multiSelect ? 'rounded-[3px]' : 'rounded-full',
                    isSelected ? 'border-amber-500 bg-amber-500' : 'border-muted-foreground/40'
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium leading-relaxed">{choice.label}</span>
                  {choice.description && (
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                      {choice.description}
                    </span>
                  )}
                </span>
              </button>
            );
          })}

          {offersCustom && !freeTextOnly && (
            <button
              type="button"
              role={question.multiSelect ? 'checkbox' : 'radio'}
              aria-checked={wantsCustom}
              disabled={isSubmitting}
              onClick={chooseCustom}
              data-testid={`agent-question-other-${question.id}`}
              data-selected={wantsCustom ? 'true' : 'false'}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                wantsCustom
                  ? 'border-amber-500/60 bg-amber-500/10'
                  : 'border-dashed border-border/50 hover:bg-accent/40',
                isSubmitting && 'cursor-not-allowed opacity-60'
              )}
            >
              <PenLine className="size-3.5 shrink-0 text-muted-foreground" />
              Other…
            </button>
          )}
        </div>
      )}

      <div className="space-y-2 pl-6">
        {showTextarea && (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter is a newline, as everywhere else in the app.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Type your answer…"
            className="min-h-[60px] text-sm"
            disabled={isSubmitting}
            autoFocus={wantsCustom}
            data-testid={`agent-question-input-${question.id}`}
          />
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            disabled={isSubmitting || !canSubmit}
            onClick={submit}
            data-testid={`agent-question-submit-${question.id}`}
          >
            {isSubmitting ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
            Answer
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            disabled={isSubmitting}
            onClick={onSkip}
            title="Let the agent decide without this detail"
            data-testid={`agent-question-skip-${question.id}`}
          >
            <SkipForward className="mr-1 size-3" />
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Resolved question — what was offered, and what was picked
// ---------------------------------------------------------------------------

const ResolvedQuestionCard = memo(function ResolvedQuestionCard({
  question,
  number,
}: {
  question: AgentQuestion;
  number: number;
}) {
  const expired = !!question.expiredAt && !question.answeredAt && !question.skipped;

  return (
    <div
      className="space-y-1 rounded-lg border border-border/50 bg-muted/20 p-3"
      data-testid={`agent-question-resolved-${question.id}`}
      data-answer-source={question.answerSource ?? (expired ? 'expired' : 'unknown')}
    >
      <div className="flex items-start gap-2">
        {expired ? (
          <CircleSlash className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <QuestionHeading question={question} number={number} tone="resolved" />
          <p className="text-xs leading-relaxed text-muted-foreground">{question.question}</p>
          {expired && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Expired — run ended before answer
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function AgentQuestionsPanel({
  projectPath,
  featureId,
  initialFeature,
  isActive = true,
  className,
}: AgentQuestionsPanelProps) {
  const [feature, setFeature] = useState<Feature | null>(initialFeature ?? null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const fetchingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!projectPath || !featureId || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const api = getElectronAPI();
      const result = await api.features?.get(projectPath, featureId);
      if (result?.success && result.feature) {
        setFeature(result.feature);
      }
    } catch (error) {
      logger.error('Failed to refresh feature questions:', error);
    } finally {
      fetchingRef.current = false;
    }
  }, [projectPath, featureId]);

  useEffect(() => {
    // Nothing is read while hidden: a workbench pane stays mounted for the
    // life of the task, so an ungated poll would re-read feature.json for
    // every open task's Questions pane whether or not anyone is looking at it.
    // Becoming visible refreshes immediately, which is what covers the gap.
    if (!isActive) return;
    void refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh, isActive]);

  // The push channel. Asked, answered and expired all change what is on screen,
  // and an answer can arrive from the other half of the dev/prod pair, so every
  // one of them re-reads the feature rather than patching state locally.
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.features?.onQuestionEvent) return;

    return api.features.onQuestionEvent((event) => {
      if (event.payload.featureId !== featureId) return;
      void refresh();
    });
  }, [featureId, refresh]);

  const questions = useMemo<AgentQuestion[]>(
    () => (feature?.agentQuestions as AgentQuestion[] | undefined) || [],
    [feature]
  );

  const questionNumbers = useMemo(() => buildQuestionNumbers(questions), [questions]);

  // An expired question is not outstanding: nobody can answer it, and counting
  // it would leave the badge stuck on a run that has already ended.
  const outstanding = useMemo(() => questions.filter((q) => !isResolved(q)), [questions]);
  const resolved = useMemo(() => questions.filter(isResolved), [questions]);

  const outstandingGroups = useMemo(() => groupQuestionsByBatch(outstanding), [outstanding]);
  const resolvedGroups = useMemo(() => groupQuestionsByBatch(resolved), [resolved]);

  const draftStatus = describeDraft(feature?.githubIssueDraft, feature?.githubIssue?.number);

  const submitAnswer = useCallback(
    async (question: AgentQuestion, payload: SubmitPayload) => {
      setSubmittingId(question.id);
      try {
        const api = getElectronAPI();
        if (!api.features?.answerQuestion) {
          toast.error('This build cannot send answers back to the agent');
          return;
        }
        const result = await api.features.answerQuestion(
          projectPath,
          featureId,
          question.id,
          payload.answer,
          payload.skipped,
          payload.selectedOptionIds
        );
        if (result.success && result.feature) {
          setFeature(result.feature);
        } else {
          toast.error('Failed to send your answer', { description: result.error });
        }
      } catch (error) {
        logger.error('Failed to answer question:', error);
        toast.error('Failed to send your answer');
      } finally {
        setSubmittingId(null);
      }
    },
    [projectPath, featureId]
  );

  const retryDraft = useCallback(async () => {
    setIsRetrying(true);
    try {
      const api = getElectronAPI();
      if (!api.features?.startIssueDraft) return;
      const result = await api.features.startIssueDraft(projectPath, featureId);
      if (result.success) {
        toast.success('Retrying GitHub issue creation');
        void refresh();
      } else {
        toast.error('Could not retry', { description: result.error });
      }
    } finally {
      setIsRetrying(false);
    }
  }, [projectPath, featureId, refresh]);

  const showRetry = feature?.githubIssueDraft?.status === 'failed' && !feature?.githubIssue?.number;

  return (
    <div className={cn('space-y-4', className)} data-testid="agent-questions-panel">
      {draftStatus && (
        <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-card p-3">
          <draftStatus.icon
            className={cn(
              'mt-0.5 size-4 shrink-0',
              draftStatus.tone,
              draftStatus.spin && 'animate-spin'
            )}
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className={cn('text-sm font-medium', draftStatus.tone)}>{draftStatus.label}</p>
            {draftStatus.detail && (
              <p className="text-xs leading-relaxed text-muted-foreground">{draftStatus.detail}</p>
            )}
          </div>
          {showRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 text-xs"
              disabled={isRetrying}
              onClick={retryDraft}
              data-testid="retry-issue-draft"
            >
              <RefreshCw className={cn('mr-1 size-3', isRetrying && 'animate-spin')} />
              Retry
            </Button>
          )}
        </div>
      )}

      {outstanding.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Needs your answer ({outstanding.length})
          </p>
          {outstandingGroups.map(({ group, setNumber }) => (
            <div key={`set-${setNumber}`} className="space-y-2">
              {outstandingGroups.length > 1 && (
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Question Set {setNumber}
                </p>
              )}
              {group.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  number={questionNumbers.get(question.id) ?? 0}
                  isSubmitting={submittingId === question.id}
                  onAnswer={(payload) => submitAnswer(question, payload)}
                  onSkip={() => submitAnswer(question, { answer: '', skipped: true })}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Answered ({resolved.length})
          </p>
          {resolvedGroups.map(({ group, setNumber }) => (
            <div key={`set-${setNumber}`} className="space-y-2">
              {resolvedGroups.length > 1 && (
                <p className="text-xs font-medium text-muted-foreground">
                  Question Set {setNumber}
                </p>
              )}
              {group.map((question) => (
                <ResolvedQuestionCard
                  key={question.id}
                  question={question}
                  number={questionNumbers.get(question.id) ?? 0}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {!draftStatus && questions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <MessageCircleQuestion className="mb-3 size-10 opacity-40" />
          <p className="text-sm">Nothing to answer.</p>
          <p className="mt-1 text-xs opacity-80">
            Agents post questions here when they need a decision from you.
          </p>
        </div>
      )}
    </div>
  );
}
