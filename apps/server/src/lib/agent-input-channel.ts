/**
 * AgentInputChannel - the queue that feeds extra user turns into a live CLI
 * session, and the object that decides when that session's child process dies.
 *
 * WHY THIS OWNS A PROCESS LIFETIME
 *
 * `query({ prompt })` takes either a string or an `AsyncIterable<SDKUserMessage>`.
 * A string is a single user turn, and the SDK closes the child's stdin the
 * moment the first `result` arrives - that auto-close is what stops an ~11MB
 * CLI process leaking. An async iterable is streaming-input mode: extra turns
 * become possible (so do `interrupt()` and the other control methods, which
 * only work in that mode), but the SDK now closes stdin when the ITERABLE
 * COMPLETES and at no other time. So the moment a run passes one of these, this
 * object - not the SDK - decides when the process exits.
 *
 * TURN ACCOUNTING, NOT "CLOSE WHEN THE QUEUE IS EMPTY"
 *
 * Two obvious rules are both wrong:
 *
 *  - "close when the queue is empty" fires immediately. The SDK calls `next()`
 *    as soon as it has consumed a message, before a single token has streamed
 *    back, so the queue is empty for almost the whole run.
 *  - "close on the first result" kills the process while an already-queued turn
 *    is still waiting to run.
 *
 * So we count instead. The provider yields the initial prompt itself, before it
 * starts iterating this channel, which is why `resultsSeen` legitimately runs
 * one ahead of `injected`: result #1 belongs to that prompt. The session is
 * settled - every turn submitted has produced its result and nothing is waiting
 * - exactly when `resultsSeen > injected` and the queue is empty. With no
 * injection at all that is true on the first result, which reproduces the
 * string-prompt auto-close byte for byte.
 *
 * The caller must STILL close this on every other exit (error, abort, an early
 * `break` out of the stream loop). A channel left open is a leaked process.
 */

import type { AgentInputMessage } from '@dmaker/types';
import { createLogger } from '@dmaker/utils';

const logger = createLogger('AgentInputChannel');

/** Why the channel closed - for logging and for tests. */
export type AgentInputChannelCloseReason =
  /** Every submitted turn produced its result and nothing was queued. */
  | 'turns_settled'
  /** The run ended (completed, failed, aborted, or broke out of its loop). */
  | 'run_ended';

export interface AgentInputChannelOptions {
  /**
   * Called with each message at the moment it is handed to the provider, which
   * is the first point at which "it went into the session" is true. Used to
   * echo the text into the transcript. Must not throw.
   */
  onDeliver?: (message: AgentInputMessage) => void;
  /** Called once, whatever closed the channel. Must not throw. */
  onClose?: (reason: AgentInputChannelCloseReason) => void;
}

export class AgentInputChannel implements AsyncIterable<AgentInputMessage> {
  private readonly queue: AgentInputMessage[] = [];
  /** The single parked `next()` call, if the consumer is waiting on us. */
  private waiter: ((message: AgentInputMessage | null) => void) | null = null;
  private closed = false;
  private consuming = false;
  private injectedCount = 0;
  private resultCount = 0;
  private deliveredCount = 0;
  private readonly options: AgentInputChannelOptions;

  constructor(options: AgentInputChannelOptions = {}) {
    this.options = options;
  }

  /** True once the iterable has completed - i.e. stdin is closing/closed. */
  get isClosed(): boolean {
    return this.closed;
  }

  /** Messages accepted but not yet handed to the provider. */
  get pendingCount(): number {
    return this.queue.length;
  }

  /** Extra turns accepted over this channel's lifetime. */
  get injected(): number {
    return this.injectedCount;
  }

  /** `result` messages the run has reported to us. */
  get resultsSeen(): number {
    return this.resultCount;
  }

  /** Messages actually handed to the provider. */
  get delivered(): number {
    return this.deliveredCount;
  }

