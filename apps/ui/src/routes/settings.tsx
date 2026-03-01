import { createFileRoute } from '@tanstack/react-router';
import type { SettingsViewId } from '@/components/views/settings-view/hooks/use-settings-view';

interface SettingsSearchParams {
  view?: SettingsViewId;
}

// This route is handled by the layer system.
// Navigation to this path triggers a redirect to /board with the layer opened (see __root.tsx).
export const Route = createFileRoute('/settings')({
  component: () => null,
  validateSearch: (search: Record<string, unknown>): SettingsSearchParams => {
    return {
      view: search.view as SettingsViewId | undefined,
    };
  },
});
