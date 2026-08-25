/**
 * Agent Questions panel — where an agent asks the user something and gets an answer.
 *
 * Lives in the task view. Today its only producer is the background GitHub
 * issue drafter, which parks a question here rather than inventing
 * requirements when a task note is too thin. The panel is deliberately
 * source-agnostic: anything that writes an `agentQuestions` entry shows up
 * here, and the reply is routed back by the question's `source`.
 *
 * The task keeps running while a question is outstanding — planning and branch
 * creation are unaffected. Only the commit waits on the issue.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Github,
  HelpCircle,
  Loader2,
  MessageCircleQuestion,
  RefreshCw,
  SkipForward,
} from 'lucide-react';
import type { AgentQuestion, Feature, GitHubIssueDraft } from '@dmaker/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/forms';
import { Badge } from '@/components/ui/layout';
import { getElectronAPI } from '@/lib/electron';
import { cn } from '@/lib/utils';
import { createLogger } from '@dmaker/utils/logger';
import { toast } from 'sonner';

const logger = createLogger('AgentQuestions');

/**
 * How often the panel re-reads the feature.
 *
 * The server has no per-feature push channel the UI can subscribe to, so this
 * polls — but only while the panel is mounted and the tab is visible.
 */
const POLL_INTERVAL_MS = 4_000;

export interface AgentQuestionsPanelProps {
  projectPath: string;
  featureId: string;
  /** Feature to render before the first poll lands */
  initialFeature?: Feature | null;
  className?: string;
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
// Single question
// ---------------------------------------------------------------------------

const QuestionCard = memo(function QuestionCard({
  question,
  isSubmitting,
  onAnswer,
  onSkip,
}: {
  question: AgentQuestion;
  isSubmitting: boolean;
  onAnswer: (answer: string) => void;
  onSkip: () => void;
}) {
  const [draft, setDraft] = useState('');

  const submit = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAnswer(trimmed);
  }, [draft, onAnswer]);

  return (
    <div
      className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-3"
      data-testid={`agent-question-${question.id}`}
    >
      <div className="flex items-start gap-2">
        <HelpCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-sm leading-relaxed">{question.question}</p>
      </div>

      {question.options && question.options.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-6">
          {question.options.map((option) => (
            <Button
              key={option}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={isSubmitting}
              onClick={() => onAnswer(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      )}

      <div className="pl-6 space-y-2">
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
          data-testid={`agent-question-input-${question.id}`}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            disabled={isSubmitting || !draft.trim()}
            onClick={submit}
            data-testid={`agent-question-submit-${question.id}`}
          >
            {isSubmitting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
            Answer
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            disabled={isSubmitting}
            onClick={onSkip}
            title="Write the issue without this detail"
            data-testid={`agent-question-skip-${question.id}`}
          >
            <SkipForward className="w-3 h-3 mr-1" />
            Skip
          </Button>
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
    void refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const questions = useMemo<AgentQuestion[]>(
    () => (feature?.agentQuestions as AgentQuestion[] | undefined) || [],
    [feature]
  );

  const outstanding = useMemo(
    () => questions.filter((q) => !q.answeredAt && !q.skipped),
    [questions]
  );
  const resolved = useMemo(() => questions.filter((q) => q.answeredAt || q.skipped), [questions]);

  const draftStatus = describeDraft(feature?.githubIssueDraft, feature?.githubIssue?.number);

  const submitAnswer = useCallback(
    async (question: AgentQuestion, answer: string, skipped: boolean) => {
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
          answer,
          skipped
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
              'w-4 h-4 mt-0.5 shrink-0',
              draftStatus.tone,
              draftStatus.spin && 'animate-spin'
            )}
          />
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className={cn('text-sm font-medium', draftStatus.tone)}>{draftStatus.label}</p>
            {draftStatus.detail && (
              <p className="text-xs text-muted-foreground leading-relaxed">{draftStatus.detail}</p>
            )}
          </div>
          {showRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs shrink-0"
              disabled={isRetrying}
              onClick={retryDraft}
              data-testid="retry-issue-draft"
            >
              <RefreshCw className={cn('w-3 h-3 mr-1', isRetrying && 'animate-spin')} />
              Retry
            </Button>
          )}
        </div>
      )}

      {outstanding.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Needs your answer ({outstanding.length})
          </p>
          {outstanding.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              isSubmitting={submittingId === question.id}
              onAnswer={(answer) => submitAnswer(question, answer, false)}
              onSkip={() => submitAnswer(question, '', true)}
            />
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Answered ({resolved.length})
          </p>
          {resolved.map((question) => (
            <div
              key={question.id}
              className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1.5"
              data-testid={`agent-question-resolved-${question.id}`}
            >
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground leading-relaxed">{question.question}</p>
              </div>
              <p className="pl-5 text-sm">
                {question.skipped ? (
                  <Badge variant="outline" className="text-[10px]">
                    Skipped
                  </Badge>
                ) : (
                  question.answer
                )}
              </p>
            </div>
          ))}
        </div>
      )}

      {!draftStatus && questions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <MessageCircleQuestion className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">Nothing to answer.</p>
          <p className="text-xs mt-1 opacity-80">
            Agents post questions here when they need a decision from you.
          </p>
        </div>
      )}
    </div>
  );
}
