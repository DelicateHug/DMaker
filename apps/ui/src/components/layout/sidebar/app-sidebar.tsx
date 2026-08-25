import { useCallback, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import {
  Search,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Folder,
  FolderPlus,
  GitBranch,
  Settings,
  Lightbulb,
  FileText,
  Brain,
  Terminal,
  CircleSlash,
  GitPullRequest,
  Wand2,
  LayoutPanelLeft,
  RefreshCw,
  Sparkles,
  Trash2,
  CloudDownload,
  Check,
  FolderOpen,
  Pencil,
  Ungroup,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { cn, isMac } from '@/lib/utils';
import { isElectron } from '@/lib/electron';
import {
  getHttpApiClient,
  type LocalBranchInfo,
  type RemoteBranchInfo,
} from '@/lib/http-api-client';
import { useAppStore, type Feature } from '@/store/app-store';
import { toggleLayer, type LayerId } from '@/store/layer-store';
import { showBoardTab, toolTabKey, useActiveFeatureId, useCenterStore } from '@/store/center-store';
import {
  openProjectView,
  toggleProjectView,
  useIsProjectViewOpen,
} from '@/store/project-view-store';
import {
  useWorkbenchStore,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  type ProjectGroup,
  type BranchGroup,
} from '@/store/workbench-store';
import {
  useBoardControlsStore,
  getBoardControlsForTopNav,
  type AddFeatureContext,
} from '@/store/board-controls-store';
import { useWorktreeSyncStatus } from '@/hooks/use-worktree-sync-status';
import { useRemoteBranches } from '@/hooks/use-remote-branches';
import { useLocalBranches } from '@/hooks/use-local-branches';
import { useBranchSync, branchSyncKey, type BranchSyncTarget } from '@/hooks/use-branch-sync';
import { useNavigationShortcuts } from '@/hooks/use-navigation-shortcuts';
import { useRunningFeatureIds } from '@/hooks/use-running-feature-ids';
import { Button } from '@/components/ui/button';
import { UsagePopover } from '@/components/usage-popover';
import { BoardStatusDropdown } from '@/components/views/board-view/components/board-status-dropdown';
import {
  DEFAULT_ASSIGNEE_FILTER,
  matchesAssigneeFilter,
} from '@/components/views/board-view/hooks/use-board-assignees';
import { QuickLauncher } from '@/components/layout/quick-launcher';
import {
  RunningAgentsIndicator,
  RunningAgentsIndicatorCompact,
} from '@/components/layout/running-agents-indicator';
import { ContextMenu, useContextMenu } from '@/components/ui/context-menu';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarSection } from './sidebar-section';
import { SidebarGroupHeader } from './sidebar-group-header';
import { SidebarFeatureRow } from './sidebar-feature-row';
import { RemoteBranchAdoptRow, formatBranchAge } from './remote-branch-row';
import { BranchSyncIndicator } from './branch-sync-indicator';
import { buildBranchFixTask } from './branch-sync-task';
import { PinnedSection } from './pinned-section';
import { ScratchpadSection } from './scratchpad-section';
import { FeatureContextMenuItems } from './feature-context-menu';
import { DeleteBranchDialog, type BranchDeleteTarget } from './delete-branch-dialog';
import {
  getStatusMeta,
  needsAttention,
  getBranchName,
  getProjectName,
  getProjectPath,
  isPinned,
} from './status-meta';

/** Features in these statuses are finished and stay out of the sidebar. */
const HIDDEN_STATUSES = new Set(['completed']);

/** Tool launchers rendered in the sidebar footer. */
const TOOL_ITEMS: Array<{ id: LayerId; label: string; icon: typeof Lightbulb }> = [
  { id: 'ideation', label: 'Ideation', icon: Lightbulb },
  { id: 'spec', label: 'Spec Editor', icon: FileText },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'github-prs', label: 'GitHub PRs', icon: GitPullRequest },
  { id: 'interview', label: 'Interview', icon: Wand2 },
  { id: 'project-settings', label: 'Project Settings', icon: Settings },
];

/**
 * Fallback ordering for status groups when the board has not published its
 * status tabs yet (or a feature carries a status no tab covers).
 */
const STATUS_ORDER = [
  'local',
  'backlog',
  'planning',
  'in_progress',
  'building',
  'waiting_approval',
];

/** 'my_custom_status' -> 'My Custom Status', for statuses with no tab. */
function prettifyStatus(status: string): string {
  return status
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Ordering within a status group: whatever needs the user comes first.
 * Attention > actively working > everything else, then alphabetical so the list
 * does not reshuffle on every poll.
 */
function sortRank(feature: Feature, isRunning: boolean): number {
  if (needsAttention(feature)) return 0;
  if (isRunning || getStatusMeta(feature.status).isWorking) return 1;
  if (feature.status === 'waiting_approval') return 2;
  return 3;
}

/**
 * MIME types carrying what is being dragged. Each grouping level has its own
 * so a drag can only ever land where it makes sense: a project never drops
 * into a branch folder, and vice versa.
 */
const PROJECT_DRAG_TYPE = 'application/x-dmaker-project';
const BRANCH_DRAG_TYPE = 'application/x-dmaker-branch';

/** A branch identified across projects — branch names repeat between repos. */
interface BranchRef {
  projectPath: string;
  branchKey: string;
}

function encodeBranchRef(ref: BranchRef): string {
  return `${ref.projectPath}::${ref.branchKey}`;
}

function decodeBranchRef(raw: string): BranchRef | null {
  const separator = raw.lastIndexOf('::');
  if (separator === -1) return null;
  const projectPath = raw.slice(0, separator);
  const branchKey = raw.slice(separator + 2);
  return projectPath && branchKey ? { projectPath, branchKey } : null;
}

/** Where a project drag would land. */
type ProjectDropTarget =
  | { kind: 'project'; path: string }
  | { kind: 'group'; id: string }
  | { kind: 'root' }
  | null;

/** Where a branch drag would land. Always inside its own project. */
type BranchDropTarget =
  | { kind: 'branch'; projectPath: string; branchKey: string }
  | { kind: 'group'; id: string }
  | { kind: 'root'; projectPath: string }
  | null;

/** Do these describe the same landing spot? Used to skip no-op state writes. */
function sameProjectTarget(a: ProjectDropTarget, b: ProjectDropTarget): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'project' && b.kind === 'project') return a.path === b.path;
  if (a.kind === 'group' && b.kind === 'group') return a.id === b.id;
  return true;
}

function sameBranchTarget(a: BranchDropTarget, b: BranchDropTarget): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'branch' && b.kind === 'branch') {
    return a.projectPath === b.projectPath && a.branchKey === b.branchKey;
  }
  if (a.kind === 'group' && b.kind === 'group') return a.id === b.id;
  if (a.kind === 'root' && b.kind === 'root') return a.projectPath === b.projectPath;
  return true;
}

/** One status bucket under a branch, as rendered. */
interface SidebarStatusBucket {
  status: string;
  label: string;
  order: number;
  features: Feature[];
}

/** One branch row under a project, as rendered. */
interface SidebarBranch {
  key: string;
  label: string;
  /** undefined for the catch-all bucket holding branch-less features */
  branchName?: string;
  isPrimary: boolean;
  isDefault: boolean;
  local?: LocalBranchInfo;
  remote?: RemoteBranchInfo;
  missing?: boolean;
  count: number;
  featureIds: string[];
  statuses: SidebarStatusBucket[];
}

/** One project row, as rendered. */
interface SidebarProject {
  path: string;
  name: string;
  order: number;
  count: number;
  branches: SidebarBranch[];
}

interface AppSidebarProps {
  /** Opens the Add Feature dialog, pre-filled from `context` when given */
  onCreateFeature: (context?: AddFeatureContext) => void;
  onCreateWorktree?: () => void;
}

/**
 * A branch group whose branch no longer exists in the repository, together with
 * everything still on disk because of it.
 */
interface DeadBranch {
  projectPath: string;
  branchName: string;
  /** Tasks still pointing at the branch — deleting the group deletes these */
  featureIds: string[];
}

/** What a group right-click menu is open for. */
interface GroupMenuTarget {
  /** Shown as the menu's heading so the user sees what they hit */
  label: string;
  context: AddFeatureContext;
  /** Set only for a branch that is gone — that one clears tasks, not refs */
  dead?: DeadBranch;
  /**
   * Set for a branch git still has. Deleting this one is a real git delete, so
   * it goes through its own dialog: the remote copy and any unmerged commits
   * have to be acknowledged before it will run.
   */
  live?: BranchDeleteTarget;
  /** Set on a project header, which can be foldered with other projects */
  project?: { path: string };
  /** Set on a branch header, which can be foldered with its project's branches */
  branch?: BranchRef;
}

