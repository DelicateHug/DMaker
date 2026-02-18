import { memo, useMemo, useCallback, useState, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight, Plus, Tag, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getBlockingDependencies } from '@automaker/dependency-resolver';
import { useAppStore, formatShortcut } from '@/store/app-store';
import type { Feature } from '@/store/app-store';
import type { PipelineConfig, FeatureStatusWithPipeline } from '@automaker/types';
import { ListRow, sortFeatures } from './list-row';
import { createRowActionHandlers, type RowActionHandlers } from './row-actions';
import { getStatusLabel, getStatusOrder } from './status-badge';
import { getColumnsWithPipeline } from '../../constants';
import { groupFeaturesByCategory, groupFeaturesByProject } from '../category-group';
import type { SortConfig, SortColumn } from '../../hooks/use-list-view-state';
import type { StatusTabId } from '../../hooks/use-board-status-tabs';

/** Empty set constant to avoid creating new instances on each render */
const EMPTY_SET = new Set<string>();

/**
 * Status group configuration for the list view
 */
interface StatusGroup {
  id: FeatureStatusWithPipeline;
  title: string;
  colorClass: string;
  features: Feature[];
}

/**
 * Props for action handlers passed from the parent board view
 */
export interface ListViewActionHandlers {
  onEdit: (feature: Feature) => void;
  onDelete: (featureId: string) => void;
  onViewOutput?: (feature: Feature) => void;
  onVerify?: (feature: Feature) => void;
  onResume?: (feature: Feature) => void;
  onForceStop?: (feature: Feature) => void;
  onManualVerify?: (feature: Feature) => void;
  onFollowUp?: (feature: Feature) => void;
  onImplement?: (feature: Feature) => void;
  onViewPlan?: (feature: Feature) => void;
  onApprovePlan?: (feature: Feature) => void;
  onSpawnTask?: (feature: Feature) => void;
  onToggleFavorite?: (feature: Feature) => void;
}

export interface ListViewProps {
  /** Map of column/status ID to features in that column */
  columnFeaturesMap: Record<string, Feature[]>;
  /** All features (for dependency checking) */
  allFeatures: Feature[];
  /** Current sort configuration */
  sortConfig: SortConfig;
  /** Callback when sort column is changed */
  onSortChange: (column: SortColumn) => void;
  /** Action handlers for rows */
  actionHandlers: ListViewActionHandlers;
  /** Set of feature IDs that are currently running */
  runningAutoTasks: string[];
  /** Pipeline configuration for custom statuses */
  pipelineConfig?: PipelineConfig | null;
  /** Callback to add a new feature */
  onAddFeature?: () => void;
  /** Whether selection mode is enabled */
  isSelectionMode?: boolean;
  /** Set of selected feature IDs */
  selectedFeatureIds?: Set<string>;
  /** Callback when a feature's selection is toggled */
  onToggleFeatureSelection?: (featureId: string) => void;
  /** Callback when the row is clicked */
  onRowClick?: (feature: Feature) => void;
  /** Whether viewing all projects (shows branch badge on rows) */
  showAllProjects?: boolean;
  /** Lookup function to get a project's default branch by projectId */
  getProjectDefaultBranch?: (projectId: string) => string | undefined;
  /** Additional className for custom styling */
  className?: string;
  // Single-column mode props
  /** When true, only display the status group(s) matching active status tab(s) */
  singleColumnMode?: boolean;
  /** The primary active status tab ID (backward-compatible) */
  activeStatusTab?: StatusTabId;
  /** Active status tab IDs for multi-select column filtering */
  activeStatusTabs?: StatusTabId[];
}

// ---------------------------------------------------------------------------
// Virtual item types - the flattened list is composed of these discriminated items
// ---------------------------------------------------------------------------

/** A project group header virtual item (shown when multi-project) */
interface VirtualProjectGroupHeader {
  type: 'project-group-header';
  key: string;
  projectName: string;
  count: number;
}

/** A status group header virtual item */
interface VirtualStatusGroupHeader {
  type: 'status-group-header';
  key: string;
  group: StatusGroup;
  /** Whether this status header is nested under a project group (affects left-padding) */
  inProject: boolean;
}

/** A category sub-group header virtual item */
interface VirtualCategoryHeader {
  type: 'category-header';
  key: string;
  statusId: string;
  category: string;
  count: number;
  /** Whether this category header is nested under a project group (affects left-padding) */
  inProject: boolean;
}

