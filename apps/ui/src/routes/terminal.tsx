import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@/components/ui/route-error-boundary';

const LazyTerminalView = lazyRouteComponent(
  () => import('@/components/views/terminal-view'),
  'TerminalView'
);

export const Route = createFileRoute('/terminal')({
  component: LazyTerminalView,
});
