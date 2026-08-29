import { useEffect, useRef, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { LoadingState } from '@/components/ui/loading-state';
import { Button } from '@/components/ui/button';
import { useAgentOutputStream } from '@/hooks/use-agent-output-stream';
import type { Feature } from '@/store/app-store';

interface SummaryPaneProps {
  feature: Feature;
  projectPath: string;
  isActive?: boolean;
}

/**
 * Run summary with markdown support.
 *
 * Shows a formatted summary of the feature including the agent output
 * rendered as markdown for better readability.
 */
export function SummaryPane({ feature, projectPath, isActive }: SummaryPaneProps) {
  const { output, isLoading, error, refresh } = useAgentOutputStream(projectPath, feature.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [shouldFollow, setShouldFollow] = useState(true);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const handleScroll = () => {
      const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
      setShouldFollow(distanceFromBottom < 80);
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !shouldFollow) return;
    element.scrollTop = element.scrollHeight;
  }, [output, shouldFollow]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with refresh */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-2">
        <h3 className="text-sm font-semibold">Summary</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refresh()}
          disabled={isLoading}
          title="Refresh summary"
        >
          <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Summary content */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto p-4"
        data-testid="summary-pane-content"
      >
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 shrink-0" size={16} />
            <div>
              <p className="font-medium">Failed to load summary</p>
              <p className="text-xs opacity-75">{error.message}</p>
            </div>
          </div>
        )}

        {isLoading && !output && <LoadingState message="Loading summary..." />}

        {output && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            {/* Feature header */}
            <div className="mb-6 not-prose">
              <h1 className="mb-2 text-2xl font-bold">
                {feature.title || feature.description || 'Untitled Feature'}
              </h1>
              {feature.description && (
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              )}
              <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                <span>
                  Status: <strong>{feature.status}</strong>
                </span>
                {feature.createdAt && (
                  <span>
                    Created: <time>{new Date(feature.createdAt).toLocaleDateString()}</time>
                  </span>
                )}
              </div>
            </div>

            {/* Agent output as markdown */}
            <div className="markdown-content">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="mb-4 mt-6 text-xl font-bold">{children}</h1>,
                  h2: ({ children }) => <h2 className="mb-3 mt-5 text-lg font-bold">{children}</h2>,
                  h3: ({ children }) => <h3 className="mb-2 mt-4 font-bold">{children}</h3>,
                  p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                  ul: ({ children }) => (
                    <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>
                  ),
                  li: ({ children }) => <li className="text-sm">{children}</li>,
                  code: ({ children }) => (
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre className="mb-3 overflow-x-auto rounded-md bg-muted p-3">{children}</pre>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic">
                      {children}
                    </blockquote>
                  ),
                  table: ({ children }) => (
                    <table className="mb-3 w-full border-collapse border border-muted">
                      {children}
                    </table>
                  ),
                  th: ({ children }) => (
                    <th className="border border-muted bg-muted px-3 py-2 font-semibold">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-muted px-3 py-2">{children}</td>
                  ),
                }}
              >
                {output}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
