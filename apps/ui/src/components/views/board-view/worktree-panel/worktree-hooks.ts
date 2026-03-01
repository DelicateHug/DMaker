import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '@dmaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import { normalizePath, pathsEqual } from '@/lib/utils';
import { toast } from 'sonner';
import type { DevServerInfo, WorktreeInfo } from './types';

// --- useDefaultEditor ---

const defaultEditorLogger = createLogger('DefaultEditor');

export function useDefaultEditor() {
  const [defaultEditorName, setDefaultEditorName] = useState<string>('Editor');

  const fetchDefaultEditor = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.getDefaultEditor) {
        return;
      }
      const result = await api.worktree.getDefaultEditor();
      if (result.success && result.result?.editorName) {
        setDefaultEditorName(result.result.editorName);
      }
    } catch (error) {
      defaultEditorLogger.error('Failed to fetch default editor:', error);
    }
  }, []);

  useEffect(() => {
    fetchDefaultEditor();
  }, [fetchDefaultEditor]);

  return {
    defaultEditorName,
  };
}

// --- useDevServerLogs ---

const devServerLogsLogger = createLogger('DevServerLogs');

export interface DevServerLogState {
  /** The log content (buffered + live) */
  logs: string;
  /** Whether the server is currently running */
  isRunning: boolean;
  /** Whether initial logs are being fetched */
  isLoading: boolean;
  /** Error message if fetching logs failed */
  error: string | null;
  /** Server port (if running) */
  port: number | null;
  /** Server URL (if running) */
  url: string | null;
  /** Timestamp when the server started */
  startedAt: string | null;
  /** Exit code (if server stopped) */
  exitCode: number | null;
  /** Error message from server (if stopped with error) */
  serverError: string | null;
}

interface UseDevServerLogsOptions {
  /** Path to the worktree to monitor logs for */
  worktreePath: string | null;
  /** Whether to automatically subscribe to log events (default: true) */
  autoSubscribe?: boolean;
}

/**
 * Hook to subscribe to dev server log events and manage log state.
 *
 * This hook:
 * 1. Fetches initial buffered logs from the server
 * 2. Subscribes to WebSocket events for real-time log streaming
 * 3. Handles server started/stopped events
 * 4. Provides log state for rendering in a panel
 */
export function useDevServerLogs({ worktreePath, autoSubscribe = true }: UseDevServerLogsOptions) {
  const [state, setState] = useState<DevServerLogState>({
    logs: '',
    isRunning: false,
    isLoading: false,
    error: null,
    port: null,
    url: null,
    startedAt: null,
    exitCode: null,
    serverError: null,
  });

  const hasFetchedInitialLogs = useRef(false);

  const fetchLogs = useCallback(async () => {
    if (!worktreePath) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const api = getElectronAPI();
      if (!api?.worktree?.getDevServerLogs) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Dev server logs API not available',
        }));
        return;
      }

      const result = await api.worktree.getDevServerLogs(worktreePath);

      if (result.success && result.result) {
        setState((prev) => ({
          ...prev,
          logs: result.result!.logs,
          isRunning: true,
          isLoading: false,
          port: result.result!.port,
          url: result.result!.url,
          startedAt: result.result!.startedAt,
          error: null,
        }));
        hasFetchedInitialLogs.current = true;
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isRunning: false,
          error: result.error || null,
        }));
      }
    } catch (error) {
      devServerLogsLogger.error('Failed to fetch dev server logs:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch logs',
      }));
    }
  }, [worktreePath]);

  const clearLogs = useCallback(() => {
    setState({
      logs: '',
      isRunning: false,
      isLoading: false,
      error: null,
      port: null,
      url: null,
      startedAt: null,
      exitCode: null,
      serverError: null,
    });
    hasFetchedInitialLogs.current = false;
  }, []);

  const appendLogs = useCallback((content: string) => {
    setState((prev) => ({
      ...prev,
      logs: prev.logs + content,
    }));
  }, []);

  useEffect(() => {
    if (worktreePath && autoSubscribe) {
      hasFetchedInitialLogs.current = false;
      fetchLogs();
    } else {
      clearLogs();
    }
  }, [worktreePath, autoSubscribe, fetchLogs, clearLogs]);

  useEffect(() => {
    if (!worktreePath || !autoSubscribe) return;

    const api = getElectronAPI();
    if (!api?.worktree?.onDevServerLogEvent) {
      devServerLogsLogger.warn('Dev server log event API not available');
      return;
    }

    const unsubscribe = api.worktree.onDevServerLogEvent((event) => {
      if (!pathsEqual(event.payload.worktreePath, worktreePath)) return;

      switch (event.type) {
        case 'dev-server:started': {
          const { payload } = event;
          devServerLogsLogger.info('Dev server started:', payload);
          setState((prev) => ({
            ...prev,
            isRunning: true,
            port: payload.port,
            url: payload.url,
            startedAt: payload.timestamp,
            exitCode: null,
            serverError: null,
            logs: '',
          }));
          hasFetchedInitialLogs.current = false;
          break;
        }
        case 'dev-server:output': {
          const { payload } = event;
          if (payload.content) {
            appendLogs(payload.content);
          }
          break;
        }
        case 'dev-server:stopped': {
          const { payload } = event;
          devServerLogsLogger.info('Dev server stopped:', payload);
          setState((prev) => ({
            ...prev,
            isRunning: false,
            exitCode: payload.exitCode,
            serverError: payload.error ?? null,
          }));
          break;
        }
      }
    });

    return unsubscribe;
  }, [worktreePath, autoSubscribe, appendLogs]);

  return {
    ...state,
    fetchLogs,
    clearLogs,
    appendLogs,
  };
}

