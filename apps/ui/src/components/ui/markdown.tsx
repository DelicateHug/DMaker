import { lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';

/**
 * Lazy-load the heavy MarkdownRenderer (react-markdown + rehype plugins)
 * so they are code-split into a separate chunk and only fetched when
 * the Markdown component is first rendered.
 */
const MarkdownRenderer = lazy(() =>
  import('./markdown-renderer').then((m) => ({ default: m.MarkdownRenderer }))
);

interface MarkdownProps {
  children: string;
  className?: string;
}

/**
 * Markdown loading fallback – renders lightweight placeholder lines
 * that approximate a block of rendered markdown while the heavy
 * MarkdownRenderer chunk is being fetched.
 */
function MarkdownFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse space-y-2', className)}
      role="status"
      aria-label="Loading markdown content"
    >
      {/* Simulated heading */}
      <div className="h-4 w-3/4 rounded bg-muted" />
      {/* Simulated paragraph lines */}
      <div className="h-3 w-full rounded bg-muted" />
      <div className="h-3 w-full rounded bg-muted" />
      <div className="h-3 w-5/6 rounded bg-muted" />
    </div>
  );
}

/**
 * Reusable Markdown component for rendering markdown content.
 *
 * This is a thin wrapper that lazy-loads the heavy `MarkdownRenderer`
 * (which bundles `react-markdown`, `rehype-raw`, and `rehype-sanitize`)
 * behind a `<Suspense>` boundary with a skeleton fallback.
 *
 * All existing call-sites can continue to `import { Markdown }` from this
 * module – no consumer changes are required.
 */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <Suspense fallback={<MarkdownFallback className={className} />}>
      <MarkdownRenderer className={className}>{children}</MarkdownRenderer>
    </Suspense>
  );
}
