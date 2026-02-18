import { useState, useCallback, useEffect, useMemo } from 'react';
import { getJSON, setJSON } from '@/lib/storage';
import type { Column } from '../constants';

/**
 * Valid status tab identifiers
 * These correspond to the base column IDs from constants.ts, plus special view tabs
 */
export type StatusTabId =
  | 'backlog'
  | 'in_progress'
  | 'waiting_approval'
  | 'completed'
  | 'all'
  | string;

/**
 * Tab configuration for display
 */
export interface StatusTab {
  id: StatusTabId;
  label: string;
  colorClass: string;
}

/** Storage key for persisting active tab preference */
const STORAGE_KEY = 'automaker:board-status-tab';

/** Default status tab IDs (base columns without pipeline, plus completed and all) */
const DEFAULT_TAB_IDS: StatusTabId[] = [
  'backlog',
  'in_progress',
  'waiting_approval',
  'completed',
  'all',
];

/** Default active tab (used as ultimate fallback) */
const DEFAULT_ACTIVE_TAB: StatusTabId = 'waiting_approval';

/**
 * Smart default tab priority order.
 * When smart defaulting is enabled (featureCounts provided), the hook will
 * select the first tab in this list that has features (count > 0).
 * Falls back to the first available tab if none have features.
 */
const SMART_DEFAULT_PRIORITY: StatusTabId[] = ['waiting_approval', 'in_progress', 'completed'];

/**
 * Validates that a tab ID exists in the available tabs
 */
function validateTabId(tabId: unknown, availableTabs: StatusTab[]): StatusTabId {
  if (typeof tabId === 'string' && availableTabs.some((tab) => tab.id === tabId)) {
    return tabId as StatusTabId;
  }
  // Fallback to first available tab or default
  return availableTabs[0]?.id ?? DEFAULT_ACTIVE_TAB;
}

/**
 * Validates an array of tab IDs against available tabs.
 * Returns only valid tab IDs. Falls back to [DEFAULT_ACTIVE_TAB] if none are valid.
 * Also handles backward compatibility with old single-string localStorage format.
 */
function validateTabIds(tabIds: unknown, availableTabs: StatusTab[]): StatusTabId[] {
  if (Array.isArray(tabIds)) {
    const valid = tabIds.filter(
      (id): id is StatusTabId =>
        typeof id === 'string' && availableTabs.some((tab) => tab.id === id)
    );
    if (valid.length > 0) return valid;
  }
  // Backward compat: if a single string was persisted (old format), wrap in array
  if (typeof tabIds === 'string' && availableTabs.some((tab) => tab.id === tabIds)) {
    return [tabIds as StatusTabId];
  }
  return [availableTabs[0]?.id ?? DEFAULT_ACTIVE_TAB];
}

/**
 * Determine the best default tab based on feature counts.
 * Prefers 'waiting_approval' if it has features, then 'in_progress', then 'completed',
 * then first available tab.
 */
function getSmartDefaultTab(
  featureCounts: Record<string, number>,
  availableTabs: StatusTab[]
): StatusTabId {
  // Try each priority tab in order
  for (const tabId of SMART_DEFAULT_PRIORITY) {
    if ((featureCounts[tabId] ?? 0) > 0 && availableTabs.some((t) => t.id === tabId)) {
      return tabId;
    }
  }
  // Fallback: first tab with features, or first tab overall
  for (const tab of availableTabs) {
    if (tab.id !== 'all' && (featureCounts[tab.id] ?? 0) > 0) {
      return tab.id;
    }
  }
  return availableTabs[0]?.id ?? DEFAULT_ACTIVE_TAB;
}

/** Special view tabs appended after column-based tabs */
const SPECIAL_VIEW_TABS: StatusTab[] = [
  { id: 'completed', label: 'Completed', colorClass: 'bg-[var(--status-completed)]' },
  { id: 'all', label: 'All Statuses', colorClass: 'bg-[var(--status-all)]' },
];

/**
 * Convert Column definitions to StatusTab configurations.
 * Appends 'completed' and 'all' special view tabs after column-derived tabs.
 */
