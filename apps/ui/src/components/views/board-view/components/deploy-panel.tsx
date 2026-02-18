import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import {
  Rocket,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Play,
  Square,
  Terminal,
  Clock,
  Eye,
  FolderOpen,
  FolderClosed,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { cn, generateUUID } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { apiDelete, apiFetch, apiGet, getAuthenticatedImageUrl } from '@/lib/api-fetch';
import { getHttpApiClient } from '@/lib/http-api-client';
import { createLogger } from '@automaker/utils/logger';
import type { Project } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { getProjectIcon } from '@/lib/icon-registry';
import { LazyImage } from '@/components/ui/lazy-image';
import { DeployLogOutput } from './deploy-log-output';
import { CompletedRunsModal } from '../dialogs';

const logger = createLogger('DeployPanel');

// ============================================================================
// Types
// ============================================================================

export interface DeployPanelProps {
  /** Additional CSS classes for the container */
  className?: string;
  /** Project for deployment */
  project?: Project | null;
  /** Project path (deprecated, use project prop instead) */
  projectPath?: string;
  /** Whether the panel is collapsed */
  isCollapsed?: boolean;
  /** Callback when collapse state changes */
  onCollapseChange?: (collapsed: boolean) => void;
  /** Compact mode for smaller display */
  compact?: boolean;
  /** Callback when user selects a different project from within the panel */
  onProjectChange?: (project: Project) => void;
  /** Whether to show the project selector in the header */
  showProjectSelector?: boolean;
}

/** A deploy script from the .automaker/deploy folder (matches server type) */
interface FolderScript {
  name: string;
  path: string;
  type: string;
  extension: string;
  size: number;
  modifiedAt: string;
  /** Relative folder path within the deploy directory (empty string for root-level scripts) */
  folder: string;
}

/** Scripts grouped by folder for nested display */
interface ScriptGroup {
  folder: string;
  scripts: FolderScript[];
}

/** API response from GET /api/deploy/folder-scripts */
interface FolderScriptsResponse {
  success: boolean;
  scripts: FolderScript[];
  folderPath: string;
  folderExists: boolean;
}

/** API response from GET /api/deploy/runs */
interface RunsHistoryResponse {
  success: boolean;
  history: HistoryEntry[];
  total: number;
}

/** A completed run from the server history */
interface HistoryEntry {
  success: boolean;
  script: FolderScript;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
  duration: number;
  startedAt: string;
}

/** Local run tracking (running or finished) */
interface RunEntry {
  id: string;
  scriptName: string;
  status: 'running' | 'success' | 'error';
  output: string;
  message: string;
  duration?: number;
  exitCode?: number | null;
  startedAt: Date;
}

/** A completed run entry preserved in local state after a run finishes */
interface CompletedRunEntry {
  id: string;
  scriptName: string;
  status: 'success' | 'error';
  output: string;
  message: string;
  duration?: number;
  exitCode?: number | null;
  startedAt: Date;
  completedAt: Date;
}

// ============================================================================
// Memo comparison
// ============================================================================

function arePropsEqual(prevProps: DeployPanelProps, nextProps: DeployPanelProps): boolean {
  if (prevProps.className !== nextProps.className) return false;
  if (prevProps.isCollapsed !== nextProps.isCollapsed) return false;
  if (prevProps.compact !== nextProps.compact) return false;
  if (prevProps.projectPath !== nextProps.projectPath) return false;
  if (prevProps.showProjectSelector !== nextProps.showProjectSelector) return false;

  const prevProjectId = prevProps.project?.id;
  const nextProjectId = nextProps.project?.id;
  if (prevProjectId !== nextProjectId) return false;

  if (prevProps.onCollapseChange !== nextProps.onCollapseChange) return false;
  if (prevProps.onProjectChange !== nextProps.onProjectChange) return false;

  return true;
}

// ============================================================================
// Helpers
// ============================================================================

/** Get the display name for a script (just the filename, without folder prefix) */
function getScriptDisplayName(script: FolderScript): string {
  const name = script.name;
  const lastSlash = name.lastIndexOf('/');
  return lastSlash >= 0 ? name.substring(lastSlash + 1) : name;
}

/** Friendly display for script type based on extension */
function getScriptTypeLabel(ext: string): string {
  switch (ext) {
    case '.py':
      return 'Python';
    case '.ps1':
      return 'PowerShell';
    case '.js':
      return 'JavaScript';
    case '.ts':
      return 'TypeScript';
    case '.sh':
      return 'Shell';
    case '.bat':
    case '.cmd':
      return 'Batch';
    default:
      return 'Script';
  }
}

/** Format a duration in ms to a human-readable string */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Format a timestamp to time string */
function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString();
}

