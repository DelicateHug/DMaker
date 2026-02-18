/**
 * Cache configuration types and TTL constants for API endpoint categories.
 *
 * Defines standardized caching options and time-to-live values for each
 * category of API endpoint. TTLs are chosen based on how frequently the
 * underlying data changes:
 *
 * - **Health**: Very short TTL — system status can change rapidly
 * - **Models**: Long TTL — available models change infrequently
 * - **Settings**: Medium TTL — user settings change on explicit save
 * - **Features**: Short TTL — features are actively modified during work
 * - **Usage**: Medium TTL — usage data changes as tokens are consumed
 */

// ---------------------------------------------------------------------------
// Endpoint category type
// ---------------------------------------------------------------------------

/**
 * Categories of API endpoints that support caching.
 * Each category has its own TTL profile based on data volatility.
 */
export type EndpointCategory = 'features' | 'settings' | 'models' | 'health' | 'usage';

// ---------------------------------------------------------------------------
// Cache options type
// ---------------------------------------------------------------------------

/**
 * Configuration options for endpoint response caching.
 *
 * Used to configure the RequestCache for specific endpoint categories,
 * controlling how long responses are cached and how stale data is handled.
 */
export interface CacheOptions {
  /** Time-to-live in milliseconds before cached data is considered stale */
  ttl: number;
  /** Enable stale-while-revalidate: return stale data immediately, refresh in background */
  swr?: boolean;
  /**
   * Maximum age in ms for which stale data is still returned via SWR.
   * Only applies when `swr` is true.
   * Defaults to the same value as `ttl` (so stale data lives for 2× TTL total).
   */
  swrTtl?: number;
  /** Maximum number of entries in the cache (0 = unlimited) */
  maxEntries?: number;
}

// ---------------------------------------------------------------------------
// TTL constants (milliseconds)
// ---------------------------------------------------------------------------

/**
 * Cache TTL for health endpoints (e.g., /api/health).
 *
 * Short TTL since health status reflects real-time system state.
 * Caching still prevents excessive polling from hammering the server.
 *
 * 15 seconds
 */
export const HEALTH_CACHE_TTL_MS = 15_000;

/**
 * Cache TTL for model endpoints (e.g., /api/models/available, /api/models/providers).
 *
 * Long TTL since available models rarely change during a session.
 * Matches the existing codex-model-cache-service pattern (1 hour).
 *
 * 5 minutes
 */
export const MODELS_CACHE_TTL_MS = 5 * 60_000;

/**
 * Cache TTL for settings endpoints (e.g., /api/settings/global, /api/settings/credentials).
 *
 * Medium TTL since settings only change when the user explicitly saves.
 * Cache is typically invalidated on write operations.
 *
 * 30 seconds
 */
export const SETTINGS_CACHE_TTL_MS = 30_000;

/**
 * Cache TTL for feature endpoints (e.g., /api/features/list, /api/features/get).
 *
 * Short TTL since features are actively created, updated, and processed
 * during normal workflow. Balances freshness with reduced disk I/O.
 *
 * 10 seconds
 */
export const FEATURES_CACHE_TTL_MS = 10_000;

/**
 * Cache TTL for usage endpoints (e.g., /api/claude/usage, /api/codex/usage).
 *
 * Medium TTL since usage data changes as tokens are consumed but does not
 * need sub-second freshness. Prevents redundant CLI invocations while
 * still reflecting meaningful changes within a couple of minutes.
 * WebSocket push events provide real-time updates between cache refreshes.
 *
 * 2 minutes
 */
export const USAGE_CACHE_TTL_MS = 2 * 60_000;

// ---------------------------------------------------------------------------
// Default cache options per category
// ---------------------------------------------------------------------------

/**
 * Default cache configuration for each endpoint category.
 *
 * These provide sensible defaults that can be spread into a RequestCache
 * constructor or overridden per-request.
 *
 * @example
 * ```ts
 * import { DEFAULT_CACHE_OPTIONS } from '@automaker/types';
 *
 * const modelsCache = new RequestCache({
 *   defaultTtl: DEFAULT_CACHE_OPTIONS.models.ttl,
 *   enableSwr: DEFAULT_CACHE_OPTIONS.models.swr,
 * });
 * ```
 */
export const DEFAULT_CACHE_OPTIONS: Record<EndpointCategory, CacheOptions> = {
  health: {
    ttl: HEALTH_CACHE_TTL_MS,
    swr: false,
    maxEntries: 10,
  },
  models: {
    ttl: MODELS_CACHE_TTL_MS,
    swr: true,
    swrTtl: MODELS_CACHE_TTL_MS,
    maxEntries: 50,
  },
  settings: {
    ttl: SETTINGS_CACHE_TTL_MS,
    swr: true,
    swrTtl: SETTINGS_CACHE_TTL_MS,
    maxEntries: 20,
  },
  features: {
    ttl: FEATURES_CACHE_TTL_MS,
    swr: false,
    maxEntries: 200,
  },
  usage: {
    ttl: USAGE_CACHE_TTL_MS,
    swr: false,
    maxEntries: 10,
  },
};
