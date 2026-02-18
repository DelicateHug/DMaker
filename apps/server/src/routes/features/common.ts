/**
 * Common utilities for features routes
 *
 * Provides logger, error handling, and shared cache instance for all feature
 * endpoints. Cache is invalidated by mutation handlers (create, update, delete,
 * bulkUpdate, bulkDelete) to keep list / summary responses fresh.
 */

import { createLogger } from '@automaker/utils';
import { FEATURES_CACHE_TTL_MS } from '@automaker/types';
import { getErrorMessage as getErrorMessageShared, createLogError } from '../common.js';
import { RequestCache } from '../../lib/request-cache.js';
import type { Feature } from '@automaker/types';

const logger = createLogger('Features');

// Re-export shared utilities
export { getErrorMessageShared as getErrorMessage };
export const logError = createLogError(logger);

// ---------------------------------------------------------------------------
// Shared features cache
// ---------------------------------------------------------------------------

/**
 * Shared in-memory cache for feature list / summary responses.
 *
 * Used by GET-style endpoints (/list, /list-summaries) to avoid redundant
 * disk reads. Invalidated by every mutation endpoint on successful writes.
 *
 * TTL: 10 seconds — features are actively modified during normal workflow.
 */
export const featuresCache = new RequestCache<string, Feature[] | unknown>({
  defaultTtl: FEATURES_CACHE_TTL_MS,
  maxEntries: 200,
});

/**
 * Invalidate all cached feature list/summary entries for a given project path.
 *
 * Should be called after any successful feature mutation (create, update,
 * delete, bulkUpdate, bulkDelete) so that subsequent list/summary requests
 * return fresh data.
 *
 * @param projectPath - The project whose feature caches should be invalidated
 * @returns Number of cache entries invalidated
 */
export function invalidateFeaturesCache(projectPath: string): number {
  return featuresCache.invalidateBy((key) => key.includes(projectPath));
}
