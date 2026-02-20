// @ts-nocheck
import { memo, useEffect, useMemo, useState } from 'react';
import { Feature, useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertCircle,
  Lock,
  Hand,
  Sparkles,
  Cloud,
  User,
  Clock,
  GitBranch,
  CircleDot,
  UserCheck,
  UserX,
} from 'lucide-react';
import { getBlockingDependencies } from '@automaker/dependency-resolver';

/** Uniform badge style for all card badges */
const uniformBadgeClass =
  'inline-flex items-center justify-center w-6 h-6 rounded-md border-[1.5px]';

interface CardBadgesProps {
  feature: Feature;
}

/**
 * CardBadges - Shows error badges below the card header
 * Note: Blocked/Lock badges are now shown in PriorityBadges for visual consistency
 */
export const CardBadges = memo(function CardBadges({ feature }: CardBadgesProps) {
  if (!feature.error) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pt-1.5 min-h-[24px]">
      {/* Error badge */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                uniformBadgeClass,
                'bg-[var(--status-error-bg)] border-[var(--status-error)]/40 text-[var(--status-error)]'
              )}
              data-testid={`error-badge-${feature.id}`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-[250px]">
            <p>{feature.error}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
});

interface PriorityBadgesProps {
  feature: Feature;
}

export const PriorityBadges = memo(function PriorityBadges({ feature }: PriorityBadgesProps) {
  const { enableDependencyBlocking, features } = useAppStore(
    useShallow((state) => ({
      enableDependencyBlocking: state.enableDependencyBlocking,
      features: state.features,
    }))
  );
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Calculate blocking dependencies (if feature is in backlog and has incomplete dependencies)
  const blockingDependencies = useMemo(() => {
    if (!enableDependencyBlocking || feature.status !== 'backlog') {
      return [];
    }
    return getBlockingDependencies(feature, features);
  }, [enableDependencyBlocking, feature, features]);

  const isJustFinished = useMemo(() => {
    if (!feature.justFinishedAt || feature.status !== 'waiting_approval' || feature.error) {
      return false;
    }
    const finishedTime = new Date(feature.justFinishedAt).getTime();
    const twoMinutes = 2 * 60 * 1000;
    return currentTime - finishedTime < twoMinutes;
  }, [feature.justFinishedAt, feature.status, feature.error, currentTime]);

  useEffect(() => {
    if (!feature.justFinishedAt || feature.status !== 'waiting_approval') {
      return;
    }

    const finishedTime = new Date(feature.justFinishedAt).getTime();
    const twoMinutes = 2 * 60 * 1000;
    const timeRemaining = twoMinutes - (currentTime - finishedTime);

    if (timeRemaining <= 0) {
      return;
    }

    // eslint-disable-next-line no-undef
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      // eslint-disable-next-line no-undef
      clearInterval(interval);
    };
  }, [feature.justFinishedAt, feature.status, currentTime]);

  const isBlocked =
    blockingDependencies.length > 0 && !feature.error && feature.status === 'backlog';
  const showManualVerification =
    feature.skipTests && !feature.error && feature.status === 'backlog';

  // Show "waiting for dependencies" badge when feature has waitForDependencies enabled
  // This indicates the feature is configured to wait, even if not currently blocked
  const showWaitingForDependencies =
    feature.waitForDependencies === true &&
    feature.status === 'backlog' &&
    !feature.error &&
    (feature.dependencies?.length ?? 0) > 0;

  // Show remote modified badge when feature was modified by another team member
  const showRemoteModified = feature.remoteModified && feature.remoteModifiedBy;

  const showBadges =
    feature.priority ||
    showManualVerification ||
    isBlocked ||
    showWaitingForDependencies ||
    isJustFinished ||
    showRemoteModified;

  if (!showBadges) {
    return null;
  }

  return (
    <div className="absolute top-2 left-2 flex items-center gap-1">
      {/* Priority badge */}
      {feature.priority && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  uniformBadgeClass,
                  feature.priority === 1 &&
                    'bg-[var(--status-error-bg)] border-[var(--status-error)]/40 text-[var(--status-error)]',
                  feature.priority === 2 &&
                    'bg-[var(--status-warning-bg)] border-[var(--status-warning)]/40 text-[var(--status-warning)]',
                  feature.priority === 3 &&
                    'bg-[var(--status-info-bg)] border-[var(--status-info)]/40 text-[var(--status-info)]'
                )}
                data-testid={`priority-badge-${feature.id}`}
              >
                <span className="font-bold text-xs">
                  {feature.priority === 1 ? 'H' : feature.priority === 2 ? 'M' : 'L'}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p>
                {feature.priority === 1
                  ? 'High Priority'
                  : feature.priority === 2
                    ? 'Medium Priority'
                    : 'Low Priority'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Manual verification badge */}
      {showManualVerification && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  uniformBadgeClass,
                  'bg-[var(--status-warning-bg)] border-[var(--status-warning)]/40 text-[var(--status-warning)]'
                )}
                data-testid={`skip-tests-badge-${feature.id}`}
              >
                <Hand className="w-3.5 h-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p>Manual verification required</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Blocked badge */}
      {isBlocked && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  uniformBadgeClass,
                  'bg-orange-500/20 border-orange-500/50 text-orange-500'
                )}
                data-testid={`blocked-badge-${feature.id}`}
              >
                <Lock className="w-3.5 h-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[250px]">
              <p className="font-medium mb-1">
                Blocked by {blockingDependencies.length} incomplete{' '}
                {blockingDependencies.length === 1 ? 'dependency' : 'dependencies'}
              </p>
              <p className="text-muted-foreground">
                {blockingDependencies
                  .map((depId) => {
                    const dep = features.find((f) => f.id === depId);
                    return dep?.description || depId;
                  })
                  .join(', ')}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Waiting for dependencies badge */}
      {showWaitingForDependencies && !isBlocked && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  uniformBadgeClass,
                  'bg-amber-500/20 border-amber-500/50 text-amber-500'
                )}
                data-testid={`waiting-dependencies-badge-${feature.id}`}
              >
                <Clock className="w-3.5 h-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[250px]">
              <p className="font-medium mb-1">Waiting for dependencies</p>
              <p className="text-muted-foreground">
                This feature will only start after its {feature.dependencies?.length}{' '}
                {feature.dependencies?.length === 1 ? 'dependency is' : 'dependencies are'}{' '}
                completed
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Just Finished badge */}
      {isJustFinished && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  uniformBadgeClass,
                  'bg-[var(--status-success-bg)] border-[var(--status-success)]/40 text-[var(--status-success)] animate-pulse'
                )}
                data-testid={`just-finished-badge-${feature.id}`}
              >
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p>Agent just finished working on this feature</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Remote Modified badge */}
      {showRemoteModified && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  uniformBadgeClass,
                  'bg-blue-500/20 border-blue-500/50 text-blue-500 animate-pulse'
                )}
                data-testid={`remote-modified-badge-${feature.id}`}
              >
                <Cloud className="w-3.5 h-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[200px]">
              <p className="font-medium mb-0.5">Modified by team member</p>
              <p className="text-muted-foreground">
                {feature.remoteModifiedBy?.name || feature.remoteModifiedBy?.email}
                {feature.remoteModifiedAt && (
                  <span className="block text-[10px]">
                    {new Date(feature.remoteModifiedAt).toLocaleString()}
                  </span>
                )}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
});

