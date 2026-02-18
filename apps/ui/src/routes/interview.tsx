import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@/components/ui/route-error-boundary';

const LazyInterviewView = lazyRouteComponent(
  () => import('@/components/views/interview-view'),
  'InterviewView'
);

export const Route = createFileRoute('/interview')({
  component: LazyInterviewView,
});