export function AppSidebar({ onCreateFeature, onCreateWorktree }: AppSidebarProps) {
  const {
    features,
    projects,
    currentProject,
    worktreesByProject,
    setWorktrees,
    setCurrentProject,
  } = useAppStore(
    useShallow((state) => ({
      features: state.features,
      projects: state.projects,
      currentProject: state.currentProject,
      worktreesByProject: state.worktreesByProject,
      setWorktrees: state.setWorktrees,
      setCurrentProject: state.setCurrentProject,
    }))
  );

  const {
    sidebarCollapsed,
    sidebarWidth,
    selectedFeatureIds,
    toggleSidebar,
    setSidebarWidth,
    openWorkbench,
    toggleFeatureSelected,
    selectFeatureRange,
    setSelectedFeatureIds,
    setCommandPaletteOpen,
  } = useWorkbenchStore(
    useShallow((state) => ({
      sidebarCollapsed: state.sidebarCollapsed,
      sidebarWidth: state.sidebarWidth,
      selectedFeatureIds: state.selectedFeatureIds,
      toggleSidebar: state.toggleSidebar,
      setSidebarWidth: state.setSidebarWidth,
      openWorkbench: state.openWorkbench,
      toggleFeatureSelected: state.toggleFeatureSelected,
      selectFeatureRange: state.selectFeatureRange,
      setSelectedFeatureIds: state.setSelectedFeatureIds,
      setCommandPaletteOpen: state.setCommandPaletteOpen,
    }))
  );

  /**
   * User-made folders in the tree. Grouping is presentation only, so it lives
   * in the workbench store beside the collapse state rather than on disk with
   * the project or in git with the branch.
   */
  const {
    projectFolders,
    branchFolders,
    createProjectGroup,
    renameProjectGroup,
    deleteProjectGroup,
    toggleProjectGroupCollapsed,
    moveProjectToGroup,
    createBranchGroup,
    renameBranchGroup,
    deleteBranchGroup,
    toggleBranchGroupCollapsed,
    moveBranchToGroup,
  } = useWorkbenchStore(
    useShallow((state) => ({
      projectFolders: state.projectGroups,
      branchFolders: state.branchGroups,
      createProjectGroup: state.createProjectGroup,
      renameProjectGroup: state.renameProjectGroup,
      deleteProjectGroup: state.deleteProjectGroup,
      toggleProjectGroupCollapsed: state.toggleProjectGroupCollapsed,
      moveProjectToGroup: state.moveProjectToGroup,
      createBranchGroup: state.createBranchGroup,
      renameBranchGroup: state.renameBranchGroup,
      deleteBranchGroup: state.deleteBranchGroup,
      toggleBranchGroupCollapsed: state.toggleBranchGroupCollapsed,
      moveBranchToGroup: state.moveBranchToGroup,
    }))
  );

  // Board controls (project/status/mode filter, refresh) now live in the sidebar.
  const boardControlsState = useBoardControlsStore();
  const boardControls = useMemo(
    () => getBoardControlsForTopNav(boardControlsState),
    [boardControlsState]
  );

  // Global navigation shortcuts used to be registered by the top bar.
  const { openFolder } = useNavigationShortcuts();

  // Which tools hold a centre tab, and which one is on screen right now.
  const openToolIds = useCenterStore(
    useShallow((state) => state.tabs.flatMap((tab) => (tab.kind === 'tool' ? [tab.toolId] : [])))
  );
  const activeTabKey = useCenterStore((state) => state.activeKey);
  const activeFeatureId = useActiveFeatureId();
  const isProjectViewOpen = useIsProjectViewOpen();

  /** Does this tool hold a tab? */
  const isLayerOpen = useCallback((id: LayerId) => openToolIds.includes(id), [openToolIds]);

  /** Showing in the centre right now — as opposed to merely holding a tab. */
  const isLayerShowing = useCallback(
    (id: LayerId) => activeTabKey === toolTabKey(id),
    [activeTabKey]
  );

  /** One right-click menu serves every feature row; it carries the row's id. */
  const featureMenu = useContextMenu<string>();
  /** Right-click menu for empty space in the sidebar body. */
  const blankMenu = useContextMenu<'blank'>();
  /** Right-click menu for a project / branch / status group header or body. */
  const groupMenu = useContextMenu<GroupMenuTarget>();
  /** Right-click menu for a user-made folder of projects or of branches. */
  const folderMenu = useContextMenu<
    { kind: 'project'; group: ProjectGroup } | { kind: 'branch'; group: BranchGroup }
  >();
  /**
   * Folder whose name is being edited inline — pinned, project or branch. Group
   * ids are unique across all three, so one piece of state serves them all and
   * a folder made by a drop can be typed over the moment it appears.
   */
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const isSettingsOpen = isLayerOpen('settings');
  const isSettingsShowing = isLayerShowing('settings');
  const isScratchOpen = isLayerOpen('scratch');
  const isScratchShowing = isLayerShowing('scratch');

  /** Features whose agent is running right now — drives the row spinner. */
  const runningFeatureIds = useRunningFeatureIds();

  const worktrees = useMemo(
    () => (currentProject ? (worktreesByProject[currentProject.path] ?? []) : []),
    [currentProject, worktreesByProject]
  );

  const { statusByBranch } = useWorktreeSyncStatus(worktrees, {
    enabled: !sidebarCollapsed && !!currentProject,
  });

  /**
   * Branches that exist on a project's remote but have no worktree here —
   * work started on another machine, or by someone else. Every open project is
   * polled, not just the current one, so nothing goes unnoticed just because
   * you happen to be looking elsewhere.
   */
  const projectPaths = useMemo(
    () => projects.map((project) => project.path).filter(Boolean),
    [projects]
  );

  const { branchesByProject: remoteBranchesByProject, refresh: refreshRemoteBranches } =
    useRemoteBranches(projectPaths, { enabled: !sidebarCollapsed });

  /**
   * Every branch each project actually has, straight from its refs.
   *
   * This is the only honest answer to "which branches exist". Features keep a
   * branch name long after the branch is deleted, and a branch with no task and
   * no worktree — 'master' in a repo checked out on a feature branch, or
   * anything created from a terminal — was never represented at all.
   */
  const {
    branchesByProject: localBranchesByProject,
    knownProjects: branchListingKnown,
    refresh: refreshLocalBranches,
  } = useLocalBranches(projectPaths, { enabled: !sidebarCollapsed });

  /**
   * Every project's worktrees, so the sync check covers branches you are not
   * currently looking at. A branch only goes wrong while your back is turned.
   *
   * These come from the branch listing rather than the worktree store, which
   * only ever holds the project the board happens to be showing.
   */
  const branchSyncTargets = useMemo<BranchSyncTarget[]>(
    () =>
      Object.entries(localBranchesByProject)
        .map(([projectPath, branches]) => ({
          projectPath,
          worktrees: branches
            .filter((branch) => branch.hasWorktree && branch.worktreePath && branch.name)
            .map((branch) => ({ path: branch.worktreePath as string, branch: branch.name })),
        }))
        .filter((target) => target.projectPath && target.worktrees.length > 0),
    [localBranchesByProject]
  );

  const {
    resultByBranch: branchSyncByBranch,
    checkingBranches,
    nextCheckAtByBranch,
    refresh: refreshBranchSync,
    autoFix: autoFixBranch,
    fixingBranches,
    lastFixSteps,
  } = useBranchSync(branchSyncTargets, { enabled: !sidebarCollapsed });

  /** Worktree path for a branch, so the sidebar can act on the checkout. */
  const worktreePathFor = useCallback(
    (projectPath: string, branchName: string): string | undefined =>
      (worktreesByProject[projectPath] ?? []).find((worktree) => worktree.branch === branchName)
        ?.path,
    [worktreesByProject]
  );

  /**
   * Hand a branch that git cannot straighten out on its own to an agent, as a
   * task on that very branch — pre-filled with what the check already found,
   * so the agent starts from the diagnosis rather than rediscovering it.
   */
  const handleCreateBranchFixTask = useCallback(
    (projectPath: string, branchName: string) => {
      const sync = branchSyncByBranch[branchSyncKey(projectPath, branchName)];
      if (!sync) return;

      const { title, description } = buildBranchFixTask(sync);
      onCreateFeature({ projectPath, branchName, title, description });
    },
    [branchSyncByBranch, onCreateFeature]
  );

  const handleBranchAutoFix = useCallback(
    async (projectPath: string, branchName: string) => {
      const worktreePath = worktreePathFor(projectPath, branchName);
      if (!worktreePath) {
        toast.error(`No worktree found for ${branchName}`);
        return;
      }

      const fixed = await autoFixBranch(projectPath, worktreePath);
      if (fixed) toast.success(`${branchName} is back in sync`);
      else toast.error(`Could not fix ${branchName} automatically — try an agent`);
    },
    [autoFixBranch, worktreePathFor]
  );

  /** `${projectPath}::${branch}` while its worktree is being created. */
  const [adoptingBranch, setAdoptingBranch] = useState<string | null>(null);

  /**
   * Turn a discovered remote branch into a real worktree. The server adopts the
   * remote branch with tracking, so the checkout carries its existing commits.
   */
  const handleAdoptRemoteBranch = useCallback(
    async (projectPath: string, branchName: string) => {
      setAdoptingBranch(`${projectPath}::${branchName}`);
      try {
        const api = getHttpApiClient();
        const created = (await api.worktree.create(projectPath, branchName)) as {
          success?: boolean;
          error?: string;
        };

        if (!created?.success) {
          toast.error(created?.error || `Could not create a worktree for ${branchName}`);
          return;
        }

        toast.success(`Worktree ready for ${branchName}`);

        const listed = (await api.worktree.listAll(projectPath, true)) as {
          success?: boolean;
          worktrees?: Array<{ path: string; branch: string; isMain: boolean }>;
        };
        if (listed?.success && listed.worktrees) setWorktrees(projectPath, listed.worktrees);

        // The branch now has a worktree, so discovery should drop it — and the
        // branch listing should pick it up as a real local branch.
        refreshRemoteBranches();
        void refreshLocalBranches(projectPath);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : `Could not create a worktree for ${branchName}`
        );
      } finally {
        setAdoptingBranch(null);
      }
    },
    [setWorktrees, refreshRemoteBranches, refreshLocalBranches]
  );

  /** Dead branch awaiting confirmation, or null when the dialog is closed. */
  const [deadBranchToDelete, setDeadBranchToDelete] = useState<DeadBranch | null>(null);

  /** Live branch awaiting confirmation, or null when that dialog is closed. */
  const [branchToDelete, setBranchToDelete] = useState<BranchDeleteTarget | null>(null);

  /**
   * Clear out a branch that no longer exists.
   *
   * The group only survives its branch because tasks still name it, so the
   * tasks *are* the thing on disk: deleting them deletes the feature
   * directories under `.dmaker/features/`, and the group then has nothing left
   * to be built from and disappears on the next render. There is no branch or
   * worktree left to remove — git already lost both, which is why the group was
   * marked dead in the first place.
   */
  const handleDeleteDeadBranch = useCallback(
    async (dead: DeadBranch) => {
      const { projectPath, branchName, featureIds } = dead;

      // A dead branch carrying nothing has no disk footprint at all; the group
      // is a leftover of this render and refreshing is the whole fix.
      if (featureIds.length === 0) {
        void refreshLocalBranches(projectPath);
        toast.success(`Removed ${branchName}`);
        return;
      }

      try {
        const api = getHttpApiClient();
        const result = await api.features.bulkDelete(projectPath, featureIds);

        const deleted = result.results?.filter((entry) => entry.success).map((r) => r.featureId);
        // Drop them locally rather than reloading the board: the store is what
        // the sidebar renders from, so the group goes as soon as this lands.
        for (const featureId of deleted ?? []) useAppStore.getState().removeFeature(featureId);

        if (!result.results) {
          toast.error(result.error || `Could not delete ${branchName}`);
          return;
        }

        if (result.failedCount) {
          toast.error(`Kept ${result.failedCount} task(s) of ${branchName}`, {
            description: 'They could not be archived — see the server log.',
          });
        } else {
          toast.success(`Cleared ${branchName}`, {
            description: `${deleted?.length ?? 0} task(s) archived — restore them from Closed Issues.`,
          });
        }

        void refreshLocalBranches(projectPath);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Could not delete ${branchName}`);
      }
    },
    [refreshLocalBranches]
  );

  /** Ahead/behind counts for the worktree a feature runs on, if it has one. */
  const syncStatusFor = useCallback(
    (feature: Feature) => {
      const branch = getBranchName(feature);
      return branch ? statusByBranch[branch] : undefined;
    },
    [statusByBranch]
  );

  // Visible features, ordered by urgency.
  const visibleFeatures = useMemo(() => {
    return features
      .filter((feature) => !HIDDEN_STATUSES.has(feature.status))
      .slice()
      .sort((a, b) => {
        const rankDelta =
          sortRank(a, runningFeatureIds.has(a.id)) - sortRank(b, runningFeatureIds.has(b.id));
        if (rankDelta !== 0) return rankDelta;
        return (a.title || a.description || '').localeCompare(b.title || b.description || '');
      });
  }, [features, runningFeatureIds]);

  const pinnedFeatures = useMemo(
    () => visibleFeatures.filter((feature) => isPinned(feature)),
    [visibleFeatures]
  );

  /**
   * Primary (checked-out) branch per project, used to bucket features that
   * carry no branch of their own — they run on whatever the project is on.
   *
   * The branch listing knows this for every project; the worktree store only
   * ever holds the one the board is showing, so it is just the fallback.
   */
  const primaryBranchByProject = useMemo(() => {
    const map = new Map<string, string>();

    for (const [path, list] of Object.entries(worktreesByProject)) {
      const primary = list?.find((worktree) => worktree.isMain);
      if (primary?.branch) map.set(path, primary.branch);
    }

    for (const [path, branches] of Object.entries(localBranchesByProject)) {
      const current = branches.find((branch) => branch.isCurrent);
      if (current) map.set(path, current.name);
    }

    return map;
  }, [worktreesByProject, localBranchesByProject]);

  /**
   * Unpinned features bucketed by project, then by branch, then by status.
   *
   * Every project is listed — there is no project selector any more — and the
   * status buckets follow the board's own tab order so the sidebar and the
   * funnel filter agree on naming and sequence. The branch level in between
   * mirrors the worktree a feature actually runs in, which is what lets a '+'
   * on a branch create a task that reuses it.
   */
  const projectSections = useMemo<SidebarProject[]>(() => {
    const statusTabs = boardControls?.statusTabs ?? [];
    const labelByStatus = new Map(
      statusTabs.filter((tab) => tab.id !== 'all').map((tab) => [tab.id, tab.label])
    );
    const orderByStatus = new Map(
      statusTabs.filter((tab) => tab.id !== 'all').map((tab, index) => [tab.id, index])
    );

    // The funnel filter narrows which statuses appear. 'all' (or nothing
    // selected) means no narrowing.
    const activeTabs = boardControls?.activeStatusTabs ?? [];
    const statusFilter =
      activeTabs.length === 0 || activeTabs.includes('all') ? null : new Set(activeTabs);

    // The same funnel also narrows by assignee, so the sidebar and the board
    // agree on who they are showing.
    const assigneeFilter = boardControls?.assigneeFilter ?? DEFAULT_ASSIGNEE_FILTER;
    const currentGithubUser = boardControls?.currentGithubUser ?? null;

    type StatusBucket = SidebarStatusBucket;
    type BranchBucket = {
      key: string;
      label: string;
      /** undefined for the catch-all bucket holding branch-less features */
      branchName?: string;
      isPrimary: boolean;
      /** The project's trunk — 'main' / 'master' */
      isDefault: boolean;
      /** The branch as it exists in the repo right now, when it still does */
      local?: LocalBranchInfo;
      /** Set when the branch was discovered on the remote and has no worktree */
      remote?: RemoteBranchInfo;
      /**
       * The branch is gone from the repo, but tasks still point at it. Only ever
       * set for projects whose branch listing was actually readable.
       */
      missing?: boolean;
      statuses: Map<string, StatusBucket>;
    };
    type ProjectBucket = {
      path: string;
      name: string;
      order: number;
      branches: Map<string, BranchBucket>;
    };

    const projectOrder = new Map(projects.map((project, index) => [project.path, index]));
    const projectBuckets = new Map<string, ProjectBucket>();

    for (const feature of visibleFeatures) {
      if (isPinned(feature)) continue;

      const status = feature.status || 'unknown';
      if (statusFilter && !statusFilter.has(status)) continue;
      if (!matchesAssigneeFilter(feature, assigneeFilter, currentGithubUser)) continue;

      const path = getProjectPath(feature) ?? currentProject?.path ?? '';
      const name = getProjectName(feature) ?? currentProject?.name ?? 'Project';

      let project = projectBuckets.get(path);
      if (!project) {
        project = {
          path,
          name,
          order: projectOrder.get(path) ?? Number.MAX_SAFE_INTEGER,
          branches: new Map(),
        };
        projectBuckets.set(path, project);
      }

      // A feature with no branch of its own sits on the project's primary
      // branch. When even that is unknown (worktrees not loaded yet), it goes
      // to a catch-all bucket that creates fresh branches instead of reusing.
      const primaryBranch = primaryBranchByProject.get(path);
      const branchName = getBranchName(feature) ?? primaryBranch;
      const branchKey = branchName ?? '__unbranched__';

      let branch = project.branches.get(branchKey);
      if (!branch) {
        branch = {
          key: branchKey,
          label: branchName ?? 'No branch',
          branchName,
          isPrimary: !!branchName && branchName === primaryBranch,
          isDefault: false,
          statuses: new Map(),
        };
        project.branches.set(branchKey, branch);
      }

      let bucket = branch.statuses.get(status);
      if (!bucket) {
        const fallbackOrder = STATUS_ORDER.indexOf(status);
        bucket = {
          status,
          label:
            labelByStatus.get(status) ??
            (STATUS_ORDER.includes(status) ? getStatusMeta(status).label : prettifyStatus(status)),
          order:
            orderByStatus.get(status) ??
            (fallbackOrder === -1 ? Number.MAX_SAFE_INTEGER : 100 + fallbackOrder),
          features: [],
        };
        branch.statuses.set(status, bucket);
      }
      bucket.features.push(feature);
    }

    // Every branch the repository actually has gets a group, whether or not any
    // task sits on it — that is what makes 'master' appear in a repo checked
    // out on a feature branch, and what makes a branch created from a terminal
    // turn up on its own. Branches that already carry work are annotated in
    // place rather than duplicated.
    for (const [path, localBranches] of Object.entries(localBranchesByProject)) {
      if (localBranches.length === 0) continue;

      let bucket = projectBuckets.get(path);
      if (!bucket) {
        // Only surface projects the user actually has open.
        const known = projects.find((candidate) => candidate.path === path);
        if (!known) continue;
        bucket = {
          path,
          name: known.name,
          order: projectOrder.get(path) ?? Number.MAX_SAFE_INTEGER,
          branches: new Map(),
        };
        projectBuckets.set(path, bucket);
      }

      for (const local of localBranches) {
        const existing = bucket.branches.get(local.name);
        if (existing) {
          existing.local = local;
          existing.isDefault = local.isDefault;
          continue;
        }
        bucket.branches.set(local.name, {
          key: local.name,
          label: local.name,
          branchName: local.name,
          isPrimary: local.isCurrent,
          isDefault: local.isDefault,
          local,
          statuses: new Map(),
        });
      }
    }

    // Remote-only branches sit alongside the real ones, carrying no features —
    // they are an offer to pick the work up, not work already tracked here.
    for (const [path, discovered] of Object.entries(remoteBranchesByProject)) {
      if (!discovered?.length) continue;

      let project = projectBuckets.get(path);
      if (!project) {
        // Only surface projects the user actually has open.
        const known = projects.find((candidate) => candidate.path === path);
        if (!known) continue;
        project = {
          path,
          name: known.name,
          order: projectOrder.get(path) ?? Number.MAX_SAFE_INTEGER,
          branches: new Map(),
        };
        projectBuckets.set(path, project);
      }

      for (const remote of discovered) {
        // A branch that already carries features is not a discovery.
        if (project.branches.has(remote.name)) continue;
        project.branches.set(remote.name, {
          key: remote.name,
          label: remote.name,
          branchName: remote.name,
          isPrimary: false,
          isDefault: false,
          remote,
          statuses: new Map(),
        });
      }
    }

    // Branch groups that outlived their branch. A task keeps its branch name
    // forever, so without this the sidebar goes on offering branches that were
    // deleted long ago. Runs last, so a branch that survives only on the remote
    // counts as still existing rather than as deleted.
    //
    // Only a project whose listing actually succeeded may condemn a branch: an
    // unreadable project means "unknown", never "everything was deleted".
    for (const [path, project] of projectBuckets) {
      if (!branchListingKnown.has(path)) continue;

      const live = new Set((localBranchesByProject[path] ?? []).map((branch) => branch.name));
      for (const remote of remoteBranchesByProject[path] ?? []) live.add(remote.name);

      for (const branch of project.branches.values()) {
        // The catch-all bucket has no branch of its own to lose.
        if (!branch.branchName) continue;
        if (!live.has(branch.branchName)) branch.missing = true;
      }
    }

    return Array.from(projectBuckets.values())
      .map((project) => {
        const branches = Array.from(project.branches.values())
          .map((branch) => {
            const statuses = Array.from(branch.statuses.values()).sort(
              (a, b) => a.order - b.order || a.label.localeCompare(b.label)
            );
            return {
              key: branch.key,
              label: branch.label,
              branchName: branch.branchName,
              isPrimary: branch.isPrimary,
              isDefault: branch.isDefault,
              local: branch.local,
              remote: branch.remote,
              missing: branch.missing,
              count: statuses.reduce((total, bucket) => total + bucket.features.length, 0),
              // Flattened so a dead branch can say exactly what deleting it
              // would take with it, without walking its statuses again.
              featureIds: statuses.flatMap((bucket) =>
                bucket.features.map((feature) => feature.id)
              ),
              statuses,
            };
          })
          // The branch you are checked out on leads, then the trunk, then the
          // branches with work here, then what was only found on the remote —
          // and branches that no longer exist sink to the bottom.
          .sort(
            (a, b) =>
              Number(!!a.missing) - Number(!!b.missing) ||
              Number(b.isPrimary) - Number(a.isPrimary) ||
              Number(b.isDefault) - Number(a.isDefault) ||
              Number(!!a.remote) - Number(!!b.remote) ||
              a.label.localeCompare(b.label)
          );

        return {
          path: project.path,
          name: project.name,
          order: project.order,
          count: branches.reduce((total, branch) => total + branch.count, 0),
          branches,
        };
      })
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [
    visibleFeatures,
    boardControls?.statusTabs,
    boardControls?.activeStatusTabs,
    boardControls?.assigneeFilter,
    boardControls?.currentGithubUser,
    projects,
    currentProject,
    primaryBranchByProject,
    remoteBranchesByProject,
    localBranchesByProject,
    branchListingKnown,
  ]);

  /**
   * Projects split into the user's folders and what is still loose, in the
   * order they appear on screen: folders first, then the ungrouped rest.
   *
   * A folder only ever shows the projects that have a row of their own — one
   * naming a project that has since been closed keeps the name (closing a
   * project is not a decision about grouping) but contributes nothing here.
   */
  const projectLayout = useMemo(() => {
    const byPath = new Map(projectSections.map((project) => [project.path, project]));

    const folders = projectFolders.map((group) => ({
      group,
      members: group.members
        .map((path) => byPath.get(path))
        .filter((project): project is SidebarProject => project !== undefined),
    }));

    const claimed = new Set(folders.flatMap((folder) => folder.members.map((p) => p.path)));
    return {
      folders,
      ungrouped: projectSections.filter((project) => !claimed.has(project.path)),
    };
  }, [projectSections, projectFolders]);

  /** Which folder each on-screen project sits in; loose projects are absent. */
  const projectFolderIdByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (const { group, members } of projectLayout.folders) {
      for (const project of members) map.set(project.path, group.id);
    }
    return map;
  }, [projectLayout]);

  /** The same split for one project's branches, which are foldered per project. */
  const branchLayoutFor = useCallback(
    (project: SidebarProject) => {
      const byKey = new Map(project.branches.map((branch) => [branch.key, branch]));

      const folders = branchFolders
        .filter((group) => group.projectPath === project.path)
        .map((group) => ({
          group,
          members: group.members
            .map((key) => byKey.get(key))
            .filter((branch): branch is SidebarBranch => branch !== undefined),
        }));

      const claimed = new Set(folders.flatMap((folder) => folder.members.map((b) => b.key)));
      return {
        folders,
        ungrouped: project.branches.filter((branch) => !claimed.has(branch.key)),
        folderIdByKey: new Map(
          folders.flatMap(({ group, members }) =>
            members.map((branch) => [branch.key, group.id] as const)
          )
        ),
      };
    },
    [branchFolders]
  );

  // Flat visual order, used to resolve shift-click ranges across all sections.
  // Folders reorder the tree, so this has to be read off the grouped layout —
  // otherwise a shift-click would select a run the user never saw as one.
  const orderedIds = useMemo(
    () => [
      ...pinnedFeatures.map((feature) => feature.id),
      ...[...projectLayout.folders.flatMap((folder) => folder.members), ...projectLayout.ungrouped]
        .flatMap((project) => {
          const { folders, ungrouped } = branchLayoutFor(project);
          return [...folders.flatMap((folder) => folder.members), ...ungrouped];
        })
        .flatMap((branch) =>
          branch.statuses.flatMap((bucket) => bucket.features.map((feature) => feature.id))
        ),
    ],
    [pinnedFeatures, projectLayout, branchLayoutFor]
  );

  // --- Grouping by drag ---------------------------------------------------

  const [draggingProject, setDraggingProject] = useState<string | null>(null);
  const [projectDropTarget, setProjectDropTarget] = useState<ProjectDropTarget>(null);
  const [draggingBranch, setDraggingBranch] = useState<BranchRef | null>(null);
  const [branchDropTarget, setBranchDropTarget] = useState<BranchDropTarget>(null);

  const endProjectDrag = useCallback(() => {
    setDraggingProject(null);
    setProjectDropTarget(null);
  }, []);

  const endBranchDrag = useCallback(() => {
    setDraggingBranch(null);
    setBranchDropTarget(null);
  }, []);

  const handleProjectDragStart = useCallback(
    (projectPath: string, event: DragEvent<HTMLElement>) => {
      event.stopPropagation();
      event.dataTransfer.setData(PROJECT_DRAG_TYPE, projectPath);
      event.dataTransfer.setData('text/plain', projectPath);
      event.dataTransfer.effectAllowed = 'move';
      setDraggingProject(projectPath);
    },
    []
  );

  const handleBranchDragStart = useCallback((ref: BranchRef, event: DragEvent<HTMLElement>) => {
    // Branch headers sit inside project sections, which are draggable too —
    // without this the project would be dragged instead of the branch.
    event.stopPropagation();
    event.dataTransfer.setData(BRANCH_DRAG_TYPE, encodeBranchRef(ref));
    event.dataTransfer.setData('text/plain', ref.branchKey);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingBranch(ref);
  }, []);

  /**
   * Accept a project drop here and mark this row as the landing spot.
   *
   * `dragover` fires for every pointer move, and the whole task tree renders
   * from this state — so a target that has not actually changed is dropped
   * rather than written back.
   */
  const allowProjectDrop = useCallback(
    (event: DragEvent<HTMLElement>, target: ProjectDropTarget) => {
      if (!event.dataTransfer.types.includes(PROJECT_DRAG_TYPE)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      setProjectDropTarget((current) => (sameProjectTarget(current, target) ? current : target));
    },
    []
  );

  /**
   * The same for a branch, refusing anything from another project: branch
   * folders are scoped to one repository, and 'main' from elsewhere is a
   * different branch that merely shares a name.
   */
  const allowBranchDrop = useCallback(
    (event: DragEvent<HTMLElement>, target: BranchDropTarget, projectPath: string) => {
      if (!event.dataTransfer.types.includes(BRANCH_DRAG_TYPE)) return;
      if (draggingBranch && draggingBranch.projectPath !== projectPath) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      setBranchDropTarget((current) => (sameBranchTarget(current, target) ? current : target));
    },
    [draggingBranch]
  );

  const readDraggedProject = useCallback(
    (event: DragEvent<HTMLElement>): string | null =>
      draggingProject || event.dataTransfer.getData(PROJECT_DRAG_TYPE) || null,
    [draggingProject]
  );

  const readDraggedBranch = useCallback(
    (event: DragEvent<HTMLElement>): BranchRef | null =>
      draggingBranch ?? decodeBranchRef(event.dataTransfer.getData(BRANCH_DRAG_TYPE)),
    [draggingBranch]
  );

  /** Dropping a project on another folds the pair into a fresh folder. */
  const handleDropOnProject = useCallback(
    (targetPath: string, event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const draggedPath = readDraggedProject(event);
      endProjectDrag();
      if (!draggedPath || draggedPath === targetPath) return;

      const targetFolderId = projectFolderIdByPath.get(targetPath);
      if (targetFolderId) {
        // The target is already in a folder — join it, landing just above.
        moveProjectToGroup(draggedPath, targetFolderId, targetPath);
        return;
      }

      // A folder made by a drop opens straight into its rename input, so it can
      // be named while it is still obvious what it was made from.
      setRenamingGroupId(createProjectGroup(undefined, [targetPath, draggedPath]));
    },
    [
      readDraggedProject,
      endProjectDrag,
      projectFolderIdByPath,
      moveProjectToGroup,
      createProjectGroup,
    ]
  );

  const handleDropOnProjectFolder = useCallback(
    (groupId: string, event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const draggedPath = readDraggedProject(event);
      endProjectDrag();
      if (draggedPath) moveProjectToGroup(draggedPath, groupId);
    },
    [readDraggedProject, endProjectDrag, moveProjectToGroup]
  );

  /** Dropping on the list background lifts a project back out of its folder. */
  const handleDropOnProjectRoot = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes(PROJECT_DRAG_TYPE)) return;
      event.preventDefault();
      const draggedPath = readDraggedProject(event);
      endProjectDrag();
      if (draggedPath) moveProjectToGroup(draggedPath, null);
    },
    [readDraggedProject, endProjectDrag, moveProjectToGroup]
  );

  /** Dropping a branch on another branch of the same project folders the pair. */
  const handleDropOnBranch = useCallback(
    (project: SidebarProject, targetKey: string, event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const dragged = readDraggedBranch(event);
      endBranchDrag();
      if (!dragged || dragged.projectPath !== project.path || dragged.branchKey === targetKey) {
        return;
      }

      const targetFolderId = branchLayoutFor(project).folderIdByKey.get(targetKey);
      if (targetFolderId) {
        moveBranchToGroup(project.path, dragged.branchKey, targetFolderId, targetKey);
        return;
      }

      setRenamingGroupId(
        createBranchGroup(project.path, undefined, [targetKey, dragged.branchKey])
      );
    },
    [readDraggedBranch, endBranchDrag, branchLayoutFor, moveBranchToGroup, createBranchGroup]
  );

  const handleDropOnBranchFolder = useCallback(
    (group: BranchGroup, event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const dragged = readDraggedBranch(event);
      endBranchDrag();
      if (dragged?.projectPath === group.projectPath) {
        moveBranchToGroup(group.projectPath, dragged.branchKey, group.id);
      }
    },
    [readDraggedBranch, endBranchDrag, moveBranchToGroup]
  );

  /** Dropping on the project's own background lifts a branch out of its folder. */
  const handleDropOnBranchRoot = useCallback(
    (projectPath: string, event: DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes(BRANCH_DRAG_TYPE)) return;
      event.preventDefault();
      const dragged = readDraggedBranch(event);
      endBranchDrag();
      if (dragged?.projectPath === projectPath) {
        moveBranchToGroup(projectPath, dragged.branchKey, null);
      }
    },
    [readDraggedBranch, endBranchDrag, moveBranchToGroup]
  );

  /**
   * Make a project current, so everything that reads `currentProject` — the
   * project view, the footer tools — follows what was clicked in the sidebar.
   * Returns the project it switched to, or null when there was nothing to
   * switch to.
   */
  const focusProject = useCallback(
    (projectPath: string | undefined) => {
      if (!projectPath) return null;
      const target = projects.find((candidate) => candidate.path === projectPath);
      if (!target) return null;
      if (target.path !== currentProject?.path) setCurrentProject(target);
      return target;
    },
    [projects, currentProject, setCurrentProject]
  );

  const handleOpen = useCallback(
    (featureId: string, event: MouseEvent) => {
      if (event.shiftKey) {
        selectFeatureRange(orderedIds, featureId);
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        toggleFeatureSelected(featureId);
        return;
      }
      setSelectedFeatureIds([]);
      // The sidebar lists every project at once, so opening a task has to move
      // the current project with it — otherwise the project-scoped views stay
      // pointed at whatever was selected last.
      const feature = features.find((candidate) => candidate.id === featureId);
      if (feature) focusProject(getProjectPath(feature));
      openWorkbench(featureId);
    },
    [
      features,
      focusProject,
      orderedIds,
      openWorkbench,
      selectFeatureRange,
      setSelectedFeatureIds,
      toggleFeatureSelected,
    ]
  );

  const handleFeatureContextMenu = useCallback(
    (featureId: string, event: MouseEvent<HTMLElement>) => featureMenu.openAt(event, featureId),
    [featureMenu]
  );

  /**
   * The project view always renders whichever project is current, so opening it
   * from a project's header has to make that project current first — otherwise
   * every header opens whatever project happened to be selected.
   */
  const handleOpenProjectView = useCallback(
    (projectPath?: string) => {
      const switched =
        projectPath !== undefined &&
        projectPath !== currentProject?.path &&
        focusProject(projectPath) !== null;

      // Switching projects always shows that project's view; clicking the
      // project you are already on keeps the old open/close toggle.
      if (switched) openProjectView();
      else toggleProjectView();
    },
    [currentProject, focusProject]
  );

  /** Feature the right-click menu is currently open for. */
  const menuFeature = useMemo(
    () => features.find((feature) => feature.id === featureMenu.target) ?? null,
    [features, featureMenu.target]
  );

  /** Group the right-click menu is currently open for. */
  const menuGroup = groupMenu.target;

  /** Folder the folder right-click menu is currently open for. */
  const menuFolder = folderMenu.target;

  /** Branch folders belonging to the project whose branch was right-clicked. */
  const menuBranchFolders = useMemo(
    () =>
      menuGroup?.branch
        ? branchFolders.filter((folder) => folder.projectPath === menuGroup.branch!.projectPath)
        : [],
    [branchFolders, menuGroup]
  );

  const renderFeatureRow = useCallback(
    (feature: Feature) => (
      <SidebarFeatureRow
        key={feature.id}
        feature={feature}
        isActive={activeFeatureId === feature.id}
        isSelected={selectedFeatureIds.includes(feature.id)}
        syncStatus={syncStatusFor(feature)}
        isRunning={runningFeatureIds.has(feature.id)}
        onOpen={handleOpen}
        onContextMenu={handleFeatureContextMenu}
      />
    ),
    [
      activeFeatureId,
      selectedFeatureIds,
      syncStatusFor,
      runningFeatureIds,
      handleOpen,
      handleFeatureContextMenu,
    ]
  );

  // --- Drag-to-resize ---------------------------------------------------
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      resizeStateRef.current = { startX: event.clientX, startWidth: sidebarWidth };

      const handleMove = (moveEvent: globalThis.MouseEvent) => {
        const state = resizeStateRef.current;
        if (!state) return;
        setSidebarWidth(state.startWidth + (moveEvent.clientX - state.startX));
      };

      const handleUp = () => {
        resizeStateRef.current = null;
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('user-select');
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [sidebarWidth, setSidebarWidth]
  );

  /**
   * One branch row, with its status buckets under it.
   *
   * `indented` steps a branch in when it sits inside one of the user's
   * folders, so the folder it belongs to stays readable at a glance.
   */
  const renderBranchSection = (
    project: SidebarProject,
    branch: SidebarBranch,
    indented: boolean
  ) => {
    const projectPath = project.path || undefined;
    return (
      <div key={branch.key} className={indented ? 'pl-4' : 'pl-2'}>
        <SidebarSection
          id={`branch:${project.path}:${branch.key}`}
          headerDraggable
          isDragging={
            draggingBranch?.projectPath === project.path && draggingBranch.branchKey === branch.key
          }
          isHeaderDropTarget={
            branchDropTarget?.kind === 'branch' &&
            branchDropTarget.projectPath === project.path &&
            branchDropTarget.branchKey === branch.key
          }
          onHeaderDragStart={(event) =>
            handleBranchDragStart({ projectPath: project.path, branchKey: branch.key }, event)
          }
          onHeaderDragEnd={endBranchDrag}
          onHeaderDragOver={(event) => {
            if (
              draggingBranch?.projectPath === project.path &&
              draggingBranch.branchKey === branch.key
            ) {
              return;
            }
            allowBranchDrop(
              event,
              { kind: 'branch', projectPath: project.path, branchKey: branch.key },
              project.path
            );
          }}
          onHeaderDragLeave={() => setBranchDropTarget(null)}
          onHeaderDrop={(event) => handleDropOnBranch(project, branch.key, event)}
          label={branch.label}
          icon={branch.missing ? CircleSlash : branch.remote ? CloudDownload : GitBranch}
          iconClassName={cn(
            branch.missing && 'text-destructive/70',
            !branch.missing && branch.remote && 'text-muted-foreground/50',
            !branch.missing && !branch.remote && branch.isPrimary && 'text-brand-500',
            !branch.missing && !branch.remote && !branch.isPrimary && branch.isDefault
              ? 'text-brand-500/60'
              : undefined
          )}
          // A branch that no longer exists still has to be
          // readable — struck through, not hidden, because the
          // tasks under it are real and still need somewhere
          // to live.
          labelClassName={cn(branch.missing && 'line-through decoration-destructive/50')}
          count={branch.count}
          onContextMenu={(event) =>
            groupMenu.openAt(event, {
              label: branch.label,
              context: { projectPath, branchName: branch.branchName },
              branch: { projectPath: project.path, branchKey: branch.key },
              // A branch that is already gone is *cleared away*:
              // there is no ref left, only the tasks that outlived
              // it. One that still exists is *deleted*, through
              // git, which is a different question and a different
              // dialog. The two are never both on offer.
              dead:
                branch.missing && branch.branchName
                  ? {
                      projectPath: project.path,
                      branchName: branch.branchName,
                      featureIds: branch.featureIds,
                    }
                  : undefined,
              // The trunk is never on offer — that one is not a
              // mistake worth explaining after the fact.
              live:
                !branch.missing && !branch.isDefault && branch.branchName
                  ? {
                      projectPath: project.path,
                      branchName: branch.branchName,
                      featureCount: branch.featureIds.length,
                    }
                  : undefined,
            })
          }
          status={
            // A branch that has been deleted has nothing left to
            // sync with, so it says what happened to it instead
            // of counting down to a check that cannot succeed.
            branch.missing ? (
              <span
                className="shrink-0 select-none font-mono text-[9px] leading-none text-destructive/60"
                title={`${branch.label} no longer exists in this repository.\nThe ${branch.count} task(s) below still point at it — reuse them on another branch, or let a new one be created.`}
                data-testid="branch-missing"
                data-branch={branch.branchName}
              >
                deleted
              </span>
            ) : branch.remote ? (
              // Nothing checked out here to sync — the only fact
              // worth carrying is how stale the remote branch is.
              <span
                className="shrink-0 select-none font-mono text-[9px] leading-none tabular-nums text-muted-foreground/40"
                title={`Last commit on ${branch.remote.remoteRef}${
                  branch.remote.lastCommitBy ? ` by ${branch.remote.lastCommitBy}` : ''
                }`}
                data-testid="branch-remote-age"
              >
                {formatBranchAge(branch.remote.lastCommitAt)}
              </span>
            ) : // Real branches only: the catch-all bucket for
            // branch-less features has no checkout to sync.
            branch.branchName ? (
              <BranchSyncIndicator
                branchName={branch.branchName}
                sync={branchSyncByBranch[branchSyncKey(project.path, branch.branchName)]}
                isChecking={checkingBranches.has(branchSyncKey(project.path, branch.branchName))}
                nextCheckAt={nextCheckAtByBranch[branchSyncKey(project.path, branch.branchName)]}
                isFixing={fixingBranches.has(branchSyncKey(project.path, branch.branchName))}
                fixSteps={lastFixSteps[branchSyncKey(project.path, branch.branchName)]}
                onRefresh={() => void refreshBranchSync(project.path, branch.branchName)}
                onAutoFix={() => void handleBranchAutoFix(project.path, branch.branchName!)}
                onCreateFixTask={() => handleCreateBranchFixTask(project.path, branch.branchName!)}
              />
            ) : null
          }
          action={
            <Button
              variant="ghost"
              size="sm"
              className="size-5 p-0"
              onClick={() => onCreateFeature({ projectPath, branchName: branch.branchName })}
              title={
                branch.branchName
                  ? `New feature on ${branch.branchName}`
                  : 'New feature on a new branch'
              }
              data-testid="sidebar-add-feature-branch"
            >
              <Plus className="size-3" />
            </Button>
          }
          // A branch with no tasks still opens; what it says
          // inside depends on why it is empty.
          isEmpty={branch.count === 0 && !branch.remote}
          emptyMessage="No tasks"
        >
          {branch.remote && branch.count === 0 && (
            <RemoteBranchAdoptRow
              branch={branch.remote}
              isAdopting={adoptingBranch === `${project.path}::${branch.remote.name}`}
              onAdopt={(branchName) => {
                void handleAdoptRemoteBranch(project.path, branchName);
              }}
            />
          )}
          {branch.statuses.map((bucket) => (
            <div key={bucket.status} className="pl-2">
              <SidebarSection
                id={`status:${project.path}:${branch.key}:${bucket.status}`}
                label={bucket.label}
                count={bucket.features.length}
                onContextMenu={(event) =>
                  groupMenu.openAt(event, {
                    label: `${branch.label} · ${bucket.label}`,
                    context: {
                      projectPath,
                      branchName: branch.branchName,
                      status: bucket.status as AddFeatureContext['status'],
                    },
                  })
                }
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-5 p-0"
                    onClick={() =>
                      onCreateFeature({
                        projectPath,
                        branchName: branch.branchName,
                        status: bucket.status as AddFeatureContext['status'],
                      })
                    }
                    title={`New feature in ${bucket.label}`}
                    data-testid="sidebar-add-feature-status"
                  >
                    <Plus className="size-3" />
                  </Button>
                }
              >
                {bucket.features.map(renderFeatureRow)}
              </SidebarSection>
            </div>
          ))}
        </SidebarSection>
      </div>
    );
  };

  /**
   * One project row, with its branches under it — foldered first, then loose.
   *
   * The header is the drag handle for grouping projects, and the body is where
   * a branch is dropped to be lifted back out of a folder.
   */
  const renderProjectSection = (project: SidebarProject, indented: boolean) => {
    const projectPath = project.path || undefined;
    const { folders, ungrouped } = branchLayoutFor(project);

    return (
      <div key={project.path || project.name} className={cn(indented && 'pl-2')}>
        <SidebarSection
          id={`project:${project.path || project.name}`}
          label={project.name}
          icon={Folder}
          count={project.count}
          onContextMenu={(event) =>
            groupMenu.openAt(event, {
              label: project.name,
              context: { projectPath },
              project: project.path ? { path: project.path } : undefined,
            })
          }
          // The header is the grab handle: drag one project onto another to
          // fold the pair into a folder, or onto a folder to join it.
          headerDraggable={!!project.path}
          isDragging={draggingProject === project.path}
          isHeaderDropTarget={
            projectDropTarget?.kind === 'project' && projectDropTarget.path === project.path
          }
          onHeaderDragStart={(event) => handleProjectDragStart(project.path, event)}
          onHeaderDragEnd={endProjectDrag}
          onHeaderDragOver={(event) => {
            if (draggingProject === project.path) return;
            allowProjectDrop(event, { kind: 'project', path: project.path });
          }}
          onHeaderDragLeave={() => setProjectDropTarget(null)}
          onHeaderDrop={(event) => handleDropOnProject(project.path, event)}
          // The body is this project's own ground: a branch dropped on it is
          // being lifted out of whichever folder it was in.
          isDropTarget={
            branchDropTarget?.kind === 'root' && branchDropTarget.projectPath === project.path
          }
          onDragOver={(event) =>
            allowBranchDrop(event, { kind: 'root', projectPath: project.path }, project.path)
          }
          onDragLeave={() => setBranchDropTarget(null)}
          onDrop={(event) => handleDropOnBranchRoot(project.path, event)}
          action={
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="size-5 p-0"
                onClick={() => onCreateFeature({ projectPath })}
                title={`New feature in ${project.name}`}
                data-testid="sidebar-add-feature-project"
              >
                <Plus className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'size-5 p-0',
                  isProjectViewOpen && project.path === currentProject?.path && 'text-brand-500'
                )}
                onClick={() => handleOpenProjectView(projectPath)}
                title={`Project view for ${project.name} — files, chat, agents, scripts, deploy, MCP`}
                data-testid="sidebar-project-view"
              >
                <LayoutPanelLeft className="size-3" />
              </Button>
            </div>
          }
        >
          {folders.map(({ group, members }) => (
            <div key={group.id} className="flex flex-col gap-px pl-2">
              <SidebarGroupHeader
                groupId={group.id}
                name={group.name}
                collapsed={group.collapsed}
                memberCount={members.length}
                isRenaming={renamingGroupId === group.id}
                isDropTarget={
                  branchDropTarget?.kind === 'group' && branchDropTarget.id === group.id
                }
                iconClassName="text-brand-500/70"
                testId="sidebar-branch-group"
                onCommitRename={(name) => {
                  renameBranchGroup(group.id, name);
                  setRenamingGroupId(null);
                }}
                onCancelRename={() => setRenamingGroupId(null)}
                onToggle={() => toggleBranchGroupCollapsed(group.id)}
                onContextMenu={(event) => folderMenu.openAt(event, { kind: 'branch', group })}
                onDragOver={(event) =>
                  allowBranchDrop(event, { kind: 'group', id: group.id }, project.path)
                }
                onDragLeave={() => setBranchDropTarget(null)}
                onDrop={(event) => handleDropOnBranchFolder(group, event)}
              />

              {!group.collapsed &&
                (members.length > 0 ? (
                  members.map((branch) => renderBranchSection(project, branch, true))
                ) : (
                  <p className="px-3 py-1 pl-7 text-[11px] text-muted-foreground/70">
                    Drag branches here.
                  </p>
                ))}
            </div>
          ))}

          {ungrouped.map((branch) => renderBranchSection(project, branch, false))}
        </SidebarSection>
      </div>
    );
  };

  // --- Collapsed rail ---------------------------------------------------
  if (sidebarCollapsed) {
    return (
      <aside
        className={cn(
          'flex w-11 shrink-0 flex-col items-center gap-1 border-r border-border/60 bg-sidebar py-2',
          isElectron() && isMac && 'pt-8'
        )}
        data-testid="app-sidebar-rail"
      >
        <Button
          variant="ghost"
          size="sm"
          className="size-8 p-0"
          onClick={toggleSidebar}
          title="Expand sidebar"
        >
          <PanelLeftOpen className="size-4 text-muted-foreground" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="size-8 p-0"
          onClick={() => onCreateFeature()}
          title="New feature (Ctrl+N)"
        >
          <Plus className="size-4 text-muted-foreground" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="size-8 p-0"
          onClick={() => setCommandPaletteOpen(true)}
          title="Search (Ctrl+K)"
        >
          <Search className="size-4 text-muted-foreground" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn('size-8 p-0', isProjectViewOpen && 'bg-brand-500/10')}
          onClick={() => toggleProjectView()}
          title="Project view — files, chat, agents, scripts, deploy, MCP"
          data-testid="sidebar-project-view"
        >
          <LayoutPanelLeft
            className={cn('size-4', isProjectViewOpen ? 'text-brand-500' : 'text-muted-foreground')}
          />
        </Button>

        <div className="mt-auto flex flex-col items-center gap-1">
          {boardControls?.onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0"
              onClick={boardControls.onRefresh}
              disabled={boardControls.isRefreshing}
              title="Refresh features"
              data-testid="refresh-features-button"
            >
              <RefreshCw
                className={cn(
                  'size-4 text-muted-foreground',
                  boardControls.isRefreshing && 'animate-spin'
                )}
              />
            </Button>
          )}
          <RunningAgentsIndicatorCompact onNavigate={() => showBoardTab()} />
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'size-8 p-0',
              isSettingsShowing ? 'bg-brand-500/10 text-brand-500' : isSettingsOpen && 'bg-muted'
            )}
            onClick={() => toggleLayer('settings')}
            title="Settings"
          >
            <Settings
              className={cn(
                'size-4',
                isSettingsShowing ? 'text-brand-500' : 'text-muted-foreground'
              )}
            />
          </Button>
        </div>
      </aside>
    );
  }

  // --- Full sidebar -----------------------------------------------------
  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-border/60 bg-sidebar"
      style={{ width: sidebarWidth, minWidth: SIDEBAR_MIN_WIDTH, maxWidth: SIDEBAR_MAX_WIDTH }}
      data-testid="app-sidebar"
    >
      {/* Header: search + status filter (funnel) + quick launcher + collapse.
          Every project is listed below, so there is no project selector here. */}
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-2 shrink-0',
          isElectron() && isMac && 'pt-8'
        )}
      >
        {/* Search / command palette trigger */}
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border/60 px-2 py-1.5',
            'text-[12px] text-muted-foreground cursor-pointer',
            'hover:bg-accent/40 hover:border-border transition-colors duration-100'
          )}
          data-testid="sidebar-search-trigger"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">Search…</span>
          <kbd className="shrink-0 rounded border border-border/60 px-1 text-[10px] font-mono">
            {isMac ? '⌘K' : 'Ctrl K'}
          </kbd>
        </button>

        {boardControls?.onStatusTabsCommit ? (
          <BoardStatusDropdown
            iconOnly
            activeTabs={boardControls.activeStatusTabs ?? [boardControls.activeStatusTab]}
            onTabChange={boardControls.onStatusTabsCommit}
            tabs={boardControls.statusTabs}
            tabCounts={boardControls.statusTabCounts}
            onCreateStatus={boardControls.onCreateStatus}
            onDeleteStatus={boardControls.onDeleteStatus}
            assigneeOptions={boardControls.assigneeOptions}
            activeAssignees={boardControls.assigneeFilter}
            onAssigneeChange={boardControls.onAssigneeFilterChange}
            dropdownLabel="Filter tasks"
          />
        ) : null}

        <QuickLauncher
          currentProject={currentProject}
          onCreateWorktree={onCreateWorktree}
          onOpenProject={openFolder}
        />

        <Button
          variant="ghost"
          size="sm"
          className="size-7 shrink-0 p-0"
          onClick={toggleSidebar}
          title="Collapse sidebar"
        >
          <PanelLeftClose className="size-4 text-muted-foreground" />
        </Button>
      </div>

      {/* New feature — sits directly under the toolbar row */}
      <div className="px-2 pb-2 shrink-0">
        <button
          type="button"
          onClick={() => onCreateFeature()}
          className={cn(
            'flex w-full items-center gap-2 rounded-md border border-border/60 px-2 py-1.5',
            'text-[12px] font-medium cursor-pointer',
            'hover:bg-accent/40 hover:border-border transition-colors duration-100'
          )}
          data-testid="sidebar-new-feature"
        >
          <Plus className="size-3.5 shrink-0 text-brand-500" />
          <span className="flex-1 text-left">New feature</span>
          <kbd className="shrink-0 rounded border border-border/60 px-1 text-[10px] font-mono text-muted-foreground">
            {isMac ? '⌘N' : 'Ctrl N'}
          </kbd>
        </button>
      </div>

      {/* Scrollable body. Right-clicking anywhere that is not a feature row
          (rows stop propagation) offers the blank-space actions. */}
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-1',
          projectDropTarget?.kind === 'root' && 'bg-brand-500/5'
        )}
        onContextMenu={(event) => blankMenu.openAt(event, 'blank')}
        // Dropping a project on the background lifts it out of its folder.
        onDragOver={(event) => allowProjectDrop(event, { kind: 'root' })}
        onDragLeave={() => setProjectDropTarget(null)}
        onDrop={handleDropOnProjectRoot}
        data-testid="sidebar-body"
      >
        <PinnedSection
          features={pinnedFeatures}
          activeFeatureId={activeFeatureId}
          selectedFeatureIds={selectedFeatureIds}
          runningFeatureIds={runningFeatureIds}
          syncStatusFor={syncStatusFor}
          onOpen={handleOpen}
          onFeatureContextMenu={handleFeatureContextMenu}
          renamingGroupId={renamingGroupId}
          setRenamingGroupId={setRenamingGroupId}
        />

        {/* Scratchpad: throwaway chats that belong to no project at all */}
        <ScratchpadSection />

        {/* Tasks: every project, each grouped by branch, then by status.
            The '+' on any header creates a feature already scoped to it. */}
        {projectSections.length === 0 ? (
          <SidebarSection
            id="workspaces"
            label="Tasks"
            count={0}
            emptyMessage="No active features. Create one to get started."
            action={
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-5 p-0"
                  onClick={() => onCreateFeature()}
                  title="New feature"
                  data-testid="sidebar-add-feature-empty"
                >
                  <Plus className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('size-5 p-0', isProjectViewOpen && 'text-brand-500')}
                  onClick={() => toggleProjectView()}
                  title="Project view — files, chat, agents, scripts, deploy, MCP"
                  data-testid="sidebar-project-view"
                >
                  <LayoutPanelLeft className="size-3" />
                </Button>
              </div>
            }
          >
            {null}
          </SidebarSection>
        ) : (
          <>
            {projectLayout.folders.map(({ group, members }) => (
              <div key={group.id} className="flex flex-col gap-px">
                <SidebarGroupHeader
                  groupId={group.id}
                  name={group.name}
                  collapsed={group.collapsed}
                  memberCount={members.length}
                  isRenaming={renamingGroupId === group.id}
                  isDropTarget={
                    projectDropTarget?.kind === 'group' && projectDropTarget.id === group.id
                  }
                  testId="sidebar-project-group"
                  onCommitRename={(name) => {
                    renameProjectGroup(group.id, name);
                    setRenamingGroupId(null);
                  }}
                  onCancelRename={() => setRenamingGroupId(null)}
                  onToggle={() => toggleProjectGroupCollapsed(group.id)}
                  onContextMenu={(event) => folderMenu.openAt(event, { kind: 'project', group })}
                  onDragOver={(event) => allowProjectDrop(event, { kind: 'group', id: group.id })}
                  onDragLeave={() => setProjectDropTarget(null)}
                  onDrop={(event) => handleDropOnProjectFolder(group.id, event)}
                />

                {!group.collapsed &&
                  (members.length > 0 ? (
                    members.map((project) => renderProjectSection(project, true))
                  ) : (
                    <p className="px-3 py-1 pl-7 text-[11px] text-muted-foreground/70">
                      Drag projects here.
                    </p>
                  ))}
              </div>
            ))}

            {projectLayout.ungrouped.map((project) => renderProjectSection(project, false))}
          </>
        )}
      </div>

      {/* Footer: tools, then refresh / usage / settings, then the agent tracker */}
      <div className="shrink-0 border-t border-border/60 p-1">
        <div className="grid grid-cols-4 gap-0.5">
          {TOOL_ITEMS.map((tool) => {
            const Icon = tool.icon;
            const isOpen = isLayerOpen(tool.id);
            const isShowing = isLayerShowing(tool.id);
            return (
              <Button
                key={tool.id}
                variant="ghost"
                size="sm"
                className={cn(
                  'size-8 p-0',
                  isShowing ? 'bg-brand-500/10 text-brand-500' : isOpen && 'bg-muted'
                )}
                onClick={() => toggleLayer(tool.id)}
                title={isOpen && !isShowing ? `${tool.label} (open)` : tool.label}
                data-testid={`sidebar-tool-${tool.id}`}
                aria-pressed={isShowing}
              >
                <Icon className={cn('size-4', !isShowing && 'text-muted-foreground')} />
              </Button>
            );
          })}

          {/* Refresh features — relocated from the old top bar */}
          <Button
            variant="ghost"
            size="sm"
            className="size-8 p-0"
            onClick={() => boardControls?.onRefresh?.()}
            disabled={!boardControls?.onRefresh || boardControls.isRefreshing}
            title="Refresh features"
            data-testid="refresh-features-button"
          >
            <RefreshCw
              className={cn(
                'size-4 text-muted-foreground',
                boardControls?.isRefreshing && 'animate-spin'
              )}
            />
          </Button>

          {/* Usage — relocated from the old top bar */}
          <UsagePopover compact triggerClassName="size-8" align="start" />

          {/* Global settings — relocated from the old top bar */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'size-8 p-0',
              isSettingsShowing ? 'bg-brand-500/10 text-brand-500' : isSettingsOpen && 'bg-muted'
            )}
            onClick={() => toggleLayer('settings')}
            title="Settings"
            data-testid="sidebar-global-settings"
          >
            <Settings className={cn('size-4', !isSettingsShowing && 'text-muted-foreground')} />
          </Button>

          {/* Scratchpad — a throwaway chat with no project attached. Last in the
              grid because it is the one tool that is not about this workspace. */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'size-8 p-0',
              isScratchShowing ? 'bg-brand-500/10 text-brand-500' : isScratchOpen && 'bg-muted'
            )}
            onClick={() => toggleLayer('scratch')}
            title="Scratchpad — throwaway chat, no repo, global skills only"
            data-testid="sidebar-tool-scratch"
            aria-pressed={isScratchShowing}
          >
            <Sparkles className={cn('size-4', !isScratchShowing && 'text-muted-foreground')} />
          </Button>
        </div>

        {/* Agent tracker gets a row of its own */}
        <div className="mt-0.5">
          <RunningAgentsIndicator
            size="sm"
            className="h-8 w-full justify-start"
            onNavigate={() => showBoardTab()}
          />
        </div>
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-brand-500/40 active:bg-brand-500/60"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      />

      {/* Right-click menu for blank space in the list */}
      <ContextMenu controller={blankMenu}>
        <DropdownMenuItem onSelect={() => onCreateFeature()} data-testid="sidebar-blank-add-task">
          <Plus className="mr-2 size-4" />
          Add task…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void openFolder();
          }}
          data-testid="sidebar-blank-add-project"
        >
          <FolderPlus className="mr-2 size-4" />
          Add project…
        </DropdownMenuItem>
      </ContextMenu>

      {/* Right-click menu shared by the project, branch and status headers.
          The task it creates inherits whichever group was clicked. */}
      <ContextMenu controller={groupMenu}>
        {menuGroup && (
          <>
            <DropdownMenuLabel className="truncate text-[11px] text-muted-foreground">
              {menuGroup.label}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onCreateFeature(menuGroup.context)}
              data-testid="sidebar-group-add-task"
            >
              <Plus className="mr-2 size-4" />
              Add task…
            </DropdownMenuItem>

            {/* Folders, for anyone who would rather not drag. Same folders the
                drops build — this is a second way in, not a second feature. */}
            {menuGroup.project && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    className="gap-2"
                    data-testid="sidebar-group-project-folder"
                  >
                    <FolderPlus className="size-3.5" />
                    Group
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-56">
                      <DropdownMenuItem
                        className="gap-2"
                        onSelect={() =>
                          setRenamingGroupId(
                            createProjectGroup(undefined, [menuGroup.project!.path])
                          )
                        }
                        data-testid="sidebar-group-new-project-folder"
                      >
                        <FolderPlus className="size-3.5" />
                        New group…
                      </DropdownMenuItem>

                      {projectFolders.length > 0 && <DropdownMenuSeparator />}
                      {projectFolders.map((folder) => {
                        const current =
                          projectFolderIdByPath.get(menuGroup.project!.path) === folder.id;
                        return (
                          <DropdownMenuItem
                            key={folder.id}
                            className="gap-2"
                            disabled={current}
                            onSelect={() => moveProjectToGroup(menuGroup.project!.path, folder.id)}
                          >
                            <Folder className="size-3.5" />
                            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                            {current && <Check className="size-3.5 text-brand-500" />}
                          </DropdownMenuItem>
                        );
                      })}

                      {projectFolderIdByPath.has(menuGroup.project.path) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="gap-2"
                            onSelect={() => moveProjectToGroup(menuGroup.project!.path, null)}
                            data-testid="sidebar-group-remove-project-from-folder"
                          >
                            <Ungroup className="size-3.5" />
                            Remove from group
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </>
            )}

            {menuGroup.branch && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    className="gap-2"
                    data-testid="sidebar-group-branch-folder"
                  >
                    <FolderPlus className="size-3.5" />
                    Group
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-56">
                      <DropdownMenuItem
                        className="gap-2"
                        onSelect={() =>
                          setRenamingGroupId(
                            createBranchGroup(menuGroup.branch!.projectPath, undefined, [
                              menuGroup.branch!.branchKey,
                            ])
                          )
                        }
                        data-testid="sidebar-group-new-branch-folder"
                      >
                        <FolderPlus className="size-3.5" />
                        New group…
                      </DropdownMenuItem>

                      {menuBranchFolders.length > 0 && <DropdownMenuSeparator />}
                      {menuBranchFolders.map((folder) => {
                        const current = folder.members.includes(menuGroup.branch!.branchKey);
                        return (
                          <DropdownMenuItem
                            key={folder.id}
                            className="gap-2"
                            disabled={current}
                            onSelect={() =>
                              moveBranchToGroup(
                                menuGroup.branch!.projectPath,
                                menuGroup.branch!.branchKey,
                                folder.id
                              )
                            }
                          >
                            <Folder className="size-3.5" />
                            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                            {current && <Check className="size-3.5 text-brand-500" />}
                          </DropdownMenuItem>
                        );
                      })}

                      {menuBranchFolders.some((folder) =>
                        folder.members.includes(menuGroup.branch!.branchKey)
                      ) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="gap-2"
                            onSelect={() =>
                              moveBranchToGroup(
                                menuGroup.branch!.projectPath,
                                menuGroup.branch!.branchKey,
                                null
                              )
                            }
                            data-testid="sidebar-group-remove-branch-from-folder"
                          >
                            <Ungroup className="size-3.5" />
                            Remove from group
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </>
            )}
            {menuGroup.dead && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setDeadBranchToDelete(menuGroup.dead ?? null)}
                  data-testid="sidebar-group-delete-dead-branch"
                >
                  <Trash2 className="mr-2 size-4" />
                  {menuGroup.dead.featureIds.length > 0
                    ? `Delete branch and ${menuGroup.dead.featureIds.length} task${
                        menuGroup.dead.featureIds.length === 1 ? '' : 's'
                      }…`
                    : 'Remove branch…'}
                </DropdownMenuItem>
              </>
            )}
            {menuGroup.live && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setBranchToDelete(menuGroup.live ?? null)}
                  data-testid="sidebar-group-delete-branch"
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete branch…
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </ContextMenu>

      {/* Right-click menu for a folder of projects or of branches. Deleting one
          is only ever a regrouping — whatever was inside stays exactly where it
          was, just loose again. */}
      <ContextMenu controller={folderMenu}>
        {menuFolder && (
          <>
            <DropdownMenuLabel className="truncate text-[11px] text-muted-foreground">
              {menuFolder.group.name}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => setRenamingGroupId(menuFolder.group.id)}
              data-testid="sidebar-folder-rename"
            >
              <Pencil className="size-3.5" />
              Rename group
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              onSelect={() =>
                menuFolder.kind === 'project'
                  ? toggleProjectGroupCollapsed(menuFolder.group.id)
                  : toggleBranchGroupCollapsed(menuFolder.group.id)
              }
            >
              {menuFolder.group.collapsed ? (
                <FolderOpen className="size-3.5" />
              ) : (
                <Folder className="size-3.5" />
              )}
              {menuFolder.group.collapsed ? 'Expand group' : 'Collapse group'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onSelect={() =>
                menuFolder.kind === 'project'
                  ? deleteProjectGroup(menuFolder.group.id)
                  : deleteBranchGroup(menuFolder.group.id)
              }
              data-testid="sidebar-folder-ungroup"
            >
              <Ungroup className="size-3.5" />
              {menuFolder.kind === 'project'
                ? 'Ungroup (keep projects)'
                : 'Ungroup (keep branches)'}
            </DropdownMenuItem>
          </>
        )}
      </ContextMenu>

      {/* Clearing away a branch git no longer has. Destructive and
          irreversible — the tasks are deleted from disk — so it is always
          confirmed, and the dialog names exactly what goes. */}
      <DeleteConfirmDialog
        open={!!deadBranchToDelete}
        onOpenChange={(open) => {
          if (!open) setDeadBranchToDelete(null);
        }}
        onConfirm={() => {
          if (deadBranchToDelete) void handleDeleteDeadBranch(deadBranchToDelete);
          setDeadBranchToDelete(null);
        }}
        title={`Delete ${deadBranchToDelete?.branchName ?? 'branch'}?`}
        description={
          deadBranchToDelete?.featureIds.length
            ? `This branch no longer exists in the repository. Deleting it removes ${
                deadBranchToDelete.featureIds.length
              } task${
                deadBranchToDelete.featureIds.length === 1 ? '' : 's'
              } from the list and from disk. This cannot be undone.`
            : 'This branch no longer exists in the repository. Removing it clears the leftover group from the list.'
        }
        confirmText={deadBranchToDelete?.featureIds.length ? 'Delete tasks' : 'Remove'}
        testId="delete-dead-branch-dialog"
        confirmTestId="confirm-delete-dead-branch"
        showShiftTip={false}
      />

      {/* Deleting a branch git still has. Its own dialog, because the remote
          copy and any unmerged commits have to be acknowledged first. */}
      <DeleteBranchDialog
        target={branchToDelete}
        onOpenChange={(open) => {
          if (!open) setBranchToDelete(null);
        }}
        onDeleted={(projectPath) => {
          // Both listings feed the branch groups, and the deleted branch has to
          // drop out of each of them before the sidebar reads as true.
          void refreshLocalBranches(projectPath);
          refreshRemoteBranches();
        }}
      />

      {/* Right-click menu shared by every feature row, pinned or not */}
      <ContextMenu controller={featureMenu}>
        {menuFeature && (
          <FeatureContextMenuItems
            feature={menuFeature}
            onOpen={(featureId) => openWorkbench(featureId)}
            onRenameGroup={setRenamingGroupId}
            onAddTask={onCreateFeature}
            onEditFeature={boardControls?.onEditFeature}
            onSetFeatureStatus={boardControls?.onSetFeatureStatus}
          />
        )}
      </ContextMenu>
    </aside>
  );
}
