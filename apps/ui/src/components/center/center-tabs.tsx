import { useCallback, useEffect, useMemo, type MouseEvent } from 'react';
import { LayoutGrid, LayoutPanelLeft, Loader2, X, type LucideIcon } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { useAppStore, type Feature } from '@/store/app-store';
import { BOARD_TAB_KEY, centerTabKey, useCenterStore, type CenterTab } from '@/store/center-store';
import { LAYER_ICONS, LAYER_TAB_LABELS } from '@/store/layer-store';
import { getStatusMeta } from '@/components/layout/sidebar/status-meta';
import { useRunningFeatureIds } from '@/hooks/use-running-feature-ids';
import { ContextMenu, useContextMenu } from '@/components/ui/context-menu';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

/** Middle mouse button, per the DOM `MouseEvent.button` scale. */
const MIDDLE_BUTTON = 1;

interface TabDescription {
  label: string;
  title: string;
  Icon: LucideIcon;
  /** Status colour for task tabs, so a running agent is visible in the strip */
  iconColor?: string;
  /** Spin the icon — an agent is working on this task right now */
  spinning?: boolean;
  closable: boolean;
}

function describeTab(
  tab: CenterTab,
  featuresById: Map<string, Feature>,
  projectName: string | null,
  runningFeatureIds: Set<string>
): TabDescription {
  switch (tab.kind) {
    case 'board':
      return { label: 'Board', title: 'Board', Icon: LayoutGrid, closable: false };

    case 'project':
      return {
        label: projectName ?? 'Project',
        title: projectName ? `Project — ${projectName}` : 'Project',
        Icon: LayoutPanelLeft,
        closable: true,
      };

    case 'tool':
      return {
        label: LAYER_TAB_LABELS[tab.toolId],
        title: LAYER_TAB_LABELS[tab.toolId],
        Icon: LAYER_ICONS[tab.toolId],
        closable: true,
      };

    case 'feature': {
      const feature = featuresById.get(tab.featureId);
      const label = feature?.title || feature?.description || 'Task';
      const statusMeta = getStatusMeta(feature?.status ?? '');
      const isRunning = runningFeatureIds.has(tab.featureId);
      return {
        label,
        title: `${label} — ${statusMeta.label}`,
        // A task tab leads with its own status glyph, or a spinner while an
        // agent is working on it.
        Icon: isRunning ? Loader2 : statusMeta.Icon,
        iconColor: statusMeta.dotColor,
        spinning: isRunning,
        closable: true,
      };
    }
  }
}

/**
 * The centre's tab strip.
 *
 * Everything that can fill the centre — the board, tasks, the project
 * workspace, tools — lives here as a tab, so opening a second thing never
 * throws away the first. The board is tab zero and cannot be closed; with
 * nothing else open the strip stays out of the way entirely.
 */
export function CenterTabs() {
  const { tabs, activeKey, activateTab, closeTab, closeOtherTabs, closeAllTabs, cycleTab } =
    useCenterStore(
      useShallow((state) => ({
        tabs: state.tabs,
        activeKey: state.activeKey,
        activateTab: state.activateTab,
        closeTab: state.closeTab,
        closeOtherTabs: state.closeOtherTabs,
        closeAllTabs: state.closeAllTabs,
        cycleTab: state.cycleTab,
      }))
    );

  const { features, currentProject } = useAppStore(
    useShallow((state) => ({ features: state.features, currentProject: state.currentProject }))
  );

  const featuresById = useMemo(
    () => new Map(features.map((feature) => [feature.id, feature])),
    [features]
  );

  /** Tasks with an agent working on them right now — their tab icon spins. */
  const runningFeatureIds = useRunningFeatureIds();

  const tabMenu = useContextMenu<string>();
  const menuKey = tabMenu.target;

  // Ctrl/Cmd+Tab cycles the strip; Escape closes whatever is on screen and
  // drops to its neighbour. Both used to be re-implemented by every view that
  // could own the centre — now there is one strip, so there is one handler.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const active = document.activeElement;
      // Let dialogs, popovers and the terminal have first refusal.
      if (active?.closest('[role="dialog"]') || active?.closest('.xterm')) return;

      if (event.key === 'Tab' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        cycleTab(event.shiftKey ? -1 : 1);
        return;
      }

      if (event.key === 'Escape') {
        const { activeKey: current } = useCenterStore.getState();
        if (current === BOARD_TAB_KEY) return;
        event.preventDefault();
        closeTab(current);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeTab, cycleTab]);

  const handleAuxClick = useCallback(
    (event: MouseEvent, key: string, closable: boolean) => {
      if (event.button !== MIDDLE_BUTTON || !closable) return;
      event.preventDefault();
      closeTab(key);
    },
    [closeTab]
  );

  // A lone board needs no strip.
  if (tabs.length < 2) return null;

  return (
    <>
      <nav
        className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border/60 bg-background px-2"
        role="tablist"
        aria-label="Open tabs"
        data-testid="center-tabs"
      >
        {tabs.map((tab) => {
          const key = centerTabKey(tab);
          const { label, title, Icon, iconColor, spinning, closable } = describeTab(
            tab,
            featuresById,
            currentProject?.name ?? null,
            runningFeatureIds
          );
          const isActive = key === activeKey;

          return (
            <div
              key={key}
              className={cn(
                'group flex max-w-[220px] shrink-0 items-center rounded-md pr-1 text-xs',
                'transition-colors duration-100',
                isActive
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
              onContextMenu={(event) => tabMenu.openAt(event, key)}
              onAuxClick={(event) => handleAuxClick(event, key, closable)}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => activateTab(key)}
                title={title}
                data-testid={`center-tab-${key}`}
                className="flex min-w-0 cursor-pointer items-center gap-1.5 py-1 pl-2.5 pr-1.5"
              >
                <Icon
                  className={cn('size-3.5 shrink-0', spinning && 'animate-spin')}
                  style={iconColor ? { color: iconColor } : undefined}
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">{label}</span>
              </button>

              {closable && (
                <button
                  type="button"
                  onClick={() => closeTab(key)}
                  title={`Close ${label}`}
                  aria-label={`Close ${label}`}
                  data-testid={`center-tab-close-${key}`}
                  className="cursor-pointer rounded p-0.5 opacity-50 hover:bg-muted hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          );
        })}
      </nav>

      <ContextMenu controller={tabMenu}>
        {menuKey && (
          <>
            <DropdownMenuItem
              disabled={menuKey === BOARD_TAB_KEY}
              onSelect={() => closeTab(menuKey)}
              data-testid="center-tab-menu-close"
            >
              Close
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={tabs.length < 2}
              onSelect={() => closeOtherTabs(menuKey)}
              data-testid="center-tab-menu-close-others"
            >
              Close others
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => closeAllTabs()}
              data-testid="center-tab-menu-close-all"
            >
              Close all
            </DropdownMenuItem>
          </>
        )}
      </ContextMenu>
    </>
  );
}
