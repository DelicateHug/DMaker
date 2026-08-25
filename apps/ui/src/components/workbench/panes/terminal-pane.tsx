import { lazy, Suspense } from 'react';
import { LoadingState } from '@/components/ui/loading-state';
import { RouteErrorBoundary } from '@/components/ui/route-error-boundary';

const LazyTerminalView = lazy(() =>
  import('@/components/views/terminal-view').then((module) => ({ default: module.TerminalView }))
);

/**
 * Terminal workspace inside the workbench.
 *
 * This hosts DMaker's existing terminal manager, whose tabs, splits and
 * persisted layout are owned by the app store and scoped to the current
 * project (not to an individual feature's worktree).
 */
export function TerminalPane() {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<LoadingState message="Loading terminal..." />}>
        <LazyTerminalView />
      </Suspense>
    </RouteErrorBoundary>
  );
}
