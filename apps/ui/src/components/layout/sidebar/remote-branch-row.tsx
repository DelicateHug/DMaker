import { memo } from 'react';
import { CloudDownload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RemoteBranchInfo } from '@/lib/http-api-client';

interface RemoteBranchAdoptRowProps {
  branch: RemoteBranchInfo;
  /** A worktree is being created for this branch right now */
  isAdopting: boolean;
  /** Create the worktree so the branch becomes a real workspace */
  onAdopt: (branchName: string) => void;
}

/** '3 days ago' style age, kept short enough for the sidebar's right cluster. */
export function formatBranchAge(iso?: string): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;

  return `${Math.round(months / 12)}y`;
}

/**
 * What sits inside a branch group that exists only on the remote.
 *
 * The branch has no worktree here, so it has no tasks and never will until it
 * gets one — which makes 'no tasks' the wrong thing to say. It says what the
 * branch is instead, and offers the one action that changes anything.
 */
export const RemoteBranchAdoptRow = memo(function RemoteBranchAdoptRow({
  branch,
  isAdopting,
  onAdopt,
}: RemoteBranchAdoptRowProps) {
  const detail = [
    branch.remoteRef,
    branch.lastCommitBy ? `last commit by ${branch.lastCommitBy}` : null,
    branch.lastCommitSubject || null,
  ]
    .filter(Boolean)
    .join(' — ');

  return (
    <button
      type="button"
      onClick={() => onAdopt(branch.name)}
      disabled={isAdopting}
      title={`${detail}\nClick to create a worktree for this branch`}
      data-testid="sidebar-remote-branch-row"
      data-branch={branch.name}
      className={cn(
        'group/remote flex w-full items-center gap-2 rounded-md py-1 pl-3 pr-1.5 text-left',
        'transition-colors duration-100 cursor-pointer',
        'hover:bg-accent/60 disabled:cursor-wait disabled:opacity-60'
      )}
    >
      {isAdopting ? (
        <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <CloudDownload className="size-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
      )}

      <span className="min-w-0 flex-1 truncate text-[11px] leading-5 text-muted-foreground/80">
        {isAdopting ? 'Creating worktree…' : 'On the remote only — create a worktree'}
      </span>
    </button>
  );
});
