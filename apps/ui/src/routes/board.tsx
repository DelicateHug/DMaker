import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@/components/ui/route-error-boundary';

const LazyBoardView = lazyRouteComponent(
  () => import('@/components/views/board-view'),
  'BoardView'
);

export const Route = createFileRoute('/board')({
  component: LazyBoardView,
});
