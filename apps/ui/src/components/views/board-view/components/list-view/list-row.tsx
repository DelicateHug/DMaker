// TODO: Remove @ts-nocheck after fixing BaseFeature's index signature issue
// The `[key: string]: unknown` in BaseFeature causes property access type errors
// @ts-nocheck
import { memo, useCallback, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, Lock, Hand, Sparkles, FileText, ListTodo, Folder, Star } from 'lucide-react';
import type { Feature } from '@/store/app-store';
import { RowActions, type RowActionHandlers } from './row-actions';
import { BranchBadge } from '../kanban-card/card-badges';
import { formatModelName, DEFAULT_MODEL } from '@/lib/agent-context-parser';
import { getProviderIconForModel } from '@/components/ui/provider-icon';

export interface ListRowProps {
  /** The feature to display */
  feature: Feature;
  /** Action handlers for the row */
  handlers: RowActionHandlers;
  /** Whether this feature is the current auto task (agent is running) */
  isCurrentAutoTask?: boolean;
  /** Whether the row is selected */
  isSelected?: boolean;
  /** Whether to show the checkbox for selection */
  showCheckbox?: boolean;
  /** Callback when the row selection is toggled */
  onToggleSelect?: () => void;
  /** Callback when the row is clicked */
  onClick?: () => void;
  /** Callback when the favorite toggle is clicked */
  onToggleFavorite?: () => void;
  /** Blocking dependency feature IDs */
  blockingDependencies?: string[];
  /** Whether viewing all projects (shows branch badge) */
  showAllProjects?: boolean;
  /** The project's default branch (for branch badge display) */
  projectDefaultBranch?: string;
  /** Additional className for custom styling */
  className?: string;
}

/**
 * IndicatorBadges shows small indicator icons for special states (error, blocked, manual verification, just finished)
 */
