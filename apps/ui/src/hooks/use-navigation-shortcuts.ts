import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { createLogger } from '@dmaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore, type ThemeMode } from '@/store/app-store';
import { toggleLayer } from '@/store/layer-store';
import { showBoardTab } from '@/store/center-store';
import { useWorkbenchStore } from '@/store/workbench-store';
import { initializeProject, hasAppSpec, hasDMakerDir } from '@/lib/project-init';
import {
  useKeyboardShortcuts,
  useKeyboardShortcutsConfig,
  type KeyboardShortcut,
} from '@/hooks/use-keyboard-shortcuts';

const logger = createLogger('NavigationShortcuts');

/**
 * Global navigation shortcuts and the "open project folder" flow.
 *
 * Previously lived in the top navigation bar; the sidebar now owns the app
 * chrome, so the shortcut registration moved here to keep a single owner.
 *
 * @returns `openFolder` — opens the OS folder picker and initializes the
 * selected directory as a DMaker project.
 */
export function useNavigationShortcuts(): { openFolder: () => Promise<void> } {
  const {
    trashedProjects,
    currentProject,
    projectHistory,
    upsertAndSetCurrentProject,
    cyclePrevProject,
    cycleNextProject,
    theme: globalTheme,
  } = useAppStore(
    useShallow((state) => ({
      trashedProjects: state.trashedProjects,
      currentProject: state.currentProject,
      projectHistory: state.projectHistory,
      upsertAndSetCurrentProject: state.upsertAndSetCurrentProject,
      cyclePrevProject: state.cyclePrevProject,
      cycleNextProject: state.cycleNextProject,
      theme: state.theme,
    }))
  );

  const shortcuts = useKeyboardShortcutsConfig();

  /**
   * Opens the system folder selection dialog and initializes the selected project.
   */
  const openFolder = useCallback(async () => {
    const api = getElectronAPI();
    const result = await api.openDirectory();

    if (result.canceled || !result.filePaths[0]) return;

    const path = result.filePaths[0];
    // Extract folder name from path (works on both Windows and Mac/Linux)
    const name = path.split(/[/\\]/).filter(Boolean).pop() || 'Untitled Project';

    try {
      // Check if this is a brand new project (no .dmaker directory)
      const hadDMakerDir = await hasDMakerDir(path);

      // Initialize the .dmaker directory structure
      const initResult = await initializeProject(path);

      if (!initResult.success) {
        toast.error('Failed to initialize project', {
          description: initResult.error || 'Unknown error occurred',
        });
        return;
      }

      // Upsert project and set as current (handles both create and update cases)
      // Theme preservation is handled by the store action
      const trashedProject = trashedProjects.find((p) => p.path === path);
      const effectiveTheme =
        (trashedProject?.theme as ThemeMode | undefined) ||
        (currentProject?.theme as ThemeMode | undefined) ||
        globalTheme;
      upsertAndSetCurrentProject(path, name, effectiveTheme);

      // Check if app_spec.txt exists
      const specExists = await hasAppSpec(path);

      if (!hadDMakerDir && !specExists) {
        toast.success('Project opened', {
          description: `Opened ${name}. Let's set up your app specification!`,
        });
      } else if (initResult.createdFiles && initResult.createdFiles.length > 0) {
        toast.success(initResult.isNewProject ? 'Project initialized' : 'Project updated', {
          description: `Set up ${initResult.createdFiles.length} file(s) in .dmaker`,
        });
      } else {
        toast.success('Project opened', { description: `Opened ${name}` });
      }
    } catch (error) {
      logger.error('Failed to open project:', error);
      toast.error('Failed to open project', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [trashedProjects, upsertAndSetCurrentProject, currentProject, globalTheme]);

  const navigationShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcutsList: KeyboardShortcut[] = [];

    // Open project shortcut - opens the folder selection dialog directly
    shortcutsList.push({
      key: shortcuts.openProject,
      action: () => openFolder(),
      description: 'Open folder selection dialog',
    });

    // Project picker - the command palette is now the project switcher
    shortcutsList.push({
      key: shortcuts.projectPicker,
      action: () => useWorkbenchStore.getState().setCommandPaletteOpen(true),
      description: 'Open project picker (command palette)',
    });

    // Project cycling shortcuts - only when we have project history
    if (projectHistory.length > 1) {
      shortcutsList.push({
        key: shortcuts.cyclePrevProject,
        action: () => cyclePrevProject(),
        description: 'Cycle to previous project (MRU)',
      });
      shortcutsList.push({
        key: shortcuts.cycleNextProject,
        action: () => cycleNextProject(),
        description: 'Cycle to next project (LRU)',
      });
    }

    // Only enable nav shortcuts if there's a current project
    if (currentProject) {
      // Board shortcut - bring the board tab forward; nothing else closes
      shortcutsList.push({
        key: shortcuts.board,
        action: () => showBoardTab(),
        description: 'Show the board tab',
      });

      shortcutsList.push({
        key: shortcuts.agent,
        action: () => showBoardTab(),
        description: 'Show the board tab (includes Agent Chat)',
      });

      // Tool shortcuts - toggle layers
      shortcutsList.push({
        key: shortcuts.terminal,
        action: () => toggleLayer('terminal'),
        description: 'Toggle Terminal',
      });

      shortcutsList.push({
        key: shortcuts.ideation,
        action: () => toggleLayer('ideation'),
        description: 'Toggle Ideation',
      });

      shortcutsList.push({
        key: shortcuts.spec,
        action: () => toggleLayer('spec'),
        description: 'Toggle Spec Editor',
      });

      shortcutsList.push({
        key: shortcuts.memory,
        action: () => toggleLayer('memory'),
        description: 'Toggle Memory',
      });

      shortcutsList.push({
        key: shortcuts.githubPrs,
        action: () => toggleLayer('github-prs'),
        description: 'Toggle GitHub Pull Requests',
      });

      shortcutsList.push({
        key: shortcuts.projectSettings,
        action: () => toggleLayer('project-settings'),
        description: 'Toggle Project Settings',
      });

      // Global settings shortcut
      shortcutsList.push({
        key: shortcuts.settings,
        action: () => toggleLayer('settings'),
        description: 'Toggle Global Settings',
      });
    }

    return shortcutsList;
  }, [
    shortcuts,
    currentProject,
    openFolder,
    projectHistory.length,
    cyclePrevProject,
    cycleNextProject,
  ]);

  useKeyboardShortcuts(navigationShortcuts);

  return { openFolder };
}
