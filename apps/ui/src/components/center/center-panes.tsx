import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/app-store';
import { BOARD_TAB_KEY, centerTabKey, useCenterStore } from '@/store/center-store';
import { LoadingState } from '@/components/ui/loading-state';
import { RouteErrorBoundary } from '@/components/ui/route-error-boundary';
import { Workbench } from '@/components/workbench/workbench';

// The board stays mounted for the life of the session, so its controls,
// dialogs and polling survive every tab switch.
const LazyBoardView = lazy(() =>
  import('@/components/views/board-view').then((m) => ({ default: m.BoardView }))
);

const LazyProjectView = lazy(() =>
  import('@/components/views/project-view').then((m) => ({ default: m.ProjectView }))
);

const LazyToolPane = lazy(() =>
  import('@/components/views/tools-view').then((m) => ({ default: m.ToolPane }))
);

/**
 * The centre of the screen: one mounted pane per open tab, with the active
 * one on top.
 *
 * Panes are mounted the first time their tab is shown and stay mounted until
 * the tab closes, so terminal sessions, scroll positions and agent transcripts
 * survive tab switches — only closing a tab tears its pane down.
 */
export function CenterPanes() {
  const { tabs, activeKey, pruneFeatureTabs } = useCenterStore(
    useShallow((state) => ({
      tabs: state.tabs,
      activeKey: state.activeKey,
      pruneFeatureTabs: state.pruneFeatureTabs,
    }))
  );

  const features = useAppStore((state) => state.features);

  // A deleted task should not leave a dead tab behind. Skip while the feature
  // list is empty — that is the initial load, not a deletion.
  useEffect(() => {
    if (features.length === 0) return;
    pruneFeatureTabs(new Set(features.map((feature) => feature.id)));
  }, [features, pruneFeatureTabs]);

  // Keys that have been on screen at least once — everything else is not worth
  // paying for until the user actually goes there.
  const [visited, setVisited] = useState<Set<string>>(() => new Set([BOARD_TAB_KEY, activeKey]));

  useEffect(() => {
    setVisited((previous) => {
      if (previous.has(activeKey)) return previous;
      const next = new Set(previous);
      next.add(activeKey);
      return next;
    });
  }, [activeKey]);

  const mountedTabs = useMemo(
    () =>
      tabs.filter((tab) => {
        const key = centerTabKey(tab);
        return key === BOARD_TAB_KEY || visited.has(key);
      }),
    [tabs, visited]
  );

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {mountedTabs.map((tab) => {
        const key = centerTabKey(tab);
        const isActive = key === activeKey;

        return (
          <PaneHost key={key} isActive={isActive}>
            <RouteErrorBoundary>
              {tab.kind === 'board' && (
                <Suspense fallback={<LoadingState message="Loading board..." />}>
                  <LazyBoardView />
                </Suspense>
              )}

              {tab.kind === 'feature' && (
                <Workbench featureId={tab.featureId} isActive={isActive} />
              )}

              {tab.kind === 'project' && (
                <Suspense fallback={<LoadingState message="Loading project..." />}>
                  <LazyProjectView />
                </Suspense>
              )}

              {tab.kind === 'tool' && (
                <Suspense fallback={<LoadingState message="Loading…" />}>
                  <LazyToolPane layerId={tab.toolId} />
                </Suspense>
              )}
            </RouteErrorBoundary>
          </PaneHost>
        );
      })}
    </div>
  );
}

/** Keeps a pane mounted while hiding it, preserving its internal state. */
function PaneHost({ isActive, children }: { isActive: boolean; children: ReactNode }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden bg-background"
      style={{ visibility: isActive ? 'visible' : 'hidden' }}
      aria-hidden={!isActive}
      inert={!isActive ? true : undefined}
    >
      {children}
    </div>
  );
}
