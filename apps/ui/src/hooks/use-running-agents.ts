import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import type { FeatureListSummary } from '@automaker/types';

const logger = createLogger('RunningAgents');

/**
 * Selector for running agents state from app store
 */
const selectRunningAgentsState = (state: ReturnType<typeof useAppStore.getState>) => ({
  projects: state.projects,
  autoModeByProject: state.autoModeByProject,
});

/** Fallback polling interval in milliseconds (120 seconds) - WebSocket events handle real-time updates */
const FALLBACK_POLL_INTERVAL_MS = 120000;

/** Fast polling interval when titles are being generated (10 seconds) */
const FAST_POLL_INTERVAL_MS = 10000;

/** Represents a running agent (feature that is in progress) */
export interface RunningAgentFeature {
  featureId: string;
  featureTitle: string;
  titleGenerating?: boolean;
  projectPath: string;
  projectName: string;
  status: string;
}

/** Represents a group of running agents for a single project */
export interface ProjectAgentGroup {
  projectPath: string;
  projectName: string;
  agentCount: number;
  agents: RunningAgentFeature[];
}

/**
 * Hook that fetches running agents (in-progress features) from ALL projects.
 *
 * This hook uses the SAME approach as the board view when "All Projects" is selected:
 * - Fetches lightweight feature summaries from every project via getListSummaries (cached)
 * - Filters to features with status 'in_progress' or that are in the Zustand runningTasks
 * - Polls every 15 seconds with a visible countdown timer
 * - Groups results by project
 *
 * This is completely independent of the current board project selection.
 */
