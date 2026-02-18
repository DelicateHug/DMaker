/**
 * Remote Sync Hook - Auto-pull feature for team collaboration
 *
 * This hook provides automatic synchronization of features from remote repositories.
 * It periodically checks for changes to the .automaker directory and pulls updates
 * when detected, enabling team collaboration on features.
 *
 * Features:
 * - Automatic polling for remote changes at configurable intervals
 * - Detection of remote modifications to .automaker directory
 * - Graceful pull with conflict detection
 * - Sync status indicators for UI feedback
 * - Manual sync trigger support
 */

import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';

const logger = createLogger('RemoteSync');

// Default polling interval (in milliseconds)
const DEFAULT_POLL_INTERVAL_MS = 60000; // 60 seconds

// Minimum polling interval to prevent excessive requests
const MIN_POLL_INTERVAL_MS = 10000; // 10 seconds

export type RemoteSyncStatus =
  | 'idle'
  | 'checking'
  | 'pulling'
  | 'up-to-date'
  | 'has-changes'
  | 'error'
  | 'conflict'
  | 'no-remote';

export interface RemoteSyncState {
  /** Current sync status */
  status: RemoteSyncStatus;
  /** Last successful sync timestamp */
  lastSyncedAt: Date | null;
  /** Last check timestamp */
  lastCheckedAt: Date | null;
  /** Number of commits behind remote */
  commitsBehind: number;
  /** Number of commits ahead of remote */
  commitsAhead: number;
  /** Whether the local repo has uncommitted changes */
  hasLocalChanges: boolean;
  /** Error message if status is 'error' */
  error: string | null;
  /** Whether auto-sync is enabled */
  autoSyncEnabled: boolean;
  /** Whether a remote is configured for this project */
  hasRemote: boolean;
  /** Current branch name */
  currentBranch: string | null;
}

interface UseRemoteSyncOptions {
  /** Enable or disable auto-sync (default: true) */
  enabled?: boolean;
  /** Polling interval in milliseconds (default: 30000) */
  pollIntervalMs?: number;
  /** Callback when features are updated from remote */
  onFeaturesUpdated?: () => void;
}

interface RemoteCheckResult {
  success: boolean;
  hasChanges: boolean;
  commitsBehind: number;
  commitsAhead: number;
  hasLocalChanges: boolean;
  currentBranch: string | null;
  error?: string;
}

/**
 * Hook for automatic remote synchronization of features
 *
 * Usage:
 * ```tsx
 * const { status, sync, lastSyncedAt } = useRemoteSync({
 *   enabled: true,
 *   pollIntervalMs: 30000,
 *   onFeaturesUpdated: () => loadFeatures(),
 * });
 * ```
 */