/** A feature row virtual item */
interface VirtualFeatureRow {
  type: 'feature-row';
  key: string;
  feature: Feature;
  /** Whether this row is inside a category sub-group (affects left-padding) */
  inCategory: boolean;
  /** Whether this row is nested under a project group (affects left-padding) */
  inProject: boolean;
}

/** Union of all virtual item types */
type VirtualListItem =
  | VirtualProjectGroupHeader
  | VirtualStatusGroupHeader
  | VirtualCategoryHeader
  | VirtualFeatureRow;

// ---------------------------------------------------------------------------
// Estimated sizes (px) for each item type - used by the virtualizer before
// the real DOM measurement kicks in via measureElement.
// ---------------------------------------------------------------------------
const ESTIMATE_PROJECT_HEADER = 44;
const ESTIMATE_STATUS_HEADER = 40;
const ESTIMATE_CATEGORY_HEADER = 32;
const ESTIMATE_FEATURE_ROW = 88;

/**
 * ProjectGroupHeader displays the header for a project group in multi-project mode
 */
const ListProjectGroupHeader = memo(function ListProjectGroupHeader({
  projectName,
  count,
  isExpanded,
  onToggle,
}: {
  projectName: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center gap-2 w-full px-3 py-2.5 text-left',
        'bg-accent/40 hover:bg-accent/60 transition-colors duration-200',
        'border-b border-border/60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
      )}
      aria-expanded={isExpanded}
      data-testid={`list-project-header-${projectName}`}
    >
      {/* Collapse indicator */}
      <span className="text-muted-foreground">
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </span>

      {/* Project icon */}
      <FolderOpen className="w-4 h-4 text-muted-foreground/70 shrink-0" />

      {/* Project name */}
      <span className="font-semibold text-sm">{projectName}</span>

      {/* Feature count */}
      <span className="text-xs text-muted-foreground">({count})</span>
    </button>
  );
});

/**
 * StatusGroupHeader displays the header for a status group with collapse toggle
 */
const StatusGroupHeader = memo(function StatusGroupHeader({
  group,
  isExpanded,
  onToggle,
  inProject = false,
}: {
  group: StatusGroup;
  isExpanded: boolean;
  onToggle: () => void;
  inProject?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center gap-2 w-full py-2 text-left',
        'bg-muted/50 hover:bg-muted/70 transition-colors duration-200',
        'border-b border-border/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        inProject ? 'px-5' : 'px-3'
      )}
      aria-expanded={isExpanded}
      data-testid={`list-group-header-${group.id}`}
    >
      {/* Collapse indicator */}
      <span className="text-muted-foreground">
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </span>

      {/* Status color indicator */}
      <span
        className={cn('w-2.5 h-2.5 rounded-full shrink-0', group.colorClass)}
        aria-hidden="true"
      />

      {/* Group title */}
      <span className="font-medium text-sm">{group.title}</span>

      {/* Feature count */}
      <span className="text-xs text-muted-foreground">({group.features.length})</span>
    </button>
  );
});

/**
 * CategorySubGroupHeader displays the header for a category sub-group within a status group
 */
const CategorySubGroupHeader = memo(function CategorySubGroupHeader({
  category,
  count,
  isExpanded,
  onToggle,
}: {
  category: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center gap-1.5 w-full px-3 py-1.5 text-left',
        'hover:bg-accent/40 transition-colors duration-150 rounded-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
      )}
      aria-expanded={isExpanded}
      data-testid={`list-category-header-${category}`}
    >
      <span className="text-muted-foreground shrink-0">
        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </span>
      <Tag className="w-3 h-3 text-muted-foreground/60 shrink-0" />
      <span className="text-xs font-medium text-muted-foreground/80 truncate flex-1">
        {category}
      </span>
      <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">{count}</span>
    </button>
  );
});

/**
 * EmptyState displays a message when there are no features
 */
const EmptyState = memo(function EmptyState({ onAddFeature }: { onAddFeature?: () => void }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-4',
        'text-center text-muted-foreground'
      )}
      data-testid="list-view-empty"
    >
      <p className="text-sm mb-4">No features to display</p>
      {onAddFeature && (
        <Button variant="outline" size="sm" onClick={onAddFeature}>
          <Plus className="w-4 h-4 mr-2" />
          Add Feature
        </Button>
      )}
    </div>
  );
});

