import { useState, useCallback, useEffect, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI, type Project } from '@/lib/electron';
import type { SessionListItem } from '@/types/electron';

const logger = createLogger('ProjectSwitchForSessions');

/**
 * Selector for the current project from app store
 */
const selectCurrentProject = (state: ReturnType<typeof useAppStore.getState>) =>
  state.currentProject;

export interface UseProjectSwitchForSessionsOptions {
  /** Initial project to load sessions for (optional, defaults to currentProject from store) */
  initialProject?: Project | null;
  /** Whether to automatically load sessions on mount and project change */
  autoLoad?: boolean;
}

export interface UseProjectSwitchForSessionsResult {
  /** The currently selected project for sessions (can differ from global currentProject) */
  selectedProject: Project | null;
  /** List of sessions filtered by the selected project */
  sessions: SessionListItem[];
  /** Whether sessions are currently being loaded */
  isLoading: boolean;
  /** Error message if session loading failed */
  error: string | null;
  /** Switch to a different project and load its sessions */
  switchProject: (project: Project | null) => Promise<void>;
  /** Reload sessions for the current project */
  reloadSessions: () => Promise<void>;
  /** Reset the session state (clear sessions and selected project) */
  resetSessionState: () => void;
}

/**
 * Hook to handle project context switching for agent sessions.
 *
 * This hook provides a way to switch between projects and load sessions
 * specific to that project without triggering a full page refresh. It maintains
 * a separate project selection state that can be used independently of the
 * global currentProject in the app store.
 *
 * Features:
 * - Loads sessions filtered by project path
 * - Tracks project changes and reloads sessions automatically
 * - Provides loading and error states
 * - Race condition protection for async operations
 *
 * @example
 * ```tsx
 * const {
 *   selectedProject,
 *   sessions,
 *   isLoading,
 *   switchProject
 * } = useProjectSwitchForSessions();
 *
 * // Switch to a different project
 * await switchProject(newProject);
 * ```
 */
export function useProjectSwitchForSessions(
  options: UseProjectSwitchForSessionsOptions = {}
): UseProjectSwitchForSessionsResult {
  const { initialProject, autoLoad = true } = options;

  // Get global project state from store
  const globalCurrentProject = useAppStore(selectCurrentProject);

  // Local state for sessions and project selection
  const [selectedProject, setSelectedProject] = useState<Project | null>(
    initialProject ?? globalCurrentProject
  );
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track previous project path for change detection
  const prevProjectPathRef = useRef<string | null>(null);
  // Track current loading request to handle race conditions
  const loadingRequestRef = useRef<number>(0);
  // Track if initial load has happened
  const initialLoadRef = useRef(false);

  /**
   * Load sessions for a given project path
   */
  const loadSessionsForProject = useCallback(async (projectPath: string | null) => {
    if (!projectPath) {
      setSessions([]);
      setError(null);
      return;
    }

    // Increment request counter for race condition protection
    const requestId = ++loadingRequestRef.current;

    setIsLoading(true);
    setError(null);

    try {
      const api = getElectronAPI();
      if (!api?.sessions) {
        throw new Error('Sessions API not available');
      }

      // Load all active sessions
      const result = await api.sessions.list(true);

      // Race condition check: ignore stale results
      if (loadingRequestRef.current !== requestId) {
        logger.info('Ignoring stale session load result');
        return;
      }

      if (result.success && result.sessions) {
        // Filter sessions by project path and exclude archived
        const projectSessions = result.sessions.filter(
          (session) => session.projectPath === projectPath && !session.isArchived
        );

        // Sort by most recently updated
        projectSessions.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        setSessions(projectSessions);
        logger.info(`Loaded ${projectSessions.length} sessions for project: ${projectPath}`);
      } else {
        throw new Error(result.error || 'Failed to load sessions');
      }
    } catch (err) {
      // Race condition check
      if (loadingRequestRef.current !== requestId) {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'Unknown error loading sessions';
      logger.error('Failed to load sessions:', errorMessage);
      setError(errorMessage);
      setSessions([]);
    } finally {
      // Only update loading state if this is still the current request
      if (loadingRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  /**
   * Switch to a different project and load its sessions
   */
  const switchProject = useCallback(
    async (project: Project | null) => {
      const newPath = project?.path ?? null;
      const currentPath = selectedProject?.path ?? null;

      // No change needed if same project
      if (newPath === currentPath) {
        return;
      }

      logger.info(`Switching project from ${currentPath} to ${newPath}`);

      // Update selected project
      setSelectedProject(project);

      // Clear sessions immediately to prevent showing stale data
      setSessions([]);
      setError(null);

      // Load sessions for the new project
      await loadSessionsForProject(newPath);
    },
    [selectedProject, loadSessionsForProject]
  );

  /**
   * Reload sessions for the current project
   */
  const reloadSessions = useCallback(async () => {
    await loadSessionsForProject(selectedProject?.path ?? null);
  }, [selectedProject, loadSessionsForProject]);

  /**
   * Reset the session state (clear sessions and selected project)
   */
  const resetSessionState = useCallback(() => {
    setSessions([]);
    setSelectedProject(null);
    setError(null);
    prevProjectPathRef.current = null;
  }, []);

  // Sync with global current project when it changes (if not using initialProject)
  useEffect(() => {
    // Only sync if we didn't receive an explicit initialProject
    if (initialProject !== undefined) {
      return;
    }

    const newGlobalPath = globalCurrentProject?.path ?? null;
    const currentSelectedPath = selectedProject?.path ?? null;

    // Only update if global project actually changed and differs from selection
    if (newGlobalPath !== currentSelectedPath) {
      logger.info('Global project changed, syncing to:', newGlobalPath);
      setSelectedProject(globalCurrentProject);
    }
  }, [globalCurrentProject, initialProject, selectedProject?.path]);

  // Load sessions when selected project changes
  useEffect(() => {
    if (!autoLoad) {
      return;
    }

    const currentPath = selectedProject?.path ?? null;
    const previousPath = prevProjectPathRef.current;

    // Skip if path hasn't changed (except for initial load)
    if (currentPath === previousPath && initialLoadRef.current) {
      return;
    }

    // Update ref for next comparison
    prevProjectPathRef.current = currentPath;
    initialLoadRef.current = true;

    // Load sessions for the new project
    loadSessionsForProject(currentPath);
  }, [selectedProject?.path, autoLoad, loadSessionsForProject]);

  return {
    selectedProject,
    sessions,
    isLoading,
    error,
    switchProject,
    reloadSessions,
    resetSessionState,
  };
}
