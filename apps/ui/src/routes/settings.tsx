import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@/components/ui/route-error-boundary';
import type { SettingsViewId } from '@/components/views/settings-view/hooks';

interface SettingsSearchParams {
  view?: SettingsViewId;
}

const LazySettingsView = lazyRouteComponent(
  () => import('@/components/views/settings-view'),
  'SettingsView'
);

export const Route = createFileRoute('/settings')({
  component: LazySettingsView,
  validateSearch: (search: Record<string, unknown>): SettingsSearchParams => {
    return {
      view: search.view as SettingsViewId | undefined,
    };
  },
});
