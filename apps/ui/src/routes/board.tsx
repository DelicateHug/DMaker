import { createFileRoute } from '@tanstack/react-router';

// The board view is always mounted directly in __root.tsx.
// This route file exists to keep TanStack Router's file-based routing happy.
export const Route = createFileRoute('/board')({
  component: () => null,
});
