import { useEffect, useRef, useState } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import { ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarGroupHeaderProps {
  /** Group id — exposed on the row so tests and drops can address it */
  groupId: string;
  name: string;
  collapsed: boolean;
  /** Shown on the right; the number of members actually on screen */
  memberCount: number;
  /** Swaps the name for an input, selected so it can be typed straight over */
  isRenaming: boolean;
  /** Highlight as the landing spot for the drag in flight */
  isDropTarget?: boolean;
  /** Dim while this row is the one being dragged */
  isDragging?: boolean;
  /** Extra classes on the folder icon — used to tint it per group kind */
  iconClassName?: string;
  testId?: string;

  onCommitRename: (name: string) => void;
  onCancelRename: () => void;
  onToggle: () => void;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;

  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
}

/**
 * One user-made folder row: folder icon, inline-editable name, member count.
 *
 * Shared by every kind of sidebar grouping — pinned features, projects and
 * branches — so a folder reads and behaves the same wherever it appears.
 */
export function SidebarGroupHeader({
  groupId,
  name,
  collapsed,
  memberCount,
  isRenaming,
  isDropTarget,
  isDragging,
  iconClassName,
  testId = 'sidebar-group',
  onCommitRename,
  onCancelRename,
  onToggle,
  onContextMenu,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: SidebarGroupHeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(name);

  useEffect(() => {
    if (!isRenaming) return;
    setDraft(name);
    // Select the whole name so a fresh group can be typed straight over.
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  }, [isRenaming, name]);

  const commit = () => onCommitRename(draft.trim() || name);

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-md px-2 py-1 transition-colors duration-100',
        'hover:bg-accent/40',
        isDropTarget && 'bg-brand-500/15 ring-1 ring-inset ring-brand-500/60',
        isDragging && 'opacity-40'
      )}
      onContextMenu={onContextMenu}
      // Renaming needs the pointer for text selection, so the row only becomes
      // draggable once the input is gone.
      draggable={draggable && !isRenaming}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-testid={testId}
      data-group-id={groupId}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
      >
        <ChevronRight
          className={cn(
            'size-3 shrink-0 text-muted-foreground transition-transform duration-150',
            !collapsed && 'rotate-90'
          )}
          aria-hidden="true"
        />
        {collapsed ? (
          <Folder
            className={cn('size-3.5 shrink-0 text-amber-400/80', iconClassName)}
            aria-hidden="true"
          />
        ) : (
          <FolderOpen
            className={cn('size-3.5 shrink-0 text-amber-400/80', iconClassName)}
            aria-hidden="true"
          />
        )}
        {isRenaming ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                onCancelRename();
              }
            }}
            className={cn(
              'min-w-0 flex-1 rounded border border-brand-500/60 bg-background px-1',
              'text-[12px] outline-none'
            )}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{name}</span>
        )}
      </button>

      {!isRenaming && (
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground opacity-60">
          {memberCount}
        </span>
      )}
    </div>
  );
}
