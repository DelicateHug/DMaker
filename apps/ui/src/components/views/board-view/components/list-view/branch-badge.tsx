import { memo } from 'react';
import { Feature } from '@/store/app-store';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/overlays';
import { GitBranch } from 'lucide-react';

interface BranchBadgeProps {
  feature: Feature;
  showAllProjects: boolean;
  projectDefaultBranch?: string;
}

/**
 * BranchBadge - Shows the feature branch when in all-projects mode
 *
 * This badge is displayed in the row when viewing features across
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
