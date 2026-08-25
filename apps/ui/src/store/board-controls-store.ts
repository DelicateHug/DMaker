import { create } from 'zustand';
import type {
  StatusTabId,
  StatusTab,
} from '@/components/views/board-view/hooks/use-board-status-tabs';
import {
  DEFAULT_ASSIGNEE_FILTER,
  type AssigneeOption,
} from '@/components/views/board-view/hooks/use-board-assignees';
import type { Project } from '@/lib/electron';
import type { FeatureStatusWithPipeline, ModelAlias, ThinkingLevel } from '@dmaker/types';

/**
 * Where a "new feature" gesture came from.
 *
 * The sidebar groups features project -> branch -> status, so a '+' (or a
 * right-click "Add task") anywhere in that tree knows exactly which project,
 * worktree branch and status the new feature belongs to. The Add Feature
 * dialog opens pre-filled with whatever is present here; anything omitted
 * falls back to the dialog's normal defaults.
 */
export interface AddFeatureContext {
  /** Project the feature is created in. */
  projectPath?: string;
  /**
   * Existing branch to put the feature on. When set, the feature reuses that
   * branch's worktree instead of having a fresh one minted for it.
   */
  branchName?: string;
  /** Status column the feature lands in. Defaults to 'local'. */
  status?: FeatureStatusWithPipeline;
  /**
   * Pre-filled title for the dialog. Set when the gesture already knows what
   * the task is — the sidebar's "Fix with AI" on an out-of-sync branch, say.
   */
  title?: string;
  /** Pre-filled description, for the same reason as `title`. */
  description?: string;
}

/**
 * Minimal shape the home composer and sidebar need in order to create a
 * feature. Board-view expands this into the full payload handleAddFeature
 * expects, so the concurrency/dependency/worktree logic stays in one place.
 */
export interface QuickAddFeatureInput {
  description: string;
  title?: string;
  model?: ModelAlias;
  thinkingLevel?: ThinkingLevel;
  /** Kick off implementation right away instead of leaving it in the backlog */
  startImmediately?: boolean;
}

/**
 * Board Controls Store
 *
 * This store allows board-view.tsx to share its controls state with
 * top-nav-bar.tsx without prop drilling through the component tree.
 *
 * Phase 2: T006 - Created to pass necessary props from board-view to top-nav-bar
 */

export interface BoardControlsState {
  // Search bar props
  searchQuery: string;
  onSearchChange: ((query: string) => void) | null;
  isCreatingSpec: boolean;
  creatingSpecProjectPath?: string;

  // Favorites filter props
  showFavoritesOnly: boolean;
  onShowFavoritesOnlyChange: ((show: boolean) => void) | null;

  // Board background props
  onShowBoardBackground: (() => void) | null;

  // Auto mode props
  isAutoModeRunning: boolean;
  runningAgentsCount: number;
  onAutoModeToggle: ((enabled: boolean) => void) | null;
  isAutoModeModalOpen: boolean;
  onAutoModeModalOpenChange: ((open: boolean) => void) | null;

  // Plan props
  onOpenPlanDialog: (() => void) | null;
  hasPendingPlan: boolean;
  onOpenPendingPlan: (() => void) | null;

  // Status filter props
  activeStatusTab: StatusTabId;
  activeStatusTabs: StatusTabId[];
  onStatusTabChange: ((tabId: StatusTabId) => void) | null;
  onStatusTabToggle: ((tabId: StatusTabId) => void) | null;
  onStatusTabsCommit: ((tabIds: StatusTabId[]) => void) | null;
  onCreateStatus: ((name: string, colorClass: string) => void) | null;
  /**
   * Open the edit dialog for a feature. Board-view owns that dialog's state,
   * and the task list now lives in the sidebar, so the two reach each other
   * through here like the rest of the board's controls.
   */
  onEditFeature: ((featureId: string) => void) | null;
  /**
   * Move a feature to another status. The sidebar is the only task list now
   * and had no way to change a status at all — dragging cards between columns
   * went with the board. Board-view registers the move here.
   */
  onSetFeatureStatus: ((featureId: string, status: string) => void) | null;
  onDeleteStatus: ((tabId: StatusTabId) => void) | null;
  statusTabs: StatusTab[];
  statusTabCounts: Record<string, number>;

