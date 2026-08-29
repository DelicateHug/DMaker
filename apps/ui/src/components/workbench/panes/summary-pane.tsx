import { useEffect, useRef, useState, useMemo } from 'react';
import { AlertCircle, RefreshCw, ChevronDown } from 'lucide-react';
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

interface ParsedSummary {
  index: number;
  timestamp: string;
  content: string;
}

function extractSummaries(output: string): ParsedSummary[] {
  if (!output) return [];

  const summaries: ParsedSummary[] = [];

  // Look for summary markers and sections
  const lines = output.split('\n');
  let currentSummary = '';
  let currentTimestamp = '';
  let inSummarySection = false;
  let summaryIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Extract timestamp if present
    if (line.includes('[timestamp:')) {
      const match = line.match(/\[timestamp:([^\]]+)\]/);
      if (match) {
        currentTimestamp = match[1];
      }
    }

    // Detect summary section headers
    if (
      line.includes('Implementation Complete') ||
      (line.includes('✓') && (line.includes('Complete') || line.includes('completed'))) ||
      line.match(/^#+\s+(Summary|SUMMARY|Summary Report)/)
    ) {
      if (currentSummary && currentTimestamp) {
        summaries.push({
          index: summaryIndex++,
          timestamp: currentTimestamp,
          content: currentSummary.trim(),
        });
      }
      inSummarySection = true;
      currentSummary = line + '\n';
      continue;
    }

    // End summary section on empty line or new major section
    if (inSummarySection && line.match(/^\s*$/) && currentSummary.split('\n').length > 3) {
      inSummarySection = false;
    }

    if (inSummarySection) {
      currentSummary += line + '\n';
    }
  }

  // Add final summary if exists
  if (currentSummary && currentTimestamp) {
    summaries.push({
      index: summaryIndex,
      timestamp: currentTimestamp,
      content: currentSummary.trim(),
    });
  }

  // If no summaries found, treat entire output as one summary
  if (summaries.length === 0 && output.trim()) {
    const match = output.match(/\[timestamp:([^\]]+)\]/);
    summaries.push({
      index: 0,
      timestamp: match ? match[1] : new Date().toISOString(),
      content: output.trim(),
    });
  }

  return summaries.reverse();
}

/**
 * Run summary with markdown support.
 *
 * Shows a formatted summary of the feature including the agent output
 * rendered as markdown for better readability. Displays summaries as
 * distinct items with a dropdown selector (newest first).
 */
export function SummaryPane({ feature, projectPath, isActive }: SummaryPaneProps) {
  const { output, isLoading, error, refresh } = useAgentOutputStream(projectPath, feature.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [shouldFollow, setShouldFollow] = useState(true);

  const summaries = useMemo(() => extractSummaries(output), [output]);
  const [selectedSummaryIndex, setSelectedSummaryIndex] = useState(0);

  const selectedSummary = summaries[selectedSummaryIndex];

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
  }, [selectedSummary, shouldFollow]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with selector and refresh */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Summary</h3>
          {summaries.length > 0 && (
            <div className="relative">
              <select
                value={selectedSummaryIndex}
                onChange={(e) => setSelectedSummaryIndex(Number(e.currentTarget.value))}
                className="appearance-none rounded border border-border/60 bg-muted px-2.5 py-1 text-xs pr-7 cursor-pointer hover:border-border"
              >
                {summaries.map((summary, idx) => {
                  const date = new Date(summary.timestamp);
                  const label = `${summary.index + 1} - ${date.toLocaleTimeString()}`;
                  return (
                    <option key={idx} value={idx}>
                      {label}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-3 pointer-events-none text-muted-foreground" />
            </div>
          )}
        </div>
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

        {!selectedSummary && !isLoading && (
          <p className="text-xs text-muted-foreground">No summaries available yet.</p>
        )}

        {selectedSummary && (
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

            {/* Summary as markdown */}
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
                {selectedSummary.content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
