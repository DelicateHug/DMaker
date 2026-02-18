import { memo, type RefCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

// ---------------------------------------------------------------------------
// Virtualization sub-types
// ---------------------------------------------------------------------------

export interface KanbanColumnVirtualization {
  /** Whether this column is currently virtualized */
  isVirtualized: boolean;
  /** Ref to attach to the scrollable container */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** The virtualizer instance */
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  /** Total virtual height in px */
  totalSize: number;
  /** Ref callback for measuring each virtual item */
  measureElement: ((node: Element | null) => void) | undefined;
  /** Render callback for a single virtual row by its index */
  renderVirtualItem: (index: number) => ReactNode;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface KanbanColumnProps {
  id: string;
  title: string;
  colorClass: string;
  count: number;
  children: ReactNode;
  headerAction?: ReactNode;
  /** Floating action button at the bottom of the column */
  footerAction?: ReactNode;
  /** @deprecated No longer used - column background is now transparent */
  opacity?: number;
  showBorder?: boolean;
  hideScrollbar?: boolean;
  /** Custom width in pixels. If not provided, defaults to 280px */
  width?: number;
  /** Minimum width constraint in pixels */
  minWidth?: number;
  /** Maximum width constraint in pixels */
  maxWidth?: number;
  /** Optional virtualization configuration.
   *  When provided and `isVirtualized` is true the column renders items
   *  via the virtualizer instead of directly rendering children. */
  virtualization?: KanbanColumnVirtualization;
}

export const KanbanColumn = memo(function KanbanColumn({
  id,
  title,
  colorClass,
  count,
  children,
  headerAction,
  footerAction,
  // opacity is deprecated and ignored - column background is now transparent
  opacity: _opacity,
  showBorder = true,
  hideScrollbar = false,
  width,
  minWidth = 240,
  maxWidth,
  virtualization,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  // Use flex-based sizing with min/max constraints for better responsive behavior
  // Width is used as the flex basis, with min/max providing bounds
  const containerStyle: React.CSSProperties = {
    ...(width
      ? {
          width: `${width}px`,
          flexShrink: 0,
          flexGrow: 0,
        }
      : {
          // When no explicit width, use flex to fill available space
          flex: '1 1 280px',
        }),
    minWidth: `${minWidth}px`,
    ...(maxWidth ? { maxWidth: `${maxWidth}px` } : {}),
  };

  const isVirtualized = virtualization?.isVirtualized ?? false;

  // ------------------------------------------------------------------
  // Virtualized content renderer
  // ------------------------------------------------------------------
  const renderVirtualizedContent = () => {
    if (!virtualization || !isVirtualized) return null;

    const { virtualizer, totalSize, measureElement, renderVirtualItem, scrollContainerRef } =
      virtualization;
    const virtualRows = virtualizer.getVirtualItems();

    return (
      <div
        ref={(node) => {
          // Merge the scrollContainerRef with the node
          if (scrollContainerRef && 'current' in scrollContainerRef) {
            (scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }
        }}
        className={cn(
          'flex-1 overflow-y-auto px-1.5 py-1.5',
          hideScrollbar &&
            '[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]',
          'scroll-smooth',
          footerAction && 'pb-12'
        )}
      >
        {/* Inner container sized to the total virtual height */}
        <div
          style={{
            height: `${totalSize}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualRows.map((virtualRow) => (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={measureElement as RefCallback<HTMLDivElement>}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderVirtualItem(virtualRow.index)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative flex flex-col h-full',
        // Only transition ring/shadow for drag-over effect, not width
        'transition-[box-shadow,ring,background-color] duration-200',
        // Simplified background - no floating effect, integrates with container
        isOver ? 'bg-accent/40' : 'bg-transparent',
        isOver && 'ring-2 ring-primary/30'
      )}
      style={containerStyle}
      data-testid={`kanban-column-${id}`}
    >
      {/* Column Header */}
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-1.5',
          showBorder && 'border-b border-border/40'
        )}
      >
        <div className={cn('w-2 h-2 rounded-full shrink-0', colorClass)} />
        <h3 className="font-semibold text-sm text-foreground/90 flex-1 tracking-tight truncate">
          {title}
        </h3>
        {headerAction}
        <span className="text-xs font-medium text-muted-foreground/80 bg-muted/50 px-1.5 py-0.5 rounded-md tabular-nums">
          {count}
        </span>
      </div>

      {/* Column Content - virtualized or normal */}
      {isVirtualized ? (
        renderVirtualizedContent()
      ) : (
        <div
          className={cn(
            'flex-1 overflow-y-auto px-1.5 py-1.5 space-y-2',
            hideScrollbar &&
              '[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]',
            // Smooth scrolling
            'scroll-smooth',
            // Add padding at bottom if there's a footer action
            footerAction && 'pb-12'
          )}
        >
          {children}
        </div>
      )}

      {/* Floating Footer Action */}
      {footerAction && (
        <div className="absolute bottom-0 left-0 right-0 z-10 px-1.5 pb-1.5 bg-gradient-to-t from-background/95 via-background/80 to-transparent pt-5">
          {footerAction}
        </div>
      )}

      {/* Drop zone indicator when dragging over */}
      {isOver && (
        <div className="absolute inset-0 bg-primary/5 pointer-events-none border-2 border-dashed border-primary/20" />
      )}
    </div>
  );
});
