import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@/components/ui/route-error-boundary';

const LazyProjectSettingsView = lazyRouteComponent(
  () => import('@/components/views/project-settings-view'),
  'ProjectSettingsView'
);

export const Route = createFileRoute('/project-settings')({
  component: LazyProjectSettingsView,
});
