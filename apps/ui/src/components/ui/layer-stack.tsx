import { lazy, Suspense, useState, useEffect, useRef, type ComponentType } from 'react';
import { useLayerStore, LAYER_TITLES, type LayerId } from '@/store/layer-store';
import { Layer } from './layer';
import { LoadingState } from './loading-state';
import { RouteErrorBoundary } from './route-error-boundary';

/**
 * Lazy import map for layer view components.
 * Reuses the same view components that were previously loaded via routes.
 */
const LAYER_IMPORTS: Record<LayerId, () => Promise<{ default: ComponentType }>> = {
  settings: () =>
    import('@/components/views/settings-view').then((m) => ({ default: m.SettingsView })),
  terminal: () =>
    import('@/components/views/terminal-view').then((m) => ({ default: m.TerminalView })),
  ideation: () =>
    import('@/components/views/ideation-view').then((m) => ({ default: m.IdeationView })),
  spec: () => import('@/components/views/spec-view').then((m) => ({ default: m.SpecView })),
  memory: () => import('@/components/views/memory-view').then((m) => ({ default: m.MemoryView })),
  'github-issues': () =>
    import('@/components/views/github-issues-view').then((m) => ({ default: m.GitHubIssuesView })),
  'github-prs': () =>
    import('@/components/views/github-prs-view').then((m) => ({ default: m.GitHubPRsView })),
  'project-settings': () =>
    import('@/components/views/project-settings-view').then((m) => ({
      default: m.ProjectSettingsView,
    })),
  interview: () =>
    import('@/components/views/interview-view').then((m) => ({ default: m.InterviewView })),
};

// Cache lazy components at module level (created once, reused forever)
const lazyComponents: Partial<Record<LayerId, ComponentType>> = {};
function getLazyComponent(id: LayerId): ComponentType {
  if (!lazyComponents[id]) {
    const importFn = LAYER_IMPORTS[id];
    if (importFn) {
      lazyComponents[id] = lazy(importFn);
    }
  }
  return lazyComponents[id]!;
}

/**
 * LayerStack renders all open layers as stacked overlays.
 *
 * Once a layer's view component is mounted, it stays mounted (hidden via CSS)
 * even when the layer is closed. This preserves component state (same pattern
 * as PersistentViewContainer) so reopening a layer is instant.
 */
export function LayerStack() {
  const layers = useLayerStore((s) => s.layers);

  // Track which layers have ever been opened (for persistent mounting)
  const [mountedLayers, setMountedLayers] = useState<Set<LayerId>>(new Set());
  const prevLayersRef = useRef(layers);

  useEffect(() => {
    if (layers !== prevLayersRef.current) {
      prevLayersRef.current = layers;
      // Add any newly opened layers to the mounted set
      setMountedLayers((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const id of layers) {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [layers]);

  // Nothing to render if no layers have ever been opened
  if (mountedLayers.size === 0) return null;

  return (
    <>
      {Array.from(mountedLayers).map((id) => {
        const isOpen = layers.includes(id);
        const stackIndex = layers.indexOf(id);
        const isTop = stackIndex === layers.length - 1;
        const LazyComponent = getLazyComponent(id);

        return (
          <div key={id} style={{ display: isOpen ? 'contents' : 'none' }}>
            <Layer id={id} title={LAYER_TITLES[id]} isTop={isTop} zIndex={stackIndex}>
              <RouteErrorBoundary>
                <Suspense fallback={<LoadingState message={`Loading ${LAYER_TITLES[id]}...`} />}>
                  <LazyComponent />
                </Suspense>
              </RouteErrorBoundary>
            </Layer>
          </div>
        );
      })}
    </>
  );
}
