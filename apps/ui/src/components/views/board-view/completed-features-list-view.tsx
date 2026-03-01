import { memo, useMemo, useCallback, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/forms';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/layout';
import { Badge } from '@/components/ui/layout';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/forms';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays';
import {
  RotateCcw,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  X,
  Filter,
  FolderKanban,
  ExternalLink,
  GitPullRequest,
  User,
  Tag,
  Loader2,
  AlertCircle,
  RefreshCw,
  Github,
} from 'lucide-react';
import type { GitHubIssue } from '@/lib/electron';
import type { Feature } from '@dmaker/types';
import { GitHubIssueDialog } from './dialogs/github-issue-dialog';

/** A closed GitHub issue enriched with project info for multi-project support. */
export type ClosedIssueWithProject = GitHubIssue & {
  projectPath?: string;
  projectName?: string;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DateRangePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7days'
  | 'last30days'
  | 'thisMonth'
  | 'lastMonth';

export interface ClosedIssuesFilters {
  dateRange: DateRangePreset;
  project: string;
  selectedLabels: string[];
  selectedAssignees: string[];
  linkedPRFilter: 'all' | 'with_pr' | 'without_pr';
}

export interface CompletedFeaturesListViewProps {
  closedIssues: ClosedIssueWithProject[];
  onReopen: (issue: ClosedIssueWithProject) => void;
  onClose?: () => void;
  className?: string;
  availableProjects?: Map<string, string>;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Force refresh (invalidates cache) */
  onRefresh?: () => void;
  /** Timestamp of last successful fetch (epoch ms) */
  lastFetchedAt?: number | null;
  /** Cache TTL in ms — used for countdown display */
  cacheTtlMs?: number;
}

interface DateGroup {
  label: string;
  dateKey: string;
  issues: ClosedIssueWithProject[];
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function formatDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const featureDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (featureDate.getTime() === today.getTime()) return 'Today';
  if (featureDate.getTime() === yesterday.getTime()) return 'Yesterday';

  const daysAgo = Math.floor((today.getTime() - featureDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysAgo <= 7) return date.toLocaleDateString('en-US', { weekday: 'long' });

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getIssueClosedDate(issue: GitHubIssue): Date {
  if (issue.closedAt) return new Date(issue.closedAt);
  return new Date(issue.createdAt);
}

function groupIssuesByDate(issues: ClosedIssueWithProject[]): DateGroup[] {
  const sorted = [...issues].sort(
    (a, b) => getIssueClosedDate(b).getTime() - getIssueClosedDate(a).getTime()
  );

  const groups: Map<string, DateGroup> = new Map();
  for (const issue of sorted) {
    const date = getIssueClosedDate(issue);
    const dateKey = getDateKey(date);
    const label = formatDateLabel(date);

    if (!groups.has(dateKey)) {
      groups.set(dateKey, { label, dateKey, issues: [] });
    }
    groups.get(dateKey)!.issues.push(issue);
  }

  return Array.from(groups.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

// ---------------------------------------------------------------------------
// Date range filter helpers
// ---------------------------------------------------------------------------

function getDateRangeBoundaries(preset: DateRangePreset): { start: Date | null; end: Date | null } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'all':
      return { start: null, end: null };
    case 'today':
      return { start: today, end: null };
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: yesterday, end: today };
    }
    case 'last7days': {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { start: weekAgo, end: null };
    }
    case 'last30days': {
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);
      return { start: monthAgo, end: null };
    }
    case 'thisMonth':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: null };
    case 'lastMonth': {
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 0),
      };
    }
    default:
      return { start: null, end: null };
  }
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

