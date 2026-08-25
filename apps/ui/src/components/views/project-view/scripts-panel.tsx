import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCode,
  FolderClosed,
  FolderOpen,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Square,
  Terminal,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, generateUUID } from '@/lib/utils';
import { apiDelete, apiFetch, apiGet, apiPost, getAuthenticatedImageUrl } from '@/lib/api-fetch';
import { getHttpApiClient } from '@/lib/http-api-client';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/layout';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LazyImage } from '@/components/ui/lazy-image';
import { getProjectIcon } from '@/lib/icon-registry';
import { useAppStore } from '@/store/app-store';
import type { Project } from '@/lib/electron';
import { createLogger } from '@dmaker/utils/logger';
import { DeployLogOutput } from '../board-view/components/deploy-log-output';
import { CompletedRunsModal } from '../board-view/dialogs';

const logger = createLogger('ScriptsPanel');

// ============================================================================
// Types
// ============================================================================

export interface ScriptsPanelProps {
  /** Additional CSS classes for the container */
  className?: string;
  /** Project whose deploy scripts are shown */
  project?: Project | null;
  /** Project path (used when no project object is available) */
  projectPath?: string | null;
  /** Whether the panel is collapsed to its vertical rail */
  isCollapsed?: boolean;
  /** Callback when collapse state changes */
  onCollapseChange?: (collapsed: boolean) => void;
  /** Callback when the user picks a different project from the header */
  onProjectChange?: (project: Project) => void;
  /** Whether to show the project selector in the header */
  showProjectSelector?: boolean;
}

/** A script discovered in .dmaker/deploy (matches the server's DeployScript) */
interface FolderScript {
  /** Stable id from the script's frontmatter — run history binds to this */
  id: string;
  /** Display name declared in frontmatter, when present */
  title?: string;
  description?: string;
  name: string;
  path: string;
  type: string;
  extension: string;
  size: number;
  modifiedAt: string;
  /** Relative folder within the deploy directory ('' for root-level scripts) */
  folder: string;
}

interface FolderScriptsResponse {
  success: boolean;
  scripts: FolderScript[];
  folderPath: string;
  folderExists: boolean;
  error?: string;
}

/** A completed run as the server remembers it */
interface HistoryEntry {
  runId: string;
  scriptId: string;
  success: boolean;
  script: FolderScript;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
  duration: number;
  startedAt: string;
}

interface RunsHistoryResponse {
  success: boolean;
  history: HistoryEntry[];
  total: number;
}

/** A run this session started, live or finished */
interface RunEntry {
  id: string;
  scriptId: string;
  scriptName: string;
  status: 'running' | 'success' | 'error';
  output: string;
  message: string;
  duration?: number;
  exitCode?: number | null;
  startedAt: Date;
  completedAt?: Date;
}

/** A run as the runs list renders it, whether local or from server history */
interface DisplayRun {
  id: string;
  scriptId: string;
  scriptName: string;
  status: 'running' | 'success' | 'error';
  output: string;
  message: string;
  duration?: number;
  exitCode?: number | null;
  startedAt: Date;
  completedAt?: Date;
  /** Sequence number within this script's runs, oldest = 1 */
  ordinal: number;
}

/** Extensions the deploy runner can execute, with the shell each implies. */
const SCRIPT_TYPES = [
  { extension: '.ps1', label: 'PowerShell', starter: '# PowerShell deploy script\n' },
  { extension: '.sh', label: 'Shell', starter: '#!/usr/bin/env bash\nset -euo pipefail\n' },
  { extension: '.js', label: 'Node', starter: '// Node deploy script\n' },
  { extension: '.py', label: 'Python', starter: '# Python deploy script\n' },
  { extension: '.bat', label: 'Batch', starter: '@echo off\r\n' },
] as const;

// ============================================================================
// Helpers
// ============================================================================

/** Path of a script relative to the deploy folder, which is what the API takes. */
function relativePathOf(script: FolderScript): string {
  return script.folder ? `${script.folder}/${script.name}` : script.name;
}

/** Just the filename, without any folder prefix. */
function displayNameOf(script: FolderScript): string {
  const lastSlash = script.name.lastIndexOf('/');
  return lastSlash >= 0 ? script.name.slice(lastSlash + 1) : script.name;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return value.toLocaleTimeString();
}

/** Flatten a history entry's captured streams into one output blob. */
function historyOutput(entry: HistoryEntry): string {
  let output = entry.stdout || '';
  if (entry.stderr) output += (output ? '\n' : '') + entry.stderr;
  if (entry.error && !output.includes(entry.error)) {
    output += (output ? '\n' : '') + entry.error;
  }
  return output;
}

/** One-line summary of how a history entry ended. */
function historyMessage(entry: HistoryEntry): string {
  if (entry.success) return 'Completed';
  if (entry.error) return entry.error;
  return entry.exitCode != null ? `Failed (exit code ${entry.exitCode})` : 'Failed';
}

