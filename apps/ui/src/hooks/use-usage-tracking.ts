import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, ClaudeUsage, CodexUsage } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { getElectronAPI } from '@/lib/electron';
import { createLogger } from '@automaker/utils/logger';
import { USAGE_CACHE_TTL_MS } from '@automaker/types';

const logger = createLogger('UsageTracking');

// Error codes for distinguishing failure modes
export const USAGE_ERROR_CODES = {
  API_BRIDGE_UNAVAILABLE: 'API_BRIDGE_UNAVAILABLE',
  AUTH_ERROR: 'AUTH_ERROR',
  TRUST_PROMPT: 'TRUST_PROMPT',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  UNKNOWN: 'UNKNOWN',
} as const;

export type UsageErrorCode = (typeof USAGE_ERROR_CODES)[keyof typeof USAGE_ERROR_CODES];

export interface UsageError {
  code: UsageErrorCode;
  message: string;
}

// Constants for refresh intervals — aligned with USAGE_CACHE_TTL_MS from the
// transport-layer cache so that the UI staleness window matches the cachedGet TTL.
const STALENESS_THRESHOLD_MS = USAGE_CACHE_TTL_MS; // UI staleness matches cache TTL
const REFRESH_INTERVAL_SECONDS = 30; // Active refresh interval (30 seconds with countdown)
const REFRESH_INTERVAL_MS = REFRESH_INTERVAL_SECONDS * 1000; // Fallback auto-refresh interval
const STALENESS_CHECK_INTERVAL_MS = 30 * 1000; // Check staleness every 30 seconds

/**
 * Calculate if usage data is stale based on last updated timestamp
 */
function calculateIsStale(lastUpdated: number | null): boolean {
  return !lastUpdated || Date.now() - lastUpdated > STALENESS_THRESHOLD_MS;
}

/**
 * Hook for tracking Claude Code API usage
 *
 * Provides:
 * - Automatic fetching when data is stale
 * - Manual refresh capability
 * - Periodic refresh while actively viewing (when isActive is true)
 * - Loading and error state management
 * - Staleness tracking with periodic recalculation
 *
 * The underlying API call (`claude.getUsage`) is routed through the HTTP
 * client's `cachedGet`, which provides:
 * - **Request deduplication**: concurrent callers share a single in-flight request
 * - **TTL-based caching**: responses are cached for `USAGE_CACHE_TTL_MS` to
 *   avoid redundant CLI invocations
 *
 * @param options.isActive - When true, enables auto-refresh interval (e.g., when popover is open)
 * @param options.autoFetchOnStale - When true, auto-fetches if data is stale on mount (default: true)
 */
