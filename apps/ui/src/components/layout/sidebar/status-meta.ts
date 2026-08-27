import {
  BadgeCheck,
  CircleCheck,
  CircleEllipsis,
  CirclePause,
  CirclePlay,
  Hammer,
  Inbox,
  NotebookPen,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { Feature } from '@/store/app-store';
import { isPipelineStatus } from '@/components/views/board-view/constants';

/**
 * Shared status vocabulary for the sidebar and workbench header.
 *
 * DMaker's own status names are kept as-is — this only derives the presentation
 * (icon, colour, label, whether the agent is actively working) so the sidebar,
 * command palette and workbench header all agree.
 *
 * Every status carries its own glyph rather than a shared dot, so a row's state
 * is readable at a glance without decoding colour alone — which also keeps the
 * distinctions visible to anyone who cannot separate the status hues.
 */

export interface StatusMeta {
  label: string;
  /** CSS colour expression for the status icon */
  dotColor: string;
  /** Glyph that identifies this status on its own, without relying on colour */
  Icon: LucideIcon;
  /** Agent is actively doing work — the icon spins */
  isWorking: boolean;
}

const STATUS_META: Record<string, StatusMeta> = {
  backlog: { label: 'Backlog', dotColor: 'var(--status-backlog)', Icon: Inbox, isWorking: false },
  planning: {
    label: 'Planning',
    dotColor: 'var(--status-planning)',
    Icon: NotebookPen,
    isWorking: true,
  },
  in_progress: {
    label: 'In Progress',
    dotColor: 'var(--status-in-progress)',
    Icon: CirclePlay,
    isWorking: true,
  },
  building: {
    label: 'Building',
    dotColor: 'var(--status-building)',
    Icon: Hammer,
    isWorking: true,
  },
  // Stopped on purpose, waiting for you — a pause, not a failure.
  waiting_approval: {
    label: 'Waiting Approval',
    dotColor: 'var(--status-waiting)',
    Icon: CirclePause,
    isWorking: false,
  },
  completed: {
    label: 'Completed',
    dotColor: 'var(--status-success)',
    Icon: CircleCheck,
    isWorking: false,
  },
  // Distinct from completed: the work was checked, not merely finished.
  verified: {
    label: 'Verified',
    dotColor: 'var(--status-success)',
    Icon: BadgeCheck,
    isWorking: false,
  },
};

const UNKNOWN_STATUS: StatusMeta = {
  label: 'Unknown',
  dotColor: 'var(--status-backlog)',
  Icon: CircleEllipsis,
  isWorking: false,
};

const PIPELINE_STATUS: StatusMeta = {
  label: 'Pipeline',
  dotColor: 'var(--status-in-progress)',
  Icon: Workflow,
  isWorking: true,
};

export function getStatusMeta(status: string | undefined): StatusMeta {
  if (!status) return UNKNOWN_STATUS;
  if (isPipelineStatus(status)) return PIPELINE_STATUS;
  return STATUS_META[status] ?? UNKNOWN_STATUS;
}

/**
 * A feature needs the user's attention when the agent stopped on an error or
 * paused for plan approval. These surface as a warning marker in the sidebar.
 */
export function needsAttention(feature: Feature): boolean {
  if (feature.error) return true;
  return feature.planSpec?.status === 'generated' && !feature.planSpec.reviewedByUser;
}

/**
 * Pull request number for this feature, parsed out of the stored PR URL
 * (e.g. https://github.com/owner/repo/pull/41 -> 41).
 *
 * Note this is distinct from the linked *issue* number.
 */
export function getPullRequestNumber(feature: Feature): number | null {
  if (!feature.prUrl) return null;
  const match = /\/pull\/(\d+)/.exec(feature.prUrl);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

// ---------------------------------------------------------------------------
// Narrowing accessors
//
// The UI's Feature is declared as `extends Omit<BaseFeature, ...>`, and
// BaseFeature carries a `[key: string]: unknown` index signature. `Omit` on a
// type with a string index signature collapses `keyof T` to `string | number`,
// which drops every named property — so fields the UI does not explicitly
// redeclare (branchName, githubIssue, isFavorite, ...) surface as `unknown`
// rather than their real types.
//
// That is a pre-existing defect in app-store's Feature declaration and the
// cause of the same errors in branch-badge, row-actions and github-issue-dialog.
// Until it is fixed at the source, these helpers do the narrowing once so
// callers get real types instead of scattering casts.
// ---------------------------------------------------------------------------

/** Git branch (and therefore worktree) this feature runs on. */
export function getBranchName(feature: Feature): string | undefined {
  const branchName: unknown = feature.branchName;
  return typeof branchName === 'string' && branchName ? branchName : undefined;
}

/** Whether the user pinned this feature. */
export function isPinned(feature: Feature): boolean {
  return feature.isFavorite === true;
}

interface LinkedIssue {
  number: number;
  url: string;
}

/** Linked GitHub issue, if the feature came from or was linked to one. */
export function getLinkedIssue(feature: Feature): LinkedIssue | null {
  const issue = feature.githubIssue as { number?: unknown; url?: unknown } | undefined;
  if (!issue) return null;
  if (typeof issue.number !== 'number' || typeof issue.url !== 'string') return null;
  return { number: issue.number, url: issue.url };
}

/** Absolute path of the project a feature belongs to, when known. */
export function getProjectPath(feature: Feature): string | undefined {
  const projectPath: unknown = (feature as { projectPath?: unknown }).projectPath;
  return typeof projectPath === 'string' && projectPath ? projectPath : undefined;
}

/** Display name of the project a feature belongs to, when known. */
export function getProjectName(feature: Feature): string | undefined {
  const projectName: unknown = (feature as { projectName?: unknown }).projectName;
  return typeof projectName === 'string' && projectName ? projectName : undefined;
}
