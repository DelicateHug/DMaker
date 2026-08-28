import { describe, it, expect, vi } from 'vitest';
import {
  AgentInputChannel,
  agentInputMessageText,
  messageInjectionEnabled,
} from '@/lib/agent-input-channel.js';
import type { AgentInputMessage } from '@dmaker/types';

/**
 * This object decides when an ~11MB CLI child process exits. Every case below
 * is really one question: does the iterable complete when it should, and does
 * it stay open while a turn is still owed? "Completes" is asserted through the
 * iterator itself (`done: true`), not through a flag, because the iterator
 * completing is what actually closes the child's stdin.
 */
describe('agent-input-channel.ts', () => {
  /** Consume like the SDK does: pull the next message and park on it. */
  function consumer(channel: AgentInputChannel) {
    const iterator = channel[Symbol.asyncIterator]();
    return {
      next: () => iterator.next(),
    };
  }

  /** Resolve to true only if the promise settles within a macrotask or two. */
  async function settled<T>(promise: Promise<T>): Promise<boolean> {
    const marker = Symbol('pending');
    const result = await Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve(marker), 5)),
    ]);
    return result !== marker;
  }

  it('hands a pushed message to the parked consumer', async () => {
    const channel = new AgentInputChannel();
    const pull = consumer(channel).next();

    expect(channel.push('keep the tests passing')).toBe(true);

    await expect(pull).resolves.toEqual({
      done: false,
      value: { content: 'keep the tests passing' },
    });
    expect(channel.delivered).toBe(1);
  });

  it('queues messages pushed before the consumer asks, in order', async () => {
    const channel = new AgentInputChannel();
    channel.push('first');
    channel.push('second');
    expect(channel.pendingCount).toBe(2);

    const reader = consumer(channel);
    await expect(reader.next()).resolves.toMatchObject({ value: { content: 'first' } });
    await expect(reader.next()).resolves.toMatchObject({ value: { content: 'second' } });
    expect(channel.pendingCount).toBe(0);
  });

  it('stays open on an empty queue before any result', async () => {
    // The whole reason for turn accounting: the SDK calls next() the instant it
    // has consumed a message, long before the first token streams back. A
    // "close when the queue is empty" rule would fire here and kill the run.
    const channel = new AgentInputChannel();
    const pull = consumer(channel).next();

    expect(await settled(pull)).toBe(false);
    expect(channel.isClosed).toBe(false);

    channel.close();
    await expect(pull).resolves.toEqual({ done: true, value: undefined });
  });

  it('closes on the first result when nothing was injected', async () => {
    // This is the string-prompt auto-close reproduced by hand: one prompt, one
    // result, stdin closes.
    const channel = new AgentInputChannel();
    const pull = consumer(channel).next();

    channel.noteResult();

    expect(channel.isClosed).toBe(true);
    await expect(pull).resolves.toEqual({ done: true, value: undefined });
  });

  it('does not close on the result of the turn a queued message is waiting behind', async () => {
    const channel = new AgentInputChannel();
    channel.push('one more thing');

    // Result #1 belongs to the initial prompt; the injected turn has not run.
    channel.noteResult();
    expect(channel.isClosed).toBe(false);

    const reader = consumer(channel);
    await expect(reader.next()).resolves.toMatchObject({ value: { content: 'one more thing' } });

    // Still open: the injected turn is in flight and owes us a result.
    const pull = reader.next();
    expect(await settled(pull)).toBe(false);

    channel.noteResult();
    expect(channel.isClosed).toBe(true);
    await expect(pull).resolves.toEqual({ done: true, value: undefined });
  });

  it('closes on a result of any subtype', () => {
    // error_max_turns ends the session exactly as success does. A channel that
    // only counted successes would hold the process open forever.
    const channel = new AgentInputChannel();
    channel.noteResult();
    expect(channel.isClosed).toBe(true);
  });

  it('refuses a message once closed rather than swallowing it', () => {
    const channel = new AgentInputChannel();
    channel.close();

    expect(channel.push('too late')).toBe(false);
    expect(channel.injected).toBe(0);
  });

  it('is idempotent to close and ignores results afterwards', () => {
    const onClose = vi.fn();
    const channel = new AgentInputChannel({ onClose });

    channel.close();
    channel.close('turns_settled');
    channel.noteResult();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('run_ended');
    expect(channel.resultsSeen).toBe(0);
  });

  it('reports why it closed', async () => {
    const onClose = vi.fn();
    const channel = new AgentInputChannel({ onClose });
    consumer(channel).next();

    channel.noteResult();

    expect(onClose).toHaveBeenCalledWith('turns_settled');
  });

  it('announces a message at the moment it is handed over, once', async () => {
    const onDeliver = vi.fn();
    const channel = new AgentInputChannel({ onDeliver });

    channel.push('queued first');
    expect(onDeliver).not.toHaveBeenCalled();

    const reader = consumer(channel);
    await reader.next();
    expect(onDeliver).toHaveBeenCalledTimes(1);
    expect(onDeliver).toHaveBeenCalledWith({ content: 'queued first' });

    const pull = reader.next();
    channel.push('handed straight over');
    await pull;
    expect(onDeliver).toHaveBeenCalledTimes(2);
    expect(onDeliver).toHaveBeenLastCalledWith({ content: 'handed straight over' });
  });

  it('survives a throwing onDeliver handler', async () => {
    const channel = new AgentInputChannel({
      onDeliver: () => {
        throw new Error('transcript write blew up');
      },
    });
    channel.push('still delivered');

    await expect(consumer(channel).next()).resolves.toMatchObject({
      value: { content: 'still delivered' },
    });
  });

  it('drops anything still queued when the run ends', async () => {
    const channel = new AgentInputChannel();
    channel.push('never read');

    channel.close();

    expect(channel.pendingCount).toBe(0);
    await expect(consumer(channel).next()).resolves.toEqual({ done: true, value: undefined });
  });

  it('gives a second consumer nothing instead of splitting the stream', async () => {
    // Whoever pulls first owns the channel; a second reader would take half the
    // messages and neither session would get a complete conversation. It is
    // refused by ending, never by throwing into the SDK's stdin writer loop.
    const channel = new AgentInputChannel();
    const owner = consumer(channel);
    const pull = owner.next();

    await expect(consumer(channel).next()).resolves.toEqual({ done: true, value: undefined });

    channel.push('for the real consumer');
    await expect(pull).resolves.toMatchObject({ value: { content: 'for the real consumer' } });
  });

  it('closes itself when a consumer holding a message walks away', async () => {
    // An aborted query calls return() on the generator reading the channel.
    // Nothing will ever read it again, so a later push must say so.
    //
    // NOTE the limit this pins: return() only takes effect where the generator
    // is suspended at a `yield`. A consumer parked on `next()` with an empty
    // queue cannot be released this way at all — which is exactly why the run's
    // `finally` calling close() is the guarantee and this is only a courtesy.
    const channel = new AgentInputChannel();
    const iterator = channel[Symbol.asyncIterator]();
    channel.push('read this one');
    await iterator.next();

    await iterator.return?.(undefined as never);

    expect(channel.isClosed).toBe(true);
    expect(channel.push('nobody is listening')).toBe(false);
  });

  describe('agentInputMessageText', () => {
    it('returns a string body unchanged', () => {
      expect(agentInputMessageText({ content: 'plain text' })).toBe('plain text');
    });

    it('joins the text blocks of a multi-part body and skips the rest', () => {
      const message: AgentInputMessage = {
        content: [
          { type: 'text', text: 'look at this' },
          { type: 'image', source: {} },
          { type: 'text', text: 'and this' },
        ],
      };

      expect(agentInputMessageText(message)).toBe('look at this\nand this');
    });
  });

  describe('messageInjectionEnabled', () => {
    it('is on by default and off behind the kill switch', () => {
      const original = process.env.DMAKER_DISABLE_MESSAGE_INJECTION;
      try {
        delete process.env.DMAKER_DISABLE_MESSAGE_INJECTION;
        expect(messageInjectionEnabled()).toBe(true);

        process.env.DMAKER_DISABLE_MESSAGE_INJECTION = 'true';
        expect(messageInjectionEnabled()).toBe(false);
      } finally {
        if (original === undefined) delete process.env.DMAKER_DISABLE_MESSAGE_INJECTION;
        else process.env.DMAKER_DISABLE_MESSAGE_INJECTION = original;
      }
    });
  });
});
