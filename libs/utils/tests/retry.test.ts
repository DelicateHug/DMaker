import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isTransientError,
  calculateBackoffDelay,
  retryWithBackoff,
  retryWithBackoffResult,
} from '../src/retry';

describe('retry.ts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isTransientError', () => {
    describe('HTTP status codes', () => {
      it('should return true for 502 Bad Gateway', () => {
        const error = Object.assign(new Error('Bad Gateway'), { status: 502 });
        expect(isTransientError(error)).toBe(true);
      });

      it('should return true for 503 Service Unavailable', () => {
        const error = Object.assign(new Error('Service Unavailable'), { status: 503 });
        expect(isTransientError(error)).toBe(true);
      });

      it('should return true for 429 Too Many Requests', () => {
        const error = Object.assign(new Error('Too Many Requests'), { status: 429 });
        expect(isTransientError(error)).toBe(true);
      });

      it('should return true for statusCode property', () => {
        const error = Object.assign(new Error('Bad Gateway'), { statusCode: 502 });
        expect(isTransientError(error)).toBe(true);
      });

      it('should return false for 400 Bad Request', () => {
        const error = Object.assign(new Error('Bad Request'), { status: 400 });
        expect(isTransientError(error)).toBe(false);
      });

      it('should return false for 401 Unauthorized', () => {
        const error = Object.assign(new Error('Unauthorized'), { status: 401 });
        expect(isTransientError(error)).toBe(false);
      });

      it('should return false for 403 Forbidden', () => {
        const error = Object.assign(new Error('Forbidden'), { status: 403 });
        expect(isTransientError(error)).toBe(false);
      });

      it('should return false for 404 Not Found', () => {
        const error = Object.assign(new Error('Not Found'), { status: 404 });
        expect(isTransientError(error)).toBe(false);
      });

      it('should return false for 422 Unprocessable Entity', () => {
        const error = Object.assign(new Error('Unprocessable Entity'), { status: 422 });
        expect(isTransientError(error)).toBe(false);
      });
    });

    describe('network error codes', () => {
      it('should return true for ECONNREFUSED', () => {
        const error = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
        expect(isTransientError(error)).toBe(true);
      });

      it('should return true for ECONNRESET', () => {
        const error = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
        expect(isTransientError(error)).toBe(true);
      });

      it('should return true for ENOTFOUND', () => {
        const error = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
        expect(isTransientError(error)).toBe(true);
      });

      it('should return true for ETIMEDOUT', () => {
        const error = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
        expect(isTransientError(error)).toBe(true);
      });

      it('should return true for EPIPE', () => {
        const error = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
        expect(isTransientError(error)).toBe(true);
      });

      it('should return true for EAI_AGAIN', () => {
        const error = Object.assign(new Error('getaddrinfo EAI_AGAIN'), { code: 'EAI_AGAIN' });
        expect(isTransientError(error)).toBe(true);
      });

      it('should return true for EHOSTUNREACH', () => {
        const error = Object.assign(new Error('connect EHOSTUNREACH'), {
          code: 'EHOSTUNREACH',
        });
        expect(isTransientError(error)).toBe(true);
      });

      it('should return true for ENETUNREACH', () => {
        const error = Object.assign(new Error('connect ENETUNREACH'), { code: 'ENETUNREACH' });
        expect(isTransientError(error)).toBe(true);
      });

      it('should return true for UND_ERR_CONNECT_TIMEOUT', () => {
        const error = Object.assign(new Error('Connect Timeout Error'), {
          code: 'UND_ERR_CONNECT_TIMEOUT',
        });
        expect(isTransientError(error)).toBe(true);
      });

      it('should return true for UND_ERR_SOCKET', () => {
        const error = Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' });
        expect(isTransientError(error)).toBe(true);
      });
    });

    describe('error message patterns', () => {
      it('should return true for "502" in message', () => {
        expect(isTransientError(new Error('HTTP 502 response'))).toBe(true);
      });

      it('should return true for "503" in message', () => {
        expect(isTransientError(new Error('HTTP 503 response'))).toBe(true);
      });

      it('should return true for "bad gateway" in message', () => {
        expect(isTransientError(new Error('Bad Gateway error'))).toBe(true);
      });

      it('should return true for "service unavailable" in message', () => {
        expect(isTransientError(new Error('Service Unavailable'))).toBe(true);
      });

      it('should return true for "temporarily unavailable" in message', () => {
        expect(isTransientError(new Error('Server temporarily unavailable'))).toBe(true);
      });

      it('should return true for network error messages', () => {
        expect(isTransientError(new Error('network error occurred'))).toBe(true);
        expect(isTransientError(new Error('Network failure'))).toBe(true);
      });

      it('should return true for connection errors in messages', () => {
        expect(isTransientError(new Error('connection refused'))).toBe(true);
        expect(isTransientError(new Error('connection reset by peer'))).toBe(true);
        expect(isTransientError(new Error('connection timed out'))).toBe(true);
        expect(isTransientError(new Error('connection timeout'))).toBe(true);
        expect(isTransientError(new Error('connection closed unexpectedly'))).toBe(true);
      });

      it('should return true for timeout messages', () => {
        expect(isTransientError(new Error('request timed out'))).toBe(true);
        expect(isTransientError(new Error('socket timeout'))).toBe(true);
      });

      it('should return true for DNS errors in messages', () => {
        expect(isTransientError(new Error('dns lookup failed'))).toBe(true);
        expect(isTransientError(new Error('DNS error resolving host'))).toBe(true);
      });

      it('should return true for fetch failed', () => {
        expect(isTransientError(new Error('fetch failed'))).toBe(true);
      });

      it('should return true for ECONNREFUSED in message', () => {
        expect(isTransientError(new Error('connect ECONNREFUSED 127.0.0.1:3000'))).toBe(true);
      });

      it('should return true for ECONNRESET in message', () => {
        expect(isTransientError(new Error('read ECONNRESET'))).toBe(true);
      });

      it('should return true for ENOTFOUND in message', () => {
        expect(isTransientError(new Error('getaddrinfo ENOTFOUND api.example.com'))).toBe(true);
      });

      it('should return true for ETIMEDOUT in message', () => {
        expect(isTransientError(new Error('connect ETIMEDOUT'))).toBe(true);
      });

      it('should not match 502 embedded in longer numbers', () => {
        // \b word boundary ensures we don't match "15020"
        expect(isTransientError(new Error('Error code 15020'))).toBe(false);
      });
    });

    describe('non-retryable errors', () => {
      it('should return false for AbortError', () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        expect(isTransientError(error)).toBe(false);
      });

      it('should return false for null/undefined', () => {
        expect(isTransientError(null)).toBe(false);
        expect(isTransientError(undefined)).toBe(false);
      });

      it('should return false for generic errors', () => {
        expect(isTransientError(new Error('Something went wrong'))).toBe(false);
      });

      it('should return false for validation errors', () => {
        expect(isTransientError(new Error('Invalid input'))).toBe(false);
      });

      it('should return false for auth errors in message', () => {
        expect(isTransientError(new Error('Authentication failed'))).toBe(false);
      });

      it('should handle string errors', () => {
        expect(isTransientError('502 Bad Gateway')).toBe(true);
        expect(isTransientError('Something went wrong')).toBe(false);
      });
    });
  });

  describe('calculateBackoffDelay', () => {
    it('should return a value between 50% and 100% of baseDelay for attempt 0', () => {
      // Run multiple times to verify the range
      for (let i = 0; i < 100; i++) {
        const delay = calculateBackoffDelay(0, 1000, 30000);
        expect(delay).toBeGreaterThanOrEqual(500);
        expect(delay).toBeLessThanOrEqual(1000);
      }
    });

    it('should increase exponentially with attempts', () => {
      // Attempt 0: base = 1000, range [500, 1000]
      // Attempt 1: base = 2000, range [1000, 2000]
      // Attempt 2: base = 4000, range [2000, 4000]
      const attempt0Max = 1000;
      const attempt1Min = 1000;
      const attempt2Min = 2000;

      // Over many iterations, we should see the ranges are distinct
      let maxAttempt0 = 0;
      let minAttempt1 = Infinity;
      let minAttempt2 = Infinity;

      for (let i = 0; i < 100; i++) {
        maxAttempt0 = Math.max(maxAttempt0, calculateBackoffDelay(0, 1000, 30000));
        minAttempt1 = Math.min(minAttempt1, calculateBackoffDelay(1, 1000, 30000));
        minAttempt2 = Math.min(minAttempt2, calculateBackoffDelay(2, 1000, 30000));
      }

      expect(maxAttempt0).toBeLessThanOrEqual(attempt0Max);
      expect(minAttempt1).toBeGreaterThanOrEqual(attempt1Min);
      expect(minAttempt2).toBeGreaterThanOrEqual(attempt2Min);
    });

    it('should cap delay at maxDelay', () => {
      const maxDelay = 5000;
      for (let i = 0; i < 100; i++) {
        const delay = calculateBackoffDelay(10, 1000, maxDelay);
        expect(delay).toBeLessThanOrEqual(maxDelay);
      }
    });

    it('should return integer values', () => {
      for (let i = 0; i < 50; i++) {
        const delay = calculateBackoffDelay(i % 5, 1000, 30000);
        expect(delay).toBe(Math.floor(delay));
      }
    });

    it('should never return zero', () => {
      for (let i = 0; i < 100; i++) {
        const delay = calculateBackoffDelay(0, 1000, 30000);
        expect(delay).toBeGreaterThan(0);
      }
    });
  });

  describe('retryWithBackoff', () => {
    it('should return result on first successful attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient errors and succeed', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('Bad Gateway'), { status: 502 }))
        .mockResolvedValue('success');

      const promise = retryWithBackoff(operation, { baseDelay: 100 });

      // Advance time past the backoff delay
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry multiple times before succeeding', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('Bad Gateway'), { status: 502 }))
        .mockRejectedValueOnce(Object.assign(new Error('Service Unavailable'), { status: 503 }))
        .mockResolvedValue('success');

      const promise = retryWithBackoff(operation, { baseDelay: 100, maxRetries: 3 });

      // Advance past first retry delay
      await vi.advanceTimersByTimeAsync(200);
      // Advance past second retry delay
      await vi.advanceTimersByTimeAsync(400);

      const result = await promise;
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw after exhausting all retries', async () => {
      vi.useRealTimers();

      const transientError = Object.assign(new Error('Bad Gateway'), { status: 502 });
      const operation = vi.fn().mockRejectedValue(transientError);

      await expect(retryWithBackoff(operation, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow(
        'Bad Gateway'
      );
      expect(operation).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should throw immediately for non-transient errors', async () => {
      const authError = Object.assign(new Error('Unauthorized'), { status: 401 });
      const operation = vi.fn().mockRejectedValue(authError);

      await expect(retryWithBackoff(operation)).rejects.toThrow('Unauthorized');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw immediately for non-retryable generic errors', async () => {
      const error = new Error('Invalid input');
      const operation = vi.fn().mockRejectedValue(error);

      await expect(retryWithBackoff(operation)).rejects.toThrow('Invalid input');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback before each retry', async () => {
      const onRetry = vi.fn();
      const transientError = Object.assign(new Error('Bad Gateway'), { status: 502 });
      const operation = vi.fn().mockRejectedValueOnce(transientError).mockResolvedValue('success');

      const promise = retryWithBackoff(operation, { baseDelay: 100, onRetry });

      await vi.advanceTimersByTimeAsync(200);

      await promise;

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(transientError, 1, expect.any(Number));
    });

    it('should use custom shouldRetry function', async () => {
      const customShouldRetry = vi.fn().mockReturnValue(true);
      const error = new Error('Custom retryable error');
      const operation = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const promise = retryWithBackoff(operation, {
        baseDelay: 100,
        shouldRetry: customShouldRetry,
      });

      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;
      expect(result).toBe('success');
      expect(customShouldRetry).toHaveBeenCalledWith(error);
    });

    it('should respect maxRetries option', async () => {
      vi.useRealTimers();

      const transientError = Object.assign(new Error('Bad Gateway'), { status: 502 });
      const operation = vi.fn().mockRejectedValue(transientError);

      await expect(retryWithBackoff(operation, { maxRetries: 1, baseDelay: 10 })).rejects.toThrow(
        'Bad Gateway'
      );
      expect(operation).toHaveBeenCalledTimes(2); // initial + 1 retry
    });

    it('should respect maxDelay option', async () => {
      const onRetry = vi.fn();
      const transientError = Object.assign(new Error('Bad Gateway'), { status: 502 });
      const operation = vi
        .fn()
        .mockRejectedValueOnce(transientError)
        .mockRejectedValueOnce(transientError)
        .mockRejectedValueOnce(transientError)
        .mockResolvedValue('success');

      const promise = retryWithBackoff(operation, {
        baseDelay: 1000,
        maxDelay: 2000,
        maxRetries: 3,
        onRetry,
      });

      // Advance through all retries
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(2000);

      await promise;

      // Verify all delays are <= maxDelay
      for (const call of onRetry.mock.calls) {
        expect(call[2]).toBeLessThanOrEqual(2000);
      }
    });

    it('should handle network error codes', async () => {
      const networkError = Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
      });
      const operation = vi.fn().mockRejectedValueOnce(networkError).mockResolvedValue('success');

      const promise = retryWithBackoff(operation, { baseDelay: 100 });

      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should handle 503 errors from message content', async () => {
      const error = new Error('Request failed with status 503');
      const operation = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const promise = retryWithBackoff(operation, { baseDelay: 100 });

      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should abort retries when signal is aborted', async () => {
      vi.useRealTimers();

      const controller = new AbortController();
      const transientError = Object.assign(new Error('Bad Gateway'), { status: 502 });
      const operation = vi.fn().mockRejectedValue(transientError);

      const promise = retryWithBackoff(operation, {
        baseDelay: 500,
        maxRetries: 5,
        signal: controller.signal,
      });

      // Abort after a short delay (during the backoff wait)
      setTimeout(() => controller.abort(), 50);

      await expect(promise).rejects.toThrow('Retry aborted');
    });

    it('should abort immediately if signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const operation = vi.fn().mockResolvedValue('success');

      await expect(retryWithBackoff(operation, { signal: controller.signal })).rejects.toThrow(
        'Retry aborted'
      );

      expect(operation).not.toHaveBeenCalled();
    });

    it('should work with zero maxRetries', async () => {
      const transientError = Object.assign(new Error('Bad Gateway'), { status: 502 });
      const operation = vi.fn().mockRejectedValue(transientError);

      await expect(retryWithBackoff(operation, { maxRetries: 0 })).rejects.toThrow('Bad Gateway');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should work with default options', async () => {
      const operation = vi.fn().mockResolvedValue(42);

      const result = await retryWithBackoff(operation);

      expect(result).toBe(42);
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryWithBackoffResult', () => {
    it('should return result with metadata on first success', async () => {
      vi.useRealTimers();

      const operation = vi.fn().mockResolvedValue('success');

      const result = await retryWithBackoffResult(operation);

      expect(result.data).toBe('success');
      expect(result.attempts).toBe(0);
      expect(result.totalTime).toBeGreaterThanOrEqual(0);
      expect(result.totalTime).toBeLessThan(100);
    });

    it('should track retry attempts in result', async () => {
      vi.useRealTimers();

      const transientError = Object.assign(new Error('Bad Gateway'), { status: 502 });
      const operation = vi.fn().mockRejectedValueOnce(transientError).mockResolvedValue('success');

      const result = await retryWithBackoffResult(operation, { baseDelay: 10 });

      expect(result.data).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.totalTime).toBeGreaterThan(0);
    });

    it('should propagate onRetry callback', async () => {
      vi.useRealTimers();

      const onRetry = vi.fn();
      const transientError = Object.assign(new Error('Bad Gateway'), { status: 502 });
      const operation = vi.fn().mockRejectedValueOnce(transientError).mockResolvedValue('success');

      await retryWithBackoffResult(operation, { baseDelay: 10, onRetry });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(transientError, 1, expect.any(Number));
    });

    it('should throw on non-transient errors', async () => {
      const error = new Error('Authentication failed');
      error.name = 'AuthError';
      const operation = vi.fn().mockRejectedValue(error);

      await expect(retryWithBackoffResult(operation)).rejects.toThrow('Authentication failed');
    });
  });
});
