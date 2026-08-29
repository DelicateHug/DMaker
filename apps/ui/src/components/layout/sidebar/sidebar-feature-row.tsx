import { memo, type DragEvent, type MouseEvent } from 'react';
import { ArrowDown, ArrowUp, GitPullRequest, AlertTriangle, Loader2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Feature } from '@/store/app-store';
import type { WorktreeSyncStatus } from '@/lib/http-api-client';
import {
  getStatusMeta,
  needsAttention,
  getPullRequestNumber,
  getBranchName,
  isPinned,
  getProjectName,
  getProjectPath,
} from './status-meta';

interface SidebarFeatureRowProps {
  feature: Feature;
  /** This row's feature is open in the workbench */
  isActive: boolean;
  /** This row is part of a multi-select */
  isSelected: boolean;
  /** Ahead/behind + dirty counts for this feature's branch, if known */
  syncStatus?: WorktreeSyncStatus;
  /** Agent is currently running for this feature */
  isRunning: boolean;
  onOpen: (featureId: string, event: MouseEvent) => void;
  /** Right-click on the row */
  onContextMenu?: (featureId: string, event: MouseEvent<HTMLElement>) => void;
  /** Nudge the row right so it reads as a child of a pin group */
  indented?: boolean;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
  /** A dragged row is hovering this one — dropping here makes a group */
  isDropTarget?: boolean;
  /** This row is the one being dragged */
  isDragging?: boolean;
  /** Show project and branch info (for pinned rows) */
  showMetadata?: boolean;
}

/**
 * One workspace row in the sidebar.
 *
 * Layout mirrors the density of a file-tree row: status dot, title, then a
 * right-aligned cluster of ahead/behind counts and a PR badge.
 */
export const SidebarFeatureRow = memo(function SidebarFeatureRow({
  feature,
  isActive,
  isSelected,
  syncStatus,
  isRunning,
  onOpen,
  onContextMenu,
  indented,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  isDropTarget,
  isDragging,
  showMetadata,
}: SidebarFeatureRowProps) {
  const statusMeta = getStatusMeta(feature.status);
  const StatusIcon = statusMeta.Icon;
  const attention = needsAttention(feature);
  const prNumber = getPullRequestNumber(feature);
  const branchName = getBranchName(feature);
  const projectName = getProjectName(feature);
  const projectPath = getProjectPath(feature);
  const title = feature.title || feature.description || 'Untitled feature';

  const ahead = syncStatus?.ahead ?? 0;
  const behind = syncStatus?.behind ?? 0;
  const isDirty = (syncStatus?.dirtyCount ?? 0) > 0;

  // A spinner means "an agent is working on this right now". Every other state
  // shows its own status glyph, so the row reads without decoding colour.
  // `runningTasks` is rehydrated from the server on load, so this stays honest
  // across a refresh rather than spinning forever on a stale status.

  return (
    <button
      type="button"
      onClick={(event) => onOpen(feature.id, event)}
      onContextMenu={onContextMenu ? (event) => onContextMenu(feature.id, event) : undefined}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      title={`${title} — ${statusMeta.label}${branchName ? ` (${branchName})` : ''}${projectName ? ` in ${projectName}` : ''}`}
      data-testid="sidebar-feature-row"
      data-feature-id={feature.id}
      className={cn(
        'group relative flex w-full items-center gap-2 rounded-md py-1 pl-2 pr-1.5 text-left',
        'transition-colors duration-100 cursor-pointer',
        'hover:bg-accent/60',
        indented && 'pl-5',
        isActive && 'bg-accent text-accent-foreground',
        isSelected && !isActive && 'bg-brand-500/10 ring-1 ring-inset ring-brand-500/30',
        isDropTarget && 'bg-brand-500/15 ring-1 ring-inset ring-brand-500/60',
        isDragging && 'opacity-40'
      )}
    >
      {/* Active marker rail */}
      <span
        className={cn(
          'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-brand-500',
          isActive ? 'opacity-100' : 'opacity-0'
        )}
        aria-hidden="true"
      />

      {/* Status: a spinner while the agent works, otherwise this status's glyph */}
      {isRunning ? (
        <Loader2
          className="size-3.5 shrink-0 animate-spin"
          style={{ color: statusMeta.dotColor }}
          aria-label={`${statusMeta.label} — running`}
          data-testid="sidebar-feature-spinner"
        />
      ) : (
        <StatusIcon
          className="size-3.5 shrink-0"
          style={{ color: statusMeta.dotColor }}
          aria-label={statusMeta.label}
          data-testid="sidebar-feature-status-icon"
          data-status={feature.status ?? 'unknown'}
        />
      )}

      {/* Title and optional metadata */}
      <span className="min-w-0 flex-1 truncate">
        <span
          className={cn(
            'block truncate text-[13px] leading-5',
            isActive ? 'font-medium' : 'font-normal'
          )}
        >
          {title}
        </span>
        {showMetadata && (projectName || branchName) && (
          <span className="block truncate text-[10px] leading-3 text-muted-foreground/70">
            {projectName}
            {branchName ? ` • ${branchName}` : ''}
          </span>
        )}
      </span>

      {/* Right cluster: dirty / ahead / behind / PR / attention */}
      <span className="flex shrink-0 items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
        {isPinned(feature) && (
          <Star className="size-3 fill-amber-400 text-amber-400" aria-label="Pinned" />
        )}

        {attention && (
          <AlertTriangle className="size-3 text-status-warning" aria-label="Needs attention" />
        )}

        {isDirty && (
          <span
            className="size-1.5 rounded-full bg-status-warning"
            title={`${syncStatus?.dirtyCount} uncommitted change(s)`}
            aria-label="Uncommitted changes"
          />
        )}

        {ahead > 0 && (
          <span className="flex items-center" title={`${ahead} commit(s) to push`}>
            <ArrowUp className="size-2.5" />
            {ahead}
          </span>
        )}

        {behind > 0 && (
          <span className="flex items-center" title={`${behind} commit(s) to pull`}>
            <ArrowDown className="size-2.5" />
            {behind}
          </span>
        )}

        {prNumber !== null && (
          <span
            className="flex items-center gap-0.5 rounded bg-muted px-1 py-px"
            title={`Pull request #${prNumber}`}
          >
            <GitPullRequest className="size-2.5" />
            {prNumber}
          </span>
        )}
      </span>
    </button>
  );
});
