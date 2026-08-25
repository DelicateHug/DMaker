import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Cloud, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/forms';
import { getHttpApiClient } from '@/lib/http-api-client';
import type { BranchDeleteInfo } from '@/types/electron';

/** The branch a right-click asked to delete. */
export interface BranchDeleteTarget {
  projectPath: string;
  branchName: string;
  /** Tasks still naming this branch — they survive, but are left dangling */
  featureCount: number;
}

interface DeleteBranchDialogProps {
  /** Non-null while the dialog is open */
  target: BranchDeleteTarget | null;
  onOpenChange: (open: boolean) => void;
  /** The branch is gone from the repo — refresh whatever renders from it */
  onDeleted: (projectPath: string) => void;
}

/** '2 commits' / '1 commit' — small enough to inline everywhere it's needed. */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Confirmation for deleting a branch the repository still has.
 *
 * Two things can make this destructive in ways a plain "are you sure" hides,
 * and each gets its own acknowledgement that the button waits for:
 *
 * - The branch also exists on the remote. Deleting it here does not remove it
 *   there, so the only honest options are "leave the remote alone" (which
 *   people read as a full delete and are wrong) or "take the remote too". This
 *   demands the second, explicitly, rather than letting a half-delete pass as
 *   the whole thing.
 * - The branch holds commits the trunk does not. Those go with it.
 *
 * The blocking cases — trunk, checked out, has a worktree — are reported here
 * rather than left to fail as a git error, because the fix is different in each
 * case and the user needs to be told which one they hit.
 */
