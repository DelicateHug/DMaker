import { useCallback, useEffect, useMemo, useState } from 'react';
import { Globe, Play, RefreshCw, ExternalLink, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getElectronAPI } from '@/lib/electron';
import { createLogger } from '@dmaker/utils/logger';
import { cn } from '@/lib/utils';

const logger = createLogger('BrowserPane');

/** How often to re-check whether a dev server appeared for this worktree. */
const POLL_INTERVAL_MS = 5000;

interface DevServerEntry {
  worktreePath: string;
  port: number;
  url: string;
}

interface BrowserPaneProps {
  projectPath: string;
  /** Worktree the feature is running in; the dev server is keyed on this */
  worktreePath: string;
}

/** Compare paths tolerantly — the server may normalise separators differently. */
function pathsMatch(left: string, right: string): boolean {
  const normalize = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return normalize(left) === normalize(right);
}

/**
 * In-app preview of the feature's dev server.
 *
 * Detects a server already running for this worktree, offers to start one if
 * not, and renders it in an iframe with a small reload/pop-out toolbar.
 */
export function BrowserPane({ projectPath, worktreePath }: BrowserPaneProps) {
  const [servers, setServers] = useState<DevServerEntry[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const refreshServers = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.listDevServers) return;
      const result = await api.worktree.listDevServers();
      if (result.success && result.result?.servers) {
        setServers(result.result.servers);
      }
    } catch (error) {
      logger.warn('Failed to list dev servers', error);
    }
  }, []);

  useEffect(() => {
    void refreshServers();
    const interval = setInterval(refreshServers, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshServers]);

  const activeServer = useMemo(
    () => servers.find((server) => pathsMatch(server.worktreePath, worktreePath)) ?? null,
    [servers, worktreePath]
  );

  const handleStart = useCallback(async () => {
    if (isStarting) return;
    setIsStarting(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.startDevServer) {
        toast.error('Dev server API is unavailable');
        return;
      }
      const result = await api.worktree.startDevServer(projectPath, worktreePath);
      if (result.success && result.result) {
        setServers((previous) => [
          ...previous.filter((server) => !pathsMatch(server.worktreePath, worktreePath)),
          {
            worktreePath: result.result!.worktreePath,
            port: result.result!.port,
            url: result.result!.url,
          },
        ]);
      } else {
        toast.error(result.error || 'Failed to start dev server');
      }
    } catch (error) {
      logger.error('Failed to start dev server', error);
      toast.error('Failed to start dev server');
    } finally {
      setIsStarting(false);
    }
  }, [isStarting, projectPath, worktreePath]);

  const handleStop = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.stopDevServer) return;
      await api.worktree.stopDevServer(worktreePath);
      setServers((previous) =>
        previous.filter((server) => !pathsMatch(server.worktreePath, worktreePath))
      );
    } catch (error) {
      logger.error('Failed to stop dev server', error);
      toast.error('Failed to stop dev server');
    }
  }, [worktreePath]);

  if (!activeServer) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Globe className="size-8 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">No dev server running</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Start one to preview this feature&apos;s worktree in the app.
          </p>
        </div>
        <Button size="sm" onClick={handleStart} disabled={isStarting} className="gap-1.5">
          <Play className={cn('size-3.5', isStarting && 'animate-pulse')} />
          {isStarting ? 'Starting…' : 'Start dev server'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Address bar */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/60 px-2">
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0"
          onClick={() => setReloadKey((key) => key + 1)}
          title="Reload"
        >
          <RefreshCw className="size-3.5" />
        </Button>
        <span className="min-w-0 flex-1 truncate rounded bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground">
          {activeServer.url}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0"
          onClick={() => window.open(activeServer.url, '_blank', 'noopener,noreferrer')}
          title="Open in external browser"
        >
          <ExternalLink className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0"
          onClick={handleStop}
          title="Stop dev server"
        >
          <Square className="size-3.5" />
        </Button>
      </div>

      <iframe
        key={reloadKey}
        src={activeServer.url}
        title={`Dev server preview on port ${activeServer.port}`}
        className="min-h-0 flex-1 border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      />
    </div>
  );
}