function columnsToTabs(columns: Column[]): StatusTab[] {
  const columnTabs = columns.map((col) => ({
    id: col.id,
    label: col.title,
    colorClass: col.colorClass,
  }));
  return [...columnTabs, ...SPECIAL_VIEW_TABS];
}

/**
 * Load persisted active tabs from localStorage.
 * Handles backward compatibility with old single-string format.
 */
function loadPersistedTabs(): StatusTabId[] | null {
  const raw = getJSON<StatusTabId[] | StatusTabId>(STORAGE_KEY);
  if (raw === null || raw === undefined) return null;
  // New format: array
  if (Array.isArray(raw)) return raw;
  // Old format: single string — wrap in array for backward compat
  if (typeof raw === 'string') return [raw];
  return null;
}

/**
 * Save active tabs to localStorage
 */
function savePersistedTabs(tabIds: StatusTabId[]): void {
  setJSON(STORAGE_KEY, tabIds);
}

export interface UseBoardStatusTabsOptions {
  /**
   * Available columns to create tabs from
   * If not provided, uses default base columns
   */
  columns?: Column[];
  /**
   * Whether to persist the active tab to localStorage
   * @default true
   */
  persist?: boolean;
  /**
   * Initial active tab (overrides persisted value if provided)
   */
  initialTab?: StatusTabId;
  /**
   * Feature counts per column (e.g., { backlog: 3, in_progress: 1, completed: 5 }).
   * When provided, enables smart defaulting: the hook will prefer 'waiting_approval'
   * if it has features, fallback to 'in_progress', then 'completed', then
   * first tab with features.
   * Only used for initial tab selection when no persisted/explicit tab is set.
   */
  featureCounts?: Record<string, number>;
}

export interface UseBoardStatusTabsReturn {
  /**
   * Currently active tab IDs (multi-select).
   * Contains ['all'] when "All Statuses" is selected, or one or more individual tab IDs.
   */
  activeTabs: StatusTabId[];
  /**
   * Primary active tab ID (backward-compatible convenience alias).
   * Returns the first item in activeTabs.
   * @deprecated Prefer using `activeTabs` for multi-select support.
   */
  activeTab: StatusTabId;
  /**
   * Set a single active tab (replaces all current selections).
   * Equivalent to selecting exactly one tab in single-select mode.
   */
  setActiveTab: (tabId: StatusTabId) => void;
  /**
   * Set multiple active tabs at once (replaces all current selections).
   * Used by staged-selection UIs (e.g., BoardStatusDropdown) to commit a batch
   * of selections. Validates all tab IDs against available tabs.
   */
  setActiveTabs: (tabIds: StatusTabId[]) => void;
  /**
   * Toggle a tab's selection state (multi-select mode).
   *
   * Implements "All" deselection logic:
   * - Toggling "All" ON clears all individual selections and selects only "All".
   * - Toggling an individual tab ON clears "All" and adds the tab.
   * - Toggling the last individual tab OFF falls back to "All".
   */
  toggleTab: (tabId: StatusTabId) => void;
  /** All available tabs */
  tabs: StatusTab[];
  /** Navigate to the next tab (wraps around, single-select behavior) */
  nextTab: () => void;
  /** Navigate to the previous tab (wraps around, single-select behavior) */
  previousTab: () => void;
  /** Check if a specific tab is active (works with multi-select) */
  isActiveTab: (tabId: StatusTabId) => boolean;
  /** Get the primary active tab configuration */
  activeTabConfig: StatusTab | undefined;
  /** Get the index of the primary active tab */
  activeTabIndex: number;
  /** Whether 'all' is currently active (shows all columns) */
  isAllMode: boolean;
}

