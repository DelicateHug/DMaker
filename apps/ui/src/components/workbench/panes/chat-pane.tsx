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
 * `follow-up-feature` re-enters the SAME feature: same agent session, same
 * worktree, the whole previous transcript as context. What it is not is text
 * handed to a model mid-sentence — it is a fresh turn, and a fresh turn cannot
 * begin while one is already running.
 */
const IDLE_HINT =
  'Continues this task in a new agent turn — same session, same worktree. It does not reach an agent mid-run.';
const RUNNING_HINT =
  'The agent is still working. A follow-up runs as its own turn, so it can only start once this one finishes.';

/**
 * No attachment affordance in this composer yet, so every send carries the same
 * empty list. Hoisted rather than built per call because it is a constant, and
 * an empty array is handled identically to omitting it the whole way down —
 * `auto-mode-service.ts:1833` and `prompt-builder.ts:48` both test `.length`.
 */
const NO_ATTACHMENTS: string[] = [];

/**
 * Hand a composed message to the agent.
 *
 * The only place in this pane that knows how a message is delivered. Real
 * steering of a live agent replaces this function's body and nothing else —
 * the composer, the transcript and the running-state rules above it are
 * written against the call, not against follow-ups.
 *
 * `followUpFeature` takes exactly four parameters — (projectPath, featureId,
 * prompt, imagePaths) — and there is no fifth. `use-board-actions.ts:1130`
 * passes one anyway; it survives only because that file opens with
 * `// @ts-nocheck`, and the server never sees it.
 */
async function sendToAgent(projectPath: string, featureId: string, message: string): Promise<void> {
  const followUpFeature = getElectronAPI().autoMode?.followUpFeature;
  if (!followUpFeature) {
    throw new Error('Follow-ups are not available in this build.');
  }

  const result = await followUpFeature(projectPath, featureId, message, NO_ATTACHMENTS);
  if (!result.success) {
    throw new Error(result.error || 'The server refused the follow-up.');
  }
}

interface ChatPaneProps {
  feature: Feature;
  projectPath: string;
}

/**
 * Reply to the agent working this task.
 *
 * The transcript on top is the same agent output the run writes; the composer
 * underneath starts the next turn on it. Enter sends, Shift+Enter breaks a
 * line.
 *
 * Composing stays enabled while the agent runs — writing the next instruction
 * while watching the current turn is the normal way to use this — but sending
 * does not, because a second turn cannot start on a feature that is already
 * running.
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
    if (!message || isRunning || isSending) return;

    setIsSending(true);
    try {
      await sendToAgent(projectPath, feature.id, message);

      // Clearing the draft is what closes the double-send window. The route
      // answers before it has registered the run, so `isRunning` stays false
      // for a beat afterwards; a second Enter in that beat would be rejected
      // server-side as "already running" and the rejection never comes back to
      // us. An empty draft cannot be sent, so the window closes itself.
      setDraft('');

      // "Queued", not "started": the endpoint responds the moment it accepts
      // the request, before the agent has been spawned.
      toast.success('Follow-up queued', {
        description: 'The agent picks this up as its next turn.',
      });
    } catch (sendError) {
      // The draft is deliberately left intact so the message can be retried.
      logger.error('Failed to start follow-up:', sendError);
      toast.error('Could not start the follow-up', {
        description: sendError instanceof Error ? sendError.message : 'Please try again.',
      });
    } finally {
      setIsSending(false);
    }
  }, [draft, feature.id, isRunning, isSending, projectPath]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    // An IME is mid-composition: Enter is committing a candidate, not sending.
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    void handleSend();
  };

  const hint = isRunning ? RUNNING_HINT : IDLE_HINT;
  const canSend = draft.trim().length > 0 && !isRunning && !isSending;

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
            Start follow-up
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