  // Assignee filter props. The board owns the selection; the sidebar's funnel
  // is what changes it, so both meet here like the status filter does.
  assigneeFilter: string[];
  assigneeOptions: AssigneeOption[];
  /** The `gh` CLI user, so the filter's "Me" option means a real account */
  currentGithubUser: string | null;
  onAssigneeFilterChange: ((assigneeIds: string[]) => void) | null;

  // Project filter props
  projects: Project[];
  selectedProjectIds: string[];
  onProjectSelectionChange: ((projectIds: string[]) => void) | null;

  // Mode filter props
  activeModes: ('local' | 'github')[];
  onModeChange: ((modes: ('local' | 'github')[]) => void) | null;

  // Board actions expanded states
  expandedBoardActions: Set<string>;

  // Deploy panel props
  isDeployPanelCollapsed: boolean;
  onToggleDeployPanel: (() => void) | null;
  onOpenDeployPanel: ((environment?: string, scriptId?: string) => void) | null;

  // Refresh props
  onRefresh: (() => void) | null;
  isRefreshing: boolean;

  // Feature creation, shared with the sidebar and the home composer.
  // These must be referentially stable — the app shell reads them, and a new
  // identity on every publish would re-render the whole tree.
  /** Opens the full Add Feature dialog, pre-filled from `context` when given */
  onOpenAddFeature: ((context?: AddFeatureContext) => void) | null;
  /** Creates a feature from a short description, optionally starting it */
  onQuickAddFeature: ((input: QuickAddFeatureInput) => Promise<void>) | null;
  /** Opens the Create Worktree dialog */
  onCreateWorktree: (() => void) | null;

  // Mounted state
  isMounted: boolean;
}

export interface BoardControlsActions {
  // Set all controls at once (used by board-view when mounting)
  setControls: (controls: Partial<BoardControlsState>) => void;
  // Clear controls (used by board-view when unmounting)
  clearControls: () => void;
  // Update individual properties
  setSearchQuery: (query: string) => void;
  setShowFavoritesOnly: (show: boolean) => void;
  setIsAutoModeRunning: (running: boolean) => void;
  setRunningAgentsCount: (count: number) => void;
  setIsAutoModeModalOpen: (open: boolean) => void;
  setHasPendingPlan: (hasPending: boolean) => void;
  setIsMounted: (mounted: boolean) => void;
  // Status filter
  setActiveStatusTab: (tabId: StatusTabId) => void;
  setActiveStatusTabs: (tabIds: StatusTabId[]) => void;
  setStatusTabs: (tabs: StatusTab[]) => void;
  setStatusTabCounts: (counts: Record<string, number>) => void;
  // Assignee filter
  setAssigneeFilter: (assigneeIds: string[]) => void;
  // Project filter
  setProjects: (projects: Project[]) => void;
  setSelectedProjectIds: (ids: string[]) => void;
  // Mode filter
  setActiveModes: (modes: ('local' | 'github')[]) => void;
  // Board actions
  toggleBoardAction: (actionId: string) => void;
  setExpandedBoardAction: (actionId: string, expanded: boolean) => void;
  // Deploy panel
  setIsDeployPanelCollapsed: (collapsed: boolean) => void;
}

const initialState: BoardControlsState = {
  // Search
  searchQuery: '',
  onSearchChange: null,
  isCreatingSpec: false,
  creatingSpecProjectPath: undefined,

  // Favorites
  showFavoritesOnly: false,
  onShowFavoritesOnlyChange: null,

  // Board background
  onShowBoardBackground: null,

  // Auto mode
  isAutoModeRunning: false,
  runningAgentsCount: 0,
  onAutoModeToggle: null,
  isAutoModeModalOpen: false,
  onAutoModeModalOpenChange: null,

  // Plan
  onOpenPlanDialog: null,
  hasPendingPlan: false,
  onOpenPendingPlan: null,

  // Status filter
  activeStatusTab: 'waiting_approval' as StatusTabId,
  activeStatusTabs: ['waiting_approval'] as StatusTabId[],
  onStatusTabChange: null,
  onStatusTabToggle: null,
  onStatusTabsCommit: null,
  onCreateStatus: null,
  onEditFeature: null,
  onSetFeatureStatus: null,
  onDeleteStatus: null,
  statusTabs: [],
  statusTabCounts: {},

  // Assignee filter
  assigneeFilter: DEFAULT_ASSIGNEE_FILTER,
  assigneeOptions: [],
  currentGithubUser: null,
  onAssigneeFilterChange: null,

  // Project filter
  projects: [],
  selectedProjectIds: ['__all_projects__'],
  onProjectSelectionChange: null,

  // Mode filter
  activeModes: ['local'] as ('local' | 'github')[],
  onModeChange: null,

  // Board actions
  expandedBoardActions: new Set<string>(),

  // Deploy panel
  isDeployPanelCollapsed: true,
  onToggleDeployPanel: null,
  onOpenDeployPanel: null,

  // Refresh
  onRefresh: null,
  isRefreshing: false,

  // Feature creation
  onOpenAddFeature: null,
  onQuickAddFeature: null,
  onCreateWorktree: null,

  // Mounted
  isMounted: false,
};