// ============================================================================
// Component
// ============================================================================

/**
 * DeployPanel - An embedded panel for managing and triggering deployments
 *
 * Features:
 * - Project selector dropdown (matching AgentChatPanel pattern)
 * - Lists scripts from the project's .automaker/deploy folder
 * - Shows run history (running/complete) with status indicators
 * - Allows viewing live output for running deploys and final output for past runs
 * - WebSocket streaming for real-time output
 * - Collapsible layout with vertical bar in collapsed state
 *
 * @example
 * ```tsx
 * <DeployPanel
 *   project={currentProject}
 *   isCollapsed={isDeployPanelCollapsed}
 *   onCollapseChange={setDeployPanelCollapsed}
 *   onProjectChange={handleProjectChange}
 *   showProjectSelector
 * />
 * ```
 */
export const DeployPanel = memo(function DeployPanel({
  className,
  project,
  projectPath: deprecatedProjectPath,
  isCollapsed = false,
  onCollapseChange,
  compact = false,
  onProjectChange,
  showProjectSelector = false,
}: DeployPanelProps) {
  // ---------------------------------------------------------------------------
  // Project resolution (matching AgentChatPanel pattern)
  // ---------------------------------------------------------------------------

  const projects = useAppStore((state) => state.projects);
  const storeCurrentProject = useAppStore((state) =>
    project === undefined ? state.currentProject : null
  );
  const effectiveProject = project ?? storeCurrentProject;
  const projectPath = effectiveProject?.path ?? deprecatedProjectPath ?? '';

  // ---------------------------------------------------------------------------
  // Local state
  // ---------------------------------------------------------------------------

  const [scripts, setScripts] = useState<FolderScript[]>([]);
  const [folderPath, setFolderPath] = useState<string>('');
  const [folderExists, setFolderExists] = useState(false);
  const [isLoadingScripts, setIsLoadingScripts] = useState(false);

  // Track which folders are collapsed in the script list
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  // Run tracking: local runs (including currently running) shown at the top
  const [runs, setRuns] = useState<RunEntry[]>([]);
  // Completed runs (finished runs preserved locally with full output)
  const [completedRuns, setCompletedRuns] = useState<CompletedRunEntry[]>([]);
  // Server history (past completed runs)
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Which run/history/completed entry is currently being viewed (for output display)
  const [viewingRunId, setViewingRunId] = useState<string | null>(null);
  const [viewingCompletedRunId, setViewingCompletedRunId] = useState<string | null>(null);
  const [viewingHistoryIdx, setViewingHistoryIdx] = useState<number | null>(null);

  // Completed Runs Modal visibility
  const [showCompletedRunsModal, setShowCompletedRunsModal] = useState(false);

  // Active run refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const isDeploying = runs.some((r) => r.status === 'running');

  // Group scripts by folder for nested display
  const scriptGroups = useMemo((): ScriptGroup[] => {
    const groupMap = new Map<string, FolderScript[]>();
    for (const script of scripts) {
      const folder = script.folder || '';
      const existing = groupMap.get(folder);
      if (existing) {
        existing.push(script);
      } else {
        groupMap.set(folder, [script]);
      }
    }
    // Sort groups: root ('') first, then alphabetically
    const groups: ScriptGroup[] = [];
    const rootScripts = groupMap.get('');
    if (rootScripts) {
      groups.push({ folder: '', scripts: rootScripts });
      groupMap.delete('');
    }
    const sortedFolders = [...groupMap.keys()].sort();
    for (const folder of sortedFolders) {
      groups.push({ folder, scripts: groupMap.get(folder)! });
    }
    return groups;
  }, [scripts]);

  const toggleFolder = useCallback((folder: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  }, []);

  // The viewed run (local active, completed, or history)
  const viewedRun = useMemo(() => {
    if (viewingRunId) {
      return runs.find((r) => r.id === viewingRunId) ?? null;
    }
    return null;
  }, [viewingRunId, runs]);

  const viewedCompletedRun = useMemo(() => {
    if (viewingCompletedRunId) {
      return completedRuns.find((r) => r.id === viewingCompletedRunId) ?? null;
    }
    return null;
  }, [viewingCompletedRunId, completedRuns]);

  const viewedHistory = useMemo(() => {
    if (viewingHistoryIdx !== null && history[viewingHistoryIdx]) {
      return history[viewingHistoryIdx];
    }
    return null;
  }, [viewingHistoryIdx, history]);

  // ---------------------------------------------------------------------------
  // Fetch scripts from .automaker/deploy folder
  // ---------------------------------------------------------------------------

  const fetchScripts = useCallback(async () => {
    if (!effectiveProject) {
      setScripts([]);
      setFolderExists(false);
      return;
    }

    setIsLoadingScripts(true);
    try {
      const data = await apiGet<FolderScriptsResponse>(
        `/api/deploy/folder-scripts?projectPath=${encodeURIComponent(effectiveProject.path)}`
      );
      if (data.success) {
        setScripts(data.scripts);
        setFolderPath(data.folderPath);
        setFolderExists(data.folderExists);
      } else {
        setScripts([]);
      }
    } catch (error) {
      logger.error('Failed to fetch deploy scripts:', error);
      setScripts([]);
    } finally {
      setIsLoadingScripts(false);
    }
  }, [effectiveProject]);

  // ---------------------------------------------------------------------------
  // Fetch run history from server
  // ---------------------------------------------------------------------------

  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const data = await apiGet<RunsHistoryResponse>('/api/deploy/runs?limit=20');
      if (data.success) {
        setHistory(data.history);
      }
    } catch (error) {
      logger.error('Failed to fetch deploy history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Fetch scripts + history when project changes or panel is expanded
  useEffect(() => {
    if (effectiveProject && !isCollapsed) {
      fetchScripts();
      fetchHistory();
    }
  }, [effectiveProject?.id, isCollapsed, fetchScripts, fetchHistory]);

  // ---------------------------------------------------------------------------
  // WebSocket deploy events (primary real-time channel)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const client = getHttpApiClient();

    // Guard: deploy namespace may not exist on all client implementations
    if (!client.deploy) return;

    const unsubOutput = client.deploy.onDeployOutput((payload) => {
      const runId = activeRunIdRef.current;
      if (!runId) return;

      setRuns((prev) =>
        prev.map((r) => (r.id === runId ? { ...r, output: r.output + payload.data } : r))
      );
    });

    const unsubSuccess = client.deploy.onDeploySuccess((payload) => {
      const runId = activeRunIdRef.current;
      if (!runId) return;

      setRuns((prev) => {
        const finishedRun = prev.find((r) => r.id === runId);
        if (finishedRun) {
          // Move to completedRuns
          const completedEntry: CompletedRunEntry = {
            id: finishedRun.id,
            scriptName: finishedRun.scriptName,
            status: 'success',
            output: finishedRun.output,
            message: payload.message || 'Deploy completed',
            duration: payload.duration,
            exitCode: 0,
            startedAt: finishedRun.startedAt,
            completedAt: new Date(),
          };
          setCompletedRuns((prevCompleted) => [completedEntry, ...prevCompleted]);
        }
        return prev.filter((r) => r.id !== runId);
      });
      // If viewing this active run, switch to viewing it in completed runs
      setViewingRunId((prev) => {
        if (prev === runId) {
          setViewingCompletedRunId(runId);
          return null;
        }
        return prev;
      });
      activeRunIdRef.current = null;
      toast.success('Deploy completed', { description: payload.message });
      // Refresh history after completion
      fetchHistory();
    });

    const unsubError = client.deploy.onDeployError((payload) => {
      const runId = activeRunIdRef.current;
      if (!runId) return;

      setRuns((prev) => {
        const finishedRun = prev.find((r) => r.id === runId);
        if (finishedRun) {
          // Move to completedRuns with error status
          const completedEntry: CompletedRunEntry = {
            id: finishedRun.id,
            scriptName: finishedRun.scriptName,
            status: 'error',
            output: finishedRun.output + (payload.error ? `\n${payload.error}` : ''),
            message: payload.message || 'Deploy failed',
            duration: payload.duration,
            exitCode: payload.exitCode ?? null,
            startedAt: finishedRun.startedAt,
            completedAt: new Date(),
          };
          setCompletedRuns((prevCompleted) => [completedEntry, ...prevCompleted]);
        }
        return prev.filter((r) => r.id !== runId);
      });
      // If viewing this active run, switch to viewing it in completed runs
      setViewingRunId((prev) => {
        if (prev === runId) {
          setViewingCompletedRunId(runId);
          return null;
        }
        return prev;
      });
      activeRunIdRef.current = null;
      toast.error('Deploy failed', {
        description: payload.error
          ? payload.error.slice(0, 120) + (payload.error.length > 120 ? '...' : '')
          : payload.message,
      });
      fetchHistory();
    });

    return () => {
      unsubOutput();
      unsubSuccess();
      unsubError();
    };
  }, [fetchHistory]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRunIdRef.current = null;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Run a deploy script (triggers server execution, output via WebSocket)
  // ---------------------------------------------------------------------------

  const handleRunScript = useCallback(
    async (script: FolderScript) => {
      if (!effectiveProject) {
        toast.error('No project selected');
        return;
      }

      // Abort any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const runId = generateUUID();
      activeRunIdRef.current = runId;

      // Create local run entry
      const newRun: RunEntry = {
        id: runId,
        scriptName: script.name,
        status: 'running',
        output: '',
        message: `Running "${script.name}"...`,
        startedAt: new Date(),
      };

      setRuns((prev) => [newRun, ...prev]);
      // Auto-view the new run
      setViewingRunId(runId);
      setViewingHistoryIdx(null);

      try {
        // Fire the request to start the script. Real-time output arrives
        // via WebSocket events (deploy:output, deploy:success, deploy:error)
        // which are handled in the useEffect above. We still consume the
        // SSE response body to avoid connection-level errors but do not
        // rely on it for live UI updates since Electron's fetch may buffer
        // the SSE stream.
        const response = await apiFetch('/api/deploy/run', 'POST', {
          body: {
            projectPath: effectiveProject.path,
            scriptName: script.name,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        // Drain the SSE response body in the background to avoid connection
        // issues. The WebSocket handles all real-time UI updates.
        const reader = response.body?.getReader();
        if (reader) {
          try {
            while (true) {
              const { done } = await reader.read();
              if (done) break;
            }
          } catch {
            // Stream may be aborted by user cancel - that's fine
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          // If the run is still active, the abort was just the SSE stream
          // closing (e.g. timeout). WebSocket will handle the rest.
          if (activeRunIdRef.current === runId) {
            return;
          }
          // User-initiated cancel — move to completed runs
          setRuns((prev) => {
            const cancelledRun = prev.find((r) => r.id === runId);
            if (cancelledRun) {
              const completedEntry: CompletedRunEntry = {
                id: cancelledRun.id,
                scriptName: cancelledRun.scriptName,
                status: 'error',
                output: cancelledRun.output,
                message: 'Deploy cancelled',
                duration: undefined,
                exitCode: null,
                startedAt: cancelledRun.startedAt,
                completedAt: new Date(),
              };
              setCompletedRuns((prevCompleted) => [completedEntry, ...prevCompleted]);
            }
            return prev.filter((r) => r.id !== runId);
          });
          setViewingRunId((prev) => {
            if (prev === runId) {
              setViewingCompletedRunId(runId);
              return null;
            }
            return prev;
          });
          activeRunIdRef.current = null;
          return;
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setRuns((prev) => {
          const failedRun = prev.find((r) => r.id === runId);
          if (failedRun) {
            const completedEntry: CompletedRunEntry = {
              id: failedRun.id,
              scriptName: failedRun.scriptName,
              status: 'error',
              output: failedRun.output,
              message: errorMessage,
              duration: undefined,
              exitCode: null,
              startedAt: failedRun.startedAt,
              completedAt: new Date(),
            };
            setCompletedRuns((prevCompleted) => [completedEntry, ...prevCompleted]);
          }
          return prev.filter((r) => r.id !== runId);
        });
        setViewingRunId((prev) => {
          if (prev === runId) {
            setViewingCompletedRunId(runId);
            return null;
          }
          return prev;
        });
        activeRunIdRef.current = null;
        toast.error('Deploy failed', { description: errorMessage });
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [effectiveProject]
  );

  // Cancel a running deploy
  const handleCancelDeploy = useCallback(() => {
    activeRunIdRef.current = null;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Clear All: remove finished (non-running) runs, clear completed runs,
  // clear local history, and call the server clear endpoint
  const handleClearAll = useCallback(async () => {
    // Keep only currently-running entries in runs
    setRuns((prev) => prev.filter((r) => r.status === 'running'));
    // Clear all completed runs and history locally
    setCompletedRuns([]);
    setHistory([]);
    setViewingRunId(null);
    setViewingCompletedRunId(null);
    setViewingHistoryIdx(null);

    // Call the server clear endpoint
    try {
      await apiDelete('/api/deploy/runs');
    } catch (error) {
      logger.error('Failed to clear server run history:', error);
    }
  }, []);

  // Delete an individual completed run by id
  const handleDeleteCompletedRun = useCallback((id: string) => {
    setCompletedRuns((prev) => prev.filter((r) => r.id !== id));
    // If the deleted run was being viewed, clear the viewer
    setViewingCompletedRunId((prev) => (prev === id ? null : prev));
  }, []);

  // Clear all completed runs (used by the CompletedRunsModal)
  const handleClearAllCompletedRuns = useCallback(() => {
    setCompletedRuns([]);
    setViewingCompletedRunId(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Output viewing helpers
  // ---------------------------------------------------------------------------

  const handleViewRun = useCallback((runId: string) => {
    setViewingRunId(runId);
    setViewingCompletedRunId(null);
    setViewingHistoryIdx(null);
  }, []);

  const handleViewCompletedRun = useCallback((runId: string) => {
    setViewingCompletedRunId(runId);
    setViewingRunId(null);
    setViewingHistoryIdx(null);
  }, []);

  const handleViewHistory = useCallback((idx: number) => {
    setViewingHistoryIdx(idx);
    setViewingRunId(null);
    setViewingCompletedRunId(null);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setViewingRunId(null);
    setViewingCompletedRunId(null);
    setViewingHistoryIdx(null);
  }, []);

  // Build the output string for the viewer
  const viewedOutput = useMemo(() => {
    if (viewedRun) return viewedRun.output;
    if (viewedCompletedRun) return viewedCompletedRun.output;
    if (viewedHistory) {
      let out = viewedHistory.stdout || '';
      if (viewedHistory.stderr) {
        out += (out ? '\n' : '') + viewedHistory.stderr;
      }
      if (viewedHistory.error && !out.includes(viewedHistory.error)) {
        out += (out ? '\n' : '') + viewedHistory.error;
      }
      return out;
    }
    return '';
  }, [viewedRun, viewedCompletedRun, viewedHistory]);

  const isViewedStreaming = viewedRun?.status === 'running';

  // ============================================================================
  // Collapsed State
  // ============================================================================

  if (isCollapsed) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center bg-card border-l border-border',
          'w-10 h-full',
          className
        )}
        data-testid="deploy-panel-collapsed"
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onCollapseChange?.(false)}
          title="Expand Deploy Panel"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Rocket className="h-5 w-5" />
            <span
              className="text-xs font-medium"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              Deploy
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Expanded State
  // ============================================================================

  return (
    <div
      className={cn('flex h-full overflow-hidden bg-background', className)}
      data-testid="deploy-panel"
    >
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* ================================================================ */}
        {/* Header - consistent height with other panels                     */}
        {/* ================================================================ */}
        <div className="flex items-center h-10 border-b border-border bg-muted/30">
          {/* Panel title with icon - consistent with AgentChatPanel */}
          <div className="flex items-center gap-2 px-3">
            <div className="p-1 rounded bg-brand-500/10">
              <Rocket className="h-3.5 w-3.5 text-brand-500" />
            </div>
            <span className="text-sm font-medium">Deploy</span>
            {isDeploying && (
              <span className="flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500" />
              </span>
            )}
          </div>

          {/* Project Selector - matching AgentChatPanel pattern */}
          {showProjectSelector && projects.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 px-2 gap-1.5 rounded-md',
                    'text-xs font-medium',
                    'hover:bg-muted/70',
                    'transition-all duration-200',
                    'max-w-[160px]'
                  )}
                >
                  {effectiveProject?.customIconPath ? (
                    <LazyImage
                      src={getAuthenticatedImageUrl(
                        effectiveProject.customIconPath,
                        effectiveProject.path
                      )}
                      alt={effectiveProject.name}
                      className="w-4 h-4 rounded object-cover ring-1 ring-border/50 shrink-0"
                      containerClassName="w-4 h-4 shrink-0"
                      errorIconSize="w-2 h-2"
                    />
                  ) : (
                    (() => {
                      const ProjectIcon = getProjectIcon(effectiveProject?.icon);
                      return <ProjectIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
                    })()
                  )}
                  <span className="truncate">{effectiveProject?.name || 'Select Project'}</span>
                  <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-[200px] max-h-[300px] overflow-y-auto"
              >
                {projects.map((proj) => {
                  const ProjectIcon = getProjectIcon(proj.icon);
                  const isSelected = effectiveProject?.id === proj.id;

                  return (
                    <DropdownMenuItem
                      key={proj.id}
                      onClick={() => onProjectChange?.(proj)}
                      className={cn('cursor-pointer', isSelected && 'bg-primary/10 text-primary')}
                    >
                      <div className="flex items-center gap-2 w-full min-w-0">
                        {proj.customIconPath ? (
                          <LazyImage
                            src={getAuthenticatedImageUrl(proj.customIconPath, proj.path)}
                            alt={proj.name}
                            className="w-5 h-5 rounded object-cover ring-1 ring-border/50 shrink-0"
                            containerClassName="w-5 h-5 shrink-0"
                            errorIconSize="w-2.5 h-2.5"
                          />
                        ) : (
                          <div
                            className={cn(
                              'w-5 h-5 rounded flex items-center justify-center shrink-0',
                              isSelected ? 'bg-primary/20' : 'bg-muted'
                            )}
                          >
                            <ProjectIcon
                              className={cn(
                                'w-3 h-3',
                                isSelected ? 'text-primary' : 'text-muted-foreground'
                              )}
                            />
                          </div>
                        )}
                        <span className="flex-1 truncate text-sm">{proj.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Spacer */}
          <div className="flex-1 min-w-0" />

          {/* Refresh button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 mr-1"
            onClick={() => {
              fetchScripts();
              fetchHistory();
            }}
            disabled={isLoadingScripts}
            title="Refresh scripts and history"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoadingScripts && 'animate-spin')} />
          </Button>

          {/* Panel collapse button */}
          <div className="flex items-center px-2 border-l border-border h-full">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onCollapseChange?.(true)}
              title="Collapse Deploy Panel"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* ================================================================ */}
        {/* Script List                                                      */}
        {/* ================================================================ */}
        <div className="border-b border-border">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
              Deploy Scripts
            </span>
            {scripts.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-brand-500/10 text-brand-500">
                {scripts.length}
              </span>
            )}
          </div>

          {/* Loading */}
          {isLoadingScripts && (
            <div className="px-3 py-4 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading scripts...</span>
            </div>
          )}

          {/* No project selected */}
          {!isLoadingScripts && !effectiveProject && (
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <div className="p-3 rounded-full bg-muted/50 mb-3">
                <Rocket className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground mb-1">No Project Selected</p>
              <p className="text-xs text-muted-foreground/70 max-w-[200px]">
                Select a project to view and run deploy scripts.
              </p>
            </div>
          )}

          {/* No scripts found */}
          {!isLoadingScripts && effectiveProject && scripts.length === 0 && (
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <div className="p-3 rounded-full bg-muted/50 mb-3">
                <FolderOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground mb-1">No Deploy Scripts</p>
              <p className="text-xs text-muted-foreground/70 max-w-[220px]">
                {folderExists
                  ? 'No supported scripts found in the deploy folder.'
                  : 'Create a deploy folder to get started.'}
              </p>
              <p className="text-[10px] text-muted-foreground/50 mt-2 font-mono">
                {folderPath || '.automaker/deploy/'}
              </p>
            </div>
          )}

          {/* Script list (grouped by folder) */}
          {!isLoadingScripts && scripts.length > 0 && (
            <ScrollArea className="w-full" style={{ maxHeight: '280px' }}>
              <div className="py-1">
                {scriptGroups.map((group) => {
                  const isFolder = group.folder !== '';
                  const isFolderCollapsed = isFolder && collapsedFolders.has(group.folder);

                  return (
                    <div key={group.folder || '__root__'}>
                      {/* Folder header (only for non-root groups) */}
                      {isFolder && (
                        <button
                          className={cn(
                            'w-full px-3 py-1.5 text-left hover:bg-accent/30 transition-colors',
                            'flex items-center gap-2'
                          )}
                          onClick={() => toggleFolder(group.folder)}
                          data-testid={`deploy-panel-folder-${group.folder}`}
                        >
                          {isFolderCollapsed ? (
                            <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          )}
                          {isFolderCollapsed ? (
                            <FolderClosed className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                          ) : (
                            <FolderOpen className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                          )}
                          <span className="text-xs font-medium text-muted-foreground truncate">
                            {group.folder}
                          </span>
                          <span className="text-[10px] text-muted-foreground/50 ml-auto flex-shrink-0">
                            {group.scripts.length}
                          </span>
                        </button>
                      )}

                      {/* Scripts in this group */}
                      {!isFolderCollapsed &&
                        group.scripts.map((script) => {
                          const isRunningThis = runs.some(
                            (r) => r.scriptName === script.name && r.status === 'running'
                          );
                          const displayName = getScriptDisplayName(script);
                          return (
                            <div
                              key={script.name}
                              className={cn(
                                'group w-full py-2 text-left hover:bg-accent/50 transition-colors',
                                'flex items-center gap-3',
                                isFolder ? 'px-3 pl-8' : 'px-3'
                              )}
                              data-testid={`deploy-panel-script-${script.name}`}
                            >
                              <div
                                className={cn(
                                  'w-6 h-6 rounded flex items-center justify-center flex-shrink-0',
                                  'bg-blue-500/20'
                                )}
                              >
                                {isRunningThis ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                                ) : (
                                  <Terminal className="w-3.5 h-3.5 text-blue-500" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{displayName}</p>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {getScriptTypeLabel(script.extension)}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  'h-6 w-6 flex-shrink-0',
                                  isRunningThis
                                    ? 'text-red-500 hover:text-red-600 hover:bg-red-500/10'
                                    : 'opacity-0 group-hover:opacity-100 text-brand-500 hover:text-brand-600 hover:bg-brand-500/10'
                                )}
                                onClick={() => {
                                  if (isRunningThis) {
                                    handleCancelDeploy();
                                  } else {
                                    handleRunScript(script);
                                  }
                                }}
                                disabled={isDeploying && !isRunningThis}
                                title={isRunningThis ? 'Stop' : `Run ${displayName}`}
                              >
                                {isRunningThis ? (
                                  <Square className="w-3 h-3" />
                                ) : (
                                  <Play className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* ================================================================ */}
        {/* Run History                                                       */}
        {/* ================================================================ */}
        <div className="border-b border-border flex-shrink-0" style={{ maxHeight: '40%' }}>
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
              Run History
            </span>
            <div className="flex items-center gap-1">
              {completedRuns.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCompletedRunsModal(true)}
                  title="View completed runs"
                >
                  <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                  Completed
                </Button>
              )}
              {(completedRuns.length > 0 ||
                runs.some((r) => r.status !== 'running') ||
                history.length > 0) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={handleClearAll}
                  title="Clear all runs and history"
                >
                  <Trash2 className="w-2.5 h-2.5 mr-0.5" />
                  Clear All
                </Button>
              )}
            </div>
          </div>

          {runs.length === 0 &&
            completedRuns.length === 0 &&
            history.length === 0 &&
            !isLoadingHistory && (
              <div className="px-3 py-4 flex flex-col items-center text-center">
                <Clock className="h-5 w-5 text-muted-foreground/40 mb-1" />
                <p className="text-xs text-muted-foreground/60">No runs yet</p>
              </div>
            )}

          <ScrollArea className="w-full" style={{ maxHeight: '160px' }}>
            <div className="py-0.5">
              {/* Active runs (currently running) */}
              {runs.map((run) => {
                const isViewing = viewingRunId === run.id;
                return (
                  <button
                    key={run.id}
                    onClick={() => handleViewRun(run.id)}
                    className={cn(
                      'w-full px-3 py-1.5 text-left hover:bg-accent/50 transition-colors',
                      'flex items-center gap-2',
                      isViewing && 'bg-accent/70'
                    )}
                  >
                    <Loader2 className="w-3 h-3 animate-spin text-blue-500 flex-shrink-0" />

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{run.scriptName}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{run.message}</p>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Eye
                        className={cn(
                          'w-3 h-3',
                          isViewing ? 'text-brand-500' : 'text-muted-foreground/40'
                        )}
                      />
                    </div>
                  </button>
                );
              })}

              {/* Completed runs (finished local runs) */}
              {completedRuns.map((run) => {
                const isViewing = viewingCompletedRunId === run.id;
                return (
                  <div
                    key={run.id}
                    className={cn(
                      'group w-full px-3 py-1.5 text-left hover:bg-accent/50 transition-colors',
                      'flex items-center gap-2',
                      isViewing && 'bg-accent/70'
                    )}
                  >
                    <button
                      className="flex items-center gap-2 flex-1 min-w-0"
                      onClick={() => handleViewCompletedRun(run.id)}
                    >
                      {/* Status icon */}
                      {run.status === 'success' && (
                        <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                      )}
                      {run.status === 'error' && (
                        <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{run.scriptName}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{run.message}</p>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {run.duration != null && (
                          <span className="text-[10px] text-muted-foreground">
                            {formatDuration(run.duration)}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground/50">
                          {formatTime(run.completedAt)}
                        </span>
                        <Eye
                          className={cn(
                            'w-3 h-3',
                            isViewing ? 'text-brand-500' : 'text-muted-foreground/40'
                          )}
                        />
                      </div>
                    </button>

                    {/* Delete individual completed run */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCompletedRun(run.id);
                      }}
                      title="Delete this run"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                );
              })}

              {/* Server history */}
              {history.map((entry, idx) => {
                const isViewing = viewingHistoryIdx === idx;
                return (
                  <button
                    key={`history-${idx}-${entry.startedAt}`}
                    onClick={() => handleViewHistory(idx)}
                    className={cn(
                      'w-full px-3 py-1.5 text-left hover:bg-accent/50 transition-colors',
                      'flex items-center gap-2',
                      isViewing && 'bg-accent/70'
                    )}
                  >
                    {entry.success ? (
                      <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{entry.script.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {entry.success
                          ? 'Completed'
                          : entry.exitCode != null
                            ? `Failed (exit code ${entry.exitCode})`
                            : 'Failed'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {entry.duration > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatDuration(entry.duration)}
                        </span>
                      )}
                      {entry.startedAt && (
                        <span className="text-[10px] text-muted-foreground/50">
                          {formatTime(entry.startedAt)}
                        </span>
                      )}
                      <Eye
                        className={cn(
                          'w-3 h-3',
                          isViewing ? 'text-brand-500' : 'text-muted-foreground/40'
                        )}
                      />
                    </div>
                  </button>
                );
              })}

              {isLoadingHistory && (
                <div className="px-3 py-2 flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-[10px]">Loading history...</span>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ================================================================ */}
        {/* Output Viewer                                                    */}
        {/* ================================================================ */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
                Output
              </span>
              {(viewedRun || viewedCompletedRun || viewedHistory) && (
                <span className="text-[10px] text-muted-foreground truncate">
                  —{' '}
                  {viewedRun?.scriptName ||
                    viewedCompletedRun?.scriptName ||
                    viewedHistory?.script.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {isViewedStreaming && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-red-500 hover:text-red-600"
                  onClick={handleCancelDeploy}
                  title="Cancel deploy"
                >
                  <Square className="w-2.5 h-2.5 mr-1" />
                  Stop
                </Button>
              )}
              {(viewedRun || viewedCompletedRun || viewedHistory) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={handleCloseViewer}
                >
                  Close
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1">
            {!viewedRun && !viewedCompletedRun && !viewedHistory ? (
              <div className="flex flex-col items-center justify-center p-6 text-center h-full min-h-[120px]">
                <div className="p-3 rounded-full bg-muted/50 mb-3">
                  <Terminal className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-xs text-muted-foreground/70">
                  {runs.length > 0 || completedRuns.length > 0 || history.length > 0
                    ? 'Click a run to view its output'
                    : 'Run a script to see output here'}
                </p>
              </div>
            ) : (
              <div className="p-2">
                <DeployLogOutput
                  output={viewedOutput}
                  isStreaming={isViewedStreaming}
                  maxHeight="max-h-[500px]"
                />
                {/* Active run metadata */}
                {viewedRun && !isViewedStreaming && (
                  <div className="mt-2 px-2 text-[10px] text-muted-foreground/50">
                    <span>Started: {formatTime(viewedRun.startedAt)}</span>
                    {viewedRun.duration != null && (
                      <span className="ml-3">Duration: {formatDuration(viewedRun.duration)}</span>
                    )}
                    {viewedRun.exitCode != null && (
                      <span className={cn('ml-3', viewedRun.exitCode !== 0 && 'text-red-400')}>
                        Exit code: {viewedRun.exitCode}
                      </span>
                    )}
                  </div>
                )}
                {/* Completed run metadata */}
                {viewedCompletedRun && (
                  <div className="mt-2 px-2 text-[10px] text-muted-foreground/50">
                    <span>Started: {formatTime(viewedCompletedRun.startedAt)}</span>
                    {viewedCompletedRun.duration != null && (
                      <span className="ml-3">
                        Duration: {formatDuration(viewedCompletedRun.duration)}
                      </span>
                    )}
                    {viewedCompletedRun.exitCode != null && (
                      <span
                        className={cn('ml-3', viewedCompletedRun.exitCode !== 0 && 'text-red-400')}
                      >
                        Exit code: {viewedCompletedRun.exitCode}
                      </span>
                    )}
                    <span className="ml-3">
                      Completed: {formatTime(viewedCompletedRun.completedAt)}
                    </span>
                  </div>
                )}
                {/* Server history metadata */}
                {viewedHistory && (
                  <div className="mt-2 px-2 text-[10px] text-muted-foreground/50">
                    {viewedHistory.startedAt && (
                      <span>Started: {formatTime(viewedHistory.startedAt)}</span>
                    )}
                    {viewedHistory.duration > 0 && (
                      <span className="ml-3">
                        Duration: {formatDuration(viewedHistory.duration)}
                      </span>
                    )}
                    {viewedHistory.exitCode != null && (
                      <span className="ml-3">Exit code: {viewedHistory.exitCode}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Completed Runs Modal */}
      <CompletedRunsModal
        open={showCompletedRunsModal}
        onOpenChange={setShowCompletedRunsModal}
        componentProps={{
          completedRuns,
          onDeleteRun: handleDeleteCompletedRun,
          onClearAll: handleClearAllCompletedRuns,
        }}
      />
    </div>
  );
}, arePropsEqual);

export default DeployPanel;
