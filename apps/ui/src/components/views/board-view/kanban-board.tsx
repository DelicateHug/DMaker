import { useMemo, useState, useCallback, type ReactNode } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KanbanCard } from './components';
import { VirtualizedColumnContent } from './components/virtualized-column-content';
import { Feature, useAppStore, formatShortcut } from '@/store/app-store';
import { Settings2, CheckSquare, GripVertical, Plus } from 'lucide-react';
import { useResponsiveKanban } from '@/hooks/use-responsive-kanban';
import { getColumnsWithPipeline, type ColumnId } from './constants';
import type { PipelineConfig } from '@automaker/types';
import { cn } from '@/lib/utils';
import type { StatusTabId } from './hooks/use-board-status-tabs';
interface KanbanBoardProps {
  sensors: any;
  collisionDetectionStrategy: (args: any) => any;
  onDragStart: (event: any) => void;
  onDragEnd: (event: any) => void;
  activeFeature: Feature | null;
  getColumnFeatures: (columnId: ColumnId) => Feature[];
  backgroundImageStyle: React.CSSProperties;
  backgroundSettings: {
    columnOpacity: number;
    columnBorderEnabled: boolean;
    hideScrollbar: boolean;
    cardOpacity: number;
    cardGlassmorphism: boolean;
    cardBorderEnabled: boolean;
    cardBorderOpacity: number;
  };
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
  onCompleteAllWaiting: () => void;
  onAddFeature: () => void;
  pipelineConfig: PipelineConfig | null;
  onOpenPipelineSettings?: () => void;
  // Selection mode props
  isSelectionMode?: boolean;
  selectionTarget?: 'backlog' | 'waiting_approval' | null;
  selectedFeatureIds?: Set<string>;
  onToggleFeatureSelection?: (featureId: string) => void;
  onToggleSelectionMode?: (target?: 'backlog' | 'waiting_approval') => void;
  // Empty state action props
  onAiSuggest?: () => void;
  /** Whether currently dragging (hides empty states during drag) */
  isDragging?: boolean;
  /** Whether the board is in read-only mode */
  isReadOnly?: boolean;
  /** Additional className for custom styling (e.g., transition classes) */
  className?: string;
  /** Whether full feature data has been loaded (Phase 2 complete).
   *  When false, features only contain summary data and cards show skeleton placeholders. */
  isFullyLoaded?: boolean;
  // Single-column mode props
  /** When true, only display the column(s) matching active status tab(s) */
  singleColumnMode?: boolean;
  /** The primary active status tab ID (backward-compatible) */
  activeStatusTab?: StatusTabId;
  /** Active status tab IDs for multi-select column filtering */
  activeStatusTabs?: StatusTabId[];
  // All-projects mode props
  /** When true, board is showing features from all projects */
  showAllProjects?: boolean;
  /** Lookup function to get a project's default branch by projectId */
  getProjectDefaultBranch?: (projectId: string) => string | undefined;
  /** GitHub username of the current Automaker user (for claim badge display) */
  currentGitHubUser?: string | null;
}

