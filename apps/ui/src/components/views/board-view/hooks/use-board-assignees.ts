import { useMemo } from 'react';
import type { Feature } from '@dmaker/types';

/**
 * Assignee filtering for the board and the sidebar task list.
 *
 * "Who is on this task" comes from GitHub: an issue's assignees, plus the
 * `claimedBy` login DMaker writes when someone claims a task through the app.
 * The `gh` CLI is what tells us which of those logins is *you* — see
 * `use-github-current-user`, which shells out to `gh api user` through the
 * server — so "Me" can resolve to a real account rather than a guess.
 */

/** No narrowing at all. Always alone in the selection when present. */
export const ASSIGNEE_ALL = '__all_assignees__';

/** The `gh` CLI's authenticated user, resolved at filter time. */
export const ASSIGNEE_ME = '__me__';

/** Tasks nobody has taken. */
export const ASSIGNEE_UNASSIGNED = '__unassigned__';

/** The default selection: everything. */
export const DEFAULT_ASSIGNEE_FILTER: string[] = [ASSIGNEE_ALL];

export interface AssigneeOption {
  /** A GitHub login, or one of the special ids above */
  id: string;
  /** What the dropdown shows */
  label: string;
  /** How many currently visible tasks this matches */
  count: number;
  /** True for Me / Unassigned, which are computed rather than listed logins */
  isSpecial?: boolean;
}

/**
 * Every login attached to a task. GitHub allows several assignees per issue,
 * and a locally claimed task carries its claimer separately, so both are read.
 */
export function getFeatureAssignees(feature: Feature): string[] {
  const logins = new Set<string>();

  for (const login of feature.githubIssue?.assignees ?? []) {
    if (login) logins.add(login);
  }
  if (feature.claimedBy) logins.add(feature.claimedBy);

  return [...logins];
}

/**
 * Does a task survive the current assignee selection?
 *
 * The selection is a union: picking two people shows the tasks of either.
 * `currentUser` is null when `gh` is not authenticated, in which case "Me"
 * matches nothing rather than silently matching everything.
 */
export function matchesAssigneeFilter(
  feature: Feature,
  selected: string[],
  currentUser: string | null
): boolean {
  if (selected.length === 0 || selected.includes(ASSIGNEE_ALL)) return true;

  const assignees = getFeatureAssignees(feature);

  for (const choice of selected) {
    if (choice === ASSIGNEE_UNASSIGNED) {
      if (assignees.length === 0) return true;
      continue;
    }
    if (choice === ASSIGNEE_ME) {
      if (currentUser && assignees.includes(currentUser)) return true;
      continue;
    }
    if (assignees.includes(choice)) return true;
  }

  return false;
}

/**
 * Toggle one option in a staged selection, keeping "All" mutually exclusive
 * with everything else and never leaving the selection empty.
 */
export function toggleAssigneeSelection(current: string[], id: string): string[] {
  if (id === ASSIGNEE_ALL) return [ASSIGNEE_ALL];

  if (current.includes(id)) {
    const remaining = current.filter((entry) => entry !== id);
    return remaining.length === 0 ? [ASSIGNEE_ALL] : remaining;
  }

  return [...current.filter((entry) => entry !== ASSIGNEE_ALL), id];
}

interface UseBoardAssigneesOptions {
  /** The tasks the board is showing, before assignee narrowing */
  features: Feature[];
  /** The `gh` CLI user, or null when it could not be resolved */
  currentUser: string | null;
}

/**
 * The assignee list the filter offers, built from whoever actually appears on
 * the visible tasks. Logins are sorted by task count, then alphabetically, so
 * the busiest people are easy to reach; "Me" and "Unassigned" lead the list.
 */
export function useBoardAssignees({
  features,
  currentUser,
}: UseBoardAssigneesOptions): AssigneeOption[] {
  return useMemo(() => {
    const counts = new Map<string, number>();
    let unassigned = 0;
    let mine = 0;

    for (const feature of features) {
      const assignees = getFeatureAssignees(feature);
      if (assignees.length === 0) {
        unassigned += 1;
        continue;
      }
      if (currentUser && assignees.includes(currentUser)) mine += 1;
      for (const login of assignees) {
        counts.set(login, (counts.get(login) ?? 0) + 1);
      }
    }

    const people: AssigneeOption[] = [...counts.entries()]
      .map(([login, count]) => ({
        id: login,
        label: currentUser && login === currentUser ? `${login} (you)` : login,
        count,
      }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

    const options: AssigneeOption[] = [];
    if (currentUser) {
      options.push({ id: ASSIGNEE_ME, label: 'Me', count: mine, isSpecial: true });
    }
    options.push({
      id: ASSIGNEE_UNASSIGNED,
      label: 'Unassigned',
      count: unassigned,
      isSpecial: true,
    });

    return [...options, ...people];
  }, [features, currentUser]);
}