export function DeleteBranchDialog({ target, onOpenChange, onDeleted }: DeleteBranchDialogProps) {
  const [info, setInfo] = useState<BranchDeleteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [ackRemote, setAckRemote] = useState(false);
  const [ackUnmerged, setAckUnmerged] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const open = !!target;
  const projectPath = target?.projectPath;
  const branchName = target?.branchName;

  // Every open starts from scratch: acknowledgements must never carry over from
  // the last branch someone looked at.
  useEffect(() => {
    if (!open || !projectPath || !branchName) return;

    setInfo(null);
    setLoadError(null);
    setDeleteError(null);
    setAckRemote(false);
    setAckUnmerged(false);
    setIsLoading(true);

    let cancelled = false;
    void (async () => {
      try {
        const result = await getHttpApiClient().worktree.getBranchDeleteInfo(
          projectPath,
          branchName
        );
        if (cancelled) return;
        if (result.success && result.info) setInfo(result.info);
        else setLoadError(result.error || 'Could not read the branch');
      } catch (error) {
        if (!cancelled)
          setLoadError(error instanceof Error ? error.message : 'Could not read the branch');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, projectPath, branchName]);

  /** Why this branch cannot be deleted at all, when it cannot. */
  const blockedReason = info?.isDefault
    ? `${info.branchName} is this repository's default branch.`
    : info?.isCurrent
      ? `${info.branchName} is checked out in the main working copy. Switch to another branch first.`
      : info?.worktreePath
        ? `${info.branchName} is checked out in a worktree. Remove that worktree first, which offers to take the branch with it.`
        : null;

  /** Nothing here to delete — the branch was only ever seen on the remote. */
  const remoteOnly = !!info && !info.hasLocal && !!info.remoteRef;
  const needsRemoteAck = !!info?.remoteRef;
  // A branch with no local ref has no local commits to lose, and `git branch
  // -d` is not what deletes it, so the unmerged question does not arise.
  const needsUnmergedAck = !!info && info.hasLocal && !info.isMerged && info.unmergedCommits > 0;
  const canDelete =
    !!info &&
    !blockedReason &&
    !isDeleting &&
    (!needsRemoteAck || ackRemote) &&
    (!needsUnmergedAck || ackUnmerged);

  const handleDelete = useCallback(async () => {
    if (!projectPath || !branchName || !info) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const result = await getHttpApiClient().worktree.deleteBranch(projectPath, branchName, {
        // Unmerged commits were acknowledged above; without force git refuses.
        force: needsUnmergedAck,
        deleteRemote: ackRemote && !!info.remoteRef,
      });

      if (!result.success) {
        setDeleteError(result.error || `Could not delete ${branchName}`);
        return;
      }

      onDeleted(projectPath);
      onOpenChange(false);

      // The remote half can fail on its own — no credentials, a protected
      // branch — long after the local one landed. Saying "deleted" there would
      // be a lie, so the two halves are reported separately.
      if (result.remoteError) {
        toast.warning(`Deleted ${branchName} locally only`, {
          description: `${info.remoteRef} could not be deleted: ${result.remoteError}`,
        });
      } else if (result.deleted?.remote) {
        toast.success(
          result.deleted.local
            ? `Deleted ${branchName} here and on ${info.remote}`
            : `Deleted ${branchName} on ${info.remote}`
        );
      } else {
        toast.success(`Deleted ${branchName}`);
      }
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : `Could not delete ${branchName}`);
    } finally {
      setIsDeleting(false);
    }
  }, [projectPath, branchName, info, needsUnmergedAck, ackRemote, onDeleted, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-popover border-border max-w-md"
        data-testid="delete-branch-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            <span className="truncate">Delete {branchName}?</span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {blockedReason
              ? 'This branch cannot be deleted from here.'
              : remoteOnly
                ? 'This branch has no copy here to remove. This cannot be undone.'
                : 'The branch is removed from this repository. This cannot be undone.'}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Checking the branch…
          </div>
        )}

        {loadError && (
          <p className="py-2 text-sm text-destructive" data-testid="delete-branch-load-error">
            {loadError}
          </p>
        )}

        {blockedReason && (
          <p className="py-2 text-sm text-foreground" data-testid="delete-branch-blocked">
            {blockedReason}
          </p>
        )}

        {info && !blockedReason && (
          <div className="flex flex-col gap-3 py-1">
            {/* Exists on the remote — the acknowledgement that gates the button */}
            {info.remoteRef && (
              <div
                className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3"
                data-testid="delete-branch-remote-warning"
              >
                <p className="flex items-start gap-2 text-xs leading-relaxed text-foreground">
                  <Cloud className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                  <span>
                    {remoteOnly ? (
                      <>
                        This branch only exists on the remote, as{' '}
                        <span className="font-mono">{info.remoteRef}</span>. Deleting it removes it
                        there, for everyone.
                      </>
                    ) : (
                      <>
                        This branch also exists on the remote as{' '}
                        <span className="font-mono">{info.remoteRef}</span>. Deleting it here does{' '}
                        <strong>not</strong> remove it there.
                      </>
                    )}
                  </span>
                </p>
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-relaxed">
                  <Checkbox
                    checked={ackRemote}
                    onCheckedChange={(checked) => setAckRemote(checked === true)}
                    className="mt-0.5"
                    data-testid="delete-branch-ack-remote"
                  />
                  <span>
                    I understand this will {remoteOnly ? '' : 'also '}delete{' '}
                    <span className="font-mono">{info.remoteRef}</span> on the remote.
                  </span>
                </label>
              </div>
            )}

            {/* Commits the trunk never got — they go with the branch */}
            {needsUnmergedAck && (
              <div
                className="rounded-md border border-destructive/40 bg-destructive/5 p-3"
                data-testid="delete-branch-unmerged-warning"
              >
                <p className="flex items-start gap-2 text-xs leading-relaxed text-foreground">
                  <AlertTriangle
                    className="mt-0.5 size-3.5 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  <span>
                    {plural(info.unmergedCommits, 'commit')} on this branch{' '}
                    {info.unmergedCommits === 1 ? 'is' : 'are'} not on{' '}
                    <span className="font-mono">{info.comparedAgainst ?? 'the trunk'}</span>.
                  </span>
                </p>
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-relaxed">
                  <Checkbox
                    checked={ackUnmerged}
                    onCheckedChange={(checked) => setAckUnmerged(checked === true)}
                    className="mt-0.5"
                    data-testid="delete-branch-ack-unmerged"
                  />
                  <span>Delete anyway, losing {plural(info.unmergedCommits, 'commit')}.</span>
                </label>
              </div>
            )}

            {info.isMerged && !info.remoteRef && (
              <p className="text-xs text-muted-foreground">
                Fully merged into{' '}
                <span className="font-mono">{info.comparedAgainst ?? 'the trunk'}</span> — nothing
                is lost.
              </p>
            )}

            {/* Tasks keep their branch name forever; deleting the branch leaves
                them pointing at nothing, which the sidebar then marks. */}
            {!!target?.featureCount && (
              <p className="text-xs text-muted-foreground" data-testid="delete-branch-task-note">
                {plural(target.featureCount, 'task')} still{' '}
                {target.featureCount === 1 ? 'points' : 'point'} at this branch. They are kept, and
                the sidebar will show the branch as deleted until you clear them.
              </p>
            )}
          </div>
        )}

        {deleteError && (
          <p className="text-sm text-destructive" data-testid="delete-branch-error">
            {deleteError}
          </p>
        )}

        <DialogFooter className="gap-2 pt-4 sm:gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="px-4"
            data-testid="cancel-delete-branch"
          >
            {blockedReason ? 'Close' : 'Cancel'}
          </Button>
          {!blockedReason && (
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={!canDelete}
              className="px-4"
              data-testid="confirm-delete-branch"
            >
              {isDeleting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 size-4" />
              )}
              {remoteOnly
                ? 'Delete on remote'
                : ackRemote && info?.remoteRef
                  ? 'Delete here and on remote'
                  : 'Delete branch'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
