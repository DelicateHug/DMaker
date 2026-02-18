import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@/components/ui/route-error-boundary';

const LazySetupView = lazyRouteComponent(
  () => import('@/components/views/setup-view'),
  'SetupView'
);

export const Route = createFileRoute('/setup')({
  component: LazySetupView,
});
