import { create } from 'zustand';
import { getItem, setItem } from '@/lib/storage';
import { openFeatureTab } from './center-store';

/**
 * Workbench Store
 *
 * Owns the shell state introduced by the workspace-centric UI:
 *  - the persistent left sidebar (width / collapsed / section state)
 *  - which pane of an open task the workbench shows
 *  - the command palette
 *
 * Which things are open in the centre — the board, tasks, the project, tools —
 * belongs to `center-store`; this store only describes what is inside them.
 *
 * Feature data itself still lives in app-store; this store only tracks
 * presentation so it can persist cheaply to localStorage without fighting
 * the API-backed settings sync.
 */

// ============================================================================
// Tabs
// ============================================================================

export type WorkbenchTabId = 'agent' | 'diff' | 'files' | 'terminal' | 'browser';

export interface WorkbenchTabConfig {
  id: WorkbenchTabId;
  label: string;
  /** Digit used with Ctrl/Cmd to jump straight to this pane */
  shortcutDigit: string;
}

export const WORKBENCH_TABS: WorkbenchTabConfig[] = [
  { id: 'agent', label: 'Agent', shortcutDigit: '1' },
  { id: 'diff', label: 'Diff', shortcutDigit: '2' },
  { id: 'files', label: 'Files', shortcutDigit: '3' },
  { id: 'terminal', label: 'Terminal', shortcutDigit: '4' },
  { id: 'browser', label: 'Browser', shortcutDigit: '5' },
];

export const DEFAULT_WORKBENCH_TAB: WorkbenchTabId = 'agent';

function isWorkbenchTabId(value: string): value is WorkbenchTabId {
  return WORKBENCH_TABS.some((tab) => tab.id === value);
}

// ============================================================================
// Layout
// ============================================================================

/** Sidebar sections that can be collapsed independently. */
export type SidebarSectionId =
  | 'pinned'
  | 'workspaces'
  | 'sessions'
  | 'tools'
  | 'scratchpad'
  /** One section per feature status, e.g. `status:in_progress` */
  | `status:${string}`
  /** One section per project, e.g. `project:C:/code/dmaker` */
  | `project:${string}`
  /** One section per branch within a project, e.g. `branch:C:/code/dmaker:main` */
  | `branch:${string}`;

/**
 * A user-made folder inside the Pinned section.
 *
 * Grouping is pure presentation — a feature's `isFavorite` flag still decides
 * whether it is pinned at all, and a group merely says where it sits once it
 * is. Groups therefore live here (localStorage) rather than on the feature.
 */
export interface PinGroup {
  id: string;
  name: string;
  /** Pinned feature IDs in this group, in user order */
  featureIds: string[];
  collapsed: boolean;
}

/**
 * Shared shape of the user-made folders in the sidebar tree.
 *
 * Grouping is pure presentation: nothing about the project or the branch
 * changes, only where it sits in the list. Groups therefore live here
 * (localStorage) rather than in project settings or in git.
 */
interface SidebarGroupBase {
  id: string;
  name: string;
  /** Member keys in user order — see each group's own doc for what they are */
  members: string[];
  collapsed: boolean;
}

/** A folder of projects at the top level of the sidebar. Members are paths. */
export type ProjectGroup = SidebarGroupBase;

/**
 * A folder of branches inside one project. Members are branch keys, matching
 * the keys the sidebar builds its branch groups from — a branch name, or
 * `__unbranched__` for the catch-all bucket.
 *
 * Scoped to a project because branch names repeat across repositories: 'main'
 * in one project must never be folded in with 'main' in another.
 */
export interface BranchGroup extends SidebarGroupBase {
  projectPath: string;
}

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 480;
export const SIDEBAR_DEFAULT_WIDTH = 268;

// ============================================================================
// Persistence
// ============================================================================

const STORAGE_KEY = 'dmaker:workbench-ui';

interface PersistedShape {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  activeTab: WorkbenchTabId;
  collapsedSections: SidebarSectionId[];
  pinGroups: PinGroup[];
  projectGroups: ProjectGroup[];
  branchGroups: BranchGroup[];
}