// ============================================================================
// Component
// ============================================================================

/**
 * The project's deploy scripts: writing them and running them, in one pane.
 *
 * Everything lives in `.dmaker/deploy/`, so scripts DMaker runs are always
 * visibly DMaker's. Each script carries a frontmatter id, and runs are tracked
 * against that id — so several scripts (or the same script twice) can be in
 * flight at once, each with its own live output and its own stop button.
 */
export const ScriptsPanel = memo(function ScriptsPanel({
  className,
  project,
  projectPath: projectPathProp,
  isCollapsed = false,
  onCollapseChange,
  onProjectChange,
  showProjectSelector = false,
}: ScriptsPanelProps) {
  // ---------------------------------------------------------------------------
  // Project resolution
  // ---------------------------------------------------------------------------

  const projects = useAppStore((state) => state.projects);
  const storeCurrentProject = useAppStore((state) =>
    project === undefined ? state.currentProject : null
  );
  const effectiveProject = project ?? storeCurrentProject;
  const projectPath = effectiveProject?.path ?? projectPathProp ?? '';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [scripts, setScripts] = useState<FolderScript[]>([]);
  const [folderPath, setFolderPath] = useState('');
  const [folderExists, setFolderExists] = useState(false);
  const [isLoadingScripts, setIsLoadingScripts] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  // Editor
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [savedDraft, setSavedDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // New-script form
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newExtension, setNewExtension] = useState<string>(SCRIPT_TYPES[0].extension);

  // Runs
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedRunByScript, setSelectedRunByScript] = useState<Record<string, string>>({});
  const [detailTab, setDetailTab] = useState<'editor' | 'runs'>('editor');
  const [showCompletedRunsModal, setShowCompletedRunsModal] = useState(false);

  /** SSE readers, one per in-flight run, so each can be torn down alone. */
  const runControllersRef = useRef<Map<string, AbortController>>(new Map());

  const isDirty = draft !== savedDraft;
  const selectedScript = useMemo(
    () => scripts.find((script) => relativePathOf(script) === selectedPath) ?? null,
    [scripts, selectedPath]
  );

  // ---------------------------------------------------------------------------
  // Fetching
  // ---------------------------------------------------------------------------

  const fetchScripts = useCallback(async () => {
    if (!projectPath) {
      setScripts([]);
      setFolderExists(false);
      return;
    }
    setIsLoadingScripts(true);
    try {
      const data = await apiGet<FolderScriptsResponse>(
        `/api/deploy/folder-scripts?projectPath=${encodeURIComponent(projectPath)}`
      );
      if (data.success) {
        setScripts(data.scripts);
        setFolderPath(data.folderPath);
        setFolderExists(data.folderExists);
      } else {
        setScripts([]);
      }
    } catch (error) {
      logger.error('Failed to list deploy scripts:', error);
      setScripts([]);
    } finally {
      setIsLoadingScripts(false);
    }
  }, [projectPath]);

  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const data = await apiGet<RunsHistoryResponse>('/api/deploy/runs?limit=100');
      if (data.success) setHistory(data.history);
    } catch (error) {
      logger.error('Failed to fetch deploy history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (isCollapsed) return;
    void fetchScripts();
    void fetchHistory();
  }, [isCollapsed, fetchScripts, fetchHistory]);

  // Selecting a different project invalidates whatever the editor had open.
  useEffect(() => {
    setSelectedPath(null);
    setDraft('');
    setSavedDraft('');
  }, [projectPath]);

  // ---------------------------------------------------------------------------
  // Live run events (WebSocket, routed by runId)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const client = getHttpApiClient();
    if (!client.deploy) return;

    const finishRun = (
      runId: string,
      status: 'success' | 'error',
      message: string,
      extra: { duration?: number; exitCode?: number | null; appendOutput?: string }
    ): void => {
      setRuns((previous) =>
        previous.map((run) =>
          run.id === runId
            ? {
                ...run,
                status,
                message,
                duration: extra.duration,
                exitCode: extra.exitCode ?? null,
                output: extra.appendOutput ? `${run.output}\n${extra.appendOutput}` : run.output,
                completedAt: new Date(),
              }
            : run
        )
      );
      runControllersRef.current.delete(runId);
    };

    const unsubOutput = client.deploy.onDeployOutput((payload) => {
      if (!payload?.runId) return;
      setRuns((previous) =>
        previous.map((run) =>
          run.id === payload.runId ? { ...run, output: run.output + payload.data } : run
        )
      );
    });

    const unsubSuccess = client.deploy.onDeploySuccess((payload) => {
      if (!payload?.runId) return;
      finishRun(payload.runId, 'success', payload.message || 'Completed', {
        duration: payload.duration,
        exitCode: 0,
      });
      toast.success('Script completed', { description: payload.message });
      void fetchHistory();
    });

    const unsubError = client.deploy.onDeployError((payload) => {
      if (!payload?.runId) return;
      finishRun(payload.runId, 'error', payload.message || 'Failed', {
        duration: payload.duration,
        exitCode: payload.exitCode,
        appendOutput: payload.error,
      });
      toast.error('Script failed', {
        description: payload.error
          ? payload.error.slice(0, 120) + (payload.error.length > 120 ? '…' : '')
          : payload.message,
      });
      void fetchHistory();
    });

    return () => {
      unsubOutput();
      unsubSuccess();
      unsubError();
    };
  }, [fetchHistory]);

  // Tear down every in-flight SSE reader on unmount.
  useEffect(() => {
    const controllers = runControllersRef.current;
    return () => {
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Editing
  // ---------------------------------------------------------------------------

  const openScript = useCallback(
    async (relativePath: string) => {
      if (!projectPath) return;
      try {
        const data = await apiGet<{ success: boolean; content?: string; error?: string }>(
          `/api/deploy/script?projectPath=${encodeURIComponent(projectPath)}&path=${encodeURIComponent(relativePath)}`
        );
        if (!data.success || data.content === undefined) {
          toast.error('Failed to open script', { description: data.error });
          return;
        }
        setSelectedPath(relativePath);
        setDraft(data.content);
        setSavedDraft(data.content);
      } catch (error) {
        logger.error('Failed to read deploy script:', error);
        toast.error('Failed to open script');
      }
    },
    [projectPath]
  );

  const saveScript = useCallback(async () => {
    if (!projectPath || !selectedPath) return;
    setIsSaving(true);
    try {
      const data = await apiPost<{ success: boolean; content?: string; error?: string }>(
        '/api/deploy/script',
        { projectPath, path: selectedPath, content: draft }
      );
      if (!data.success) {
        toast.error('Failed to save script', { description: data.error });
        return;
      }
      // The server may have restored the frontmatter id, so take its version
      // of the file as the new baseline rather than our draft.
      const written = data.content ?? draft;
      setDraft(written);
      setSavedDraft(written);
      toast.success(`Saved ${selectedPath}`);
      void fetchScripts();
    } catch (error) {
      logger.error('Failed to save deploy script:', error);
      toast.error('Failed to save script');
    } finally {
      setIsSaving(false);
    }
  }, [projectPath, selectedPath, draft, fetchScripts]);

  const deleteScript = useCallback(
    async (relativePath: string) => {
      if (!projectPath) return;
      try {
        const data = await apiDelete<{ success: boolean; error?: string }>('/api/deploy/script', {
          body: { projectPath, path: relativePath },
        });
        if (!data.success) {
          toast.error('Failed to delete script', { description: data.error });
          return;
        }
        toast.success(`Deleted ${relativePath}`);
        if (selectedPath === relativePath) {
          setSelectedPath(null);
          setDraft('');
          setSavedDraft('');
        }
        void fetchScripts();
      } catch (error) {
        logger.error('Failed to delete deploy script:', error);
        toast.error('Failed to delete script');
      }
    },
    [projectPath, selectedPath, fetchScripts]
  );

  const createScript = useCallback(async () => {
    if (!projectPath) return;
    const safeName = newName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!safeName) {
      toast.error('Enter a script name');
      return;
    }

    const type = SCRIPT_TYPES.find((candidate) => candidate.extension === newExtension);
    const relativePath = `${safeName}${newExtension}`;

    if (scripts.some((script) => relativePathOf(script) === relativePath)) {
      toast.error('A script with that name already exists');
      return;
    }

    try {
      const data = await apiPost<{ success: boolean; error?: string }>('/api/deploy/script', {
        projectPath,
        path: relativePath,
        content: type?.starter ?? '',
      });
      if (!data.success) {
        toast.error('Failed to create script', { description: data.error });
        return;
      }
      toast.success(`Created ${relativePath}`);
      setIsCreating(false);
      setNewName('');
      setDetailTab('editor');
      await fetchScripts();
      await openScript(relativePath);
    } catch (error) {
      logger.error('Failed to create deploy script:', error);
      toast.error('Failed to create script');
    }
  }, [projectPath, newName, newExtension, scripts, fetchScripts, openScript]);

  // ---------------------------------------------------------------------------
  // Running
  // ---------------------------------------------------------------------------

  const runScript = useCallback(
    async (script: FolderScript) => {
      if (!projectPath) {
        toast.error('No project selected');
        return;
      }

      const runId = generateUUID();
      const controller = new AbortController();
      runControllersRef.current.set(runId, controller);

      setRuns((previous) => [
        {
          id: runId,
          scriptId: script.id,
          scriptName: script.name,
          status: 'running',
          output: '',
          message: `Running "${displayNameOf(script)}"…`,
          startedAt: new Date(),
        },
        ...previous,
      ]);
      setSelectedRunByScript((previous) => ({ ...previous, [script.id]: runId }));
      setSelectedPath(relativePathOf(script));
      setDetailTab('runs');

      try {
        // Start the run. Live output arrives over the WebSocket tagged with
        // this runId; the SSE body is drained only to keep the connection
        // healthy, since Electron's fetch may buffer it.
        const response = await apiFetch('/api/deploy/run', 'POST', {
          body: { projectPath, scriptName: script.name, runId },
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (reader) {
          try {
            while (true) {
              const { done } = await reader.read();
              if (done) break;
            }
          } catch {
            // Stream closed early — the WebSocket still reports the outcome.
          }
        }
      } catch (error) {
        // An abort here is just the SSE stream closing; the run itself is
        // still tracked over the WebSocket, so leave its state alone.
        if ((error as Error).name === 'AbortError') return;

        const message = error instanceof Error ? error.message : 'Unknown error';
        setRuns((previous) =>
          previous.map((run) =>
            run.id === runId
              ? { ...run, status: 'error', message, exitCode: null, completedAt: new Date() }
              : run
          )
        );
        runControllersRef.current.delete(runId);
        toast.error('Failed to start script', { description: message });
      }
    },
    [projectPath]
  );

  const cancelRun = useCallback(async (runId: string) => {
    try {
      const data = await apiPost<{ success: boolean; cancelled?: boolean }>('/api/deploy/cancel', {
        runId,
      });
      // The server kills the process and reports the outcome over the
      // WebSocket, so a successful cancel needs nothing marked locally.
      if (data.success && data.cancelled) return;
    } catch (error) {
      logger.error('Failed to cancel run:', error);
    }

    // The server did not know about this run — close it out locally.
    runControllersRef.current.get(runId)?.abort();
    runControllersRef.current.delete(runId);
    setRuns((previous) =>
      previous.map((run) =>
        run.id === runId
          ? { ...run, status: 'error', message: 'Run cancelled', completedAt: new Date() }
          : run
      )
    );
  }, []);

  /** Stop every run currently in flight for one script. */
  const cancelScriptRuns = useCallback(
    async (scriptId: string) => {
      const inFlight = runs.filter((run) => run.scriptId === scriptId && run.status === 'running');
      await Promise.all(inFlight.map((run) => cancelRun(run.id)));
    },
    [runs, cancelRun]
  );

  // ---------------------------------------------------------------------------
  // Derived run views
  // ---------------------------------------------------------------------------

  /** Every run: this session's first, with server history filling in the rest. */
  const allRuns = useMemo((): DisplayRun[] => {
    const localIds = new Set(runs.map((run) => run.id));

    const combined: Omit<DisplayRun, 'ordinal'>[] = [
      ...runs,
      ...history
        .filter((entry) => !localIds.has(entry.runId))
        .map((entry) => {
          const startedAt = entry.startedAt ? new Date(entry.startedAt) : new Date(0);
          return {
            id: entry.runId,
            scriptId: entry.scriptId,
            scriptName: entry.script?.name ?? 'script',
            status: entry.success ? ('success' as const) : ('error' as const),
            output: historyOutput(entry),
            message: historyMessage(entry),
            duration: entry.duration,
            exitCode: entry.exitCode,
            startedAt,
            completedAt: entry.startedAt
              ? new Date(startedAt.getTime() + (entry.duration || 0))
              : undefined,
          };
        }),
    ];

    // Number each script's runs from its oldest, then present newest first.
    const counters = new Map<string, number>();
    const ordinals = new Map<string, number>();
    for (const run of [...combined].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
      const next = (counters.get(run.scriptId) ?? 0) + 1;
      counters.set(run.scriptId, next);
      ordinals.set(run.id, next);
    }

    return combined
      .map((run) => ({ ...run, ordinal: ordinals.get(run.id) ?? 0 }))
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }, [runs, history]);

  /** Runs belonging to the script currently open in the detail pane. */
  const selectedScriptRuns = useMemo(
    () => (selectedScript ? allRuns.filter((run) => run.scriptId === selectedScript.id) : []),
    [allRuns, selectedScript]
  );

  const viewedRun = useMemo(() => {
    if (!selectedScript) return null;
    const preferred = selectedRunByScript[selectedScript.id];
    return selectedScriptRuns.find((run) => run.id === preferred) ?? selectedScriptRuns[0] ?? null;
  }, [selectedScript, selectedRunByScript, selectedScriptRuns]);

  /** Script ids with at least one run in flight, for the list's status icons. */
  const runningScriptIds = useMemo(
    () => new Set(runs.filter((run) => run.status === 'running').map((run) => run.scriptId)),
    [runs]
  );

  const anyRunning = runningScriptIds.size > 0;

  /** Run counts per script, shown beside each row in the list. */
  const runCountByScript = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of allRuns) {
      counts.set(run.scriptId, (counts.get(run.scriptId) ?? 0) + 1);
    }
    return counts;
  }, [allRuns]);

  /** Finished runs across every script, for the completed-runs modal. */
  const completedRuns = useMemo(
    () =>
      allRuns
        .filter((run) => run.status !== 'running')
        .map((run) => ({
          id: run.id,
          scriptName: run.scriptName,
          status: run.status as 'success' | 'error',
          output: run.output,
          message: run.message,
          duration: run.duration,
          exitCode: run.exitCode,
          startedAt: run.startedAt,
          completedAt: run.completedAt ?? run.startedAt,
        })),
    [allRuns]
  );

  const grouped = useMemo(() => {
    const byFolder = new Map<string, FolderScript[]>();
    for (const script of scripts) {
      const key = script.folder || '';
      if (!byFolder.has(key)) byFolder.set(key, []);
      byFolder.get(key)!.push(script);
    }
    // Root-level scripts first, then folders alphabetically.
    return Array.from(byFolder.entries()).sort(([a], [b]) => {
      if (a === '' && b !== '') return -1;
      if (a !== '' && b === '') return 1;
      return a.localeCompare(b);
    });
  }, [scripts]);

  // ---------------------------------------------------------------------------
  // Run history management
  // ---------------------------------------------------------------------------

  const deleteRun = useCallback(async (runId: string) => {
    setRuns((previous) => previous.filter((run) => run.id !== runId));
    setHistory((previous) => previous.filter((entry) => entry.runId !== runId));
    try {
      await apiDelete('/api/deploy/runs', { body: { runId } });
    } catch (error) {
      logger.error('Failed to delete run:', error);
    }
  }, []);

  const clearRunsForScript = useCallback(async (scriptId: string) => {
    setRuns((previous) =>
      previous.filter((run) => run.scriptId !== scriptId || run.status === 'running')
    );
    setHistory((previous) => previous.filter((entry) => entry.scriptId !== scriptId));
    try {
      await apiDelete('/api/deploy/runs', { body: { scriptId } });
    } catch (error) {
      logger.error('Failed to clear script run history:', error);
    }
  }, []);

  const clearAllRuns = useCallback(async () => {
    setRuns((previous) => previous.filter((run) => run.status === 'running'));
    setHistory([]);
    setSelectedRunByScript({});
    try {
      await apiDelete('/api/deploy/runs');
    } catch (error) {
      logger.error('Failed to clear server run history:', error);
    }
  }, []);

  const toggleFolder = useCallback((folder: string) => {
    setCollapsedFolders((previous) => {
      const next = new Set(previous);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }, []);

  // ============================================================================
  // Collapsed rail
  // ============================================================================

  if (isCollapsed) {
    return (
      <div
        className={cn(
          'flex h-full w-10 flex-col items-center justify-center border-l border-border bg-card',
          className
        )}
        data-testid="scripts-panel-collapsed"
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onCollapseChange?.(false)}
          title="Expand Scripts panel"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Rocket className="h-5 w-5" />
            <span
              className="text-xs font-medium"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              Scripts
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // No project
  // ============================================================================

  if (!projectPath) {
    return (
      <div
        className={cn('flex h-full items-center justify-center', className)}
        data-testid="project-scripts-panel"
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 rounded-full bg-muted/50 p-3">
            <Rocket className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mb-1 text-sm font-medium text-muted-foreground">No project selected</p>
          <p className="max-w-[220px] text-xs text-muted-foreground/70">
            Select a project to write and run its deploy scripts.
          </p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Expanded
  // ============================================================================

  return (
    <div
      className={cn('flex h-full min-h-0 flex-col', className)}
      data-testid="project-scripts-panel"
    >
      {/* ================================================================== */}
      {/* Header                                                             */}
      {/* ================================================================== */}
      <div className="flex h-10 shrink-0 items-center border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 px-3">
          <div className="rounded bg-brand-500/10 p-1">
            <Rocket className="h-3.5 w-3.5 text-brand-500" />
          </div>
          <span className="text-sm font-medium">Scripts</span>
          {anyRunning && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
            </span>
          )}
        </div>

        {showProjectSelector && projects.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 max-w-[160px] gap-1.5 rounded-md px-2 text-xs font-medium hover:bg-muted/70"
              >
                {effectiveProject?.customIconPath ? (
                  <LazyImage
                    src={getAuthenticatedImageUrl(
                      effectiveProject.customIconPath,
                      effectiveProject.path
                    )}
                    alt={effectiveProject.name}
                    className="h-4 w-4 shrink-0 rounded object-cover ring-1 ring-border/50"
                    containerClassName="w-4 h-4 shrink-0"
                    errorIconSize="w-2 h-2"
                  />
                ) : (
                  (() => {
                    const ProjectIcon = getProjectIcon(effectiveProject?.icon);
                    return <ProjectIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
                  })()
                )}
                <span className="truncate">{effectiveProject?.name || 'Select project'}</span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[300px] w-[200px] overflow-y-auto">
              {projects.map((candidate) => {
                const ProjectIcon = getProjectIcon(candidate.icon);
                const isSelected = effectiveProject?.id === candidate.id;
                return (
                  <DropdownMenuItem
                    key={candidate.id}
                    onClick={() => onProjectChange?.(candidate)}
                    className={cn('cursor-pointer', isSelected && 'bg-primary/10 text-primary')}
                  >
                    <div className="flex w-full min-w-0 items-center gap-2">
                      {candidate.customIconPath ? (
                        <LazyImage
                          src={getAuthenticatedImageUrl(candidate.customIconPath, candidate.path)}
                          alt={candidate.name}
                          className="h-5 w-5 shrink-0 rounded object-cover ring-1 ring-border/50"
                          containerClassName="w-5 h-5 shrink-0"
                          errorIconSize="w-2.5 h-2.5"
                        />
                      ) : (
                        <div
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded',
                            isSelected ? 'bg-primary/20' : 'bg-muted'
                          )}
                        >
                          <ProjectIcon
                            className={cn(
                              'h-3 w-3',
                              isSelected ? 'text-primary' : 'text-muted-foreground'
                            )}
                          />
                        </div>
                      )}
                      <span className="flex-1 truncate text-sm">{candidate.name}</span>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="min-w-0 flex-1" />

        {completedRuns.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => setShowCompletedRunsModal(true)}
            title="View every completed run"
            data-testid="scripts-completed-runs"
          >
            <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />
            Completed
          </Button>
        )}

        {(completedRuns.length > 0 || history.length > 0) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => void clearAllRuns()}
            title="Clear all run history"
          >
            <Trash2 className="mr-0.5 h-2.5 w-2.5" />
            Clear all
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="mr-1 h-6 w-6"
          onClick={() => {
            void fetchScripts();
            void fetchHistory();
          }}
          disabled={isLoadingScripts}
          title="Refresh scripts and runs"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoadingScripts && 'animate-spin')} />
        </Button>

        {onCollapseChange && (
          <div className="flex h-full items-center border-l border-border px-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onCollapseChange(true)}
              title="Collapse Scripts panel"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ================================================================ */}
        {/* Script list                                                      */}
        {/* ================================================================ */}
        <div className="flex w-64 shrink-0 flex-col border-r border-border/60">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/60 px-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Deploy scripts
            </span>
            <div className="flex items-center gap-1">
              {scripts.length > 0 && (
                <span className="rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-500">
                  {scripts.length}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => setIsCreating((previous) => !previous)}
                title="New script"
                data-testid="new-script"
              >
                {isCreating ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
              </Button>
            </div>
          </div>

          {isCreating && (
            <div className="shrink-0 space-y-2 border-b border-border/60 p-2">
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void createScript();
                }}
                placeholder="script-name"
                autoFocus
                className={cn(
                  'w-full rounded-md border border-border/60 bg-background px-2 py-1 text-xs',
                  'focus:border-brand-500/50 focus:outline-none'
                )}
                data-testid="new-script-name"
              />
              <div className="flex flex-wrap gap-1">
                {SCRIPT_TYPES.map((type) => (
                  <button
                    key={type.extension}
                    type="button"
                    onClick={() => setNewExtension(type.extension)}
                    className={cn(
                      'cursor-pointer rounded px-1.5 py-0.5 text-[10px] transition-colors duration-100',
                      newExtension === type.extension
                        ? 'bg-brand-500/15 text-brand-500'
                        : 'text-muted-foreground hover:bg-accent/50'
                    )}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
              <Button size="sm" className="h-7 w-full text-xs" onClick={() => void createScript()}>
                Create
              </Button>
            </div>
          )}

          <ScrollArea className="min-h-0 flex-1">
            <div className="p-1">
              {isLoadingScripts && scripts.length === 0 && (
                <div className="flex items-center justify-center gap-2 px-3 py-4 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs">Loading scripts…</span>
                </div>
              )}

              {!isLoadingScripts && scripts.length === 0 && (
                <div className="px-2 py-3">
                  <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                    {folderExists
                      ? 'No runnable scripts in the deploy folder yet.'
                      : 'No scripts yet. Create one — it lands in the deploy folder.'}
                  </p>
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground/50">
                    {folderPath || '.dmaker/deploy/'}
                  </p>
                </div>
              )}

              {grouped.map(([folder, folderScripts]) => {
                const isFolderCollapsed = folder !== '' && collapsedFolders.has(folder);
                return (
                  <div key={folder || '__root__'}>
                    {folder && (
                      <button
                        type="button"
                        onClick={() => toggleFolder(folder)}
                        className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent/30"
                        data-testid={`scripts-folder-${folder}`}
                      >
                        {isFolderCollapsed ? (
                          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                        )}
                        {isFolderCollapsed ? (
                          <FolderClosed className="size-3.5 shrink-0 text-amber-500" />
                        ) : (
                          <FolderOpen className="size-3.5 shrink-0 text-amber-500" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
                          {folder}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground/50">
                          {folderScripts.length}
                        </span>
                      </button>
                    )}

                    {!isFolderCollapsed &&
                      folderScripts.map((script) => {
                        const relativePath = relativePathOf(script);
                        const isActive = relativePath === selectedPath;
                        const isRunning = runningScriptIds.has(script.id);
                        const runCount = runCountByScript.get(script.id) ?? 0;

                        return (
                          <div
                            key={script.id}
                            className={cn(
                              'group flex items-center gap-1.5 rounded-md py-1 pr-1',
                              folder ? 'pl-6' : 'pl-2',
                              isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                            )}
                            data-testid={`scripts-script-${script.name}`}
                          >
                            <button
                              type="button"
                              onClick={() => void openScript(relativePath)}
                              className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
                              title={`${script.path}\n${script.id}`}
                            >
                              {isRunning ? (
                                <Loader2 className="size-3 shrink-0 animate-spin text-blue-500" />
                              ) : (
                                <FileCode className="size-3 shrink-0 text-brand-500" />
                              )}
                              <span className="min-w-0 flex-1 truncate text-[12px]">
                                {displayNameOf(script)}
                              </span>
                              {runCount > 0 && (
                                <span className="shrink-0 text-[10px] text-muted-foreground/50">
                                  {runCount}
                                </span>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                isRunning
                                  ? void cancelScriptRuns(script.id)
                                  : void runScript(script)
                              }
                              className={cn(
                                'shrink-0 cursor-pointer rounded p-0.5 transition-opacity duration-100',
                                isRunning
                                  ? 'text-red-500 hover:bg-red-500/10'
                                  : 'text-brand-500 opacity-0 hover:bg-brand-500/10 group-hover:opacity-100'
                              )}
                              title={isRunning ? 'Stop' : `Run ${displayNameOf(script)}`}
                              data-testid={`scripts-run-${script.name}`}
                            >
                              {isRunning ? (
                                <Square className="size-3" />
                              ) : (
                                <Play className="size-3" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => void deleteScript(relativePath)}
                              className="shrink-0 cursor-pointer opacity-0 transition-opacity duration-100 group-hover:opacity-100"
                              title="Delete script"
                            >
                              <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                            </button>
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* ================================================================ */}
        {/* Detail: editor / runs for the selected script                    */}
        {/* ================================================================ */}
        <div className="flex min-w-0 flex-1 flex-col">
          {selectedScript ? (
            <>
              {/* Detail header */}
              <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/60 px-3">
                <FileCode className="size-3.5 shrink-0 text-brand-500" />
                <span className="min-w-0 truncate font-mono text-xs">{selectedPath}</span>
                <span
                  className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground/70"
                  title="Script id, from the file's frontmatter"
                >
                  {selectedScript.id}
                </span>
                {isDirty && <span className="shrink-0 text-[10px] text-amber-500">unsaved</span>}

                <div className="min-w-0 flex-1" />

                {/* Sub-tabs */}
                <div className="flex shrink-0 items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
                  {(['editor', 'runs'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setDetailTab(tab)}
                      className={cn(
                        'cursor-pointer rounded px-2 py-0.5 text-[11px] capitalize transition-colors duration-100',
                        detailTab === tab
                          ? 'bg-background font-medium text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      data-testid={`scripts-detail-tab-${tab}`}
                    >
                      {tab}
                      {tab === 'runs' && selectedScriptRuns.length > 0 && (
                        <span className="ml-1 text-muted-foreground/60">
                          {selectedScriptRuns.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 gap-1.5 px-2 text-xs"
                  disabled={!isDirty || isSaving}
                  onClick={() => void saveScript()}
                  data-testid="save-script"
                >
                  {isSaving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  Save
                </Button>

                {runningScriptIds.has(selectedScript.id) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 gap-1.5 px-2 text-xs text-red-500 hover:text-red-600"
                    onClick={() => void cancelScriptRuns(selectedScript.id)}
                  >
                    <Square className="size-3" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 px-2 text-xs"
                    onClick={() => void runScript(selectedScript)}
                    data-testid="run-script"
                  >
                    <Play className="size-3" />
                    Run
                  </Button>
                )}
              </div>

              {/* Editor */}
              {detailTab === 'editor' && (
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  spellCheck={false}
                  className={cn(
                    'min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-xs leading-relaxed',
                    'focus:outline-none'
                  )}
                  data-testid="script-editor"
                />
              )}

              {/* Runs */}
              {detailTab === 'runs' && (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex h-8 shrink-0 items-center justify-between border-b border-border/60 px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                      Runs of {displayNameOf(selectedScript)}
                    </span>
                    {selectedScriptRuns.some((run) => run.status !== 'running') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => void clearRunsForScript(selectedScript.id)}
                        title="Clear this script's run history"
                      >
                        <Trash2 className="mr-0.5 h-2.5 w-2.5" />
                        Clear
                      </Button>
                    )}
                  </div>

                  {selectedScriptRuns.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                      <Clock className="mb-2 h-5 w-5 text-muted-foreground/40" />
                      <p className="text-xs text-muted-foreground/60">
                        No runs yet. Hit Run to execute this script.
                      </p>
                      {isLoadingHistory && (
                        <p className="mt-2 text-[10px] text-muted-foreground/50">
                          Loading history…
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col">
                      {/* Run list */}
                      <ScrollArea className="max-h-[168px] shrink-0 border-b border-border/60">
                        <div className="py-0.5">
                          {selectedScriptRuns.map((run) => {
                            const isViewing = viewedRun?.id === run.id;
                            return (
                              <div
                                key={run.id}
                                className={cn(
                                  'group flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent/50',
                                  isViewing && 'bg-accent/70'
                                )}
                                data-testid={`scripts-run-entry-${run.ordinal}`}
                              >
                                <button
                                  type="button"
                                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
                                  onClick={() =>
                                    setSelectedRunByScript((previous) => ({
                                      ...previous,
                                      [run.scriptId]: run.id,
                                    }))
                                  }
                                >
                                  {run.status === 'running' && (
                                    <Loader2 className="size-3 shrink-0 animate-spin text-blue-500" />
                                  )}
                                  {run.status === 'success' && (
                                    <CheckCircle2 className="size-3 shrink-0 text-green-500" />
                                  )}
                                  {run.status === 'error' && (
                                    <XCircle className="size-3 shrink-0 text-red-500" />
                                  )}

                                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
                                    #{run.ordinal}
                                  </span>

                                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                                    {run.message}
                                  </span>

                                  {run.duration != null && (
                                    <span className="shrink-0 text-[10px] text-muted-foreground">
                                      {formatDuration(run.duration)}
                                    </span>
                                  )}
                                  <span className="shrink-0 text-[10px] text-muted-foreground/50">
                                    {formatTime(run.startedAt)}
                                  </span>
                                </button>

                                {run.status === 'running' ? (
                                  <button
                                    type="button"
                                    onClick={() => void cancelRun(run.id)}
                                    className="shrink-0 cursor-pointer text-red-500 hover:text-red-600"
                                    title="Stop this run"
                                  >
                                    <Square className="size-2.5" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => void deleteRun(run.id)}
                                    className="shrink-0 cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
                                    title="Delete this run"
                                  >
                                    <Trash2 className="size-2.5 text-muted-foreground hover:text-red-500" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>

                      {/* Output for the selected run */}
                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex h-7 shrink-0 items-center justify-between border-b border-border/60 bg-muted/10 px-3">
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                            Output
                            {viewedRun && (
                              <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground">
                                run #{viewedRun.ordinal}
                              </span>
                            )}
                          </span>
                          {viewedRun?.status === 'running' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[10px] text-red-500 hover:text-red-600"
                              onClick={() => void cancelRun(viewedRun.id)}
                            >
                              <Square className="mr-1 h-2.5 w-2.5" />
                              Stop
                            </Button>
                          )}
                        </div>

                        <ScrollArea className="min-h-0 flex-1">
                          <div className="p-2">
                            <DeployLogOutput
                              output={viewedRun?.output ?? ''}
                              isStreaming={viewedRun?.status === 'running'}
                              maxHeight="max-h-none"
                            />
                            {viewedRun && (
                              <div className="mt-2 px-2 text-[10px] text-muted-foreground/50">
                                <span>Started: {formatTime(viewedRun.startedAt)}</span>
                                {viewedRun.duration != null && (
                                  <span className="ml-3">
                                    Duration: {formatDuration(viewedRun.duration)}
                                  </span>
                                )}
                                {viewedRun.exitCode != null && (
                                  <span
                                    className={cn(
                                      'ml-3',
                                      viewedRun.exitCode !== 0 && 'text-red-400'
                                    )}
                                  >
                                    Exit code: {viewedRun.exitCode}
                                  </span>
                                )}
                                {viewedRun.completedAt && viewedRun.status !== 'running' && (
                                  <span className="ml-3">
                                    Completed: {formatTime(viewedRun.completedAt)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 rounded-full bg-muted/50 p-3">
                <Terminal className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">
                Pick a script to edit and run, or create one.
              </p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground/60">
                {folderPath || '.dmaker/deploy'}
              </p>
            </div>
          )}
        </div>
      </div>

      <CompletedRunsModal
        open={showCompletedRunsModal}
        onOpenChange={setShowCompletedRunsModal}
        componentProps={{
          completedRuns,
          onDeleteRun: (runId: string) => void deleteRun(runId),
          onClearAll: () => void clearAllRuns(),
        }}
      />
    </div>
  );
});

export default ScriptsPanel;
