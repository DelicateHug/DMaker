// @ts-nocheck
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import {
  PointerSensor,
  useSensor,
  useSensors,
  rectIntersection,
  pointerWithin,
  type PointerEvent as DndPointerEvent,
} from '@dnd-kit/core';

// Custom pointer sensor that ignores drag events from within dialogs
class DialogAwarePointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: { nativeEvent: DndPointerEvent }) => {
        // Don't start drag if the event originated from inside a dialog
        if ((event.target as Element)?.closest?.('[role="dialog"]')) {
          return false;
        }
        return true;
      },
    },
  ];
}
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, Feature } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { getHttpApiClient } from '@/lib/http-api-client';
import type { AutoModeEvent } from '@/types/electron';
import type { ModelAlias, CursorModelId, BacklogPlanResult } from '@automaker/types';
import { pathsEqual, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getBlockingDependencies } from '@automaker/dependency-resolver';
import { BoardBackgroundModal } from '@/components/dialogs';
import { Button } from '@/components/ui/button';
import {
  Activity,
  Bot,
  PanelRight,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  FolderOpen,
  Rocket,
  Layers,
} from 'lucide-react';
import { getProjectIcon } from '@/lib/icon-registry';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';
import { LazyImage } from '@/components/ui/lazy-image';
import type { Project } from '@/lib/electron';
import { DeleteProjectDialog } from '@/components/dialogs';
import { initializeProject, hasAutomakerDir, hasAppSpec } from '@/lib/project-init';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useAutoMode } from '@/hooks/use-auto-mode';
import { useKeyboardShortcutsConfig } from '@/hooks/use-keyboard-shortcuts';
import { useWindowState } from '@/hooks/use-window-state';
import { useIsTablet } from '@/hooks/use-media-query';
// Board-view specific imports
// BoardHeader is now integrated into top-nav-bar
// import { BoardHeader } from './board-view/board-header';
import { KanbanBoard } from './board-view/kanban-board';
import {
  AddFeatureDialog,
  AgentOutputModal,
  BacklogPlanDialog,
  CompleteAllWaitingDialog,
  EditFeatureDialog,
  FollowUpDialog,
  PlanApprovalDialog,
  UnsatisfiedDependenciesDialog,
  MassEditDialog,
  CodeEditorWindow,
  PipelineSettingsDialog,
  CreateWorktreeDialog,
  DeleteWorktreeDialog,
  CommitWorktreeDialog,
  CreatePRDialog,
  CreateBranchDialog,
  MergeWorktreeDialog,
} from './board-view/dialogs';
import type { PRInfo, WorktreeInfo } from './board-view/worktree-panel/types';
import { COLUMNS, getColumnsWithPipeline } from './board-view/constants';
import {
  useBoardFeatures,
  useBoardDragDrop,
  useBoardActions,
  useBoardKeyboardShortcuts,
  useBoardColumnFeatures,
  useBoardEffects,
  useBoardBackground,
  useBoardPersistence,
  useFollowUpState,
  useSelectionMode,
  useListViewState,
} from './board-view/hooks';
import { useBoardStatusTabs } from './board-view/hooks/use-board-status-tabs';
import { ALL_PROJECTS_ID } from './board-view/components/board-project-dropdown';
import {
  SelectionActionBar,
  ListView,
  BoardStatusDropdown,
  AgentChatPanel,
  DeployPanel,
  FileExplorer,
  BoardSkeleton,
  RunningAgentsPanel,
} from './board-view/components';
import { InitScriptIndicator } from './board-view/init-script-indicator';
import { useInitScriptEvents } from '@/hooks/use-init-script-events';
import { useBoardControlsStore } from '@/store/board-controls-store';

// Stable empty array to avoid infinite loop in selector
const EMPTY_WORKTREES: ReturnType<ReturnType<typeof useAppStore.getState>['getWorktrees']> = [];

const logger = createLogger('Board');

