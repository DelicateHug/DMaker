import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { FeatureCardSkeleton } from './kanban-card/feature-card-skeleton';
import { COLUMNS, getColumnsWithPipeline, type Column } from '../constants';
import type { PipelineConfig } from '@automaker/types';

/**
 * Shimmer placeholder block for column header elements.
 */
function ShimmerBlock({ className }: { className?: string }) {
  return <div className={cn('rounded-md bg-muted/40 animate-pulse', className)} />;
}

/**
 * A single skeleton column that mirrors the KanbanColumn layout.
 * Renders a column header (dot, title shimmer, count shimmer) and
 * a configurable number of FeatureCardSkeleton cards.
 */
function SkeletonColumn({
  column,
  cardCount,
  width,
  showBorder = true,
}: {
  column: Column;
  cardCount: number;
  width?: number;
  showBorder?: boolean;
}) {
  const containerStyle: React.CSSProperties = width
    ? { width: `${width}px`, flexShrink: 0, flexGrow: 0 }
    : { flex: '1 1 280px', minWidth: '240px' };

  return (
    <div
      className="relative flex flex-col h-full bg-transparent"
      style={containerStyle}
      data-testid={`skeleton-column-${column.id}`}
    >
      {/* Column Header — mirrors KanbanColumn header */}
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-1.5',
          showBorder && 'border-b border-border/40'
        )}
      >
        <div className={cn('w-2 h-2 rounded-full shrink-0', column.colorClass)} />
        <h3 className="font-semibold text-sm text-foreground/90 flex-1 tracking-tight truncate">
          {column.title}
        </h3>
        <ShimmerBlock className="h-5 w-6 rounded-md" />
      </div>

      {/* Column Content — skeleton cards */}
      <div className="flex-1 overflow-hidden px-1.5 py-1.5 space-y-2">
        {Array.from({ length: cardCount }).map((_, i) => (
          <FeatureCardSkeleton key={`${column.id}-skeleton-${i}`} />
        ))}
      </div>
    </div>
  );
}

interface BoardSkeletonProps {
  /** Pipeline config to generate the correct column set */
  pipelineConfig?: PipelineConfig | null;
  /** Column width in pixels (from useResponsiveKanban) */
  columnWidth?: number;
  /** Whether to show column borders */
  showBorder?: boolean;
  /** Background image style to match the real board */
  backgroundImageStyle?: React.CSSProperties;
  /** Additional className */
  className?: string;
  /** When true, only show the column matching activeStatusTab */
  singleColumnMode?: boolean;
  /** The currently active status tab ID for single-column filtering */
  activeStatusTab?: string;
}

/**
 * Number of skeleton cards to show per column type.
 * Backlog shows more cards since it typically has the most features.
 */
const SKELETON_CARD_COUNTS: Record<string, number> = {
  backlog: 3,
  in_progress: 2,
  waiting_approval: 1,
};
const DEFAULT_SKELETON_CARD_COUNT = 1;

/**
 * BoardSkeleton - Progressive loading skeleton for the Kanban board.
 *
 * Renders skeleton columns with shimmer cards that match the real board layout.
 * Used as a replacement for the full-screen loading overlay during project
 * switches and initial loads, providing a smoother perceived loading experience.
 */
export const BoardSkeleton = memo(function BoardSkeleton({
  pipelineConfig,
  columnWidth,
  showBorder = true,
  backgroundImageStyle,
  className,
  singleColumnMode = false,
  activeStatusTab,
}: BoardSkeletonProps) {
  const allColumns = useMemo(
    () => getColumnsWithPipeline(pipelineConfig ?? null),
    [pipelineConfig]
  );

  // Respect single-column mode so the skeleton matches the user's active view
  const columns = useMemo(() => {
    if (singleColumnMode && activeStatusTab) {
      const match = allColumns.find((col) => col.id === activeStatusTab);
      return match ? [match] : allColumns;
    }
    return allColumns;
  }, [allColumns, singleColumnMode, activeStatusTab]);

  return (
    <div
      className={cn(
        'flex-1 overflow-hidden relative h-full',
        'animate-in fade-in duration-300',
        className
      )}
      style={backgroundImageStyle}
      data-testid="board-skeleton"
    >
      <div className="h-full overflow-x-auto py-2 flex gap-0">
        {columns.map((column) => {
          const cardCount = SKELETON_CARD_COUNTS[column.id] ?? DEFAULT_SKELETON_CARD_COUNT;
          return (
            <SkeletonColumn
              key={column.id}
              column={column}
              cardCount={cardCount}
              width={columnWidth}
              showBorder={showBorder}
            />
          );
        })}
      </div>
    </div>
  );
});
