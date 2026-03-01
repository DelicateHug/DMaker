import { createFileRoute } from '@tanstack/react-router';

// This route is handled by the layer system.
// Navigation to this path triggers a redirect to /board with the layer opened (see __root.tsx).
export const Route = createFileRoute('/memory')({
  component: () => null,
});