export function useRemoteSync(options: UseRemoteSyncOptions = {}) {
  const { enabled = true, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, onFeaturesUpdated } = options;

  const { currentProject, setFeatures } = useAppStore(
    useShallow((state) => ({
      currentProject: state.currentProject,
      setFeatures: state.setFeatures,
    }))
  );

  const [state, setState] = useState<RemoteSyncState>({
    status: 'idle',
    lastSyncedAt: null,
    lastCheckedAt: null,
    commitsBehind: 0,
    commitsAhead: 0,
    hasLocalChanges: false,
    error: null,
    autoSyncEnabled: enabled,
    hasRemote: false,
    currentBranch: null,
  });

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const isCheckingRef = useRef(false);

  // Ensure poll interval is within bounds
  const effectivePollInterval = useMemo(() => {
    return Math.max(MIN_POLL_INTERVAL_MS, pollIntervalMs);
  }, [pollIntervalMs]);

  /**
   * Check if the project has a remote configured
   */
  const checkHasRemote = useCallback(async (projectPath: string): Promise<boolean> => {
    if (!projectPath) return false;

    const api = getElectronAPI();
    if (!api.github?.checkRemote) {
      return false;
    }

    try {
      const result = await api.github.checkRemote(projectPath);
      return result.success && result.hasGitHubRemote === true;
    } catch {
      return false;
    }
  }, []);

  /**
   * Check if remote has changes compared to local
   */
  const checkRemoteStatus = useCallback(async (): Promise<RemoteCheckResult> => {
    if (!currentProject?.path) {
      return {
        success: false,
        hasChanges: false,
        commitsBehind: 0,
        commitsAhead: 0,
        hasLocalChanges: false,
        currentBranch: null,
        error: 'No project selected',
      };
    }

    const api = getElectronAPI();
    if (!api.worktree) {
      return {
        success: false,
        hasChanges: false,
        commitsBehind: 0,
        commitsAhead: 0,
        hasLocalChanges: false,
        currentBranch: null,
        error: 'Worktree API not available',
      };
    }

    try {
      // First, check if we have a remote configured
      const hasRemote = await checkHasRemote(currentProject.path);
      if (!hasRemote) {
        return {
          success: true,
          hasChanges: false,
          commitsBehind: 0,
          commitsAhead: 0,
          hasLocalChanges: false,
          currentBranch: null,
        };
      }

      // Use listBranches which fetches from remote and returns ahead/behind counts
      const branchResult = await api.worktree.listBranches(currentProject.path, true);

      if (!branchResult.success || !branchResult.result) {
        // Handle non-git repos or repos without commits gracefully
        if (branchResult.code === 'NOT_GIT_REPO' || branchResult.code === 'NO_COMMITS') {
          return {
            success: true,
            hasChanges: false,
            commitsBehind: 0,
            commitsAhead: 0,
            hasLocalChanges: false,
            currentBranch: null,
          };
        }
        return {
          success: false,
          hasChanges: false,
          commitsBehind: 0,
          commitsAhead: 0,
          hasLocalChanges: false,
          currentBranch: null,
          error: branchResult.error || 'Failed to get branch status',
        };
      }

      const { currentBranch, behindCount, aheadCount } = branchResult.result;

      // Check for local changes using getStatus
      const statusResult = await api.worktree.getStatus(currentProject.path, '');
      const hasLocalChanges = statusResult.success && (statusResult.modifiedFiles ?? 0) > 0;

      return {
        success: true,
        hasChanges: behindCount > 0,
        commitsBehind: behindCount,
        commitsAhead: aheadCount,
        hasLocalChanges,
        currentBranch,
      };
    } catch (error) {
      logger.error('Failed to check remote status:', error);
      return {
        success: false,
        hasChanges: false,
        commitsBehind: 0,
        commitsAhead: 0,
        hasLocalChanges: false,
        currentBranch: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, [currentProject?.path, checkHasRemote]);

  /**
   * Pull latest changes from remote
   */
  const pullFromRemote = useCallback(async (): Promise<boolean> => {
    if (!currentProject?.path) {
      logger.warn('Cannot pull: No project selected');
      return false;
    }

    const api = getElectronAPI();
    if (!api.worktree?.pull) {
      logger.warn('Pull API not available');
      return false;
    }

    try {
      setState((prev) => ({ ...prev, status: 'pulling' }));

      // Pull from the project's main directory
      const result = await api.worktree.pull(currentProject.path);

      if (!result.success) {
        // Check for conflict
        if (result.error?.includes('local changes') || result.error?.includes('conflict')) {
          setState((prev) => ({
            ...prev,
            status: 'conflict',
            error: result.error || 'Conflict detected',
          }));
          return false;
        }

        setState((prev) => ({
          ...prev,
          status: 'error',
          error: result.error || 'Pull failed',
        }));
        return false;
      }

      // Pull successful - reload features
      logger.info('Remote sync: Pull successful, reloading features');

      // Reload features from the API
      if (api.features?.getAll) {
        const featuresResult = await api.features.getAll(currentProject.path);
        if (featuresResult.success && featuresResult.features) {
          // Get current features to detect changes
          const currentFeatures = useAppStore.getState().features;
          const currentFeatureMap = new Map(currentFeatures.map((f) => [f.id, f]));

          const featuresWithIds = featuresResult.features.map((f: any, index: number) => {
            const existingFeature = currentFeatureMap.get(f.id);
            const isNew = !existingFeature;
            const hasChanged =
              existingFeature &&
              (existingFeature.description !== f.description ||
                existingFeature.status !== f.status ||
                existingFeature.title !== f.title ||
                existingFeature.category !== f.category);

            // Mark features that were modified by remote sync
            const remoteModifiedInfo =
              (isNew || hasChanged) && f.owner
                ? {
                    remoteModified: true,
                    remoteModifiedBy: f.owner,
                    remoteModifiedAt: new Date().toISOString(),
                  }
                : {};

            return {
              ...f,
              ...remoteModifiedInfo,
              id: f.id || `feature-${index}-${Date.now()}`,
              status: f.status || 'backlog',
              model: f.model || 'opus',
              thinkingLevel: f.thinkingLevel || 'none',
            };
          });
          setFeatures(featuresWithIds);
          onFeaturesUpdated?.();
        }
      }

      setState((prev) => ({
        ...prev,
        status: 'up-to-date',
        lastSyncedAt: new Date(),
        commitsBehind: 0,
        error: null,
      }));

      return true;
    } catch (error) {
      logger.error('Failed to pull from remote:', error);
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Pull failed',
      }));
      return false;
    }
  }, [currentProject?.path, setFeatures, onFeaturesUpdated]);

  /**
   * Perform a sync check and optionally auto-pull if changes detected
   */
  const performSyncCheck = useCallback(
    async (autoPull = true) => {
      if (isCheckingRef.current) {
        logger.debug('Sync check already in progress, skipping');
        return;
      }

      isCheckingRef.current = true;
      setState((prev) => ({ ...prev, status: 'checking' }));

      try {
        const result = await checkRemoteStatus();

        if (!isMountedRef.current) return;

        // Check if we actually have a remote configured
        const hasRemoteConfigured = await checkHasRemote(currentProject?.path || '');

        setState((prev) => ({
          ...prev,
          lastCheckedAt: new Date(),
          commitsBehind: result.commitsBehind,
          commitsAhead: result.commitsAhead,
          hasLocalChanges: result.hasLocalChanges,
          hasRemote: hasRemoteConfigured,
          currentBranch: result.currentBranch,
        }));

        if (!hasRemoteConfigured) {
          setState((prev) => ({
            ...prev,
            status: 'no-remote',
          }));
          return;
        }

        if (!result.success) {
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: result.error || 'Check failed',
          }));
          return;
        }

        if (result.hasChanges) {
          if (autoPull && !result.hasLocalChanges) {
            // Auto-pull if enabled and no local changes
            await pullFromRemote();
          } else if (result.hasLocalChanges) {
            // Has local changes, can't auto-pull
            setState((prev) => ({
              ...prev,
              status: 'has-changes',
            }));
            logger.info('Remote has changes but local has uncommitted changes');
          } else {
            // Has changes but auto-pull not enabled
            setState((prev) => ({
              ...prev,
              status: 'has-changes',
            }));
          }
        } else {
          setState((prev) => ({
            ...prev,
            status: 'up-to-date',
          }));
        }
      } catch (error) {
        logger.error('Sync check failed:', error);
        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: error instanceof Error ? error.message : 'Sync check failed',
          }));
        }
      } finally {
        isCheckingRef.current = false;
      }
    },
    [checkRemoteStatus, pullFromRemote, checkHasRemote, currentProject?.path]
  );

  /**
   * Manual sync trigger - always pulls if changes are available
   */
  const sync = useCallback(async () => {
    const result = await checkRemoteStatus();

    if (!result.success) {
      toast.error('Sync failed', {
        description: result.error || 'Could not check remote status',
      });
      return false;
    }

    if (!result.hasChanges) {
      toast.success('Already up to date');
      setState((prev) => ({
        ...prev,
        status: 'up-to-date',
        lastCheckedAt: new Date(),
      }));
      return true;
    }

    if (result.hasLocalChanges) {
      toast.error('Cannot sync', {
        description: 'You have local changes. Please commit them first.',
      });
      setState((prev) => ({
        ...prev,
        status: 'conflict',
      }));
      return false;
    }

    const success = await pullFromRemote();
    if (success) {
      toast.success('Synced from remote', {
        description: `Pulled ${result.commitsBehind} commit(s)`,
      });
    } else {
      toast.error('Sync failed', {
        description: 'Could not pull from remote',
      });
    }

    return success;
  }, [checkRemoteStatus, pullFromRemote]);

  /**
   * Toggle auto-sync on/off
   */
  const setAutoSyncEnabled = useCallback((enabled: boolean) => {
    setState((prev) => ({ ...prev, autoSyncEnabled: enabled }));
  }, []);

  // Set up polling interval
  useEffect(() => {
    if (!enabled || !state.autoSyncEnabled || !currentProject) {
      // Clear any existing timer
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    // Initial check on mount or when project changes
    performSyncCheck(true);

    // Set up polling
    pollTimerRef.current = setInterval(() => {
      performSyncCheck(true);
    }, effectivePollInterval);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [enabled, state.autoSyncEnabled, currentProject, effectivePollInterval, performSyncCheck]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  // Reset state when project changes
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      status: 'idle',
      lastSyncedAt: null,
      lastCheckedAt: null,
      commitsBehind: 0,
      commitsAhead: 0,
      hasLocalChanges: false,
      error: null,
      hasRemote: false,
      currentBranch: null,
    }));
  }, [currentProject?.path]);

  return {
    ...state,
    sync,
    checkRemoteStatus: () => performSyncCheck(false),
    setAutoSyncEnabled,
    pullFromRemote,
  };
}

