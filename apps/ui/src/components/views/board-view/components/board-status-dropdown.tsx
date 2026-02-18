import * as React from 'react';
import { memo, useState, useCallback, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, Minus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { StatusTabId, StatusTab } from '../hooks/use-board-status-tabs';

/** Base (non-deletable) status IDs */
const BASE_STATUS_IDS = new Set<string>([
  'backlog',
  'in_progress',
  'waiting_approval',
  'completed',
  'all',
]);

/** Color options for new statuses */
const STATUS_COLORS = [
  'bg-blue-500/20',
  'bg-purple-500/20',
  'bg-green-500/20',
  'bg-orange-500/20',
  'bg-red-500/20',
  'bg-pink-500/20',
  'bg-cyan-500/20',
  'bg-amber-500/20',
  'bg-indigo-500/20',
];

export interface BoardStatusDropdownProps {
  /** Currently active status tab IDs (multi-select) */
  activeTabs: StatusTabId[];
  /**
   * Callback when the dropdown closes, committing the staged selection.
   * Receives the full array of selected tab IDs.
   */
  onTabChange: (tabIds: StatusTabId[]) => void;
  /** Available status tabs to display */
  tabs: StatusTab[];
  /** Additional CSS classes for the trigger button */
  className?: string;
  /**
   * Optional: Feature counts per tab (keyed by tab ID).
   * When provided, displays a count badge next to each item.
   */
  tabCounts?: Record<string, number>;
  /** Alignment of the dropdown content relative to the trigger */
  align?: 'start' | 'center' | 'end';
  /** Label displayed at the top of the dropdown */
  dropdownLabel?: string;
  /**
   * Callback to create a new custom status (pipeline step).
   * When provided, shows a "New Status" input at the bottom of the dropdown.
   */
  onCreateStatus?: (name: string, colorClass: string) => void;
  /**
   * Callback to delete a custom status (pipeline step).
   * When provided, shows a delete button next to deletable statuses.
   * Only pipeline statuses (not base statuses) can be deleted.
   */
  onDeleteStatus?: (tabId: StatusTabId) => void;
}

/**
 * Color indicator dot for each status, matching the column status color.
 */
function StatusColorDot({ colorClass, size = 'sm' }: { colorClass: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn('rounded-full shrink-0', size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5', colorClass)}
      aria-hidden="true"
    />
  );
}

/**
 * Inline count badge for dropdown items
 */
function InlineCountBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center',
        'min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-medium',
        'bg-foreground/10 text-foreground/70'
      )}
      aria-label={`${count} items`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Visual diff state for a tab between committed (parent) and staged (local) selections.
 * - 'unchanged': tab is either selected in both or deselected in both
 * - 'added': tab is NOT in committed but IS in staged (will be newly selected)
 * - 'removed': tab IS in committed but NOT in staged (will be deselected)
 */
type DiffState = 'unchanged' | 'added' | 'removed';

/**
 * Compute the diff state for a single tab.
 */
function getTabDiffState(
  tabId: StatusTabId,
  committedTabs: StatusTabId[],
  stagedTabs: StatusTabId[]
): DiffState {
  const isCommitted = committedTabs.includes(tabId);
  const isStaged = stagedTabs.includes(tabId);

  if (isCommitted && !isStaged) return 'removed';
  if (!isCommitted && isStaged) return 'added';
  return 'unchanged';
}

/**
 * Checkbox indicator for multi-select dropdown items.
 * Renders a styled checkbox that reflects the staged checked state and
 * shows visual diff cues (green border for added, red border for removed).
 */
function CheckboxIndicator({ checked, diffState }: { checked: boolean; diffState: DiffState }) {
  return (
    <span
      className={cn(
        'flex items-center justify-center shrink-0',
        'w-4 h-4 rounded-sm border transition-colors duration-150',
        // Base states
        checked
          ? 'bg-primary border-primary text-primary-foreground'
          : 'border-muted-foreground/40 bg-transparent',
        // Diff visual cues — subtle ring to show pending change
        diffState === 'added' && 'ring-1 ring-emerald-500/60',
        diffState === 'removed' && 'ring-1 ring-red-500/60'
      )}
      aria-hidden="true"
    >
      {checked && <Check className="w-3 h-3" strokeWidth={3} />}
    </span>
  );
}

/**
 * Small diff badge showing a "+" or "−" indicator for pending changes.
 */
function DiffBadge({ diffState }: { diffState: DiffState }) {
  if (diffState === 'unchanged') return null;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center shrink-0',
        'w-4 h-4 rounded-full text-[10px] font-bold',
        diffState === 'added' && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        diffState === 'removed' && 'bg-red-500/15 text-red-600 dark:text-red-400'
      )}
      aria-label={diffState === 'added' ? 'Will be selected' : 'Will be deselected'}
    >
      {diffState === 'added' ? (
        <Plus className="w-2.5 h-2.5" strokeWidth={3} />
      ) : (
        <Minus className="w-2.5 h-2.5" strokeWidth={3} />
      )}
    </span>
  );
}

