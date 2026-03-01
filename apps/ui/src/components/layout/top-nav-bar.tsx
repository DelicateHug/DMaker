import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from '@tanstack/react-router';
import {
  Layers,
  CircleDot,
  GitPullRequest,
  GitBranch,
  Lightbulb,
  FileText,
  Brain,
  Terminal,
  Settings,
  Menu,
  X,
  Plus,
  RefreshCw,
  PanelTop,
  CheckCircle2,
  Wand2,
  Bot,
} from 'lucide-react';
import { cn, isMac, pathsEqual } from '@/lib/utils';
import { getProjectIcon } from '@/lib/icon-registry';
import { isElectron, getElectronAPI, type Project } from '@/lib/electron';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, type ThemeMode } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/forms';
import { Label } from '@/components/ui/forms';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays';
import { Slider } from '@/components/ui/forms';
import {
  useKeyboardShortcuts,
  useKeyboardShortcutsConfig,
  type KeyboardShortcut,
} from '@/hooks/use-keyboard-shortcuts';
import { initializeProject, hasAppSpec, hasDMakerDir } from '@/lib/project-init';
import { toast } from 'sonner';
import { createLogger } from '@dmaker/utils/logger';
import { RunningAgentsIndicator } from './running-agents-indicator';
import { DeleteProjectDialog } from '@/components/dialogs';
import { UsagePopover } from '@/components/usage-popover';
import { BoardSearchBar } from '@/components/views/board-view/board-search-bar';
import type {
  StatusTabId,
  StatusTab,
} from '@/components/views/board-view/hooks/use-board-status-tabs';
import { BoardStatusDropdown } from '@/components/views/board-view/components/board-status-dropdown';
import { BoardProjectDropdown } from '@/components/views/board-view/components/board-project-dropdown';
import { BoardFilterDropdown } from '@/components/views/board-view/components/board-filter-dropdown';
import { CompletedFeaturesModal } from '@/components/views/board-view/dialogs';
import { AutoModeModal } from '@/components/dialogs/auto-mode-modal';
import { useBoardControlsStore, getBoardControlsForTopNav } from '@/store/board-controls-store';
import { useIsTablet } from '@/hooks/utilities';
import { useLayerStore, type LayerId } from '@/store/layer-store';

const logger = createLogger('TopNavigationBar');

// Special value for "All Projects" selection
const ALL_PROJECTS_VALUE = '__all_projects__';

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  isCurrent?: boolean;
  hasWorktree?: boolean;
}

interface TopNavigationBarProps {
  className?: string;
  // Git/worktree controls
  onCreateWorktree?: () => void;
  onWorktreeRefresh?: () => void;
  worktreeRefreshTrigger?: number;
  // Board-specific controls (integrated from board-header)
  boardControls?: {
    // Search bar props
    searchQuery: string;
    onSearchChange: (query: string) => void;
    isCreatingSpec: boolean;
    creatingSpecProjectPath?: string;
    // Favorites filter props
    showFavoritesOnly: boolean;
    onShowFavoritesOnlyChange: (show: boolean) => void;
    // Board background props (optional - moved to Settings only)
    onShowBoardBackground?: () => void;
    // Auto mode props
    isAutoModeRunning: boolean;
    runningAgentsCount: number;
    onAutoModeToggle: (enabled: boolean) => void;
    isAutoModeModalOpen: boolean;
    onAutoModeModalOpenChange: (open: boolean) => void;
    // Plan props
    onOpenPlanDialog: () => void;
    hasPendingPlan: boolean;
    onOpenPendingPlan?: () => void;
    // Status filter props
    activeStatusTab: StatusTabId;
    activeStatusTabs?: StatusTabId[];
    onStatusTabChange?: (tabId: StatusTabId) => void;
    onStatusTabToggle?: (tabId: StatusTabId) => void;
    onStatusTabsCommit?: (tabIds: StatusTabId[]) => void;
    onCreateStatus?: (name: string, colorClass: string) => void;
    onDeleteStatus?: (tabId: StatusTabId) => void;
    statusTabs: StatusTab[];
    statusTabCounts: Record<string, number>;
    // Project filter props
    projects?: Project[];
    selectedProjectIds?: string[];
    onProjectSelectionChange?: (projectIds: string[]) => void;
    // Refresh props
    onRefresh?: () => void;
    isRefreshing?: boolean;
    // Mounted state
    isMounted: boolean;
  };
}

