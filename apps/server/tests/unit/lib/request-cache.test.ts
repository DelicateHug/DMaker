/**
 * RequestCache Unit Tests
 *
 * Tests for Map-based cache, in-flight dedup, TTL expiry, SWR support,
 * and invalidation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequestCache } from '@/lib/request-cache.js';

describe('request-cache.ts', () => {
  let cache: RequestCache<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new RequestCache<string, string>({ defaultTtl: 1000 });
  });

  afterEach(() => {
    cache.dispose();
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Basic cache operations
  // ---------------------------------------------------------------------------

  describe('basic operations', () => {
    it('should store and retrieve values via set/get', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should report correct size', () => {
      expect(cache.size).toBe(0);
      cache.set('a', '1');
      cache.set('b', '2');
      expect(cache.size).toBe(2);
    });

    it('should check key existence with has()', () => {
      cache.set('exists', 'yes');
      expect(cache.has('exists')).toBe(true);
      expect(cache.has('nope')).toBe(false);
    });

    it('should delete a single entry', () => {
      cache.set('key', 'value');
      expect(cache.delete('key')).toBe(true);
      expect(cache.get('key')).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it('should return false when deleting a non-existent key', () => {
      expect(cache.delete('nothing')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeUndefined();
    });

    it('should iterate keys', () => {
      cache.set('x', '1');
      cache.set('y', '2');
      const keys = [...cache.keys()];
      expect(keys).toContain('x');
      expect(keys).toContain('y');
    });

    it('should override existing values with set()', () => {
      cache.set('key', 'old');
      cache.set('key', 'new');
      expect(cache.get('key')).toBe('new');
    });
  });

  // ---------------------------------------------------------------------------
  // TTL expiry
  // ---------------------------------------------------------------------------

  describe('TTL expiry', () => {
    it('should return value before TTL expires', () => {
      cache.set('key', 'value');
      vi.advanceTimersByTime(999);
      expect(cache.get('key')).toBe('value');
    });

    it('should return undefined after TTL expires', () => {
      cache.set('key', 'value');
      vi.advanceTimersByTime(1001);
      expect(cache.get('key')).toBeUndefined();
    });

    it('should support per-entry TTL via set()', () => {
      cache.set('short', 'expires-fast', 500);
      cache.set('long', 'expires-slow', 5000);

      vi.advanceTimersByTime(600);
      expect(cache.get('short')).toBeUndefined();
      expect(cache.get('long')).toBe('expires-slow');
    });

    it('should report has() = false after TTL expires', () => {
      cache.set('key', 'value');
      vi.advanceTimersByTime(1001);
      expect(cache.has('key')).toBe(false);
    });

    it('should clean up expired entry on get()', () => {
      cache.set('key', 'value');
      vi.advanceTimersByTime(1001);
      cache.get('key'); // Triggers eager cleanup
      expect(cache.size).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getOrSet - basic fetch and caching
  // ---------------------------------------------------------------------------

  describe('getOrSet', () => {
    it('should call fetcher and cache the result', async () => {
      const fetcher = vi.fn().mockResolvedValue('fetched-value');

      const result = await cache.getOrSet('key', fetcher);

      expect(result).toBe('fetched-value');
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(cache.get('key')).toBe('fetched-value');
    });

    it('should return cached value without calling fetcher on second call', async () => {
      const fetcher = vi.fn().mockResolvedValue('fetched-value');

      await cache.getOrSet('key', fetcher);
      const result = await cache.getOrSet('key', fetcher);

      expect(result).toBe('fetched-value');
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('should re-fetch after TTL expires', async () => {
      const fetcher = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');

      await cache.getOrSet('key', fetcher);
      vi.advanceTimersByTime(1001);
      const result = await cache.getOrSet('key', fetcher);

      expect(result).toBe('v2');
      expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('should use per-call TTL override', async () => {
      const fetcher = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');

      await cache.getOrSet('key', fetcher, { ttl: 500 });
      vi.advanceTimersByTime(600);
      const result = await cache.getOrSet('key', fetcher);

      expect(result).toBe('v2');
      expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('should propagate fetcher errors', async () => {
      const fetcher = vi.fn().mockRejectedValue(new Error('fetch failed'));

      await expect(cache.getOrSet('key', fetcher)).rejects.toThrow('fetch failed');
      expect(cache.get('key')).toBeUndefined();
    });

    it('should handle forceRefresh option', async () => {
      const fetcher = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');

      await cache.getOrSet('key', fetcher);
      const result = await cache.getOrSet('key', fetcher, { forceRefresh: true });

      expect(result).toBe('v2');
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // In-flight deduplication
  // ---------------------------------------------------------------------------

  describe('in-flight deduplication', () => {
    it('should deduplicate concurrent requests for the same key', async () => {
      let resolvePromise: (value: string) => void;
      const fetcher = vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolvePromise = resolve;
          })
      );

      // Start two concurrent requests for the same key
      const p1 = cache.getOrSet('key', fetcher);
      const p2 = cache.getOrSet('key', fetcher);

      // Only one fetch should have been started
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(cache.isInFlight('key')).toBe(true);

      // Resolve the fetch
      resolvePromise!('result');

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe('result');
      expect(r2).toBe('result');
      expect(cache.isInFlight('key')).toBe(false);
    });

    it('should not deduplicate requests for different keys', async () => {
      const fetcher = vi.fn().mockResolvedValue('value');

      await Promise.all([cache.getOrSet('key1', fetcher), cache.getOrSet('key2', fetcher)]);

      expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('should clean up in-flight tracking after fetch error', async () => {
      const fetcher = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(cache.getOrSet('key', fetcher)).rejects.toThrow('fail');
      expect(cache.isInFlight('key')).toBe(false);
    });

    it('should allow a new fetch after a previous in-flight completes', async () => {
      const fetcher = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');

      await cache.getOrSet('key', fetcher);
      vi.advanceTimersByTime(1001); // Expire the entry
      const result = await cache.getOrSet('key', fetcher);

      expect(result).toBe('v2');
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Stale-While-Revalidate (SWR)
  // ---------------------------------------------------------------------------

  describe('SWR (stale-while-revalidate)', () => {
    let swrCache: RequestCache<string, string>;

    beforeEach(() => {
      swrCache = new RequestCache<string, string>({
        defaultTtl: 1000,
        enableSwr: true,
        swrTtl: 2000, // Stale data usable for 2s after TTL
      });
    });

    afterEach(() => {
      swrCache.dispose();
    });

    it('should return stale data immediately when within SWR window', async () => {
      const fetcher = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');

      // Populate cache
      await swrCache.getOrSet('key', fetcher);
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Advance past TTL but within SWR window (ttl=1000, swrTtl=2000, so up to 3000ms)
      vi.advanceTimersByTime(1500);

      // Should return stale value immediately
      const result = await swrCache.getOrSet('key', fetcher);
      expect(result).toBe('v1'); // Returns stale data

      // Background refresh should have been triggered
      // Flush the microtask queue so the background promise resolves
      await vi.runAllTimersAsync();

      // Now cache should be refreshed
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(swrCache.get('key')).toBe('v2');
    });

    it('should not return stale data outside SWR window', async () => {
      const fetcher = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');

      await swrCache.getOrSet('key', fetcher);

      // Advance past both TTL and SWR window (ttl=1000 + swrTtl=2000 = 3000ms)
      vi.advanceTimersByTime(3001);

      const result = await swrCache.getOrSet('key', fetcher);
      expect(result).toBe('v2'); // Must fetch fresh, not stale
      expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('should respect per-call swr override (enable)', async () => {
      // Use a cache WITHOUT global SWR
      const noSwrCache = new RequestCache<string, string>({
        defaultTtl: 1000,
        enableSwr: false,
        swrTtl: 2000,
      });

      const fetcher = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');

      await noSwrCache.getOrSet('key', fetcher);
      vi.advanceTimersByTime(1500);

      // Enable SWR for this call only
      const result = await noSwrCache.getOrSet('key', fetcher, { swr: true });
      expect(result).toBe('v1'); // Stale value returned

      await vi.runAllTimersAsync();
      noSwrCache.dispose();
    });

    it('should respect per-call swr override (disable)', async () => {
      const fetcher = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');

      await swrCache.getOrSet('key', fetcher);
      vi.advanceTimersByTime(1500);

      // Disable SWR for this call
      const result = await swrCache.getOrSet('key', fetcher, { swr: false });
      expect(result).toBe('v2'); // Forced fresh fetch
    });

    it('should not start duplicate background refreshes', async () => {
      let resolveRefresh: (value: string) => void;
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce('v1')
        .mockImplementationOnce(
          () =>
            new Promise<string>((resolve) => {
              resolveRefresh = resolve;
            })
        );

      await swrCache.getOrSet('key', fetcher);
      vi.advanceTimersByTime(1500);

      // Trigger SWR twice
      await swrCache.getOrSet('key', fetcher);
      await swrCache.getOrSet('key', fetcher);

      // Only one background refresh should be triggered (plus the original)
      expect(fetcher).toHaveBeenCalledTimes(2);

      resolveRefresh!('v2');
      await vi.runAllTimersAsync();
    });

    it('should handle background refresh errors gracefully', async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce('v1')
        .mockRejectedValueOnce(new Error('bg refresh failed'));

      await swrCache.getOrSet('key', fetcher);
      vi.advanceTimersByTime(1500);

      // Should still return stale value
      const result = await swrCache.getOrSet('key', fetcher);
      expect(result).toBe('v1');

      // Let the background error resolve
      await vi.runAllTimersAsync();

      // Cache should still have the old stale value (background failed)
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Invalidation
  // ---------------------------------------------------------------------------

  describe('invalidation', () => {
    it('should invalidate entries matching a predicate', () => {
      cache.set('models:gpt4', 'gpt4-data');
      cache.set('models:claude', 'claude-data');
      cache.set('users:alice', 'alice-data');

      const count = cache.invalidateBy((key) => key.startsWith('models:'));

      expect(count).toBe(2);
      expect(cache.get('models:gpt4')).toBeUndefined();
      expect(cache.get('models:claude')).toBeUndefined();
      expect(cache.get('users:alice')).toBe('alice-data');
    });

    it('should return 0 when no entries match predicate', () => {
      cache.set('a', '1');
      const count = cache.invalidateBy(() => false);
      expect(count).toBe(0);
      expect(cache.size).toBe(1);
    });

    it('should invalidate all entries with always-true predicate', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      const count = cache.invalidateBy(() => true);
      expect(count).toBe(2);
      expect(cache.size).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Max entries eviction
  // ---------------------------------------------------------------------------

  describe('max entries', () => {
    it('should evict oldest entry when maxEntries is reached via set()', () => {
      const bounded = new RequestCache<string, string>({
        defaultTtl: 10000,
        maxEntries: 3,
      });

      bounded.set('a', '1');
      bounded.set('b', '2');
      bounded.set('c', '3');
      bounded.set('d', '4'); // Should evict 'a'

      expect(bounded.size).toBe(3);
      expect(bounded.get('a')).toBeUndefined();
      expect(bounded.get('b')).toBe('2');
      expect(bounded.get('d')).toBe('4');

      bounded.dispose();
    });

    it('should evict oldest entry when maxEntries is reached via getOrSet()', async () => {
      const bounded = new RequestCache<string, string>({
        defaultTtl: 10000,
        maxEntries: 2,
      });

      await bounded.getOrSet('a', async () => '1');
      await bounded.getOrSet('b', async () => '2');
      await bounded.getOrSet('c', async () => '3'); // Should evict 'a'

      expect(bounded.size).toBe(2);
      expect(bounded.get('a')).toBeUndefined();
      expect(bounded.get('c')).toBe('3');

      bounded.dispose();
    });
  });

  // ---------------------------------------------------------------------------
  // Periodic cleanup (sweep)
  // ---------------------------------------------------------------------------

  describe('periodic cleanup', () => {
    it('should sweep expired entries on interval', () => {
      const autoClean = new RequestCache<string, string>({
        defaultTtl: 1000,
        cleanupInterval: 5000,
      });

      autoClean.set('a', '1');
      autoClean.set('b', '2');

      // Advance past TTL
      vi.advanceTimersByTime(1500);

      // Entries are expired but not yet swept
      expect(autoClean.size).toBe(2);

      // Advance to trigger cleanup interval
      vi.advanceTimersByTime(4000); // Total: 5500ms

      // Entries should be swept
      expect(autoClean.size).toBe(0);

      autoClean.dispose();
    });

    it('should not sweep entries that are still fresh', () => {
      const autoClean = new RequestCache<string, string>({
        defaultTtl: 10000,
        cleanupInterval: 1000,
      });

      autoClean.set('key', 'value');

      // Run cleanup timer
      vi.advanceTimersByTime(1500);

      // Entry should still be there (TTL=10s, only 1.5s elapsed)
      expect(autoClean.size).toBe(1);
      expect(autoClean.get('key')).toBe('value');

      autoClean.dispose();
    });

    it('should respect SWR TTL when sweeping', () => {
      const autoClean = new RequestCache<string, string>({
        defaultTtl: 1000,
        enableSwr: true,
        swrTtl: 2000,
        cleanupInterval: 500,
      });

      autoClean.set('key', 'value');

      // Past TTL but within SWR window
      vi.advanceTimersByTime(2000);
      expect(autoClean.size).toBe(1); // Still present for SWR

      // Past TTL + SWR window
      vi.advanceTimersByTime(2000); // Total: 4000ms > 1000 + 2000
      expect(autoClean.size).toBe(0); // Now swept

      autoClean.dispose();
    });
  });

  // ---------------------------------------------------------------------------
  // dispose
  // ---------------------------------------------------------------------------

  describe('dispose', () => {
    it('should clear all entries and stop cleanup timer', () => {
      const withCleanup = new RequestCache<string, string>({
        defaultTtl: 1000,
        cleanupInterval: 500,
      });

      withCleanup.set('key', 'value');
      withCleanup.dispose();

      expect(withCleanup.size).toBe(0);
    });

    it('should be safe to call dispose multiple times', () => {
      cache.dispose();
      cache.dispose(); // Should not throw
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should work with non-string key types', async () => {
      const numCache = new RequestCache<number, string>({ defaultTtl: 5000 });

      numCache.set(42, 'answer');
      expect(numCache.get(42)).toBe('answer');

      const result = await numCache.getOrSet(99, async () => 'ninety-nine');
      expect(result).toBe('ninety-nine');

      numCache.dispose();
    });

    it('should handle null as a cached value', async () => {
      const nullCache = new RequestCache<string, null>({ defaultTtl: 5000 });

      const result = await nullCache.getOrSet('key', async () => null);
      expect(result).toBeNull();
      expect(nullCache.size).toBe(1);

      nullCache.dispose();
    });

    it('should handle very large number of entries', () => {
      for (let i = 0; i < 10000; i++) {
        cache.set(`key-${i}`, `value-${i}`);
      }
      expect(cache.size).toBe(10000);
      expect(cache.get('key-5000')).toBe('value-5000');
    });

    it('should use default options when none provided', () => {
      const defaultCache = new RequestCache();
      defaultCache.set('key', 'value');
      expect(defaultCache.get('key')).toBe('value');

      // Default TTL is 60s
      vi.advanceTimersByTime(59_999);
      expect(defaultCache.get('key')).toBe('value');
      vi.advanceTimersByTime(2);
      expect(defaultCache.get('key')).toBeUndefined();

      defaultCache.dispose();
    });
  });
});
