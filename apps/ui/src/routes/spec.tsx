import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@/components/ui/route-error-boundary';

const LazySpecView = lazyRouteComponent(() => import('@/components/views/spec-view'), 'SpecView');

export const Route = createFileRoute('/spec')({
  component: LazySpecView,
});
