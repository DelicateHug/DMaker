import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from '@tanstack/react-router';
import {
  ChevronDown,
  ChevronRight,
  Check,
  Layers,
  Github,
  CircleDot,
  GitPullRequest,
  GitBranch,
  Wrench,
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
  Settings2,
  CheckCircle2,
  Wand2,
  ClipboardCheck,
  Bot,
} from 'lucide-react';
import { cn, isMac, pathsEqual } from '@/lib/utils';
import { getProjectIcon } from '@/lib/icon-registry';
import { isElectron, getElectronAPI, type Project } from '@/lib/electron';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, formatShortcut, type ThemeMode } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  useKeyboardShortcuts,
  useKeyboardShortcutsConfig,
  type KeyboardShortcut,
} from '@/hooks/use-keyboard-shortcuts';
import { initializeProject, hasAppSpec, hasAutomakerDir } from '@/lib/project-init';
import { toast } from 'sonner';
import { createLogger } from '@automaker/utils/logger';
import { RunningAgentsIndicator } from './running-agents-indicator';
import { DeleteProjectDialog } from '@/components/dialogs';
import { UsagePopover } from '@/components/usage-popover';
import { VoiceButton } from '@/components/ui/voice-button';
import { BoardSearchBar } from '@/components/views/board-view/board-search-bar';
import type { ViewMode } from '@/components/views/board-view/components/view-toggle';
import type {
  StatusTabId,
  StatusTab,
} from '@/components/views/board-view/hooks/use-board-status-tabs';
import { BoardStatusDropdown } from '@/components/views/board-view/components/board-status-dropdown';
import { BoardProjectDropdown } from '@/components/views/board-view/components/board-project-dropdown';
import { BoardFilterDropdown } from '@/components/views/board-view/components/board-filter-dropdown';
import { PlanSettingsPopover } from '@/components/views/board-view/dialogs/plan-settings-popover';
import { CompletedFeaturesModal } from '@/components/views/board-view/dialogs';
import { AutoModeModal } from '@/components/dialogs/auto-mode-modal';
import { useSetupStore } from '@/store/setup-store';
import { useBoardControlsStore, getBoardControlsForTopNav } from '@/store/board-controls-store';
import { useIsTablet } from '@/hooks/use-media-query';

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
    // View toggle props (optional - removed from header)
    viewMode: ViewMode;
    onViewModeChange?: (mode: ViewMode) => void;
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
    isListView: boolean;
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
 * - Right side: Usage, Auto Mode, Voice, Plan, Settings, Agents
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
 * - Voice mode button
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

  // Setup store for usage visibility
  const claudeAuthStatus = useSetupStore((state) => state.claudeAuthStatus);
  const codexAuthStatus = useSetupStore((state) => state.codexAuthStatus);
  const isClaudeCliVerified = !!claudeAuthStatus?.authenticated;
  const showClaudeUsage = isClaudeCliVerified;
  const showCodexUsage = !!codexAuthStatus?.authenticated;

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
        // Check if this is a brand new project (no .automaker directory)
        const hadAutomakerDir = await hasAutomakerDir(path);

        // Initialize the .automaker directory structure
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

        if (!hadAutomakerDir && !specExists) {
          // This is a brand new project - notify user
          toast.success('Project opened', {
            description: `Opened ${name}. Let's set up your app specification!`,
          });
        } else if (initResult.createdFiles && initResult.createdFiles.length > 0) {
          toast.success(initResult.isNewProject ? 'Project initialized' : 'Project updated', {
            description: `Set up ${initResult.createdFiles.length} file(s) in .automaker`,
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
      // Navigation shortcuts
      shortcutsList.push({
        key: shortcuts.board,
        action: () => navigate({ to: '/board' }),
        description: 'Navigate to Kanban Board',
      });

      shortcutsList.push({
        key: shortcuts.agent,
        action: () => navigate({ to: '/board' }),
        description: 'Navigate to Board (includes Agent Chat)',
      });

      shortcutsList.push({
        key: shortcuts.terminal,
        action: () => navigate({ to: '/terminal' }),
        description: 'Navigate to Terminal',
      });

      shortcutsList.push({
        key: shortcuts.ideation,
        action: () => navigate({ to: '/ideation' }),
        description: 'Navigate to Ideation',
      });

      shortcutsList.push({
        key: shortcuts.spec,
        action: () => navigate({ to: '/spec' }),
        description: 'Navigate to Spec Editor',
      });

      shortcutsList.push({
        key: shortcuts.memory,
        action: () => navigate({ to: '/memory' }),
        description: 'Navigate to Memory',
      });

      shortcutsList.push({
        key: shortcuts.githubIssues,
        action: () => navigate({ to: '/github-issues' }),
        description: 'Navigate to GitHub Issues',
      });

      shortcutsList.push({
        key: shortcuts.githubPrs,
        action: () => navigate({ to: '/github-prs' }),
        description: 'Navigate to GitHub Pull Requests',
      });

      shortcutsList.push({
        key: shortcuts.projectSettings,
        action: () => navigate({ to: '/project-settings' }),
        description: 'Navigate to Project Settings',
      });

      // Global settings shortcut
      shortcutsList.push({
        key: shortcuts.settings,
        action: () => navigate({ to: '/settings' }),
        description: 'Navigate to Global Settings',
      });

      // Note: Voice mode shortcut (Alt+M) is now handled globally by use-voice-mode.ts
      // via the voiceModeToggle shortcut which toggles the VoiceWidget visibility
    }

    return shortcutsList;
  }, [
    shortcuts,
    currentProject,
    navigate,
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

  // Check if we're on the board/tasks view
  const isOnBoardView = location.pathname === '/board';

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

        {/* T012: GitHub button with tabs (Issues + PRs) */}
        <GitHubButton location={location} onNavigate={(path) => navigate({ to: path })} />

        {/* T013: Tools button with tabs (Ideation, Spec, Memory, Terminal) + Board Actions */}
        <ToolsButton
          location={location}
          onNavigate={(path) => navigate({ to: path })}
          boardControls={boardControls}
          isOnBoardView={isOnBoardView}
          planUseSelectedWorktreeBranch={planUseSelectedWorktreeBranch}
          onPlanUseSelectedWorktreeBranchChange={setPlanUseSelectedWorktreeBranch}
        />

        {/* Git button with branch/worktree controls */}
        <GitButton
          currentProject={currentProject}
          onCreateWorktree={onCreateWorktree}
          onWorktreeRefresh={onWorktreeRefresh}
          worktreeRefreshTrigger={worktreeRefreshTrigger}
        />
      </div>

      {/* Right section: Usage + Voice Mode + Settings + Running Agents */}
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

        {/* Usage Popover - icon only, no "Usage" text */}
        {isOnBoardView &&
          boardControls &&
          boardControls.isMounted &&
          !isTablet &&
          (showClaudeUsage || showCodexUsage) && <UsagePopover />}

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
        {/* Voice Mode Button - positioned after Usage, before Settings */}
        <div className="hidden lg:block">
          <VoiceButton variant="ghost" size="sm" />
        </div>
        {/* T014: Settings button - hidden on mobile (available in mobile menu) */}
        <div className="hidden lg:block">
          <SettingsButton location={location} onNavigate={(path) => navigate({ to: path })} />
        </div>
        {/* T015: Running agents indicator with dual counts */}
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

      {/* Note: VoiceModeDialog has been replaced by VoiceWidget which is rendered
          in the root layout (__root.tsx) and toggled via the VoiceButton or Alt+M shortcut */}
    </header>
  );
}