  /**
   * Queue one extra user turn.
   *
   * @returns `false` when the channel is already closed - the run is over and
   * the message would never be read. Callers must report that rather than
   * pretending the message was delivered.
   */
  push(content: AgentInputMessage['content']): boolean {
    if (this.closed) return false;

    const message: AgentInputMessage = { content };
    this.injectedCount++;

    const waiter = this.waiter;
    if (waiter) {
      // The consumer is parked in next(); hand it over directly rather than
      // queueing, so `pendingCount` never counts a message that is already gone.
      this.waiter = null;
      this.deliveredCount++;
      this.notifyDeliver(message);
      waiter(message);
    } else {
      this.queue.push(message);
    }
    return true;
  }

  /**
   * Record that the run reported a `result` message.
   *
   * Deliberately subtype-agnostic: `error_max_turns` and
   * `error_during_execution` end the session exactly as `success` does, and a
   * channel that only counted successes would hold the process open forever
   * after a run that hit its turn cap.
   */
  noteResult(): void {
    if (this.closed) return;
    this.resultCount++;
    if (this.resultCount > this.injectedCount && this.queue.length === 0) {
      this.close('turns_settled');
    }
  }

  /**
   * End the iterable, which is what closes the child's stdin.
   *
   * Idempotent, never throws, and safe to call from a `finally`. Anything still
   * queued is dropped: the run it was meant for is over.
   */
  close(reason: AgentInputChannelCloseReason = 'run_ended'): void {
    if (this.closed) return;
    this.closed = true;

    const dropped = this.queue.length;
    this.queue.length = 0;
    if (dropped > 0) {
      logger.warn(`Dropped ${dropped} queued message(s): the run ended before they were read`);
    }

    const waiter = this.waiter;
    this.waiter = null;
    waiter?.(null);

    try {
      this.options.onClose?.(reason);
    } catch (error) {
      logger.warn('onClose handler threw:', error);
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<AgentInputMessage> {
    if (this.consuming) {
      // One channel feeds one session's stdin. A second consumer would take
      // half the messages and neither would be complete, so refuse instead —
      // and refuse by ending, never by throwing into the SDK's writer loop.
      logger.warn('A second consumer tried to read one input channel; it gets nothing');
      return;
    }
    this.consuming = true;

    try {
      while (true) {
        const message = await this.take();
        if (!message) return;
        yield message;
      }
    } finally {
      // Reached on normal completion (a no-op — close() is idempotent) and when
      // a consumer suspended at a `yield` abandons us, which is what an aborted
      // query's `return()` does. A later push then answers honestly instead of
      // queueing into a session nobody is reading.
      //
      // It does NOT cover a consumer parked on `next()` with an empty queue:
      // `return()` on a generator awaiting inside its body is queued behind
      // that await and never lands. That is the whole reason the run's
      // `finally` must call close() — nothing else can free it.
      this.close();
    }
  }

  /** Next queued message, or `null` once the channel closes. */
  private take(): Promise<AgentInputMessage | null> {
    const queued = this.queue.shift();
    if (queued) {
      this.deliveredCount++;
      this.notifyDeliver(queued);
      return Promise.resolve(queued);
    }
    if (this.closed) return Promise.resolve(null);
    return new Promise<AgentInputMessage | null>((resolve) => {
      this.waiter = resolve;
    });
  }

  private notifyDeliver(message: AgentInputMessage): void {
    try {
      this.options.onDeliver?.(message);
    } catch (error) {
      // A transcript echo must never take the run down with it.
      logger.warn('onDeliver handler threw:', error);
    }
  }
}

/**
 * Plain text of a message, for the transcript echo.
 *
 * `AgentInputMessage.content` is a string or a block array (the image-carrying
 * shape); only the text blocks are readable prose.
 */
export function agentInputMessageText(message: AgentInputMessage): string {
  if (typeof message.content === 'string') return message.content;
  return message.content
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .filter((text) => text.length > 0)
    .join('\n');
}

/**
 * Whether a run may open an input channel at all.
 *
 * The kill switch exists because this is the one code path that can leak an
 * operating-system process: setting `DMAKER_DISABLE_MESSAGE_INJECTION=true`
 * puts every run back on the plain string prompt, where the SDK closes stdin
 * itself, without a rebuild or a code change.
 */
export function messageInjectionEnabled(): boolean {
  return process.env.DMAKER_DISABLE_MESSAGE_INJECTION !== 'true';
}
