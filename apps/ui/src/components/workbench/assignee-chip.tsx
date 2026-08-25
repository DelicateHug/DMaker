import { useState } from 'react';
import { Loader2, UserMinus, UserRound, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Feature } from '@/store/app-store';
import { getLinkedIssue, getProjectPath } from '@/components/layout/sidebar/status-meta';
import { getAssignmentState, unassignFeature } from '@/components/layout/sidebar/assign-actions';
import { useGithubCurrentUser } from '@/components/views/board-view/hooks/use-github-current-user';

interface AssigneeChipProps {
  feature: Feature;
}

/**
 * Who owns this task, in the workbench header.
 *
 * Ownership is not decoration here — it decides whether the task's agent is
 * allowed to change files at all. A task nobody holds, or one held by a
 * colleague, runs read-only, so the chip states the case plainly and gives the
 * one action that is yours to take: dropping your own claim.
 */
export function AssigneeChip({ feature }: AssigneeChipProps) {
  const projectPath = getProjectPath(feature);
  const currentUser = useGithubCurrentUser(projectPath);
  const [busy, setBusy] = useState(false);

  const issue = getLinkedIssue(feature);
  const { isMine, heldByOther, canUnassign } = getAssignmentState(feature, currentUser);

  const handleUnassign = async () => {
    setBusy(true);
    try {
      const error = await unassignFeature(feature);
      if (error) toast.error(error);
      else toast.success('Task unassigned');
    } finally {
      setBusy(false);
    }
  };

  // No issue means nobody can own it, which is why its agent cannot write.
  if (!issue) {
    return (
      <span
        className="flex items-center gap-1 rounded bg-[var(--status-error)]/10 px-1.5 py-0.5 text-[var(--status-error)]"
        title="This task has no GitHub issue, so nobody can own it and its agent cannot change files."
        data-testid="workbench-assignee-no-issue"
      >
        <UserX className="size-3" />
        No issue
      </span>
    );
  }

  if (heldByOther) {
    return (
      <span
        className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5"
        title={`${heldByOther} owns this task. Only its owner can change files for it.`}
        data-testid="workbench-assignee-other"
      >
        <UserRound className="size-3" />
        {heldByOther}
      </span>
    );
  }

  if (!isMine) {
    return (
      <span
        className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5"
        title="Nobody has claimed this task. Starting it assigns it to you."
        data-testid="workbench-assignee-unassigned"
      >
        <UserRound className="size-3" />
        Unassigned
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={!canUnassign || busy}
      onClick={() => void handleUnassign()}
      title="Unassign yourself from this task"
      data-testid="workbench-unassign"
      className={cn(
        'group/assignee flex items-center gap-1 rounded bg-muted px-1.5 py-0.5',
        'cursor-pointer transition-colors hover:text-foreground',
        busy && 'cursor-wait opacity-70'
      )}
    >
      {busy ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <>
          <UserRound className="size-3 group-hover/assignee:hidden" />
          <UserMinus className="hidden size-3 group-hover/assignee:block" />
        </>
      )}
      You
    </button>
  );
}
