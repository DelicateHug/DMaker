import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@/components/ui/route-error-boundary';

const LazyGitHubPRsView = lazyRouteComponent(
  () => import('@/components/views/github-prs-view'),
  'GitHubPRsView'
);

export const Route = createFileRoute('/github-prs')({
  component: LazyGitHubPRsView,
});
