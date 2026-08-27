import {
  Bot,
  Brain,
  FileText,
  GitPullRequest,
  Lightbulb,
  Settings,
  Terminal,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import {
  useCenterStore,
  centerTabKey,
  openToolTab,
  toolTabKey,
  useIsTabActive,
  useIsTabOpen,
} from './center-store';

/**
 * Tools — the terminal, spec editor, ideation, memory, the pull-request view
 * and the settings screens. GitHub issues are not here: they are tasks on the
 * board, not a view of their own.
 *
 * These used to own a stack of their own that covered the centre. They are now
 * ordinary centre tabs (see `center-store`), so this module is just their
 * catalogue plus a few helpers that speak in tool ids rather than tab keys.
 */

export type LayerId =
  | 'settings'
  | 'terminal'
  | 'ideation'
  | 'spec'
  | 'memory'
  | 'github-prs'
  | 'project-settings'
  | 'interview'
  | 'research';

export const LAYER_TITLES: Record<LayerId, string> = {
  settings: 'Settings',
  terminal: 'Terminal',
  ideation: 'Ideation',
  spec: 'Spec Editor',
  memory: 'Memory',
  'github-prs': 'GitHub Pull Requests',
  'project-settings': 'Project Settings',
  interview: 'Interview',
  research: 'Research',
};

/** Short labels for the tab strip, where horizontal space is scarce. */
export const LAYER_TAB_LABELS: Record<LayerId, string> = {
  ...LAYER_TITLES,
  'github-prs': 'GitHub PRs',
  spec: 'Spec',
};

export const LAYER_ICONS: Record<LayerId, LucideIcon> = {
  settings: Settings,
  terminal: Terminal,
  ideation: Lightbulb,
  spec: FileText,
  memory: Brain,
  'github-prs': GitPullRequest,
  'project-settings': Settings,
  interview: Wand2,
  research: Bot,
};

/** Open a tool in the centre, adding a tab for it if it has none. */
export function openLayer(id: LayerId): void {
  openToolTab(id);
}

/** Click-again-to-close: open, focus, then close on the third click. */
export function toggleLayer(id: LayerId): void {
  useCenterStore.getState().toggleTab({ kind: 'tool', toolId: id });
}

/** Close a tool's tab. */
export function closeLayer(id: LayerId): void {
  useCenterStore.getState().closeTab(toolTabKey(id));
}

/** Close every open tool, leaving the other tabs alone. */
export function closeAllLayers(): void {
  const { tabs, closeTab } = useCenterStore.getState();
  for (const tab of tabs) {
    if (tab.kind === 'tool') closeTab(centerTabKey(tab));
  }
}

/** Does this tool hold a tab? */
export function useIsLayerOpen(id: LayerId): boolean {
  return useIsTabOpen(toolTabKey(id));
}

/** Is this tool the thing currently on screen? */
export function useIsLayerShowing(id: LayerId): boolean {
  return useIsTabActive(toolTabKey(id));
}