export const useBoardControlsStore = create<BoardControlsState & BoardControlsActions>()((set) => ({
  ...initialState,

  setControls: (controls) =>
    set((state) => ({
      ...state,
      ...controls,
    })),

  clearControls: () => set(initialState),

  setSearchQuery: (query) => set({ searchQuery: query }),
  setShowFavoritesOnly: (show) => set({ showFavoritesOnly: show }),
  setIsAutoModeRunning: (running) => set({ isAutoModeRunning: running }),
  setRunningAgentsCount: (count) => set({ runningAgentsCount: count }),
  setIsAutoModeModalOpen: (open) => set({ isAutoModeModalOpen: open }),
  setHasPendingPlan: (hasPending) => set({ hasPendingPlan: hasPending }),
  setIsMounted: (mounted) => set({ isMounted: mounted }),

  // Status filter
  setActiveStatusTab: (tabId) => set({ activeStatusTab: tabId }),
  setActiveStatusTabs: (tabIds) => set({ activeStatusTabs: tabIds }),
  setStatusTabs: (tabs) => set({ statusTabs: tabs }),
  setStatusTabCounts: (counts) => set({ statusTabCounts: counts }),

  // Assignee filter
  setAssigneeFilter: (assigneeIds) => set({ assigneeFilter: assigneeIds }),

  // Project filter
  setProjects: (projects) => set({ projects }),
  setSelectedProjectIds: (ids) => set({ selectedProjectIds: ids }),

  // Mode filter
  setActiveModes: (modes) => set({ activeModes: modes }),

  toggleBoardAction: (actionId) =>
    set((state) => {
      const newExpanded = new Set(state.expandedBoardActions);
      if (newExpanded.has(actionId)) {
        newExpanded.delete(actionId);
      } else {
        newExpanded.add(actionId);
      }
      return { expandedBoardActions: newExpanded };
    }),

  setExpandedBoardAction: (actionId, expanded) =>
    set((state) => {
      const newExpanded = new Set(state.expandedBoardActions);
      if (expanded) {
        newExpanded.add(actionId);
      } else {
        newExpanded.delete(actionId);
      }
      return { expandedBoardActions: newExpanded };
    }),

  // Deploy panel
  setIsDeployPanelCollapsed: (collapsed) => set({ isDeployPanelCollapsed: collapsed }),
}));

/**
 * Helper to get board controls in the format expected by TopNavigationBar
 */