/**
 * Hook for managing board status tab state with multi-select support.
 *
 * Provides state management for switching between status columns (Backlog, In Progress,
 * Waiting Approval, and any pipeline columns) in a tab-based view.
 *
 * Supports both single-select (setActiveTab) and multi-select (toggleTab) modes.
 * Multi-select implements "All" deselection logic:
 * - Selecting "All" clears all individual selections
 * - Selecting an individual tab clears "All"
 * - Deselecting the last individual tab falls back to "All"
 *
 * Features:
 * - Multi-select tab state with activeTabs array
 * - Backward-compatible activeTab alias for single-select consumers
 * - "All" deselection logic for intuitive multi-select behavior
 * - Smart defaulting: prefers waiting_approval → in_progress → completed → first tab with features
 * - Optional localStorage persistence
 * - Navigation helpers (next/previous)
 * - Dynamic tab generation from Column definitions
 * - Support for pipeline columns
 *
 * @example
 * ```tsx
 * // Multi-select usage
 * const { activeTabs, toggleTab, tabs, isActiveTab, isAllMode } = useBoardStatusTabs({
 *   columns: getColumnsWithPipeline(pipelineConfig),
 *   featureCounts: columnCounts,
 * });
 *
 * // Render multi-select tab buttons
 * {tabs.map((tab) => (
 *   <button
 *     key={tab.id}
 *     onClick={() => toggleTab(tab.id)}
 *     className={isActiveTab(tab.id) ? 'active' : ''}
 *   >
 *     {tab.label}
 *   </button>
 * ))}
 *
 * // Backward-compatible single-select usage
 * const { activeTab, setActiveTab, tabs, nextTab, previousTab, isAllMode } = useBoardStatusTabs({
 *   columns: getColumnsWithPipeline(pipelineConfig),
 * });
 * ```
 */
