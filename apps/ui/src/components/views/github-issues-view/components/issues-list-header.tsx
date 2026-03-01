import { useState } from 'react';
import { CircleDot, Pencil, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/forms';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays';
import { cn } from '@/lib/utils';
import type { IssuesStateFilter } from '../types';
import { IssuesFilterControls } from './issues-filter-controls';

interface IssuesListHeaderProps {
  openCount: number;
  closedCount: number;
  /** Total open issues count (unfiltered) - used to show "X of Y" when filtered */
  totalOpenCount?: number;
  /** Total closed issues count (unfiltered) - used to show "X of Y" when filtered */
  totalClosedCount?: number;
  /** Whether any filter is currently active */
  hasActiveFilter?: boolean;
  /** GitHub repository full name (e.g., "owner/repo") */
  repoFullName?: string | null;
  /** Whether a custom repo override is active */
  hasRepoOverride?: boolean;
  /** Called when the user changes the repo override */
  onRepoChange?: (repo: string | undefined) => void;
  refreshing: boolean;
  onRefresh: () => void;
  /** Whether the list is in compact mode (e.g., when detail panel is open) */
  compact?: boolean;
  /** Optional filter state and handlers - when provided, filter controls are rendered */
  filterProps?: {
    stateFilter: IssuesStateFilter;
    selectedLabels: string[];
    availableLabels: string[];
    onStateFilterChange: (filter: IssuesStateFilter) => void;
    onLabelsChange: (labels: string[]) => void;
  };
}

export function IssuesListHeader({
  openCount,
  closedCount,
  totalOpenCount,
  totalClosedCount,
  hasActiveFilter = false,
  repoFullName,
  hasRepoOverride = false,
  onRepoChange,
  refreshing,
  onRefresh,
  compact = false,
  filterProps,
}: IssuesListHeaderProps) {
  const totalIssues = openCount + closedCount;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [repoInput, setRepoInput] = useState('');

  // Format the counts subtitle based on filter state
  const getCountsSubtitle = () => {
    if (totalIssues === 0) {
      return hasActiveFilter ? 'No matching issues' : 'No issues found';
    }

    // When filters are active and we have total counts, show "X of Y" format
    if (hasActiveFilter && totalOpenCount !== undefined && totalClosedCount !== undefined) {
      const openText =
        openCount === totalOpenCount
          ? `${openCount} open`
          : `${openCount} of ${totalOpenCount} open`;
      const closedText =
        closedCount === totalClosedCount
          ? `${closedCount} closed`
          : `${closedCount} of ${totalClosedCount} closed`;
      return `${openText}, ${closedText}`;
    }

    // Default format when no filters active
    return `${openCount} open, ${closedCount} closed`;
  };

  const handleRepoSubmit = () => {
    const trimmed = repoInput.trim();
    if (trimmed && /^[^/]+\/[^/]+$/.test(trimmed)) {
      onRepoChange?.(trimmed);
      setPopoverOpen(false);
    }
  };

  const handleResetRepo = () => {
    onRepoChange?.(undefined);
    setPopoverOpen(false);
    setRepoInput('');
  };

  return (
    <div className="border-b border-border">
      {/* Top row: Title and refresh button */}
      <div className="flex items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10">
            <CircleDot className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Issues</h1>
              {repoFullName && onRepoChange ? (
                <Popover
                  open={popoverOpen}
                  onOpenChange={(open) => {
                    setPopoverOpen(open);
                    if (open) setRepoInput(repoFullName || '');
                  }}
                >
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 text-xs text-muted-foreground font-normal hover:text-foreground transition-colors">
                      {repoFullName}
                      <Pencil className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3" align="start">
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Change GitHub repository</p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleRepoSubmit();
                        }}
                      >
                        <Input
                          value={repoInput}
                          onChange={(e) => setRepoInput(e.target.value)}
                          placeholder="owner/repo"
                          className="h-8 text-sm"
                          autoFocus
                        />
                      </form>
                      <div className="flex items-center justify-between">
                        {hasRepoOverride && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={handleResetRepo}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Reset to auto-detect
                          </Button>
                        )}
                        <Button
                          size="sm"
                          className="h-7 text-xs px-3 ml-auto"
                          onClick={handleRepoSubmit}
                          disabled={!repoInput.trim() || !/^[^/]+\/[^/]+$/.test(repoInput.trim())}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : repoFullName ? (
                <span className="text-xs text-muted-foreground font-normal">{repoFullName}</span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{getCountsSubtitle()}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
        </Button>
      </div>

      {/* Filter controls row (optional) */}
      {filterProps && (
        <div className="px-4 pb-3 pt-1">
          <IssuesFilterControls
            stateFilter={filterProps.stateFilter}
            selectedLabels={filterProps.selectedLabels}
            availableLabels={filterProps.availableLabels}
            onStateFilterChange={filterProps.onStateFilterChange}
            onLabelsChange={filterProps.onLabelsChange}
            disabled={refreshing}
            compact={compact}
          />
        </div>
      )}
    </div>
  );
}
