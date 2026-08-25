import { create } from 'zustand';
import type { LayerId } from './layer-store';

/**
 * Centre tabs
 *
 * The centre of the screen used to show exactly one thing: opening a task
 * threw away the tool you were looking at, opening a tool hid the task, and
 * the board sat underneath all of it. Everything now opens as a tab instead,
 * so nothing is ever displaced — a second open thing just grows the strip.
 *
 * The board is tab zero: always present, never closable, and the place you
 * land when the last tab closes.
 */

export type CenterTab =
  | { kind: 'board' }
  | { kind: 'feature'; featureId: string }
  | { kind: 'project' }
  | { kind: 'tool'; toolId: LayerId };

export type CenterTabKind = CenterTab['kind'];

export const BOARD_TAB: CenterTab = { kind: 'board' };
export const BOARD_TAB_KEY = 'board';
export const PROJECT_TAB_KEY = 'project';

/** Stable identity for a tab — what `activeKey` and every lookup use. */
export function centerTabKey(tab: CenterTab): string {
  switch (tab.kind) {
    case 'board':
      return BOARD_TAB_KEY;
    case 'feature':
      return `feature:${tab.featureId}`;
    case 'project':
      return PROJECT_TAB_KEY;
    case 'tool':
      return `tool:${tab.toolId}`;
  }
}

export function featureTabKey(featureId: string): string {
  return `feature:${featureId}`;
}

export function toolTabKey(toolId: LayerId): string {
  return `tool:${toolId}`;
}

/** After closing a tab, fall to its neighbour — the one on its right, else left. */
function neighbourKeyOf(tabs: CenterTab[], closedIndex: number): string {
  if (tabs.length === 0) return BOARD_TAB_KEY;
  const index = Math.min(closedIndex, tabs.length - 1);
  return centerTabKey(tabs[index] ?? BOARD_TAB);
}

interface CenterState {
  /** Open tabs in strip order; index 0 is always the board */
  tabs: CenterTab[];
  /** Key of the tab currently filling the centre */
  activeKey: string;
}

interface CenterActions {
  /** Open a tab (or focus it if it already exists) and put it on screen */
  openTab: (tab: CenterTab) => void;
  /** Show an already-open tab; unknown keys are ignored */
  activateTab: (key: string) => void;
  /**
   * Click-again-to-close: opens what is closed, focuses what is open but
   * hidden, and closes what is already on screen.
   */
  toggleTab: (tab: CenterTab) => void;
  /** Close a tab and fall to its neighbour. The board never closes. */
  closeTab: (key: string) => void;
  /** Close everything except `key` (and the board) */
  closeOtherTabs: (key: string) => void;
  /** Back to a bare board */
  closeAllTabs: () => void;
  /** Move to the next/previous tab, wrapping around */
  cycleTab: (direction: 1 | -1) => void;
  /** Drop tabs for features that no longer exist */
  pruneFeatureTabs: (existingFeatureIds: Set<string>) => void;
}

