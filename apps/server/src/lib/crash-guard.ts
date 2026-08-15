/**
 * Crash guard
 *
 * Some operations spawn external subprocesses we don't fully control — most
 * notably the Claude Agent SDK's `query()`, which forks the `claude` CLI. If
 * that subprocess emits an error event outside of the awaited stream, Node
 * surfaces it as an `uncaughtException`, and the global handler in `index.ts`
 * responds by calling `process.exit(1)` — taking the whole server down and
 * causing in-flight client requests to fail with a bare "Failed to fetch".
 *
 * `runWithCrashSuppression()` marks a scope during which the global handlers
 * log such errors instead of exiting, so a stray subprocess error degrades to
 * a normal failed request rather than a server crash. The global safety net is
 * left fully intact for all other code paths.
 */

import { createLogger } from '@dmaker/utils';

const logger = createLogger('CrashGuard');

let suppressionDepth = 0;

/**
 * Whether a crash-suppressed operation is currently running.
 * Consulted by the global `uncaughtException` handler in `index.ts`.
 */
export function isCrashSuppressionActive(): boolean {
  return suppressionDepth > 0;
}

/**
 * Run `operation` with process-level crash suppression active.
 *
 * While the returned promise is pending, an uncaught exception (e.g. a stray
 * error from a spawned subprocess) is logged and swallowed by the global
 * handler instead of terminating the process. Suppression is reference-counted
 * so concurrent guarded operations compose safely, and is always released even
 * if `operation` throws.
 */
export async function runWithCrashSuppression<T>(operation: () => Promise<T>): Promise<T> {
  suppressionDepth += 1;
  try {
    return await operation();
  } finally {
    suppressionDepth -= 1;
    if (suppressionDepth < 0) {
      // Should never happen; guard against accounting bugs leaving it negative.
      logger.warn('Crash suppression depth went negative; resetting to 0');
      suppressionDepth = 0;
    }
  }
}
