/**
 * RequestCache - Client-side in-memory cache with request deduplication and SWR support
 *
 * A general-purpose caching layer for async operations (HTTP requests, etc.)
 * that prevents redundant concurrent requests and supports stale-while-revalidate patterns.
 *
 * Mirrors the server-side RequestCache API (apps/server/src/lib/request-cache.ts)
 * but is designed for browser environments.
 *
 * Features:
 * - Map-based in-memory storage with generic key/value types
 * - In-flight request deduplication (concurrent calls for the same key share one Promise)
 * - Configurable TTL (time-to-live) expiry per entry
 * - Stale-While-Revalidate (SWR): return stale data immediately, refresh in background
 * - Flexible invalidation: by key, by predicate, or clear all
 * - Automatic cleanup of expired entries via optional periodic sweep
 */

import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('RequestCache');

/**
 * Metadata stored alongside each cached value
 */
interface CacheEntry<T> {
  /** The cached value */
  value: T;
  /** Timestamp when the entry was stored (ms since epoch) */
  cachedAt: number;
  /** TTL for this specific entry in milliseconds */
  ttl: number;
}

/**
 * Configuration options for the RequestCache
 */
export interface RequestCacheOptions {
  /** Default TTL in milliseconds (default: 60000 = 1 minute) */
  defaultTtl?: number;
  /** Enable stale-while-revalidate globally (default: false) */
  enableSwr?: boolean;
  /**
   * Maximum age in ms for which stale data is still returned via SWR.
   * Once an entry is older than (ttl + swrTtl), it is considered fully expired.
   * (default: same as defaultTtl, so stale data lives for 2x TTL total)
   */
  swrTtl?: number;
  /** Interval in ms for automatic cleanup of expired entries (0 = disabled, default: 0) */
  cleanupInterval?: number;
  /** Maximum number of entries in the cache (0 = unlimited, default: 0) */
  maxEntries?: number;
}

/**
 * Options for a single `getOrSet` call, allowing per-request overrides
 */
export interface GetOrSetOptions {
  /** Override the default TTL for this entry */
  ttl?: number;
  /** Force a fresh fetch, ignoring cached data */
  forceRefresh?: boolean;
  /** Override global SWR setting for this call */
  swr?: boolean;
}

/**
 * RequestCache<K, V> - Generic in-memory cache with dedup and SWR
 *
 * @typeParam K - Cache key type (typically `string`)
 * @typeParam V - Cached value type
 *
 * @example
 * ```ts
 * const cache = new RequestCache<string, Model[]>({ defaultTtl: 300_000 });
 *
 * const models = await cache.getOrSet('all-models', async () => {
 *   return fetchModelsFromApi();
 * });
 * ```
 */
export class RequestCache<K = string, V = unknown> {
  /** Primary cache storage */
  private readonly cache = new Map<K, CacheEntry<V>>();

  /** In-flight requests keyed by cache key — used for deduplication */
  private readonly inFlight = new Map<K, Promise<V>>();

  /** Handle returned by setInterval for the cleanup timer (if enabled) */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /** Resolved configuration */
  private readonly defaultTtl: number;
  private readonly enableSwr: boolean;
  private readonly swrTtl: number;
  private readonly maxEntries: number;