/**
 * ListView displays features in a virtualized list, grouped by status.
 *
 * Features:
 * - Groups features by status (backlog, in_progress, waiting_approval, verified, pipeline steps)
 * - Collapsible status groups and category sub-groups
 * - Virtualized rendering via @tanstack/react-virtual for performance with large lists
 * - Status group headers and category headers are virtual items in the flat list
 * - Inline row actions with hover state
 * - Selection support for bulk operations
 * - Animated border for currently running features
 * - Keyboard accessible
 *
 * The component receives features grouped by status via columnFeaturesMap
 * and applies the current sort configuration within each group.
 * All items (headers + feature rows) are flattened into a single virtualized list.
 *
 * @example
 * ```tsx
 * const { sortConfig, setSortColumn } = useListViewState();
 * const { columnFeaturesMap } = useBoardColumnFeatures({ features, ... });
 *
 * <ListView
 *   columnFeaturesMap={columnFeaturesMap}
 *   allFeatures={features}
 *   sortConfig={sortConfig}
 *   onSortChange={setSortColumn}
 *   actionHandlers={{
 *     onEdit: handleEdit,
 *     onDelete: handleDelete,
 *     // ...
 *   }}
 *   runningAutoTasks={runningAutoTasks}
 *   pipelineConfig={pipelineConfig}
 *   onAddFeature={handleAddFeature}
 * />
 * ```
 */