export { ALL_PROJECTS_VALUE };
export type { ViewMode };

/**
 * GitHubButton - Combined GitHub button with tabs for Issues and PRs
 *
 * Phase 3: T012 - Create combined GitHub button with tabs
 */
interface GitHubButtonProps {
  location: { pathname: string };
  onNavigate: (path: string) => void;
}

function GitHubButton({ location, onNavigate }: GitHubButtonProps) {
  const [open, setOpen] = useState(false);

  // Check if we're on any GitHub-related view
  const isOnGitHubIssues = location.pathname === '/github-issues';
  const isOnGitHubPRs = location.pathname === '/github-prs';
  const isOnGitHubView = isOnGitHubIssues || isOnGitHubPRs;

  // Determine the active tab based on current route
  const activeTab = isOnGitHubPRs ? 'prs' : 'issues';

  const handleTabChange = (value: string) => {
    if (value === 'issues') {
      onNavigate('/github-issues');
    } else if (value === 'prs') {
      onNavigate('/github-prs');
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'flex items-center gap-2 h-8 px-3',
            'hover:bg-accent/50 transition-colors duration-150',
            'font-medium text-sm',
            isOnGitHubView && 'bg-brand-500/10 text-brand-500'
          )}
          data-testid="github-dropdown-trigger"
        >
          {/* GitHub Icon */}
          <div
            className={cn(
              'w-5 h-5 rounded flex items-center justify-center',
              isOnGitHubView ? 'bg-brand-500/20' : 'bg-muted'
            )}
          >
            <Github
              className={cn(
                'w-3.5 h-3.5',
                isOnGitHubView ? 'text-brand-500' : 'text-muted-foreground'
              )}
            />
          </div>

          {/* Label */}
          <span>GitHub</span>

          {/* Chevron */}
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="center" className="w-auto p-2" data-testid="github-dropdown-content">
        <div className="flex flex-col gap-3">
          {/* Section Header */}
          <div className="text-xs font-medium text-muted-foreground px-1">GitHub</div>

          {/* Tabs for Issues and PRs */}
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger
                value="issues"
                className="flex items-center gap-2"
                data-testid="github-tab-issues"
              >
                <CircleDot className="w-3.5 h-3.5" />
                <span>Issues</span>
              </TabsTrigger>
              <TabsTrigger
                value="prs"
                className="flex items-center gap-2"
                data-testid="github-tab-prs"
              >
                <GitPullRequest className="w-3.5 h-3.5" />
                <span>PRs</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Quick info / description */}
          <div className="text-[10px] text-muted-foreground px-1">
            {isOnGitHubIssues
              ? 'Viewing GitHub Issues'
              : isOnGitHubPRs
                ? 'Viewing Pull Requests'
                : 'Select a view to open'}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
 * ToolsButton - Combined Tools button with tabs for Ideation, Spec, Memory, Agent Runner, Terminal
 *
 * Phase 3: T013 - Create combined Tools button with tabs
 */
