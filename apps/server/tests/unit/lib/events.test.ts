import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventEmitter, createThrottledCallback, type EventType } from '@/lib/events.js';

describe('events.ts', () => {
  describe('createEventEmitter', () => {
    it('should emit events to single subscriber', () => {
      const emitter = createEventEmitter();
      const callback = vi.fn();

      emitter.subscribe(callback);
      emitter.emit('agent:stream', { message: 'test' });

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith('agent:stream', { message: 'test' });
    });

    it('should emit events to multiple subscribers', () => {
      const emitter = createEventEmitter();
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      emitter.subscribe(callback1);
      emitter.subscribe(callback2);
      emitter.subscribe(callback3);
      emitter.emit('feature:started', { id: '123' });

      expect(callback1).toHaveBeenCalledOnce();
      expect(callback2).toHaveBeenCalledOnce();
      expect(callback3).toHaveBeenCalledOnce();
      expect(callback1).toHaveBeenCalledWith('feature:started', { id: '123' });
    });

    it('should support unsubscribe functionality', () => {
      const emitter = createEventEmitter();
      const callback = vi.fn();

      const unsubscribe = emitter.subscribe(callback);
      emitter.emit('agent:stream', { test: 1 });

      expect(callback).toHaveBeenCalledOnce();

      unsubscribe();
      emitter.emit('agent:stream', { test: 2 });

      expect(callback).toHaveBeenCalledOnce(); // Still called only once
    });

    it('should handle errors in subscribers without crashing', () => {
      const emitter = createEventEmitter();
      const errorCallback = vi.fn(() => {
        throw new Error('Subscriber error');
      });
      const normalCallback = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      emitter.subscribe(errorCallback);
      emitter.subscribe(normalCallback);

      expect(() => {
        emitter.emit('feature:error', { error: 'test' });
      }).not.toThrow();

      expect(errorCallback).toHaveBeenCalledOnce();
      expect(normalCallback).toHaveBeenCalledOnce();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should emit different event types', () => {
      const emitter = createEventEmitter();
      const callback = vi.fn();

      emitter.subscribe(callback);

      const eventTypes: EventType[] = [
        'agent:stream',
        'auto-mode:started',
        'feature:completed',
        'project:analysis-progress',
      ];

      eventTypes.forEach((type) => {
        emitter.emit(type, { type });
      });

      expect(callback).toHaveBeenCalledTimes(4);
    });

    it('should handle emitting without subscribers', () => {
      const emitter = createEventEmitter();

      expect(() => {
        emitter.emit('agent:stream', { test: true });
      }).not.toThrow();
    });

    it('should allow multiple subscriptions and unsubscriptions', () => {
      const emitter = createEventEmitter();
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      const unsub1 = emitter.subscribe(callback1);
      const unsub2 = emitter.subscribe(callback2);
      const unsub3 = emitter.subscribe(callback3);

      emitter.emit('feature:started', { test: 1 });
      expect(callback1).toHaveBeenCalledOnce();
      expect(callback2).toHaveBeenCalledOnce();
      expect(callback3).toHaveBeenCalledOnce();

      unsub2();

      emitter.emit('feature:started', { test: 2 });
      expect(callback1).toHaveBeenCalledTimes(2);
      expect(callback2).toHaveBeenCalledOnce(); // Still just once
      expect(callback3).toHaveBeenCalledTimes(2);

      unsub1();
      unsub3();

      emitter.emit('feature:started', { test: 3 });
      expect(callback1).toHaveBeenCalledTimes(2);
      expect(callback2).toHaveBeenCalledOnce();
      expect(callback3).toHaveBeenCalledTimes(2);
    });
  });

  describe('createThrottledCallback', () => {
    /** Build an `auto-mode:event` payload of the given sub-type. */
    const event = (type: string, fields: Record<string, unknown>): Record<string, unknown> => ({
      type,
      ...fields,
    });

    /** The payloads actually forwarded to the wrapped callback, in order. */
    const forwarded = (callback: ReturnType<typeof vi.fn>): Record<string, unknown>[] =>
      callback.mock.calls.map((call) => call[1] as Record<string, unknown>);

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should pass unthrottled event types through immediately', () => {
      const callback = vi.fn();
      const { throttled, cleanup } = createThrottledCallback(callback);

      throttled('agent:stream', { message: 'one' });
      throttled('agent:stream', { message: 'two' });

      expect(callback).toHaveBeenCalledTimes(2);
      cleanup();
    });

    it('should never coalesce the agent-tree events', () => {
      const callback = vi.fn();
      const { throttled, cleanup } = createThrottledCallback(callback);

      // Three of each, back to back in the same tick. A spawn event lost here
      // is a node that never appears in the tree.
      for (let i = 0; i < 3; i++) {
        throttled(
          'auto-mode:event',
          event('auto_mode_subagent_started', { featureId: 'f1', agentId: `sub-${i}` })
        );
        throttled(
          'auto-mode:event',
          event('auto_mode_subagent_finished', { featureId: 'f1', agentId: `sub-${i}` })
        );
        throttled('auto-mode:event', event('auto_mode_agent_tree', { featureId: 'f1' }));
      }

      expect(callback).toHaveBeenCalledTimes(9);
      cleanup();
    });

    it('should still throttle progress events that carry an agentId', () => {
      const callback = vi.fn();
      const { throttled, cleanup } = createThrottledCallback(callback);

      // Guards the `baseKey` split: if the extra colon broke the rule lookup,
      // every event would fall through and be forwarded synchronously.
      const payload = { featureId: 'f1', agentId: 'master', content: 'x' };
      throttled('auto-mode:event', event('auto_mode_progress', payload));
      throttled('auto-mode:event', event('auto_mode_progress', payload));
      throttled('auto-mode:event', event('auto_mode_progress', payload));

      expect(callback).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(250);
      expect(callback).toHaveBeenCalledTimes(2);
      cleanup();
    });

    it('should not splice two agents of one feature into a single payload', () => {
      const callback = vi.fn();
      const { throttled, cleanup } = createThrottledCallback(callback);

      const progress = (agentId: string, content: string) =>
        throttled(
          'auto-mode:event',
          event('auto_mode_progress', { featureId: 'f1', agentId, content })
        );

      // Opens each agent's window
      progress('master', 'A');
      progress('sub-1', 'X');
      expect(callback).toHaveBeenCalledTimes(2);

      // Buffered, interleaved as they would arrive from two live streams
      progress('master', 'B');
      progress('sub-1', 'Y');
      progress('master', 'C');
      progress('sub-1', 'Z');
      expect(callback).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(250);

      const flushed = forwarded(callback).slice(2);
      expect(flushed).toEqual([
        expect.objectContaining({ agentId: 'master', content: 'BC' }),
        expect.objectContaining({ agentId: 'sub-1', content: 'YZ' }),
      ]);
      cleanup();
    });

    it('should not let one agent replace another in the non-accumulating rules', () => {
      const callback = vi.fn();
      const { throttled, cleanup } = createThrottledCallback(callback);

      const tool = (agentId: string, toolUseId: string) =>
        throttled(
          'auto-mode:event',
          event('auto_mode_tool', { featureId: 'f1', agentId, toolUseId })
        );

      tool('master', 't1');
      tool('sub-1', 't2');

      // Buffered. Sharing a bucket, the sub-agent's call would overwrite the
      // master's pending payload and `t3` would never reach the client.
      tool('master', 't3');
      tool('sub-1', 't4');

      vi.advanceTimersByTime(150);

      expect(forwarded(callback).map((p) => p.toolUseId)).toEqual(['t1', 't2', 't3', 't4']);
      cleanup();
    });

    it('should keep the feature-only key for events with no agentId', () => {
      const callback = vi.fn();
      const { throttled, cleanup } = createThrottledCallback(callback);

      const progress = (content: string) =>
        throttled('auto-mode:event', event('auto_mode_progress', { featureId: 'f1', content }));

      progress('A');
      progress('B');
      progress('C');

      vi.advanceTimersByTime(250);

      // Unattributed emits (pipeline steps, spec regeneration, every session
      // recorded before attribution existed) must accumulate exactly as before.
      expect(forwarded(callback)).toEqual([
        expect.objectContaining({ content: 'A' }),
        expect.objectContaining({ content: 'BC' }),
      ]);
      cleanup();
    });

    it('should keep concurrent features in separate buckets', () => {
      const callback = vi.fn();
      const { throttled, cleanup } = createThrottledCallback(callback);

      const progress = (featureId: string, content: string) =>
        throttled('auto-mode:event', event('auto_mode_progress', { featureId, content }));

      progress('f1', 'A');
      progress('f2', 'X');
      progress('f1', 'B');
      progress('f2', 'Y');

      vi.advanceTimersByTime(250);

      expect(forwarded(callback).slice(2)).toEqual([
        expect.objectContaining({ featureId: 'f1', content: 'B' }),
        expect.objectContaining({ featureId: 'f2', content: 'Y' }),
      ]);
      cleanup();
    });

    it('should not flush pending payloads after cleanup', () => {
      const callback = vi.fn();
      const { throttled, cleanup } = createThrottledCallback(callback);

      const progress = (content: string) =>
        throttled(
          'auto-mode:event',
          event('auto_mode_progress', { featureId: 'f1', agentId: 'master', content })
        );

      progress('A');
      progress('B');
      expect(callback).toHaveBeenCalledOnce();

      // The connection is closing — a trailing flush would write to a dead socket
      cleanup();
      vi.advanceTimersByTime(500);

      expect(callback).toHaveBeenCalledOnce();
    });
  });
});