function extractUniqueLabels(issues: ClosedIssueWithProject[]): { name: string; color: string }[] {
  const labelMap = new Map<string, string>();
  for (const issue of issues) {
    for (const label of issue.labels) {
      if (!labelMap.has(label.name)) labelMap.set(label.name, label.color);
    }
  }
  return Array.from(labelMap.entries())
    .map(([name, color]) => ({ name, color }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function extractUniqueAssignees(
  issues: ClosedIssueWithProject[]
): { login: string; avatarUrl?: string }[] {
  const seen = new Map<string, string | undefined>();
  for (const issue of issues) {
    for (const assignee of issue.assignees) {
      if (!seen.has(assignee.login)) seen.set(assignee.login, assignee.avatarUrl);
    }
  }
  return Array.from(seen.entries())
    .map(([login, avatarUrl]) => ({ login, avatarUrl }))
    .sort((a, b) => a.login.localeCompare(b.login));
}

// ---------------------------------------------------------------------------
// Filter logic
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: ClosedIssuesFilters = {
  dateRange: 'all',
  project: 'all',
  selectedLabels: [],
  selectedAssignees: [],
  linkedPRFilter: 'all',
};

function filterClosedIssues(
  issues: ClosedIssueWithProject[],
  filters: ClosedIssuesFilters
): ClosedIssueWithProject[] {
  let filtered = issues;

  if (filters.dateRange !== 'all') {
    const { start, end } = getDateRangeBoundaries(filters.dateRange);
    filtered = filtered.filter((issue) => {
      const date = getIssueClosedDate(issue);
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    });
  }

  if (filters.project !== 'all') {
    filtered = filtered.filter((issue) => issue.projectPath === filters.project);
  }

  if (filters.selectedLabels.length > 0) {
    filtered = filtered.filter((issue) =>
      issue.labels.some((l) => filters.selectedLabels.includes(l.name))
    );
  }

  if (filters.selectedAssignees.length > 0) {
    filtered = filtered.filter((issue) =>
      issue.assignees.some((a) => filters.selectedAssignees.includes(a.login))
    );
  }

  if (filters.linkedPRFilter !== 'all') {
    filtered = filtered.filter((issue) => {
      const hasPRs = issue.linkedPRs && issue.linkedPRs.length > 0;
      return filters.linkedPRFilter === 'with_pr' ? hasPRs : !hasPRs;
    });
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSize = 10;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Build a minimal Feature object from a closed GitHub issue for the GitHubIssueDialog */
function issueToFeature(issue: ClosedIssueWithProject): Feature {
  return {
    id: `github-issue-${issue.number}`,
    title: issue.title,
    description: issue.body || '',
    category: 'GitHub Issue',
    status: 'completed',
    source: 'github',
    steps: [],
    model: 'sonnet',
    thinkingLevel: 'none',
    githubIssue: {
      number: issue.number,
      url: issue.url,
      assignees: issue.assignees.map((a) => a.login),
      labels: issue.labels.map((l) => l.name),
      state: 'closed',
      syncedAt: new Date().toISOString(),
    },
  } as Feature;
}

/** Single closed issue card */
const ClosedIssueCard = memo(function ClosedIssueCard({
  issue,
  onReopen,
  projectName,
}: {
  issue: ClosedIssueWithProject;
  onReopen: () => void;
  projectName?: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const closedDate = getIssueClosedDate(issue);
  const closedTimeStr = closedDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const feature = useMemo(() => issueToFeature(issue), [issue]);

  return (
    <>
      <Card
        className="flex flex-col hover:bg-accent/30 transition-colors"
        data-testid={`closed-issue-card-${issue.number}`}
      >
        <CardHeader className="p-3 pb-2 flex-1">
          <CardTitle className="text-sm leading-tight line-clamp-2">
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="inline-flex items-center gap-1 mr-1.5 text-primary/70 hover:text-primary hover:underline transition-colors cursor-pointer"
              title={`View Issue #${issue.number}`}
            >
              <Github className="w-3.5 h-3.5 shrink-0" />
              <span>#{issue.number}</span>
            </button>
            {issue.title}
          </CardTitle>
          <CardDescription className="text-xs mt-1.5 flex flex-col gap-1.5">
            {/* Labels */}
            {issue.labels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {issue.labels.slice(0, 4).map((label) => (
                  <Badge
                    key={label.name}
                    variant="outline"
                    className="text-[10px] px-1.5 py-0"
                    style={{ borderColor: `#${label.color}`, color: `#${label.color}` }}
                  >
                    {label.name}
                  </Badge>
                ))}
                {issue.labels.length > 4 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{issue.labels.length - 4}
                  </span>
                )}
              </div>
            )}

            {/* Assignees */}
            {issue.assignees.length > 0 && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {issue.assignees.map((a) => a.login).join(', ')}
              </span>
            )}

            {/* Closed time */}
            <span className="flex items-center gap-1 text-muted-foreground/70">
              <Clock className="w-3 h-3" />
              Closed {closedTimeStr}
            </span>

            {/* Linked PRs */}
            {issue.linkedPRs && issue.linkedPRs.length > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground/70">
                <GitPullRequest className="w-3 h-3" />
                {issue.linkedPRs.length} linked PR{issue.linkedPRs.length !== 1 ? 's' : ''}
              </span>
            )}

            {/* Project */}
            {projectName && (
              <span className="flex items-center gap-1 text-muted-foreground/80">
                <FolderKanban className="w-3 h-3" />
                <span className="truncate">{projectName}</span>
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <div className="p-3 pt-0 flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() => window.open(issue.url, '_blank')}
            data-testid={`open-github-${issue.number}`}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Open in GitHub
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onReopen}
            title="Reopen issue"
            data-testid={`reopen-${issue.number}`}
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reopen
          </Button>
        </div>
      </Card>
      <GitHubIssueDialog feature={feature} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
});

/** Date group header */
const DateGroupHeader = memo(function DateGroupHeader({
  group,
  isExpanded,
  onToggle,
}: {
  group: DateGroup;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center gap-2 w-full px-4 py-3 text-left',
        'bg-muted/30 hover:bg-muted/50 transition-colors duration-200',
        'border-b border-border/30',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
      )}
      aria-expanded={isExpanded}
      data-testid={`date-group-header-${group.dateKey}`}
    >
      <span className="text-muted-foreground">
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </span>
      <Calendar className="w-4 h-4 text-muted-foreground" />
      <span className="font-medium text-sm">{group.label}</span>
      <span className="text-xs text-muted-foreground">({group.issues.length})</span>
    </button>
  );
});

/** Empty state */
const EmptyState = memo(function EmptyState({
  hasSearchQuery,
  hasFilters,
}: {
  hasSearchQuery: boolean;
  hasFilters: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-4',
        'text-center text-muted-foreground'
      )}
      data-testid="closed-issues-empty"
    >
      <GitPullRequest className="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p className="text-sm">
        {hasSearchQuery || hasFilters
          ? 'No closed issues match your filters'
          : 'No closed issues found'}
      </p>
    </div>
  );
});

