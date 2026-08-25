import {
  ArrowRightLeft,
  Check,
  Copy,
  FolderOpen,
  FolderPlus,
  GitBranch,
  PanelLeft,
  Pencil,
  Pin,
  PinOff,
  Plus,
  UserMinus,
} from 'lucide-react';
import type { Feature } from '@/store/app-store';
import { useWorkbenchStore } from '@/store/workbench-store';
import type { AddFeatureContext } from '@/store/board-controls-store';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { getBranchName, getProjectPath, getStatusMeta, isPinned } from './status-meta';
import { setFeaturePinned } from './pin-actions';
import { getAssignmentState, unassignFeature } from './assign-actions';
import { useGithubCurrentUser } from '@/components/views/board-view/hooks/use-github-current-user';

interface FeatureContextMenuItemsProps {
  feature: Feature;
  /** Open the feature in the workbench */
  onOpen: (featureId: string) => void;
  /** Start inline renaming of a group (used after "New group…") */
  onRenameGroup: (groupId: string) => void;
  /** Create a new task alongside this one, inheriting its project/branch/status */
  onAddTask?: (context: AddFeatureContext) => void;
  /** Open the edit dialog. Absent until the board registers it. */
  onEditFeature?: (featureId: string) => void;
  /** Move the feature to another status. Absent until the board registers it. */
  onSetFeatureStatus?: (featureId: string, status: string) => void;
}

/**
 * Statuses a person can move a task to by hand, in board order.
 *
 * The agent-driven ones (planning, building) are left out: parking a task
 * there by hand claims work is under way when nothing is running.
 */
const MOVABLE_STATUSES = [
  'local',
  'backlog',
  'in_progress',
  'waiting_approval',
  'completed',
  'verified',
] as const;

/**
 * Menu body shared by the right-click menus on sidebar rows, pinned or not.
 *
 * Kept in one place so pinning a feature reads the same wherever the user
 * right-clicks it.
 */
export function FeatureContextMenuItems({
  feature,
  onOpen,
  onRenameGroup,
  onAddTask,
  onEditFeature,
  onSetFeatureStatus,
}: FeatureContextMenuItemsProps) {
  const pinGroups = useWorkbenchStore((state) => state.pinGroups);
  const createPinGroup = useWorkbenchStore((state) => state.createPinGroup);
  const movePinnedFeature = useWorkbenchStore((state) => state.movePinnedFeature);

  const projectPath = getProjectPath(feature);
  const currentUser = useGithubCurrentUser(projectPath);
  const assignment = getAssignmentState(feature, currentUser);

  const pinned = isPinned(feature);
  const branchName = getBranchName(feature);
  const title = feature.title || feature.description || 'Untitled feature';
  const currentGroupId = pinGroups.find((group) => group.featureIds.includes(feature.id))?.id;

  /** Pin (if needed) and drop the feature into `groupId`, or the top level. */
  const pinInto = (groupId: string | null) => {
    if (!pinned) void setFeaturePinned(feature, true);
    movePinnedFeature(feature.id, groupId);
  };

  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value);
  };

  return (
    <>
      <DropdownMenuLabel className="truncate text-[11px] text-muted-foreground">
        {title}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />

      <DropdownMenuItem className="gap-2" onSelect={() => onOpen(feature.id)}>
        <PanelLeft className="size-3.5" />
        Open
      </DropdownMenuItem>

      {onEditFeature && (
        <DropdownMenuItem
          className="gap-2"
          onSelect={() => onEditFeature(feature.id)}
          data-testid="context-menu-edit-feature"
        >
          <Pencil className="size-3.5" />
          Edit…
        </DropdownMenuItem>
      )}

      <DropdownMenuItem
        className="gap-2"
        onSelect={() => void setFeaturePinned(feature, !pinned)}
        data-testid="context-menu-toggle-pin"
      >
        {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        {pinned ? 'Unpin' : 'Pin to sidebar'}
      </DropdownMenuItem>

      {onAddTask && (
        <DropdownMenuItem
          className="gap-2"
          onSelect={() =>
            onAddTask({
              projectPath: getProjectPath(feature),
              branchName,
              status: feature.status,
            })
          }
          data-testid="context-menu-add-task"
        >
          <Plus className="size-3.5" />
          Add task here
        </DropdownMenuItem>
      )}

      {onSetFeatureStatus && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2" data-testid="context-menu-move-status">
            <ArrowRightLeft className="size-3.5" />
            Move to
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-48">
              {MOVABLE_STATUSES.map((status) => {
                const meta = getStatusMeta(status);
                const StatusIcon = meta.Icon;
                const current = feature.status === status;
                return (
                  <DropdownMenuItem
                    key={status}
                    className="gap-2"
                    disabled={current}
                    onSelect={() => onSetFeatureStatus(feature.id, status)}
                    data-testid={`context-menu-move-to-${status}`}
                  >
                    <StatusIcon className="size-3.5" style={{ color: meta.dotColor }} />
                    <span className="min-w-0 flex-1 truncate">{meta.label}</span>
                    {current && <Check className="size-3.5 text-brand-500" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      )}

      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2">
          <FolderOpen className="size-3.5" />
          {pinned ? 'Move to group' : 'Pin to group'}
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuItem className="gap-2" onSelect={() => pinInto(null)}>
              <span className="min-w-0 flex-1 truncate">No group</span>
              {pinned && !currentGroupId && <Check className="size-3.5 text-brand-500" />}
            </DropdownMenuItem>
            {pinGroups.length > 0 && <DropdownMenuSeparator />}
            {pinGroups.map((group) => (
              <DropdownMenuItem key={group.id} className="gap-2" onSelect={() => pinInto(group.id)}>
                <span className="min-w-0 flex-1 truncate">{group.name}</span>
                {currentGroupId === group.id && <Check className="size-3.5 text-brand-500" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => {
                const groupId = createPinGroup(undefined, [feature.id]);
                if (!pinned) void setFeaturePinned(feature, true);
                onRenameGroup(groupId);
              }}
            >
              <FolderPlus className="size-3.5" />
              New group…
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>

      <DropdownMenuSeparator />

      {/* Ownership. A task is owned through its GitHub issue, so this is only
          offered where there is an issue and the claim on it is yours. */}
      <DropdownMenuItem
        className="gap-2"
        disabled={!assignment.canUnassign}
        onSelect={() => void unassignFeature(feature)}
        data-testid="context-menu-unassign"
      >
        <UserMinus className="size-3.5" />
        {assignment.heldByOther ? `Assigned to ${assignment.heldByOther}` : 'Unassign'}
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      {branchName && (
        <DropdownMenuItem className="gap-2" onSelect={() => copy(branchName)}>
          <GitBranch className="size-3.5" />
          Copy branch name
        </DropdownMenuItem>
      )}
      <DropdownMenuItem className="gap-2" onSelect={() => copy(feature.id)}>
        <Copy className="size-3.5" />
        Copy feature ID
      </DropdownMenuItem>
    </>
  );
}
