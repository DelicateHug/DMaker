import { createLogger } from '@dmaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore, type Feature } from '@/store/app-store';
import { protectOptimisticUpdate } from '@/components/views/board-view/hooks/use-board-persistence';
import { resolveCurrentUser } from '@/components/views/board-view/hooks/use-github-current-user';
import { getLinkedIssue, getProjectPath } from './status-meta';

const logger = createLogger('FeatureAssignment');

/** The GitHub issue shape a task carries once it is linked. */
interface LinkedIssueState {
  number: number;
  url: string;
  assignees: string[];
  labels: string[];
  state: 'open' | 'closed';
  syncedAt?: string;
}

/** What the UI needs to know to offer — or refuse — an unassign. */
export interface AssignmentState {
  /** Logins holding the task, from its GitHub issue. */
  assignees: string[];
  /** Whether the current `gh` user is one of them. */
  isMine: boolean;
  /** Someone else holds it, and they are named. */
  heldByOther: string | null;
  /** Whether "Unassign" should do anything at all. */
  canUnassign: boolean;
}

/**
 * Read a task's assignment for display.
 *
 * `currentUser` is the `gh` login, which the caller usually already has from
 * `useGithubCurrentUser`; pass null when it is still loading and the result
 * degrades to "not mine" rather than guessing.
 */
export function getAssignmentState(feature: Feature, currentUser: string | null): AssignmentState {
  const issue = feature.githubIssue as LinkedIssueState | undefined;
  const assignees = issue?.assignees ?? [];
  const isMine = !!currentUser && assignees.includes(currentUser);
  const heldByOther = !isMine && assignees.length > 0 ? assignees[0] : null;

  return {
    assignees,
    isMine,
    heldByOther,
    // Only your own claim is yours to drop. Taking a task off a colleague is a
    // decision for them, not a right-click.
    canUnassign: isMine,
  };
}

/**
 * Release the current user's claim on a task.
 *
 * Ownership lives on the GitHub issue, so this removes you from its assignees
 * and clears the local `claimedBy` mirror. The board updates first and the
 * request follows, guarded by `protectOptimisticUpdate` so the next poll of
 * the server's feature cache cannot put the claim back before GitHub has
 * caught up.
 *
 * Returns the error when it fails, or null on success — the caller decides
 * whether that is worth putting on screen.
 */
export async function unassignFeature(feature: Feature): Promise<string | null> {
  const { updateFeature, currentProject } = useAppStore.getState();
  const projectPath = getProjectPath(feature) || currentProject?.path;
  const issue = getLinkedIssue(feature);

  if (!projectPath) return 'This task has no project behind it.';
  if (!issue) return 'This task has no GitHub issue, so there is nothing to unassign.';

  const currentUser = await resolveCurrentUser(projectPath);
  if (!currentUser) {
    return 'The GitHub CLI could not say who you are. Run `gh auth login` and try again.';
  }

  const previous = feature.githubIssue as LinkedIssueState | undefined;
  const previousAssignees = previous?.assignees ?? [];
  if (!previousAssignees.includes(currentUser)) {
    return `This task is not assigned to you${previousAssignees.length ? ` — ${previousAssignees[0]} holds it` : ''}.`;
  }

  const optimistic: Partial<Feature> = {
    claimedBy: undefined,
    claimedAt: undefined,
    githubIssue: {
      ...(previous as LinkedIssueState),
      assignees: previousAssignees.filter((login) => login !== currentUser),
    },
  } as Partial<Feature>;

  updateFeature(feature.id, optimistic);
  protectOptimisticUpdate(feature.id);

  try {
    const api = getElectronAPI();
    if (!api.github?.unclaimIssue) throw new Error('GitHub API not available');

    const result = await api.github.unclaimIssue(projectPath, feature.id, issue.number);
    if (!result.success) throw new Error(result.error || 'Failed to unassign the task');

    return null;
  } catch (error) {
    logger.error('Failed to unassign feature', { featureId: feature.id, error });
    // Put the claim back rather than leaving a lie on screen.
    updateFeature(feature.id, {
      claimedBy: feature.claimedBy,
      claimedAt: feature.claimedAt,
      githubIssue: previous,
    } as Partial<Feature>);
    return error instanceof Error ? error.message : 'Failed to unassign the task';
  }
}
