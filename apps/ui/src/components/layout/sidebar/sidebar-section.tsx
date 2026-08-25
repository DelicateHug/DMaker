import type { ComponentType, DragEvent, MouseEvent, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkbenchStore, type SidebarSectionId } from '@/store/workbench-store';

interface SidebarSectionProps {
  id: SidebarSectionId;
  label: string;
  /** Icon shown before the label */
  icon?: ComponentType<{ className?: string }>;
  /** Extra classes for the icon — used to tint it */
  iconClassName?: string;
  /** Extra classes for the label — used to strike out what no longer exists */
  labelClassName?: string;
  /** Count shown next to the label; hidden when zero */
  count?: number;
  /** Action rendered on the right of the header, revealed on hover */
  action?: ReactNode;
  /**
   * Rendered to the left of `action` and never hidden. For state the section
   * has to be able to shout about — a branch that has fallen out of sync
   * cannot wait for you to hover it before it says so.
   */
  status?: ReactNode;
  children: ReactNode;
  /** Rendered in place of children when the section has no items */
  emptyMessage?: string;
  /** Overrides the `count === 0` guess — for sections whose children are not
   *  all counted (the Pinned section renders empty groups, for one) */
  isEmpty?: boolean;
  /** Right-click anywhere in the section (header or body) */
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
  /** Drop handling for the section body */
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
  /** Highlight the body as an active drop target */
  isDropTarget?: boolean;

  /**
   * Drag handling for the header row, which is what a section is grabbed by.
   * Kept separate from the body handlers above: the body is where a *child*
   * lands, the header is the section itself being moved.
   */
  headerDraggable?: boolean;
  onHeaderDragStart?: (event: DragEvent<HTMLElement>) => void;
  onHeaderDragEnd?: (event: DragEvent<HTMLElement>) => void;
  onHeaderDragOver?: (event: DragEvent<HTMLElement>) => void;
  onHeaderDragLeave?: (event: DragEvent<HTMLElement>) => void;
  onHeaderDrop?: (event: DragEvent<HTMLElement>) => void;
  /** Highlight the header as the landing spot for the drag in flight */
  isHeaderDropTarget?: boolean;
  /** Dim the header while this section is the one being dragged */
  isDragging?: boolean;
}

/**
 * A collapsible, labelled group of sidebar rows.
 *
 * Collapse state lives in the workbench store so it survives reloads.
 */
export function SidebarSection({
  id,
  label,
  icon: Icon,
  iconClassName,
  labelClassName,
  count,
  action,
  status,
  children,
  emptyMessage,
  isEmpty: isEmptyOverride,
  onContextMenu,
  onDragOver,
  onDragLeave,
  onDrop,
  isDropTarget,
  headerDraggable,
  onHeaderDragStart,
  onHeaderDragEnd,
  onHeaderDragOver,
  onHeaderDragLeave,
  onHeaderDrop,
  isHeaderDropTarget,
  isDragging,
}: SidebarSectionProps) {
  const isCollapsed = useWorkbenchStore((state) => state.collapsedSections.has(id));
  const toggleSection = useWorkbenchStore((state) => state.toggleSection);

  const isEmpty = isEmptyOverride ?? count === 0;

  return (
    <section
      className="group/section"
      data-testid={`sidebar-section-${id}`}
      onContextMenu={onContextMenu}
    >
      <div
        className={cn(
          'flex items-center gap-1 rounded-md px-2 py-1 transition-colors duration-100',
          isHeaderDropTarget && 'bg-brand-500/15 ring-1 ring-inset ring-brand-500/60',
          isDragging && 'opacity-40'
        )}
        draggable={headerDraggable}
        onDragStart={onHeaderDragStart}
        onDragEnd={onHeaderDragEnd}
        onDragOver={onHeaderDragOver}
        onDragLeave={onHeaderDragLeave}
        onDrop={onHeaderDrop}
        data-testid={`sidebar-section-header-${id}`}
      >
        <button
          type="button"
          onClick={() => toggleSection(id)}
          aria-expanded={!isCollapsed}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1 rounded text-left cursor-pointer',
            'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
            'hover:text-foreground transition-colors duration-100'
          )}
        >
          <ChevronRight
            className={cn(
              'size-3 shrink-0 transition-transform duration-150',
              !isCollapsed && 'rotate-90'
            )}
            aria-hidden="true"
          />
          {Icon && <Icon className={cn('size-3 shrink-0', iconClassName)} />}
          <span className={cn('truncate', labelClassName)}>{label}</span>
          {count !== undefined && count > 0 && (
            <span className="ml-1 shrink-0 font-normal tabular-nums opacity-60">{count}</span>
          )}
        </button>

        {status && <span className="flex shrink-0 items-center">{status}</span>}

        {action && (
          <span className="shrink-0 opacity-0 transition-opacity duration-100 group-hover/section:opacity-100 focus-within:opacity-100">
            {action}
          </span>
        )}
      </div>

      {!isCollapsed && (
        <div
          className={cn(
            'flex flex-col gap-px rounded-md pb-1',
            isDropTarget && 'bg-brand-500/5 ring-1 ring-inset ring-brand-500/30'
          )}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {isEmpty && emptyMessage ? (
            <p className="px-3 py-1.5 text-[11px] leading-relaxed text-muted-foreground/70">
              {emptyMessage}
            </p>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}