export function getBoardControlsForTopNav(state: BoardControlsState): {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isCreatingSpec: boolean;
  creatingSpecProjectPath?: string;
  showFavoritesOnly: boolean;
  onShowFavoritesOnlyChange: (show: boolean) => void;
  onShowBoardBackground?: () => void;
  isAutoModeRunning: boolean;
  runningAgentsCount: number;
  onAutoModeToggle: (enabled: boolean) => void;
  isAutoModeModalOpen: boolean;
  onAutoModeModalOpenChange: (open: boolean) => void;
  onOpenPlanDialog: () => void;
  hasPendingPlan: boolean;
  onOpenPendingPlan?: () => void;
  // Status filter props
  activeStatusTab: StatusTabId;
  activeStatusTabs: StatusTabId[];
  onStatusTabChange?: (tabId: StatusTabId) => void;
  onStatusTabToggle?: (tabId: StatusTabId) => void;
  onStatusTabsCommit?: (tabIds: StatusTabId[]) => void;
  onCreateStatus?: (name: string, colorClass: string) => void;
  onEditFeature?: (featureId: string) => void;
  onSetFeatureStatus?: (featureId: string, status: string) => void;
  onDeleteStatus?: (tabId: StatusTabId) => void;
  statusTabs: StatusTab[];
  statusTabCounts: Record<string, number>;

  // Assignee filter props
  assigneeFilter: string[];
  assigneeOptions: AssigneeOption[];
  currentGithubUser: string | null;
  onAssigneeFilterChange?: (assigneeIds: string[]) => void;

  // Project filter props
  projects: Project[];
  selectedProjectIds: string[];
  onProjectSelectionChange?: (projectIds: string[]) => void;
  // Mode filter props
  activeModes: ('local' | 'github')[];
  onModeChange?: (modes: ('local' | 'github')[]) => void;
  // Deploy panel props
  isDeployPanelCollapsed: boolean;
  onToggleDeployPanel?: () => void;
  onOpenDeployPanel?: (environment?: string, scriptId?: string) => void;
  // Refresh props
  onRefresh?: () => void;
  isRefreshing: boolean;
  isMounted: boolean;
} | null {
  // Return null if not mounted or missing required callbacks
  // Note: onShowBoardBackground is optional (moved to Settings only)
  if (
    !state.isMounted ||
    !state.onSearchChange ||
    !state.onShowFavoritesOnlyChange ||
    !state.onAutoModeModalOpenChange ||
    !state.onOpenPlanDialog
  ) {
    return null;
  }

  return {
    searchQuery: state.searchQuery,
    onSearchChange: state.onSearchChange,
    isCreatingSpec: state.isCreatingSpec,
    creatingSpecProjectPath: state.creatingSpecProjectPath,
    showFavoritesOnly: state.showFavoritesOnly,
    onShowFavoritesOnlyChange: state.onShowFavoritesOnlyChange,
    onShowBoardBackground: state.onShowBoardBackground || undefined,
    isAutoModeRunning: state.isAutoModeRunning,
    runningAgentsCount: state.runningAgentsCount,
    onAutoModeToggle: state.onAutoModeToggle || (() => {}),
    isAutoModeModalOpen: state.isAutoModeModalOpen,
    onAutoModeModalOpenChange: state.onAutoModeModalOpenChange,
    onOpenPlanDialog: state.onOpenPlanDialog,
    hasPendingPlan: state.hasPendingPlan,
    onOpenPendingPlan: state.onOpenPendingPlan || undefined,
    // Status filter
    activeStatusTab: state.activeStatusTab,
    activeStatusTabs: state.activeStatusTabs,
    onStatusTabChange: state.onStatusTabChange || undefined,
    onStatusTabToggle: state.onStatusTabToggle || undefined,
    onStatusTabsCommit: state.onStatusTabsCommit || undefined,
    onCreateStatus: state.onCreateStatus || undefined,
    onEditFeature: state.onEditFeature || undefined,
    onSetFeatureStatus: state.onSetFeatureStatus || undefined,
    onDeleteStatus: state.onDeleteStatus || undefined,
    statusTabs: state.statusTabs,
    statusTabCounts: state.statusTabCounts,
    // Assignee filter
    assigneeFilter: state.assigneeFilter,
    assigneeOptions: state.assigneeOptions,
    currentGithubUser: state.currentGithubUser,
    onAssigneeFilterChange: state.onAssigneeFilterChange || undefined,
    // Project filter
    projects: state.projects,
    selectedProjectIds: state.selectedProjectIds,
    onProjectSelectionChange: state.onProjectSelectionChange || undefined,
    // Mode filter
    activeModes: state.activeModes,
    onModeChange: state.onModeChange || undefined,
    // Deploy panel
    isDeployPanelCollapsed: state.isDeployPanelCollapsed,
    onToggleDeployPanel: state.onToggleDeployPanel || undefined,
    onOpenDeployPanel: state.onOpenDeployPanel || undefined,
    // Refresh
    onRefresh: state.onRefresh || undefined,
    isRefreshing: state.isRefreshing,
    isMounted: state.isMounted,
  };
}
