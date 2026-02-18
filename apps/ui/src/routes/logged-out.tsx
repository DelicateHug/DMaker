import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@/components/ui/route-error-boundary';

const LazyLoggedOutView = lazyRouteComponent(
  () => import('@/components/views/logged-out-view'),
  'LoggedOutView'
);

export const Route = createFileRoute('/logged-out')({
  component: LazyLoggedOutView,
});
