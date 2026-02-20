import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore, Feature } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { createLogger } from '@automaker/utils/logger';
import { useBoardProject } from './use-board-project';
import { pendingPersistIds, protectOptimisticUpdate } from './use-board-persistence';
import type { Project } from '@/lib/electron';
import type { FeatureListSummary } from '@automaker/types';

const logger = createLogger('BoardFeatures');

// Board excludes completed features — they are accessed via the self-contained Completed view
const BOARD_STATUS_FILTER = { excludeStatuses: ['completed'] };

// Debounce delay for task progress updates (ms)
const TASK_PROGRESS_DEBOUNCE_MS = 500;

// Interval for periodic background polling (ms)
const POLL_INTERVAL_MS = 10_000;

/**
 * Merge server features with the current local store, preserving local state
 * for any features that have in-flight persist operations.  This prevents a
 * background `loadFeatures()` reload from overwriting optimistic status changes
 * (e.g. user clicked "Verify" but the persist hasn't round-tripped yet).
 */
function mergeServerFeatures(serverFeatures: Feature[], localFeatures: Feature[]): Feature[] {
  if (pendingPersistIds.size === 0) {
    // Fast path — no pending persists, full replacement is safe.
    return serverFeatures;
  }

  const localById = new Map(localFeatures.map((f) => [f.id, f]));
  return serverFeatures.map((sf) => {
    if (pendingPersistIds.has(sf.id)) {
      const local = localById.get(sf.id);
      if (local) {
        // Keep local version (has optimistic updates) but take non-status
        // fields from server in case they were updated elsewhere.
        return {
          ...sf,
          status: local.status,
          completedAt: local.completedAt ?? sf.completedAt,
          startedAt: local.startedAt ?? sf.startedAt,
        };
      }
    }
    return sf;
  });
}

// Feature with project path for multi-project support
export interface FeatureWithProject extends Feature {
  projectPath?: string;
  projectName?: string;
}

interface UseBoardFeaturesProps {
  /**
   * @deprecated Use boardSelectedProject from hook return instead.
   * This prop is kept for backward compatibility during migration.
   */
  currentProject?: { path: string; id: string } | null;
  /**
   * All available projects for "All Projects" mode.
   */
  projects?: Project[];
}

/**
 * Convert a lightweight FeatureListSummary into a Feature-compatible object.
 * Placeholder values are used for heavy fields (description, steps, etc.)
 * so the board can render immediately with titles and statuses.
 */
function summaryToFeature(
  summary: FeatureListSummary,
  projectPath?: string,
  projectName?: string
): Feature {
  return {
    id: summary.id,
    title: summary.title,
    // titleGenerating is a transient client-side state; if it's still true when
    // loaded from the server it means the original generation process is gone.
    // The server clears it on load, but we also clear it here as defense-in-depth.
    titleGenerating: false,
    category: summary.category || 'Uncategorized',
    description: '', // Placeholder — populated in Phase 2
    steps: [], // Placeholder — populated in Phase 2
    status: (summary.status as Feature['status']) || 'backlog',
    priority: summary.priority,
    isFavorite: summary.isFavorite,
    model: summary.model || 'opus',
    thinkingLevel: summary.thinkingLevel || 'none',
    branchName: summary.branchName,
    error: summary.error,
    startedAt: summary.startedAt,
    // GitHub collaboration fields
    githubIssue: summary.githubIssue,
    claimedBy: summary.claimedBy,
    claimedAt: summary.claimedAt,
    // Project info for multi-project support
    projectPath,
    projectName,
  } as Feature;
}