interface BranchBadgeProps {
  feature: Feature;
  showAllProjects: boolean;
  projectDefaultBranch?: string;
}

/**
 * BranchBadge - Shows the feature branch when in all-projects mode
 *
 * This badge is displayed in the card header area when viewing features across
 * all projects to help identify which branch each feature belongs to.
 */
export const BranchBadge = memo(function BranchBadge({
  feature,
  showAllProjects,
  projectDefaultBranch,
}: BranchBadgeProps) {
  // Only show in all-projects mode when there's a branch to display
  if (!showAllProjects) {
    return null;
  }

  // Determine the branch name to display
  // Priority: feature's branchName > project's defaultBranch > 'main'
  const branchName = feature.branchName || projectDefaultBranch || 'main';

  // Don't show badge if it's just the default 'main' with no explicit branch set
  if (!feature.branchName && !projectDefaultBranch) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground bg-muted/50 border border-border/50 max-w-[120px]"
            data-testid={`branch-badge-${feature.id}`}
          >
            <GitBranch className="w-3 h-3 shrink-0 text-muted-foreground/70" />
            <span className="font-mono truncate">{branchName}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <p>
            {feature.branchName
              ? `Feature branch: ${branchName}`
              : `Project default branch: ${branchName}`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

interface GitHubIssueBadgeProps {
  feature: Feature;
  /** The GitHub username of the current Automaker user */
  currentGitHubUser?: string | null;
}

/**
 * GitHubIssueBadge - Shows GitHub issue link, assignees, and claim status on a card.
 *
 * - No assignees: grey "unclaimed" badge
 * - Claimed by me: green badge with my username
 * - Claimed by others: amber badge with their username (warns this Automaker won't run it)
 */
export const GitHubIssueBadge = memo(function GitHubIssueBadge({
  feature,
  currentGitHubUser,
}: GitHubIssueBadgeProps) {
  if (!feature.githubIssue) return null;

  const { number, url, assignees } = feature.githubIssue;
  const isClaimed = assignees.length > 0;
  const isClaimedByMe = currentGitHubUser && assignees.includes(currentGitHubUser);
  const isClaimedByOther = isClaimed && !isClaimedByMe;
  const claimOwner = assignees[0];

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1 px-3">
      {/* Issue number link */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-muted/50 border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              data-testid={`github-issue-badge-${feature.id}`}
            >
              <CircleDot className="w-3 h-3 shrink-0" />
              <span>#{number}</span>
            </a>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            <p>GitHub Issue #{number}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Claim status badge */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] border',
                !isClaimed && 'bg-muted/30 border-border/40 text-muted-foreground',
                isClaimedByMe &&
                  'bg-green-500/15 border-green-500/40 text-green-600 dark:text-green-400',
                isClaimedByOther &&
                  'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400'
              )}
              data-testid={`claim-badge-${feature.id}`}
            >
              {!isClaimed && <UserX className="w-3 h-3 shrink-0" />}
              {isClaimedByMe && <UserCheck className="w-3 h-3 shrink-0" />}
              {isClaimedByOther && <User className="w-3 h-3 shrink-0" />}
              <span className="truncate max-w-[80px]">
                {!isClaimed && 'Unclaimed'}
                {isClaimedByMe && 'Claimed by me'}
                {isClaimedByOther && claimOwner}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-[220px]">
            {!isClaimed && (
              <p>No one has claimed this issue. Click "Claim" to assign yourself on GitHub.</p>
            )}
            {isClaimedByMe && <p>You have claimed this issue. Automaker will work on it.</p>}
            {isClaimedByOther && (
              <p>
                Claimed by <strong>{claimOwner}</strong> on GitHub. Automaker will refuse to execute
                this until you claim it.
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
});
