import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MessageSquare, RefreshCw, SendHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { createLogger } from '@dmaker/utils/logger';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/forms';
import { LoadingState } from '@/components/ui/loading-state';
import { LogViewer } from '@/components/ui/log-viewer';
import { useAgentOutputStream } from '@/hooks/use-agent-output-stream';
import { useRunningFeatureIds } from '@/hooks/use-running-feature-ids';
import { getElectronAPI } from '@/lib/electron';
import type { Feature } from '@/store/app-store';

const logger = createLogger('ChatPane');

/**
 * What a message actually does, said plainly rather than implied.
 *
 * There are two constants because there are genuinely two behaviours, and
 * which one you get depends on whether an agent is running at the moment you
 * press send:
 *
 * Idle — nothing to steer, so this starts a follow-up run. Same agent session,
 * same worktree, the whole previous transcript as context, but a new process
 * and a fresh turn.
 *
 * Running — the text goes into the LIVE session. The SDK reads a queued user
 * message only at a turn boundary, so the agent picks it up as its NEXT turn.
 * That is real steering, and it is still not mid-sentence — nothing in the SDK
 * reaches a model mid-thought, and this pane must not imply that it does.
 */
const IDLE_HINT =
  'Continues this task in a new agent turn — same session, same worktree. It does not reach an agent mid-run.';
const RUNNING_HINT =
  'Goes to the running agent, which picks it up at its next turn boundary — not mid-sentence.';

/** What a send actually did, for copy that has to tell the truth afterwards. */
interface SendOutcome {
  /** 'injected' reached the live agent; 'follow-up' started a new run. */
  mode: 'injected' | 'follow-up';
  /** The current turn was cut short, so the message runs now rather than later. */
  interrupted: boolean;
  /** The server's own account of what happened, preferred over ours. */
  detail?: string;
}

/**
 * Hand a composed message to the agent.
 *
 * The only place in this pane that knows how a message is delivered — the
 * composer, the transcript and the running-state rules above it are written
 * against this call, not against any one endpoint.
 *
 * `/inject-message` covers both cases behind a single request: it pushes into
 * the live session when there is one and starts a follow-up run when there is
 * not, then answers with which it did. That answer is the whole point. The
 * caller must not infer it from `isRunning`, which is a WebSocket-fed cache and
 * is routinely a beat behind the server's own view of what is running.
 *
 * `interrupt` is deliberately not passed. It ends the agent's current turn to
 * make room for this message, discarding whatever it was part-way through; that
 * is a destructive act and a plain composer is the wrong place to do it without
 * asking first. The client contract carries the option for a surface that does.
 */
async function sendToAgent(
  projectPath: string,
  featureId: string,
  message: string
): Promise<SendOutcome> {
  const injectMessage = getElectronAPI().autoMode?.injectMessage;
  if (!injectMessage) {
    throw new Error('Messaging an agent is not available in this build.');
  }

  const result = await injectMessage(projectPath, featureId, message);

  if (!result.success) {
    // `unsupported_provider` and `run_finished` both land here: running, but
    // unreachable. The server writes a specific reason for each — only the main
    // Claude stream loop has an input channel, and a settled session has closed
    // stdin — and it says more than this pane could reconstruct from `status`.
    throw new Error(result.error || 'The server refused the message.');
  }

  return {
    // A successful response is always one of the two. Anything else is a server
    // newer than this build, and 'follow-up' is the safer thing to claim: it
    // promises the user less than "your message reached the running agent".
    mode: result.mode === 'injected' ? 'injected' : 'follow-up',
    interrupted: result.interrupted === true,
    detail: result.message,
  };
}

interface ChatPaneProps {
  feature: Feature;
  projectPath: string;
}

/**
 * Reply to the agent working this task.
 *
 * The transcript on top is the same agent output the run writes; the composer
 * underneath talks to it. Enter sends, Shift+Enter breaks a line.
 *
 * Sending stays enabled while the agent runs — steering a run in flight is the
 * point of this pane, not an edge case. Which of the two things a send does is
 * decided by the server rather than here: the hint under the composer sets the
 * expectation from `isRunning`, and the toast afterwards reports what actually
 * happened, because those two can disagree.
 */