/**
 * Get a human-readable sync status message
 */
export function getSyncStatusMessage(state: RemoteSyncState): string {
  switch (state.status) {
    case 'idle':
      return 'Not synced';
    case 'checking':
      return 'Checking for updates...';
    case 'pulling':
      return 'Pulling changes...';
    case 'up-to-date':
      return 'Up to date';
    case 'has-changes':
      return `${state.commitsBehind} commit(s) behind`;
    case 'conflict':
      return 'Sync conflict - local changes present';
    case 'error':
      return state.error || 'Sync error';
    case 'no-remote':
      return 'No remote configured';
    default:
      return 'Unknown status';
  }
}

/**
 * Get sync status icon/indicator for UI
 */
export function getSyncStatusIndicator(status: RemoteSyncStatus): {
  icon: 'cloud' | 'cloud-download' | 'cloud-check' | 'cloud-alert' | 'cloud-off' | 'loader';
  color: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
} {
  switch (status) {
    case 'idle':
      return { icon: 'cloud', color: 'default' };
    case 'checking':
    case 'pulling':
      return { icon: 'loader', color: 'primary' };
    case 'up-to-date':
      return { icon: 'cloud-check', color: 'success' };
    case 'has-changes':
      return { icon: 'cloud-download', color: 'warning' };
    case 'conflict':
      return { icon: 'cloud-alert', color: 'warning' };
    case 'error':
      return { icon: 'cloud-alert', color: 'destructive' };
    case 'no-remote':
      return { icon: 'cloud-off', color: 'default' };
    default:
      return { icon: 'cloud-off', color: 'default' };
  }
}
