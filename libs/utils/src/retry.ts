/**
 * Retry utility with exponential backoff for transient errors
 *
 * Provides a configurable retry mechanism targeting transient failures:
 * - HTTP 502 Bad Gateway
 * - HTTP 503 Service Unavailable
 * - Network connectivity errors (ECONNREFUSED, ENOTFOUND, ECONNRESET, ETIMEDOUT)
 * - Timeout errors
 *
 * Uses exponential backoff with jitter to avoid thundering herd problems.
 */

import { createLogger } from './logger.js';

const logger = createLogger('Retry');

/**
 * Sleep for a given duration with optional abort signal support
 */
function delay_(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Retry aborted'));
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    let onAbort: (() => void) | undefined;

    const cleanup = () => {
      clearTimeout(timer);
      if (onAbort && signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    if (signal) {
      onAbort = () => {
        cleanup();
        reject(new Error('Retry aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Configuration options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds before first retry (default: 1000) */
  baseDelay?: number;
  /** Maximum delay in milliseconds between retries (default: 30000) */
  maxDelay?: number;
  /** Custom function to determine if an error is retryable (overrides default) */
  shouldRetry?: (error: unknown) => boolean;
  /** Called before each retry with attempt info */
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
  /** AbortSignal to cancel retries */
  signal?: AbortSignal;
}

/**
 * Result of a retry operation with metadata
 */
export interface RetryResult<T> {
  /** The successful result value */
  data: T;
  /** Number of retry attempts made (0 if succeeded on first try) */
  attempts: number;
  /** Total time spent in milliseconds (including delays) */
  totalTime: number;
}

/** Network-level error codes that indicate transient failures */
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/** HTTP status codes that indicate transient server errors */
const TRANSIENT_HTTP_STATUS_CODES = new Set([502, 503, 429]);

/** Error message patterns that indicate transient failures */
const TRANSIENT_MESSAGE_PATTERNS: RegExp[] = [
  /\b502\b/,
  /\b503\b/,
  /bad gateway/i,
  /service unavailable/i,
  /temporarily unavailable/i,
  /network.*(?:error|fail)/i,
  /(?:error|fail).*network/i,
  /connection.*(?:refused|reset|timed?\s*out|closed)/i,
  /(?:request|socket|connection).*timed?\s*out/i,
  /dns.*(?:error|fail|lookup)/i,
  /fetch failed/i,
  /ECONNREFUSED/,
  /ECONNRESET/,
  /ENOTFOUND/,
  /ETIMEDOUT/,
];

/**
 * Check if an error represents a transient failure that should be retried
 *
 * Detects transient errors by checking:
 * 1. Error `code` property for known network error codes
 * 2. Error `status`/`statusCode` for HTTP 502, 503, 429
 * 3. Error message content for transient failure patterns
 *
 * Explicitly excludes non-transient errors:
 * - Authentication errors (401, 403)
 * - Client errors (400, 404, 422)
 * - Billing/quota errors
 * - Abort/cancellation errors
 *
 * @param error - The error to check
 * @returns True if the error is a transient failure suitable for retry
 *
 * @example
 * ```typescript
 * try {
 *   await fetch('https://api.example.com/data');
 * } catch (error) {
 *   if (isTransientError(error)) {
 *     // Safe to retry
 *   }
 * }
 * ```
 */
export function isTransientError(error: unknown): boolean {
  if (!error) return false;

  // Never retry abort errors
  if (error instanceof Error && error.name === 'AbortError') {
    return false;
  }

  // Check error code property (Node.js system errors)
  const errorCode = (error as { code?: string }).code;
  if (errorCode && TRANSIENT_NETWORK_CODES.has(errorCode)) {
    return true;
  }

  // Check HTTP status code properties
  const status =
    (error as { status?: number }).status ?? (error as { statusCode?: number }).statusCode;

  if (status !== undefined) {
    if (TRANSIENT_HTTP_STATUS_CODES.has(status)) {
      return true;
    }
    // Explicitly non-retryable HTTP status codes
    if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
      return false;
    }
  }

  // Check error message patterns
  const message = error instanceof Error ? error.message : String(error);
  for (const pattern of TRANSIENT_MESSAGE_PATTERNS) {
    if (pattern.test(message)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate the delay for a retry attempt using exponential backoff with jitter
 *
 * Uses the "full jitter" strategy: delay = random(0, min(maxDelay, baseDelay * 2^attempt))
 * This provides better distribution than fixed exponential backoff and reduces
 * thundering herd effects when many clients retry simultaneously.
 *
 * @param attempt - The retry attempt number (0-based)
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay cap in milliseconds
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number
): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  // Full jitter: random between 50% and 100% of the capped delay
  // Using 50% minimum ensures we don't get zero-length delays
  const jitter = 0.5 + Math.random() * 0.5;
  return Math.floor(cappedDelay * jitter);
}

/**
 * Execute an async operation with automatic retry on transient errors
 *
 * Retries the operation on transient errors (502, 503, network errors) using
 * exponential backoff with jitter. Non-transient errors (auth, validation, etc.)
 * are thrown immediately without retry.
 *
 * @param operation - The async function to execute
 * @param options - Configuration for retry behavior
 * @returns The result of the successful operation
 * @throws The last error if all retries are exhausted, or a non-retryable error
 *
 * @example
 * ```typescript
 * // Basic usage
 * const data = await retryWithBackoff(() => fetchFromApi('/data'));
 *
 * // With custom options
 * const data = await retryWithBackoff(
 *   () => fetchFromApi('/data'),
 *   {
 *     maxRetries: 5,
 *     baseDelay: 2000,
 *     onRetry: (err, attempt, delay) => {
 *       console.log(`Retry ${attempt} in ${delay}ms: ${err}`);
 *     },
 *   }
 * );
 *
 * // With abort signal
 * const controller = new AbortController();
 * const data = await retryWithBackoff(
 *   () => fetchFromApi('/data'),
 *   { signal: controller.signal }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30_000,
    shouldRetry = isTransientError,
    onRetry,
    signal,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check for abort before each attempt
    if (signal?.aborted) {
      throw new Error('Retry aborted');
    }

    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry if we've exhausted attempts or error isn't retryable
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const delay = calculateBackoffDelay(attempt, baseDelay, maxDelay);

      // Notify callback before waiting
      if (onRetry) {
        onRetry(error, attempt + 1, delay);
      }

      logger.debug(
        `Transient error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
        {
          error: error instanceof Error ? error.message : String(error),
          attempt: attempt + 1,
          maxRetries,
          delay,
        }
      );

      // Wait with abort support
      await delay_(delay, signal);
    }
  }

  // This should be unreachable, but TypeScript needs it
  throw lastError;
}

/**
 * Execute an async operation with retry and return detailed result metadata
 *
 * Same as {@link retryWithBackoff} but returns additional metadata about the
 * retry process including number of attempts and total elapsed time.
 *
 * @param operation - The async function to execute
 * @param options - Configuration for retry behavior
 * @returns Result object with data, attempts count, and total time
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoffResult(() => fetchFromApi('/data'));
 * console.log(`Succeeded after ${result.attempts} retries in ${result.totalTime}ms`);
 * ```
 */
export async function retryWithBackoffResult<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let attempts = 0;

  const wrappedOnRetry = (error: unknown, attempt: number, delay: number) => {
    attempts = attempt;
    options.onRetry?.(error, attempt, delay);
  };

  const data = await retryWithBackoff(operation, {
    ...options,
    onRetry: wrappedOnRetry,
  });

  return {
    data,
    attempts,
    totalTime: Date.now() - startTime,
  };
}
