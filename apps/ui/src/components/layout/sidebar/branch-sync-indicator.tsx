import { memo, useState } from 'react';
import { AlertTriangle, ArrowDownUp, Bot, Loader2, RefreshCw, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { branchNeedsAttention, branchStateLabel } from '@/hooks/use-branch-sync';
import { BranchRefreshCountdown } from './branch-refresh-countdown';
import type { BranchSyncResult } from '@/lib/http-api-client';

interface BranchSyncIndicatorProps {
  branchName: string;
  /** Latest sync result for this branch; absent until the first check lands */
  sync?: BranchSyncResult;
  /** A check is in flight for this branch */
  isChecking: boolean;
  /** Epoch ms this branch is next due an automatic check */
  nextCheckAt?: number;
  /** The deterministic repair is running on this branch */
  isFixing: boolean;
  /** What the last repair did, in order — shown under the actions */
  fixSteps?: string[];
  /** Re-check this branch's project against its remote */
  onRefresh: () => void;
  /** Run the deterministic git repair (stash / fast-forward / rebase) */
  onAutoFix: () => void;
  /** Create a task on this branch for an agent to sort the mess out */
  onCreateFixTask: () => void;
}

/** Conflicts are the one state no amount of retrying will clear on its own. */
function hasConflicts(sync: BranchSyncResult | undefined): boolean {
  return !!sync && sync.conflictedFiles.length > 0;
}

/**
 * The per-branch sync control in the sidebar.
 *
 * Ordinarily it is a refresh icon that stays out of the way until you hover
 * the branch — the periodic check already keeps the branch level with its
 * remote, so there is usually nothing to say.
 *
 * When a branch falls into a state the automatic pass will not touch (dirty
 * and behind, diverged, or actually conflicted) the icon becomes a '!' that
 * breathes red and stops hiding, and clicking it explains what happened and
 * offers the two ways out: the deterministic repair, or an agent.
 */
export const BranchSyncIndicator = memo(function BranchSyncIndicator({
  branchName,
  sync,
  isChecking,
  nextCheckAt,
  isFixing,
  fixSteps,
  onRefresh,
  onAutoFix,
  onCreateFixTask,
}: BranchSyncIndicatorProps) {
  const [open, setOpen] = useState(false);

  const needsAttention = branchNeedsAttention(sync?.state);
  const conflicted = hasConflicts(sync);

  // Quiet state: a refresh icon that follows the section's hover reveal.
  if (!needsAttention) {
    const title = sync
      ? `${branchStateLabel(sync.state)}${sync.message ? ` — ${sync.message}` : ''}\nClick to check ${branchName} against its remote`
      : `Check ${branchName} against its remote`;

    return (
      <span className="flex items-center gap-1">
        <BranchRefreshCountdown dueAt={nextCheckAt} isChecking={isChecking} />
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'size-5 p-0',
            // The header's action slot no longer fades this in, so do it here —
            // an idle branch should not carry a permanent icon.
            'opacity-0 transition-opacity duration-100',
            'group-hover/section:opacity-100 focus-visible:opacity-100',
            isChecking && 'opacity-100'
          )}
          onClick={(event) => {
            event.stopPropagation();
            onRefresh();
          }}
          disabled={isChecking}
          title={title}
          data-testid="branch-sync-refresh"
          data-branch={branchName}
        >
          <RefreshCw className={cn('size-3', isChecking && 'animate-spin')} />
        </Button>
      </span>
    );
  }

  const canAutoFix = !!sync?.canAutoFix && !conflicted;

  return (
    <span className="flex items-center gap-1">
      <BranchRefreshCountdown dueAt={nextCheckAt} isChecking={isChecking} />
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'size-5 shrink-0 p-0 rounded',
              // Never hidden: the whole point is that it catches your eye while
              // you are looking at something else.
              'branch-sync-alert hover:!bg-destructive/30 hover:!text-destructive'
            )}
            onClick={(event) => event.stopPropagation()}
            title={`${branchStateLabel(sync!.state)} — ${sync?.message ?? branchName}`}
            aria-label={`${branchName}: ${branchStateLabel(sync!.state)}`}
            data-testid="branch-sync-alert"
            data-branch={branchName}
            data-state={sync?.state}
          >
            {isFixing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <AlertTriangle className="size-3" />
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-80 p-0"
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
        >
          <div className="border-b border-border/60 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-destructive">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span className="truncate">
                {sync ? branchStateLabel(sync.state) : 'Out of sync'}
              </span>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {branchName}
              {sync?.upstream ? ` → ${sync.upstream}` : ''}
            </p>
          </div>

          <div className="space-y-2 px-3 py-2">
            {sync?.message && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">{sync.message}</p>
            )}

            {sync && (sync.ahead > 0 || sync.behind > 0 || sync.dirtyCount > 0) && (
              <div className="flex flex-wrap items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
                <ArrowDownUp className="size-3" aria-hidden="true" />
                {sync.behind > 0 && <span>{sync.behind} behind</span>}
                {sync.ahead > 0 && <span>{sync.ahead} ahead</span>}
                {sync.dirtyCount > 0 && <span>{sync.dirtyCount} uncommitted</span>}
              </div>
            )}

            {conflicted && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Conflicted files
                </p>
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                  {sync!.conflictedFiles.map((file) => (
                    <li
                      key={file}
                      className="truncate font-mono text-[11px] text-foreground/80"
                      title={file}
                    >
                      {file}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {fixSteps && fixSteps.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Last repair
                </p>
                <ul className="mt-1 space-y-0.5">
                  {fixSteps.map((step, index) => (
                    <li key={`${index}-${step}`} className="text-[11px] text-muted-foreground">
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 border-t border-border/60 px-3 py-2">
            {/* Only offered when git can put this right on its own — a branch
              with real conflicts needs a judgement call, not a retry. */}
            {canAutoFix && (
              <Button
                variant="secondary"
                size="sm"
                className="h-7 flex-1 gap-1.5 text-[11px]"
                disabled={isFixing}
                onClick={() => {
                  onAutoFix();
                }}
                data-testid="branch-sync-auto-fix"
              >
                {isFixing ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Wrench className="size-3" />
                )}
                Auto fix
              </Button>
            )}

            <Button
              variant={canAutoFix ? 'ghost' : 'secondary'}
              size="sm"
              className="h-7 flex-1 gap-1.5 text-[11px]"
              onClick={() => {
                setOpen(false);
                onCreateFixTask();
              }}
              data-testid="branch-sync-fix-with-ai"
            >
              <Bot className="size-3" />
              Fix with AI
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="size-7 shrink-0 p-0"
              onClick={() => onRefresh()}
              disabled={isChecking}
              title="Re-check against the remote"
              data-testid="branch-sync-recheck"
            >
              <RefreshCw className={cn('size-3', isChecking && 'animate-spin')} />
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
});