// --- useDevServers ---

const devServersLogger = createLogger('DevServers');

interface UseDevServersOptions {
  projectPath: string;
}

export function useDevServers({ projectPath }: UseDevServersOptions) {
  const [isStartingDevServer, setIsStartingDevServer] = useState(false);
  const [runningDevServers, setRunningDevServers] = useState<Map<string, DevServerInfo>>(new Map());

  const fetchDevServers = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.listDevServers) {
        return;
      }
      const result = await api.worktree.listDevServers();
      if (result.success && result.result?.servers) {
        const serversMap = new Map<string, DevServerInfo>();
        for (const server of result.result.servers) {
          serversMap.set(server.worktreePath, server);
        }
        setRunningDevServers(serversMap);
      }
    } catch (error) {
      devServersLogger.error('Failed to fetch dev servers:', error);
    }
  }, []);

  useEffect(() => {
    fetchDevServers();
  }, [fetchDevServers]);

  const getWorktreeKey = useCallback(
    (worktree: WorktreeInfo) => {
      const path = worktree.isMain ? projectPath : worktree.path;
      return path ? normalizePath(path) : path;
    },
    [projectPath]
  );

  const handleStartDevServer = useCallback(
    async (worktree: WorktreeInfo) => {
      if (isStartingDevServer) return;
      setIsStartingDevServer(true);

      try {
        const api = getElectronAPI();
        if (!api?.worktree?.startDevServer) {
          toast.error('Start dev server API not available');
          return;
        }

        const targetPath = worktree.isMain ? projectPath : worktree.path;
        const result = await api.worktree.startDevServer(projectPath, targetPath);

        if (result.success && result.result) {
          setRunningDevServers((prev) => {
            const next = new Map(prev);
            next.set(normalizePath(targetPath), {
              worktreePath: result.result!.worktreePath,
              port: result.result!.port,
              url: result.result!.url,
            });
            return next;
          });
          toast.success(`Dev server started on port ${result.result.port}`);
        } else {
          toast.error(result.error || 'Failed to start dev server');
        }
      } catch (error) {
        devServersLogger.error('Start dev server failed:', error);
        toast.error('Failed to start dev server');
      } finally {
        setIsStartingDevServer(false);
      }
    },
    [isStartingDevServer, projectPath]
  );

  const handleStopDevServer = useCallback(
    async (worktree: WorktreeInfo) => {
      try {
        const api = getElectronAPI();
        if (!api?.worktree?.stopDevServer) {
          toast.error('Stop dev server API not available');
          return;
        }

        const targetPath = worktree.isMain ? projectPath : worktree.path;
        const result = await api.worktree.stopDevServer(targetPath);

        if (result.success) {
          setRunningDevServers((prev) => {
            const next = new Map(prev);
            next.delete(normalizePath(targetPath));
            return next;
          });
          toast.success(result.result?.message || 'Dev server stopped');
        } else {
          toast.error(result.error || 'Failed to stop dev server');
        }
      } catch (error) {
        devServersLogger.error('Stop dev server failed:', error);
        toast.error('Failed to stop dev server');
      }
    },
    [projectPath]
  );

  const handleOpenDevServerUrl = useCallback(
    (worktree: WorktreeInfo) => {
      const serverInfo = runningDevServers.get(getWorktreeKey(worktree));
      if (!serverInfo) {
        devServersLogger.warn('No dev server info found for worktree:', getWorktreeKey(worktree));
        toast.error('Dev server not found', {
          description: 'The dev server may have stopped. Try starting it again.',
        });
        return;
      }

      try {
        const devServerUrl = new URL(serverInfo.url);

        if (devServerUrl.protocol !== 'http:' && devServerUrl.protocol !== 'https:') {
          devServersLogger.error('Invalid dev server URL protocol:', devServerUrl.protocol);
          toast.error('Invalid dev server URL', {
            description: 'The server returned an unsupported URL protocol.',
          });
          return;
        }

        devServerUrl.hostname = window.location.hostname;
        window.open(devServerUrl.toString(), '_blank', 'noopener,noreferrer');
      } catch (error) {
        devServersLogger.error('Failed to parse dev server URL:', error);
        toast.error('Failed to open dev server', {
          description: 'The server URL could not be processed. Please try again.',
        });
      }
    },
    [runningDevServers, getWorktreeKey]
  );

  const isDevServerRunning = useCallback(
    (worktree: WorktreeInfo) => {
      return runningDevServers.has(getWorktreeKey(worktree));
    },
    [runningDevServers, getWorktreeKey]
  );

  const getDevServerInfo = useCallback(
    (worktree: WorktreeInfo) => {
      return runningDevServers.get(getWorktreeKey(worktree));
    },
    [runningDevServers, getWorktreeKey]
  );

  return {
    isStartingDevServer,
    runningDevServers,
    getWorktreeKey,
    isDevServerRunning,
    getDevServerInfo,
    handleStartDevServer,
    handleStopDevServer,
    handleOpenDevServerUrl,
  };
}