export function useBoardFeatures({
  currentProject: currentProjectProp,
  projects = [],
}: UseBoardFeaturesProps = {}) {
  const { features, setFeatures } = useAppStore(
    useShallow((state) => ({
      features: state.features,
      setFeatures: state.setFeatures,
    }))
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isFullyLoaded, setIsFullyLoaded] = useState(false);
  const [persistedCategories, setPersistedCategories] = useState<string[]>([]);

  // Board-scoped project selection (independent of global currentProject)
  const { boardSelectedProject, setBoardSelectedProject, isDifferentFromGlobal, syncToGlobal } =
    useBoardProject();

  // Board-scoped "show all projects" toggle (independent of global showAllProjects)
  const [showAllProjectsInBoard, setShowAllProjectsInBoard] = useState(false);

  // Use board-selected project, falling back to prop for backward compatibility
  const effectiveProject = boardSelectedProject ?? currentProjectProp ?? null;

  // For "All Projects" mode, we need access to all projects
  const allProjects = projects;

  // Track previous project path to detect project switches
  const prevProjectPathRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);
  const isSwitchingProjectRef = useRef(false);

  // Track whether Phase 2 (full data) is currently in-flight to avoid duplicate requests
  const fullLoadInFlightRef = useRef(false);

  // Generation counter: incremented on every mode/project change.
  // Stale in-flight loads compare their captured generation to the current value
  // and discard results if they don't match, preventing old closures from
  // overwriting newer data.
  const loadGenerationRef = useRef(0);

  // When the in-flight guard prevents a new load, this flag queues a reload
  // to run as soon as the current one finishes.
  const pendingReloadRef = useRef(false);

  // Clear and reload features when board-selected project changes
  // This ensures stale data from a previous project is not displayed
  useEffect(() => {
    const currentPath = effectiveProject?.path ?? null;
    const previousPath = prevProjectPathRef.current;

    // Only trigger on actual project change (not initial mount)
    if (previousPath !== null && currentPath !== previousPath) {
      logger.info(
        `Board project changed from ${previousPath} to ${currentPath}, clearing features`
      );

      // Immediately clear features to prevent showing stale data
      setFeatures([]);
      setPersistedCategories([]);

      // Mark as switching and reset loading state
      isSwitchingProjectRef.current = true;
      isInitialLoadRef.current = true;
      setIsLoading(true);
      setIsFullyLoaded(false);

      // Invalidate any in-flight loads
      loadGenerationRef.current += 1;
    }

    // Update ref for next comparison
    prevProjectPathRef.current = currentPath;
  }, [effectiveProject?.path, setFeatures]);

  // Reset loading state when toggling between single-project and all-projects mode.
  // Without this, Phase 1 (fast summaries) is skipped and the board stays stuck
  // showing features from the previously selected single project.
  const prevShowAllRef = useRef(showAllProjectsInBoard);
  useEffect(() => {
    if (prevShowAllRef.current !== showAllProjectsInBoard) {
      logger.info(
        `Board mode changed: showAllProjects=${showAllProjectsInBoard}, resetting load state`
      );
      prevShowAllRef.current = showAllProjectsInBoard;

      // Reset so Phase 1 runs, giving immediate visual feedback
      isInitialLoadRef.current = true;
      isSwitchingProjectRef.current = true;
      setIsLoading(true);
      setIsFullyLoaded(false);

      // Clear stale single-project features
      setFeatures([]);

      // Invalidate any in-flight loads from the previous mode
      loadGenerationRef.current += 1;
    }
  }, [showAllProjectsInBoard, setFeatures]);

  /**
   * Phase 2: Load full feature data in the background.
   * This replaces the summary-only features in the store with complete Feature objects.
   * Called after Phase 1 completes, or directly on subsequent reloads.
   */
  const loadFullFeatures = useCallback(async () => {
    // If a Phase 2 request is already in-flight, queue a reload instead of
    // silently dropping this request.  The in-flight load will trigger the
    // pending reload in its finally block.
    if (fullLoadInFlightRef.current) {
      logger.info('Phase 2 already in-flight, queuing pending reload');
      pendingReloadRef.current = true;
      return;
    }

    // Capture the current generation so we can detect if a mode/project
    // change happened while this async load was running.
    const myGeneration = loadGenerationRef.current;

    if (showAllProjectsInBoard && allProjects.length > 0) {
      fullLoadInFlightRef.current = true;
      try {
        const api = getElectronAPI();
        if (!api.features) return;

        const featuresApi = api.features;
        const allFeaturesPromises = allProjects.map(async (project) => {
          try {
            const result = await featuresApi.getAll(project.path, false, BOARD_STATUS_FILTER);
            if (result.success && result.features) {
              return result.features.map((f: any, index: number) => ({
                ...f,
                id: f.id || `feature-${index}-${Date.now()}`,
                description: f.description || '',
                category: f.category || 'Uncategorized',
                status: f.status || 'backlog',
                startedAt: f.startedAt,
                model: f.model || 'opus',
                thinkingLevel: f.thinkingLevel || 'none',
                projectPath: project.path,
                projectName: project.name,
              }));
            }
            return [];
          } catch (error) {
            logger.error(`Failed to load full features from project ${project.path}:`, error);
            return [];
          }
        });

        const allFeaturesArrays = await Promise.all(allFeaturesPromises);
        const allFeatures = allFeaturesArrays.flat();

        // Only apply results if no mode/project change happened during the load
        if (myGeneration === loadGenerationRef.current) {
          setFeatures(mergeServerFeatures(allFeatures, useAppStore.getState().features));
          setIsFullyLoaded(true);
          logger.info(
            `Phase 2: Loaded ${allFeatures.length} full features from ${allProjects.length} projects`
          );
        } else {
          logger.info('Phase 2: Discarding stale all-projects result (generation changed)');
        }
      } catch (error) {
        logger.error('Phase 2: Failed to load full features from all projects:', error);
      } finally {
        fullLoadInFlightRef.current = false;
        // If a new load was requested while we were in-flight, run it now
        if (pendingReloadRef.current) {
          pendingReloadRef.current = false;
          loadFullFeatures();
        }
      }
      return;
    }

    // Single project mode
    if (!effectiveProject) return;

    fullLoadInFlightRef.current = true;
    try {
      const api = getElectronAPI();
      if (!api.features) return;

      const result = await api.features.getAll(effectiveProject.path, false, BOARD_STATUS_FILTER);

      if (result.success && result.features) {
        const featuresWithIds = result.features.map((f: any, index: number) => ({
          ...f,
          id: f.id || `feature-${index}-${Date.now()}`,
          description: f.description || '',
          category: f.category || 'Uncategorized',
          status: f.status || 'backlog',
          startedAt: f.startedAt,
          model: f.model || 'opus',
          thinkingLevel: f.thinkingLevel || 'none',
          projectPath: effectiveProject.path,
          projectName: (effectiveProject as { name?: string }).name,
        }));

        // Only apply results if no mode/project change happened during the load
        if (myGeneration === loadGenerationRef.current) {
          setFeatures(mergeServerFeatures(featuresWithIds, useAppStore.getState().features));
          setIsFullyLoaded(true);
          logger.info(`Phase 2: Loaded ${featuresWithIds.length} full features`);
        } else {
          logger.info('Phase 2: Discarding stale single-project result (generation changed)');
        }

        // Check for interrupted features and resume them
        // This handles server restarts where features were in pipeline steps
        if (myGeneration === loadGenerationRef.current && api.autoMode?.resumeInterrupted) {
          try {
            await api.autoMode.resumeInterrupted(effectiveProject.path);
            logger.info('Checked for interrupted features');
          } catch (resumeError) {
            logger.warn('Failed to check for interrupted features:', resumeError);
          }
        }
      } else if (!result.success && result.error) {
        logger.error('Phase 2: API returned error:', result.error);
      }
    } catch (error) {
      logger.error('Phase 2: Failed to load full features:', error);
    } finally {
      fullLoadInFlightRef.current = false;
      // If a new load was requested while we were in-flight, run it now
      if (pendingReloadRef.current) {
        pendingReloadRef.current = false;
        loadFullFeatures();
      }
    }
  }, [effectiveProject, setFeatures, showAllProjectsInBoard, allProjects]);

  /**
   * Two-phase feature loading:
   *
   * Phase 1 (fast): Load lightweight summaries (titles + status) via getListSummaries().
   *   The board renders immediately with summary data. isLoading becomes false.
   *
   * Phase 2 (background): Load full feature data via getAll() in the background.
   *   Replaces summary-only features with complete data. isFullyLoaded becomes true.
   *
   * On subsequent reloads (event-driven), Phase 1 is skipped since the board
   * already has data — only Phase 2 runs to refresh full data silently.
   */
  // IMPORTANT: Do NOT add 'features' to dependency array - it would cause infinite reload loop
  const loadFeatures = useCallback(async () => {
    // ─── "All Projects" mode ───────────────────────────────────────────
    if (showAllProjectsInBoard && allProjects.length > 0) {
      // On initial load / project switch: run Phase 1 (summaries) first
      if (isInitialLoadRef.current) {
        // Only show skeleton on project switches, not on initial app startup.
        // This prevents the heavy skeleton from flashing before features populate.
        if (isSwitchingProjectRef.current) {
          setIsLoading(true);
        }
        setIsFullyLoaded(false);

        try {
          const api = getElectronAPI();
          if (!api.features) {
            logger.error('Features API not available');
            return;
          }

          // Phase 1: Load summaries from all projects in parallel
          const featuresApi = api.features;
          const allSummaryPromises = allProjects.map(async (project) => {
            try {
              const result = await featuresApi.getListSummaries(
                project.path,
                false,
                BOARD_STATUS_FILTER
              );
              if (result.success && result.features) {
                return result.features.map((s) => summaryToFeature(s, project.path, project.name));
              }
              return [];
            } catch (error) {
              logger.error(
                `Phase 1: Failed to load summaries from project ${project.path}:`,
                error
              );
              return [];
            }
          });

          const allSummaryArrays = await Promise.all(allSummaryPromises);
          const allSummaryFeatures = allSummaryArrays.flat();
          setFeatures(allSummaryFeatures);

          logger.info(
            `Phase 1: Loaded ${allSummaryFeatures.length} summaries from ${allProjects.length} projects`
          );
        } catch (error) {
          logger.error('Phase 1: Failed to load summaries from all projects:', error);
        } finally {
          setIsLoading(false);
          isInitialLoadRef.current = false;
          isSwitchingProjectRef.current = false;
        }

        // Phase 2: Load full features in the background (don't await)
        loadFullFeatures();
        return;
      }

      // Subsequent reloads: skip Phase 1, just refresh full data silently
      loadFullFeatures();
      return;
    }

    // ─── Single project mode ───────────────────────────────────────────
    if (!effectiveProject) return;

    // On initial load / project switch: run Phase 1 (summaries) first
    if (isInitialLoadRef.current) {
      // Only show skeleton on project switches, not on initial app startup.
      // This prevents the heavy skeleton from flashing before features populate.
      if (isSwitchingProjectRef.current) {
        setIsLoading(true);
      }
      setIsFullyLoaded(false);

      try {
        const api = getElectronAPI();
        if (!api.features) {
          logger.error('Features API not available');
          return;
        }

        // Phase 1: Load lightweight summaries for quick board rendering
        const summaryResult = await api.features.getListSummaries(
          effectiveProject.path,
          false,
          BOARD_STATUS_FILTER
        );

        if (summaryResult.success && summaryResult.features) {
          const summaryFeatures = summaryResult.features.map((s) =>
            summaryToFeature(s, effectiveProject.path, (effectiveProject as { name?: string }).name)
          );
          setFeatures(summaryFeatures);

          logger.info(`Phase 1: Loaded ${summaryFeatures.length} feature summaries`);
        } else if (!summaryResult.success && 'error' in summaryResult) {
          logger.error('Phase 1: API returned error:', summaryResult.error);
        }
      } catch (error) {
        logger.error('Phase 1: Failed to load feature summaries:', error);
      } finally {
        setIsLoading(false);
        isInitialLoadRef.current = false;
        isSwitchingProjectRef.current = false;
      }

      // Phase 2: Load full features in the background (don't await)
      loadFullFeatures();
      return;
    }

    // Subsequent reloads: skip Phase 1, just refresh full data silently
    loadFullFeatures();
  }, [effectiveProject, setFeatures, showAllProjectsInBoard, allProjects, loadFullFeatures]);

  // Load persisted categories from file
  const loadCategories = useCallback(async () => {
    if (!effectiveProject) return;

    try {
      const api = getElectronAPI();
      const result = await api.readFile(`${effectiveProject.path}/.automaker/categories.json`);

      if (result.success && result.content) {
        const parsed = JSON.parse(result.content);
        if (Array.isArray(parsed)) {
          setPersistedCategories(parsed);
        }
      } else {
        // File doesn't exist, ensure categories are cleared
        setPersistedCategories([]);
      }
    } catch (error) {
      logger.error('Failed to load categories:', error);
      // If file doesn't exist, ensure categories are cleared
      setPersistedCategories([]);
    }
  }, [effectiveProject]);

  // Save a new category to the persisted categories file
  const saveCategory = useCallback(
    async (category: string) => {
      if (!effectiveProject || !category.trim()) return;

      try {
        const api = getElectronAPI();

        // Read existing categories
        let categories: string[] = [...persistedCategories];

        // Add new category if it doesn't exist
        if (!categories.includes(category)) {
          categories.push(category);
          categories.sort(); // Keep sorted

          // Write back to file
          await api.writeFile(
            `${effectiveProject.path}/.automaker/categories.json`,
            JSON.stringify(categories, null, 2)
          );

          // Update state
          setPersistedCategories(categories);
        }
      } catch (error) {
        logger.error('Failed to save category:', error);
      }
    },
    [effectiveProject, persistedCategories]
  );

  // Subscribe to spec regeneration complete events to refresh kanban board
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.specRegeneration) return;

    const unsubscribe = api.specRegeneration.onEvent((event) => {
      // Refresh the kanban board when spec regeneration completes for the board-selected project
      if (
        event.type === 'spec_regeneration_complete' &&
        effectiveProject &&
        event.projectPath === effectiveProject.path
      ) {
        logger.info('Spec regeneration complete, refreshing features');
        loadFeatures();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [effectiveProject, loadFeatures]);

  // Listen for auto mode feature completion and errors to reload features
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.autoMode || !effectiveProject) return;

    const { removeRunningTask } = useAppStore.getState();
    const projectId = effectiveProject.id;

    // Debounced reload for task progress updates
    // This prevents excessive API calls when many task events fire in quick succession
    let taskProgressDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedReloadForTaskProgress = () => {
      if (taskProgressDebounceTimer) {
        clearTimeout(taskProgressDebounceTimer);
      }
      taskProgressDebounceTimer = setTimeout(() => {
        logger.info('Task progress update, reloading features...');
        loadFeatures();
        taskProgressDebounceTimer = null;
      }, TASK_PROGRESS_DEBOUNCE_MS);
    };

    // Debounced full reload for events that need complete data refresh
    // This avoids multiple rapid loadFeatures() calls when several events fire in quick succession
    let fullReloadTimer: ReturnType<typeof setTimeout> | null = null;
    const FULL_RELOAD_DEBOUNCE_MS = 300;
    const debouncedFullReload = () => {
      if (fullReloadTimer) {
        clearTimeout(fullReloadTimer);
      }
      fullReloadTimer = setTimeout(() => {
        loadFeatures();
        fullReloadTimer = null;
      }, FULL_RELOAD_DEBOUNCE_MS);
    };

    /**
     * Update a single feature's status in-place without a full re-fetch.
     * This moves the card to the correct column immediately.
     * A debounced background reload follows to sync full data.
     */
    const updateFeatureStatus = (featureId: string, status: string) => {
      const { features } = useAppStore.getState();
      const updated = features.map((f) =>
        f.id === featureId ? { ...f, status: status as Feature['status'] } : f
      );
      setFeatures(updated);
      // Protect this optimistic update from being overwritten by stale server
      // cache data during subsequent background polls or debounced reloads.
      protectOptimisticUpdate(featureId);
    };

    const unsubscribe = api.autoMode.onEvent((event) => {
      // Use event's projectPath or projectId if available, otherwise use current project
      // Board view only reacts to events for the currently selected project
      const eventProjectId = ('projectId' in event && event.projectId) || projectId;

      if (event.type === 'auto_mode_feature_complete') {
        // Optimistically update the feature status in-place, then sync full data
        if (event.featureId) {
          logger.info('Feature completed, updating status in-place...');
          updateFeatureStatus(event.featureId, 'waiting_approval');
        }
        // Schedule a background reload to get full updated data
        debouncedFullReload();
        // Play ding sound when feature is done (unless muted)
        const { muteDoneSound } = useAppStore.getState();
        if (!muteDoneSound) {
          const audio = new Audio('/sounds/ding.mp3');
          audio.play().catch((err) => logger.warn('Could not play ding sound:', err));
        }
      } else if (event.type === 'plan_approval_required') {
        // Plan approval changes UI state that requires full feature data
        // Use debounced reload to avoid multiple rapid refetches
        logger.info('Plan approval required, scheduling reload...');
        debouncedFullReload();
      } else if (event.type === 'pipeline_step_started') {
        // Optimistically update the feature status to the pipeline step in-place
        if (event.featureId && 'stepId' in event) {
          const stepId = (event as any).stepId as string;
          logger.info(`Pipeline step ${stepId} started, updating status in-place...`);
          updateFeatureStatus(event.featureId, `pipeline_${stepId}`);
        }
        // Schedule a background reload to get full updated data
        debouncedFullReload();
      } else if (event.type === 'auto_mode_error') {
        // Optimistically update status in-place for immediate column move
        if (event.featureId) {
          logger.info('Feature error, updating status in-place...', event.error);
          updateFeatureStatus(event.featureId, 'backlog');
          removeRunningTask(eventProjectId, event.featureId);
        }

        // Schedule background reload for full data sync
        debouncedFullReload();

        // Check for authentication errors and show a more helpful message
        const isAuthError =
          event.errorType === 'authentication' ||
          (event.error &&
            (event.error.includes('Authentication failed') ||
              event.error.includes('Invalid API key')));

        if (isAuthError) {
          toast.error('Authentication Failed', {
            description:
              "Your API key is invalid or expired. Please check Settings or run 'claude login' in terminal.",
            duration: 10000,
          });
        } else {
          toast.error('Agent encountered an error', {
            description: event.error || 'Check the logs for details',
          });
        }
      } else if (event.type === 'auto_mode_feature_start') {
        // Optimistically update status so the card moves to in_progress column immediately
        if (event.featureId) {
          updateFeatureStatus(event.featureId, 'in_progress');
        }
        debouncedReloadForTaskProgress();
      } else if (
        event.type === 'auto_mode_task_started' ||
        event.type === 'auto_mode_task_complete'
      ) {
        // Task progress events - use debounced reload to update planSpec progress
        // without overwhelming the API with requests
        debouncedReloadForTaskProgress();
      }
    });

    return () => {
      unsubscribe();
      // Clean up debounce timers on unmount
      if (taskProgressDebounceTimer) {
        clearTimeout(taskProgressDebounceTimer);
      }
      if (fullReloadTimer) {
        clearTimeout(fullReloadTimer);
      }
    };
  }, [loadFeatures, effectiveProject, setFeatures]);

  useEffect(() => {
    loadFeatures();
  }, [loadFeatures]);

  // Load persisted categories on mount
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // ─── Periodic background polling (every 10 seconds) ───────────────
  // Supplements WebSocket events for reliability. Skips when:
  //   - No project is selected
  //   - A full load is already in-flight
  //   - The browser tab is hidden
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!effectiveProject) return;

    const intervalId = setInterval(() => {
      // Skip if already loading or tab is hidden
      if (fullLoadInFlightRef.current) return;
      if (document.visibilityState === 'hidden') return;

      logger.debug('Periodic poll: refreshing features');
      loadFullFeatures();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [effectiveProject, loadFullFeatures]);

  // Manual refresh callback (for the refresh button)
  const refreshFeatures = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Force Phase 1 + Phase 2 by resetting the initial load flag
      isInitialLoadRef.current = true;
      await loadFeatures();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadFeatures]);

  return {
    features,
    isLoading,
    /** Whether full feature data has been loaded (Phase 2 complete).
     *  When false, features only contain summary data (titles + status).
     *  Use this to show loading indicators on detail-dependent UI elements. */
    isFullyLoaded,
    /** Whether a manual refresh is in-flight */
    isRefreshing,
    persistedCategories,
    loadFeatures,
    /** Force a full refresh (Phase 1 + Phase 2) */
    refreshFeatures,
    loadCategories,
    saveCategory,
    // Board-scoped project selection
    boardSelectedProject,
    setBoardSelectedProject,
    isDifferentFromGlobal,
    syncToGlobal,
    // Board-scoped "show all projects" toggle
    showAllProjectsInBoard,
    setShowAllProjectsInBoard,
  };
}