const IndicatorBadges = memo(function IndicatorBadges({
  feature,
  blockingDependencies = [],
  isCurrentAutoTask,
}: {
  feature: Feature;
  blockingDependencies?: string[];
  isCurrentAutoTask?: boolean;
}) {
  const hasError = feature.error && !isCurrentAutoTask;
  const isBlocked =
    blockingDependencies.length > 0 && !feature.error && feature.status === 'backlog';
  const showManualVerification =
    feature.skipTests && !feature.error && feature.status === 'backlog';
  const hasPlan = feature.planSpec?.content;

  // Check if just finished (within 2 minutes) - uses timer to auto-expire
  const [isJustFinished, setIsJustFinished] = useState(false);

  useEffect(() => {
    if (!feature.justFinishedAt || feature.status !== 'waiting_approval' || feature.error) {
      setIsJustFinished(false);
      return;
    }

    const finishedTime = new Date(feature.justFinishedAt).getTime();
    const twoMinutes = 2 * 60 * 1000;
    const elapsed = Date.now() - finishedTime;

    if (elapsed >= twoMinutes) {
      setIsJustFinished(false);
      return;
    }

    // Set as just finished
    setIsJustFinished(true);

    // Set a timeout to clear the "just finished" state when 2 minutes have passed
    const remainingTime = twoMinutes - elapsed;
    const timeoutId = setTimeout(() => {
      setIsJustFinished(false);
    }, remainingTime);

    return () => clearTimeout(timeoutId);
  }, [feature.justFinishedAt, feature.status, feature.error]);

  const badges: Array<{
    key: string;
    icon: typeof AlertCircle;
    tooltip: string;
    colorClass: string;
    bgClass: string;
    borderClass: string;
    animate?: boolean;
  }> = [];

  if (hasError) {
    badges.push({
      key: 'error',
      icon: AlertCircle,
      tooltip: feature.error || 'Error',
      colorClass: 'text-[var(--status-error)]',
      bgClass: 'bg-[var(--status-error)]/15',
      borderClass: 'border-[var(--status-error)]/30',
    });
  }

  if (isBlocked) {
    badges.push({
      key: 'blocked',
      icon: Lock,
      tooltip: `Blocked by ${blockingDependencies.length} incomplete ${blockingDependencies.length === 1 ? 'dependency' : 'dependencies'}`,
      colorClass: 'text-orange-500',
      bgClass: 'bg-orange-500/15',
      borderClass: 'border-orange-500/30',
    });
  }

  if (showManualVerification) {
    badges.push({
      key: 'manual',
      icon: Hand,
      tooltip: 'Manual verification required',
      colorClass: 'text-[var(--status-warning)]',
      bgClass: 'bg-[var(--status-warning)]/15',
      borderClass: 'border-[var(--status-warning)]/30',
    });
  }

  if (hasPlan) {
    badges.push({
      key: 'plan',
      icon: FileText,
      tooltip: 'Has implementation plan',
      colorClass: 'text-[var(--status-info)]',
      bgClass: 'bg-[var(--status-info)]/15',
      borderClass: 'border-[var(--status-info)]/30',
    });
  }

  if (isJustFinished) {
    badges.push({
      key: 'just-finished',
      icon: Sparkles,
      tooltip: 'Agent just finished working on this feature',
      colorClass: 'text-[var(--status-success)]',
      bgClass: 'bg-[var(--status-success)]/15',
      borderClass: 'border-[var(--status-success)]/30',
      animate: true,
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      <TooltipProvider delayDuration={200}>
        {badges.map((badge) => (
          <Tooltip key={badge.key}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'inline-flex items-center justify-center w-5 h-5 rounded border',
                  badge.colorClass,
                  badge.bgClass,
                  badge.borderClass,
                  badge.animate && 'animate-pulse'
                )}
                data-testid={`list-row-badge-${badge.key}`}
              >
                <badge.icon className="w-3 h-3" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[250px]">
              <p>{badge.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>
    </div>
  );
});

/**
 * ModelBadge displays the AI model used for this feature
 */
const ModelBadge = memo(function ModelBadge({ feature }: { feature: Feature }) {
  if (!feature.model && feature.status === 'backlog') return null;

  const ProviderIcon = getProviderIconForModel(feature.model);
  const modelName = formatModelName(feature.model ?? DEFAULT_MODEL);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]',
              'bg-[var(--status-info)]/10 text-[var(--status-info)]',
              'border border-[var(--status-info)]/20'
            )}
            data-testid={`list-row-model-${feature.id}`}
          >
            <ProviderIcon className="w-3 h-3" />
            <span className="font-medium">{modelName}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p>AI Model: {modelName}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

/**
 * ProjectBadge displays the project name similar to the model badge
 */
const ProjectBadge = memo(function ProjectBadge({
  feature,
  showAllProjects,
}: {
  feature: Feature;
  showAllProjects?: boolean;
}) {
  // Get project name from feature (added in use-board-features.ts)
  const projectName = (feature as any).projectName;
  if (!projectName) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]',
              'bg-muted text-muted-foreground',
              'border border-border/50'
            )}
            data-testid={`list-row-project-${feature.id}`}
          >
            <Folder className="w-3 h-3" />
            <span className="font-medium truncate max-w-[80px]">{projectName}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p>Project: {projectName}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

/**
 * TaskProgress displays the task completion progress
 */
const TaskProgress = memo(function TaskProgress({ feature }: { feature: Feature }) {
  const planSpec = feature.planSpec;
  if (!planSpec || planSpec.tasksTotal === undefined || planSpec.tasksTotal === 0) return null;

  const completed = planSpec.tasksCompleted || 0;
  const total = planSpec.tasksTotal;
  const percentage = Math.round((completed / total) * 100);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]',
              completed === total
                ? 'bg-[var(--status-success)]/10 text-[var(--status-success)] border border-[var(--status-success)]/20'
                : 'bg-muted text-muted-foreground border border-border/50'
            )}
            data-testid={`list-row-progress-${feature.id}`}
          >
            <ListTodo className="w-3 h-3" />
            <span className="font-medium">
              {completed}/{total}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p>
            {completed} of {total} tasks completed ({percentage}%)
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

/**
 * ListRow displays a single feature as a compact vertical card in the list view.
 *
 * Features:
 * - Vertical card layout with compact styling
 * - Title and description stacked vertically
 * - Badges wrap in a horizontal row below content
 * - Actions positioned at the top-right corner
 * - Hover state with subtle elevation and highlight
 * - Click handler for opening feature details
 * - Animated border for currently running auto task
 * - Indicator badges for errors, blocked state, manual verification, etc.
 * - Selection checkbox for bulk operations
 *
 * @example
 * ```tsx
 * <ListRow
 *   feature={feature}
 *   handlers={{
 *     onEdit: () => handleEdit(feature.id),
 *     onDelete: () => handleDelete(feature.id),
 *     // ... other handlers
 *   }}
 *   onClick={() => handleViewDetails(feature)}
 * />
 * ```
 */
export const ListRow = memo(function ListRow({
  feature,
  handlers,
  isCurrentAutoTask = false,
  isSelected = false,
  showCheckbox = false,
  onToggleSelect,
  onClick,
  onToggleFavorite,
  blockingDependencies = [],
  showAllProjects = false,
  projectDefaultBranch,
  className,
}: ListRowProps) {
  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't trigger row click if clicking on checkbox or actions
      if ((e.target as HTMLElement).closest('[data-testid^="row-actions"]')) {
        return;
      }
      if ((e.target as HTMLElement).closest('input[type="checkbox"]')) {
        return;
      }
      if ((e.target as HTMLElement).closest('button')) {
        return;
      }
      onClick?.();
    },
    [onClick]
  );

  const handleCheckboxChange = useCallback(() => {
    onToggleSelect?.();
  }, [onToggleSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.();
      }
    },
    [onClick]
  );

  const hasError = feature.error && !isCurrentAutoTask;

  const rowContent = (
    <div
      role="row"
      tabIndex={onClick ? 0 : undefined}
      onClick={handleRowClick}
      onKeyDown={onClick ? handleKeyDown : undefined}
      className={cn(
        'group relative flex flex-col gap-1 px-3 py-2.5',
        'border border-border/50 rounded-lg',
        'transition-all duration-200',
        onClick && 'cursor-pointer',
        'hover:bg-accent/50 hover:border-border hover:shadow-sm',
        isSelected && 'bg-accent/70 border-primary/30',
        hasError &&
          'bg-[var(--status-error)]/5 border-[var(--status-error)]/20 hover:bg-[var(--status-error)]/10',
        className
      )}
      data-testid={`list-row-${feature.id}`}
    >
      {/* Top section: Checkbox, Title, Favorite, and Actions */}
      <div className="flex items-start gap-2 min-w-0">
        {/* Checkbox */}
        {showCheckbox && (
          <div className="flex items-center pt-0.5 shrink-0">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={handleCheckboxChange}
              className={cn(
                'h-4 w-4 rounded border-border text-primary cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
              )}
              aria-label={`Select ${feature.title || feature.description}`}
              data-testid={`list-row-checkbox-${feature.id}`}
            />
          </div>
        )}

        {/* Favorite toggle */}
        {onToggleFavorite && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'shrink-0 w-4 h-4 mt-0.5 flex items-center justify-center transition-colors',
                    feature.isFavorite
                      ? 'text-yellow-500 hover:text-yellow-600'
                      : 'text-muted-foreground/40 hover:text-yellow-500'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite();
                  }}
                  data-testid={`list-favorite-toggle-${feature.id}`}
                >
                  <Star className={cn('w-3.5 h-3.5', feature.isFavorite && 'fill-current')} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p>{feature.isFavorite ? 'Remove from favorites' : 'Add to favorites'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Title */}
        <div className="flex-1 min-w-0">
          <span
            className={cn(
              'text-sm font-medium line-clamp-2',
              feature.titleGenerating && 'animate-pulse text-muted-foreground'
            )}
            title={feature.title || feature.description}
          >
            {feature.title || feature.description}
          </span>
        </div>

        {/* Actions - positioned at top right */}
        <div className="flex items-center shrink-0 -mr-1 -mt-0.5">
          <RowActions feature={feature} handlers={handlers} isCurrentAutoTask={isCurrentAutoTask} />
        </div>
      </div>

      {/* Description */}
      {feature.title && feature.title !== feature.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 pl-0" title={feature.description}>
          {feature.description}
        </p>
      )}

      {/* Summary */}
      {feature.summary && (
        <p className="text-xs text-muted-foreground/80 line-clamp-1 italic" title={feature.summary}>
          {feature.summary}
        </p>
      )}

      {/* Badges row - wrapping */}
      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
        <IndicatorBadges
          feature={feature}
          blockingDependencies={blockingDependencies}
          isCurrentAutoTask={isCurrentAutoTask}
        />
        <ModelBadge feature={feature} />
        <ProjectBadge feature={feature} showAllProjects={showAllProjects} />
        <TaskProgress feature={feature} />
        <BranchBadge
          feature={feature}
          showAllProjects={showAllProjects}
          projectDefaultBranch={projectDefaultBranch}
        />
      </div>
    </div>
  );

  // Wrap with animated border for currently running auto task
  if (isCurrentAutoTask) {
    return <div className="animated-border-wrapper-row">{rowContent}</div>;
  }

  return rowContent;
});

