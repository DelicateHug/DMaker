// @ts-nocheck
import { useMemo, useCallback } from 'react';
import { Feature, useAppStore } from '@/store/app-store';
import { resolveDependencies, getBlockingDependencies } from '@automaker/dependency-resolver';
import type { StatusTabId } from './use-board-status-tabs';

type ColumnId = Feature['status'];

interface UseBoardColumnFeaturesProps {
  features: Feature[];
  runningAutoTasks: string[];
  searchQuery: string;
  showFavoritesOnly: boolean;
  currentWorktreePath: string | null; // Currently selected worktree path
  currentWorktreeBranch: string | null; // Branch name of the selected worktree (null = main)
  projectPath: string | null; // Main project path (for main worktree)
  /**
   * Optional: When in single-column mode, specify the active tab to optimize feature retrieval.
   * This enables returning just the active column's features directly.
   * @deprecated Prefer using `activeStatusTabs` for multi-select support.
   */
  activeStatusTab?: StatusTabId;
  /**
   * Optional: Active status tab IDs for multi-select filtering.
   * When in single-column mode, only columns matching these tabs are shown.
   * Falls back to `activeStatusTab` if not provided for backward compatibility.
   */
  activeStatusTabs?: StatusTabId[];
  /**
   * Optional: Whether the board is in single-column mode.
   * When true, provides optimized access to the active column(s) features.
   * @default false
   */
  singleColumnMode?: boolean;
  /**
   * Optional: Whether the board is showing features from all/multiple projects.
   * When true, worktree-based filtering is skipped since worktrees are project-specific.
   * @default false
   */
  showAllProjects?: boolean;
}

