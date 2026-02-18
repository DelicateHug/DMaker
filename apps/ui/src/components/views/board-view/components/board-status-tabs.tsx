import * as React from 'react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { StatusTabId, StatusTab } from '../hooks/use-board-status-tabs';

export interface BoardStatusTabsProps {
  /** Currently active tab ID */
  activeTab: StatusTabId;
  /** Callback when a tab is selected */
  onTabChange: (tabId: StatusTabId) => void;
  /** Available tabs to display */
  tabs: StatusTab[];
  /** Additional CSS classes for the container */
  className?: string;
  /** Whether to show keyboard shortcut hints */
  showShortcuts?: boolean;
  /** Size variant for the tabs */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Optional: Feature counts per tab (keyed by tab ID).
   * When provided, displays a badge with the count on each tab.
   */
  tabCounts?: Record<string, number>;
}

/**
 * Color indicator dot for each tab, matching the column status color
 */
function TabColorIndicator({ colorClass }: { colorClass: string }) {
  return <span className={cn('w-2 h-2 rounded-full shrink-0', colorClass)} aria-hidden="true" />;
}

/**
 * Keyboard shortcut badge displayed on tabs
 */
function ShortcutBadge({ shortcut }: { shortcut: string }) {
  return (
    <kbd
      className={cn(
        'ml-1.5 inline-flex items-center justify-center',
        'min-w-[1.25rem] h-5 px-1 rounded text-[10px] font-medium',
        'bg-muted/50 text-muted-foreground border border-border/50',
        'hidden sm:inline-flex'
      )}
    >
      {shortcut}
    </kbd>
  );
}

/**
 * Count badge displayed on tabs to show feature count
 */
function CountBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <span
      className={cn(
        'ml-1 inline-flex items-center justify-center',
        'min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-medium',
        'bg-primary/10 text-primary'
      )}
      aria-label={`${count} items`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * BoardStatusTabs component for switching between board status columns.
 *
 * This component provides a tab-based UI for switching between different status
 * columns (Backlog, In Progress, Waiting Approval, and any pipeline columns).
 * It integrates with the useBoardStatusTabs hook for state management.
 *
 * @example
 * ```tsx
 * const { activeTab, setActiveTab, tabs } = useBoardStatusTabs({
 *   columns: getColumnsWithPipeline(pipelineConfig),
 * });
 *
 * <BoardStatusTabs
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 *   tabs={tabs}
 *   showShortcuts
 * />
 * ```
 */
export const BoardStatusTabs = memo(function BoardStatusTabs({
  activeTab,
  onTabChange,
  tabs,
  className,
  showShortcuts = false,
  size = 'md',
  tabCounts,
}: BoardStatusTabsProps) {
  // Size-based styling
  const sizeClasses = {
    sm: 'h-8 text-xs',
    md: 'h-9 text-sm',
    lg: 'h-10 text-base',
  };

  const triggerSizeClasses = {
    sm: 'px-2 py-0.5 gap-1',
    md: 'px-3 py-1 gap-1.5',
    lg: 'px-4 py-1.5 gap-2',
  };

  const handleTabChange = React.useCallback(
    (value: string) => {
      onTabChange(value as StatusTabId);
    },
    [onTabChange]
  );

  // Generate shortcut keys (Shift+1 through Shift+9 for first 9 tabs)
  const getShortcutKey = (index: number): string | undefined => {
    if (!showShortcuts || index >= 9) return undefined;
    return `⇧${index + 1}`;
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className={cn('w-full', className)}>
      <TabsList
        className={cn('gap-0.5 p-1 w-full', sizeClasses[size])}
        aria-label="Board status tabs"
      >
        {tabs.map((tab, index) => {
          const shortcut = getShortcutKey(index);
          const count = tabCounts?.[tab.id];
          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className={cn(
                'relative',
                triggerSizeClasses[size],
                // Custom active state with status color accent
                'data-[state=active]:shadow-sm'
              )}
              title={shortcut ? `${tab.label} (Shift+${index + 1})` : tab.label}
              data-testid={`status-tab-${tab.id}`}
            >
              <TabColorIndicator colorClass={tab.colorClass} />
              <span className="truncate">{tab.label}</span>
              {count !== undefined && <CountBadge count={count} />}
              {shortcut && <ShortcutBadge shortcut={shortcut} />}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
});

/**
 * Compact variant of BoardStatusTabs showing only color indicators and optional labels
 */
export const BoardStatusTabsCompact = memo(function BoardStatusTabsCompact({
  activeTab,
  onTabChange,
  tabs,
  className,
  showLabels = false,
}: Omit<BoardStatusTabsProps, 'showShortcuts' | 'size'> & {
  showLabels?: boolean;
}) {
  const handleTabChange = React.useCallback(
    (value: string) => {
      onTabChange(value as StatusTabId);
    },
    [onTabChange]
  );

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className={cn('w-full', className)}>
      <TabsList className="h-7 gap-0.5 p-0.5 w-full" aria-label="Board status tabs">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className={cn('px-2 py-0.5 gap-1 text-xs', 'data-[state=active]:shadow-sm')}
            title={tab.label}
            data-testid={`status-tab-compact-${tab.id}`}
          >
            <TabColorIndicator colorClass={tab.colorClass} />
            {showLabels && <span className="truncate max-w-[80px]">{tab.label}</span>}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
});

/**
 * Props for the BoardStatusTabButtons component
 */
export interface BoardStatusTabButtonsProps {
  /** Currently active tab ID */
  activeTab: StatusTabId;
  /** Callback when a tab is selected */
  onTabChange: (tabId: StatusTabId) => void;
  /** Available tabs to display */
  tabs: StatusTab[];
  /** Additional CSS classes for the container */
  className?: string;
  /**
   * Optional: Feature counts per tab (keyed by tab ID).
   * When provided, displays a badge with the count on each tab.
   */
  tabCounts?: Record<string, number>;
  /** Whether to show labels on the buttons (default: true) */
  showLabels?: boolean;
}

/**
 * Compact count badge for header buttons
 */
function HeaderCountBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center',
        'min-w-[1rem] h-4 px-1 rounded-full text-[9px] font-medium',
        'bg-foreground/10 text-foreground/70'
      )}
      aria-label={`${count} items`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * BoardStatusTabButtons - Compact toggle buttons designed for panel header integration.
 *
 * This component provides a row of small toggle buttons for switching between status
 * columns (Backlog, In Progress, Waiting Approval, and any pipeline columns).
 * Unlike BoardStatusTabs, this is designed to be placed inline within a panel header
 * alongside titles and other controls.
 *
 * Features:
 * - Compact button-based design (no Tabs wrapper)
 * - Color indicators for each status
 * - Optional count badges
 * - Designed to fit within panel header height (h-10)
 * - Keyboard shortcut tooltips (Shift+1-9)
 *
 * @example
 * ```tsx
 * // In a panel header
 * <div className="flex items-center gap-2 h-10 px-3">
 *   <span className="font-medium">Board</span>
 *   <BoardStatusTabButtons
 *     activeTab={activeStatusTab}
 *     onTabChange={setActiveStatusTab}
 *     tabs={statusTabs}
 *     tabCounts={columnCounts}
 *   />
 * </div>
 * ```
 */
export const BoardStatusTabButtons = memo(function BoardStatusTabButtons({
  activeTab,
  onTabChange,
  tabs,
  className,
  tabCounts,
  showLabels = true,
}: BoardStatusTabButtonsProps) {
  const handleClick = React.useCallback(
    (tabId: StatusTabId) => {
      onTabChange(tabId);
    },
    [onTabChange]
  );

  // Generate shortcut tooltip (Shift+1 through Shift+9 for first 9 tabs)
  const getShortcutTooltip = (index: number, label: string): string => {
    if (index >= 9) return label;
    return `${label} (Shift+${index + 1})`;
  };

  return (
    <div
      className={cn('inline-flex items-center gap-0.5 p-0.5 rounded-md bg-muted/50', className)}
      role="tablist"
      aria-label="Board status filter"
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTab;
        const count = tabCounts?.[tab.id];

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => handleClick(tab.id)}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium',
              'transition-all duration-150 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
            title={getShortcutTooltip(index, tab.label)}
            data-testid={`status-tab-button-${tab.id}`}
          >
            <TabColorIndicator colorClass={tab.colorClass} />
            {showLabels && <span className="truncate max-w-[80px]">{tab.label}</span>}
            {count !== undefined && <HeaderCountBadge count={count} />}
          </button>
        );
      })}
    </div>
  );
});

export type { StatusTabId, StatusTab };