interface ToolsButtonProps {
  location: { pathname: string };
  onNavigate: (path: string) => void;
}

// Define tool tabs configuration - navigation tools only
const TOOLS_TABS = [
  { id: 'ideation', label: 'Ideation', icon: Lightbulb, path: '/ideation' },
  { id: 'spec', label: 'Spec', icon: FileText, path: '/spec' },
  { id: 'memory', label: 'Memory', icon: Brain, path: '/memory' },
  { id: 'terminal', label: 'Terminal', icon: Terminal, path: '/terminal' },
] as const;

type ToolTabId = (typeof TOOLS_TABS)[number]['id'];

// Extended ToolsButton props to include board actions
interface ExtendedToolsButtonProps extends ToolsButtonProps {
  boardControls?: {
    onOpenPlanDialog: () => void;
    hasPendingPlan: boolean;
    onOpenPendingPlan?: () => void;
    isMounted: boolean;
  } | null;
  isOnBoardView?: boolean;
  planUseSelectedWorktreeBranch?: boolean;
  onPlanUseSelectedWorktreeBranchChange?: (value: boolean) => void;
}

function ToolsButton({
  location,
  onNavigate,
  boardControls,
  isOnBoardView,
  planUseSelectedWorktreeBranch,
  onPlanUseSelectedWorktreeBranchChange,
}: ExtendedToolsButtonProps) {
  const [open, setOpen] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  // Get current project from app store for completed features
  const currentProject = useAppStore((s) => s.currentProject);
  const projects = useAppStore((s) => s.projects);

  // Fetch completed count independently when dropdown opens or project changes
  useEffect(() => {
    if (!currentProject?.path) return;
    const api = getElectronAPI();
    if (!api.features?.getCountsByStatus) return;

    api.features.getCountsByStatus(currentProject.path).then((result: any) => {
      if (result.success && result.counts) {
        setCompletedCount(result.counts.completed ?? 0);
      }
    });
  }, [currentProject?.path, open]);

  // Get expanded states from board controls store
  const { expandedBoardActions, toggleBoardAction } = useBoardControlsStore();

  // Check if we're on any Tools-related view
  const isOnIdeation = location.pathname === '/ideation';
  const isOnSpec = location.pathname === '/spec';
  const isOnMemory = location.pathname === '/memory';
  const isOnTerminal = location.pathname === '/terminal';
  const isOnToolsView = isOnIdeation || isOnSpec || isOnMemory || isOnTerminal;

  // Determine the active tab based on current route
  const getActiveTab = (): ToolTabId => {
    if (isOnIdeation) return 'ideation';
    if (isOnSpec) return 'spec';
    if (isOnMemory) return 'memory';
    if (isOnTerminal) return 'terminal';
    return 'ideation'; // Default to ideation
  };

  const activeTab = getActiveTab();

  const handleTabChange = (value: string) => {
    const tab = TOOLS_TABS.find((t) => t.id === value);
    if (tab) {
      onNavigate(tab.path);
    }
    setOpen(false);
  };

  // Get label for current view description
  const getCurrentViewLabel = (): string => {
    const tab = TOOLS_TABS.find((t) => t.id === activeTab);
    if (isOnToolsView && tab) {
      return `Viewing ${tab.label}`;
    }
    return 'Select a tool to open';
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'flex items-center gap-2 h-8 px-3',
              'hover:bg-accent/50 transition-colors duration-150',
              'font-medium text-sm',
              isOnToolsView && 'bg-brand-500/10 text-brand-500'
            )}
            data-testid="tools-dropdown-trigger"
          >
            {/* Tools Icon */}
            <div
              className={cn(
                'w-5 h-5 rounded flex items-center justify-center',
                isOnToolsView ? 'bg-brand-500/20' : 'bg-muted'
              )}
            >
              <Wrench
                className={cn(
                  'w-3.5 h-3.5',
                  isOnToolsView ? 'text-brand-500' : 'text-muted-foreground'
                )}
              />
            </div>

            {/* Label */}
            <span>Tools</span>

            {/* Chevron */}
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="center" className="w-auto p-2" data-testid="tools-dropdown-content">
          <div className="flex flex-col gap-3">
            {/* Section Header */}
            <div className="text-xs font-medium text-muted-foreground px-1">Tools</div>

            {/* Tabs for navigation tools */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="w-full grid grid-cols-4 h-auto p-1">
                {TOOLS_TABS.map((tab) => {
                  const IconComponent = tab.icon;
                  return (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="flex flex-col items-center gap-1 py-2 px-2 h-auto min-w-[60px]"
                      data-testid={`tools-tab-${tab.id}`}
                    >
                      <IconComponent className="w-4 h-4" />
                      <span className="text-[10px] leading-tight">{tab.label}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>

            {/* Quick info / description */}
            <div className="text-[10px] text-muted-foreground px-1">{getCurrentViewLabel()}</div>

            {/* Completed Features - always available */}
            {currentProject && (
              <>
                <div className="h-px bg-border my-1" />
                <Collapsible
                  open={expandedBoardActions.has('completed')}
                  onOpenChange={() => toggleBoardAction('completed')}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent/50 transition-colors"
                      data-testid="tools-completed-button"
                    >
                      <span className="text-muted-foreground shrink-0">
                        {expandedBoardActions.has('completed') ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </span>
                      <div className="w-8 h-8 rounded flex items-center justify-center bg-muted relative">
                        <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                        {completedCount > 0 && (
                          <span className="absolute -top-1 -right-1 bg-brand-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                            {completedCount > 99 ? '99+' : completedCount}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-medium">Completed</span>
                        <span className="text-[10px] text-muted-foreground">
                          View completed features
                        </span>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-6 px-2 py-2 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {completedCount === 0
                          ? 'No completed features yet.'
                          : `${completedCount} completed feature${completedCount === 1 ? '' : 's'}`}
                      </p>
                      <Button
                        onClick={() => {
                          setShowCompletedModal(true);
                          setOpen(false);
                        }}
                        size="sm"
                        variant="secondary"
                        className="w-full"
                      >
                        View All
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}

            {/* Board-specific actions - only show when on board view */}
            {isOnBoardView && boardControls && boardControls.isMounted && (
              <>
                {/* Plan - Collapsible */}
                <Collapsible
                  open={expandedBoardActions.has('plan')}
                  onOpenChange={() => toggleBoardAction('plan')}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent/50 transition-colors"
                      data-testid="tools-plan-button"
                    >
                      <span className="text-muted-foreground shrink-0">
                        {expandedBoardActions.has('plan') ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </span>
                      <div className="w-8 h-8 rounded flex items-center justify-center bg-muted relative">
                        <Wand2 className="w-4 h-4 text-muted-foreground" />
                        {boardControls.hasPendingPlan && (
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full flex items-center justify-center">
                            <ClipboardCheck className="w-2 h-2 text-white" />
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-start flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Plan</span>
                          {boardControls.hasPendingPlan && (
                            <span className="text-[10px] text-emerald-500 font-medium">
                              Review ready
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          Generate feature plans
                        </span>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-6 px-2 py-2 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {boardControls.hasPendingPlan
                          ? 'A plan is ready for review'
                          : 'Generate plans for backlog features'}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            boardControls.onOpenPlanDialog();
                            setOpen(false);
                          }}
                          size="sm"
                          variant="secondary"
                          className="flex-1"
                        >
                          {boardControls.hasPendingPlan ? 'Review Plan' : 'Generate'}
                        </Button>
                        {planUseSelectedWorktreeBranch !== undefined &&
                          onPlanUseSelectedWorktreeBranchChange && (
                            <PlanSettingsPopover
                              planUseSelectedWorktreeBranch={planUseSelectedWorktreeBranch}
                              onPlanUseSelectedWorktreeBranchChange={
                                onPlanUseSelectedWorktreeBranchChange
                              }
                            />
                          )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}

            {/* AG Configuration - always visible */}
            <div className="h-px bg-border my-1" />
            <div className="text-xs font-medium text-muted-foreground px-1">AG Configuration</div>
            <AgConfigurationSection />
          </div>
        </PopoverContent>
      </Popover>

      {/* Self-contained Completed Features Modal */}
      <CompletedFeaturesModal
        open={showCompletedModal}
        onOpenChange={setShowCompletedModal}
        currentProjectPath={currentProject?.path}
        projectPaths={currentProject ? [currentProject.path] : []}
        availableProjects={new Map(projects.map((p) => [p.path, p.name]))}
      />
    </>
  );
}

/**
 * GitButton - Git dropdown button with branch/worktree controls
 *
 * This button provides access to:
 * - Branch/worktree selector dropdown
 * - Create new worktree button
 * - Refresh worktrees button
 * - Worktree Bar visibility toggle (T001: moved from BoardHeader)
 * - Worktree settings (default to worktree mode for new features)
 */
interface GitButtonProps {
  currentProject: Project | null;
  onCreateWorktree?: () => void;
  onWorktreeRefresh?: () => void;
  worktreeRefreshTrigger?: number;
}

function GitButton({
  currentProject,
  onCreateWorktree,
  onWorktreeRefresh,
  worktreeRefreshTrigger = 0,
}: GitButtonProps) {
  const [open, setOpen] = useState(false);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [isLoadingWorktrees, setIsLoadingWorktrees] = useState(false);
  const [showWorktreeSettings, setShowWorktreeSettings] = useState(false);

  // Git/worktree store state - consolidated with useShallow
  const {
    getCurrentWorktree,
    setCurrentWorktree,
    setWorktrees: setWorktreesInStore,
    useWorktrees: useWorktreesEnabled,
    worktreePanelVisibleByProject,
    setWorktreePanelVisible,
    addFeatureUseSelectedWorktreeBranch,
    setAddFeatureUseSelectedWorktreeBranch,
  } = useAppStore(
    useShallow((state) => ({
      getCurrentWorktree: state.getCurrentWorktree,
      setCurrentWorktree: state.setCurrentWorktree,
      setWorktrees: state.setWorktrees,
      useWorktrees: state.useWorktrees,
      worktreePanelVisibleByProject: state.worktreePanelVisibleByProject,
      setWorktreePanelVisible: state.setWorktreePanelVisible,
      addFeatureUseSelectedWorktreeBranch: state.addFeatureUseSelectedWorktreeBranch,
      setAddFeatureUseSelectedWorktreeBranch: state.setAddFeatureUseSelectedWorktreeBranch,
    }))
  );

  const isWorktreePanelVisible = currentProject
    ? (worktreePanelVisibleByProject[currentProject.path] ?? true)
    : true;

  // Handle worktree panel visibility toggle
  const handleWorktreePanelToggle = useCallback(
    async (visible: boolean) => {
      if (!currentProject) return;
      // Update local store
      setWorktreePanelVisible(currentProject.path, visible);

      // Persist to server
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

  // Fetch worktrees
  const fetchWorktrees = useCallback(async () => {
    if (!currentProject?.path) return;
    setIsLoadingWorktrees(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.listAll) {
        return;
      }
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

  // Initial fetch and refresh on trigger
  useEffect(() => {
    fetchWorktrees();
  }, [fetchWorktrees, worktreeRefreshTrigger]);

  // Get main worktree and non-main worktrees
  const mainWorktree = useMemo(() => worktrees.find((w) => w.isMain), [worktrees]);
  const nonMainWorktrees = useMemo(() => worktrees.filter((w) => !w.isMain), [worktrees]);

  // Check if a worktree is selected
  const isWorktreeSelected = useCallback(
    (worktree: WorktreeInfo) => {
      return worktree.isMain
        ? currentWorktreePath === null
        : pathsEqual(worktree.path, currentWorktreePath);
    },
    [currentWorktreePath]
  );

  // Handle worktree selection
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

  // Handle create worktree - dispatch custom event for BoardView to handle
  const handleCreateWorktree = useCallback(() => {
    if (onCreateWorktree) {
      onCreateWorktree();
    } else {
      // Dispatch a custom event that BoardView will listen for
      window.dispatchEvent(new CustomEvent('automaker:create-worktree'));
    }
    setOpen(false);
  }, [onCreateWorktree]);

  // Get currently selected worktree for display
  const selectedWorktree = useMemo(() => {
    if (currentWorktreePath === null) {
      return mainWorktree;
    }
    return (
      worktrees.find((w) => !w.isMain && pathsEqual(w.path, currentWorktreePath)) || mainWorktree
    );
  }, [worktrees, currentWorktreePath, mainWorktree]);

  // Don't render if no project selected
  if (!currentProject) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'flex items-center gap-2 h-8 px-3',
            'hover:bg-accent/50 transition-colors duration-150',
            'font-medium text-sm'
          )}
          data-testid="git-dropdown-trigger"
        >
          {/* Git Icon */}
          <div className="w-5 h-5 rounded flex items-center justify-center bg-muted">
            <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
          </div>

          {/* Label */}
          <span>Git</span>

          {/* Chevron */}
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="center" className="w-64 p-2" data-testid="git-dropdown-content">
        <div className="flex flex-col gap-3">
          {/* Section Header with Actions */}
          <div className="flex items-center justify-between px-1">
            <div className="text-xs font-medium text-muted-foreground">Branch / Worktree</div>
            <div className="flex items-center gap-1">
              {/* Create Worktree Button */}
              {useWorktreesEnabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={handleCreateWorktree}
                  title="Create new worktree"
                  data-testid="git-create-worktree-button"
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              )}
              {/* Refresh Button */}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => {
                  fetchWorktrees();
                  onWorktreeRefresh?.();
                }}
                disabled={isLoadingWorktrees}
                title="Refresh worktrees"
                data-testid="git-refresh-button"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', isLoadingWorktrees && 'animate-spin')} />
              </Button>
            </div>
          </div>

          {/* Branch/Worktree List */}
          <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
            {/* Main Branch */}
            {mainWorktree && (
              <button
                onClick={() => handleSelectWorktree(mainWorktree)}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-mono cursor-pointer transition-colors',
                  'hover:bg-accent/50',
                  isWorktreeSelected(mainWorktree) && 'bg-accent'
                )}
                data-testid="git-option-main"
              >
                <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="flex-1 truncate text-left">{mainWorktree.branch}</span>
                {isWorktreeSelected(mainWorktree) && (
                  <span className="text-[10px] text-brand-500 font-medium">Active</span>
                )}
              </button>
            )}

            {/* Worktrees Section */}
            {useWorktreesEnabled && nonMainWorktrees.length > 0 && (
              <>
                <div className="h-px bg-border my-1" />
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Worktrees
                </div>
                {nonMainWorktrees.map((worktree) => (
                  <button
                    key={worktree.path}
                    onClick={() => handleSelectWorktree(worktree)}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-mono cursor-pointer transition-colors',
                      'hover:bg-accent/50',
                      isWorktreeSelected(worktree) && 'bg-accent'
                    )}
                    data-testid={`git-option-${worktree.branch}`}
                  >
                    <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="flex-1 truncate text-left">{worktree.branch}</span>
                    {isWorktreeSelected(worktree) && (
                      <span className="text-[10px] text-brand-500 font-medium">Active</span>
                    )}
                  </button>
                ))}
              </>
            )}

            {/* Create Worktree Option */}
            {useWorktreesEnabled && (
              <>
                <div className="h-px bg-border my-1" />
                <button
                  onClick={handleCreateWorktree}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer text-brand-500 hover:bg-accent/50 transition-colors"
                  data-testid="git-create-option"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="font-medium">Create Worktree</span>
                </button>
              </>
            )}
          </div>

          {/* Current selection info */}
          <div className="text-[10px] text-muted-foreground px-1 border-t border-border pt-2">
            Current: <span className="font-mono">{selectedWorktree?.branch || 'main'}</span>
          </div>

          {/* Worktree Bar Toggle - T001: Moved from BoardHeader */}
          {useWorktreesEnabled && (
            <>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between px-1 py-1">
                <div className="flex items-center gap-2">
                  <PanelTop className="w-3.5 h-3.5 text-muted-foreground" />
                  <Label
                    htmlFor="worktree-bar-toggle"
                    className="text-xs font-medium cursor-pointer"
                  >
                    Worktree Bar
                  </Label>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    id="worktree-bar-toggle"
                    checked={isWorktreePanelVisible}
                    onCheckedChange={handleWorktreePanelToggle}
                    data-testid="worktree-bar-toggle"
                  />
                  {/* Worktree Settings Popover */}
                  <Popover open={showWorktreeSettings} onOpenChange={setShowWorktreeSettings}>
                    <PopoverTrigger asChild>
                      <button
                        className="p-1 rounded hover:bg-accent/50 transition-colors"
                        title="Worktree Settings"
                        data-testid="worktree-settings-button"
                      >
                        <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72" align="end" sideOffset={8}>
                      <div className="space-y-3">
                        <div>
                          <h4 className="font-medium text-sm mb-1">Worktree Settings</h4>
                          <p className="text-xs text-muted-foreground">
                            Configure how worktrees affect feature creation.
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-3 p-2 rounded-md bg-secondary/50">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <GitBranch className="w-4 h-4 text-brand-500 shrink-0" />
                            <Label
                              htmlFor="worktree-branch-toggle"
                              className="text-xs font-medium cursor-pointer"
                            >
                              Default to worktree mode
                            </Label>
                          </div>
                          <Switch
                            id="worktree-branch-toggle"
                            checked={addFeatureUseSelectedWorktreeBranch}
                            onCheckedChange={setAddFeatureUseSelectedWorktreeBranch}
                            data-testid="worktree-branch-toggle"
                          />
                        </div>

                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          New features will automatically use isolated worktrees, keeping changes
                          separate from your main branch until you're ready to merge.
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * SettingsButton - Settings navigation button
 *
 * Phase 3: T014 - Add Settings button to top bar
 */
interface SettingsButtonProps {
  location: { pathname: string };
  onNavigate: (path: string) => void;
}

function SettingsButton({ location, onNavigate }: SettingsButtonProps) {
  // Check if we're on the settings view
  const isOnSettings = location.pathname === '/settings';

  const handleClick = () => {
    onNavigate('/settings');
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={cn(
        'flex items-center gap-2 h-8 px-3',
        'hover:bg-accent/50 transition-colors duration-150',
        'font-medium text-sm',
        isOnSettings && 'bg-brand-500/10 text-brand-500'
      )}
      data-testid="settings-button"
    >
      {/* Settings Icon */}
      <div
        className={cn(
          'w-5 h-5 rounded flex items-center justify-center',
          isOnSettings ? 'bg-brand-500/20' : 'bg-muted'
        )}
      >
        <Settings
          className={cn('w-3.5 h-3.5', isOnSettings ? 'text-brand-500' : 'text-muted-foreground')}
        />
      </div>

      {/* Label */}
      <span>Settings</span>
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
  // Check current view states
  const isOnGitHubIssues = location.pathname === '/github-issues';
  const isOnGitHubPRs = location.pathname === '/github-prs';
  const isOnGitHubView = isOnGitHubIssues || isOnGitHubPRs;
  const isOnIdeation = location.pathname === '/ideation';
  const isOnSpec = location.pathname === '/spec';
  const isOnMemory = location.pathname === '/memory';
  const isOnTerminal = location.pathname === '/terminal';
  const isOnToolsView = isOnIdeation || isOnSpec || isOnMemory || isOnTerminal;
  const isOnSettings = location.pathname === '/settings';

  // Navigation items configuration
  const navItems = [
    {
      id: 'github-issues',
      label: 'GitHub Issues',
      icon: CircleDot,
      path: '/github-issues',
      isActive: isOnGitHubIssues,
    },
    {
      id: 'github-prs',
      label: 'GitHub PRs',
      icon: GitPullRequest,
      path: '/github-prs',
      isActive: isOnGitHubPRs,
    },
    {
      id: 'ideation',
      label: 'Ideation',
      icon: Lightbulb,
      path: '/ideation',
      isActive: isOnIdeation,
    },
    {
      id: 'spec',
      label: 'Spec Editor',
      icon: FileText,
      path: '/spec',
      isActive: isOnSpec,
    },
    {
      id: 'memory',
      label: 'Memory',
      icon: Brain,
      path: '/memory',
      isActive: isOnMemory,
    },
    {
      id: 'terminal',
      label: 'Terminal',
      icon: Terminal,
      path: '/terminal',
      isActive: isOnTerminal,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      path: '/settings',
      isActive: isOnSettings,
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
              onClick={() => onNavigate(item.path)}
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
