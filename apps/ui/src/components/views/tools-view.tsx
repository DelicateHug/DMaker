import { lazy, Suspense, type ComponentType } from 'react';
import { LoadingState } from '@/components/ui/loading-state';
import { RouteErrorBoundary } from '@/components/ui/route-error-boundary';
import { LAYER_TITLES, type LayerId } from '@/store/layer-store';

/**
 * Lazy import map for tool views.
 * Reuses the same view components that were previously loaded via routes.
 *
 * Partial on purpose: a tool can be listed in the catalogue before its view
 * exists, and an unbuilt tool should render a note rather than crash the app.
 */
const TOOL_IMPORTS: Partial<Record<LayerId, () => Promise<{ default: ComponentType }>>> = {
  settings: () =>
    import('@/components/views/settings-view').then((m) => ({ default: m.SettingsView })),
  terminal: () =>
    import('@/components/views/terminal-view').then((m) => ({ default: m.TerminalView })),
  ideation: () =>
    import('@/components/views/ideation-view').then((m) => ({ default: m.IdeationView })),
  spec: () => import('@/components/views/spec-view').then((m) => ({ default: m.SpecView })),
  memory: () => import('@/components/views/memory-view').then((m) => ({ default: m.MemoryView })),
  'github-prs': () =>
    import('@/components/views/github-prs-view').then((m) => ({ default: m.GitHubPRsView })),
  'project-settings': () =>
    import('@/components/views/project-settings-view').then((m) => ({
      default: m.ProjectSettingsView,
    })),
  interview: () =>
    import('@/components/views/interview-view').then((m) => ({ default: m.InterviewView })),
  research: () =>
    import('@/components/views/research-view').then((m) => ({ default: m.ResearchView })),
};

// Cache lazy components at module level (created once, reused forever)
const lazyComponents: Partial<Record<LayerId, ComponentType>> = {};
function getLazyComponent(id: LayerId): ComponentType | null {
  const importer = TOOL_IMPORTS[id];
  if (!importer) return null;
  if (!lazyComponents[id]) {
    lazyComponents[id] = lazy(importer);
  }
  return lazyComponents[id]!;
}

interface ToolPaneProps {
  layerId: LayerId;
}

/**
 * One tool — the terminal, spec editor, ideation, memory, a GitHub view or the
 * settings screens — rendered as a centre pane.
 *
 * Tools used to stack behind a strip of their own that covered whatever else
 * the centre was showing. Each open tool is now an ordinary centre tab, so the
 * tab strip above is the only chrome this needs.
 */
export function ToolPane({ layerId }: ToolPaneProps) {
  const LazyComponent = getLazyComponent(layerId);

  if (!LazyComponent) {
    return (
      <div
        className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground"
        data-testid={`tool-pane-${layerId}`}
      >
        {LAYER_TITLES[layerId]} is not available yet.
      </div>
    );
  }

  return (
    <div className="h-full min-h-0" data-testid={`tool-pane-${layerId}`}>
      <RouteErrorBoundary>
        <Suspense fallback={<LoadingState message={`Loading ${LAYER_TITLES[layerId]}...`} />}>
          <LazyComponent />
        </Suspense>
      </RouteErrorBoundary>
    </div>
  );
}