export function BoardView() {
  const {
    currentProject,
    projects,
    maxConcurrency,
    setMaxConcurrency,
    defaultSkipTests,
    specCreatingForProject,
    setSpecCreatingForProject,
    pendingPlanApproval,
    setPendingPlanApproval,
    updateFeature,
    getCurrentWorktree,
    setCurrentWorktree,
    getWorktrees,
    setWorktrees,
    useWorktrees,
    enableDependencyBlocking,
    skipVerificationInAutoMode,
    setSkipVerificationInAutoMode,
    planUseSelectedWorktreeBranch,
    addFeatureUseSelectedWorktreeBranch,
    isPrimaryWorktreeBranch,
    getPrimaryWorktreeBranch,
    setPipelineConfig,
    showAllProjects,
    pendingBoardStatusTab,
    setPendingBoardStatusTab,
    kanbanPanelSize,
    agentChatPanelSize,
    isKanbanPanelCollapsed,
    isAgentChatPanelCollapsed,
    isDeployPanelCollapsed,
    setKanbanPanelSize,
    setAgentChatPanelSize,
    setKanbanPanelCollapsed,
    setAgentChatPanelCollapsed,
    deployPanelSize,
    setDeployPanelSize,
    setDeployPanelCollapsed,
    moveProjectToTrash,
    removeProject,
    upsertAndSetCurrentProject,
    trashedProjects,
    theme: globalTheme,
  } = useAppStore(
    useShallow((state) => ({
      currentProject: state.currentProject,
      projects: state.projects,
      maxConcurrency: state.maxConcurrency,
      setMaxConcurrency: state.setMaxConcurrency,
      defaultSkipTests: state.defaultSkipTests,
      specCreatingForProject: state.specCreatingForProject,
      setSpecCreatingForProject: state.setSpecCreatingForProject,
      pendingPlanApproval: state.pendingPlanApproval,
      setPendingPlanApproval: state.setPendingPlanApproval,
      updateFeature: state.updateFeature,
      getCurrentWorktree: state.getCurrentWorktree,
      setCurrentWorktree: state.setCurrentWorktree,
      getWorktrees: state.getWorktrees,
      setWorktrees: state.setWorktrees,
      useWorktrees: state.useWorktrees,
      enableDependencyBlocking: state.enableDependencyBlocking,
      skipVerificationInAutoMode: state.skipVerificationInAutoMode,
      setSkipVerificationInAutoMode: state.setSkipVerificationInAutoMode,
      planUseSelectedWorktreeBranch: state.planUseSelectedWorktreeBranch,
      addFeatureUseSelectedWorktreeBranch: state.addFeatureUseSelectedWorktreeBranch,
      isPrimaryWorktreeBranch: state.isPrimaryWorktreeBranch,
      getPrimaryWorktreeBranch: state.getPrimaryWorktreeBranch,
      setPipelineConfig: state.setPipelineConfig,
      showAllProjects: state.showAllProjects,
      pendingBoardStatusTab: state.pendingBoardStatusTab,
      setPendingBoardStatusTab: state.setPendingBoardStatusTab,
      kanbanPanelSize: state.kanbanPanelSize,
      agentChatPanelSize: state.agentChatPanelSize,
      isKanbanPanelCollapsed: state.isKanbanPanelCollapsed,
      isAgentChatPanelCollapsed: state.isAgentChatPanelCollapsed,
      isDeployPanelCollapsed: state.isDeployPanelCollapsed,
      setKanbanPanelSize: state.setKanbanPanelSize,
      setAgentChatPanelSize: state.setAgentChatPanelSize,
      setKanbanPanelCollapsed: state.setKanbanPanelCollapsed,
      setAgentChatPanelCollapsed: state.setAgentChatPanelCollapsed,
      deployPanelSize: state.deployPanelSize,
      setDeployPanelSize: state.setDeployPanelSize,
      setDeployPanelCollapsed: state.setDeployPanelCollapsed,
      moveProjectToTrash: state.moveProjectToTrash,
      removeProject: state.removeProject,
      upsertAndSetCurrentProject: state.upsertAndSetCurrentProject,
      trashedProjects: state.trashedProjects,
      theme: state.theme,
    }))
  );
  // Subscribe to pipelineConfigByProject to trigger re-renders when it changes
  const pipelineConfigByProject = useAppStore((state) => state.pipelineConfigByProject);
  // Subscribe to showInitScriptIndicatorByProject to trigger re-renders when it changes
  const showInitScriptIndicatorByProject = useAppStore(
    (state) => state.showInitScriptIndicatorByProject
  );
  const getShowInitScriptIndicator = useAppStore((state) => state.getShowInitScriptIndicator);
  const getDefaultDeleteBranch = useAppStore((state) => state.getDefaultDeleteBranch);
  const shortcuts = useKeyboardShortcutsConfig();
  const {
    features: hookFeatures,
    isLoading,
    isFullyLoaded,
    isRefreshing,
    persistedCategories,
    loadFeatures,
    refreshFeatures,
    saveCategory,
    // Board-scoped project selection (does NOT affect global currentProject)
    boardSelectedProject,
    setBoardSelectedProject,
    isDifferentFromGlobal,
    syncToGlobal,
    // Board-scoped "show all projects" toggle
    showAllProjectsInBoard,
    setShowAllProjectsInBoard,
  } = useBoardFeatures({ currentProject, projects });
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  // GitHub collaboration: current authenticated user
  const [currentGitHubUser, setCurrentGitHubUser] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [outputFeature, setOutputFeature] = useState<Feature | null>(null);
  const [featuresWithContext, setFeaturesWithContext] = useState<Set<string>>(new Set());
  const [showCompleteAllWaitingDialog, setShowCompleteAllWaitingDialog] = useState(false);
  const [showBoardBackgroundModal, setShowBoardBackgroundModal] = useState(false);
  const [showAutoModeModal, setShowAutoModeModal] = useState(false);
  // State for viewing plan in read-only mode
  const [viewPlanFeature, setViewPlanFeature] = useState<Feature | null>(null);

  // State for spawn task mode
  const [spawnParentFeature, setSpawnParentFeature] = useState<Feature | null>(null);

  // Worktree dialog states
  const [showCreateWorktreeDialog, setShowCreateWorktreeDialog] = useState(false);
  const [showDeleteWorktreeDialog, setShowDeleteWorktreeDialog] = useState(false);
  const [showCommitWorktreeDialog, setShowCommitWorktreeDialog] = useState(false);
  const [showCreatePRDialog, setShowCreatePRDialog] = useState(false);
  const [showCreateBranchDialog, setShowCreateBranchDialog] = useState(false);
  const [showMergeWorktreeDialog, setShowMergeWorktreeDialog] = useState(false);
  const [selectedWorktreeForAction, setSelectedWorktreeForAction] = useState<{
    path: string;
    branch: string;
    isMain: boolean;
    hasChanges?: boolean;
    changedFilesCount?: number;
  } | null>(null);
  const [worktreeRefreshKey, setWorktreeRefreshKey] = useState(0);

  // Backlog plan dialog state
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [pendingBacklogPlan, setPendingBacklogPlan] = useState<BacklogPlanResult | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  // Pipeline settings dialog state
  const [showPipelineSettings, setShowPipelineSettings] = useState(false);

  // File explorer and code editor state
  const [showFileExplorer, setShowFileExplorer] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [codeEditorFilePath, setCodeEditorFilePath] = useState<string | undefined>(undefined);

  // Handle file selection from file explorer
  const handleFileSelect = useCallback((filePath: string) => {
    setCodeEditorFilePath(filePath);
    setShowCodeEditor(true);
  }, []);

  // Project selector state and handlers (in board status tabs row)
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  // Delete project dialog state
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const handleOpenDeleteDialog = useCallback((project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setProjectToDelete(project);
    setDeleteProjectDialogOpen(true);
    setIsProjectDropdownOpen(false);
  }, []);

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

  // Handle adding a new project via folder selection dialog
  const handleAddProject = useCallback(async () => {
    setIsProjectDropdownOpen(false);
    const api = getElectronAPI();
    const result = await api.openDirectory();

    if (!result.canceled && result.filePaths[0]) {
      const path = result.filePaths[0];
      const name = path.split(/[/\\]/).filter(Boolean).pop() || 'Untitled Project';

      try {
        const hadAutomakerDir = await hasAutomakerDir(path);
        const initResult = await initializeProject(path);

        if (!initResult.success) {
          toast.error('Failed to initialize project', {
            description: initResult.error || 'Unknown error occurred',
          });
          return;
        }

        const trashedProject = trashedProjects.find((p) => p.path === path);
        const effectiveTheme = trashedProject?.theme || currentProject?.theme || globalTheme;
        upsertAndSetCurrentProject(path, name, effectiveTheme);

        const specExists = await hasAppSpec(path);

        if (!hadAutomakerDir && !specExists) {
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

  // Agent panel project state - FULLY ISOLATED from board project changes
  // This allows the agent chat to maintain its session and state while the user:
  // 1. Switches projects in the board dropdown (boardSelectedProject changes)
  // 2. Switches the global project (currentProject changes)
  // The agent panel project is only updated when the user explicitly changes it
  // via the project selector within the agent chat panel itself.
  // NOTE: Initialized with currentProject but never auto-synced afterward
  const [agentPanelProject, setAgentPanelProject] = useState<Project | null>(currentProject);

  // Handle agent panel project change from the session selector
  const handleAgentPanelProjectChange = useCallback((project: Project) => {
    setAgentPanelProject(project);
  }, []);

  // Memoized callback for agent chat panel collapse changes
  // This prevents unnecessary re-renders of the memoized AgentChatPanel component
  const handleAgentChatPanelCollapseChange = useCallback(
    (collapsed: boolean) => {
      setAgentChatPanelCollapsed(collapsed);
    },
    [setAgentChatPanelCollapsed]
  );

  // Memoized callback for deploy panel collapse changes
  // This prevents unnecessary re-renders of the memoized DeployPanel component
  const handleDeployPanelCollapseChange = useCallback(
    (collapsed: boolean) => {
      setDeployPanelCollapsed(collapsed);
    },
    [setDeployPanelCollapsed]
  );

  // Track specific project IDs when multiple projects are selected
  // null means "all projects" (no filtering), otherwise contains specific project IDs
  const [multiSelectedProjectIds, setMultiSelectedProjectIds] = useState<string[] | null>(null);

  // Handle project selection from dropdown
  // Uses board-scoped state instead of global state to allow browsing
  // features from different projects without affecting agent sessions
  const handleProjectSelect = useCallback(
    (project: Project | null) => {
      if (project === null) {
        // "All Projects" selected
        setShowAllProjectsInBoard(true);
        setMultiSelectedProjectIds(null);
      } else {
        setShowAllProjectsInBoard(false);
        setMultiSelectedProjectIds(null);
        setBoardSelectedProject(project);
      }
      setIsProjectDropdownOpen(false);
    },
    [setShowAllProjectsInBoard, setBoardSelectedProject]
  );

  // Computed selectedProjectIds for the multi-select project dropdown
  const selectedProjectIds = useMemo(() => {
    if (multiSelectedProjectIds) return multiSelectedProjectIds;
    if (showAllProjectsInBoard) return [ALL_PROJECTS_ID];
    if (boardSelectedProject) return [boardSelectedProject.id];
    return [ALL_PROJECTS_ID];
  }, [showAllProjectsInBoard, boardSelectedProject, multiSelectedProjectIds]);

  // Handle multi-select project dropdown changes
  const handleProjectSelectionChange = useCallback(
    (projectIds: string[]) => {
      if (projectIds.includes(ALL_PROJECTS_ID) || projectIds.length === 0) {
        setShowAllProjectsInBoard(true);
        setMultiSelectedProjectIds(null);
      } else if (projectIds.length === 1) {
        // Single project selected
        const project = projects.find((p) => p.id === projectIds[0]);
        if (project) {
          setShowAllProjectsInBoard(false);
          setMultiSelectedProjectIds(null);
          setBoardSelectedProject(project);
        }
      } else {
        // Multiple projects selected - load all projects but filter to selection
        setShowAllProjectsInBoard(true);
        setMultiSelectedProjectIds(projectIds);
      }
    },
    [projects, setShowAllProjectsInBoard, setBoardSelectedProject]
  );

  // Computed values for project selector display
  // Uses board-scoped state instead of global state to show the board's selected project
  const selectedProject = showAllProjectsInBoard ? null : boardSelectedProject;
  const selectedProjectLabel = showAllProjectsInBoard
    ? 'All Projects'
    : boardSelectedProject?.name || 'Select Project';
  const CurrentProjectIcon = selectedProject ? getProjectIcon(selectedProject.icon) : Layers;
  const hasCustomProjectIcon = selectedProject?.customIconPath;

  // Follow-up state hook
  const {
    showFollowUpDialog,
    followUpFeature,
    followUpPrompt,
    followUpImagePaths,
    followUpPreviewMap,
    followUpPromptHistory,
    setShowFollowUpDialog,
    setFollowUpFeature,
    setFollowUpPrompt,
    setFollowUpImagePaths,
    setFollowUpPreviewMap,
    handleFollowUpDialogChange,
    addToPromptHistory,
    resetFollowUpState,
  } = useFollowUpState();

  // Selection mode hook for mass editing
  const {
    isSelectionMode,
    selectionTarget,
    selectedFeatureIds,
    selectedCount,
    toggleSelectionMode,
    toggleFeatureSelection,
    selectAll,
    clearSelection,
    exitSelectionMode,
  } = useSelectionMode();
  const [showMassEditDialog, setShowMassEditDialog] = useState(false);

  // View mode state (kanban vs list)
  const { viewMode, setViewMode, isListView, sortConfig, setSortColumn } = useListViewState();

  // Filter features by selected projects when multi-project filter is active.
  // When multiSelectedProjectIds is set, only show features from those specific projects.
  // This allows the "all projects" loading mode to fetch from all projects,
  // while the UI only displays the user's selected subset.
  const projectFilteredFeatures = useMemo(() => {
    if (!multiSelectedProjectIds) return hookFeatures;
    const selectedPaths = new Set(
      projects.filter((p) => multiSelectedProjectIds.includes(p.id)).map((p) => p.path)
    );
    return hookFeatures.filter((f) => f.projectPath && selectedPaths.has(f.projectPath));
  }, [hookFeatures, multiSelectedProjectIds, projects]);

  // Compute lightweight feature counts by status for smart tab defaulting.
  // This runs before useBoardStatusTabs so the hook can prefer in_progress → completed
  // as the initial tab when no persisted preference exists.
  const featureCountsByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of projectFilteredFeatures) {
      const status = f.status || 'backlog';
      counts[status] = (counts[status] || 0) + 1;
    }
    return counts;
  }, [projectFilteredFeatures]);

  // Board status tabs state for single-column mode
  // Note: We initialize with columns after pipelineConfig is loaded below
  const {
    activeTab: activeStatusTab,
    activeTabs: activeStatusTabs,
    setActiveTab: setActiveStatusTab,
    setActiveTabs: setActiveStatusTabs,
    toggleTab: toggleStatusTab,
    tabs: statusTabs,
    nextTab: nextStatusTab,
    previousTab: previousStatusTab,
    isAllMode: isAllStatusMode,
  } = useBoardStatusTabs({
    columns: getColumnsWithPipeline(
      pipelineConfigByProject[boardSelectedProject?.path ?? ''] || null
    ),
    persist: true,
    featureCounts: featureCountsByStatus,
  });

  // Consume pending board status tab signal (e.g. from clicking a running agent)
  useEffect(() => {
    if (pendingBoardStatusTab) {
      setActiveStatusTab(pendingBoardStatusTab);
      setPendingBoardStatusTab(null);
    }
  }, [pendingBoardStatusTab, setActiveStatusTab, setPendingBoardStatusTab]);

  // Status tab change handler with multi-select support: clicking a tab toggles it on/off,
  // and the hook handles "All" deselection logic automatically.
  const handleStatusTabChange = useCallback(
    (tabId: string) => {
      toggleStatusTab(tabId);
    },
    [toggleStatusTab]
  );

  // Batch-commit handler for BoardStatusDropdown staged selection.
  // When the dropdown closes, it commits the full array of selected tabs.
  const handleStatusTabsCommit = useCallback(
    (tabIds: string[]) => {
      setActiveStatusTabs(tabIds);
    },
    [setActiveStatusTabs]
  );

  // Handler to create a new custom status (pipeline step) from the dropdown.
  const handleCreateStatus = useCallback(
    async (name: string, colorClass: string) => {
      if (!boardSelectedProject?.path) return;
      try {
        const api = getHttpApiClient();
        const step = {
          name,
          instructions: `Process features in the "${name}" status.`,
          colorClass,
          order: pipelineConfigByProject[boardSelectedProject.path]?.steps?.length ?? 0,
        };
        const result = await api.pipeline.addStep(boardSelectedProject.path, step);
        if (result.success && result.config) {
          setPipelineConfig(boardSelectedProject.path, result.config);
          toast.success(`Status "${name}" created`);
        } else {
          toast.error(result.error || 'Failed to create status');
        }
      } catch {
        toast.error('Failed to create status');
      }
    },
    [boardSelectedProject?.path, pipelineConfigByProject, setPipelineConfig]
  );

  // Handler to delete a custom status (pipeline step) from the dropdown.
  const handleDeleteStatus = useCallback(
    async (tabId: string) => {
      if (!boardSelectedProject?.path) return;
      // Extract step ID from pipeline status (e.g., "pipeline_step_abc" -> "step_abc")
      const stepId = tabId.startsWith('pipeline_') ? tabId.replace('pipeline_', '') : tabId;
      try {
        const api = getHttpApiClient();
        const result = await api.pipeline.deleteStep(boardSelectedProject.path, stepId);
        if (result.success) {
          // Reload the pipeline config
          const configResult = await api.pipeline.getConfig(boardSelectedProject.path);
          if (configResult.success && configResult.config) {
            setPipelineConfig(boardSelectedProject.path, configResult.config);
          }
          toast.success('Status deleted');
        } else {
          toast.error(result.error || 'Failed to delete status');
        }
      } catch {
        toast.error('Failed to delete status');
      }
    },
    [boardSelectedProject?.path, setPipelineConfig]
  );

  // Search filter for Kanban cards
  const [searchQuery, setSearchQuery] = useState('');
  // Favorites filter state
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  // Plan approval loading state
  const [isPlanApprovalLoading, setIsPlanApprovalLoading] = useState(false);
  // Active panel for tablet/mobile view - which panel is currently visible
  // 'kanban' = Kanban board, 'agents' = Running agents, 'deploy' = Deploy panel
  const [activeMobilePanel, setActiveMobilePanel] = useState<'kanban' | 'agents' | 'deploy'>(
    'kanban'
  );
  // Responsive breakpoint detection
  const isTabletOrSmaller = useIsTablet();
  // Ref to track panel sizes during drag - only commit to Zustand when drag ends
  // This prevents excessive state updates/re-renders during resize
  const pendingPanelSizesRef = useRef<{ kanban: number; agentChat: number; deploy: number } | null>(
    null
  );
  // Derive spec creation state from store - check if current project is the one being created
  const isCreatingSpec = specCreatingForProject === currentProject?.path;
  const creatingSpecProjectPath = specCreatingForProject ?? undefined;

  const checkContextExists = useCallback(
    async (featureId: string): Promise<boolean> => {
      if (!boardSelectedProject) return false;

      try {
        const api = getElectronAPI();
        if (!api?.autoMode?.contextExists) {
          return false;
        }

        const result = await api.autoMode.contextExists(boardSelectedProject.path, featureId);

        return result.success && result.exists === true;
      } catch (error) {
        logger.error('Error checking context:', error);
        return false;
      }
    },
    [boardSelectedProject]
  );

  // Use board effects hook
  useBoardEffects({
    currentProject,
    specCreatingForProject,
    setSpecCreatingForProject,
    checkContextExists,
    features: hookFeatures,
    isLoading,
    featuresWithContext,
    setFeaturesWithContext,
  });

  // Reset board state when board-selected project changes
  // This ensures stale state from a previous project is not carried over
  // NOTE: Uses boardSelectedProject (not currentProject) because the board dropdown
  // changes the board-scoped project while leaving the global project unchanged.
  // This allows users to browse different projects without affecting agent sessions.
  useEffect(() => {
    // Reset search and filter state
    setSearchQuery('');
    setShowFavoritesOnly(false);

    // Exit selection mode to clear any selected features
    exitSelectionMode();

    // Close any open dialogs that are project-specific
    setShowAddDialog(false);
    setEditingFeature(null);
    setShowOutputModal(false);
    setOutputFeature(null);
    setViewPlanFeature(null);
    setSpawnParentFeature(null);
    setShowMassEditDialog(false);

    // Close worktree-related dialogs
    setShowCreateWorktreeDialog(false);
    setShowDeleteWorktreeDialog(false);
    setShowCommitWorktreeDialog(false);
    setShowCreatePRDialog(false);
    setShowCreateBranchDialog(false);
    setShowMergeWorktreeDialog(false);
    setSelectedWorktreeForAction(null);

    // Close plan-related dialogs
    setShowPlanDialog(false);
    setPendingBacklogPlan(null);

    // Reset follow-up dialog state
    resetFollowUpState();

    // Close other project-specific dialogs
    setShowPipelineSettings(false);
    // Keep file explorer open across project switches - users expect it to stay visible
    setShowCodeEditor(false);
    setCodeEditorFilePath(undefined);

    // Reset features with context tracking
    setFeaturesWithContext(new Set());

    // Trigger worktree refresh on project switch
    setWorktreeRefreshKey((prev) => prev + 1);

    logger.info('Board state reset for project switch');
  }, [boardSelectedProject?.path, exitSelectionMode, resetFollowUpState]);

  // Load pipeline config when board-selected project changes
  // This ensures the board shows the correct pipeline columns for the selected project
  useEffect(() => {
    if (!boardSelectedProject?.path) return;

    const loadPipelineConfig = async () => {
      try {
        const api = getHttpApiClient();
        const result = await api.pipeline.getConfig(boardSelectedProject.path);
        if (result.success && result.config) {
          setPipelineConfig(boardSelectedProject.path, result.config);
        }
      } catch (error) {
        logger.error('Failed to load pipeline config:', error);
      }
    };

    loadPipelineConfig();
  }, [boardSelectedProject?.path, setPipelineConfig]);

  // Auto mode hook
  const autoMode = useAutoMode();
  // Get runningTasks from the hook (scoped to current project)
  const runningAutoTasks = autoMode.runningTasks;

  // Window state hook for compact dialog mode
  const { isMaximized } = useWindowState();

  // Init script events hook - subscribe to worktree init script events
  useInitScriptEvents(currentProject?.path ?? null);

  // Keyboard shortcuts hook will be initialized after actions hook

  // Prevent hydration issues
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch GitHub current user when the project changes (for claim badge display)
  useEffect(() => {
    if (!currentProject?.path) return;
    const api = getElectronAPI();
    api.github
      ?.getCurrentUser?.(currentProject.path)
      .then((result) => {
        if (result?.success) setCurrentGitHubUser(result.username ?? null);
      })
      .catch(() => {
        // Non-fatal: badges degrade gracefully without a user
      });
  }, [currentProject?.path]);

  const sensors = useSensors(
    useSensor(DialogAwarePointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Get unique categories from existing features AND persisted categories for autocomplete suggestions
  const categorySuggestions = useMemo(() => {
    const featureCategories = hookFeatures.map((f) => f.category).filter(Boolean);
    // Merge feature categories with persisted categories
    const allCategories = [...featureCategories, ...persistedCategories];
    return [...new Set(allCategories)].sort();
  }, [hookFeatures, persistedCategories]);

  // Branch suggestions for the branch autocomplete
  // Shows all local branches as suggestions, but users can type any new branch name
  // When the feature is started, a worktree will be created if needed
  const [branchSuggestions, setBranchSuggestions] = useState<string[]>([]);

  // Fetch branches when project changes or worktrees are created/modified
  useEffect(() => {
    const fetchBranches = async () => {
      if (!currentProject) {
        setBranchSuggestions([]);
        return;
      }

      try {
        const api = getElectronAPI();
        if (!api?.worktree?.listBranches) {
          setBranchSuggestions([]);
          return;
        }

        const result = await api.worktree.listBranches(currentProject.path);
        if (result.success && result.result?.branches) {
          const localBranches = result.result.branches
            .filter((b) => !b.isRemote)
            .map((b) => b.name);
          setBranchSuggestions(localBranches);
        }
      } catch (error) {
        logger.error('Error fetching branches:', error);
        setBranchSuggestions([]);
      }
    };

    fetchBranches();
  }, [currentProject, worktreeRefreshKey]);

  // Custom collision detection that prioritizes columns over cards
  const collisionDetectionStrategy = useCallback((args: any) => {
    // First, check if pointer is within a column
    const pointerCollisions = pointerWithin(args);
    const columnCollisions = pointerCollisions.filter((collision: any) =>
      COLUMNS.some((col) => col.id === collision.id)
    );

    // If we found a column collision, use that
    if (columnCollisions.length > 0) {
      return columnCollisions;
    }

    // Otherwise, use rectangle intersection for cards
    return rectIntersection(args);
  }, []);

  // Use persistence hook
  const { persistFeatureCreate, persistFeatureUpdate, persistFeatureDelete } = useBoardPersistence({
    currentProject,
  });

  // Memoize the removed worktrees handler to prevent infinite loops
  const handleRemovedWorktrees = useCallback(
    (removedWorktrees: Array<{ path: string; branch: string }>) => {
      // Reset features that were assigned to the removed worktrees (by branch)
      hookFeatures.forEach((feature) => {
        const matchesRemovedWorktree = removedWorktrees.some((removed) => {
          // Match by branch name since worktreePath is no longer stored
          return feature.branchName === removed.branch;
        });

        if (matchesRemovedWorktree) {
          // Reset the feature's branch assignment - update both local state and persist
          const updates = { branchName: null as unknown as string | undefined };
          updateFeature(feature.id, updates);
          persistFeatureUpdate(feature.id, updates);
        }
      });
    },
    [hookFeatures, updateFeature, persistFeatureUpdate]
  );

  // Get in-progress features for keyboard shortcuts (needed before actions hook)
  const inProgressFeaturesForShortcuts = useMemo(() => {
    return hookFeatures.filter((f) => {
      const isRunning = runningAutoTasks.includes(f.id);
      return isRunning || f.status === 'in_progress';
    });
  }, [hookFeatures, runningAutoTasks]);

  // Get current worktree info (path) for filtering features
  // This needs to be before useBoardActions so we can pass currentWorktreeBranch
  const currentWorktreeInfo = currentProject ? getCurrentWorktree(currentProject.path) : null;
  const currentWorktreePath = currentWorktreeInfo?.path ?? null;
  const worktreesByProject = useAppStore((s) => s.worktreesByProject);
  const worktrees = useMemo(
    () =>
      currentProject
        ? (worktreesByProject[currentProject.path] ?? EMPTY_WORKTREES)
        : EMPTY_WORKTREES,
    [currentProject, worktreesByProject]
  );

  // Get the branch for the currently selected worktree
  // Find the worktree that matches the current selection, or use main worktree
  const selectedWorktree = useMemo(() => {
    if (currentWorktreePath === null) {
      // Primary worktree selected - find the main worktree
      return worktrees.find((w) => w.isMain);
    } else {
      // Specific worktree selected - find it by path
      return worktrees.find((w) => !w.isMain && pathsEqual(w.path, currentWorktreePath));
    }
  }, [worktrees, currentWorktreePath]);

  // Get the current branch from the selected worktree (not from store which may be stale)
  const currentWorktreeBranch = selectedWorktree?.branch ?? null;

  // Get the branch for the currently selected worktree (for defaulting new features)
  // Use the branch from selectedWorktree, or fall back to main worktree's branch
  const selectedWorktreeBranch =
    currentWorktreeBranch || worktrees.find((w) => w.isMain)?.branch || 'main';

  // Calculate active (non-completed) card counts per branch
  const branchCardCounts = useMemo(() => {
    // Use primary worktree branch as default for features without branchName
    const primaryBranch = worktrees.find((w) => w.isMain)?.branch || 'main';
    return hookFeatures.reduce(
      (counts, feature) => {
        if (feature.status !== 'completed') {
          const branch = feature.branchName ?? primaryBranch;
          counts[branch] = (counts[branch] || 0) + 1;
        }
        return counts;
      },
      {} as Record<string, number>
    );
  }, [hookFeatures, worktrees]);

  // Helper function to add and select a worktree
  const addAndSelectWorktree = useCallback(
    (worktreeResult: { path: string; branch: string }) => {
      if (!currentProject) return;

      const currentWorktrees = getWorktrees(currentProject.path);
      const existingWorktree = currentWorktrees.find((w) => w.branch === worktreeResult.branch);

      // Only add if it doesn't already exist (to avoid duplicates)
      if (!existingWorktree) {
        const newWorktreeInfo = {
          path: worktreeResult.path,
          branch: worktreeResult.branch,
          isMain: false,
          isCurrent: false,
          hasWorktree: true,
        };
        setWorktrees(currentProject.path, [...currentWorktrees, newWorktreeInfo]);
      }
      // Select the worktree (whether it existed or was just added)
      setCurrentWorktree(currentProject.path, worktreeResult.path, worktreeResult.branch);
    },
    [currentProject, getWorktrees, setWorktrees, setCurrentWorktree]
  );

  // Extract all action handlers into a hook
  const {
    handleAddFeature,
    handleUpdateFeature,
    handleDeleteFeature,
    handleStartImplementation,
    handleVerifyFeature,
    handleResumeFeature,
    handleManualVerify,
    handleMoveBackToInProgress,
    handleMoveBackToBacklog,
    handleOpenFollowUp,
    handleSendFollowUp,
    handleCommitFeature,
    handleMergeFeature,
    handleCompleteFeature,
    handleRestoreFeature,
    handleViewOutput,
    handleOutputModalNumberKeyPress,
    handleForceStopFeature,
    handleStartNextFeatures,
    handleCompleteAllWaiting,
    // Unsatisfied dependencies dialog state and handlers
    unsatisfiedDepsDialog,
    handleConfirmStartWithUnsatisfiedDeps,
    handleCancelStartWithUnsatisfiedDeps,
    handleUnsatisfiedDepsDialogOpenChange,
  } = useBoardActions({
    currentProject: boardSelectedProject,
    features: hookFeatures,
    runningAutoTasks,
    loadFeatures,
    persistFeatureCreate,
    persistFeatureUpdate,
    persistFeatureDelete,
    saveCategory,
    setEditingFeature,
    setShowOutputModal,
    setOutputFeature,
    followUpFeature,
    followUpPrompt,
    followUpImagePaths,
    setFollowUpFeature,
    setFollowUpPrompt,
    setFollowUpImagePaths,
    setFollowUpPreviewMap,
    setShowFollowUpDialog,
    inProgressFeaturesForShortcuts,
    outputFeature,
    projectPath: boardSelectedProject?.path || null,
    onWorktreeCreated: () => setWorktreeRefreshKey((k) => k + 1),
    onWorktreeAutoSelect: addAndSelectWorktree,
    currentWorktreeBranch,
  });

  // Handler for bulk updating multiple features
  const handleBulkUpdate = useCallback(
    async (updates: Partial<Feature>, workMode: 'current' | 'auto' | 'custom') => {
      if (!boardSelectedProject || selectedFeatureIds.size === 0) return;

      try {
        // Determine final branch name based on work mode:
        // - 'current': Empty string to clear branch assignment (work on main/current branch)
        // - 'auto': Auto-generate branch name based on current branch
        // - 'custom': Use the provided branch name
        let finalBranchName: string | undefined;

        if (workMode === 'current') {
          // Empty string clears the branch assignment, moving features to main/current branch
          finalBranchName = '';
        } else if (workMode === 'auto') {
          // Auto-generate a branch name based on primary branch (main/master) and timestamp
          // Always use primary branch to avoid nested feature/feature/... paths
          const baseBranch = getPrimaryWorktreeBranch(boardSelectedProject.path) || 'main';
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 6);
          finalBranchName = `feature/${baseBranch}-${timestamp}-${randomSuffix}`;
        } else {
          // Custom mode - use provided branch name
          finalBranchName = updates.branchName || undefined;
        }

        // Create worktree for 'auto' or 'custom' modes when we have a branch name
        if ((workMode === 'auto' || workMode === 'custom') && finalBranchName) {
          try {
            const electronApi = getElectronAPI();
            if (electronApi?.worktree?.create) {
              const result = await electronApi.worktree.create(
                boardSelectedProject.path,
                finalBranchName
              );
              if (result.success && result.worktree) {
                logger.info(
                  `Worktree for branch "${finalBranchName}" ${
                    result.worktree?.isNew ? 'created' : 'already exists'
                  }`
                );
                // Auto-select the worktree when creating/using it for bulk update
                addAndSelectWorktree(result.worktree);
                // Refresh worktree list in UI
                setWorktreeRefreshKey((k) => k + 1);
              } else if (!result.success) {
                logger.error(
                  `Failed to create worktree for branch "${finalBranchName}":`,
                  result.error
                );
                toast.error('Failed to create worktree', {
                  description: result.error || 'An error occurred',
                });
                return; // Don't proceed with update if worktree creation failed
              }
            }
          } catch (error) {
            logger.error('Error creating worktree:', error);
            toast.error('Failed to create worktree', {
              description: error instanceof Error ? error.message : 'An error occurred',
            });
            return; // Don't proceed with update if worktree creation failed
          }
        }

        // Use the final branch name in updates
        const finalUpdates = {
          ...updates,
          branchName: finalBranchName,
        };

        const api = getHttpApiClient();
        const featureIds = Array.from(selectedFeatureIds);
        const result = await api.features.bulkUpdate(
          boardSelectedProject.path,
          featureIds,
          finalUpdates
        );

        if (result.success) {
          // Update local state
          featureIds.forEach((featureId) => {
            updateFeature(featureId, finalUpdates);
          });
          toast.success(`Updated ${result.updatedCount} features`);
          exitSelectionMode();
        } else {
          toast.error('Failed to update some features', {
            description: `${result.failedCount} features failed to update`,
          });
        }
      } catch (error) {
        logger.error('Bulk update failed:', error);
        toast.error('Failed to update features');
      }
    },
    [
      boardSelectedProject,
      selectedFeatureIds,
      updateFeature,
      exitSelectionMode,
      getPrimaryWorktreeBranch,
      addAndSelectWorktree,
      setWorktreeRefreshKey,
    ]
  );

  // Handler for bulk deleting multiple features
  const handleBulkDelete = useCallback(async () => {
    if (!boardSelectedProject || selectedFeatureIds.size === 0) return;

    try {
      const api = getHttpApiClient();
      const featureIds = Array.from(selectedFeatureIds);
      const result = await api.features.bulkDelete(boardSelectedProject.path, featureIds);

      const successfullyDeletedIds =
        result.results?.filter((r) => r.success).map((r) => r.featureId) ?? [];

      if (successfullyDeletedIds.length > 0) {
        // Delete from local state without calling the API again
        successfullyDeletedIds.forEach((featureId) => {
          useAppStore.getState().removeFeature(featureId);
        });
        toast.success(`Deleted ${successfullyDeletedIds.length} features`);
      }

      if (result.failedCount && result.failedCount > 0) {
        toast.error('Failed to delete some features', {
          description: `${result.failedCount} features failed to delete`,
        });
      }

      // Exit selection mode and reload if the operation was at least partially processed.
      if (result.results) {
        exitSelectionMode();
        loadFeatures();
      } else if (!result.success) {
        toast.error('Failed to delete features', { description: result.error });
      }
    } catch (error) {
      logger.error('Bulk delete failed:', error);
      toast.error('Failed to delete features');
    }
  }, [boardSelectedProject, selectedFeatureIds, exitSelectionMode, loadFeatures]);

  // Get selected features for mass edit dialog
  const selectedFeatures = useMemo(() => {
    return hookFeatures.filter((f) => selectedFeatureIds.has(f.id));
  }, [hookFeatures, selectedFeatureIds]);

  // Get backlog feature IDs in current branch for "Select All"
  const allSelectableFeatureIds = useMemo(() => {
    return hookFeatures
      .filter((f) => {
        // Only backlog features
        if (f.status !== 'backlog') return false;

        // Skip worktree filtering in multi-project mode
        if (showAllProjectsInBoard) return true;

        // Filter by current worktree branch
        const featureBranch = f.branchName;
        if (!featureBranch) {
          // No branch assigned - only selectable on primary worktree
          return currentWorktreePath === null;
        }
        if (currentWorktreeBranch === null) {
          // Viewing main but branch hasn't been initialized
          return boardSelectedProject?.path
            ? isPrimaryWorktreeBranch(boardSelectedProject.path, featureBranch)
            : false;
        }
        // Match by branch name
        return featureBranch === currentWorktreeBranch;
      })
      .map((f) => f.id);
  }, [
    hookFeatures,
    currentWorktreePath,
    currentWorktreeBranch,
    boardSelectedProject?.path,
    isPrimaryWorktreeBranch,
    showAllProjectsInBoard,
  ]);

  // Get waiting_approval feature IDs in current branch for "Select All"
  const allSelectableWaitingApprovalFeatureIds = useMemo(() => {
    return hookFeatures
      .filter((f) => {
        // Only waiting_approval features
        if (f.status !== 'waiting_approval') return false;

        // Skip worktree filtering in multi-project mode
        if (showAllProjectsInBoard) return true;

        // Filter by current worktree branch
        const featureBranch = f.branchName;
        if (!featureBranch) {
          // No branch assigned - only selectable on primary worktree
          return currentWorktreePath === null;
        }
        if (currentWorktreeBranch === null) {
          // Viewing main but branch hasn't been initialized
          return boardSelectedProject?.path
            ? isPrimaryWorktreeBranch(boardSelectedProject.path, featureBranch)
            : false;
        }
        // Match by branch name
        return featureBranch === currentWorktreeBranch;
      })
      .map((f) => f.id);
  }, [
    hookFeatures,
    currentWorktreePath,
    currentWorktreeBranch,
    boardSelectedProject?.path,
    isPrimaryWorktreeBranch,
    showAllProjectsInBoard,
  ]);

  // Handler for bulk completing multiple features (mark as complete)
  const handleBulkComplete = useCallback(async () => {
    if (!boardSelectedProject || selectedFeatureIds.size === 0) return;

    try {
      const api = getHttpApiClient();
      const featureIds = Array.from(selectedFeatureIds);
      const updates = { status: 'completed' as const };

      // Use bulk update API for efficient batch processing
      const result = await api.features.bulkUpdate(boardSelectedProject.path, featureIds, updates);

      if (result.success) {
        // Update local state for all features
        featureIds.forEach((featureId) => {
          updateFeature(featureId, updates);
        });
        toast.success(`Completed ${result.updatedCount} features`);
        exitSelectionMode();
      } else {
        toast.error('Failed to complete some features', {
          description: `${result.failedCount} features failed to complete`,
        });
      }
    } catch (error) {
      logger.error('Bulk complete failed:', error);
      toast.error('Failed to complete features');
    }
  }, [boardSelectedProject, selectedFeatureIds, updateFeature, exitSelectionMode]);

  // Handler for addressing PR comments - creates a feature and starts it automatically
  const handleAddressPRComments = useCallback(
    async (worktree: WorktreeInfo, prInfo: PRInfo) => {
      // Use a simple prompt that instructs the agent to read and address PR feedback
      // The agent will fetch the PR comments directly, which is more reliable and up-to-date
      const prNumber = prInfo.number;
      const description = `Read the review requests on PR #${prNumber} and address any feedback the best you can.`;

      // Create the feature
      const featureData = {
        title: `Address PR #${prNumber} Review Comments`,
        category: 'PR Review',
        description,
        images: [],
        imagePaths: [],
        skipTests: defaultSkipTests,
        model: 'opus' as const,
        thinkingLevel: 'none' as const,
        branchName: worktree.branch,
        workMode: 'custom' as const, // Use the worktree's branch
        priority: 1, // High priority for PR feedback
        planningMode: 'skip' as const,
        requirePlanApproval: false,
      };

      // Capture existing feature IDs before adding
      const featuresBeforeIds = new Set(useAppStore.getState().features.map((f) => f.id));
      await handleAddFeature(featureData);

      // Find the newly created feature by looking for an ID that wasn't in the original set
      const latestFeatures = useAppStore.getState().features;
      const newFeature = latestFeatures.find((f) => !featuresBeforeIds.has(f.id));

      if (newFeature) {
        await handleStartImplementation(newFeature);
      } else {
        logger.error('Could not find newly created feature to start it automatically.');
        toast.error('Failed to auto-start feature', {
          description: 'The feature was created but could not be started automatically.',
        });
      }
    },
    [handleAddFeature, handleStartImplementation, defaultSkipTests]
  );

  // Handler for resolving conflicts - creates a feature to pull from the remote branch and resolve conflicts
  const handleResolveConflicts = useCallback(
    async (worktree: WorktreeInfo) => {
      const remoteBranch = `origin/${worktree.branch}`;
      const description = `Pull latest from ${remoteBranch} and resolve conflicts. Merge ${remoteBranch} into the current branch (${worktree.branch}), resolving any merge conflicts that arise. After resolving conflicts, ensure the code compiles and tests pass.`;

      // Create the feature
      const featureData = {
        title: `Resolve Merge Conflicts`,
        category: 'Maintenance',
        description,
        images: [],
        imagePaths: [],
        skipTests: defaultSkipTests,
        model: 'opus' as const,
        thinkingLevel: 'none' as const,
        branchName: worktree.branch,
        workMode: 'custom' as const, // Use the worktree's branch
        priority: 1, // High priority for conflict resolution
        planningMode: 'skip' as const,
        requirePlanApproval: false,
      };

      // Capture existing feature IDs before adding
      const featuresBeforeIds = new Set(useAppStore.getState().features.map((f) => f.id));
      await handleAddFeature(featureData);

      // Find the newly created feature by looking for an ID that wasn't in the original set
      const latestFeatures = useAppStore.getState().features;
      const newFeature = latestFeatures.find((f) => !featuresBeforeIds.has(f.id));

      if (newFeature) {
        await handleStartImplementation(newFeature);
      } else {
        logger.error('Could not find newly created feature to start it automatically.');
        toast.error('Failed to auto-start feature', {
          description: 'The feature was created but could not be started automatically.',
        });
      }
    },
    [handleAddFeature, handleStartImplementation, defaultSkipTests]
  );

  // Handler for "Make" button - creates a feature and immediately starts it
  const handleAddAndStartFeature = useCallback(
    async (featureData: Parameters<typeof handleAddFeature>[0]) => {
      // Capture existing feature IDs before adding
      const featuresBeforeIds = new Set(useAppStore.getState().features.map((f) => f.id));
      await handleAddFeature(featureData);

      // Find the newly created feature by looking for an ID that wasn't in the original set
      const latestFeatures = useAppStore.getState().features;
      const newFeature = latestFeatures.find((f) => !featuresBeforeIds.has(f.id));

      if (newFeature) {
        await handleStartImplementation(newFeature);
      } else {
        logger.error('Could not find newly created feature to start it automatically.');
        toast.error('Failed to auto-start feature', {
          description: 'The feature was created but could not be started automatically.',
        });
      }
    },
    [handleAddFeature, handleStartImplementation]
  );

  // Client-side auto mode: periodically check for backlog items and move them to in-progress
  // Use a ref to track the latest auto mode state so async operations always check the current value
  const autoModeRunningRef = useRef(autoMode.isRunning);
  useEffect(() => {
    autoModeRunningRef.current = autoMode.isRunning;
  }, [autoMode.isRunning]);

  // Use a ref to track the latest features to avoid effect re-runs when features change
  const hookFeaturesRef = useRef(hookFeatures);
  useEffect(() => {
    hookFeaturesRef.current = hookFeatures;
  }, [hookFeatures]);

  // Use a ref to track running tasks to avoid effect re-runs that clear pendingFeaturesRef
  const runningAutoTasksRef = useRef(runningAutoTasks);
  useEffect(() => {
    runningAutoTasksRef.current = runningAutoTasks;
  }, [runningAutoTasks]);

  // Keep latest start handler without retriggering the auto mode effect
  const handleStartImplementationRef = useRef(handleStartImplementation);
  useEffect(() => {
    handleStartImplementationRef.current = handleStartImplementation;
  }, [handleStartImplementation]);

  // Track features that are pending (started but not yet confirmed running)
  const pendingFeaturesRef = useRef<Set<string>>(new Set());

  // Listen to auto mode events to remove features from pending when they start running
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.autoMode) return;

    const unsubscribe = api.autoMode.onEvent((event: AutoModeEvent) => {
      if (!currentProject) return;

      // Only process events for the current project
      const eventProjectPath = 'projectPath' in event ? event.projectPath : undefined;
      if (eventProjectPath && eventProjectPath !== currentProject.path) {
        return;
      }

      switch (event.type) {
        case 'auto_mode_feature_start':
          // Feature is now confirmed running - remove from pending
          if (event.featureId) {
            pendingFeaturesRef.current.delete(event.featureId);
          }
          break;

        case 'auto_mode_feature_complete':
        case 'auto_mode_error':
          // Feature completed or errored - remove from pending if still there
          if (event.featureId) {
            pendingFeaturesRef.current.delete(event.featureId);
          }
          break;
      }
    });

    return unsubscribe;
  }, [currentProject]);

  // Listen for 'create-worktree' event from TopNavigationBar's Git button
  useEffect(() => {
    const handleCreateWorktreeEvent = () => {
      setShowCreateWorktreeDialog(true);
    };

    window.addEventListener('automaker:create-worktree', handleCreateWorktreeEvent);
    return () => {
      window.removeEventListener('automaker:create-worktree', handleCreateWorktreeEvent);
    };
  }, []);

  // Listen for backlog plan events (for background generation)
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.backlogPlan) return;

    const unsubscribe = api.backlogPlan.onEvent(
      (event: { type: string; result?: BacklogPlanResult; error?: string }) => {
        if (event.type === 'backlog_plan_complete') {
          setIsGeneratingPlan(false);
          if (event.result && event.result.changes?.length > 0) {
            setPendingBacklogPlan(event.result);
            toast.success('Plan ready! Click to review.', {
              duration: 10000,
              action: {
                label: 'Review',
                onClick: () => setShowPlanDialog(true),
              },
            });
          } else {
            toast.info('No changes generated. Try again with a different prompt.');
          }
        } else if (event.type === 'backlog_plan_error') {
          setIsGeneratingPlan(false);
          toast.error(`Plan generation failed: ${event.error}`);
        }
      }
    );

    return unsubscribe;
  }, []);

  // Load any saved plan from disk when opening the board
  useEffect(() => {
    if (!currentProject || pendingBacklogPlan) return;

    let isActive = true;
    const loadSavedPlan = async () => {
      const api = getElectronAPI();
      if (!api?.backlogPlan) return;

      const result = await api.backlogPlan.status(currentProject.path);
      if (
        isActive &&
        result.success &&
        result.savedPlan?.result &&
        result.savedPlan.result.changes?.length > 0
      ) {
        setPendingBacklogPlan(result.savedPlan.result);
      }
    };

    loadSavedPlan();
    return () => {
      isActive = false;
    };
  }, [currentProject, pendingBacklogPlan]);

  useEffect(() => {
    logger.info(
      '[AutoMode] Effect triggered - isRunning:',
      autoMode.isRunning,
      'hasProject:',
      !!currentProject
    );
    if (!autoMode.isRunning || !currentProject) {
      return;
    }

    logger.info('[AutoMode] Starting auto mode polling loop for project:', currentProject.path);
    let isChecking = false;
    let isActive = true; // Track if this effect is still active

    const checkAndStartFeatures = async () => {
      // Check if auto mode is still running and effect is still active
      // Use ref to get the latest value, not the closure value
      if (!isActive || !autoModeRunningRef.current || !currentProject) {
        return;
      }

      // Prevent concurrent executions
      if (isChecking) {
        return;
      }

      isChecking = true;
      try {
        // Double-check auto mode is still running before proceeding
        if (!isActive || !autoModeRunningRef.current || !currentProject) {
          logger.debug(
            '[AutoMode] Skipping check - isActive:',
            isActive,
            'autoModeRunning:',
            autoModeRunningRef.current,
            'hasProject:',
            !!currentProject
          );
          return;
        }

        // Count currently running tasks + pending features
        // Use ref to get the latest running tasks without causing effect re-runs
        const currentRunning = runningAutoTasksRef.current.length + pendingFeaturesRef.current.size;
        const availableSlots = maxConcurrency - currentRunning;
        logger.debug(
          '[AutoMode] Checking features - running:',
          currentRunning,
          'available slots:',
          availableSlots
        );

        // No available slots, skip check
        if (availableSlots <= 0) {
          return;
        }

        // Filter backlog features by the currently selected worktree branch
        // This logic mirrors use-board-column-features.ts for consistency.
        // HOWEVER: auto mode should still run even if the user is viewing a non-primary worktree,
        // so we fall back to "all backlog features" when none are visible in the current view.
        // Use ref to get the latest features without causing effect re-runs
        const currentFeatures = hookFeaturesRef.current;
        const backlogFeaturesInView = currentFeatures.filter((f) => {
          if (f.status !== 'backlog') return false;

          const featureBranch = f.branchName;

          // Features without branchName are considered unassigned (show only on primary worktree)
          if (!featureBranch) {
            // No branch assigned - show only when viewing primary worktree
            const isViewingPrimary = currentWorktreePath === null;
            return isViewingPrimary;
          }

          if (currentWorktreeBranch === null) {
            // We're viewing main but branch hasn't been initialized yet
            // Show features assigned to primary worktree's branch
            return currentProject.path
              ? isPrimaryWorktreeBranch(currentProject.path, featureBranch)
              : false;
          }

          // Match by branch name
          return featureBranch === currentWorktreeBranch;
        });

        const backlogFeatures =
          backlogFeaturesInView.length > 0
            ? backlogFeaturesInView
            : currentFeatures.filter((f) => f.status === 'backlog');

        logger.debug(
          '[AutoMode] Features - total:',
          currentFeatures.length,
          'backlog in view:',
          backlogFeaturesInView.length,
          'backlog total:',
          backlogFeatures.length
        );

        if (backlogFeatures.length === 0) {
          logger.debug(
            '[AutoMode] No backlog features found, statuses:',
            currentFeatures.map((f) => f.status).join(', ')
          );
          return;
        }

        // Sort by priority (lower number = higher priority, priority 1 is highest)
        const sortedBacklog = [...backlogFeatures].sort(
          (a, b) => (a.priority || 999) - (b.priority || 999)
        );

        // Filter out features with blocking dependencies if dependency blocking is enabled
        // NOTE: skipVerificationInAutoMode means "ignore unmet dependency verification" so we
        // should NOT exclude blocked features in that mode.
        const eligibleFeatures =
          enableDependencyBlocking && !skipVerificationInAutoMode
            ? sortedBacklog.filter((f) => {
                const blockingDeps = getBlockingDependencies(f, currentFeatures);
                if (blockingDeps.length > 0) {
                  logger.debug('[AutoMode] Feature', f.id, 'blocked by deps:', blockingDeps);
                }
                return blockingDeps.length === 0;
              })
            : sortedBacklog;

        logger.debug(
          '[AutoMode] Eligible features after dep check:',
          eligibleFeatures.length,
          'dependency blocking enabled:',
          enableDependencyBlocking
        );

        // Start features up to available slots
        const featuresToStart = eligibleFeatures.slice(0, availableSlots);
        const startImplementation = handleStartImplementationRef.current;
        if (!startImplementation) {
          return;
        }

        logger.info(
          '[AutoMode] Starting',
          featuresToStart.length,
          'features:',
          featuresToStart.map((f) => f.id).join(', ')
        );

        for (const feature of featuresToStart) {
          // Check again before starting each feature
          if (!isActive || !autoModeRunningRef.current || !currentProject) {
            return;
          }

          // Simplified: No worktree creation on client - server derives workDir from feature.branchName
          // If feature has no branchName, assign it to the primary branch so it can run consistently
          // even when the user is viewing a non-primary worktree.
          if (!feature.branchName) {
            const primaryBranch =
              (currentProject.path ? getPrimaryWorktreeBranch(currentProject.path) : null) ||
              'main';
            await persistFeatureUpdate(feature.id, {
              branchName: primaryBranch,
            });
          }

          // Final check before starting implementation
          if (!isActive || !autoModeRunningRef.current || !currentProject) {
            return;
          }

          // Start the implementation - server will derive workDir from feature.branchName
          const started = await startImplementation(feature);

          // If successfully started, track it as pending until we receive the start event
          if (started) {
            pendingFeaturesRef.current.add(feature.id);
          }
        }
      } finally {
        isChecking = false;
      }
    };

    // Check immediately, then every 3 seconds
    checkAndStartFeatures();
    const interval = setInterval(checkAndStartFeatures, 3000);

    return () => {
      // Mark as inactive to prevent any pending async operations from continuing
      isActive = false;
      clearInterval(interval);
      // Clear pending features when effect unmounts or dependencies change
      pendingFeaturesRef.current.clear();
    };
  }, [
    autoMode.isRunning,
    currentProject,
    // runningAutoTasks is accessed via runningAutoTasksRef to prevent effect re-runs
    // that would clear pendingFeaturesRef and cause concurrency issues
    maxConcurrency,
    // hookFeatures is accessed via hookFeaturesRef to prevent effect re-runs
    currentWorktreeBranch,
    currentWorktreePath,
    getPrimaryWorktreeBranch,
    isPrimaryWorktreeBranch,
    enableDependencyBlocking,
    skipVerificationInAutoMode,
    persistFeatureUpdate,
  ]);

  // Use keyboard shortcuts hook (after actions hook)
  useBoardKeyboardShortcuts({
    features: hookFeatures,
    runningAutoTasks,
    onAddFeature: () => setShowAddDialog(true),
    onStartNextFeatures: handleStartNextFeatures,
    onViewOutput: handleViewOutput,
    onToggleAutoMode: () => setShowAutoModeModal(true),
    // Tab navigation shortcuts - only active in Kanban view mode
    onNextTab: !isListView ? nextStatusTab : undefined,
    onPreviousTab: !isListView ? previousStatusTab : undefined,
    onGoToTab: !isListView ? handleStatusTabChange : undefined,
    tabs: statusTabs,
    // Board panel toggle shortcuts
    onToggleFileExplorer: () => setShowFileExplorer((prev) => !prev),
    onToggleKanbanPanel: () => setKanbanPanelCollapsed(!isKanbanPanelCollapsed),
    onToggleAgentChat: () => setAgentChatPanelCollapsed(!isAgentChatPanelCollapsed),
    onToggleDeployPanel: () => setDeployPanelCollapsed(!isDeployPanelCollapsed),
  });

  // Use drag and drop hook
  const { activeFeature, handleDragStart, handleDragEnd } = useBoardDragDrop({
    features: hookFeatures,
    currentProject,
    runningAutoTasks,
    persistFeatureUpdate,
    handleStartImplementation,
  });

  // Get pipeline config for column features hook (uses board-scoped project)
  const pipelineConfig = boardSelectedProject?.path
    ? pipelineConfigByProject[boardSelectedProject.path] || null
    : null;

  // Use column features hook with single-column mode support
  const { getColumnFeatures, columnFeaturesMap, columnCounts } = useBoardColumnFeatures({
    features: projectFilteredFeatures,
    runningAutoTasks,
    searchQuery,
    showFavoritesOnly,
    currentWorktreePath,
    currentWorktreeBranch,
    projectPath: boardSelectedProject?.path || null,
    activeStatusTab,
    activeStatusTabs,
    singleColumnMode: !isAllStatusMode,
    showAllProjects: showAllProjectsInBoard,
  });

  // Use background hook
  const { backgroundSettings, backgroundImageStyle } = useBoardBackground({
    currentProject: boardSelectedProject,
  });

  // Phase 2: T006 - Sync board controls to store for TopNavigationBar
  // This effect populates the board controls store so that TopNavigationBar
  // can display board-specific controls without prop drilling
  const setBoardControls = useBoardControlsStore((state) => state.setControls);
  const clearBoardControls = useBoardControlsStore((state) => state.clearControls);

  useEffect(() => {
    if (!isMounted) return;

    // Set all board controls in the store
    setBoardControls({
      // Search
      searchQuery,
      onSearchChange: setSearchQuery,
      isCreatingSpec,
      creatingSpecProjectPath,

      // Favorites
      showFavoritesOnly,
      onShowFavoritesOnlyChange: setShowFavoritesOnly,

      // View toggle
      viewMode,
      onViewModeChange: setViewMode,

      // Board background
      onShowBoardBackground: () => setShowBoardBackgroundModal(true),

      // Auto mode
      isAutoModeRunning: autoMode.isRunning,
      runningAgentsCount: runningAutoTasks.length,
      maxConcurrency: autoMode.effectiveMaxAgents,
      onConcurrencyChange: setMaxConcurrency,
      onAutoModeToggle: (enabled: boolean) => {
        if (enabled) {
          autoMode.start();
        } else {
          autoMode.stop();
        }
      },
      isAutoModeModalOpen: showAutoModeModal,
      onAutoModeModalOpenChange: setShowAutoModeModal,

      // Plan
      onOpenPlanDialog: () => setShowPlanDialog(true),
      hasPendingPlan: !!pendingBacklogPlan,
      onOpenPendingPlan: pendingBacklogPlan ? () => setShowPlanDialog(true) : null,

      // Project filter
      projects,
      selectedProjectIds,
      onProjectSelectionChange: handleProjectSelectionChange,

      // Status filter
      activeStatusTab,
      activeStatusTabs,
      onStatusTabChange: handleStatusTabChange,
      onStatusTabToggle: toggleStatusTab,
      onStatusTabsCommit: handleStatusTabsCommit,
      onCreateStatus: handleCreateStatus,
      onDeleteStatus: handleDeleteStatus,
      statusTabs,
      statusTabCounts: columnCounts,
      isListView,

      // Deploy panel
      isDeployPanelCollapsed,
      onToggleDeployPanel: () => setDeployPanelCollapsed(!isDeployPanelCollapsed),
      onOpenDeployPanel: () => {
        if (isDeployPanelCollapsed) {
          setDeployPanelCollapsed(false);
        }
      },

      // Refresh
      onRefresh: refreshFeatures,
      isRefreshing,

      // Mounted
      isMounted: true,
    });

    // Clear controls on unmount
    return () => {
      clearBoardControls();
    };
  }, [
    isMounted,
    searchQuery,
    isCreatingSpec,
    creatingSpecProjectPath,
    showFavoritesOnly,
    viewMode,
    autoMode.isRunning,
    runningAutoTasks.length,
    maxConcurrency,
    showAutoModeModal,
    pendingBacklogPlan,
    setBoardControls,
    clearBoardControls,
    setSearchQuery,
    setShowFavoritesOnly,
    setViewMode,
    setShowBoardBackgroundModal,
    setMaxConcurrency,
    autoMode,
    setShowAutoModeModal,
    setShowPlanDialog,
    // Project filter deps
    projects,
    selectedProjectIds,
    handleProjectSelectionChange,
    // Status filter deps
    activeStatusTab,
    activeStatusTabs,
    handleStatusTabChange,
    handleStatusTabsCommit,
    handleCreateStatus,
    handleDeleteStatus,
    toggleStatusTab,
    statusTabs,
    columnCounts,
    isListView,
    // Deploy panel deps
    isDeployPanelCollapsed,
    setDeployPanelCollapsed,
    // Refresh deps
    refreshFeatures,
    isRefreshing,
  ]);

  // Find feature for pending plan approval
  const pendingApprovalFeature = useMemo(() => {
    if (!pendingPlanApproval) return null;
    return hookFeatures.find((f) => f.id === pendingPlanApproval.featureId) || null;
  }, [pendingPlanApproval, hookFeatures]);

  // Build available projects map for completed features filtering (project path -> project name)
  const availableProjectsMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) {
      map.set(project.path, project.name);
    }
    return map;
  }, [projects]);

  // Handle plan approval
  const handlePlanApprove = useCallback(
    async (editedPlan?: string) => {
      if (!pendingPlanApproval || !currentProject) return;

      const featureId = pendingPlanApproval.featureId;
      setIsPlanApprovalLoading(true);
      try {
        const api = getElectronAPI();
        if (!api?.autoMode?.approvePlan) {
          throw new Error('Plan approval API not available');
        }

        const result = await api.autoMode.approvePlan(
          pendingPlanApproval.projectPath,
          pendingPlanApproval.featureId,
          true,
          editedPlan
        );

        if (result.success) {
          // Immediately update local feature state to hide "Approve Plan" button
          // Get current feature to preserve version
          const currentFeature = hookFeatures.find((f) => f.id === featureId);
          updateFeature(featureId, {
            planSpec: {
              status: 'approved',
              content: editedPlan || pendingPlanApproval.planContent,
              version: currentFeature?.planSpec?.version || 1,
              approvedAt: new Date().toISOString(),
              reviewedByUser: true,
            },
          });
          // Reload features from server to ensure sync
          loadFeatures();
        } else {
          logger.error('Failed to approve plan:', result.error);
        }
      } catch (error) {
        logger.error('Error approving plan:', error);
      } finally {
        setIsPlanApprovalLoading(false);
        setPendingPlanApproval(null);
      }
    },
    [
      pendingPlanApproval,
      currentProject,
      setPendingPlanApproval,
      updateFeature,
      loadFeatures,
      hookFeatures,
    ]
  );

  // Handle plan rejection
  const handlePlanReject = useCallback(
    async (feedback?: string) => {
      if (!pendingPlanApproval || !currentProject) return;

      const featureId = pendingPlanApproval.featureId;
      setIsPlanApprovalLoading(true);
      try {
        const api = getElectronAPI();
        if (!api?.autoMode?.approvePlan) {
          throw new Error('Plan approval API not available');
        }

        const result = await api.autoMode.approvePlan(
          pendingPlanApproval.projectPath,
          pendingPlanApproval.featureId,
          false,
          undefined,
          feedback
        );

        if (result.success) {
          // Immediately update local feature state
          // Get current feature to preserve version
          const currentFeature = hookFeatures.find((f) => f.id === featureId);
          updateFeature(featureId, {
            status: 'backlog',
            planSpec: {
              status: 'rejected',
              content: pendingPlanApproval.planContent,
              version: currentFeature?.planSpec?.version || 1,
              reviewedByUser: true,
            },
          });
          // Reload features from server to ensure sync
          loadFeatures();
        } else {
          logger.error('Failed to reject plan:', result.error);
        }
      } catch (error) {
        logger.error('Error rejecting plan:', error);
      } finally {
        setIsPlanApprovalLoading(false);
        setPendingPlanApproval(null);
      }
    },
    [
      pendingPlanApproval,
      currentProject,
      setPendingPlanApproval,
      updateFeature,
      loadFeatures,
      hookFeatures,
    ]
  );

  // Handle opening approval dialog from feature card button
  const handleOpenApprovalDialog = useCallback(
    (feature: Feature) => {
      if (!feature.planSpec?.content || !currentProject) return;

      // Determine the planning mode for approval (skip should never have a plan requiring approval)
      const mode = feature.planningMode;
      const approvalMode: 'lite' | 'spec' | 'full' =
        mode === 'lite' || mode === 'spec' || mode === 'full' ? mode : 'spec';

      // Re-open the approval dialog with the feature's plan data
      setPendingPlanApproval({
        featureId: feature.id,
        projectPath: currentProject.path,
        planContent: feature.planSpec.content,
        planningMode: approvalMode,
      });
    },
    [currentProject, setPendingPlanApproval]
  );

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="board-view-no-project">
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  // NOTE: We intentionally do NOT have an early return for isLoading here.
  // The isLoading state is now handled within the KanbanBoard/ListView rendering
  // to prevent unmounting the AgentChatPanel and RunningAgentsPanel during
  // project switches. This ensures agent chat sessions remain stable.

  return (
    <div
      className="flex-1 flex flex-col min-h-0 overflow-hidden content-bg relative"
      data-testid="board-view"
    >
      {/* Main Content Area - Single scrollable box filling available space */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Main Content Row - Kanban/List + Running Agents + Deploy Panel */}
        {/* Desktop: Resizable panels with drag handle */}
        {/* Tablet/Mobile: Panel toggle buttons - show one panel at a time */}
        {isTabletOrSmaller ? (
          /* Mobile/Tablet Layout - Single panel with toggle buttons */
          /* Single scrollable box filling available space */
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
            {/* Floating panel toggle buttons - positioned at top right */}
            <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-lg border border-border bg-background/95 backdrop-blur-sm shadow-md p-1">
              {/* Board toggle */}
              <Button
                variant={activeMobilePanel === 'kanban' ? 'default' : 'ghost'}
                size="sm"
                className={cn(
                  'gap-1.5 h-8 px-2',
                  activeMobilePanel === 'kanban' && 'bg-brand-500 hover:bg-brand-600'
                )}
                onClick={() => setActiveMobilePanel('kanban')}
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">Board</span>
              </Button>

              {/* Agents toggle */}
              <Button
                variant={activeMobilePanel === 'agents' ? 'default' : 'ghost'}
                size="sm"
                className={cn(
                  'gap-1.5 h-8 px-2',
                  activeMobilePanel === 'agents' && 'bg-brand-500 hover:bg-brand-600',
                  activeMobilePanel !== 'agents' &&
                    runningAutoTasks.length > 0 &&
                    'border-brand-500/50'
                )}
                onClick={() => setActiveMobilePanel('agents')}
              >
                <Activity className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">Agents</span>
                {runningAutoTasks.length > 0 && activeMobilePanel !== 'agents' && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-medium text-white">
                    {runningAutoTasks.length}
                  </span>
                )}
              </Button>

              {/* Deploy toggle */}
              <Button
                variant={activeMobilePanel === 'deploy' ? 'default' : 'ghost'}
                size="sm"
                className={cn(
                  'gap-1.5 h-8 px-2',
                  activeMobilePanel === 'deploy' && 'bg-brand-500 hover:bg-brand-600'
                )}
                onClick={() => setActiveMobilePanel('deploy')}
              >
                <Rocket className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">Deploy</span>
              </Button>
            </div>

            {/* Panel content - show one panel at a time */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {/* Kanban/List Panel */}
              {activeMobilePanel === 'kanban' && (
                <div className="h-full min-h-0 relative">
                  {isLoading ? (
                    /* Progressive skeleton — replaces the old full-screen loading overlay */
                    <BoardSkeleton
                      pipelineConfig={pipelineConfig}
                      showBorder={backgroundSettings.columnBorderEnabled}
                      backgroundImageStyle={backgroundImageStyle}
                      singleColumnMode={!isAllStatusMode}
                      activeStatusTab={activeStatusTab}
                      activeStatusTabs={activeStatusTabs}
                    />
                  ) : isListView ? (
                    <ListView
                      columnFeaturesMap={columnFeaturesMap}
                      allFeatures={hookFeatures}
                      sortConfig={sortConfig}
                      onSortChange={setSortColumn}
                      actionHandlers={{
                        onEdit: (feature) => setEditingFeature(feature),
                        onDelete: (featureId) => handleDeleteFeature(featureId),
                        onViewOutput: handleViewOutput,
                        onVerify: handleVerifyFeature,
                        onResume: handleResumeFeature,
                        onForceStop: handleForceStopFeature,
                        onManualVerify: handleManualVerify,
                        onFollowUp: handleOpenFollowUp,
                        onImplement: handleStartImplementation,
                        onViewPlan: (feature) => setViewPlanFeature(feature),
                        onApprovePlan: handleOpenApprovalDialog,
                        onSpawnTask: (feature) => {
                          setSpawnParentFeature(feature);
                          setShowAddDialog(true);
                        },
                        onToggleFavorite: (feature) => {
                          const updates = { isFavorite: !feature.isFavorite };
                          updateFeature(feature.id, updates);
                          persistFeatureUpdate(feature.id, updates);
                        },
                      }}
                      runningAutoTasks={runningAutoTasks}
                      pipelineConfig={pipelineConfig}
                      onAddFeature={() => setShowAddDialog(true)}
                      isSelectionMode={isSelectionMode}
                      selectedFeatureIds={selectedFeatureIds}
                      onToggleFeatureSelection={toggleFeatureSelection}
                      onRowClick={(feature) => {
                        if (feature.status === 'backlog') {
                          setEditingFeature(feature);
                        } else {
                          handleViewOutput(feature);
                        }
                      }}
                      className="transition-opacity duration-200"
                      singleColumnMode={!isAllStatusMode}
                      activeStatusTab={activeStatusTab}
                      activeStatusTabs={activeStatusTabs}
                      showAllProjects={showAllProjectsInBoard}
                      currentGitHubUser={currentGitHubUser}
                    />
                  ) : (
                    <KanbanBoard
                      sensors={sensors}
                      collisionDetectionStrategy={collisionDetectionStrategy}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      activeFeature={activeFeature}
                      getColumnFeatures={getColumnFeatures}
                      backgroundImageStyle={backgroundImageStyle}
                      backgroundSettings={backgroundSettings}
                      onEdit={(feature) => setEditingFeature(feature)}
                      onDelete={(featureId) => handleDeleteFeature(featureId)}
                      onViewOutput={handleViewOutput}
                      onVerify={handleVerifyFeature}
                      onResume={handleResumeFeature}
                      onForceStop={handleForceStopFeature}
                      onManualVerify={handleManualVerify}
                      onMoveBackToInProgress={handleMoveBackToInProgress}
                      onMoveBackToBacklog={handleMoveBackToBacklog}
                      onFollowUp={handleOpenFollowUp}
                      onComplete={handleCompleteFeature}
                      onImplement={handleStartImplementation}
                      onViewPlan={(feature) => setViewPlanFeature(feature)}
                      onApprovePlan={handleOpenApprovalDialog}
                      onSpawnTask={(feature) => {
                        setSpawnParentFeature(feature);
                        setShowAddDialog(true);
                      }}
                      onToggleFavorite={(feature) => {
                        const updates = { isFavorite: !feature.isFavorite };
                        updateFeature(feature.id, updates);
                        persistFeatureUpdate(feature.id, updates);
                      }}
                      featuresWithContext={featuresWithContext}
                      runningAutoTasks={runningAutoTasks}
                      onCompleteAllWaiting={() => setShowCompleteAllWaitingDialog(true)}
                      onAddFeature={() => setShowAddDialog(true)}
                      pipelineConfig={pipelineConfig}
                      onOpenPipelineSettings={() => setShowPipelineSettings(true)}
                      isSelectionMode={isSelectionMode}
                      selectionTarget={selectionTarget}
                      selectedFeatureIds={selectedFeatureIds}
                      onToggleFeatureSelection={toggleFeatureSelection}
                      onToggleSelectionMode={toggleSelectionMode}
                      viewMode={viewMode}
                      isDragging={activeFeature !== null}
                      onAiSuggest={() => setShowPlanDialog(true)}
                      className="transition-opacity duration-200"
                      singleColumnMode={!isAllStatusMode}
                      activeStatusTab={activeStatusTab}
                      activeStatusTabs={activeStatusTabs}
                      showAllProjects={showAllProjectsInBoard}
                      currentGitHubUser={currentGitHubUser}
                    />
                  )}
                </div>
              )}

              {/* Running Agents Panel */}
              {activeMobilePanel === 'agents' && (
                <div className="h-full overflow-hidden p-2">
                  <RunningAgentsPanel
                    compact
                    maxHeight="calc(100vh - 200px)"
                    defaultCollapsed={false}
                    className="h-full"
                  />
                </div>
              )}

              {/* Deploy Panel */}
              {activeMobilePanel === 'deploy' && (
                <div className="h-full overflow-hidden p-2">
                  <DeployPanel
                    project={agentPanelProject}
                    isCollapsed={false}
                    onCollapseChange={handleDeployPanelCollapseChange}
                    onProjectChange={handleAgentPanelProjectChange}
                    showProjectSelector
                    compact
                    className="h-full"
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Desktop Layout - File Explorer | Kanban | RunningAgents */
          /* VS Code-style: Double-click resize handles to snap panels between sizes (25%, 50%, 75%) */
          /* Single scrollable box filling available space */
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* File Explorer Panel - collapsible sidebar */}
            {showFileExplorer && (
              <div className="w-64 border-r border-border bg-background shrink-0 flex flex-col">
                <div className="flex items-center justify-between h-10 px-3 border-b border-border bg-muted/30 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded bg-brand-500/10">
                      <FolderOpen className="h-3.5 w-3.5 text-brand-500" />
                    </div>
                    <span className="text-sm font-medium">Files</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setShowFileExplorer(false)}
                    title="Close File Explorer"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <FileExplorer
                  projectPath={boardSelectedProject?.path || null}
                  onFileSelect={handleFileSelect}
                  className="flex-1"
                />
              </div>
            )}

            {/* File Explorer Toggle Button - shown when collapsed */}
            {!showFileExplorer && (
              <div className="flex items-center justify-center w-10 border-r border-border bg-muted/30 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-full w-full rounded-none hover:bg-brand-500/10"
                  onClick={() => setShowFileExplorer(true)}
                  title="Open File Explorer"
                >
                  <div className="flex flex-col items-center gap-2">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    <div className="p-1 rounded bg-brand-500/10">
                      <FolderOpen className="h-3.5 w-3.5 text-brand-500" />
                    </div>
                    <span
                      className="text-xs font-medium text-muted-foreground"
                      style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                    >
                      Files
                    </span>
                  </div>
                </Button>
              </div>
            )}

            {/* Collapsed Kanban panel - show expand button */}
            {isKanbanPanelCollapsed && (
              <div className="flex items-center justify-center w-10 border-r border-border bg-muted/30 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-full w-full rounded-none hover:bg-brand-500/10"
                  onClick={() => setKanbanPanelCollapsed(false)}
                  title="Expand Kanban Board"
                >
                  <div className="flex flex-col items-center gap-2">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    <div className="p-1 rounded bg-brand-500/10">
                      <LayoutGrid className="h-3.5 w-3.5 text-brand-500" />
                    </div>
                    <span
                      className="text-xs font-medium text-muted-foreground"
                      style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                    >
                      Board
                    </span>
                  </div>
                </Button>
              </div>
            )}

            {/* Main Panel Group - only render visible panels */}
            <PanelGroup
              direction="horizontal"
              className="flex-1"
              onLayout={(sizes) => {
                // Store panel sizes in ref during drag - don't update Zustand yet
                // This prevents excessive state updates/re-renders during resize
                // The actual Zustand update happens in PanelResizeHandle's onDragging callback
                let sizeIndex = 0;
                const newKanbanSize = !isKanbanPanelCollapsed
                  ? sizes[sizeIndex++]
                  : kanbanPanelSize;
                const newAgentChatSize = !isAgentChatPanelCollapsed
                  ? sizes[sizeIndex++]
                  : agentChatPanelSize;
                const newDeploySize = !isDeployPanelCollapsed ? sizes[sizeIndex] : deployPanelSize;
                pendingPanelSizesRef.current = {
                  kanban: newKanbanSize,
                  agentChat: newAgentChatSize,
                  deploy: newDeploySize,
                };
              }}
            >
              {/* Kanban/List Panel */}
              {!isKanbanPanelCollapsed && (
                <Panel defaultSize={kanbanPanelSize} minSize={25} className="overflow-hidden">
                  <div className="h-full flex flex-col min-h-0">
                    {/* Kanban/List content - full-bleed container filling available space */}
                    <div className="flex-1 min-h-0 relative">
                      {isLoading ? (
                        /* Progressive skeleton — replaces the old full-screen loading overlay */
                        <BoardSkeleton
                          pipelineConfig={pipelineConfig}
                          showBorder={backgroundSettings.columnBorderEnabled}
                          backgroundImageStyle={backgroundImageStyle}
                          singleColumnMode={!isAllStatusMode}
                          activeStatusTab={activeStatusTab}
                          activeStatusTabs={activeStatusTabs}
                        />
                      ) : isListView ? (
                        <ListView
                          columnFeaturesMap={columnFeaturesMap}
                          allFeatures={hookFeatures}
                          sortConfig={sortConfig}
                          onSortChange={setSortColumn}
                          actionHandlers={{
                            onEdit: (feature) => setEditingFeature(feature),
                            onDelete: (featureId) => handleDeleteFeature(featureId),
                            onViewOutput: handleViewOutput,
                            onVerify: handleVerifyFeature,
                            onResume: handleResumeFeature,
                            onForceStop: handleForceStopFeature,
                            onManualVerify: handleManualVerify,
                            onFollowUp: handleOpenFollowUp,
                            onImplement: handleStartImplementation,
                            onViewPlan: (feature) => setViewPlanFeature(feature),
                            onApprovePlan: handleOpenApprovalDialog,
                            onSpawnTask: (feature) => {
                              setSpawnParentFeature(feature);
                              setShowAddDialog(true);
                            },
                            onToggleFavorite: (feature) => {
                              const updates = { isFavorite: !feature.isFavorite };
                              updateFeature(feature.id, updates);
                              persistFeatureUpdate(feature.id, updates);
                            },
                          }}
                          runningAutoTasks={runningAutoTasks}
                          pipelineConfig={pipelineConfig}
                          onAddFeature={() => setShowAddDialog(true)}
                          isSelectionMode={isSelectionMode}
                          selectedFeatureIds={selectedFeatureIds}
                          onToggleFeatureSelection={toggleFeatureSelection}
                          onRowClick={(feature) => {
                            if (feature.status === 'backlog') {
                              setEditingFeature(feature);
                            } else {
                              handleViewOutput(feature);
                            }
                          }}
                          className="transition-opacity duration-200"
                          singleColumnMode={!isAllStatusMode}
                          activeStatusTab={activeStatusTab}
                          activeStatusTabs={activeStatusTabs}
                          showAllProjects={showAllProjectsInBoard}
                        />
                      ) : (
                        <KanbanBoard
                          sensors={sensors}
                          collisionDetectionStrategy={collisionDetectionStrategy}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          activeFeature={activeFeature}
                          getColumnFeatures={getColumnFeatures}
                          backgroundImageStyle={backgroundImageStyle}
                          backgroundSettings={backgroundSettings}
                          onEdit={(feature) => setEditingFeature(feature)}
                          onDelete={(featureId) => handleDeleteFeature(featureId)}
                          onViewOutput={handleViewOutput}
                          onVerify={handleVerifyFeature}
                          onResume={handleResumeFeature}
                          onForceStop={handleForceStopFeature}
                          onManualVerify={handleManualVerify}
                          onMoveBackToInProgress={handleMoveBackToInProgress}
                          onMoveBackToBacklog={handleMoveBackToBacklog}
                          onFollowUp={handleOpenFollowUp}
                          onComplete={handleCompleteFeature}
                          onImplement={handleStartImplementation}
                          onViewPlan={(feature) => setViewPlanFeature(feature)}
                          onApprovePlan={handleOpenApprovalDialog}
                          onSpawnTask={(feature) => {
                            setSpawnParentFeature(feature);
                            setShowAddDialog(true);
                          }}
                          onToggleFavorite={(feature) => {
                            const updates = { isFavorite: !feature.isFavorite };
                            updateFeature(feature.id, updates);
                            persistFeatureUpdate(feature.id, updates);
                          }}
                          featuresWithContext={featuresWithContext}
                          runningAutoTasks={runningAutoTasks}
                          onCompleteAllWaiting={() => setShowCompleteAllWaitingDialog(true)}
                          onAddFeature={() => setShowAddDialog(true)}
                          pipelineConfig={pipelineConfig}
                          onOpenPipelineSettings={() => setShowPipelineSettings(true)}
                          isSelectionMode={isSelectionMode}
                          selectionTarget={selectionTarget}
                          selectedFeatureIds={selectedFeatureIds}
                          onToggleFeatureSelection={toggleFeatureSelection}
                          onToggleSelectionMode={toggleSelectionMode}
                          viewMode={viewMode}
                          isDragging={activeFeature !== null}
                          onAiSuggest={() => setShowPlanDialog(true)}
                          className="transition-opacity duration-200"
                          singleColumnMode={!isAllStatusMode}
                          activeStatusTab={activeStatusTab}
                          activeStatusTabs={activeStatusTabs}
                          showAllProjects={showAllProjectsInBoard}
                        />
                      )}
                    </div>
                  </div>
                </Panel>
              )}

              {/* Resize Handle between Kanban and Agent Chat - with VS Code-style double-click snapping */}
              {!isKanbanPanelCollapsed && !isAgentChatPanelCollapsed && (
                <PanelResizeHandle
                  className="w-2 group relative flex items-center justify-center hover:bg-brand-500/10 transition-colors data-[resize-handle-active]:bg-brand-500/20"
                  title="Drag to resize • Double-click to snap (25%, 50%, 75%)"
                  onDragging={(isDragging) => {
                    // Commit panel sizes to Zustand only when dragging ends
                    // This prevents lag from excessive state updates during resize
                    if (!isDragging && pendingPanelSizesRef.current) {
                      setKanbanPanelSize(pendingPanelSizesRef.current.kanban);
                      setAgentChatPanelSize(pendingPanelSizesRef.current.agentChat);
                      setDeployPanelSize(pendingPanelSizesRef.current.deploy);
                      pendingPanelSizesRef.current = null;
                    }
                  }}
                  onDoubleClick={() => {
                    // VS Code-style snap: cycle between 25%, 50%, 75%
                    const snapPoints = [25, 50, 75];
                    const currentIndex = snapPoints.findIndex(
                      (p) => Math.abs(kanbanPanelSize - p) < 10
                    );
                    const nextIndex = (currentIndex + 1) % snapPoints.length;
                    setKanbanPanelSize(snapPoints[nextIndex]);
                  }}
                >
                  <div className="absolute inset-y-0 flex items-center">
                    <div className="h-8 w-1 rounded-full bg-border group-hover:bg-brand-500/50 group-data-[resize-handle-active]:bg-brand-500 transition-colors" />
                  </div>
                </PanelResizeHandle>
              )}

              {/* Agent Chat Panel */}
              {!isAgentChatPanelCollapsed && (
                <Panel
                  defaultSize={agentChatPanelSize}
                  minSize={25}
                  maxSize={60}
                  className="overflow-hidden"
                >
                  <AgentChatPanel
                    project={agentPanelProject}
                    isCollapsed={false}
                    onCollapseChange={handleAgentChatPanelCollapseChange}
                    onProjectChange={handleAgentPanelProjectChange}
                    showProjectSelector
                    compact
                    className="h-full"
                  />
                </Panel>
              )}

              {/* Resize Handle between Agent Chat and Deploy - with VS Code-style double-click snapping */}
              {!isAgentChatPanelCollapsed && !isDeployPanelCollapsed && (
                <PanelResizeHandle
                  className="w-2 group relative flex items-center justify-center hover:bg-brand-500/10 transition-colors data-[resize-handle-active]:bg-brand-500/20"
                  title="Drag to resize • Double-click to snap (25%, 50%, 75%)"
                  onDragging={(isDragging) => {
                    // Commit panel sizes to Zustand only when dragging ends
                    if (!isDragging && pendingPanelSizesRef.current) {
                      setKanbanPanelSize(pendingPanelSizesRef.current.kanban);
                      setAgentChatPanelSize(pendingPanelSizesRef.current.agentChat);
                      setDeployPanelSize(pendingPanelSizesRef.current.deploy);
                      pendingPanelSizesRef.current = null;
                    }
                  }}
                  onDoubleClick={() => {
                    // VS Code-style snap: cycle between 25%, 50%, 75% for deploy panel
                    const snapPoints = [25, 50, 75];
                    const currentIndex = snapPoints.findIndex(
                      (p) => Math.abs(deployPanelSize - p) < 10
                    );
                    const nextIndex = (currentIndex + 1) % snapPoints.length;
                    setDeployPanelSize(snapPoints[nextIndex]);
                  }}
                >
                  <div className="absolute inset-y-0 flex items-center">
                    <div className="h-8 w-1 rounded-full bg-border group-hover:bg-brand-500/50 group-data-[resize-handle-active]:bg-brand-500 transition-colors" />
                  </div>
                </PanelResizeHandle>
              )}

              {/* Deploy Panel */}
              {!isDeployPanelCollapsed && (
                <Panel
                  defaultSize={deployPanelSize}
                  minSize={15}
                  maxSize={40}
                  className="overflow-hidden"
                >
                  <DeployPanel
                    project={agentPanelProject}
                    isCollapsed={false}
                    onCollapseChange={handleDeployPanelCollapseChange}
                    onProjectChange={handleAgentPanelProjectChange}
                    showProjectSelector
                    compact
                    className="h-full"
                  />
                </Panel>
              )}
            </PanelGroup>

            {/* Collapsed agent chat panel - show expand button (outside PanelGroup) */}
            {isAgentChatPanelCollapsed && (
              <div className="flex items-center justify-center w-10 border-l border-border bg-muted/30 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-full w-full rounded-none hover:bg-brand-500/10"
                  onClick={() => setAgentChatPanelCollapsed(false)}
                  title="Expand Agent Chat Panel"
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="p-1 rounded bg-brand-500/10">
                      <Bot className="h-3.5 w-3.5 text-brand-500" />
                    </div>
                    <span
                      className="text-xs font-medium text-muted-foreground"
                      style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                    >
                      Chat
                    </span>
                  </div>
                </Button>
              </div>
            )}

            {/* Collapsed deploy panel - show expand button (outside PanelGroup) */}
            {isDeployPanelCollapsed && (
              <div className="flex items-center justify-center w-10 border-l border-border bg-muted/30 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-full w-full rounded-none hover:bg-brand-500/10"
                  onClick={() => setDeployPanelCollapsed(false)}
                  title="Expand Deploy Panel"
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="p-1 rounded bg-brand-500/10">
                      <Rocket className="h-3.5 w-3.5 text-brand-500" />
                    </div>
                    <span
                      className="text-xs font-medium text-muted-foreground"
                      style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                    >
                      Deploy
                    </span>
                  </div>
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selection Action Bar */}
      {isSelectionMode && (
        <SelectionActionBar
          selectedCount={selectedCount}
          totalCount={
            selectionTarget === 'waiting_approval'
              ? allSelectableWaitingApprovalFeatureIds.length
              : allSelectableFeatureIds.length
          }
          onEdit={selectionTarget === 'backlog' ? () => setShowMassEditDialog(true) : undefined}
          onDelete={selectionTarget === 'backlog' ? handleBulkDelete : undefined}
          onVerify={selectionTarget === 'waiting_approval' ? handleBulkComplete : undefined}
          onClear={clearSelection}
          onSelectAll={() =>
            selectAll(
              selectionTarget === 'waiting_approval'
                ? allSelectableWaitingApprovalFeatureIds
                : allSelectableFeatureIds
            )
          }
          mode={selectionTarget === 'waiting_approval' ? 'waiting_approval' : 'backlog'}
        />
      )}

      {/* Mass Edit Dialog */}
      <MassEditDialog
        open={showMassEditDialog}
        onOpenChange={(open) => !open && setShowMassEditDialog(false)}
        componentProps={{
          onClose: () => setShowMassEditDialog(false),
          selectedFeatures,
          onApply: handleBulkUpdate,
          branchSuggestions,
          branchCardCounts,
          currentBranch: currentWorktreeBranch || undefined,
        }}
      />

      {/* Board Background Modal (lazy-loaded) */}
      <BoardBackgroundModal
        open={showBoardBackgroundModal}
        onOpenChange={setShowBoardBackgroundModal}
      />

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

      {/* Add Feature Dialog */}
      <AddFeatureDialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) {
            setSpawnParentFeature(null);
          }
        }}
        componentProps={{
          onAdd: handleAddFeature,
          onAddAndStart: handleAddAndStartFeature,
          categorySuggestions,
          branchSuggestions,
          branchCardCounts,
          defaultSkipTests,
          defaultBranch: selectedWorktreeBranch,
          currentBranch: currentWorktreeBranch || undefined,
          isMaximized,
          parentFeature: spawnParentFeature,
          allFeatures: hookFeatures,
          // When setting is enabled and a non-main worktree is selected, pass its branch to default to 'custom' work mode
          selectedNonMainWorktreeBranch:
            addFeatureUseSelectedWorktreeBranch && currentWorktreePath !== null
              ? currentWorktreeBranch || undefined
              : undefined,
          // When the worktree setting is disabled, force 'current' branch mode
          forceCurrentBranchMode: !addFeatureUseSelectedWorktreeBranch,
          // Project selection support for multi-project mode
          projects,
          selectedProject: boardSelectedProject,
          showAllProjectsMode: showAllProjectsInBoard,
        }}
      />

      {/* Edit Feature Dialog */}
      <EditFeatureDialog
        open={!!editingFeature}
        onOpenChange={(open) => !open && setEditingFeature(null)}
        componentProps={{
          feature: editingFeature,
          onClose: () => setEditingFeature(null),
          onUpdate: handleUpdateFeature,
          categorySuggestions,
          branchSuggestions,
          branchCardCounts,
          currentBranch: currentWorktreeBranch || undefined,
          isMaximized,
          allFeatures: hookFeatures,
        }}
      />

      {/* Agent Output Modal */}
      <AgentOutputModal
        open={showOutputModal}
        onOpenChange={(open) => !open && setShowOutputModal(false)}
        componentProps={{
          onClose: () => setShowOutputModal(false),
          featureDescription: outputFeature?.description || '',
          featureId: outputFeature?.id || '',
          featureStatus: outputFeature?.status,
          onNumberKeyPress: handleOutputModalNumberKeyPress,
          projectPath: currentProject?.path,
          feature: outputFeature || undefined,
        }}
      />

      {/* Complete All Waiting Dialog */}
      <CompleteAllWaitingDialog
        open={showCompleteAllWaitingDialog}
        onOpenChange={setShowCompleteAllWaitingDialog}
        componentProps={{
          waitingCount: getColumnFeatures('waiting_approval').length,
          onConfirm: async () => {
            await handleCompleteAllWaiting();
            setShowCompleteAllWaitingDialog(false);
          },
        }}
      />

      {/* Unsatisfied Dependencies Confirmation Dialog */}
      <UnsatisfiedDependenciesDialog
        open={unsatisfiedDepsDialog.open}
        onOpenChange={handleUnsatisfiedDepsDialogOpenChange}
        componentProps={{
          feature: unsatisfiedDepsDialog.feature,
          blockingDependencies: unsatisfiedDepsDialog.blockingDependencies,
          onConfirm: handleConfirmStartWithUnsatisfiedDeps,
          onCancel: handleCancelStartWithUnsatisfiedDeps,
        }}
      />

      {/* Pipeline Settings Dialog */}
      <PipelineSettingsDialog
        open={showPipelineSettings}
        onOpenChange={(open) => !open && setShowPipelineSettings(false)}
        componentProps={{
          projectPath: currentProject.path,
          pipelineConfig,
          onSave: async (config) => {
            const api = getHttpApiClient();
            const result = await api.pipeline.saveConfig(currentProject.path, config);
            if (!result.success) {
              throw new Error(result.error || 'Failed to save pipeline config');
            }
            setPipelineConfig(currentProject.path, config);
          },
        }}
      />

      {/* Follow-Up Prompt Dialog */}
      <FollowUpDialog
        open={showFollowUpDialog}
        onOpenChange={handleFollowUpDialogChange}
        componentProps={{
          feature: followUpFeature,
          prompt: followUpPrompt,
          imagePaths: followUpImagePaths,
          previewMap: followUpPreviewMap,
          onPromptChange: setFollowUpPrompt,
          onImagePathsChange: setFollowUpImagePaths,
          onPreviewMapChange: setFollowUpPreviewMap,
          onSend: handleSendFollowUp,
          isMaximized,
          promptHistory: followUpPromptHistory,
          onHistoryAdd: addToPromptHistory,
        }}
      />

      {/* Backlog Plan Dialog */}
      <BacklogPlanDialog
        open={showPlanDialog}
        onOpenChange={(open) => !open && setShowPlanDialog(false)}
        componentProps={{
          onClose: () => setShowPlanDialog(false),
          projectPath: currentProject.path,
          onPlanApplied: loadFeatures,
          pendingPlanResult: pendingBacklogPlan,
          setPendingPlanResult: setPendingBacklogPlan,
          isGeneratingPlan,
          setIsGeneratingPlan,
          currentBranch: planUseSelectedWorktreeBranch ? selectedWorktreeBranch : undefined,
        }}
      />

      {/* Plan Approval Dialog */}
      <PlanApprovalDialog
        open={pendingPlanApproval !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingPlanApproval(null);
          }
        }}
        componentProps={{
          feature: pendingApprovalFeature,
          planContent: pendingPlanApproval?.planContent || '',
          onApprove: handlePlanApprove,
          onReject: handlePlanReject,
          isLoading: isPlanApprovalLoading,
        }}
      />

      {/* View Plan Dialog (read-only) */}
      <PlanApprovalDialog
        open={!!(viewPlanFeature && viewPlanFeature.planSpec?.content)}
        onOpenChange={(open) => !open && setViewPlanFeature(null)}
        componentProps={{
          feature: viewPlanFeature,
          planContent: viewPlanFeature?.planSpec?.content || '',
          onApprove: () => setViewPlanFeature(null),
          onReject: () => setViewPlanFeature(null),
          viewOnly: true,
        }}
      />

      {/* Create Worktree Dialog */}
      <CreateWorktreeDialog
        open={showCreateWorktreeDialog}
        onOpenChange={setShowCreateWorktreeDialog}
        componentProps={{
          projectPath: currentProject.path,
          onCreated: (newWorktree) => {
            // Add the new worktree to the store immediately to avoid race condition
            // when deriving currentWorktreeBranch for filtering
            const currentWorktrees = getWorktrees(currentProject.path);
            const newWorktreeInfo = {
              path: newWorktree.path,
              branch: newWorktree.branch,
              isMain: false,
              isCurrent: false,
              hasWorktree: true,
            };
            setWorktrees(currentProject.path, [...currentWorktrees, newWorktreeInfo]);

            // Now set the current worktree with both path and branch
            setCurrentWorktree(currentProject.path, newWorktree.path, newWorktree.branch);

            // Trigger refresh to get full worktree details (hasChanges, etc.)
            setWorktreeRefreshKey((k) => k + 1);
          },
        }}
      />

      {/* Delete Worktree Dialog */}
      <DeleteWorktreeDialog
        open={showDeleteWorktreeDialog}
        onOpenChange={setShowDeleteWorktreeDialog}
        componentProps={{
          projectPath: currentProject.path,
          worktree: selectedWorktreeForAction,
          affectedFeatureCount: selectedWorktreeForAction
            ? hookFeatures.filter((f) => f.branchName === selectedWorktreeForAction.branch).length
            : 0,
          defaultDeleteBranch: getDefaultDeleteBranch(currentProject.path),
          onDeleted: (deletedWorktree, _deletedBranch) => {
            // Reset features that were assigned to the deleted worktree (by branch)
            hookFeatures.forEach((feature) => {
              // Match by branch name since worktreePath is no longer stored
              if (feature.branchName === deletedWorktree.branch) {
                // Reset the feature's branch assignment - update both local state and persist
                const updates = {
                  branchName: null as unknown as string | undefined,
                };
                updateFeature(feature.id, updates);
                persistFeatureUpdate(feature.id, updates);
              }
            });

            setWorktreeRefreshKey((k) => k + 1);
            setSelectedWorktreeForAction(null);
          },
        }}
      />

      {/* Merge Worktree Dialog */}
      <MergeWorktreeDialog
        open={showMergeWorktreeDialog}
        onOpenChange={setShowMergeWorktreeDialog}
        componentProps={{
          projectPath: currentProject.path,
          worktree: selectedWorktreeForAction,
          affectedFeatureCount: selectedWorktreeForAction
            ? hookFeatures.filter((f) => f.branchName === selectedWorktreeForAction.branch).length
            : 0,
          onMerged: (mergedWorktree) => {
            // Reset features that were assigned to the merged worktree (by branch)
            hookFeatures.forEach((feature) => {
              if (feature.branchName === mergedWorktree.branch) {
                // Reset the feature's branch assignment - update both local state and persist
                const updates = {
                  branchName: null as unknown as string | undefined,
                };
                updateFeature(feature.id, updates);
                persistFeatureUpdate(feature.id, updates);
              }
            });

            setWorktreeRefreshKey((k) => k + 1);
            setSelectedWorktreeForAction(null);
          },
        }}
      />

      {/* Commit Worktree Dialog */}
      <CommitWorktreeDialog
        open={showCommitWorktreeDialog}
        onOpenChange={setShowCommitWorktreeDialog}
        componentProps={{
          worktree: selectedWorktreeForAction,
          onCommitted: () => {
            setWorktreeRefreshKey((k) => k + 1);
            setSelectedWorktreeForAction(null);
          },
        }}
      />

      {/* Create PR Dialog */}
      <CreatePRDialog
        open={showCreatePRDialog}
        onOpenChange={setShowCreatePRDialog}
        componentProps={{
          worktree: selectedWorktreeForAction,
          projectPath: currentProject?.path || null,
          defaultBaseBranch: selectedWorktreeBranch,
          onCreated: (prUrl) => {
            // If a PR was created and we have the worktree branch, update all features on that branch with the PR URL
            if (prUrl && selectedWorktreeForAction?.branch) {
              const branchName = selectedWorktreeForAction.branch;
              const featuresToUpdate = hookFeatures.filter((f) => f.branchName === branchName);

              // Update local state synchronously
              featuresToUpdate.forEach((feature) => {
                updateFeature(feature.id, { prUrl });
              });

              // Persist changes asynchronously and in parallel
              Promise.all(
                featuresToUpdate.map((feature) => persistFeatureUpdate(feature.id, { prUrl }))
              ).catch((err) => logger.error('Error in handleMove:', err));
            }
            setWorktreeRefreshKey((k) => k + 1);
            setSelectedWorktreeForAction(null);
          },
        }}
      />

      {/* Create Branch Dialog */}
      <CreateBranchDialog
        open={showCreateBranchDialog}
        onOpenChange={setShowCreateBranchDialog}
        componentProps={{
          worktree: selectedWorktreeForAction,
          onCreated: () => {
            setWorktreeRefreshKey((k) => k + 1);
            setSelectedWorktreeForAction(null);
          },
        }}
      />

      {/* Code Editor Window - popout file editor with syntax highlighting */}
      <CodeEditorWindow
        open={showCodeEditor}
        onOpenChange={setShowCodeEditor}
        componentProps={{
          initialFilePath: codeEditorFilePath,
          projectPath: currentProject?.path || null,
        }}
      />

      {/* Init Script Indicator - floating overlay for worktree init script status */}
      {getShowInitScriptIndicator(currentProject.path) && (
        <InitScriptIndicator projectPath={currentProject.path} />
      )}
    </div>
  );
}