/**
 * BoardStatusDropdown – a dropdown-menu variant for switching between board status columns.
 *
 * Maintains internal staged selection state so multiple toggles can be made before
 * committing the final selection to the parent:
 * - On open: copies the current `activeTabs` into local staged state
 * - On item click: toggles the item in the staged state (with "All" deselection logic)
 * - On close (`onOpenChange(false)`): commits staged state to parent via `onTabChange`
 *
 * It integrates with the `useBoardStatusTabs` hook for state management.
 *
 * @example
 * ```tsx
 * const { activeTabs, tabs } = useBoardStatusTabs({
 *   columns: getColumnsWithPipeline(pipelineConfig),
 * });
 *
 * <BoardStatusDropdown
 *   activeTabs={activeTabs}
 *   onTabChange={(tabIds) => { /* commit tabIds *\/ }}
 *   tabs={tabs}
 *   tabCounts={columnCounts}
 * />
 * ```
 */
export const BoardStatusDropdown = memo(function BoardStatusDropdown({
  activeTabs,
  onTabChange,
  tabs,
  className,
  tabCounts,
  align = 'start',
  dropdownLabel = 'Switch Status',
  onCreateStatus,
  onDeleteStatus,
}: BoardStatusDropdownProps) {
  const [open, setOpen] = useState(false);

  // Staged selection state – local copy while dropdown is open
  const [stagedTabs, setStagedTabs] = useState<StatusTabId[]>(activeTabs);

  // Track whether we have uncommitted changes to avoid no-op commits
  const stagedRef = useRef<StatusTabId[]>(activeTabs);

  // New status input state
  const [newStatusName, setNewStatusName] = useState('');
  const [showNewStatusInput, setShowNewStatusInput] = useState(false);
  const newStatusInputRef = useRef<HTMLInputElement>(null);

  // Resolve the primary active tab config for the trigger display
  // Uses the committed (parent) activeTabs for the trigger, not staged
  const primaryTab = activeTabs[0];
  const activeTabConfig = React.useMemo(
    () => tabs.find((t) => t.id === primaryTab),
    [tabs, primaryTab]
  );

  // Compute trigger label for multi-select display
  const triggerLabel = React.useMemo(() => {
    if (activeTabs.length === 0) return 'Status';
    if (activeTabs.includes('all')) return 'All Statuses';
    if (activeTabs.length === 1) {
      return activeTabConfig?.label ?? 'Status';
    }
    // Multiple selections: show first + count
    const firstLabel = activeTabConfig?.label ?? 'Status';
    return `${firstLabel} +${activeTabs.length - 1}`;
  }, [activeTabs, activeTabConfig]);

  // Count existing pipeline steps to pick a color for new ones
  const pipelineStepCount = useMemo(
    () => tabs.filter((t) => !BASE_STATUS_IDS.has(t.id)).length,
    [tabs]
  );

  /**
   * Handle open/close state changes.
   * On open: snapshot current activeTabs into staged state.
   * On close: commit staged state to parent.
   */
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        // Opening: copy current activeTabs to staged state
        setStagedTabs(activeTabs);
        stagedRef.current = activeTabs;
      } else {
        // Closing: commit staged selection to parent
        const staged = stagedRef.current;
        // Only commit if the selection actually changed
        const changed =
          staged.length !== activeTabs.length || staged.some((id) => !activeTabs.includes(id));
        if (changed) {
          onTabChange(staged);
        }
        // Reset new-status input
        setShowNewStatusInput(false);
        setNewStatusName('');
      }
      setOpen(nextOpen);
    },
    [activeTabs, onTabChange]
  );

  /**
   * Toggle a tab in the staged state (with "All" deselection logic).
   * Does NOT close the dropdown — allows multiple toggles before committing.
   */
  const handleToggle = useCallback((tabId: StatusTabId) => {
    setStagedTabs((current) => {
      let next: StatusTabId[];

      // Case 1: Toggling "All" — always results in only ["all"]
      if (tabId === 'all') {
        next = ['all'];
      } else {
        const isCurrentlyActive = current.includes(tabId);

        if (isCurrentlyActive) {
          // Deselecting an active tab
          const remaining = current.filter((id) => id !== tabId);
          // If no tabs remain, fall back to "All"
          next = remaining.length === 0 ? ['all'] : remaining;
        } else {
          // Selecting a new tab — clear "All" if it's in the selection
          const withoutAll = current.filter((id) => id !== 'all');
          next = [...withoutAll, tabId];
        }
      }

      stagedRef.current = next;
      return next;
    });
  }, []);

  /**
   * Create a new status from the input field.
   */
  const handleCreateStatus = useCallback(() => {
    const name = newStatusName.trim();
    if (!name || !onCreateStatus) return;

    const colorIndex = pipelineStepCount % STATUS_COLORS.length;
    onCreateStatus(name, STATUS_COLORS[colorIndex]);
    setNewStatusName('');
    setShowNewStatusInput(false);
  }, [newStatusName, onCreateStatus, pipelineStepCount]);

  /**
   * Delete a custom status. Prevents event from toggling the item.
   */
  const handleDeleteStatus = useCallback(
    (e: React.MouseEvent, tabId: StatusTabId) => {
      e.preventDefault();
      e.stopPropagation();
      if (!onDeleteStatus) return;

      // Remove from staged selection if present
      setStagedTabs((current) => {
        const remaining = current.filter((id) => id !== tabId);
        const next = remaining.length === 0 ? ['all'] : remaining;
        stagedRef.current = next;
        return next;
      });

      onDeleteStatus(tabId);
    },
    [onDeleteStatus]
  );

  // Compute whether the staged selection has diverged from committed (parent) state.
  // Used to indicate pending changes in the dropdown.
  const hasPendingChanges = useMemo(() => {
    if (stagedTabs.length !== activeTabs.length) return true;
    return stagedTabs.some((id) => !activeTabs.includes(id));
  }, [stagedTabs, activeTabs]);

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'flex items-center gap-1.5 h-7 px-2',
            'hover:bg-accent/50 transition-colors duration-150',
            'font-medium text-xs',
            className
          )}
          data-testid="board-status-dropdown-trigger"
        >
          {/* Active status color dot */}
          {activeTabConfig && <StatusColorDot colorClass={activeTabConfig.colorClass} size="md" />}

          {/* Active status label (multi-select aware) */}
          <span className="max-w-[120px] truncate">{triggerLabel}</span>

          {/* Chevron */}
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        className="w-56 max-w-[calc(100vw-2rem)] max-h-[min(24rem,70vh)] overflow-y-auto"
        data-testid="board-status-dropdown-content"
      >
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {dropdownLabel}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {tabs.map((tab) => {
          const isStaged = stagedTabs.includes(tab.id);
          const diffState = getTabDiffState(tab.id, activeTabs, stagedTabs);
          const count = tabCounts?.[tab.id];
          const isDeletable = onDeleteStatus && !BASE_STATUS_IDS.has(tab.id);

          return (
            <DropdownMenuItem
              key={tab.id}
              onClick={(e) => {
                // Prevent the dropdown from closing on item click —
                // multi-select: allow toggling multiple items before committing on close
                e.preventDefault();
                handleToggle(tab.id);
              }}
              className={cn(
                'flex items-center gap-2 cursor-pointer min-h-[2.25rem]',
                // Background highlight for staged (checked) items
                isStaged && 'bg-accent',
                // Subtle visual diff backgrounds for pending changes
                diffState === 'added' && 'bg-emerald-500/5',
                diffState === 'removed' && 'bg-red-500/5'
              )}
              data-testid={`board-status-dropdown-option-${tab.id}`}
              role="option"
              aria-selected={isStaged}
            >
              {/* Checkbox indicator for multi-select */}
              <CheckboxIndicator checked={isStaged} diffState={diffState} />

              {/* Status color indicator */}
              <StatusColorDot colorClass={tab.colorClass} size="md" />

              {/* Status label */}
              <span
                className={cn(
                  'flex-1 text-sm truncate',
                  // Dim labels for items being removed
                  diffState === 'removed' && 'text-muted-foreground line-through'
                )}
              >
                {tab.label}
              </span>

              {/* Count badge */}
              {count !== undefined && <InlineCountBadge count={count} />}

              {/* Diff badge for pending changes */}
              <DiffBadge diffState={diffState} />

              {/* Delete button for custom (pipeline) statuses */}
              {isDeletable && (
                <button
                  type="button"
                  className={cn(
                    'flex items-center justify-center shrink-0',
                    'w-5 h-5 rounded-sm',
                    'text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10',
                    'transition-colors duration-150'
                  )}
                  onClick={(e) => handleDeleteStatus(e, tab.id)}
                  title={`Delete "${tab.label}" status`}
                  aria-label={`Delete ${tab.label} status`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </DropdownMenuItem>
          );
        })}

        {/* Pending changes hint */}
        {hasPendingChanges && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-[10px] text-muted-foreground text-center select-none">
              Close to apply changes
            </div>
          </>
        )}

        {/* Create new status section */}
        {onCreateStatus && (
          <>
            <DropdownMenuSeparator />

            {showNewStatusInput ? (
              <div
                className="px-2 py-1.5 flex items-center gap-1.5"
                onClick={(e) => e.preventDefault()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateStatus();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setShowNewStatusInput(false);
                    setNewStatusName('');
                  }
                }}
              >
                <input
                  ref={newStatusInputRef}
                  type="text"
                  value={newStatusName}
                  onChange={(e) => setNewStatusName(e.target.value)}
                  placeholder="Status name..."
                  className={cn(
                    'flex-1 h-7 px-2 text-sm rounded-md',
                    'bg-muted/50 border border-border',
                    'focus:outline-none focus:ring-1 focus:ring-primary',
                    'placeholder:text-muted-foreground/50'
                  )}
                  autoFocus
                />
                <button
                  type="button"
                  className={cn(
                    'flex items-center justify-center shrink-0',
                    'h-7 w-7 rounded-md',
                    'bg-primary text-primary-foreground',
                    'hover:bg-primary/90 transition-colors duration-150',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    handleCreateStatus();
                  }}
                  disabled={!newStatusName.trim()}
                  title="Create status"
                  aria-label="Create status"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  setShowNewStatusInput(true);
                  // Focus the input after it renders
                  requestAnimationFrame(() => newStatusInputRef.current?.focus());
                }}
                className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground"
                data-testid="board-status-dropdown-create"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">New Status</span>
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

export type { StatusTabId, StatusTab };
