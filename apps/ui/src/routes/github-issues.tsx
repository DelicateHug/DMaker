import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@/components/ui/route-error-boundary';

const LazyGitHubIssuesView = lazyRouteComponent(
  () => import('@/components/views/github-issues-view'),
  'GitHubIssuesView'
);

export const Route = createFileRoute('/github-issues')({
  component: LazyGitHubIssuesView,
});
