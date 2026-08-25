import { useEffect, useRef } from 'react';
import { RefreshCw, Terminal as TerminalIcon } from 'lucide-react';
import { LogViewer } from '@/components/ui/log-viewer';
import { LoadingState } from '@/components/ui/loading-state';
import { Button } from '@/components/ui/button';
import { useAgentOutputStream } from '@/hooks/use-agent-output-stream';
import type { Feature } from '@/store/app-store';

interface AgentPaneProps {
  feature: Feature;
  projectPath: string;
}

/**
 * Live agent transcript for the open feature.
 *
 * Streams new auto-mode events in as they arrive and follows the tail unless
 * the user has scrolled up to read back.
 */
export function AgentPane({ feature, projectPath }: AgentPaneProps) {
  const { output, isLoading, error, refresh } = useAgentOutputStream(projectPath, feature.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);

  // Track whether the user is pinned to the bottom; only auto-scroll if so.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const handleScroll = () => {
      const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
      shouldFollowRef.current = distanceFromBottom < 80;
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !shouldFollowRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [output]);

  if (isLoading && !output) {
    return <LoadingState message="Loading agent output..." />;
  }

  if (!output && !isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <TerminalIcon className="size-8 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">No agent output yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {error ?? 'Output appears here once an agent starts working on this feature.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <LogViewer output={output} scrollContainerRef={scrollRef} />
      </div>
    </div>
  );
}
