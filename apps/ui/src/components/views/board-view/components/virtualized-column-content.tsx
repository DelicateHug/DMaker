import { memo, useCallback, useMemo, type ReactNode } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useVirtualizedColumn, VIRTUALIZATION_THRESHOLD } from '../hooks/use-virtualized-column';
import { KanbanColumn } from './kanban-column';
import { KanbanCard } from './kanban-card/kanban-card';
import { EmptyStateCard } from './empty-state-card';
import {
  CategoryGroup,
  ProjectGroup,
  groupFeaturesByCategory,
  groupFeaturesByProject,
} from './category-group';
import type { Feature } from '@/store/app-store';
import type { KanbanColumnVirtualization } from './kanban-column';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Props forwarded for rendering each KanbanCard */
export interface CardRenderProps {
  onEdit: (feature: Feature) => void;
  onDelete: (featureId: string) => void;
  onViewOutput: (feature: Feature) => void;
  onVerify: (feature: Feature) => void;
  onResume: (feature: Feature) => void;
  onForceStop: (feature: Feature) => void;
  onManualVerify: (feature: Feature) => void;
  onMoveBackToInProgress: (feature: Feature) => void;
  onMoveBackToBacklog: (feature: Feature) => void;
  onFollowUp: (feature: Feature) => void;
  onImplement: (feature: Feature) => void;
  onViewPlan: (feature: Feature) => void;
  onApprovePlan: (feature: Feature) => void;
  onSpawnTask?: (feature: Feature) => void;
  onToggleFavorite?: (feature: Feature) => void;
  featuresWithContext: Set<string>;
  runningAutoTasks: string[];
  backgroundSettings: {
    cardOpacity: number;
    cardGlassmorphism: boolean;
    cardBorderEnabled: boolean;
    cardBorderOpacity: number;
  };
  isSelectionMode: boolean;
  selectionTarget: 'backlog' | 'waiting_approval' | null;
  selectedFeatureIds: Set<string>;
  onToggleFeatureSelection?: (featureId: string) => void;
  showAllProjects: boolean;
  getProjectDefaultBranch?: (projectId: string) => string | undefined;
  isFullyLoaded: boolean;
}

export interface VirtualizedColumnContentProps {
  /** Column metadata */
  columnId: string;
  columnTitle: string;
  columnColorClass: string;
  isPipelineStep?: boolean;
  /** Features in this column */
  features: Feature[];
  /** Column display props */
  width?: number;
  opacity?: number;
  showBorder?: boolean;
  hideScrollbar?: boolean;
  headerAction?: ReactNode;
  footerAction?: ReactNode;
  /** Card rendering props */
  cardProps: CardRenderProps;
  /**
   * Optional render function supplied by the parent (kanban-board) to render a
   * single feature card.  When provided this is used instead of the default
   * internal `renderCard` implementation, allowing the board to fully control
   * how items are rendered inside virtualized (and non-virtualized) columns.
   */
  renderItem?: (feature: Feature, columnId: string, globalIndex: number) => ReactNode;
  /** Empty state props */
  isDragging: boolean;
  isReadOnly: boolean;
  addFeatureShortcut: string;
  onAiSuggest?: () => void;
  /** Category collapse state */
  collapsedCategories: Set<string>;
  onToggleCategory: (columnId: string, category: string) => void;
  /** Project collapse state (multi-project mode) */
  collapsedProjects?: Set<string>;
  onToggleProject?: (columnId: string, projectName: string) => void;
}

// ---------------------------------------------------------------------------
// Flat virtual item types for virtualized columns with categories/projects
// ---------------------------------------------------------------------------

interface VirtualProjectHeader {
  type: 'project-header';
  key: string;
  projectName: string;
  featureCount: number;
}

interface VirtualCategoryHeader {
  type: 'category-header';
  key: string;
  category: string;
  featureCount: number;
}

interface VirtualFeatureCard {
  type: 'feature-card';
  key: string;
  feature: Feature;
  globalIndex: number;
}

type VirtualFlatItem = VirtualProjectHeader | VirtualCategoryHeader | VirtualFeatureCard;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Wraps a single Kanban column's content with optional threshold-based
 * virtualization.  When the feature count is below VIRTUALIZATION_THRESHOLD
 * the column renders normally.  Above the threshold, items are rendered via
 * `useVirtualizer` while the full ID list is always passed to
 * `<SortableContext>` so drag-drop continues to work.
 */
