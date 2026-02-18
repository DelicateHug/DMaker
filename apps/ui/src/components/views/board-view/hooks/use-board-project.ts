import { useState, useCallback, useEffect, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';
import type { Project } from '@/lib/electron';

const logger = createLogger('BoardProject');

export interface UseBoardProjectOptions {
  /**
   * If true, keeps the board project in sync with global currentProject changes.
   * Default is false - board project only syncs on initial mount.
   */
  syncWithGlobal?: boolean;
}

export interface UseBoardProjectResult {
  /**
   * The currently selected project for the board view.
   * This can differ from the global currentProject.
   */
  boardSelectedProject: Project | null;

  /**
   * Set the board's selected project.
   * This does NOT update the global currentProject.
   */
  setBoardSelectedProject: (project: Project | null) => void;

  /**
   * Whether the board project differs from the global project.
   * Useful for showing visual indicators.
   */
  isDifferentFromGlobal: boolean;

  /**
   * Sync the board project back to match the global currentProject.
   * Call this if the user wants to reset to the global project.
   */
  syncToGlobal: () => void;
}

/**
 * Hook to manage board-scoped project selection.
 *
 * This hook provides a way to select projects specifically for the board view
 * without affecting the global currentProject state. This allows users to browse
 * features from different projects in the board while keeping their agent sessions
 * and terminal working in the original project.
 *
 * Features:
 * - Initializes from global currentProject on mount
 * - Does NOT auto-sync with global project changes (by default)
 * - Provides comparison with global project for UI indicators
 * - Allows manual sync back to global project
 *
 * @example
 * ```tsx
 * const {
 *   boardSelectedProject,
 *   setBoardSelectedProject,
 *   isDifferentFromGlobal
 * } = useBoardProject();
 *
 * // Switch board to a different project (doesn't affect global state)
 * setBoardSelectedProject(otherProject);
 *
 * // Show indicator when board project differs from global
 * {isDifferentFromGlobal && <Badge>Viewing different project</Badge>}
 * ```
 */
export function useBoardProject(options: UseBoardProjectOptions = {}): UseBoardProjectResult {
  const { syncWithGlobal = false } = options;

  // Get global project state from store
  const globalCurrentProject = useAppStore((state) => state.currentProject);

  // Track if this is the initial mount
  const isInitialMountRef = useRef(true);

  // Local state for board-scoped project selection
  // Initialized to global project on mount
  const [boardSelectedProject, setBoardSelectedProjectState] = useState<Project | null>(
    globalCurrentProject
  );

  /**
   * Set the board's selected project (without affecting global state)
   */
  const setBoardSelectedProject = useCallback(
    (project: Project | null) => {
      const newPath = project?.path ?? null;
      const currentPath = boardSelectedProject?.path ?? null;

      // No change needed if same project
      if (newPath === currentPath) {
        return;
      }

      logger.info(`Board project changed from ${currentPath} to ${newPath}`);
      setBoardSelectedProjectState(project);
    },
    [boardSelectedProject]
  );

  /**
   * Sync the board project back to match the global currentProject
   */
  const syncToGlobal = useCallback(() => {
    if (boardSelectedProject?.path !== globalCurrentProject?.path) {
      logger.info('Syncing board project to global:', globalCurrentProject?.path ?? 'null');
      setBoardSelectedProjectState(globalCurrentProject);
    }
  }, [globalCurrentProject, boardSelectedProject]);

  // Sync with global project on initial mount
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      // Set initial value to match global project
      if (globalCurrentProject?.path !== boardSelectedProject?.path) {
        logger.info('Initial sync to global project:', globalCurrentProject?.path ?? 'null');
        setBoardSelectedProjectState(globalCurrentProject);
      }
      return;
    }

    // After initial mount, only sync if syncWithGlobal is enabled
    if (syncWithGlobal) {
      logger.info('Auto-syncing board project to global:', globalCurrentProject?.path ?? 'null');
      setBoardSelectedProjectState(globalCurrentProject);
    }
  }, [globalCurrentProject, syncWithGlobal]);

  // Calculate whether board project differs from global
  const isDifferentFromGlobal =
    (boardSelectedProject?.path ?? null) !== (globalCurrentProject?.path ?? null);

  return {
    boardSelectedProject,
    setBoardSelectedProject,
    isDifferentFromGlobal,
    syncToGlobal,
  };
}