export function useClaudeUsageTracking(
  options: {
    isActive?: boolean;
    autoFetchOnStale?: boolean;
  } = {}
) {
  const { isActive = false, autoFetchOnStale = true } = options;

  // Store state
  const { claudeUsage, claudeUsageLastUpdated, setClaudeUsage } = useAppStore(
    useShallow((state) => ({
      claudeUsage: state.claudeUsage,
      claudeUsageLastUpdated: state.claudeUsageLastUpdated,
      setClaudeUsage: state.setClaudeUsage,
    }))
  );

  const claudeAuthStatus = useSetupStore((state) => state.claudeAuthStatus);

  // Local state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UsageError | null>(null);
  const [isStale, setIsStale] = useState(() => calculateIsStale(claudeUsageLastUpdated));

  // Track if initial fetch has been done to prevent duplicate fetches.
  // Note: The cachedGet layer also deduplicates concurrent in-flight requests,
  // but this ref prevents the hook from firing multiple auto-fetch effects.
  const initialFetchDone = useRef(false);

  // Check if CLI is verified/authenticated
  const isCliVerified = useMemo(() => {
    return claudeAuthStatus?.authenticated && claudeAuthStatus?.method === 'cli_authenticated';
  }, [claudeAuthStatus]);

  // Update staleness when lastUpdated changes
  useEffect(() => {
    setIsStale(calculateIsStale(claudeUsageLastUpdated));
  }, [claudeUsageLastUpdated]);

  // Periodically recalculate staleness to update UI
  useEffect(() => {
    const checkStaleness = () => {
      setIsStale(calculateIsStale(claudeUsageLastUpdated));
    };

    const intervalId = setInterval(checkStaleness, STALENESS_CHECK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [claudeUsageLastUpdated]);

  // Fetch usage data.
  // The underlying api.claude.getUsage() call goes through cachedGet, so
  // rapid/concurrent calls are deduplicated and served from cache within
  // USAGE_CACHE_TTL_MS. This makes it safe to call fetchUsage() liberally
  // (e.g., on mount, on popover open, on interval) without incurring extra
  // network or CLI overhead.
  const fetchUsage = useCallback(
    async (isAutoRefresh = false) => {
      if (!isAutoRefresh) setLoading(true);
      setError(null);

      try {
        const api = getElectronAPI();
        if (!api.claude) {
          setError({
            code: USAGE_ERROR_CODES.API_BRIDGE_UNAVAILABLE,
            message: 'Claude API bridge not available',
          });
          return;
        }

        const data = await api.claude.getUsage();

        if ('error' in data) {
          // Detect trust prompt error
          const isTrustPrompt =
            data.error === 'Trust prompt pending' ||
            (data.message && data.message.includes('folder permission'));

          setError({
            code: isTrustPrompt ? USAGE_ERROR_CODES.TRUST_PROMPT : USAGE_ERROR_CODES.AUTH_ERROR,
            message: data.message || data.error,
          });
          return;
        }

        setClaudeUsage(data);
        logger.debug('Claude usage fetched successfully', {
          sessionPercentage: data.sessionPercentage,
          weeklyPercentage: data.weeklyPercentage,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch usage';
        logger.error('Failed to fetch Claude usage:', message);
        setError({
          code: USAGE_ERROR_CODES.UNKNOWN,
          message,
        });
      } finally {
        if (!isAutoRefresh) setLoading(false);
      }
    },
    [setClaudeUsage]
  );

  // Auto-fetch on mount if data is stale (only if CLI is verified)
  useEffect(() => {
    if (autoFetchOnStale && isStale && isCliVerified && !initialFetchDone.current) {
      initialFetchDone.current = true;
      fetchUsage(true);
    }
  }, [autoFetchOnStale, isStale, isCliVerified, fetchUsage]);

  // Fetch when becoming active (if stale or no data)
  useEffect(() => {
    if (!isActive || !isCliVerified) return;

    if (!claudeUsage || isStale) {
      fetchUsage();
    }
  }, [isActive, isCliVerified, claudeUsage, isStale, fetchUsage]);

  // Subscribe to usage:updated WebSocket events for real-time updates
  useEffect(() => {
    if (!isCliVerified) return;

    const api = getElectronAPI();
    if (!api.pushEvents?.onUsageUpdated) return;

    const unsubscribe = api.pushEvents.onUsageUpdated((payload) => {
      if (payload.provider === 'claude' && payload.usage) {
        setClaudeUsage(payload.usage as any);
        logger.debug('Claude usage updated via WebSocket event');
      }
    });

    return unsubscribe;
  }, [isCliVerified, setClaudeUsage]);

  // Countdown timer for next refresh (ticks every second when active)
  const [refreshCountdown, setRefreshCountdown] = useState(REFRESH_INTERVAL_SECONDS);

  useEffect(() => {
    if (!isActive || !isCliVerified) return;

    setRefreshCountdown(REFRESH_INTERVAL_SECONDS);

    const countdownId = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          fetchUsage(true);
          return REFRESH_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownId);
  }, [isActive, isCliVerified, fetchUsage]);

  // Derived: Max percentage for quick status check
  const maxPercentage = useMemo(() => {
    if (!claudeUsage) return 0;
    return Math.max(claudeUsage.sessionPercentage || 0, claudeUsage.weeklyPercentage || 0);
  }, [claudeUsage]);

  // Derived: Check if usage is at or near limit
  const isAtLimit = useMemo(() => {
    if (!claudeUsage) return false;
    return claudeUsage.sessionPercentage >= 100 || claudeUsage.weeklyPercentage >= 100;
  }, [claudeUsage]);

  const isNearLimit = useMemo(() => {
    if (!claudeUsage) return false;
    return maxPercentage >= 75;
  }, [claudeUsage, maxPercentage]);

  // Reset countdown on manual refresh
  const refresh = useCallback(() => {
    setRefreshCountdown(REFRESH_INTERVAL_SECONDS);
    return fetchUsage(false);
  }, [fetchUsage]);

  const refreshSilent = useCallback(() => {
    setRefreshCountdown(REFRESH_INTERVAL_SECONDS);
    return fetchUsage(true);
  }, [fetchUsage]);

  return {
    // Data
    usage: claudeUsage,
    lastUpdated: claudeUsageLastUpdated,

    // State
    loading,
    error,
    isStale,
    isCliVerified,
    refreshCountdown: isActive ? refreshCountdown : null,

    // Derived
    maxPercentage,
    isAtLimit,
    isNearLimit,

    // Actions
    refresh,
    refreshSilent,
  };
}

/**
 * Hook for tracking Codex API usage (OpenAI)
 *
 * Similar to useClaudeUsageTracking but for Codex/OpenAI.
 * API calls are routed through cachedGet for deduplication and TTL caching.
 */
export function useCodexUsageTracking(
  options: {
    isActive?: boolean;
    autoFetchOnStale?: boolean;
  } = {}
) {
  const { isActive = false, autoFetchOnStale = true } = options;

  // Store state
  const { codexUsage, codexUsageLastUpdated, setCodexUsage } = useAppStore(
    useShallow((state) => ({
      codexUsage: state.codexUsage,
      codexUsageLastUpdated: state.codexUsageLastUpdated,
      setCodexUsage: state.setCodexUsage,
    }))
  );

  const codexAuthStatus = useSetupStore((state) => state.codexAuthStatus);

  // Local state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UsageError | null>(null);
  const [isStale, setIsStale] = useState(() => calculateIsStale(codexUsageLastUpdated));

  // Track if initial fetch has been done
  const initialFetchDone = useRef(false);

  // Check if authenticated
  const isAuthenticated = useMemo(() => {
    return codexAuthStatus?.authenticated ?? false;
  }, [codexAuthStatus]);

  // Update staleness when lastUpdated changes
  useEffect(() => {
    setIsStale(calculateIsStale(codexUsageLastUpdated));
  }, [codexUsageLastUpdated]);

  // Periodically recalculate staleness
  useEffect(() => {
    const checkStaleness = () => {
      setIsStale(calculateIsStale(codexUsageLastUpdated));
    };

    const intervalId = setInterval(checkStaleness, STALENESS_CHECK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [codexUsageLastUpdated]);

  // Fetch usage data
  const fetchUsage = useCallback(
    async (isAutoRefresh = false) => {
      if (!isAutoRefresh) setLoading(true);
      setError(null);

      try {
        const api = getElectronAPI();
        if (!api.codex) {
          setError({
            code: USAGE_ERROR_CODES.API_BRIDGE_UNAVAILABLE,
            message: 'Codex API bridge not available',
          });
          return;
        }

        const data = await api.codex.getUsage();

        if ('error' in data) {
          const isNotAvailable =
            data.message?.includes('not available') || data.message?.includes('does not provide');

          setError({
            code: isNotAvailable ? USAGE_ERROR_CODES.NOT_AVAILABLE : USAGE_ERROR_CODES.AUTH_ERROR,
            message: data.message || data.error,
          });
          return;
        }

        setCodexUsage(data);
        logger.debug('Codex usage fetched successfully');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch usage';
        logger.error('Failed to fetch Codex usage:', message);
        setError({
          code: USAGE_ERROR_CODES.UNKNOWN,
          message,
        });
      } finally {
        if (!isAutoRefresh) setLoading(false);
      }
    },
    [setCodexUsage]
  );

  // Auto-fetch on mount if data is stale
  useEffect(() => {
    if (autoFetchOnStale && isStale && isAuthenticated && !initialFetchDone.current) {
      initialFetchDone.current = true;
      fetchUsage(true);
    }
  }, [autoFetchOnStale, isStale, isAuthenticated, fetchUsage]);

  // Fetch when becoming active
  useEffect(() => {
    if (!isActive || !isAuthenticated) return;

    if (!codexUsage || isStale) {
      fetchUsage();
    }
  }, [isActive, isAuthenticated, codexUsage, isStale, fetchUsage]);

  // Countdown timer for next refresh (ticks every second when active)
  const [refreshCountdown, setRefreshCountdown] = useState(REFRESH_INTERVAL_SECONDS);

  useEffect(() => {
    if (!isActive || !isAuthenticated) return;

    setRefreshCountdown(REFRESH_INTERVAL_SECONDS);

    const countdownId = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          fetchUsage(true);
          return REFRESH_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownId);
  }, [isActive, isAuthenticated, fetchUsage]);

  // Derived: Max percentage from rate limits
  const maxPercentage = useMemo(() => {
    if (!codexUsage?.rateLimits) return 0;
    return Math.max(
      codexUsage.rateLimits.primary?.usedPercent || 0,
      codexUsage.rateLimits.secondary?.usedPercent || 0
    );
  }, [codexUsage]);

  // Reset countdown on manual refresh
  const refresh = useCallback(() => {
    setRefreshCountdown(REFRESH_INTERVAL_SECONDS);
    return fetchUsage(false);
  }, [fetchUsage]);

  const refreshSilent = useCallback(() => {
    setRefreshCountdown(REFRESH_INTERVAL_SECONDS);
    return fetchUsage(true);
  }, [fetchUsage]);

  return {
    // Data
    usage: codexUsage,
    lastUpdated: codexUsageLastUpdated,

    // State
    loading,
    error,
    isStale,
    isAuthenticated,
    refreshCountdown: isActive ? refreshCountdown : null,

    // Derived
    maxPercentage,

    // Actions
    refresh,
    refreshSilent,
  };
}

/**
 * Combined usage tracking hook for both Claude and Codex
 *
 * Useful for components that need to display usage from multiple providers.
 */
export function useUsageTracking(
  options: {
    isActive?: boolean;
    autoFetchOnStale?: boolean;
  } = {}
) {
  const claude = useClaudeUsageTracking(options);
  const codex = useCodexUsageTracking(options);

  // Determine the "primary" provider based on which has higher usage or is authenticated
  const primaryProvider = useMemo(() => {
    if (claude.isCliVerified && !codex.isAuthenticated) return 'claude';
    if (!claude.isCliVerified && codex.isAuthenticated) return 'codex';

    // Both authenticated - return the one with higher usage
    return claude.maxPercentage >= codex.maxPercentage ? 'claude' : 'codex';
  }, [claude.isCliVerified, claude.maxPercentage, codex.isAuthenticated, codex.maxPercentage]);

  // Combined max percentage
  const maxPercentage = useMemo(() => {
    return Math.max(claude.maxPercentage, codex.maxPercentage);
  }, [claude.maxPercentage, codex.maxPercentage]);

  // Combined staleness
  const isAnyStale = claude.isStale || codex.isStale;

  // Combined loading
  const isAnyLoading = claude.loading || codex.loading;

  // Refresh all providers
  const refreshAll = useCallback(() => {
    if (claude.isCliVerified) claude.refresh();
    if (codex.isAuthenticated) codex.refresh();
  }, [claude, codex]);

  return {
    claude,
    codex,

    // Convenience properties
    primaryProvider,
    maxPercentage,
    isAnyStale,
    isAnyLoading,

    // Actions
    refreshAll,
  };
}

// Re-export types for convenience
export type { ClaudeUsage, CodexUsage };
