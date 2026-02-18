import { memo, useMemo, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  RotateCcw,
  Trash2,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Tag,
  X,
  Filter,
  FolderKanban,
  Star,
} from 'lucide-react';
import type { Feature } from '@/store/app-store';

/**
 * Date range preset options
 */
export type DateRangePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7days'
  | 'last30days'
  | 'thisMonth'
  | 'lastMonth';

/**
 * Filter state for completed features
 */
export interface CompletedFeaturesFilters {
  dateRange: DateRangePreset;
  project: string; // 'all' or project path
  category: string; // 'all' or category name
  showFavoritesOnly: boolean; // Filter to show only favorited features
}

/**
 * Props for the CompletedFeaturesListView component
 */
export interface CompletedFeaturesListViewProps {
  /** List of completed features to display */
  completedFeatures: Feature[];
  /** Callback when a feature is restored */
  onRestore: (feature: Feature) => void;
  /** Callback when a feature is deleted */
  onDelete: (feature: Feature) => void;
  /** Optional callback to close the view */
  onClose?: () => void;
  /** Optional className for custom styling */
  className?: string;
  /** Available projects for filtering (project path -> project name) */
  availableProjects?: Map<string, string>;
  /** Current project path (for single project view) */
  currentProjectPath?: string;
}

/**
 * A group of features organized by date
 */
interface DateGroup {
  /** The date label (e.g., "Today", "Yesterday", "January 15, 2024") */
  label: string;
  /** ISO date string for sorting (YYYY-MM-DD) */
  dateKey: string;
  /** Features in this date group */
  features: Feature[];
}

/**
 * Format a date for display in group headers
 */
function formatDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const featureDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (featureDate.getTime() === today.getTime()) {
    return 'Today';
  }
  if (featureDate.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  }

  // For dates within the last 7 days, show the day name
  const daysAgo = Math.floor((today.getTime() - featureDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysAgo <= 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }

  // For older dates, show the full date
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Get the date key (YYYY-MM-DD) for sorting, using local timezone
 * to stay consistent with formatDateLabel which uses local dates
 */
function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the completion date for a feature
 * Falls back to startedAt if no specific completion timestamp is available
 */
function getFeatureCompletionDate(feature: Feature): Date {
  // Try to get a completion timestamp from various sources
  // The feature might have different timestamp fields depending on how it was completed
  const timestamp: string | undefined =
    (feature.completedAt as string | undefined) ||
    (feature.justFinishedAt as string | undefined) ||
    (feature.startedAt as string | undefined);

  if (timestamp) {
    return new Date(timestamp);
  }

  // Fallback to current date if no timestamp available
  return new Date();
}

/**
 * Sort features by completion timestamp (most recent first)
 */
function sortFeaturesByCompletionDate(features: Feature[]): Feature[] {
  return [...features].sort((a, b) => {
    const dateA = getFeatureCompletionDate(a);
    const dateB = getFeatureCompletionDate(b);
    // Sort descending (most recent first)
    return dateB.getTime() - dateA.getTime();
  });
}

/**
 * Group features by completion date
 * Features are sorted by completion timestamp (most recent first) before grouping
 */
function groupFeaturesByDate(features: Feature[]): DateGroup[] {
  // Sort features by completion date (most recent first) before grouping
  const sortedFeatures = sortFeaturesByCompletionDate(features);

  const groups: Map<string, DateGroup> = new Map();

  for (const feature of sortedFeatures) {
    const date = getFeatureCompletionDate(feature);
    const dateKey = getDateKey(date);
    const label = formatDateLabel(date);

    if (!groups.has(dateKey)) {
      groups.set(dateKey, {
        label,
        dateKey,
        features: [],
      });
    }

    groups.get(dateKey)!.features.push(feature);
  }

  // Sort groups by date (newest first)
  return Array.from(groups.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

/**
 * Get date range boundaries for a preset
 */
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
    case 'thisMonth': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: monthStart, end: null };
    }
    case 'lastMonth': {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: lastMonthStart, end: lastMonthEnd };
    }
    default:
      return { start: null, end: null };
  }
}