export function KanbanBoard({
  sensors,
  collisionDetectionStrategy,
  onDragStart,
  onDragEnd,
  activeFeature,
  getColumnFeatures,
  backgroundImageStyle,
  backgroundSettings,
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
  onCompleteAllWaiting,
  onAddFeature,
  pipelineConfig,
  onOpenPipelineSettings,
  isSelectionMode = false,
  selectionTarget = null,
  selectedFeatureIds = new Set(),
  onToggleFeatureSelection,
  onToggleSelectionMode,
  onAiSuggest,
  isDragging = false,
  isReadOnly = false,
  className,
  isFullyLoaded = true,
  singleColumnMode = false,
  activeStatusTab,
  activeStatusTabs,
  showAllProjects = false,
  getProjectDefaultBranch,
  currentGitHubUser,
}: KanbanBoardProps) {
  // Generate columns including pipeline steps
  const allColumns = useMemo(() => getColumnsWithPipeline(pipelineConfig), [pipelineConfig]);

  // Filter to active column(s) when in single-column mode (supports multi-select)
  const columns = useMemo(() => {
    if (!singleColumnMode) return allColumns;
    // Multi-select: filter columns matching any active tab
    const tabs =
      activeStatusTabs && activeStatusTabs.length > 0
        ? activeStatusTabs
        : activeStatusTab
          ? [activeStatusTab]
          : [];
    if (tabs.length === 0) return allColumns;
    const filtered = allColumns.filter((col) => tabs.includes(col.id));
    return filtered.length > 0 ? filtered : allColumns;
  }, [allColumns, singleColumnMode, activeStatusTab, activeStatusTabs]);

  // Get the keyboard shortcut for adding features
  const keyboardShortcuts = useAppStore((state) => state.keyboardShortcuts);
  const addFeatureShortcut = keyboardShortcuts.addFeature || 'N';

  // Use responsive column widths based on window size
  // containerStyle handles centering and ensures columns fit without horizontal scroll in Electron
  // For single-column mode, pass allColumns.length to calculate width as if all columns existed,
  // then we can apply special styling for the single column
  const { columnWidth, containerStyle, singleColumnWidth, singleColumnContainerStyle } =
    useResponsiveKanban(singleColumnMode ? allColumns.length : columns.length);

  // Use the appropriate container style based on mode
  const effectiveContainerStyle = singleColumnMode ? singleColumnContainerStyle : containerStyle;

  // Track collapsed category groups across all columns
  // Key format: "columnId:category"
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = useCallback((columnId: string, category: string) => {
    const key = `${columnId}:${category}`;
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

  // Track collapsed project groups across all columns (multi-project mode)
  // Key format: "columnId:projectName"
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  const toggleProject = useCallback((columnId: string, projectName: string) => {
    const key = `${columnId}:${projectName}`;
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Memoize card rendering props to avoid unnecessary re-renders
  const cardProps = useMemo(
    () => ({
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
      backgroundSettings: {
        cardOpacity: backgroundSettings.cardOpacity,
        cardGlassmorphism: backgroundSettings.cardGlassmorphism,
        cardBorderEnabled: backgroundSettings.cardBorderEnabled,
        cardBorderOpacity: backgroundSettings.cardBorderOpacity,
      },
      isSelectionMode,
      selectionTarget,
      selectedFeatureIds,
      onToggleFeatureSelection,
      showAllProjects,
      getProjectDefaultBranch,
      isFullyLoaded,
    }),
    [
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
      backgroundSettings.cardOpacity,
      backgroundSettings.cardGlassmorphism,
      backgroundSettings.cardBorderEnabled,
      backgroundSettings.cardBorderOpacity,
      isSelectionMode,
      selectionTarget,
      selectedFeatureIds,
      onToggleFeatureSelection,
      showAllProjects,
      getProjectDefaultBranch,
      isFullyLoaded,
    ]
  );

  // ---------------------------------------------------------------------------
  // Board-level render function for individual feature cards.
  //
  // This callback is passed down to VirtualizedColumnContent → KanbanColumn so
  // that the board controls how each item is rendered in both virtualized and
  // non-virtualized columns.  The column ID and global index are provided so the
  // render function can apply column-specific logic (e.g. keyboard shortcuts for
  // in_progress items).
  // ---------------------------------------------------------------------------
  const renderItem = useCallback(
    (feature: Feature, columnId: string, globalIndex: number): ReactNode => {
      let shortcutKey: string | undefined;
      if (columnId === 'in_progress' && globalIndex < 10) {
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
          currentGitHubUser={currentGitHubUser}
        />
      );
    },
    [
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
      backgroundSettings.cardOpacity,
      backgroundSettings.cardGlassmorphism,
      backgroundSettings.cardBorderEnabled,
      backgroundSettings.cardBorderOpacity,
      isSelectionMode,
      selectionTarget,
      selectedFeatureIds,
      onToggleFeatureSelection,
      showAllProjects,
      getProjectDefaultBranch,
      isFullyLoaded,
      currentGitHubUser,
    ]
  );

  return (
    <div
      className={cn(
        'flex-1 overflow-hidden relative h-full',
        'transition-opacity duration-200',
        className
      )}
      style={backgroundImageStyle}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetectionStrategy}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="h-full overflow-x-auto py-2" style={effectiveContainerStyle}>
          {columns.map((column) => {
            const columnFeatures = getColumnFeatures(column.id as ColumnId);
            return (
              <VirtualizedColumnContent
                key={column.id}
                columnId={column.id}
                columnTitle={column.title}
                columnColorClass={column.colorClass}
                isPipelineStep={column.isPipelineStep}
                features={columnFeatures}
                width={singleColumnMode ? singleColumnWidth : columnWidth}
                opacity={backgroundSettings.columnOpacity}
                showBorder={backgroundSettings.columnBorderEnabled}
                hideScrollbar={backgroundSettings.hideScrollbar}
                cardProps={cardProps}
                renderItem={renderItem}
                isDragging={isDragging}
                isReadOnly={isReadOnly}
                addFeatureShortcut={addFeatureShortcut}
                onAiSuggest={onAiSuggest}
                collapsedCategories={collapsedCategories}
                onToggleCategory={toggleCategory}
                collapsedProjects={showAllProjects ? collapsedProjects : undefined}
                onToggleProject={showAllProjects ? toggleProject : undefined}
                headerAction={
                  column.id === 'backlog' ? (
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="default"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={onAddFeature}
                            data-testid="add-feature-button"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Add Feature ({formatShortcut(addFeatureShortcut, true)})</p>
                        </TooltipContent>
                      </Tooltip>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-6 px-2 text-xs ${selectionTarget === 'backlog' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => onToggleSelectionMode?.('backlog')}
                        title={
                          selectionTarget === 'backlog' ? 'Switch to Drag Mode' : 'Select Multiple'
                        }
                        data-testid="selection-mode-button"
                      >
                        {selectionTarget === 'backlog' ? (
                          <>
                            <GripVertical className="w-3.5 h-3.5 mr-1" />
                            Drag
                          </>
                        ) : (
                          <>
                            <CheckSquare className="w-3.5 h-3.5 mr-1" />
                            Select
                          </>
                        )}
                      </Button>
                    </div>
                  ) : column.id === 'waiting_approval' ? (
                    <div className="flex items-center gap-1">
                      {columnFeatures.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={onCompleteAllWaiting}
                          data-testid="complete-all-waiting-button"
                        >
                          Complete All
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-6 px-2 text-xs ${selectionTarget === 'waiting_approval' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => onToggleSelectionMode?.('waiting_approval')}
                        title={
                          selectionTarget === 'waiting_approval'
                            ? 'Switch to Drag Mode'
                            : 'Select Multiple'
                        }
                        data-testid="waiting-approval-selection-mode-button"
                      >
                        {selectionTarget === 'waiting_approval' ? (
                          <>
                            <GripVertical className="w-3.5 h-3.5 mr-1" />
                            Drag
                          </>
                        ) : (
                          <>
                            <CheckSquare className="w-3.5 h-3.5 mr-1" />
                            Select
                          </>
                        )}
                      </Button>
                    </div>
                  ) : column.id === 'in_progress' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      onClick={onOpenPipelineSettings}
                      title="Pipeline Settings"
                      data-testid="pipeline-settings-button"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </Button>
                  ) : column.isPipelineStep ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      onClick={onOpenPipelineSettings}
                      title="Edit Pipeline Step"
                      data-testid="edit-pipeline-step-button"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </Button>
                  ) : undefined
                }
                footerAction={
                  column.id === 'backlog' ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="default"
                          size="sm"
                          className="w-full h-9 text-sm"
                          onClick={onAddFeature}
                          data-testid="add-feature-floating-button"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Feature
                          <span className="ml-auto pl-2 text-[10px] font-mono opacity-70 bg-black/20 px-1.5 py-0.5 rounded">
                            {formatShortcut(addFeatureShortcut, true)}
                          </span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          Add a new feature to the backlog (
                          {formatShortcut(addFeatureShortcut, true)})
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  ) : undefined
                }
              />
            );
          })}
        </div>

        <DragOverlay
          dropAnimation={{
            duration: 200,
            easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
          }}
        >
          {activeFeature && (
            <div style={{ width: `${singleColumnMode ? singleColumnWidth : columnWidth}px` }}>
              <KanbanCard
                feature={activeFeature}
                isOverlay
                onEdit={() => {}}
                onDelete={() => {}}
                onViewOutput={() => {}}
                onVerify={() => {}}
                onResume={() => {}}
                onForceStop={() => {}}
                onManualVerify={() => {}}
                onMoveBackToInProgress={() => {}}
                onMoveBackToBacklog={() => {}}
                onFollowUp={() => {}}
                onImplement={() => {}}
                onViewPlan={() => {}}
                onApprovePlan={() => {}}
                onSpawnTask={() => {}}
                hasContext={featuresWithContext.has(activeFeature.id)}
                isCurrentAutoTask={runningAutoTasks.includes(activeFeature.id)}
                opacity={backgroundSettings.cardOpacity}
                glassmorphism={backgroundSettings.cardGlassmorphism}
                cardBorderEnabled={backgroundSettings.cardBorderEnabled}
                cardBorderOpacity={backgroundSettings.cardBorderOpacity}
                showAllProjects={showAllProjects}
                projectDefaultBranch={getProjectDefaultBranch?.(activeFeature.projectId as string)}
                currentGitHubUser={currentGitHubUser}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