/**
 * Helper function to get feature sort value for a column
 */
export function getFeatureSortValue(
  feature: Feature,
  column: 'title' | 'status' | 'category' | 'priority' | 'createdAt' | 'updatedAt'
): string | number | Date {
  switch (column) {
    case 'title':
      return (feature.title || feature.description || '').toLowerCase();
    case 'status':
      return feature.status;
    case 'category':
      return (feature.category || '').toLowerCase();
    case 'priority':
      return feature.priority || 999; // No priority sorts last
    case 'createdAt':
      return feature.createdAt ? new Date(feature.createdAt) : new Date(0);
    case 'updatedAt':
      return feature.updatedAt ? new Date(feature.updatedAt) : new Date(0);
    default:
      return '';
  }
}

/**
 * Helper function to sort features by a column
 */
export function sortFeatures(
  features: Feature[],
  column: 'title' | 'status' | 'category' | 'priority' | 'createdAt' | 'updatedAt',
  direction: 'asc' | 'desc'
): Feature[] {
  return [...features].sort((a, b) => {
    const aValue = getFeatureSortValue(a, column);
    const bValue = getFeatureSortValue(b, column);

    let comparison = 0;

    if (aValue instanceof Date && bValue instanceof Date) {
      comparison = aValue.getTime() - bValue.getTime();
    } else if (typeof aValue === 'number' && typeof bValue === 'number') {
      comparison = aValue - bValue;
    } else {
      comparison = String(aValue).localeCompare(String(bValue));
    }

    return direction === 'asc' ? comparison : -comparison;
  });
}
