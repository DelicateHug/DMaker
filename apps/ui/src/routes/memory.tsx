import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@/components/ui/route-error-boundary';

const LazyMemoryView = lazyRouteComponent(
  () => import('@/components/views/memory-view'),
  'MemoryView'
);

export const Route = createFileRoute('/memory')({
  component: LazyMemoryView,
});
