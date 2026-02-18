import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@/components/ui/route-error-boundary';

const LazyLoginView = lazyRouteComponent(
  () => import('@/components/views/login-view'),
  'LoginView'
);

export const Route = createFileRoute('/login')({
  component: LazyLoginView,
});