export const VirtualizedColumnContent = memo(function VirtualizedColumnContent({
  columnId,
  columnTitle,
  columnColorClass,
  isPipelineStep,
  features,
  width,
  opacity,
  showBorder,
  hideScrollbar,
  headerAction,
  footerAction,
  cardProps,
  renderItem: externalRenderItem,
  isDragging,
  isReadOnly,
  addFeatureShortcut,
  onAiSuggest,
  collapsedCategories,
  onToggleCategory,
  collapsedProjects,
  onToggleProject,
}: VirtualizedColumnContentProps) {
  // Whether project grouping is active for this column
  const projectGroups = useMemo(() => {
    if (!collapsedProjects || !onToggleProject) return [];
    return groupFeaturesByProject(features);
  }, [features, collapsedProjects, onToggleProject]);
  const hasProjectGrouping = projectGroups.length > 0;
  // -----------------------------------------------------------------------
  // Virtualization hook – decides per-column whether to virtualize
  // -----------------------------------------------------------------------
  const { isVirtualized, scrollContainerRef, virtualizer, totalSize, measureElement } =
    useVirtualizedColumn({
      features,
      threshold: VIRTUALIZATION_THRESHOLD,
    });

  // -----------------------------------------------------------------------
  // Build flat virtual item list (used when virtualized)
  // -----------------------------------------------------------------------
  /** Build flat items for a subset of features (with optional category grouping) */
  const buildFlatItemsForFeatures = useCallback(
    (
      featureSubset: Feature[],
      startIndex: number
    ): { items: VirtualFlatItem[]; nextIndex: number } => {
      const items: VirtualFlatItem[] = [];
      let globalIndex = startIndex;

      const categoryGroups = groupFeaturesByCategory(featureSubset);

      if (categoryGroups.length === 0) {
        for (const feature of featureSubset) {
          items.push({
            type: 'feature-card',
            key: `card:${feature.id}`,
            feature,
            globalIndex: globalIndex++,
          });
        }
      } else {
        for (const group of categoryGroups) {
          const categoryKey = `${columnId}:${group.category}`;
          const isExpanded = !collapsedCategories.has(categoryKey);

          items.push({
            type: 'category-header',
            key: `cat:${categoryKey}`,
            category: group.category,
            featureCount: group.features.length,
          });

          if (isExpanded) {
            for (const feature of group.features) {
              items.push({
                type: 'feature-card',
                key: `card:${feature.id}`,
                feature,
                globalIndex: globalIndex++,
              });
            }
          }
        }
      }

      return { items, nextIndex: globalIndex };
    },
    [columnId, collapsedCategories]
  );

  const flatItems = useMemo<VirtualFlatItem[]>(() => {
    if (!isVirtualized) return [];

    // Multi-project mode: group by project first, then by category within each project
    if (hasProjectGrouping && collapsedProjects) {
      const items: VirtualFlatItem[] = [];
      let globalIndex = 0;

      for (const projGroup of projectGroups) {
        const projectKey = `${columnId}:${projGroup.projectName}`;
        const isProjectExpanded = !collapsedProjects.has(projectKey);

        items.push({
          type: 'project-header',
          key: `proj:${projectKey}`,
          projectName: projGroup.projectName,
          featureCount: projGroup.features.length,
        });

        if (isProjectExpanded) {
          const { items: subItems, nextIndex } = buildFlatItemsForFeatures(
            projGroup.features,
            globalIndex
          );
          items.push(...subItems);
          globalIndex = nextIndex;
        }
      }

      return items;
    }

    // Single-project mode: just category grouping
    const { items } = buildFlatItemsForFeatures(features, 0);
    return items;
  }, [
    isVirtualized,
    features,
    collapsedCategories,
    columnId,
    hasProjectGrouping,
    projectGroups,
    collapsedProjects,
    buildFlatItemsForFeatures,
  ]);

  // -----------------------------------------------------------------------
  // Render a single KanbanCard (shared between virtualized & normal paths)
  //
  // When an external `renderItem` is provided by the parent (kanban-board)
  // we delegate to it.  Otherwise we fall back to the default implementation
  // that builds a <KanbanCard> from `cardProps`.
  // -----------------------------------------------------------------------
  const defaultRenderCard = useCallback(
    (feature: Feature, _columnId: string, globalIndex: number) => {
      const {
        onEdit,
        onDelete,
        onViewOutput,
        onVerify,
        onResume,
        onForceStop,
        onManualVerify,
        onMoveBackToInProgress,
        onMoveBackToBacklog,
        onFollowUp,
        onImplement,
        onViewPlan,
        onApprovePlan,
        onSpawnTask,
        onToggleFavorite,
        featuresWithContext,
        runningAutoTasks,
        backgroundSettings,
        isSelectionMode,
        selectionTarget,
        selectedFeatureIds,
        onToggleFeatureSelection,
        showAllProjects,
        getProjectDefaultBranch,
        isFullyLoaded,
      } = cardProps;

      let shortcutKey: string | undefined;
      if (_columnId === 'in_progress' && globalIndex < 10) {
        shortcutKey = globalIndex === 9 ? '0' : String(globalIndex + 1);
      }

      return (
        <KanbanCard
          key={feature.id}
          feature={feature}
          onEdit={() => onEdit(feature)}
          onDelete={() => onDelete(feature.id)}
          onViewOutput={() => onViewOutput(feature)}
          onVerify={() => onVerify(feature)}
          onResume={() => onResume(feature)}
          onForceStop={() => onForceStop(feature)}
          onManualVerify={() => onManualVerify(feature)}
          onMoveBackToInProgress={() => onMoveBackToInProgress(feature)}
          onMoveBackToBacklog={() => onMoveBackToBacklog(feature)}
          onFollowUp={() => onFollowUp(feature)}
          onImplement={() => onImplement(feature)}
          onViewPlan={() => onViewPlan(feature)}
          onApprovePlan={() => onApprovePlan(feature)}
          onSpawnTask={() => onSpawnTask?.(feature)}
          onToggleFavorite={() => onToggleFavorite?.(feature)}
          hasContext={featuresWithContext.has(feature.id)}
          isCurrentAutoTask={runningAutoTasks.includes(feature.id)}
          shortcutKey={shortcutKey}
          opacity={backgroundSettings.cardOpacity}
          glassmorphism={backgroundSettings.cardGlassmorphism}
          cardBorderEnabled={backgroundSettings.cardBorderEnabled}
          cardBorderOpacity={backgroundSettings.cardBorderOpacity}
          isSelectionMode={isSelectionMode}
          selectionTarget={selectionTarget}
          isSelected={selectedFeatureIds.has(feature.id)}
          onToggleSelect={() => onToggleFeatureSelection?.(feature.id)}
          showAllProjects={showAllProjects}
          projectDefaultBranch={getProjectDefaultBranch?.(feature.projectId as string)}
          isFullyLoaded={isFullyLoaded}
        />
      );
    },
    [cardProps]
  );

  // Use the external render function when provided, otherwise fall back to default
  const renderCard = useCallback(
    (feature: Feature, globalIndex: number) => {
      if (externalRenderItem) {
        return externalRenderItem(feature, columnId, globalIndex);
      }
      return defaultRenderCard(feature, columnId, globalIndex);
    },
    [externalRenderItem, defaultRenderCard, columnId]
  );

  // -----------------------------------------------------------------------
  // Render callback for virtualized items
  // -----------------------------------------------------------------------
  const renderVirtualItem = useCallback(
    (index: number): ReactNode => {
      const item = flatItems[index];
      if (!item) return null;

      if (item.type === 'project-header') {
        const projectKey = `${columnId}:${item.projectName}`;
        return (
          <div className="pb-1">
            <ProjectGroup
              projectName={item.projectName}
              isExpanded={!collapsedProjects?.has(projectKey)}
              onToggle={(name) => onToggleProject?.(columnId, name)}
              featureCount={item.featureCount}
            >
              <></>
            </ProjectGroup>
          </div>
        );
      }

      if (item.type === 'category-header') {
        return (
          <div className="pb-1">
            <CategoryGroup
              category={item.category}
              isExpanded={!collapsedCategories.has(`${columnId}:${item.category}`)}
              onToggle={(cat) => onToggleCategory(columnId, cat)}
              featureCount={item.featureCount}
            >
              {/* Children not rendered here – cards appear as separate virtual items */}
              <></>
            </CategoryGroup>
          </div>
        );
      }

      // feature-card
      return <div className="pb-2">{renderCard(item.feature, item.globalIndex)}</div>;
    },
    [
      flatItems,
      collapsedCategories,
      collapsedProjects,
      columnId,
      onToggleCategory,
      onToggleProject,
      renderCard,
    ]
  );

  // -----------------------------------------------------------------------
  // Build virtualization prop for KanbanColumn
  // -----------------------------------------------------------------------
  const virtualizationProp = useMemo<KanbanColumnVirtualization | undefined>(() => {
    if (!isVirtualized || !virtualizer) return undefined;
    return {
      isVirtualized: true,
      scrollContainerRef,
      virtualizer,
      totalSize,
      measureElement,
      renderVirtualItem,
    };
  }, [
    isVirtualized,
    virtualizer,
    scrollContainerRef,
    totalSize,
    measureElement,
    renderVirtualItem,
  ]);

  // -----------------------------------------------------------------------
  // Render features with optional category grouping (helper for normal path)
  // -----------------------------------------------------------------------
  const renderFeaturesWithCategories = (
    featureSubset: Feature[],
    startIndex: { current: number }
  ) => {
    const categoryGroups = groupFeaturesByCategory(featureSubset);

    if (categoryGroups.length === 0) {
      return featureSubset.map((feature) => renderCard(feature, startIndex.current++));
    }

    return categoryGroups.map((group) => {
      const categoryKey = `${columnId}:${group.category}`;
      const isExpanded = !collapsedCategories.has(categoryKey);
      return (
        <CategoryGroup
          key={group.category}
          category={group.category}
          isExpanded={isExpanded}
          onToggle={(cat) => onToggleCategory(columnId, cat)}
          featureCount={group.features.length}
        >
          {isExpanded && group.features.map((feature) => renderCard(feature, startIndex.current++))}
        </CategoryGroup>
      );
    });
  };

  // -----------------------------------------------------------------------
  // Normal (non-virtualized) children
  // -----------------------------------------------------------------------
  const renderNormalChildren = () => {
    const globalIndex = { current: 0 };

    // Multi-project mode: group by project first
    if (hasProjectGrouping && collapsedProjects && onToggleProject) {
      return projectGroups.map((projGroup) => {
        const projectKey = `${columnId}:${projGroup.projectName}`;
        const isExpanded = !collapsedProjects.has(projectKey);
        return (
          <ProjectGroup
            key={projGroup.projectName}
            projectName={projGroup.projectName}
            isExpanded={isExpanded}
            onToggle={(name) => onToggleProject(columnId, name)}
            featureCount={projGroup.features.length}
          >
            {isExpanded && renderFeaturesWithCategories(projGroup.features, globalIndex)}
          </ProjectGroup>
        );
      });
    }

    // Single project: just category grouping
    return renderFeaturesWithCategories(features, globalIndex);
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <KanbanColumn
      id={columnId}
      title={columnTitle}
      colorClass={columnColorClass}
      count={features.length}
      width={width}
      opacity={opacity}
      showBorder={showBorder}
      hideScrollbar={hideScrollbar}
      headerAction={headerAction}
      footerAction={footerAction}
      virtualization={virtualizationProp}
    >
      <SortableContext items={features.map((f) => f.id)} strategy={verticalListSortingStrategy}>
        {/* Empty state */}
        {features.length === 0 && !isDragging && (
          <EmptyStateCard
            columnId={columnId}
            columnTitle={columnTitle}
            addFeatureShortcut={addFeatureShortcut}
            isReadOnly={isReadOnly}
            onAiSuggest={columnId === 'backlog' ? onAiSuggest : undefined}
            opacity={cardProps.backgroundSettings.cardOpacity}
            glassmorphism={cardProps.backgroundSettings.cardGlassmorphism}
            customConfig={
              isPipelineStep
                ? {
                    title: `${columnTitle} Empty`,
                    description: `Features will appear here during the ${columnTitle.toLowerCase()} phase of the pipeline.`,
                  }
                : undefined
            }
          />
        )}

        {/* Cards (rendered normally – NOT virtualized path) */}
        {!isVirtualized && renderNormalChildren()}
      </SortableContext>
    </KanbanColumn>
  );
});