function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function readPersisted(): Partial<PersistedShape> {
  const raw = getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Drop anything malformed so one bad localStorage write can't break the sidebar. */
function sanitizePinGroups(value: unknown): PinGroup[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const groups: PinGroup[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const group = entry as Partial<PinGroup>;
    if (typeof group.id !== 'string' || !group.id || seen.has(group.id)) continue;
    seen.add(group.id);
    groups.push({
      id: group.id,
      name: typeof group.name === 'string' && group.name ? group.name : 'Group',
      featureIds: Array.isArray(group.featureIds)
        ? group.featureIds.filter((id): id is string => typeof id === 'string')
        : [],
      collapsed: group.collapsed === true,
    });
  }
  return groups;
}

/**
 * Same guard for the project / branch folders, which share one shape.
 *
 * `requireProjectPath` is what keeps a branch group honest: one that lost the
 * project it belongs to could never be matched to a project again, so it is
 * dropped rather than left floating.
 */
function sanitizeSidebarGroups<T extends SidebarGroupBase>(
  value: unknown,
  requireProjectPath: boolean
): T[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const groups: T[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const group = entry as Partial<BranchGroup>;
    if (typeof group.id !== 'string' || !group.id || seen.has(group.id)) continue;
    if (requireProjectPath && (typeof group.projectPath !== 'string' || !group.projectPath)) {
      continue;
    }
    seen.add(group.id);
    groups.push({
      id: group.id,
      name: typeof group.name === 'string' && group.name ? group.name : 'Group',
      members: Array.isArray(group.members)
        ? group.members.filter((member): member is string => typeof member === 'string')
        : [],
      collapsed: group.collapsed === true,
      ...(requireProjectPath ? { projectPath: group.projectPath } : {}),
    } as T);
  }
  return groups;
}

let groupCounter = 0;

function nextGroupId(prefix: string): string {
  groupCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${groupCounter}`;
}

/** "Group", "Group 2", "Group 3"… — first free name for a drag-made group. */
function nextGroupName(existing: Array<{ name: string }>): string {
  const taken = new Set(existing.map((group) => group.name));
  if (!taken.has('Group')) return 'Group';
  for (let index = 2; ; index += 1) {
    const candidate = `Group ${index}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Take `member` out of every group `inScope` accepts.
 *
 * Always runs before an insert, even when the member is moving within one
 * group: the insert index has to be measured against the list with the member
 * already gone, or dragging something down its own group lands it one short.
 */
function stripMember<T extends SidebarGroupBase>(
  groups: T[],
  member: string,
  inScope: (group: T) => boolean
): T[] {
  return groups.map((group) =>
    inScope(group)
      ? { ...group, members: group.members.filter((existing) => existing !== member) }
      : group
  );
}

/** Put `member` into `groupId`, ahead of `before` when that is still a member. */
function insertMember<T extends SidebarGroupBase>(
  groups: T[],
  groupId: string,
  member: string,
  before?: string
): T[] {
  return groups.map((group) => {
    if (group.id !== groupId) return group;
    const members = [...group.members];
    const index = before ? members.indexOf(before) : -1;
    members.splice(index === -1 ? members.length : index, 0, member);
    return { ...group, members };
  });
}

// ============================================================================
// Store
// ============================================================================

interface WorkbenchState {
  /** Sidebar is reduced to a narrow icon rail */
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  /** Sections the user has folded shut */
  collapsedSections: Set<SidebarSectionId>;

  /** Pane shown inside the workbench, shared by every open task */
  activeTab: WorkbenchTabId;

  commandPaletteOpen: boolean;

  /** Features selected via cmd-click / shift-click in the sidebar */
  selectedFeatureIds: string[];
  /** Anchor row for shift-click range selection */
  selectionAnchorId: string | null;

  /** User-made folders inside the Pinned section */
  pinGroups: PinGroup[];
  /** User-made folders holding projects at the top level of the sidebar */
  projectGroups: ProjectGroup[];
  /** User-made folders holding branches, each scoped to one project */
  branchGroups: BranchGroup[];
}

interface WorkbenchActions {
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;

  toggleSection: (id: SidebarSectionId) => void;

  /** Open a task as a centre tab (optionally on a specific pane) */
  openWorkbench: (featureId: string, tab?: WorkbenchTabId) => void;
  setActiveTab: (tab: WorkbenchTabId) => void;
  /** Move to the next/previous pane, wrapping around */
  cycleTab: (direction: 1 | -1) => void;

  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;

  /** Create a group (optionally seeded with pins) and return its id */
  createPinGroup: (name?: string, featureIds?: string[]) => string;
  renamePinGroup: (groupId: string, name: string) => void;
  /** Delete the group; its features stay pinned, just ungrouped */
  deletePinGroup: (groupId: string) => void;
  togglePinGroupCollapsed: (groupId: string) => void;
  /** Move a pinned feature into a group, or to the top level with `null` */
  movePinnedFeature: (featureId: string, groupId: string | null, beforeFeatureId?: string) => void;
  /** Drop a feature onto another to fold both into a fresh group */
  groupPinnedFeatures: (featureIds: string[], name?: string) => string;

  /** Create a project folder (optionally seeded with projects), return its id */
  createProjectGroup: (name?: string, projectPaths?: string[]) => string;
  renameProjectGroup: (groupId: string, name: string) => void;
  /** Delete the folder; the projects stay, just ungrouped */
  deleteProjectGroup: (groupId: string) => void;
  toggleProjectGroupCollapsed: (groupId: string) => void;
  /** Move a project into a folder, or back to the top level with `null` */
  moveProjectToGroup: (
    projectPath: string,
    groupId: string | null,
    beforeProjectPath?: string
  ) => void;

  /** Create a branch folder inside one project, return its id */
  createBranchGroup: (projectPath: string, name?: string, branchKeys?: string[]) => string;
  renameBranchGroup: (groupId: string, name: string) => void;
  /** Delete the folder; the branches stay, just ungrouped */
  deleteBranchGroup: (groupId: string) => void;
  toggleBranchGroupCollapsed: (groupId: string) => void;
  /** Move a branch into a folder of its own project, or out of one with `null` */
  moveBranchToGroup: (
    projectPath: string,
    branchKey: string,
    groupId: string | null,
    beforeBranchKey?: string
  ) => void;

  setSelectedFeatureIds: (ids: string[]) => void;
  toggleFeatureSelected: (id: string) => void;
  selectFeatureRange: (orderedIds: string[], toId: string) => void;
  clearSelection: () => void;
}

const persisted = readPersisted();

const initialState: WorkbenchState = {
  sidebarCollapsed: persisted.sidebarCollapsed ?? false,
  sidebarWidth: clampWidth(persisted.sidebarWidth ?? SIDEBAR_DEFAULT_WIDTH),
  collapsedSections: new Set(persisted.collapsedSections ?? []),
  activeTab:
    persisted.activeTab && isWorkbenchTabId(persisted.activeTab)
      ? persisted.activeTab
      : DEFAULT_WORKBENCH_TAB,
  commandPaletteOpen: false,
  selectedFeatureIds: [],
  selectionAnchorId: null,
  pinGroups: sanitizePinGroups(persisted.pinGroups),
  projectGroups: sanitizeSidebarGroups<ProjectGroup>(persisted.projectGroups, false),
  branchGroups: sanitizeSidebarGroups<BranchGroup>(persisted.branchGroups, true),
};

export const useWorkbenchStore = create<WorkbenchState & WorkbenchActions>()((set, get) => {
  /** Apply a partial update, then mirror the persistable slice to localStorage. */
  const setAndPersist = (partial: Partial<WorkbenchState>) => {
    set(partial as WorkbenchState);
    const next = get();
    const payload: PersistedShape = {
      sidebarCollapsed: next.sidebarCollapsed,
      sidebarWidth: next.sidebarWidth,
      activeTab: next.activeTab,
      collapsedSections: Array.from(next.collapsedSections),
      pinGroups: next.pinGroups,
      projectGroups: next.projectGroups,
      branchGroups: next.branchGroups,
    };
    setItem(STORAGE_KEY, JSON.stringify(payload));
  };

  return {
    ...initialState,

    toggleSidebar: () => setAndPersist({ sidebarCollapsed: !get().sidebarCollapsed }),
    setSidebarCollapsed: (collapsed) => setAndPersist({ sidebarCollapsed: collapsed }),
    setSidebarWidth: (width) => setAndPersist({ sidebarWidth: clampWidth(width) }),

    toggleSection: (id) => {
      const next = new Set(get().collapsedSections);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      setAndPersist({ collapsedSections: next });
    },

    openWorkbench: (featureId, tab) => {
      // Picking a task adds a tab for it rather than displacing whatever the
      // centre was already showing.
      if (tab) setAndPersist({ activeTab: tab });
      openFeatureTab(featureId);
    },
    setActiveTab: (tab) => setAndPersist({ activeTab: tab }),
    cycleTab: (direction) => {
      const currentIndex = WORKBENCH_TABS.findIndex((tab) => tab.id === get().activeTab);
      const safeIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex = (safeIndex + direction + WORKBENCH_TABS.length) % WORKBENCH_TABS.length;
      setAndPersist({ activeTab: WORKBENCH_TABS[nextIndex].id });
    },

    setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
    toggleCommandPalette: () => set({ commandPaletteOpen: !get().commandPaletteOpen }),

    // --- Pinned groups ----------------------------------------------------

    createPinGroup: (name, featureIds = []) => {
      const groups = get().pinGroups;
      const id = nextGroupId('pin-group');
      const claimed = new Set(featureIds);
      const next = groups.map((group) => ({
        ...group,
        featureIds: group.featureIds.filter((featureId) => !claimed.has(featureId)),
      }));
      next.push({
        id,
        name: name?.trim() || nextGroupName(groups),
        featureIds: [...claimed],
        collapsed: false,
      });
      setAndPersist({ pinGroups: next });
      return id;
    },

    renamePinGroup: (groupId, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setAndPersist({
        pinGroups: get().pinGroups.map((group) =>
          group.id === groupId ? { ...group, name: trimmed } : group
        ),
      });
    },

    deletePinGroup: (groupId) =>
      setAndPersist({ pinGroups: get().pinGroups.filter((group) => group.id !== groupId) }),

    togglePinGroupCollapsed: (groupId) =>
      setAndPersist({
        pinGroups: get().pinGroups.map((group) =>
          group.id === groupId ? { ...group, collapsed: !group.collapsed } : group
        ),
      }),

    movePinnedFeature: (featureId, groupId, beforeFeatureId) => {
      const current = get().pinGroups;
      // Nothing to do when it is already ungrouped and staying that way.
      if (groupId === null && !current.some((group) => group.featureIds.includes(featureId))) {
        return;
      }

      // Pull it out of wherever it is, then insert — a move within one group
      // has to remove first so the insert index is measured against the gap.
      const stripped = current.map((group) => ({
        ...group,
        featureIds: group.featureIds.filter((id) => id !== featureId),
      }));

      if (groupId === null) {
        setAndPersist({ pinGroups: stripped });
        return;
      }

      setAndPersist({
        pinGroups: stripped.map((group) => {
          if (group.id !== groupId) return group;
          const index = beforeFeatureId ? group.featureIds.indexOf(beforeFeatureId) : -1;
          const featureIds = [...group.featureIds];
          featureIds.splice(index === -1 ? featureIds.length : index, 0, featureId);
          return { ...group, featureIds };
        }),
      });
    },

    groupPinnedFeatures: (featureIds, name) => get().createPinGroup(name, featureIds),

    // --- Project groups ---------------------------------------------------

    createProjectGroup: (name, projectPaths = []) => {
      const groups = get().projectGroups;
      const id = nextGroupId('project-group');
      const claimed = new Set(projectPaths);
      // A project belongs to one folder at a time, so seeding a new one takes
      // its members away from wherever they were.
      const next = groups.map((group) => ({
        ...group,
        members: group.members.filter((path) => !claimed.has(path)),
      }));
      next.push({
        id,
        name: name?.trim() || nextGroupName(groups),
        members: [...claimed],
        collapsed: false,
      });
      setAndPersist({ projectGroups: next });
      return id;
    },

    renameProjectGroup: (groupId, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setAndPersist({
        projectGroups: get().projectGroups.map((group) =>
          group.id === groupId ? { ...group, name: trimmed } : group
        ),
      });
    },

    deleteProjectGroup: (groupId) =>
      setAndPersist({
        projectGroups: get().projectGroups.filter((group) => group.id !== groupId),
      }),

    toggleProjectGroupCollapsed: (groupId) =>
      setAndPersist({
        projectGroups: get().projectGroups.map((group) =>
          group.id === groupId ? { ...group, collapsed: !group.collapsed } : group
        ),
      }),

    moveProjectToGroup: (projectPath, groupId, beforeProjectPath) => {
      const current = get().projectGroups;
      // Already at the top level and staying there — nothing to write.
      if (groupId === null && !current.some((group) => group.members.includes(projectPath))) {
        return;
      }

      const stripped = stripMember(current, projectPath, () => true);
      setAndPersist({
        projectGroups:
          groupId === null
            ? stripped
            : insertMember(stripped, groupId, projectPath, beforeProjectPath),
      });
    },

    // --- Branch groups ----------------------------------------------------

    createBranchGroup: (projectPath, name, branchKeys = []) => {
      const groups = get().branchGroups;
      const id = nextGroupId('branch-group');
      const claimed = new Set(branchKeys);
      // Only this project's folders can hold these branches, so only those are
      // stripped — an identically named branch elsewhere is a different thing.
      const next = groups.map((group) =>
        group.projectPath === projectPath
          ? { ...group, members: group.members.filter((key) => !claimed.has(key)) }
          : group
      );
      next.push({
        id,
        projectPath,
        name:
          name?.trim() ||
          nextGroupName(groups.filter((group) => group.projectPath === projectPath)),
        members: [...claimed],
        collapsed: false,
      });
      setAndPersist({ branchGroups: next });
      return id;
    },

    renameBranchGroup: (groupId, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setAndPersist({
        branchGroups: get().branchGroups.map((group) =>
          group.id === groupId ? { ...group, name: trimmed } : group
        ),
      });
    },

    deleteBranchGroup: (groupId) =>
      setAndPersist({
        branchGroups: get().branchGroups.filter((group) => group.id !== groupId),
      }),

    toggleBranchGroupCollapsed: (groupId) =>
      setAndPersist({
        branchGroups: get().branchGroups.map((group) =>
          group.id === groupId ? { ...group, collapsed: !group.collapsed } : group
        ),
      }),

    moveBranchToGroup: (projectPath, branchKey, groupId, beforeBranchKey) => {
      const current = get().branchGroups;
      const inProject = (group: BranchGroup) => group.projectPath === projectPath;

      if (
        groupId === null &&
        !current.some((group) => inProject(group) && group.members.includes(branchKey))
      ) {
        return;
      }

      // A branch may only land in a folder belonging to its own project.
      const target = groupId ? current.find((group) => group.id === groupId) : null;
      if (groupId && (!target || target.projectPath !== projectPath)) return;

      const stripped = stripMember(current, branchKey, inProject);
      setAndPersist({
        branchGroups:
          groupId === null ? stripped : insertMember(stripped, groupId, branchKey, beforeBranchKey),
      });
    },

    setSelectedFeatureIds: (ids) =>
      set({ selectedFeatureIds: ids, selectionAnchorId: ids[0] ?? null }),
    toggleFeatureSelected: (id) => {
      const current = get().selectedFeatureIds;
      const next = current.includes(id)
        ? current.filter((existing) => existing !== id)
        : [...current, id];
      set({ selectedFeatureIds: next, selectionAnchorId: id });
    },
    selectFeatureRange: (orderedIds, toId) => {
      const toIndex = orderedIds.indexOf(toId);
      if (toIndex === -1) return;

      // No anchor yet — behave like a plain click.
      const anchor = get().selectionAnchorId;
      const anchorIndex = anchor ? orderedIds.indexOf(anchor) : -1;
      if (anchorIndex === -1) {
        set({ selectedFeatureIds: [toId], selectionAnchorId: toId });
        return;
      }

      const start = Math.min(anchorIndex, toIndex);
      const end = Math.max(anchorIndex, toIndex);
      set({ selectedFeatureIds: orderedIds.slice(start, end + 1) });
    },
    clearSelection: () => set({ selectedFeatureIds: [], selectionAnchorId: null }),
  };
});