/**
 * TopNavigationBar - Single unified navigation bar combining all controls in one row
 *
 * LAYOUT (single row, left to right):
 * - Navigation: Tasks, GitHub, Tools, Git dropdowns
 * - Separator (when on board view)
 * - Board controls: Search, View toggle, Completed, Board settings
 * - Right side: Usage, Auto Mode, Plan, Settings, Agents
 *
 * GLOBAL NAVIGATION CONTROLS:
 * - Tasks dropdown with project filtering for quick access to the Kanban board
 * - GitHub dropdown for Issues and PRs navigation
 * - Tools dropdown for Ideation, Spec, Memory, Agent, and Terminal navigation
 * - Git dropdown for branch/worktree controls
 * - Settings navigation
 * - Running agents indicator
 *
 * BOARD-SPECIFIC CONTROLS (when on board view):
 * - Search bar for filtering features
 * - View toggle (Kanban/List view)
 * - Completed features button
 * - Board background settings
 * - Usage popover (Claude/Codex usage tracking)
 * - Auto Mode button with modal
 * - Plan button
 * - Plan button with settings popover
 *
 * All controls are combined into a single unified row for maximum vertical space.
 * On mobile/tablet, board-specific controls are accessed via HeaderMobileMenu.
 */
export function TopNavigationBar({
  className,
  onCreateWorktree,
  onWorktreeRefresh,
  worktreeRefreshTrigger = 0,
  boardControls: boardControlsProp,
}: TopNavigationBarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Board controls store - Phase 2: T006 - Get board controls from store
  const boardControlsState = useBoardControlsStore();
  const boardControlsFromStore = useMemo(
    () => getBoardControlsForTopNav(boardControlsState),
    [boardControlsState]
  );
  // Use props if provided, otherwise fall back to store
  const boardControls = boardControlsProp || boardControlsFromStore;

  // Responsive check
  const isTablet = useIsTablet();

  // App store state - consolidated with useShallow to prevent unnecessary re-renders
  const {
    projects,
    trashedProjects,
    currentProject,
    setCurrentProject,
    features,
    projectHistory,
    upsertAndSetCurrentProject,
    cyclePrevProject,
    cycleNextProject,
    theme: globalTheme,
    moveProjectToTrash,
    removeProject,
    showAllProjects,
    setShowAllProjects,
    planUseSelectedWorktreeBranch,
    setPlanUseSelectedWorktreeBranch,
  } = useAppStore(
    useShallow((state) => ({
      projects: state.projects,
      trashedProjects: state.trashedProjects,
      currentProject: state.currentProject,
      setCurrentProject: state.setCurrentProject,
      features: state.features,
      projectHistory: state.projectHistory,
      upsertAndSetCurrentProject: state.upsertAndSetCurrentProject,
      cyclePrevProject: state.cyclePrevProject,
      cycleNextProject: state.cycleNextProject,
      theme: state.theme,
      moveProjectToTrash: state.moveProjectToTrash,
      removeProject: state.removeProject,
      showAllProjects: state.showAllProjects,
      setShowAllProjects: state.setShowAllProjects,
      planUseSelectedWorktreeBranch: state.planUseSelectedWorktreeBranch,
      setPlanUseSelectedWorktreeBranch: state.setPlanUseSelectedWorktreeBranch,
    }))
  );

  // Get customizable keyboard shortcuts
  const shortcuts = useKeyboardShortcutsConfig();

  // Mobile menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Project dropdown open state (for keyboard shortcut control)
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  // Delete project dialog state
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  // Handle opening delete dialog for a project
  const handleOpenDeleteDialog = useCallback((project: Project, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the project when clicking trash
    setProjectToDelete(project);
    setDeleteProjectDialogOpen(true);
    setIsProjectDropdownOpen(false); // Close dropdown when opening delete dialog
  }, []);

  // Handle soft delete (move to trash)
  const handleSoftDelete = useCallback(() => {
    if (projectToDelete) {
      moveProjectToTrash(projectToDelete.id);
      toast.success('Project moved to trash', {
        description: `${projectToDelete.name} has been moved to trash`,
      });
      setDeleteProjectDialogOpen(false);
      setProjectToDelete(null);
    }
  }, [projectToDelete, moveProjectToTrash]);

  // Handle hard delete (permanent removal)
  const handleHardDelete = useCallback(() => {
    if (projectToDelete) {
      removeProject(projectToDelete.id);
      toast.success('Project deleted', {
        description: `${projectToDelete.name} has been permanently deleted`,
      });
      setDeleteProjectDialogOpen(false);
      setProjectToDelete(null);
    }
  }, [projectToDelete, removeProject]);

  /**
   * Opens the system folder selection dialog and initializes the selected project.
   * Used by the 'O' keyboard shortcut.
   */
  const handleOpenFolder = useCallback(async () => {
    const api = getElectronAPI();
    const result = await api.openDirectory();

    if (!result.canceled && result.filePaths[0]) {
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
          // This is a brand new project - notify user
          toast.success('Project opened', {
            description: `Opened ${name}. Let's set up your app specification!`,
          });
        } else if (initResult.createdFiles && initResult.createdFiles.length > 0) {
          toast.success(initResult.isNewProject ? 'Project initialized' : 'Project updated', {
            description: `Set up ${initResult.createdFiles.length} file(s) in .dmaker`,
          });
        } else {
          toast.success('Project opened', {
            description: `Opened ${name}`,
          });
        }
      } catch (error) {
        logger.error('Failed to open project:', error);
        toast.error('Failed to open project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }, [trashedProjects, upsertAndSetCurrentProject, currentProject, globalTheme]);

  // Build keyboard shortcuts for navigation (relocated from sidebar)
  const navigationShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcutsList: KeyboardShortcut[] = [];

    // Open project shortcut - opens the folder selection dialog directly
    shortcutsList.push({
      key: shortcuts.openProject,
      action: () => handleOpenFolder(),
      description: 'Open folder selection dialog',
    });

    // Project picker shortcut - opens the project dropdown
    shortcutsList.push({
      key: shortcuts.projectPicker,
      action: () => setIsProjectDropdownOpen(true),
      description: 'Open project picker dropdown',
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
      const { toggleLayer, closeAllLayers } = useLayerStore.getState();

      // Board shortcut - close all layers to return to board
      shortcutsList.push({
        key: shortcuts.board,
        action: () => closeAllLayers(),
        description: 'Return to Kanban Board',
      });

      shortcutsList.push({
        key: shortcuts.agent,
        action: () => closeAllLayers(),
        description: 'Return to Board (includes Agent Chat)',
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
        key: shortcuts.githubIssues,
        action: () => toggleLayer('github-issues'),
        description: 'Toggle GitHub Issues',
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
    handleOpenFolder,
    projectHistory.length,
    cyclePrevProject,
    cycleNextProject,
  ]);

  // Register keyboard shortcuts
  useKeyboardShortcuts(navigationShortcuts);

  // Handle project selection from dropdown
  const handleProjectSelect = (project: Project | null) => {
    if (project === null) {
      // "All Projects" selected
      setShowAllProjects(true);
      // We don't clear currentProject, just flag that we're showing all
      // This allows the board view to show tasks from all projects
    } else {
      setShowAllProjects(false);
      setCurrentProject(project);
    }
  };

  // Determine what to show as the current selection
  const selectedProject = showAllProjects ? null : currentProject;
  const selectedLabel = showAllProjects ? 'All Projects' : currentProject?.name || 'Select Project';

  // Get the icon for the current selection
  const CurrentIcon = selectedProject ? getProjectIcon(selectedProject.icon) : Layers;
  const hasCustomIcon = selectedProject?.customIconPath;

  // Board is always the base view in the layer-based UI
  const isOnBoardView = true;

  return (
    <header
      className={cn(
        'flex items-center justify-between h-12 px-4',
        // Glass morphism background - single unified toolbar row
        'bg-gradient-to-r from-background/95 via-background/90 to-background/95 backdrop-blur-md',
        // Bottom border separator
        'border-b border-border/40',
        // Electron titlebar padding
        isElectron() && isMac && 'pl-20',
        className
      )}
      data-testid="top-nav-bar"
    >
      {/* Left section: Navigation items (GitHub, Tools, Git, Deploy) + Board controls */}
      <div className="flex items-center gap-2">
        {/* View indicator - gently pulsing label showing current view mode */}
        {isOnBoardView && !isTablet && (
          <span className="text-xs font-medium text-muted-foreground/70 tracking-wide uppercase animate-pulse [animation-duration:3s] border border-border/60 rounded px-2 py-0.5">
            {(() => {
              const modes = boardControls?.activeModes ?? ['local'];
              if (modes.includes('local') && modes.includes('github')) return 'Kanban-hybrid';
              if (modes.includes('github')) return 'Kanban-github';
              return 'Kanban-local';
            })()}
          </span>
        )}

        {/* Board-specific search - moved to far left for visibility */}
        {isOnBoardView && boardControls && boardControls.isMounted && !isTablet && (
          <BoardSearchBar
            searchQuery={boardControls.searchQuery}
            onSearchChange={boardControls.onSearchChange}
            isCreatingSpec={boardControls.isCreatingSpec}
            creatingSpecProjectPath={boardControls.creatingSpecProjectPath}
            currentProjectPath={currentProject?.path}
            showFavoritesOnly={boardControls.showFavoritesOnly}
            onShowFavoritesOnlyChange={boardControls.onShowFavoritesOnlyChange}
          />
        )}

        {/* Separator between search and navigation items */}
        {isOnBoardView && boardControls && boardControls.isMounted && !isTablet && (
          <div className="h-6 w-px bg-border/60 mx-1" />
        )}

        {/* Combined project + status filter dropdown - shown on board view */}
        {isOnBoardView &&
          boardControls &&
          boardControls.isMounted &&
          !isTablet &&
          boardControls.onStatusTabsCommit &&
          boardControls.onProjectSelectionChange &&
          boardControls.projects &&
          boardControls.projects.length > 0 && (
            <BoardFilterDropdown
              projects={boardControls.projects}
              selectedProjectIds={boardControls.selectedProjectIds ?? ['__all_projects__']}
              onProjectSelectionChange={boardControls.onProjectSelectionChange}
              activeTabs={boardControls.activeStatusTabs ?? [boardControls.activeStatusTab]}
              onTabChange={boardControls.onStatusTabsCommit}
              tabs={boardControls.statusTabs}
              tabCounts={boardControls.statusTabCounts}
              onCreateStatus={boardControls.onCreateStatus}
              onDeleteStatus={boardControls.onDeleteStatus}
              onCreateProject={handleOpenFolder}
              activeModes={boardControls.activeModes}
              onModeChange={boardControls.onModeChange}
            />
          )}

        {/* Fallback: status-only dropdown when no projects available */}
        {isOnBoardView &&
          boardControls &&
          boardControls.isMounted &&
          !isTablet &&
          boardControls.onStatusTabsCommit &&
          !(
            boardControls.onProjectSelectionChange &&
            boardControls.projects &&
            boardControls.projects.length > 0
          ) && (
            <BoardStatusDropdown
              activeTabs={boardControls.activeStatusTabs ?? [boardControls.activeStatusTab]}
              onTabChange={boardControls.onStatusTabsCommit}
              tabs={boardControls.statusTabs}
              tabCounts={boardControls.statusTabCounts}
              onCreateStatus={boardControls.onCreateStatus}
              onDeleteStatus={boardControls.onDeleteStatus}
            />
          )}

        {/* Quick launcher [+] for tools, plan, git */}
        <QuickLauncher
          boardControls={boardControls}
          isOnBoardView={isOnBoardView}
          currentProject={currentProject}
          onCreateWorktree={onCreateWorktree}
          onWorktreeRefresh={onWorktreeRefresh}
          worktreeRefreshTrigger={worktreeRefreshTrigger}
          planUseSelectedWorktreeBranch={planUseSelectedWorktreeBranch}
          onPlanUseSelectedWorktreeBranchChange={setPlanUseSelectedWorktreeBranch}
        />
      </div>

      {/* Right section: Usage + Settings + Running Agents */}
      <div className="flex items-center gap-2">
        {/* Refresh Button - board view only */}
        {isOnBoardView &&
          boardControls &&
          boardControls.isMounted &&
          !isTablet &&
          boardControls.onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={boardControls.onRefresh}
              disabled={boardControls.isRefreshing}
              className="h-8 w-8 p-0"
              title="Refresh Features"
              data-testid="refresh-features-button"
            >
              <RefreshCw
                className={`w-4 h-4 ${boardControls.isRefreshing ? 'animate-spin' : ''}`}
              />
            </Button>
          )}

        {/* Usage Popover - always visible on desktop, component handles its own auth state */}
        {!isTablet && <UsagePopover />}

        {/* Auto Mode Modal - rendered when needed */}
        {isOnBoardView && boardControls && (
          <AutoModeModal
            open={boardControls.isAutoModeModalOpen}
            onOpenChange={boardControls.onAutoModeModalOpenChange}
          />
        )}

        {/* Mobile menu toggle - only visible on mobile */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden h-8 w-8 p-0"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          data-testid="mobile-menu-toggle"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
        {/* Settings gear icon - hidden on mobile (available in mobile menu) */}
        <div className="hidden lg:block">
          <SettingsGearButton />
        </div>
        {/* Running agents indicator with dual counts */}
        <RunningAgentsIndicator location={location} onNavigate={(path) => navigate({ to: path })} />
      </div>

      {/* Mobile navigation menu - slides down on mobile when open */}
      {mobileMenuOpen && (
        <MobileNavigationMenu
          location={location}
          onNavigate={(path) => {
            navigate({ to: path });
            setMobileMenuOpen(false);
          }}
          onClose={() => setMobileMenuOpen(false)}
          currentProject={currentProject}
          showAllProjects={showAllProjects}
          projects={projects}
        />
      )}

      {/* Delete Project Confirmation Dialog (lazy-loaded) */}
      <DeleteProjectDialog
        open={deleteProjectDialogOpen}
        onOpenChange={setDeleteProjectDialogOpen}
        componentProps={{
          project: projectToDelete,
          onSoftDelete: handleSoftDelete,
          onHardDelete: handleHardDelete,
        }}
      />
    </header>
  );
}

export { ALL_PROJECTS_VALUE };

/**
 * AgConfigurationSection - Global agent concurrency slider (1-20, default 5)
 */
function AgConfigurationSection() {
  const agentMultiplier = useAppStore((state) => state.agentMultiplier);
  const setAgentMultiplier = useAppStore((state) => state.setAgentMultiplier);
  const runningAgentsCount = useBoardControlsStore((state) => state.runningAgentsCount);

  const handleMaxAgentsChange = (value: number[]) => {
    setAgentMultiplier(value[0]);
  };

  return (
    <div className="space-y-2 px-2 py-2">
      <div className="flex items-center gap-2">
        <Bot className="w-4 h-4 text-brand-500 shrink-0" />
        <span className="text-xs font-medium">Max Concurrent Agents</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {runningAgentsCount}/{agentMultiplier}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Slider
          value={[agentMultiplier]}
          onValueChange={handleMaxAgentsChange}
          min={1}
          max={20}
          step={1}
          className="flex-1"
          data-testid="tools-ag-concurrency-slider"
        />
        <span className="text-xs font-medium min-w-[2ch] text-right">{agentMultiplier}</span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Maximum number of concurrent agents across all projects.
      </p>
    </div>
  );
}

/**
 * QuickLauncher - Single [+] button that opens a popover with all tools, git, and actions.
 * Replaces the separate Tools, Git, and GitHub dropdown menus.
 */
interface QuickLauncherProps {
  boardControls?: TopNavigationBarProps['boardControls'];
  isOnBoardView?: boolean;
  currentProject: Project | null;
  onCreateWorktree?: () => void;
  onWorktreeRefresh?: () => void;
  worktreeRefreshTrigger?: number;
  planUseSelectedWorktreeBranch?: boolean;
  onPlanUseSelectedWorktreeBranchChange?: (value: boolean) => void;
}

// All launcher items
const LAUNCHER_ITEMS: { id: LayerId; label: string; icon: typeof CircleDot; section: string }[] = [
  { id: 'ideation', label: 'Ideation', icon: Lightbulb, section: 'Tools' },
  { id: 'spec', label: 'Spec Editor', icon: FileText, section: 'Tools' },
  { id: 'memory', label: 'Memory', icon: Brain, section: 'Tools' },
  { id: 'terminal', label: 'Terminal', icon: Terminal, section: 'Tools' },
  { id: 'github-issues', label: 'GitHub Issues', icon: CircleDot, section: 'GitHub' },
  { id: 'github-prs', label: 'GitHub PRs', icon: GitPullRequest, section: 'GitHub' },
  { id: 'project-settings', label: 'Project Settings', icon: Settings, section: 'Settings' },
  { id: 'interview', label: 'Interview', icon: Wand2, section: 'Settings' },
];

function QuickLauncher({
  boardControls,
  isOnBoardView,
  currentProject,
  onCreateWorktree,
  onWorktreeRefresh,
  worktreeRefreshTrigger = 0,
}: QuickLauncherProps) {
  const [open, setOpen] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const openLayer = useLayerStore((s) => s.openLayer);
  const layers = useLayerStore((s) => s.layers);
  const projects = useAppStore((s) => s.projects);

  // Git worktree state
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [isLoadingWorktrees, setIsLoadingWorktrees] = useState(false);
  const {
    getCurrentWorktree,
    setCurrentWorktree,
    setWorktrees: setWorktreesInStore,
    worktreePanelVisibleByProject,
    setWorktreePanelVisible,
  } = useAppStore(
    useShallow((state) => ({
      getCurrentWorktree: state.getCurrentWorktree,
      setCurrentWorktree: state.setCurrentWorktree,
      setWorktrees: state.setWorktrees,
      worktreePanelVisibleByProject: state.worktreePanelVisibleByProject,
      setWorktreePanelVisible: state.setWorktreePanelVisible,
    }))
  );

  const isWorktreePanelVisible = currentProject
    ? (worktreePanelVisibleByProject[currentProject.path] ?? true)
    : true;

  const handleWorktreePanelToggle = useCallback(
    async (visible: boolean) => {
      if (!currentProject) return;
      setWorktreePanelVisible(currentProject.path, visible);
      try {
        const httpClient = getHttpApiClient();
        await httpClient.settings.updateProject(currentProject.path, {
          worktreePanelVisible: visible,
        });
      } catch (error) {
        console.error('Failed to persist worktree panel visibility:', error);
      }
    },
    [currentProject, setWorktreePanelVisible]
  );

  const currentWorktree = currentProject ? getCurrentWorktree(currentProject.path) : null;
  const currentWorktreePath = currentWorktree?.path ?? null;

  const fetchWorktrees = useCallback(async () => {
    if (!currentProject?.path) return;
    setIsLoadingWorktrees(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.listAll) return;
      const result = await api.worktree.listAll(currentProject.path, true, false);
      if (result.success && result.worktrees) {
        setWorktrees(result.worktrees);
        setWorktreesInStore(currentProject.path, result.worktrees);
      }
    } catch (error) {
      console.error('Failed to fetch worktrees:', error);
    } finally {
      setIsLoadingWorktrees(false);
    }
  }, [currentProject?.path, setWorktreesInStore]);

  useEffect(() => {
    fetchWorktrees();
  }, [fetchWorktrees, worktreeRefreshTrigger]);

  const mainWorktree = useMemo(() => worktrees.find((w) => w.isMain), [worktrees]);
  const nonMainWorktrees = useMemo(() => worktrees.filter((w) => !w.isMain), [worktrees]);

  const isWorktreeSelected = useCallback(
    (worktree: WorktreeInfo) => {
      return worktree.isMain
        ? currentWorktreePath === null
        : pathsEqual(worktree.path, currentWorktreePath);
    },
    [currentWorktreePath]
  );

  const handleSelectWorktree = useCallback(
    (worktree: WorktreeInfo) => {
      if (!currentProject) return;
      setCurrentWorktree(
        currentProject.path,
        worktree.isMain ? null : worktree.path,
        worktree.branch
      );
      setOpen(false);
    },
    [currentProject, setCurrentWorktree]
  );

  const handleCreateWorktree = useCallback(() => {
    if (onCreateWorktree) {
      onCreateWorktree();
    } else {
      window.dispatchEvent(new CustomEvent('dmaker:create-worktree'));
    }
    setOpen(false);
  }, [onCreateWorktree]);

  const selectedWorktree = useMemo(() => {
    if (currentWorktreePath === null) return mainWorktree;
    return (
      worktrees.find((w) => !w.isMain && pathsEqual(w.path, currentWorktreePath)) || mainWorktree
    );
  }, [worktrees, currentWorktreePath, mainWorktree]);

  // Check if any launcher layer is open
  const hasOpenLayer = LAUNCHER_ITEMS.some((item) => layers.includes(item.id));

  // Group items by section
  const sections = useMemo(() => {
    const map = new Map<string, typeof LAUNCHER_ITEMS>();
    for (const item of LAUNCHER_ITEMS) {
      const arr = map.get(item.section) || [];
      arr.push(item);
      map.set(item.section, arr);
    }
    return map;
  }, []);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 w-8 p-0',
              'hover:bg-accent/50 transition-colors duration-150',
              hasOpenLayer && 'bg-brand-500/10 text-brand-500'
            )}
            data-testid="quick-launcher-trigger"
            title="Open tools & navigation"
          >
            <Plus
              className={cn('w-4 h-4', hasOpenLayer ? 'text-brand-500' : 'text-muted-foreground')}
            />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-72 p-2" data-testid="quick-launcher-content">
          <div className="flex flex-col gap-1">
            {/* Layer items grouped by section */}
            {Array.from(sections).map(([section, items], idx) => (
              <div key={section}>
                {idx > 0 && <div className="h-px bg-border my-1.5" />}
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                  {section}
                </div>
                {items.map((item) => {
                  const IconComponent = item.icon;
                  const isActive = layers.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        openLayer(item.id);
                        setOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-2 py-1.5 rounded-md transition-colors text-left',
                        isActive
                          ? 'bg-brand-500/10 text-brand-500'
                          : 'hover:bg-accent/50 text-foreground'
                      )}
                      data-testid={`launcher-${item.id}`}
                    >
                      <IconComponent
                        className={cn(
                          'w-4 h-4 shrink-0',
                          isActive ? 'text-brand-500' : 'text-muted-foreground'
                        )}
                      />
                      <span className="text-sm font-medium">{item.label}</span>
                      {isActive && (
                        <span className="ml-auto text-[10px] text-brand-500 font-medium">Open</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}

            {/* Plan & Closed Issues */}
            {(currentProject || (isOnBoardView && boardControls?.isMounted)) && (
              <>
                <div className="h-px bg-border my-1.5" />
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                  Actions
                </div>
                {currentProject && (
                  <button
                    className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-left"
                    data-testid="launcher-completed"
                    onClick={() => {
                      setShowCompletedModal(true);
                      setOpen(false);
                    }}
                  >
                    <CheckCircle2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">Closed Issues</span>
                  </button>
                )}
                {isOnBoardView && boardControls && boardControls.isMounted && (
                  <button
                    className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-left"
                    data-testid="launcher-plan"
                    onClick={() => {
                      boardControls.onOpenPlanDialog();
                      setOpen(false);
                    }}
                  >
                    <Wand2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">Plan</span>
                    {boardControls.hasPendingPlan && (
                      <span className="ml-auto text-[10px] text-emerald-500 font-medium">
                        Review ready
                      </span>
                    )}
                  </button>
                )}
              </>
            )}

            {/* Git / Worktree section */}
            {currentProject && (
              <>
                <div className="h-px bg-border my-1.5" />
                <div className="flex items-center justify-between px-2 py-1">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Git
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={handleCreateWorktree}
                      title="Create new worktree"
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => {
                        fetchWorktrees();
                        onWorktreeRefresh?.();
                      }}
                      disabled={isLoadingWorktrees}
                      title="Refresh worktrees"
                    >
                      <RefreshCw className={cn('w-3 h-3', isLoadingWorktrees && 'animate-spin')} />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                  {mainWorktree && (
                    <button
                      onClick={() => handleSelectWorktree(mainWorktree)}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1 rounded-md text-xs font-mono cursor-pointer transition-colors',
                        'hover:bg-accent/50',
                        isWorktreeSelected(mainWorktree) && 'bg-accent'
                      )}
                    >
                      <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate text-left">{mainWorktree.branch}</span>
                      {isWorktreeSelected(mainWorktree) && (
                        <span className="text-[10px] text-brand-500 font-medium">Active</span>
                      )}
                    </button>
                  )}
                  {nonMainWorktrees.map((worktree) => (
                    <button
                      key={worktree.path}
                      onClick={() => handleSelectWorktree(worktree)}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1 rounded-md text-xs font-mono cursor-pointer transition-colors',
                        'hover:bg-accent/50',
                        isWorktreeSelected(worktree) && 'bg-accent'
                      )}
                    >
                      <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate text-left">{worktree.branch}</span>
                      {isWorktreeSelected(worktree) && (
                        <span className="text-[10px] text-brand-500 font-medium">Active</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground px-2 pt-1">
                  Branch: <span className="font-mono">{selectedWorktree?.branch || 'main'}</span>
                </div>
                <div className="flex items-center justify-between px-2 py-1">
                  <div className="flex items-center gap-2">
                    <PanelTop className="w-3.5 h-3.5 text-muted-foreground" />
                    <Label htmlFor="wt-bar-toggle" className="text-xs font-medium cursor-pointer">
                      Worktree Bar
                    </Label>
                  </div>
                  <Switch
                    id="wt-bar-toggle"
                    checked={isWorktreePanelVisible}
                    onCheckedChange={handleWorktreePanelToggle}
                  />
                </div>
              </>
            )}

            {/* AG Configuration */}
            <div className="h-px bg-border my-1.5" />
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
              Agents
            </div>
            <AgConfigurationSection />
          </div>
        </PopoverContent>
      </Popover>

      {/* Completed Features Modal */}
      <CompletedFeaturesModal
        open={showCompletedModal}
        onOpenChange={setShowCompletedModal}
        componentProps={{
          currentProjectPath: currentProject?.path,
          projectPaths: projects.map((p) => p.path),
          availableProjects: new Map(projects.map((p) => [p.path, p.name])),
        }}
      />
    </>
  );
}

/**
 * SettingsGearButton - Minimal gear icon that opens the settings layer.
 */
function SettingsGearButton() {
  const isOnSettings = useLayerStore((s) => s.layers.includes('settings'));
  const toggleLayer = useLayerStore((s) => s.toggleLayer);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => toggleLayer('settings')}
      className={cn(
        'h-8 w-8 p-0',
        'hover:bg-accent/50 transition-colors duration-150',
        isOnSettings && 'bg-brand-500/10 text-brand-500'
      )}
      data-testid="settings-button"
      title="Settings"
    >
      <Settings
        className={cn('w-4 h-4', isOnSettings ? 'text-brand-500' : 'text-muted-foreground')}
      />
    </Button>
  );
}

/**
 * MobileNavigationMenu - Slide-down menu for mobile navigation
 *
 * Phase 6: T024 - Mobile responsive layout for top-nav only
 * Phase 2: T007 - Updated to clarify board-specific controls location
 *
 * This component displays global navigation items that are hidden on desktop
 * in a mobile-friendly dropdown menu format.
 *
 * Note: Board-specific controls (Usage, Worktree Bar toggle, Auto Mode, Plan, Branch controls)
 * are accessible via BoardHeader's HeaderMobileMenu when on the board view.
 * This menu focuses on app-wide navigation (GitHub, Tools, Settings).
 */
interface MobileNavigationMenuProps {
  location: { pathname: string };
  onNavigate: (path: string) => void;
  onClose: () => void;
  currentProject: Project | null;
  showAllProjects: boolean;
  projects: Project[];
}

function MobileNavigationMenu({
  location,
  onNavigate,
  onClose,
  currentProject,
  showAllProjects,
  projects,
}: MobileNavigationMenuProps) {
  const layers = useLayerStore((s) => s.layers);
  const openLayer = useLayerStore((s) => s.openLayer);

  // Navigation items configuration - open as layers
  const navItems: { id: LayerId; label: string; icon: typeof CircleDot; isActive: boolean }[] = [
    {
      id: 'github-issues',
      label: 'GitHub Issues',
      icon: CircleDot,
      isActive: layers.includes('github-issues'),
    },
    {
      id: 'github-prs',
      label: 'GitHub PRs',
      icon: GitPullRequest,
      isActive: layers.includes('github-prs'),
    },
    {
      id: 'ideation',
      label: 'Ideation',
      icon: Lightbulb,
      isActive: layers.includes('ideation'),
    },
    {
      id: 'spec',
      label: 'Spec Editor',
      icon: FileText,
      isActive: layers.includes('spec'),
    },
    {
      id: 'memory',
      label: 'Memory',
      icon: Brain,
      isActive: layers.includes('memory'),
    },
    {
      id: 'terminal',
      label: 'Terminal',
      icon: Terminal,
      isActive: layers.includes('terminal'),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      isActive: layers.includes('settings'),
    },
  ];

  return (
    <div
      className={cn(
        'absolute top-full left-0 right-0 z-50',
        'lg:hidden', // Only show on mobile/tablet
        'bg-gradient-to-b from-background/98 via-background/95 to-background/90 backdrop-blur-xl',
        'border-b border-border/60 shadow-lg',
        'animate-in slide-in-from-top-2 duration-200'
      )}
      data-testid="mobile-nav-menu"
    >
      {/* Backdrop to close menu when clicking outside */}
      <div className="fixed inset-0 -z-10" onClick={onClose} aria-hidden="true" />

      {/* Navigation grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 p-3">
        {navItems.map((item) => {
          const IconComponent = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => {
                openLayer(item.id);
                onClose();
              }}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg',
                'transition-colors duration-150',
                'text-left',
                item.isActive
                  ? 'bg-brand-500/15 text-brand-500'
                  : 'hover:bg-accent/50 text-foreground'
              )}
              data-testid={`mobile-nav-${item.id}`}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center',
                  item.isActive ? 'bg-brand-500/20' : 'bg-muted'
                )}
              >
                <IconComponent
                  className={cn(
                    'w-4 h-4',
                    item.isActive ? 'text-brand-500' : 'text-muted-foreground'
                  )}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate">{item.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