/**
 * Get display label for date range preset
 */
function getDateRangeLabel(preset: DateRangePreset): string {
  switch (preset) {
    case 'all':
      return 'All time';
    case 'today':
      return 'Today';
    case 'yesterday':
      return 'Yesterday';
    case 'last7days':
      return 'Last 7 days';
    case 'last30days':
      return 'Last 30 days';
    case 'thisMonth':
      return 'This month';
    case 'lastMonth':
      return 'Last month';
    default:
      return 'All time';
  }
}

/**
 * Extract unique categories from features
 */
function extractUniqueCategories(features: Feature[]): string[] {
  const categories = new Set<string>();
  for (const feature of features) {
    if (feature.category) {
      categories.add(feature.category);
    }
  }
  return Array.from(categories).sort();
}

/**
 * Filter features by date range, project, and category
 */
function filterFeatures(features: Feature[], filters: CompletedFeaturesFilters): Feature[] {
  let filtered = features;

  // Apply date range filter
  if (filters.dateRange !== 'all') {
    const { start, end } = getDateRangeBoundaries(filters.dateRange);
    filtered = filtered.filter((f) => {
      const date = getFeatureCompletionDate(f);
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    });
  }

  // Apply project filter
  if (filters.project !== 'all') {
    filtered = filtered.filter((f) => {
      // Features may have projectPath or we can match by branchName prefix
      const featureProject = (f as any).projectPath;
      return featureProject === filters.project;
    });
  }

  // Apply category filter
  if (filters.category !== 'all') {
    filtered = filtered.filter((f) => f.category === filters.category);
  }

  // Apply favorites filter
  if (filters.showFavoritesOnly) {
    filtered = filtered.filter((f) => f.isFavorite === true);
  }

  return filtered;
}

/**
 * CompletedFeatureCard displays a single completed feature with actions
 */
const CompletedFeatureCard = memo(function CompletedFeatureCard({
  feature,
  onRestore,
  onDelete,
  projectName,
}: {
  feature: Feature;
  onRestore: () => void;
  onDelete: () => void;
  projectName?: string;
}) {
  const completionDate = getFeatureCompletionDate(feature);
  const completionTimeStr = completionDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <Card
      className="flex flex-col hover:bg-accent/30 transition-colors"
      data-testid={`completed-card-${feature.id}`}
    >
      <CardHeader className="p-3 pb-2 flex-1">
        <CardTitle className="text-sm leading-tight line-clamp-2">
          {(feature.title as string | undefined) || feature.description || feature.id}
        </CardTitle>
        <CardDescription className="text-xs mt-1 flex flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <Tag className="w-3 h-3" />
              {feature.category || 'Uncategorized'}
            </span>
            {feature.branchName ? (
              <span className="text-muted-foreground/70 truncate max-w-[150px]">
                {feature.branchName as string}
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground/70">
            <Clock className="w-3 h-3" />
            {completionTimeStr}
          </span>
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
          onClick={onRestore}
          data-testid={`restore-${feature.id}`}
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Restore
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          data-testid={`delete-completed-${feature.id}`}
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
});

/**
 * DateGroupHeader displays the header for a date group with collapse toggle
 */
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
      {/* Collapse indicator */}
      <span className="text-muted-foreground">
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </span>

      {/* Calendar icon */}
      <Calendar className="w-4 h-4 text-muted-foreground" />

      {/* Group label */}
      <span className="font-medium text-sm">{group.label}</span>

      {/* Feature count */}
      <span className="text-xs text-muted-foreground">({group.features.length})</span>
    </button>
  );
});

/**
 * EmptyState displays a message when there are no completed features
 */
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
      data-testid="completed-features-empty"
    >
      <RotateCcw className="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p className="text-sm">
        {hasSearchQuery || hasFilters
          ? 'No completed features match your filters'
          : 'No completed features yet'}
      </p>
    </div>
  );
});

