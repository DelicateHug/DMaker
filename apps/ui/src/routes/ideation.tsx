import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@/components/ui/route-error-boundary';

const LazyIdeationView = lazyRouteComponent(
  () => import('@/components/views/ideation-view'),
  'IdeationView'
);

export const Route = createFileRoute('/ideation')({
  component: LazyIdeationView,
});
