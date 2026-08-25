import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  PROJECT_TAB_KEY,
  openProjectTab,
  closeProjectTab,
  useCenterStore,
  useIsTabActive,
} from './center-store';

/** Panes of the project view, in tab-strip order. */
export const PROJECT_VIEW_TABS = [
  { id: 'files', label: 'Files' },
  { id: 'chat', label: 'Chat' },
  { id: 'agents', label: 'Agents' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'memory', label: 'Memory' },
  { id: 'mcp', label: 'MCP' },
  { id: 'settings', label: 'Settings' },
] as const;

export type ProjectViewTabId = (typeof PROJECT_VIEW_TABS)[number]['id'];

interface ProjectViewState {
  /** Pane currently shown in the project view */
  activeTab: ProjectViewTabId;
  setActiveTab: (tab: ProjectViewTabId) => void;
}

/**
 * Which pane the project view is showing.
 *
 * Only the pane lives here. Whether the project view *has a centre tab*, and
 * whether that tab is the one on screen, is `center-store`'s business.
 */
export const useProjectViewStore = create<ProjectViewState>()(
  persist(
    (set) => ({
      activeTab: 'files',
      setActiveTab: (tab) => set({ activeTab: tab }),
    }),
    {
      name: 'dmaker-project-view',
      version: 1,
      // Deploy folded into Scripts — send anyone parked on the old tab there.
      migrate: (persisted) => {
        const state = persisted as Partial<ProjectViewState> | undefined;
        if (state && (state.activeTab as string) === 'deploy') {
          return { ...state, activeTab: 'scripts' } as ProjectViewState;
        }
        return state as ProjectViewState;
      },
    }
  )
);

/** Is the project view the tab currently filling the centre? */
export function useIsProjectViewOpen(): boolean {
  return useIsTabActive(PROJECT_TAB_KEY);
}

/** Open the project view as a centre tab, optionally aimed at one pane. */
export function openProjectView(tab?: ProjectViewTabId): void {
  if (tab) useProjectViewStore.getState().setActiveTab(tab);
  openProjectTab();
}

/** Close the project view's tab. */
export function closeProjectView(): void {
  closeProjectTab();
}

/**
 * Toggle the project view.
 *
 * Opens it when closed, brings it forward when it is open but covered by
 * another tab, and closes it when it is already the tab on screen. Asking for
 * a different pane always just switches panes.
 */
export function toggleProjectView(tab?: ProjectViewTabId): void {
  const { activeKey, tabs } = useCenterStore.getState();
  const hasTab = tabs.some((candidate) => candidate.kind === 'project');
  const isShowing = activeKey === PROJECT_TAB_KEY;

  if (tab && (!isShowing || useProjectViewStore.getState().activeTab !== tab)) {
    openProjectView(tab);
    return;
  }

  if (isShowing) {
    closeProjectTab();
    return;
  }

  // Open, but sitting behind another tab — bring it forward rather than
  // closing something the user cannot see.
  if (hasTab) {
    useCenterStore.getState().activateTab(PROJECT_TAB_KEY);
    return;
  }

  openProjectView(tab);
}
