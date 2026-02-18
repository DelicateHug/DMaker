import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@/components/ui/route-error-boundary';

const LazyDashboardView = lazyRouteComponent(
  () => import('@/components/views/dashboard-view'),
  'DashboardView'
);

export const Route = createFileRoute('/dashboard')({
  component: LazyDashboardView,
});