export function useBoardStatusTabs(
  options: UseBoardStatusTabsOptions = {}
): UseBoardStatusTabsReturn {
  const { columns, persist = true, initialTab, featureCounts } = options;

  // Generate tabs from columns or use defaults
  const tabs = useMemo<StatusTab[]>(() => {
    if (columns && columns.length > 0) {
      return columnsToTabs(columns);
    }
    // Default tabs when no columns provided
    return [
      { id: 'backlog', label: 'Backlog', colorClass: 'bg-[var(--status-backlog)]' },
      { id: 'in_progress', label: 'In Progress', colorClass: 'bg-[var(--status-in-progress)]' },
      {
        id: 'waiting_approval',
        label: 'Waiting Approval',
        colorClass: 'bg-[var(--status-waiting)]',
      },
      { id: 'completed', label: 'Completed', colorClass: 'bg-[var(--status-completed)]' },
      { id: 'all', label: 'All Statuses', colorClass: 'bg-[var(--status-all)]' },
    ];
  }, [columns]);

  // Initialize active tabs state (multi-select: array of StatusTabId)
  // Priority: initialTab > persisted > smart default (featureCounts) > first tab > default
  const [activeTabs, setActiveTabsState] = useState<StatusTabId[]>(() => {
    if (initialTab && tabs.some((t) => t.id === initialTab)) {
      return [initialTab];
    }
    if (persist) {
      const persisted = loadPersistedTabs();
      if (persisted) {
        const validated = validateTabIds(persisted, tabs);
        if (validated.length > 0) return validated;
      }
    }
    // Smart defaulting: prefer waiting_approval, then in_progress, then completed, based on feature counts
    if (featureCounts) {
      return [getSmartDefaultTab(featureCounts, tabs)];
    }
    return [tabs[0]?.id ?? DEFAULT_ACTIVE_TAB];
  });

  // Track whether smart defaulting has been applied (only on first mount with counts)
  const [hasAppliedSmartDefault, setHasAppliedSmartDefault] = useState(false);

  // Apply smart default when featureCounts become available after initial render
  // This handles the case where featureCounts are loaded asynchronously
  useEffect(() => {
    if (featureCounts && !hasAppliedSmartDefault && !initialTab) {
      // Only apply smart default if no explicit/persisted tab was set
      if (persist) {
        const persisted = loadPersistedTabs();
        if (persisted) {
          const validated = validateTabIds(persisted, tabs);
          if (validated.length > 0) {
            // User has a persisted preference, respect it
            setHasAppliedSmartDefault(true);
            return;
          }
        }
      }
      const smartTab = getSmartDefaultTab(featureCounts, tabs);
      setActiveTabsState([smartTab]);
      setHasAppliedSmartDefault(true);
    }
  }, [featureCounts, hasAppliedSmartDefault, initialTab, persist, tabs]);

  // Ensure active tabs are valid when tabs change (e.g., pipeline config changes)
  useEffect(() => {
    const validTabs = activeTabs.filter((id) => tabs.some((t) => t.id === id));
    if (validTabs.length === 0) {
      setActiveTabsState([tabs[0]?.id ?? DEFAULT_ACTIVE_TAB]);
    } else if (validTabs.length !== activeTabs.length) {
      setActiveTabsState(validTabs);
    }
  }, [tabs, activeTabs]);

  // Persist active tabs when they change
  useEffect(() => {
    if (persist) {
      savePersistedTabs(activeTabs);
    }
  }, [activeTabs, persist]);

  // Backward-compatible primary active tab (first in the array)
  const activeTab = useMemo<StatusTabId>(() => {
    return activeTabs[0] ?? DEFAULT_ACTIVE_TAB;
  }, [activeTabs]);

  // Set active tab with validation (single-select: replaces all selections)
  const setActiveTab = useCallback(
    (tabId: StatusTabId) => {
      const validTabId = validateTabId(tabId, tabs);
      setActiveTabsState([validTabId]);
    },
    [tabs]
  );

  // Set multiple active tabs at once with validation (bulk-commit for staged UIs)
  const setActiveTabs = useCallback(
    (tabIds: StatusTabId[]) => {
      const validated = validateTabIds(tabIds, tabs);
      setActiveTabsState(validated);
    },
    [tabs]
  );

  // Toggle tab for multi-select mode with "All" deselection logic
  const toggleTab = useCallback(
    (tabId: StatusTabId) => {
      // Validate the tab ID first
      if (!tabs.some((t) => t.id === tabId)) return;

      setActiveTabsState((current) => {
        // Case 1: Toggling "All" — always results in only ["all"]
        if (tabId === 'all') {
          return ['all'];
        }

        // Case 2: Toggling an individual tab
        const isCurrentlyActive = current.includes(tabId);

        if (isCurrentlyActive) {
          // Deselecting an active tab
          const remaining = current.filter((id) => id !== tabId);
          // If no tabs remain, fall back to "All"
          if (remaining.length === 0) {
            return ['all'];
          }
          return remaining;
        } else {
          // Selecting a new tab — clear "All" if it's in the selection
          const withoutAll = current.filter((id) => id !== 'all');
          return [...withoutAll, tabId];
        }
      });
    },
    [tabs]
  );

  // Get primary active tab index (based on first active tab)
  const activeTabIndex = useMemo(() => {
    return tabs.findIndex((t) => t.id === activeTab);
  }, [tabs, activeTab]);

  // Navigate to next tab (wraps around) — single-select behavior
  const nextTab = useCallback(() => {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    const nextIndex = (currentIndex + 1) % tabs.length;
    setActiveTabsState([tabs[nextIndex].id]);
  }, [tabs, activeTab]);

  // Navigate to previous tab (wraps around) — single-select behavior
  const previousTab = useCallback(() => {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    const prevIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
    setActiveTabsState([tabs[prevIndex].id]);
  }, [tabs, activeTab]);

  // Check if a tab is active (supports multi-select)
  const isActiveTab = useCallback(
    (tabId: StatusTabId) => {
      return activeTabs.includes(tabId);
    },
    [activeTabs]
  );

  // Get primary active tab configuration
  const activeTabConfig = useMemo(() => {
    return tabs.find((t) => t.id === activeTab);
  }, [tabs, activeTab]);

  // Whether 'all' is currently active
  // When true, the board should show all columns instead of filtering
  const isAllMode = useMemo(() => activeTabs.includes('all'), [activeTabs]);

  return useMemo(
    () => ({
      activeTabs,
      activeTab,
      setActiveTab,
      setActiveTabs,
      toggleTab,
      tabs,
      nextTab,
      previousTab,
      isActiveTab,
      activeTabConfig,
      activeTabIndex,
      isAllMode,
    }),
    [
      activeTabs,
      activeTab,
      setActiveTab,
      setActiveTabs,
      toggleTab,
      tabs,
      nextTab,
      previousTab,
      isActiveTab,
      activeTabConfig,
      activeTabIndex,
      isAllMode,
    ]
  );
}