export function useRunningAgents() {
  const [runningAgents, setRunningAgents] = useState<RunningAgentFeature[]>([]);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(FALLBACK_POLL_INTERVAL_MS / 1000);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);
  const isMountedRef = useRef(false);
  // Use a ref for countdown to avoid React state batching issues
  const countdownRef = useRef(FALLBACK_POLL_INTERVAL_MS / 1000);

  // Get all projects and running tasks from Zustand store
  const { projects, autoModeByProject } = useAppStore(useShallow(selectRunningAgentsState));

  // Create a set of all feature IDs that are currently running (from Zustand event tracking)
  const allRunningTaskIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(autoModeByProject).forEach((projectState) => {
      if (projectState?.runningTasks) {
        projectState.runningTasks.forEach((taskId) => ids.add(taskId));
      }
    });
    return ids;
  }, [autoModeByProject]);

  // Store latest values in refs so the fetch function can access them without being a dependency
  const projectsRef = useRef(projects);
  const allRunningTaskIdsRef = useRef(allRunningTaskIds);

  // Keep refs up to date
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    allRunningTaskIdsRef.current = allRunningTaskIds;
  }, [allRunningTaskIds]);

  // Fetch lightweight summaries from ALL projects and filter to running ones
  // Uses getListSummaries (cached) instead of getAll for better performance
  // Note: This function uses refs for projects/runningTaskIds to avoid dependency changes
  const fetchRunningAgents = useCallback(async () => {
    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      logger.debug('Skipping fetch - already in progress');
      return;
    }

    isFetchingRef.current = true;
    setIsRefreshing(true);

    try {
      const api = getElectronAPI();
      if (!api.features) {
        logger.debug('Features API not available');
        setRunningAgents([]);
        return;
      }

      // Use refs to get latest values
      const currentProjects = projectsRef.current;
      const currentRunningTaskIds = allRunningTaskIdsRef.current;

      // No projects? Nothing to fetch
      if (currentProjects.length === 0) {
        logger.debug('No projects available');
        setRunningAgents([]);
        return;
      }

      logger.debug('Fetching feature summaries from all projects', {
        projectCount: currentProjects.length,
      });

      // Fetch lightweight summaries from ALL projects in parallel (cached endpoint)
      const featuresApi = api.features;
      const summaryPromises = currentProjects.map(async (project) => {
        try {
          const result = await featuresApi.getListSummaries(project.path);
          if (result.success && result.features) {
            return result.features.map((s: FeatureListSummary) => ({
              ...s,
              projectPath: project.path,
              projectName: project.name,
            }));
          }
          return [];
        } catch (error) {
          logger.error(`Failed to fetch feature summaries for project ${project.name}:`, error);
          return [];
        }
      });

      const allSummaryArrays = await Promise.all(summaryPromises);
      const allFeatures = allSummaryArrays.flat();

      // Filter to features that are actively running:
      // 1. Feature status is 'in_progress'
      // 2. OR feature ID is in the Zustand runningTasks (event-based tracking from useAutoMode)
      // BUT exclude features that have reached 'waiting_approval' status — they are no longer
      // actively running and should appear in "Recently Completed" instead.
      const runningFeatures = allFeatures.filter((f) => {
        if (f.status === 'waiting_approval') return false;
        const isInProgress = f.status === 'in_progress';
        const isInRunningTasks = currentRunningTaskIds.has(f.id);
        return isInProgress || isInRunningTasks;
      });

      // Convert to RunningAgentFeature format
      const agents: RunningAgentFeature[] = runningFeatures.map((f) => ({
        featureId: f.id,
        featureTitle: f.title || 'Untitled Feature',
        titleGenerating: f.titleGenerating,
        projectPath: f.projectPath,
        projectName: f.projectName,
        status: f.status || 'in_progress',
      }));

      logger.debug('Running agents fetched', {
        totalFeatures: allFeatures.length,
        runningCount: agents.length,
        fromRunningTasks: runningFeatures.filter((f) => currentRunningTaskIds.has(f.id)).length,
        fromStatus: runningFeatures.filter((f) => f.status === 'in_progress').length,
      });

      setRunningAgents(agents);
    } catch (error) {
      logger.error('Error fetching running agents:', error);
    } finally {
      isFetchingRef.current = false;
      setIsRefreshing(false);
    }
  }, []); // No dependencies - uses refs for data

  // Initial fetch on mount (only once)
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      logger.debug('Running agents hook mounted, performing initial fetch');
      fetchRunningAgents();
    }
  }, [fetchRunningAgents]);

  // Check if any agents have titles being generated
  const hasTitleGenerating = useMemo(() => {
    return runningAgents.some((agent) => agent.titleGenerating === true);
  }, [runningAgents]);

  // Subscribe to WebSocket events for real-time updates instead of frequent polling
  // Events trigger immediate re-fetch; fallback polling runs at 120s (or 10s when titles are generating)
  useEffect(() => {
    const api = getElectronAPI();
    const unsubscribers: (() => void)[] = [];

    // Subscribe to feature:status-changed events (feature started, completed, etc.)
    if (api.pushEvents?.onFeatureStatusChanged) {
      unsubscribers.push(
        api.pushEvents.onFeatureStatusChanged(() => {
          logger.debug('Feature status changed event received, re-fetching running agents');
          fetchRunningAgents();
        })
      );
    }

    // Subscribe to auto-mode:event for feature start/complete events
    if (api.autoMode?.onEvent) {
      unsubscribers.push(
        api.autoMode.onEvent((event) => {
          const eventType = (event as any)?.type;
          if (
            eventType === 'auto_mode_feature_start' ||
            eventType === 'auto_mode_feature_complete' ||
            eventType === 'auto_mode_started' ||
            eventType === 'auto_mode_stopped'
          ) {
            logger.debug('Auto-mode event received, re-fetching running agents:', eventType);
            fetchRunningAgents();
          }
        })
      );
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [fetchRunningAgents]);

  // Fallback countdown timer - uses long interval (120s) as safety net
  // Uses faster polling (10s) when titles are being generated
  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    const pollInterval = hasTitleGenerating ? FAST_POLL_INTERVAL_MS : FALLBACK_POLL_INTERVAL_MS;

    if (countdownRef.current > pollInterval / 1000) {
      countdownRef.current = pollInterval / 1000;
      setSecondsUntilRefresh(countdownRef.current);
    }

    timerIntervalRef.current = setInterval(() => {
      countdownRef.current -= 1;

      if (countdownRef.current <= 0) {
        countdownRef.current = pollInterval / 1000;
        fetchRunningAgents();
      }

      setSecondsUntilRefresh(countdownRef.current);
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [fetchRunningAgents, hasTitleGenerating]);

  // Update tray icon count whenever running agents count changes
  useEffect(() => {
    const updateTrayIcon = async () => {
      try {
        const api = getElectronAPI();
        if (api.updateTrayCount) {
          await api.updateTrayCount(runningAgents.length);
          logger.debug('Updated tray icon count', { count: runningAgents.length });
        }
      } catch (error) {
        logger.error('Failed to update tray icon count:', error);
      }
    };

    updateTrayIcon();
  }, [runningAgents.length]);

  // Group running agents by project
  const agentsByProject = useMemo((): ProjectAgentGroup[] => {
    const projectMap = new Map<string, ProjectAgentGroup>();

    for (const agent of runningAgents) {
      const existing = projectMap.get(agent.projectPath);
      if (existing) {
        existing.agents.push(agent);
        existing.agentCount = existing.agents.length;
      } else {
        projectMap.set(agent.projectPath, {
          projectPath: agent.projectPath,
          projectName: agent.projectName,
          agentCount: 1,
          agents: [agent],
        });
      }
    }

    // Sort by project name for consistent ordering
    const groups = Array.from(projectMap.values());
    groups.sort((a, b) => a.projectName.localeCompare(b.projectName));

    return groups;
  }, [runningAgents]);

  // Total count of running agents
  const runningAgentsCount = runningAgents.length;

  return {
    /** Array of all running agents across all projects */
    runningAgents,
    /** Running agents grouped by project */
    agentsByProject,
    /** Total count of running agents */
    runningAgentsCount,
    /** Seconds until next automatic refresh */
    secondsUntilRefresh,
    /** Whether a refresh is currently in progress */
    isRefreshing,
    /** Manually trigger a refresh */
    refetch: fetchRunningAgents,
  };
}