export const useCenterStore = create<CenterState & CenterActions>((set, get) => ({
  tabs: [BOARD_TAB],
  activeKey: BOARD_TAB_KEY,

  openTab: (tab) =>
    set((state) => {
      const key = centerTabKey(tab);
      const exists = state.tabs.some((candidate) => centerTabKey(candidate) === key);
      return {
        tabs: exists ? state.tabs : [...state.tabs, tab],
        activeKey: key,
      };
    }),

  activateTab: (key) =>
    set((state) =>
      state.tabs.some((tab) => centerTabKey(tab) === key) ? { activeKey: key } : state
    ),

  toggleTab: (tab) => {
    const key = centerTabKey(tab);
    const state = get();
    if (state.activeKey === key) {
      state.closeTab(key);
      return;
    }
    state.openTab(tab);
  },

  closeTab: (key) =>
    set((state) => {
      if (key === BOARD_TAB_KEY) return state;
      const index = state.tabs.findIndex((tab) => centerTabKey(tab) === key);
      if (index === -1) return state;

      const tabs = state.tabs.filter((tab) => centerTabKey(tab) !== key);
      if (state.activeKey !== key) return { tabs, activeKey: state.activeKey };

      return { tabs, activeKey: neighbourKeyOf(tabs, index) };
    }),

  closeOtherTabs: (key) =>
    set((state) => {
      const tabs = state.tabs.filter(
        (tab) => centerTabKey(tab) === BOARD_TAB_KEY || centerTabKey(tab) === key
      );
      const activeKey = tabs.some((tab) => centerTabKey(tab) === state.activeKey)
        ? state.activeKey
        : key;
      return { tabs, activeKey };
    }),

  closeAllTabs: () => set({ tabs: [BOARD_TAB], activeKey: BOARD_TAB_KEY }),

  cycleTab: (direction) =>
    set((state) => {
      if (state.tabs.length < 2) return state;
      const currentIndex = state.tabs.findIndex((tab) => centerTabKey(tab) === state.activeKey);
      const safeIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex = (safeIndex + direction + state.tabs.length) % state.tabs.length;
      return { activeKey: centerTabKey(state.tabs[nextIndex]) };
    }),

  pruneFeatureTabs: (existingFeatureIds) =>
    set((state) => {
      const tabs = state.tabs.filter(
        (tab) => tab.kind !== 'feature' || existingFeatureIds.has(tab.featureId)
      );
      if (tabs.length === state.tabs.length) return state;
      const activeKey = tabs.some((tab) => centerTabKey(tab) === state.activeKey)
        ? state.activeKey
        : BOARD_TAB_KEY;
      return { tabs, activeKey };
    }),
}));

// ============================================================================
// Imperative helpers — for call sites that only want to open something
// ============================================================================

/** Open a task in the centre. */
export function openFeatureTab(featureId: string): void {
  useCenterStore.getState().openTab({ kind: 'feature', featureId });
}

/** Close a task's tab, if it has one. */
export function closeFeatureTab(featureId: string): void {
  useCenterStore.getState().closeTab(featureTabKey(featureId));
}

/** Open the project workspace in the centre. */
export function openProjectTab(): void {
  useCenterStore.getState().openTab({ kind: 'project' });
}

export function closeProjectTab(): void {
  useCenterStore.getState().closeTab(PROJECT_TAB_KEY);
}

/** Open a tool (terminal, spec, memory, GitHub, settings…) in the centre. */
export function openToolTab(toolId: LayerId): void {
  useCenterStore.getState().openTab({ kind: 'tool', toolId });
}

export function closeToolTab(toolId: LayerId): void {
  useCenterStore.getState().closeTab(toolTabKey(toolId));
}

/** Bring the board back to the front without disturbing any open tab. */
export function showBoardTab(): void {
  useCenterStore.getState().activateTab(BOARD_TAB_KEY);
}

// ============================================================================
// Selectors
// ============================================================================

/** The task on screen right now, or null when the centre shows anything else. */
export function useActiveFeatureId(): string | null {
  return useCenterStore((state) => {
    const tab = state.tabs.find((candidate) => centerTabKey(candidate) === state.activeKey);
    return tab?.kind === 'feature' ? tab.featureId : null;
  });
}

/** Same as `useActiveFeatureId`, for imperative call sites. */
export function getActiveFeatureId(): string | null {
  const { tabs, activeKey } = useCenterStore.getState();
  const tab = tabs.find((candidate) => centerTabKey(candidate) === activeKey);
  return tab?.kind === 'feature' ? tab.featureId : null;
}

/** Does this tab exist in the strip? */
export function useIsTabOpen(key: string): boolean {
  return useCenterStore((state) => state.tabs.some((tab) => centerTabKey(tab) === key));
}

/** Is this tab the one filling the centre? */
export function useIsTabActive(key: string): boolean {
  return useCenterStore((state) => state.activeKey === key);
}