export const ListView = memo(function ListView({
  columnFeaturesMap,
  allFeatures,
  sortConfig,
  onSortChange,
  actionHandlers,
  runningAutoTasks,
  pipelineConfig = null,
  onAddFeature,
  isSelectionMode = false,
  selectedFeatureIds = EMPTY_SET,
  onToggleFeatureSelection,
  onRowClick,
  showAllProjects = false,
  getProjectDefaultBranch,
  className,
  singleColumnMode = false,
  activeStatusTab,
  activeStatusTabs,
}: ListViewProps) {
  // Get keyboard shortcut for add feature
  const keyboardShortcuts = useAppStore((state) => state.keyboardShortcuts);
  const addFeatureShortcut = keyboardShortcuts.addFeature || 'N';

  // Scroll container ref for the virtualizer
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Track collapsed state for each status group
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Track collapsed state for category sub-groups within status groups
  // Key format: "statusId:category"
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Track collapsed state for project groups (multi-project mode)
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  // Group features by project when in multi-project mode
  const projectGroups = useMemo(() => {
    if (!showAllProjects) return [];
    const allFeatures = Object.values(columnFeaturesMap).flat();
    return groupFeaturesByProject(allFeatures);
  }, [showAllProjects, columnFeaturesMap]);

  // Whether we should show project grouping
  const hasMultipleProjects = showAllProjects && projectGroups.length > 0;

  // Generate status groups from columnFeaturesMap
  const statusGroups = useMemo<StatusGroup[]>(() => {
    const allColumns = getColumnsWithPipeline(pipelineConfig);

    // Filter to active column(s) when in single-column mode (supports multi-select)
    const tabs =
      activeStatusTabs && activeStatusTabs.length > 0
        ? activeStatusTabs
        : activeStatusTab
          ? [activeStatusTab]
          : [];
    const columns =
      singleColumnMode && tabs.length > 0
        ? allColumns.filter((col) => tabs.includes(col.id))
        : allColumns;

    const groups: StatusGroup[] = [];

    for (const column of columns) {
      const features = columnFeaturesMap[column.id] || [];
      if (features.length > 0) {
        // Sort features within the group according to current sort config
        const sortedFeatures = sortFeatures(features, sortConfig.column, sortConfig.direction);

        groups.push({
          id: column.id as FeatureStatusWithPipeline,
          title: column.title,
          colorClass: column.colorClass,
          features: sortedFeatures,
        });
      }
    }

    // Sort groups by status order
    return groups.sort((a, b) => getStatusOrder(a.id) - getStatusOrder(b.id));
  }, [
    columnFeaturesMap,
    pipelineConfig,
    sortConfig,
    singleColumnMode,
    activeStatusTab,
    activeStatusTabs,
  ]);

  // Calculate total feature count
  const totalFeatures = useMemo(
    () => statusGroups.reduce((sum, group) => sum + group.features.length, 0),
    [statusGroups]
  );

  // ---------------------------------------------------------------------------
  // Helper: build flat virtual items for a set of features grouped by status,
  // then by category. Used both in single-project and multi-project modes.
  // ---------------------------------------------------------------------------
  const buildStatusItems = useCallback(
    (features: Feature[], opts: { inProject: boolean; keyPrefix: string }): VirtualListItem[] => {
      const items: VirtualListItem[] = [];
      const allColumns = getColumnsWithPipeline(pipelineConfig);

      // Filter to active column(s) when in single-column mode
      const tabs =
        activeStatusTabs && activeStatusTabs.length > 0
          ? activeStatusTabs
          : activeStatusTab
            ? [activeStatusTab]
            : [];
      const columns =
        singleColumnMode && tabs.length > 0
          ? allColumns.filter((col) => tabs.includes(col.id))
          : allColumns;

      // Build a column features map from the given features
      const colMap: Record<string, Feature[]> = {};
      for (const f of features) {
        const status = f.status || 'backlog';
        if (!colMap[status]) colMap[status] = [];
        colMap[status].push(f);
      }

      // Build status groups in column order
      const groups: StatusGroup[] = [];
      for (const column of columns) {
        const colFeatures = colMap[column.id] || [];
        if (colFeatures.length > 0) {
          const sortedFeatures = sortFeatures(colFeatures, sortConfig.column, sortConfig.direction);
          groups.push({
            id: column.id as FeatureStatusWithPipeline,
            title: column.title,
            colorClass: column.colorClass,
            features: sortedFeatures,
          });
        }
      }
      groups.sort((a, b) => getStatusOrder(a.id) - getStatusOrder(b.id));

      for (const group of groups) {
        const groupKey = `${opts.keyPrefix}:${group.id}`;
        const isGroupExpanded = !collapsedGroups.has(groupKey);

        items.push({
          type: 'status-group-header',
          key: `header:${groupKey}`,
          group,
          inProject: opts.inProject,
        });

        if (!isGroupExpanded) continue;

        const categoryGroups = groupFeaturesByCategory(group.features);
        const hasCategories = categoryGroups.length > 0;

        if (!hasCategories) {
          for (const feature of group.features) {
            items.push({
              type: 'feature-row',
              key: `feature:${feature.id}`,
              feature,
              inCategory: false,
              inProject: opts.inProject,
            });
          }
        } else {
          for (const catGroup of categoryGroups) {
            const categoryKey = `${groupKey}:${catGroup.category}`;
            const isCategoryExpanded = !collapsedCategories.has(categoryKey);

            items.push({
              type: 'category-header',
              key: `category:${categoryKey}`,
              statusId: group.id,
              category: catGroup.category,
              count: catGroup.features.length,
              inProject: opts.inProject,
            });

            if (!isCategoryExpanded) continue;

            for (const feature of catGroup.features) {
              items.push({
                type: 'feature-row',
                key: `feature:${feature.id}`,
                feature,
                inCategory: true,
                inProject: opts.inProject,
              });
            }
          }
        }
      }

      return items;
    },
    [
      pipelineConfig,
      sortConfig,
      singleColumnMode,
      activeStatusTab,
      activeStatusTabs,
      collapsedGroups,
      collapsedCategories,
    ]
  );

  // ---------------------------------------------------------------------------
  // Flatten into a single virtual item list.
  // When multiple projects are shown, items are grouped by project first,
  // then by status within each project. Otherwise, grouped by status only.
  // ---------------------------------------------------------------------------
  const virtualItems = useMemo<VirtualListItem[]>(() => {
    if (hasMultipleProjects) {
      // Multi-project mode: Project -> Status -> Category -> Features
      const items: VirtualListItem[] = [];

      for (const projGroup of projectGroups) {
        const isProjectExpanded = !collapsedProjects.has(projGroup.projectName);

        items.push({
          type: 'project-group-header',
          key: `project:${projGroup.projectName}`,
          projectName: projGroup.projectName,
          count: projGroup.features.length,
        });

        if (!isProjectExpanded) continue;

        const statusItems = buildStatusItems(projGroup.features, {
          inProject: true,
          keyPrefix: projGroup.projectName,
        });
        items.push(...statusItems);
      }

      return items;
    }

    // Single-project mode: Status -> Category -> Features (existing behavior)
    const items: VirtualListItem[] = [];

    for (const group of statusGroups) {
      const isGroupExpanded = !collapsedGroups.has(group.id);

      items.push({
        type: 'status-group-header',
        key: `header:${group.id}`,
        group,
        inProject: false,
      });

      if (!isGroupExpanded) continue;

      const categoryGroups = groupFeaturesByCategory(group.features);
      const hasCategories = categoryGroups.length > 0;

      if (!hasCategories) {
        for (const feature of group.features) {
          items.push({
            type: 'feature-row',
            key: `feature:${feature.id}`,
            feature,
            inCategory: false,
            inProject: false,
          });
        }
      } else {
        for (const catGroup of categoryGroups) {
          const categoryKey = `${group.id}:${catGroup.category}`;
          const isCategoryExpanded = !collapsedCategories.has(categoryKey);

          items.push({
            type: 'category-header',
            key: `category:${categoryKey}`,
            statusId: group.id,
            category: catGroup.category,
            count: catGroup.features.length,
            inProject: false,
          });

          if (!isCategoryExpanded) continue;

          for (const feature of catGroup.features) {
            items.push({
              type: 'feature-row',
              key: `feature:${feature.id}`,
              feature,
              inCategory: true,
              inProject: false,
            });
          }
        }
      }
    }

    return items;
  }, [
    hasMultipleProjects,
    projectGroups,
    collapsedProjects,
    buildStatusItems,
    statusGroups,
    collapsedGroups,
    collapsedCategories,
  ]);

  // ---------------------------------------------------------------------------
  // Virtualizer - uses dynamic sizing via measureElement for accurate heights.
  // Follows the same pattern as agent-view/components/message-list.tsx
  // ---------------------------------------------------------------------------
  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      const item = virtualItems[index];
      switch (item.type) {
        case 'project-group-header':
          return ESTIMATE_PROJECT_HEADER;
        case 'status-group-header':
          return ESTIMATE_STATUS_HEADER;
        case 'category-header':
          return ESTIMATE_CATEGORY_HEADER;
        case 'feature-row':
          return ESTIMATE_FEATURE_ROW;
        default:
          return ESTIMATE_FEATURE_ROW;
      }
    },
    overscan: 8,
    getItemKey: (index) => virtualItems[index].key,
  });

  // Toggle project group collapse state
  const toggleProject = useCallback((projectName: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectName)) {
        next.delete(projectName);
      } else {
        next.add(projectName);
      }
      return next;
    });
  }, []);

  // Toggle group collapse state
  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Toggle category sub-group collapse state
  const toggleCategory = useCallback((statusId: string, category: string) => {
    const key = `${statusId}:${category}`;
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Create row action handlers for a feature
  const createHandlers = useCallback(
    (feature: Feature): RowActionHandlers => {
      return createRowActionHandlers(feature.id, {
        editFeature: (id) => {
          const f = allFeatures.find((f) => f.id === id);
          if (f) actionHandlers.onEdit(f);
        },
        deleteFeature: (id) => actionHandlers.onDelete(id),
        viewOutput: actionHandlers.onViewOutput
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onViewOutput?.(f);
            }
          : undefined,
        verifyFeature: actionHandlers.onVerify
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onVerify?.(f);
            }
          : undefined,
        resumeFeature: actionHandlers.onResume
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onResume?.(f);
            }
          : undefined,
        forceStop: actionHandlers.onForceStop
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onForceStop?.(f);
            }
          : undefined,
        manualVerify: actionHandlers.onManualVerify
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onManualVerify?.(f);
            }
          : undefined,
        followUp: actionHandlers.onFollowUp
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onFollowUp?.(f);
            }
          : undefined,
        implement: actionHandlers.onImplement
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onImplement?.(f);
            }
          : undefined,
        viewPlan: actionHandlers.onViewPlan
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onViewPlan?.(f);
            }
          : undefined,
        approvePlan: actionHandlers.onApprovePlan
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onApprovePlan?.(f);
            }
          : undefined,
        spawnTask: actionHandlers.onSpawnTask
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onSpawnTask?.(f);
            }
          : undefined,
      });
    },
    [actionHandlers, allFeatures]
  );

  // Get blocking dependencies for a feature
  const getBlockingDeps = useCallback(
    (feature: Feature): string[] => {
      return getBlockingDependencies(feature, allFeatures);
    },
    [allFeatures]
  );

  // Show empty state if no features
  if (totalFeatures === 0) {
    return (
      <div className={cn('flex flex-col h-full bg-background', className)} data-testid="list-view">
        <EmptyState onAddFeature={onAddFeature} />
      </div>
    );
  }

  return (
    <div
      className={cn('flex flex-col h-full bg-background', className)}
      aria-label="Features list"
      data-testid="list-view"
    >
      {/* Virtualized scroll container */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {/* Inner container sized to the total virtual height */}
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = virtualItems[virtualRow.index];

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {item.type === 'project-group-header' && (
                  <div
                    className="border-b border-border/40"
                    data-testid={`list-project-${item.projectName}`}
                  >
                    <ListProjectGroupHeader
                      projectName={item.projectName}
                      count={item.count}
                      isExpanded={!collapsedProjects.has(item.projectName)}
                      onToggle={() => toggleProject(item.projectName)}
                    />
                  </div>
                )}

                {item.type === 'status-group-header' && (
                  <div
                    className={cn('border-b border-border/30', item.inProject && 'ml-4')}
                    data-testid={`list-group-${item.group.id}`}
                  >
                    <StatusGroupHeader
                      group={item.group}
                      isExpanded={!collapsedGroups.has(item.key.replace('header:', ''))}
                      onToggle={() => toggleGroup(item.key.replace('header:', ''))}
                      inProject={item.inProject}
                    />
                  </div>
                )}

                {item.type === 'category-header' && (
                  <div
                    className={cn('px-2 pt-1', item.inProject && 'ml-4')}
                    data-testid={`list-category-group-${item.statusId}-${item.category}`}
                  >
                    <CategorySubGroupHeader
                      category={item.category}
                      count={item.count}
                      isExpanded={!collapsedCategories.has(item.key.replace('category:', ''))}
                      onToggle={() => {
                        const catKey = item.key.replace('category:', '');
                        setCollapsedCategories((prev) => {
                          const next = new Set(prev);
                          if (next.has(catKey)) {
                            next.delete(catKey);
                          } else {
                            next.add(catKey);
                          }
                          return next;
                        });
                      }}
                    />
                  </div>
                )}

                {item.type === 'feature-row' && (
                  <div
                    className={cn(
                      'px-2 py-1',
                      item.inCategory && !item.inProject && 'pl-7',
                      item.inProject && !item.inCategory && 'ml-4',
                      item.inProject && item.inCategory && 'ml-4 pl-7'
                    )}
                  >
                    <ListRow
                      feature={item.feature}
                      handlers={createHandlers(item.feature)}
                      isCurrentAutoTask={runningAutoTasks.includes(item.feature.id)}
                      isSelected={selectedFeatureIds.has(item.feature.id)}
                      showCheckbox={isSelectionMode}
                      onToggleSelect={() => onToggleFeatureSelection?.(item.feature.id)}
                      onClick={() => onRowClick?.(item.feature)}
                      onToggleFavorite={
                        actionHandlers.onToggleFavorite
                          ? () => actionHandlers.onToggleFavorite?.(item.feature)
                          : undefined
                      }
                      blockingDependencies={getBlockingDeps(item.feature)}
                      showAllProjects={showAllProjects}
                      projectDefaultBranch={getProjectDefaultBranch?.(
                        item.feature.projectId as string
                      )}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer with Add Feature button */}
      {onAddFeature && (
        <div className="border-t border-border px-4 py-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onAddFeature}
                className="w-full sm:w-auto"
                data-testid="list-view-add-feature"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Feature
                <span className="ml-2 text-[10px] font-mono opacity-70 bg-muted px-1.5 py-0.5 rounded">
                  {formatShortcut(addFeatureShortcut, true)}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Add a new feature to the backlog ({formatShortcut(addFeatureShortcut, true)})</p>
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
});

/**
 * Helper to get all features from the columnFeaturesMap as a flat array
 */
export function getFlatFeatures(columnFeaturesMap: Record<string, Feature[]>): Feature[] {
  return Object.values(columnFeaturesMap).flat();
}

/**
 * Helper to count total features across all groups
 */
export function getTotalFeatureCount(columnFeaturesMap: Record<string, Feature[]>): number {
  return Object.values(columnFeaturesMap).reduce((sum, features) => sum + features.length, 0);
}
