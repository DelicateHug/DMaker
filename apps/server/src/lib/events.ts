/**
 * Event emitter for streaming events to WebSocket clients
 */

import type { EventType, EventCallback } from '@automaker/types';
import { createLogger } from '@automaker/utils';

const logger = createLogger('Events');

// Re-export event types from shared package
export type { EventType, EventCallback };

export interface EventEmitter {
  emit: (type: EventType, payload: unknown) => void;
  subscribe: (callback: EventCallback) => () => void;
}

export function createEventEmitter(): EventEmitter {
  const subscribers = new Set<EventCallback>();

  return {
    emit(type: EventType, payload: unknown) {
      for (const callback of subscribers) {
        try {
          callback(type, payload);
        } catch (error) {
          logger.error('Error in event subscriber:', error);
        }
      }
    },

    subscribe(callback: EventCallback) {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    },
  };
}

/**
 * Throttle configuration for high-frequency event types.
 * Events not listed here pass through immediately.
 *
 * For `auto-mode:event` the throttle key is determined by the nested
 * payload `type` field (e.g. `auto_mode_progress`).
 */
export interface ThrottleConfig {
  /** Minimum interval in ms between forwarded events for this key */
  intervalMs: number;
  /** If true, accumulate the `content` field across throttled payloads instead of replacing */
  accumulateContent?: boolean;
}

/** Default throttle rules keyed by event sub-type */
const DEFAULT_THROTTLE_RULES: Record<string, ThrottleConfig> = {
  // High-frequency streaming events — cap at 5/sec
  // accumulateContent ensures text fragments are concatenated rather than dropped
  auto_mode_progress: { intervalMs: 200, accumulateContent: true },
  // Tool-use events — cap at 10/sec
  auto_mode_tool: { intervalMs: 100 },
};

/** Event sub-types that must never be throttled */
const NEVER_THROTTLE: Set<string> = new Set([
  'auto_mode_feature_complete',
  'auto_mode_error',
  'plan_approval_required',
  'auto_mode_feature_start',
  'auto_mode_task_started',
  'auto_mode_task_complete',
  'auto_mode_phase',
  'auto_mode_stopped',
]);

/**
 * Resolve the throttle key for a given event.
 * Returns `null` if the event should never be throttled.
 * Returns the sub-type string if a throttle rule applies.
 */
function getThrottleKey(type: EventType, payload: unknown): string | null {
  if (type === 'auto-mode:event' && payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    const subType = obj.type as string | undefined;
    if (subType) {
      if (NEVER_THROTTLE.has(subType)) return null;
      if (subType in DEFAULT_THROTTLE_RULES) {
        // For content-accumulating events, key by featureId so concurrent
        // features don't mix their content in the same throttle bucket
        const featureId = obj.featureId as string | undefined;
        return featureId ? `${subType}:${featureId}` : subType;
      }
    }
  }
  return null;
}

/**
 * Creates a per-connection throttled callback that wraps an EventCallback.
 *
 * - Events that match a throttle rule are rate-limited using a trailing-edge
 *   strategy: the latest payload is always preserved and flushed after the
 *   throttle interval expires. This ensures the final state is never lost.
 * - Events in `NEVER_THROTTLE` and events with no matching rule pass through
 *   immediately.
 *
 * Call the returned `cleanup` function when the connection closes to flush
 * any pending trailing events and clear timers.
 */
export function createThrottledCallback(callback: EventCallback): {
  throttled: EventCallback;
  cleanup: () => void;
} {
  /** Per-key state for trailing-edge throttle */
  const throttleState = new Map<
    string,
    {
      lastSent: number;
      pendingPayload: unknown | null;
      timer: ReturnType<typeof setTimeout> | null;
    }
  >();

  const throttled: EventCallback = (type, payload) => {
    const key = getThrottleKey(type, payload);

    // No throttle rule — pass through immediately
    if (key === null) {
      callback(type, payload);
      return;
    }

    // Extract the base sub-type from compound keys like "auto_mode_progress:featureId"
    const baseKey = key.includes(':') ? key.split(':')[0] : key;
    const config = DEFAULT_THROTTLE_RULES[baseKey];
    if (!config) {
      callback(type, payload);
      return;
    }

    const now = Date.now();
    let state = throttleState.get(key);

    if (!state) {
      state = { lastSent: 0, pendingPayload: null, timer: null };
      throttleState.set(key, state);
    }

    const elapsed = now - state.lastSent;

    if (elapsed >= config.intervalMs) {
      // Enough time has passed — send immediately
      state.lastSent = now;
      state.pendingPayload = null;
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      callback(type, payload);
    } else {
      // Within throttle window — buffer the payload
      if (config.accumulateContent && payload && typeof payload === 'object') {
        if (state.pendingPayload !== null) {
          // Accumulate content: concatenate the `content` field from successive payloads
          // so no streaming text fragments are lost during the throttle window
          const prev = state.pendingPayload as Record<string, unknown>;
          const curr = payload as Record<string, unknown>;
          if (typeof prev.content === 'string' && typeof curr.content === 'string') {
            prev.content = prev.content + curr.content;
          } else {
            state.pendingPayload = { ...(payload as Record<string, unknown>) };
          }
        } else {
          // First buffered event in this window — shallow copy to avoid mutating the original
          state.pendingPayload = { ...(payload as Record<string, unknown>) };
        }
      } else {
        state.pendingPayload = payload;
      }

      // Schedule a trailing-edge flush if not already scheduled
      if (!state.timer) {
        const remaining = config.intervalMs - elapsed;
        state.timer = setTimeout(() => {
          if (state!.pendingPayload !== null) {
            state!.lastSent = Date.now();
            const pending = state!.pendingPayload;
            state!.pendingPayload = null;
            state!.timer = null;
            callback(type, pending);
          } else {
            state!.timer = null;
          }
        }, remaining);
      }
    }
  };

  const cleanup = () => {
    // Flush any pending trailing payloads and clear timers
    for (const [, state] of throttleState) {
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      // Don't flush on cleanup — connection is closing
    }
    throttleState.clear();
  };

  return { throttled, cleanup };
}
