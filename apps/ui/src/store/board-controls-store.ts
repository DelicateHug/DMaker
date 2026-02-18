import { create } from 'zustand';
import type { ViewMode } from '@/components/views/board-view/components/view-toggle';
import type {
  StatusTabId,
  StatusTab,
} from '@/components/views/board-view/hooks/use-board-status-tabs';
import type { Project } from '@/lib/electron';

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

  // View toggle props
  viewMode: ViewMode;
  onViewModeChange: ((mode: ViewMode) => void) | null;

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
  onDeleteStatus: ((tabId: StatusTabId) => void) | null;
  statusTabs: StatusTab[];
  statusTabCounts: Record<string, number>;
  isListView: boolean;

  // Project filter props
  projects: Project[];
  selectedProjectIds: string[];
  onProjectSelectionChange: ((projectIds: string[]) => void) | null;

  // Board actions expanded states
  expandedBoardActions: Set<string>;

  // Deploy panel props
  isDeployPanelCollapsed: boolean;
  onToggleDeployPanel: (() => void) | null;
  onOpenDeployPanel: ((environment?: string, scriptId?: string) => void) | null;

  // Refresh props
  onRefresh: (() => void) | null;
  isRefreshing: boolean;

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
  setViewMode: (mode: ViewMode) => void;
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
  setIsListView: (isListView: boolean) => void;
  // Project filter
  setProjects: (projects: Project[]) => void;
  setSelectedProjectIds: (ids: string[]) => void;
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

  // View toggle
  viewMode: 'kanban',
  onViewModeChange: null,

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
  onDeleteStatus: null,
  statusTabs: [],
  statusTabCounts: {},
  isListView: false,

  // Project filter
  projects: [],
  selectedProjectIds: ['__all_projects__'],
  onProjectSelectionChange: null,

  // Board actions
  expandedBoardActions: new Set<string>(),

  // Deploy panel
  isDeployPanelCollapsed: true,
  onToggleDeployPanel: null,
  onOpenDeployPanel: null,

  // Refresh
  onRefresh: null,
  isRefreshing: false,

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
  setViewMode: (mode) => set({ viewMode: mode }),
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
  setIsListView: (isListView) => set({ isListView }),

  // Project filter
  setProjects: (projects) => set({ projects }),
  setSelectedProjectIds: (ids) => set({ selectedProjectIds: ids }),

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
  viewMode: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
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
  onDeleteStatus?: (tabId: StatusTabId) => void;
  statusTabs: StatusTab[];
  statusTabCounts: Record<string, number>;
  isListView: boolean;
  // Project filter props
  projects: Project[];
  selectedProjectIds: string[];
  onProjectSelectionChange?: (projectIds: string[]) => void;
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
  // Note: onViewModeChange is optional (view toggle removed from header)
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
    viewMode: state.viewMode,
    onViewModeChange: state.onViewModeChange || undefined,
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
    onDeleteStatus: state.onDeleteStatus || undefined,
    statusTabs: state.statusTabs,
    statusTabCounts: state.statusTabCounts,
    isListView: state.isListView,
    // Project filter
    projects: state.projects,
    selectedProjectIds: state.selectedProjectIds,
    onProjectSelectionChange: state.onProjectSelectionChange || undefined,
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