export function useBoardColumnFeatures({
  features,
  runningAutoTasks,
  searchQuery,
  showFavoritesOnly,
  currentWorktreePath,
  currentWorktreeBranch,
  projectPath,
  activeStatusTab,
  activeStatusTabs,
  singleColumnMode = false,
  showAllProjects = false,
}: UseBoardColumnFeaturesProps) {
  // Memoize column features to prevent unnecessary re-renders
  const columnFeaturesMap = useMemo(() => {
    // Use a more flexible type to support dynamic pipeline statuses
    const map: Record<string, Feature[]> = {
      backlog: [],
      in_progress: [],
      waiting_approval: [],
      verified: [],
    };

    // Filter features by search query (case-insensitive) and favorites
    const normalizedQuery = searchQuery.toLowerCase().trim();
    let filteredFeatures = features;

    // Apply search query filter
    if (normalizedQuery) {
      filteredFeatures = filteredFeatures.filter(
        (f) =>
          (f.title || '').toLowerCase().includes(normalizedQuery) ||
          (f.description || '').toLowerCase().includes(normalizedQuery) ||
          f.category?.toLowerCase().includes(normalizedQuery)
      );
    }

    // Apply favorites filter
    if (showFavoritesOnly) {
      filteredFeatures = filteredFeatures.filter((f) => f.isFavorite);
    }

    // Determine the effective worktree path and branch for filtering
    // If currentWorktreePath is null, we're on the main worktree
    const effectiveWorktreePath = currentWorktreePath || projectPath;
    // Use the branch name from the selected worktree
    // If we're selecting main (currentWorktreePath is null), currentWorktreeBranch
    // should contain the main branch's actual name, defaulting to "main"
    // If we're selecting a non-main worktree but can't find it, currentWorktreeBranch is null
    // In that case, we can't do branch-based filtering, so we'll handle it specially below
    const effectiveBranch = currentWorktreeBranch;

    // Deduplicate features by ID to prevent the same feature appearing in multiple columns
    // This can happen during status transitions when polling returns stale data
    const seenFeatureIds = new Set<string>();
    const uniqueFilteredFeatures = filteredFeatures.filter((f) => {
      if (seenFeatureIds.has(f.id)) return false;
      seenFeatureIds.add(f.id);
      return true;
    });

    uniqueFilteredFeatures.forEach((f) => {
      // If feature has a running agent, always show it in "in_progress"
      const isRunning = runningAutoTasks.includes(f.id);

      // Check if feature matches the current worktree by branchName
      // Features without branchName are considered unassigned (show only on primary worktree)
      // When showing all/multiple projects, skip worktree filtering entirely since
      // worktrees are project-specific and don't apply across projects
      const featureBranch = f.branchName;

      let matchesWorktree: boolean;
      if (showAllProjects) {
        // In multi-project mode, show all features regardless of worktree
        matchesWorktree = true;
      } else if (!featureBranch) {
        // No branch assigned - show only on primary worktree
        const isViewingPrimary = currentWorktreePath === null;
        matchesWorktree = isViewingPrimary;
      } else if (effectiveBranch === null) {
        // We're viewing main but branch hasn't been initialized yet
        // (worktrees disabled or haven't loaded yet).
        // Show features assigned to primary worktree's branch.
        if (projectPath) {
          const worktrees = useAppStore.getState().worktreesByProject[projectPath] ?? [];
          if (worktrees.length === 0) {
            // Worktrees not loaded yet - fallback to showing features on common default branches
            // This prevents features from disappearing during initial load
            matchesWorktree =
              featureBranch === 'main' || featureBranch === 'master' || featureBranch === 'develop';
          } else {
            matchesWorktree = useAppStore
              .getState()
              .isPrimaryWorktreeBranch(projectPath, featureBranch);
          }
        } else {
          matchesWorktree = false;
        }
      } else {
        // Match by branch name
        matchesWorktree = featureBranch === effectiveBranch;
      }

      // Use the feature's status (fallback to backlog for unknown statuses)
      const status = f.status || 'backlog';

      // IMPORTANT:
      // Historically, we forced "running" features into in_progress so they never disappeared
      // during stale reload windows. With pipelines, a feature can legitimately be running while
      // its status is `pipeline_*`, so we must respect that status to render it in the right column.
      if (isRunning) {
        if (!matchesWorktree) return;

        if (status.startsWith('pipeline_')) {
          if (!map[status]) map[status] = [];
          map[status].push(f);
          return;
        }

        // If it's running and has a known non-backlog status, keep it in that status.
        // Otherwise, fallback to in_progress as the "active work" column.
        if (status !== 'backlog' && map[status]) {
          map[status].push(f);
        } else {
          map.in_progress.push(f);
        }
        return;
      }

      // Not running: place by status (and worktree filter)
      // Filter all items by worktree, including backlog
      // This ensures backlog items with a branch assigned only show in that branch
      if (status === 'backlog') {
        if (matchesWorktree) {
          map.backlog.push(f);
        }
      } else if (map[status]) {
        // Only show if matches current worktree or has no worktree assigned
        if (matchesWorktree) {
          map[status].push(f);
        }
      } else if (status.startsWith('pipeline_')) {
        // Handle pipeline statuses - initialize array if needed
        if (matchesWorktree) {
          if (!map[status]) {
            map[status] = [];
          }
          map[status].push(f);
        }
      } else {
        // Unknown status, default to backlog
        if (matchesWorktree) {
          map.backlog.push(f);
        }
      }
    });

    // Apply dependency-aware sorting to backlog
    // This ensures features appear in dependency order (dependencies before dependents)
    // Within the same dependency level, features are sorted by priority
    if (map.backlog.length > 0) {
      const { orderedFeatures } = resolveDependencies(map.backlog);

      // Get all features to check blocking dependencies against
      const allFeatures = features;
      const enableDependencyBlocking = useAppStore.getState().enableDependencyBlocking;

      // Sort blocked features to the end of the backlog
      // This keeps the dependency order within each group (unblocked/blocked)
      if (enableDependencyBlocking) {
        const unblocked: Feature[] = [];
        const blocked: Feature[] = [];

        for (const f of orderedFeatures) {
          if (getBlockingDependencies(f, allFeatures).length > 0) {
            blocked.push(f);
          } else {
            unblocked.push(f);
          }
        }

        map.backlog = [...unblocked, ...blocked];
      } else {
        map.backlog = orderedFeatures;
      }
    }

    return map;
  }, [
    features,
    runningAutoTasks,
    searchQuery,
    showFavoritesOnly,
    currentWorktreePath,
    currentWorktreeBranch,
    projectPath,
    showAllProjects,
  ]);

  const getColumnFeatures = useCallback(
    (columnId: ColumnId) => {
      return columnFeaturesMap[columnId] || [];
    },
    [columnFeaturesMap]
  );

  // Calculate feature counts per column for tab badges
  // This is useful for showing counts in the status tabs UI
  const columnCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [columnId, columnFeatures] of Object.entries(columnFeaturesMap)) {
      counts[columnId] = columnFeatures.length;
    }
    return counts;
  }, [columnFeaturesMap]);

  // Get count for a specific column (for tab badges)
  const getColumnCount = useCallback(
    (columnId: ColumnId): number => {
      return columnCounts[columnId] ?? 0;
    },
    [columnCounts]
  );

  // In single-column mode, provide direct access to the active column(s) features.
  // Supports multi-select: returns features from all active tabs combined.
  // Falls back to single activeStatusTab for backward compatibility.
  const activeColumnFeatures = useMemo(() => {
    if (!singleColumnMode) {
      return [];
    }
    // Multi-select: combine features from all active tabs
    const tabs =
      activeStatusTabs && activeStatusTabs.length > 0
        ? activeStatusTabs
        : activeStatusTab
          ? [activeStatusTab]
          : [];
    if (tabs.length === 0) return [];
    if (tabs.length === 1) return columnFeaturesMap[tabs[0]] || [];
    // Multiple tabs selected: combine features from each
    const combined: Feature[] = [];
    for (const tabId of tabs) {
      const tabFeatures = columnFeaturesMap[tabId];
      if (tabFeatures) {
        combined.push(...tabFeatures);
      }
    }
    return combined;
  }, [singleColumnMode, activeStatusTab, activeStatusTabs, columnFeaturesMap]);

  // Total count of features across all visible columns (excluding completed)
  const totalVisibleCount = useMemo(() => {
    return Object.values(columnFeaturesMap).reduce((sum, features) => {
      // Don't count completed features in the total
      if (features.length > 0 && features[0]?.status !== 'completed') {
        return sum + features.length;
      }
      return sum;
    }, 0);
  }, [columnFeaturesMap]);

  return {
    /** Map of all features organized by column ID */
    columnFeaturesMap,
    /** Get features for a specific column */
    getColumnFeatures,
    /** Feature counts per column (for tab badges) */
    columnCounts,
    /** Get count for a specific column */
    getColumnCount,
    /** Features in the active column (when in single-column mode) */
    activeColumnFeatures,
    /** Total count of features across all visible columns */
    totalVisibleCount,
    /** Currently active tab ID (when in single-column mode) */
    activeTab: activeStatusTab,
    /** Whether in single-column mode */
    isSingleColumnMode: singleColumnMode,
  };
}