  constructor(options: RequestCacheOptions = {}) {
    this.defaultTtl = options.defaultTtl ?? 60_000;
    this.enableSwr = options.enableSwr ?? false;
    this.swrTtl = options.swrTtl ?? this.defaultTtl;
    this.maxEntries = options.maxEntries ?? 0;

    if (options.cleanupInterval && options.cleanupInterval > 0) {
      this.startCleanup(options.cleanupInterval);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Get a value from cache, or fetch it via `fetcher` if missing / expired.
   *
   * When SWR is enabled (globally or per-call) and the entry is stale but within
   * the SWR window, the stale value is returned immediately and a background
   * refresh is triggered.
   *
   * Concurrent calls for the same key while a fetch is in-flight will share the
   * same Promise (deduplication).
   *
   * @param key     - Cache key
   * @param fetcher - Async function that produces a fresh value
   * @param options - Per-call overrides
   * @returns The cached or freshly-fetched value
   */
  async getOrSet(key: K, fetcher: () => Promise<V>, options: GetOrSetOptions = {}): Promise<V> {
    const ttl = options.ttl ?? this.defaultTtl;
    const useSwr = options.swr ?? this.enableSwr;
    const forceRefresh = options.forceRefresh ?? false;

    // --- Force refresh: skip cache, go straight to fetch ---
    if (forceRefresh) {
      return this.dedupedFetch(key, fetcher, ttl);
    }

    // --- Check cache ---
    const entry = this.cache.get(key);

    if (entry) {
      const age = Date.now() - entry.cachedAt;
      const isStale = age > entry.ttl;

      // Fresh entry — return immediately
      if (!isStale) {
        return entry.value;
      }

      // Stale entry with SWR enabled and within SWR window
      if (useSwr && age <= entry.ttl + this.swrTtl) {
        // Trigger background refresh (fire-and-forget)
        this.backgroundRefresh(key, fetcher, ttl);
        return entry.value;
      }

      // Stale and outside SWR window — fall through to fetch
    }

    // --- No usable cache entry — fetch (with dedup) ---
    return this.dedupedFetch(key, fetcher, ttl);
  }

  /**
   * Get a cached value without triggering a fetch.
   *
   * @param key - Cache key
   * @returns The cached value, or `undefined` if not present or expired
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const age = Date.now() - entry.cachedAt;
    if (age > entry.ttl) {
      // Expired — clean up eagerly
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Manually set a value in the cache.
   *
   * @param key   - Cache key
   * @param value - Value to cache
   * @param ttl   - TTL in ms (defaults to the cache's `defaultTtl`)
   */
  set(key: K, value: V, ttl?: number): void {
    this.evictIfNeeded();
    this.cache.set(key, {
      value,
      cachedAt: Date.now(),
      ttl: ttl ?? this.defaultTtl,
    });
  }

  /**
   * Check whether a key exists and is not expired.
   */
  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a single cache entry.
   *
   * @returns `true` if an entry was removed
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalidate all entries whose keys match a predicate.
   *
   * @param predicate - Function that receives each key; return `true` to invalidate
   * @returns Number of entries invalidated
   *
   * @example
   * ```ts
   * // Invalidate all entries whose key starts with "/api/models"
   * cache.invalidateBy(key => key.startsWith('/api/models'));
   * ```
   */
  invalidateBy(predicate: (key: K) => boolean): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (predicate(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      logger.info(`[invalidateBy] Invalidated ${count} cache entries`);
    }

    return count;
  }

  /**
   * Clear all cache entries and cancel any pending in-flight requests tracking.
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.inFlight.clear();

    if (size > 0) {
      logger.info(`[clear] Cleared ${size} cache entries`);
    }
  }

  /**
   * Get the number of entries currently in the cache (including potentially stale ones).
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all cache keys.
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * Check whether a fetch for the given key is currently in-flight.
   */
  isInFlight(key: K): boolean {
    return this.inFlight.has(key);
  }

  /**
   * Stop the periodic cleanup timer and release resources.
   * Call this when the cache is no longer needed to prevent timer leaks.
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetch a value while deduplicating concurrent requests for the same key.
   *
   * If an in-flight request already exists for `key`, the existing Promise is
   * returned instead of starting a new fetch.
   */
  private async dedupedFetch(key: K, fetcher: () => Promise<V>, ttl: number): Promise<V> {
    // If there's already an in-flight request for this key, piggyback on it
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    // Start a new fetch
    const promise = this.executeFetch(key, fetcher, ttl);
    this.inFlight.set(key, promise);

    try {
      return await promise;
    } finally {
      this.inFlight.delete(key);
    }
  }

  /**
   * Execute the fetcher, store the result in cache, and handle errors.
   */
  private async executeFetch(key: K, fetcher: () => Promise<V>, ttl: number): Promise<V> {
    const value = await fetcher();

    this.evictIfNeeded();
    this.cache.set(key, {
      value,
      cachedAt: Date.now(),
      ttl,
    });

    return value;
  }

  /**
   * Trigger a background refresh without blocking the caller.
   *
   * If a fetch is already in-flight for this key, no duplicate is started.
   */
  private backgroundRefresh(key: K, fetcher: () => Promise<V>, ttl: number): void {
    if (this.inFlight.has(key)) {
      return; // Already refreshing
    }

    const promise = this.executeFetch(key, fetcher, ttl);
    this.inFlight.set(key, promise);

    // Fire-and-forget — log errors but don't propagate
    promise
      .catch((error) => {
        logger.warn(`[backgroundRefresh] SWR refresh failed for key:`, error);
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
  }

  /**
   * If `maxEntries` is set and the cache is at capacity, evict the oldest entry.
   */
  private evictIfNeeded(): void {
    if (this.maxEntries <= 0 || this.cache.size < this.maxEntries) {
      return;
    }

    // Evict the oldest entry (first key in insertion order)
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey !== undefined) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Start the periodic cleanup timer that removes expired entries.
   */
  private startCleanup(interval: number): void {
    this.cleanupTimer = setInterval(() => {
      this.sweep();
    }, interval);
  }

  /**
   * Remove all expired entries from the cache.
   *
   * An entry is considered fully expired when its age exceeds `ttl + swrTtl`
   * (if SWR is enabled) or just `ttl` (if SWR is disabled).
   */
  private sweep(): void {
    const now = Date.now();
    let swept = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.cachedAt;
      const maxAge = this.enableSwr ? entry.ttl + this.swrTtl : entry.ttl;

      if (age > maxAge) {
        this.cache.delete(key);
        swept++;
      }
    }

    if (swept > 0) {
      logger.info(`[sweep] Cleaned up ${swept} expired cache entries`);
    }
  }
}
