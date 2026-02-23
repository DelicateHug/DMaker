import { lazy, Suspense, useEffect, useState, useRef, type ComponentType } from 'react';
import { Outlet, useLocation } from '@tanstack/react-router';
import { LoadingState } from './loading-state';
import { RouteErrorBoundary } from './route-error-boundary';

/**
 * Map of persistent routes to their lazy-loaded view components.
 * These views stay mounted (hidden via CSS) once first visited,
 * preserving all component state, hooks, intervals, and DOM.
 */
const PERSISTENT_ROUTE_IMPORTS: Record<string, () => Promise<{ default: ComponentType }>> = {
  '/board': () => import('@/components/views/board-view').then((m) => ({ default: m.BoardView })),
  '/settings': () =>
    import('@/components/views/settings-view').then((m) => ({ default: m.SettingsView })),
  '/github-issues': () =>
    import('@/components/views/github-issues-view').then((m) => ({ default: m.GitHubIssuesView })),
  '/github-prs': () =>
    import('@/components/views/github-prs-view').then((m) => ({ default: m.GitHubPRsView })),
  '/terminal': () =>
    import('@/components/views/terminal-view').then((m) => ({ default: m.TerminalView })),
  '/spec': () => import('@/components/views/spec-view').then((m) => ({ default: m.SpecView })),
  '/memory': () =>
    import('@/components/views/memory-view').then((m) => ({ default: m.MemoryView })),
  '/ideation': () =>
    import('@/components/views/ideation-view').then((m) => ({ default: m.IdeationView })),
  '/project-settings': () =>
    import('@/components/views/project-settings-view').then((m) => ({
      default: m.ProjectSettingsView,
    })),
};

const PERSISTENT_ROUTES = new Set(Object.keys(PERSISTENT_ROUTE_IMPORTS));

// Create lazy components once at module level to avoid re-creating on each render
const lazyComponents: Record<string, ComponentType> = {};
function getLazyComponent(route: string): ComponentType {
  if (!lazyComponents[route]) {
    const importFn = PERSISTENT_ROUTE_IMPORTS[route];
    if (importFn) {
      lazyComponents[route] = lazy(importFn);
    }
  }
  return lazyComponents[route];
}

/**
 * PersistentViewContainer replaces <Outlet /> for the main authenticated layout.
 *
 * Instead of unmounting/remounting view components on every route change
 * (which causes data refetches, loading spinners, and visual flashes),
 * this component keeps visited views mounted and toggles visibility via CSS.
 *
 * - First visit to a persistent route: lazy-loads the component, mounts it
 * - Subsequent visits: instantly shows it (no loading, no data refetch)
 * - Non-persistent routes (login, setup, dashboard): uses normal <Outlet />
 */
export function PersistentViewContainer() {
  const { pathname } = useLocation();
  const [visitedRoutes, setVisitedRoutes] = useState<Set<string>>(() => {
    // If we're starting on a persistent route, include it immediately
    const initial = new Set<string>();
    if (PERSISTENT_ROUTES.has(pathname)) {
      initial.add(pathname);
    }
    return initial;
  });

  // Track visited routes — add new persistent routes as they're navigated to
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = pathname;
      if (PERSISTENT_ROUTES.has(pathname) && !visitedRoutes.has(pathname)) {
        setVisitedRoutes((prev) => new Set(prev).add(pathname));
      }
    }
  }, [pathname, visitedRoutes]);

  const isPersistentRoute = PERSISTENT_ROUTES.has(pathname);

  return (
    <>
      {/* Persistent views — mounted once, hidden via CSS display */}
      {Array.from(visitedRoutes).map((route) => {
        const LazyComponent = getLazyComponent(route);
        const isActive = pathname === route;

        return (
          <div
            key={route}
            className="flex-1 flex flex-col overflow-hidden"
            style={{ display: isActive ? 'flex' : 'none' }}
          >
            <RouteErrorBoundary>
              <Suspense fallback={<LoadingState message="Loading page..." />}>
                <LazyComponent />
              </Suspense>
            </RouteErrorBoundary>
          </div>
        );
      })}
      {/* Non-persistent routes use normal Outlet (unmount/remount) */}
      {!isPersistentRoute && <Outlet />}
    </>
  );
}
