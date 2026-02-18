import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@/components/ui/route-error-boundary';

const LazyWelcomeView = lazyRouteComponent(
  () => import('@/components/views/welcome-view'),
  'WelcomeView'
);

export const Route = createFileRoute('/')({
  component: LazyWelcomeView,
});