export function ChatPane({ feature, projectPath }: ChatPaneProps) {
  const { output, isLoading, error, refresh } = useAgentOutputStream(projectPath, feature.id);
  const runningFeatureIds = useRunningFeatureIds();
  const isRunning = runningFeatureIds.has(feature.id);

  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);

  // Track whether the user is pinned to the bottom; only auto-scroll if so.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const handleScroll = () => {
      const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
      shouldFollowRef.current = distanceFromBottom < 80;
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !shouldFollowRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [output]);

  const handleSend = useCallback(async () => {
    const message = draft.trim();
    if (!message || isSending) return;

    setIsSending(true);
    try {
      const outcome = await sendToAgent(projectPath, feature.id, message);

      // Clearing the draft is what closes the double-send window. The route
      // answers before any run it started has registered, so `isRunning` stays
      // false for a beat afterwards; a second Enter in that beat would find
      // nothing running again and start a SECOND follow-up, which the service
      // then rejects in the background where nothing surfaces it. An empty
      // draft cannot be sent, so the window closes itself.
      setDraft('');

      if (outcome.mode === 'injected') {
        toast.success('Sent to the running agent', {
          description:
            outcome.detail ??
            (outcome.interrupted
              ? 'The current turn was cut short, so it starts on this now.'
              : 'It picks this up at its next turn boundary — not mid-sentence.'),
        });
      } else {
        // Nothing was running, so this started a new run rather than steering
        // one — a materially different thing, and the toast has to say so.
        // "Queued", not "started": the endpoint responds the moment it accepts
        // the request, before the agent has been spawned.
        toast.success('Follow-up queued', {
          description:
            outcome.detail ?? 'Nothing was running, so this starts a new turn on this task.',
        });
      }
    } catch (sendError) {
      // The draft is deliberately left intact so the message can be retried.
      logger.error('Failed to send the message:', sendError);
      toast.error('Could not send the message', {
        description: sendError instanceof Error ? sendError.message : 'Please try again.',
      });
    } finally {
      setIsSending(false);
    }
  }, [draft, feature.id, isSending, projectPath]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    // An IME is mid-composition: Enter is committing a candidate, not sending.
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    void handleSend();
  };

  const hint = isRunning ? RUNNING_HINT : IDLE_HINT;
  // `isRunning` no longer gates sending — it only picks the wording. A run in
  // flight is the case injection exists for, and the one case where the old
  // disabled button was actively wrong.
  const canSend = draft.trim().length > 0 && !isSending;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && !output ? (
          <div className="flex h-full flex-col">
            <LoadingState message="Loading the conversation..." />
          </div>
        ) : output ? (
          <LogViewer output={output} scrollContainerRef={scrollRef} />
        ) : (
          <EmptyTranscript error={error} onRefresh={refresh} />
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 p-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          placeholder="Tell the agent what to do next — Enter to send, Shift+Enter for a new line"
          aria-label="Message the agent working this task"
          className="max-h-40 text-sm"
          data-testid="chat-composer"
        />
        <div className="mt-2 flex items-start gap-3">
          <p
            className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground"
            data-testid="chat-status"
          >
            {hint}
          </p>
          <Button
            size="sm"
            onClick={() => void handleSend()}
            disabled={!canSend}
            loading={isSending}
            title={hint}
            className="shrink-0 gap-1.5"
            data-testid="chat-send"
          >
            {!isSending && <SendHorizontal className="size-3.5" />}
            {/* The label names the likely outcome rather than the endpoint, so
                it stays honest either way: what the server actually did is
                confirmed by the toast, not promised by this button. */}
            {isRunning ? 'Send to agent' : 'Start follow-up'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Shown until the feature has agent output — which is every feature that has
 * never been run, so this is the first thing most people see in this pane.
 */
function EmptyTranscript({ error, onRefresh }: { error: string | null; onRefresh: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <MessageSquare className="size-8 text-muted-foreground/40" />
      <div>
        <p className="text-sm font-medium">Nothing from the agent yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {error ?? 'Everything the agent writes for this task shows up here.'}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1.5">
        <RefreshCw className="size-3.5" />
        Refresh
      </Button>
    </div>
  );
}
