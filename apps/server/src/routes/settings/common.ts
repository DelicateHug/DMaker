/**
 * Common utilities for settings routes
 *
 * Provides logger and error handling utilities shared across all settings endpoints.
 * Re-exports error handling helpers from the parent routes module.
 */

import { createLogger } from '@automaker/utils';
import { getErrorMessage as getErrorMessageShared, createLogError } from '../common.js';
import { RequestCache } from '../../lib/request-cache.js';
import type { GlobalSettings } from '../../types/settings.js';

/** Logger instance for settings-related operations */
export const logger = createLogger('Settings');

/**
 * Extract user-friendly error message from error objects
 *
 * Re-exported from parent routes common module for consistency.
 */
export { getErrorMessageShared as getErrorMessage };

/**
 * Log error with automatic logger binding
 *
 * Convenience function for logging errors with the Settings logger.
 */
export const logError = createLogError(logger);

// ---------------------------------------------------------------------------
// Shared settings cache
// ---------------------------------------------------------------------------

/** Cache key used for global settings */
export const GLOBAL_SETTINGS_CACHE_KEY = 'global-settings';

/** TTL for cached global settings (60 seconds) */
const GLOBAL_SETTINGS_TTL_MS = 60_000;

/**
 * Shared in-memory cache for global settings.
 *
 * Used by GET /api/settings/global to avoid redundant file reads.
 * Invalidated by PUT /api/settings/global on successful writes.
 *
 * TTL: 60 seconds — settings only change on explicit user save.
 */
export const globalSettingsCache = new RequestCache<string, GlobalSettings>({
  defaultTtl: GLOBAL_SETTINGS_TTL_MS,
});