/**
 * FilterBar displays filter controls for the completed features list
 */
const FilterBar = memo(function FilterBar({
  filters,
  onFiltersChange,
  availableCategories,
  availableProjects,
  showProjectFilter,
  activeFilterCount,
  onClearFilters,
  hasFavorites,
}: {
  filters: CompletedFeaturesFilters;
  onFiltersChange: (filters: Partial<CompletedFeaturesFilters>) => void;
  availableCategories: string[];
  availableProjects?: Map<string, string>;
  showProjectFilter: boolean;
  activeFilterCount: number;
  onClearFilters: () => void;
  hasFavorites: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-muted/20"
      data-testid="completed-features-filter-bar"
    >
      {/* Filter icon label */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mr-1">
        <Filter className="w-4 h-4" />
        <span className="hidden sm:inline">Filters:</span>
      </div>

      {/* Favorites Toggle Button */}
      {hasFavorites && (
        <Button
          variant={filters.showFavoritesOnly ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'h-8 text-xs gap-1.5',
            filters.showFavoritesOnly &&
              'bg-amber-500 hover:bg-amber-600 text-white border-amber-500'
          )}
          onClick={() => onFiltersChange({ showFavoritesOnly: !filters.showFavoritesOnly })}
          data-testid="filter-favorites-toggle"
        >
          <Star className={cn('w-3.5 h-3.5', filters.showFavoritesOnly && 'fill-current')} />
          Favorites
        </Button>
      )}

      {/* Date Range Filter */}
      <Select
        value={filters.dateRange}
        onValueChange={(value) => onFiltersChange({ dateRange: value as DateRangePreset })}
      >
        <SelectTrigger
          className={cn(
            'w-[140px] h-8 text-xs',
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

      {/* Project Filter (only shown when viewing all projects) */}
      {showProjectFilter && availableProjects && availableProjects.size > 0 && (
        <Select
          value={filters.project}
          onValueChange={(value) => onFiltersChange({ project: value })}
        >
          <SelectTrigger
            className={cn(
              'w-[160px] h-8 text-xs',
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

      {/* Category Filter */}
      {availableCategories.length > 0 && (
        <Select
          value={filters.category}
          onValueChange={(value) => onFiltersChange({ category: value })}
        >
          <SelectTrigger
            className={cn(
              'w-[140px] h-8 text-xs',
              filters.category !== 'all' && 'border-primary/50 bg-primary/5'
            )}
            data-testid="filter-category"
          >
            <Tag className="w-3 h-3 mr-1.5 shrink-0" />
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {availableCategories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Active filter count badge and clear button */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1.5 ml-auto">
          <Badge variant="secondary" size="sm" className="font-normal">
            {activeFilterCount} active
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={onClearFilters}
            data-testid="clear-filters"
          >
            <X className="w-3 h-3 mr-1" />
            Clear
          </Button>
        </div>
      )}
    </div>
  );
});

/**
 * Default filter state
 */
const DEFAULT_FILTERS: CompletedFeaturesFilters = {
  dateRange: 'all',
  project: 'all',
  category: 'all',
  showFavoritesOnly: false,
};

/**
 * Page size options for pagination
 */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

/**
 * Default page size
 */
const DEFAULT_PAGE_SIZE: PageSize = 10;

/**
 * PageSizeSelector displays a dropdown to select the number of items per page
 */
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

/**
 * PaginationControls displays prev/next buttons with page info
 */
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
  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <div className="flex items-center gap-2" data-testid="pagination-nav">
      {/* Page info display */}
      <span className="text-sm text-muted-foreground mr-2" data-testid="page-info">
        {startItem}–{endItem} of {totalItems}
      </span>

      {/* Previous button */}
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onPreviousPage}
        disabled={!hasPrevious}
        data-testid="pagination-prev"
        aria-label="Previous page"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      {/* Page number display */}
      <span className="text-sm font-medium min-w-[80px] text-center" data-testid="page-number">
        Page {currentPage} of {totalPages}
      </span>

      {/* Next button */}
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onNextPage}
        disabled={!hasNext}
        data-testid="pagination-next"
        aria-label="Next page"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
});

/**
 * CompletedFeaturesListView displays completed features in a list format
 * grouped by completion date.
 *
 * Features:
 * - Groups features by completion date (Today, Yesterday, weekday, full date)
 * - Collapsible date groups
 * - Search functionality to filter features
 * - Filter by date range, project, and category
 * - Restore and delete actions for each feature
 * - Responsive grid layout for feature cards
 *
 * This component is designed to replace or augment the CompletedFeaturesModal
 * with a more feature-rich list view that supports date grouping, filtering,
 * and search capabilities.
 *
 * @example
 * ```tsx
 * <CompletedFeaturesListView
 *   completedFeatures={completedFeatures}
 *   onRestore={handleRestore}
 *   onDelete={handleDelete}
 *   availableProjects={projectMap}
 * />
 * ```
 */
export const CompletedFeaturesListView = memo(function CompletedFeaturesListView({
  completedFeatures,
  onRestore,
  onDelete,
  onClose,
  className,
  availableProjects,
  currentProjectPath,
}: CompletedFeaturesListViewProps) {
  // Search query state
  const [searchQuery, setSearchQuery] = useState('');

  // Filter state
  const [filters, setFilters] = useState<CompletedFeaturesFilters>(DEFAULT_FILTERS);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  // Track collapsed state for each date group
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Extract unique categories from all features (before filtering)
  const availableCategories = useMemo(() => {
    return extractUniqueCategories(completedFeatures);
  }, [completedFeatures]);

  // Build effective projects map: use passed-in availableProjects, or extract from features as fallback
  const effectiveProjects = useMemo(() => {
    if (availableProjects && availableProjects.size > 0) return availableProjects;
    const map = new Map<string, string>();
    for (const feature of completedFeatures) {
      const path = (feature as any).projectPath as string | undefined;
      const name = (feature as any).projectName as string | undefined;
      if (path && name && !map.has(path)) {
        map.set(path, name);
      }
    }
    return map;
  }, [availableProjects, completedFeatures]);

  // Determine if we should show the project filter
  // Show when there are multiple projects so users can filter by project
  const showProjectFilter = effectiveProjects.size > 1;

  // Check if any features are marked as favorites
  const hasFavorites = useMemo(() => {
    return completedFeatures.some((f) => f.isFavorite === true);
  }, [completedFeatures]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.dateRange !== 'all') count++;
    if (filters.project !== 'all') count++;
    if (filters.category !== 'all') count++;
    if (filters.showFavoritesOnly) count++;
    return count;
  }, [filters]);

  // Update filters - reset to first page when filters change
  const handleFiltersChange = useCallback((updates: Partial<CompletedFeaturesFilters>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
    setCurrentPage(1);
  }, []);

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setCurrentPage(1);
  }, []);

  // Handle page size change - reset to first page when size changes
  const handlePageSizeChange = useCallback((newSize: PageSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  }, []);

  // Apply filters to features
  const filteredByFilters = useMemo(() => {
    return filterFeatures(completedFeatures, filters);
  }, [completedFeatures, filters]);

  // Filter features by search query (applied after filter)
  const filteredFeatures = useMemo(() => {
    const normalizedQuery = searchQuery.toLowerCase().trim();
    if (!normalizedQuery) {
      return filteredByFilters;
    }

    return filteredByFilters.filter(
      (f) =>
        ((f.title as string | undefined) || '').toLowerCase().includes(normalizedQuery) ||
        (f.description as string).toLowerCase().includes(normalizedQuery) ||
        (f.category || '').toLowerCase().includes(normalizedQuery) ||
        ((f.branchName as string | undefined) || '').toLowerCase().includes(normalizedQuery) ||
        (((f as any).projectName as string | undefined) || '')
          .toLowerCase()
          .includes(normalizedQuery)
    );
  }, [filteredByFilters, searchQuery]);

  // Calculate pagination metadata
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredFeatures.length / pageSize));
  }, [filteredFeatures.length, pageSize]);

  // Handle previous page navigation
  const handlePreviousPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  }, []);

  // Handle next page navigation
  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  }, [totalPages]);

  // Calculate start and end item indices for display
  const paginationInfo = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredFeatures.length);
    return {
      startItem: filteredFeatures.length > 0 ? startIndex + 1 : 0,
      endItem: endIndex,
    };
  }, [currentPage, pageSize, filteredFeatures.length]);

  // Apply pagination to filtered features
  const paginatedFeatures = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredFeatures.slice(startIndex, endIndex);
  }, [filteredFeatures, currentPage, pageSize]);

  // Group paginated features by date
  const dateGroups = useMemo(() => {
    return groupFeaturesByDate(paginatedFeatures);
  }, [paginatedFeatures]);

  // Toggle group collapse state
  const toggleGroup = useCallback((dateKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  }, []);

  // Update search query - reset to first page when search changes
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  }, []);

  // Clear search query
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setCurrentPage(1);
  }, []);

  // Check if we have any active filters or search
  const hasFilters = activeFilterCount > 0;
  const hasSearchQuery = searchQuery.length > 0;

  return (
    <div
      className={cn('flex flex-col h-full bg-background', className)}
      data-testid="completed-features-list-view"
    >
      {/* Header with search */}
      <div className="flex items-center gap-4 p-4 border-b border-border">
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Completed Features</h2>
          <p className="text-sm text-muted-foreground">
            {filteredFeatures.length === completedFeatures.length
              ? `${completedFeatures.length} completed feature${completedFeatures.length !== 1 ? 's' : ''}`
              : `${filteredFeatures.length} of ${completedFeatures.length} features`}
          </p>
        </div>

        {/* Search input */}
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search completed features..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 pr-8 h-9"
            data-testid="completed-features-search"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Close button */}
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        availableCategories={availableCategories}
        availableProjects={effectiveProjects}
        showProjectFilter={showProjectFilter}
        activeFilterCount={activeFilterCount}
        onClearFilters={handleClearFilters}
        hasFavorites={hasFavorites}
      />

      {/* Pagination controls - Page size selector and navigation */}
      {filteredFeatures.length > 0 && (
        <div
          className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/10"
          data-testid="pagination-controls"
        >
          <PageSizeSelector
            pageSize={pageSize}
            onPageSizeChange={handlePageSizeChange}
            totalItems={filteredFeatures.length}
          />
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            onPreviousPage={handlePreviousPage}
            onNextPage={handleNextPage}
            startItem={paginationInfo.startItem}
            endItem={paginationInfo.endItem}
            totalItems={filteredFeatures.length}
          />
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {filteredFeatures.length === 0 ? (
          <EmptyState hasSearchQuery={hasSearchQuery} hasFilters={hasFilters} />
        ) : (
          <div className="pb-4">
            {dateGroups.map((group) => {
              const isExpanded = !collapsedGroups.has(group.dateKey);

              return (
                <div key={group.dateKey} data-testid={`date-group-${group.dateKey}`}>
                  {/* Group header */}
                  <DateGroupHeader
                    group={group}
                    isExpanded={isExpanded}
                    onToggle={() => toggleGroup(group.dateKey)}
                  />

                  {/* Group content */}
                  {isExpanded && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                      {group.features.map((feature) => {
                        const featureProjectPath = (feature as any).projectPath as
                          | string
                          | undefined;
                        const featureProjectName = (feature as any).projectName as
                          | string
                          | undefined;
                        const resolvedProjectName =
                          featureProjectName ||
                          (featureProjectPath && effectiveProjects.get(featureProjectPath)) ||
                          undefined;
                        return (
                          <CompletedFeatureCard
                            key={feature.id}
                            feature={feature}
                            onRestore={() => onRestore(feature)}
                            onDelete={() => onDelete(feature)}
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