/** Multi-select popover for labels or assignees */
function MultiSelectPopover({
  label,
  icon: Icon,
  items,
  selectedItems,
  onToggle,
  renderItem,
  testId,
}: {
  label: string;
  icon: React.ElementType;
  items: { key: string; display: React.ReactNode }[];
  selectedItems: string[];
  onToggle: (key: string) => void;
  renderItem?: (
    item: { key: string; display: React.ReactNode },
    selected: boolean
  ) => React.ReactNode;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const hasSelection = selectedItems.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-8 text-xs gap-1.5', hasSelection && 'border-primary/50 bg-primary/5')}
          data-testid={testId}
        >
          <Icon className="w-3 h-3 shrink-0" />
          {label}
          {hasSelection && (
            <Badge variant="secondary" className="ml-1 px-1 py-0 text-[10px]">
              {selectedItems.length}
            </Badge>
          )}
          <ChevronDown className="w-3 h-3 ml-0.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1 max-h-60 overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-3">None available</div>
        ) : (
          items.map((item) => {
            const selected = selectedItems.includes(item.key);
            return (
              <button
                key={item.key}
                type="button"
                className={cn(
                  'flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-left',
                  'hover:bg-accent/50 transition-colors',
                  selected && 'bg-accent'
                )}
                onClick={() => onToggle(item.key)}
              >
                <span
                  className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                    selected
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-muted-foreground/30'
                  )}
                >
                  {selected && (
                    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2 6l3 3 5-5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                {renderItem ? (
                  renderItem(item, selected)
                ) : (
                  <span className="truncate">{item.display}</span>
                )}
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Freshness countdown indicator */
function FreshnessIndicator({
  lastFetchedAt,
  cacheTtlMs,
  onRefresh,
}: {
  lastFetchedAt: number | null | undefined;
  cacheTtlMs: number;
  onRefresh?: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!lastFetchedAt) {
      setSecondsLeft(null);
      return;
    }

    const update = () => {
      const elapsed = Date.now() - lastFetchedAt;
      const remaining = Math.max(0, Math.ceil((cacheTtlMs - elapsed) / 1000));
      setSecondsLeft(remaining);
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lastFetchedAt, cacheTtlMs]);

  if (secondsLeft === null) return null;

  const isStale = secondsLeft === 0;

  return (
    <button
      type="button"
      onClick={onRefresh}
      className={cn(
        'flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md transition-colors',
        'hover:bg-accent/50',
        isStale ? 'text-muted-foreground/60' : 'text-muted-foreground/80'
      )}
      title={
        isStale
          ? 'Data is stale — click to refresh'
          : `Refreshes in ${secondsLeft}s — click to refresh now`
      }
    >
      <RefreshCw className={cn('w-3 h-3', isStale && 'opacity-50')} />
      {isStale ? 'Stale' : `${secondsLeft}s`}
    </button>
  );
}

/** Filter bar */
const FilterBar = memo(function FilterBar({
  filters,
  onFiltersChange,
  availableLabels,
  availableAssignees,
  availableProjects,
  showProjectFilter,
  activeFilterCount,
  onClearFilters,
  searchQuery,
  onSearchChange,
  lastFetchedAt,
  cacheTtlMs,
  onRefresh,
  onClose,
}: {
  filters: ClosedIssuesFilters;
  onFiltersChange: (updates: Partial<ClosedIssuesFilters>) => void;
  availableLabels: { name: string; color: string }[];
  availableAssignees: { login: string; avatarUrl?: string }[];
  availableProjects?: Map<string, string>;
  showProjectFilter: boolean;
  activeFilterCount: number;
  onClearFilters: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  lastFetchedAt?: number | null;
  cacheTtlMs?: number;
  onRefresh?: () => void;
  onClose?: () => void;
}) {
  const toggleLabel = useCallback(
    (name: string) => {
      const current = filters.selectedLabels;
      const updated = current.includes(name)
        ? current.filter((l) => l !== name)
        : [...current, name];
      onFiltersChange({ selectedLabels: updated });
    },
    [filters.selectedLabels, onFiltersChange]
  );

  const toggleAssignee = useCallback(
    (login: string) => {
      const current = filters.selectedAssignees;
      const updated = current.includes(login)
        ? current.filter((a) => a !== login)
        : [...current, login];
      onFiltersChange({ selectedAssignees: updated });
    },
    [filters.selectedAssignees, onFiltersChange]
  );

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20"
      data-testid="closed-issues-filter-bar"
    >
      {/* Left: scrollable filters */}
      <div className="flex items-center gap-2 min-w-0 overflow-x-auto shrink">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
          <Filter className="w-4 h-4" />
        </div>

        {/* Date Range */}
        <Select
          value={filters.dateRange}
          onValueChange={(value) => onFiltersChange({ dateRange: value as DateRangePreset })}
        >
          <SelectTrigger
            className={cn(
              'w-[140px] h-8 text-xs shrink-0',
              filters.dateRange !== 'all' && 'border-primary/50 bg-primary/5'
            )}
            data-testid="filter-date-range"
          >
            <Calendar className="w-3 h-3 mr-1.5 shrink-0" />
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="last7days">Last 7 days</SelectItem>
            <SelectItem value="last30days">Last 30 days</SelectItem>
            <SelectItem value="thisMonth">This month</SelectItem>
            <SelectItem value="lastMonth">Last month</SelectItem>
          </SelectContent>
        </Select>

        {/* Project */}
        {showProjectFilter && availableProjects && availableProjects.size > 0 && (
          <Select
            value={filters.project}
            onValueChange={(value) => onFiltersChange({ project: value })}
          >
            <SelectTrigger
              className={cn(
                'w-[160px] h-8 text-xs shrink-0',
                filters.project !== 'all' && 'border-primary/50 bg-primary/5'
              )}
              data-testid="filter-project"
            >
              <FolderKanban className="w-3 h-3 mr-1.5 shrink-0" />
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {Array.from(availableProjects.entries()).map(([path, name]) => (
                <SelectItem key={path} value={path}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Labels multi-select */}
        {availableLabels.length > 0 && (
          <MultiSelectPopover
            label="Labels"
            icon={Tag}
            items={availableLabels.map((l) => ({
              key: l.name,
              display: (
                <span className="flex items-center gap-1.5 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: `#${l.color}` }}
                  />
                  {l.name}
                </span>
              ),
            }))}
            selectedItems={filters.selectedLabels}
            onToggle={toggleLabel}
            testId="filter-labels"
          />
        )}

        {/* Assignees multi-select */}
        {availableAssignees.length > 0 && (
          <MultiSelectPopover
            label="Assignees"
            icon={User}
            items={availableAssignees.map((a) => ({
              key: a.login,
              display: <span className="truncate">{a.login}</span>,
            }))}
            selectedItems={filters.selectedAssignees}
            onToggle={toggleAssignee}
            testId="filter-assignees"
          />
        )}

        {/* Linked PRs */}
        <Select
          value={filters.linkedPRFilter}
          onValueChange={(value) =>
            onFiltersChange({ linkedPRFilter: value as 'all' | 'with_pr' | 'without_pr' })
          }
        >
          <SelectTrigger
            className={cn(
              'w-[130px] h-8 text-xs shrink-0',
              filters.linkedPRFilter !== 'all' && 'border-primary/50 bg-primary/5'
            )}
            data-testid="filter-linked-prs"
          >
            <GitPullRequest className="w-3 h-3 mr-1.5 shrink-0" />
            <SelectValue placeholder="Linked PRs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All issues</SelectItem>
            <SelectItem value="with_pr">With PR</SelectItem>
            <SelectItem value="without_pr">Without PR</SelectItem>
          </SelectContent>
        </Select>

        {/* Clear filters */}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onClearFilters}
            title={`Clear ${activeFilterCount} active filter${activeFilterCount !== 1 ? 's' : ''}`}
            data-testid="clear-filters"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Right side: search + freshness (pinned, never wraps) */}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        <div className="relative w-44">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 pr-7 h-8 text-xs"
            data-testid="closed-issues-search"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {cacheTtlMs != null && (
          <FreshnessIndicator
            lastFetchedAt={lastFetchedAt}
            cacheTtlMs={cacheTtlMs}
            onRefresh={onRefresh}
          />
        )}

        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            title="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
});

/** Page size selector */
const PageSizeSelector = memo(function PageSizeSelector({
  pageSize,
  onPageSizeChange,
  totalItems,
}: {
  pageSize: PageSize;
  onPageSizeChange: (size: PageSize) => void;
  totalItems: number;
}) {
  return (
    <div className="flex items-center gap-2" data-testid="page-size-selector">
      <span className="text-sm text-muted-foreground">Show:</span>
      <Select
        value={pageSize.toString()}
        onValueChange={(value) => onPageSizeChange(parseInt(value, 10) as PageSize)}
      >
        <SelectTrigger className="w-[80px] h-8 text-xs" data-testid="page-size-dropdown">
          <SelectValue placeholder={pageSize.toString()} />
        </SelectTrigger>
        <SelectContent>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <SelectItem key={size} value={size.toString()}>
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-sm text-muted-foreground">of {totalItems}</span>
    </div>
  );
});

/** Pagination controls */
const PaginationControls = memo(function PaginationControls({
  currentPage,
  totalPages,
  onPreviousPage,
  onNextPage,
  startItem,
  endItem,
  totalItems,
}: {
  currentPage: number;
  totalPages: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
  startItem: number;
  endItem: number;
  totalItems: number;
}) {
  return (
    <div className="flex items-center gap-2" data-testid="pagination-nav">
      <span className="text-sm text-muted-foreground mr-2">
        {startItem}–{endItem} of {totalItems}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onPreviousPage}
        disabled={currentPage <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="text-sm font-medium min-w-[80px] text-center">
        Page {currentPage} of {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onNextPage}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const CompletedFeaturesListView = memo(function CompletedFeaturesListView({
  closedIssues,
  onReopen,
  onClose,
  className,
  availableProjects,
  isLoading,
  error,
  onRetry,
  onRefresh,
  lastFetchedAt,
  cacheTtlMs,
}: CompletedFeaturesListViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<ClosedIssuesFilters>(DEFAULT_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Extract available filter values from all issues (before filtering)
  const availableLabels = useMemo(() => extractUniqueLabels(closedIssues), [closedIssues]);
  const availableAssignees = useMemo(() => extractUniqueAssignees(closedIssues), [closedIssues]);

  // Build effective projects map
  const effectiveProjects = useMemo(() => {
    if (availableProjects && availableProjects.size > 0) return availableProjects;
    const map = new Map<string, string>();
    for (const issue of closedIssues) {
      if (issue.projectPath && issue.projectName && !map.has(issue.projectPath)) {
        map.set(issue.projectPath, issue.projectName);
      }
    }
    return map;
  }, [availableProjects, closedIssues]);

  const showProjectFilter = effectiveProjects.size > 0;

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.dateRange !== 'all') count++;
    if (filters.project !== 'all') count++;
    if (filters.selectedLabels.length > 0) count++;
    if (filters.selectedAssignees.length > 0) count++;
    if (filters.linkedPRFilter !== 'all') count++;
    return count;
  }, [filters]);

  const handleFiltersChange = useCallback((updates: Partial<ClosedIssuesFilters>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
    setCurrentPage(1);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setCurrentPage(1);
  }, []);

  const handlePageSizeChange = useCallback((newSize: PageSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  }, []);

  // Apply filters
  const filteredByFilters = useMemo(
    () => filterClosedIssues(closedIssues, filters),
    [closedIssues, filters]
  );

  // Apply search
  const filteredIssues = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return filteredByFilters;

    return filteredByFilters.filter(
      (issue) =>
        issue.title.toLowerCase().includes(q) ||
        (issue.body || '').toLowerCase().includes(q) ||
        issue.labels.some((l) => l.name.toLowerCase().includes(q)) ||
        `#${issue.number}`.includes(q) ||
        (issue.projectName || '').toLowerCase().includes(q)
    );
  }, [filteredByFilters, searchQuery]);

  // Pagination
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredIssues.length / pageSize)),
    [filteredIssues.length, pageSize]
  );

  const paginationInfo = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredIssues.length);
    return {
      startItem: filteredIssues.length > 0 ? startIndex + 1 : 0,
      endItem: endIndex,
    };
  }, [currentPage, pageSize, filteredIssues.length]);

  const paginatedIssues = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredIssues.slice(startIndex, startIndex + pageSize);
  }, [filteredIssues, currentPage, pageSize]);

  const dateGroups = useMemo(() => groupIssuesByDate(paginatedIssues), [paginatedIssues]);

  const toggleGroup = useCallback((dateKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  }, []);

  const hasFilters = activeFilterCount > 0;
  const hasSearchQuery = searchQuery.length > 0;

  return (
    <div
      className={cn('flex flex-col h-full bg-background', className)}
      data-testid="completed-features-list-view"
    >
      {/* Filter bar (single row: filters + search + freshness + close) */}
      <FilterBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        availableLabels={availableLabels}
        availableAssignees={availableAssignees}
        availableProjects={effectiveProjects}
        showProjectFilter={showProjectFilter}
        activeFilterCount={activeFilterCount}
        onClearFilters={handleClearFilters}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        lastFetchedAt={lastFetchedAt}
        cacheTtlMs={cacheTtlMs}
        onRefresh={onRefresh}
        onClose={onClose}
      />

      {/* Pagination controls */}
      {filteredIssues.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/10">
          <PageSizeSelector
            pageSize={pageSize}
            onPageSizeChange={handlePageSizeChange}
            totalItems={filteredIssues.length}
          />
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            onPreviousPage={() => setCurrentPage((p) => Math.max(1, p - 1))}
            onNextPage={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            startItem={paginationInfo.startItem}
            endItem={paginationInfo.endItem}
            totalItems={filteredIssues.length}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Loading closed issues...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <AlertCircle className="w-12 h-12 text-destructive/50 mb-4" />
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            )}
          </div>
        ) : filteredIssues.length === 0 ? (
          <EmptyState hasSearchQuery={hasSearchQuery} hasFilters={hasFilters} />
        ) : (
          <div className="pb-4">
            {dateGroups.map((group) => {
              const isExpanded = !collapsedGroups.has(group.dateKey);
              return (
                <div key={group.dateKey} data-testid={`date-group-${group.dateKey}`}>
                  <DateGroupHeader
                    group={group}
                    isExpanded={isExpanded}
                    onToggle={() => toggleGroup(group.dateKey)}
                  />
                  {isExpanded && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                      {group.issues.map((issue) => {
                        const resolvedProjectName =
                          issue.projectName ||
                          (issue.projectPath && effectiveProjects.get(issue.projectPath)) ||
                          undefined;
                        return (
                          <ClosedIssueCard
                            key={issue.url}
                            issue={issue}
                            onReopen={() => onReopen(issue)}
                            projectName={resolvedProjectName}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

export default CompletedFeaturesListView;
