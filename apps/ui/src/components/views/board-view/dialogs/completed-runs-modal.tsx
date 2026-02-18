import { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DeployLogOutput } from '../components/deploy-log-output';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Trash2,
  ChevronLeft,
  CheckCircle2,
  Terminal,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

/** A completed run entry preserved in local state after a run finishes */
export interface CompletedRunEntry {
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

export interface CompletedRunsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The list of completed (cleared) run entries */
  completedRuns: CompletedRunEntry[];
  /** Called when the user deletes a single completed run */
  onDeleteRun: (runId: string) => void;
  /** Called when the user wants to clear all completed runs */
  onClearAll: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

/** Format a duration in ms to a human-readable string */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Format a Date to a relative or absolute time string */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Format a Date to a full timestamp for tooltip */
function formatFullTimestamp(date: Date): string {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ============================================================================
// Component
// ============================================================================

/**
 * CompletedRunsModal - A dialog showing all cleared/completed deploy runs.
 *
 * Features:
 * - List of completed runs with status indicators (success/error)
 * - Click to view full output of any completed run
 * - Delete individual runs or clear all at once
 * - Empty state when no completed runs exist
 * - Back navigation from output view to list view
 *
 * @example
 * ```tsx
 * <CompletedRunsModal
 *   open={showCompletedRuns}
 *   onOpenChange={setShowCompletedRuns}
 *   completedRuns={completedRuns}
 *   onDeleteRun={handleDeleteCompletedRun}
 *   onClearAll={handleClearAllCompletedRuns}
 * />
 * ```
 */
export function CompletedRunsModal({
  open,
  onOpenChange,
  completedRuns,
  onDeleteRun,
  onClearAll,
}: CompletedRunsModalProps) {
  // Track which run's output is currently being viewed (null = list view)
  const [viewingRunId, setViewingRunId] = useState<string | null>(null);

  // Derive the viewed run from state
  const viewedRun = useMemo(() => {
    if (!viewingRunId) return null;
    return completedRuns.find((r) => r.id === viewingRunId) ?? null;
  }, [viewingRunId, completedRuns]);

  // Navigate to the output view for a specific run
  const handleViewRun = useCallback((runId: string) => {
    setViewingRunId(runId);
  }, []);

  // Navigate back to the list view
  const handleBackToList = useCallback(() => {
    setViewingRunId(null);
  }, []);

  // Handle deleting a run (auto-navigate back to list if viewing that run)
  const handleDelete = useCallback(
    (runId: string) => {
      if (viewingRunId === runId) {
        setViewingRunId(null);
      }
      onDeleteRun(runId);
    },
    [viewingRunId, onDeleteRun]
  );

  // Handle clearing all runs
  const handleClearAll = useCallback(() => {
    setViewingRunId(null);
    onClearAll();
  }, [onClearAll]);

  // Reset view state when dialog closes
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setViewingRunId(null);
      }
      onOpenChange(newOpen);
    },
    [onOpenChange]
  );

  // Summary counts
  const successCount = useMemo(
    () => completedRuns.filter((r) => r.status === 'success').length,
    [completedRuns]
  );
  const errorCount = useMemo(
    () => completedRuns.filter((r) => r.status === 'error').length,
    [completedRuns]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[80vh] flex flex-col p-0 gap-0"
        data-testid="completed-runs-modal"
      >
        {/* ================================================================ */}
        {/* Header                                                           */}
        {/* ================================================================ */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-3">
              {viewedRun && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 -ml-1"
                  onClick={handleBackToList}
                  title="Back to list"
                  data-testid="completed-runs-back-button"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                {viewedRun ? 'Run Output' : 'Completed Runs'}
              </DialogTitle>
            </div>

            {!viewedRun && completedRuns.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={handleClearAll}
                title="Clear all completed runs"
                data-testid="completed-runs-clear-all"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>

          {/* Description / context line */}
          {viewedRun ? (
            <DialogDescription className="flex items-center gap-2 mt-1">
              <Terminal className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="font-medium text-foreground">{viewedRun.scriptName}</span>
              <Badge variant={viewedRun.status === 'success' ? 'success' : 'error'} size="sm">
                {viewedRun.status === 'success' ? 'Success' : 'Failed'}
              </Badge>
              {viewedRun.duration != null && (
                <span className="text-xs text-muted-foreground">
                  {formatDuration(viewedRun.duration)}
                </span>
              )}
              <span
                className="text-xs text-muted-foreground"
                title={formatFullTimestamp(viewedRun.completedAt)}
              >
                {formatRelativeTime(viewedRun.completedAt)}
              </span>
            </DialogDescription>
          ) : (
            <DialogDescription>
              {completedRuns.length > 0 ? (
                <span className="flex items-center gap-2">
                  {completedRuns.length} completed run{completedRuns.length !== 1 ? 's' : ''}
                  {successCount > 0 && (
                    <Badge variant="success" size="sm">
                      {successCount} passed
                    </Badge>
                  )}
                  {errorCount > 0 && (
                    <Badge variant="error" size="sm">
                      {errorCount} failed
                    </Badge>
                  )}
                </span>
              ) : (
                'No completed runs to display.'
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* ================================================================ */}
        {/* Content Area                                                      */}
        {/* ================================================================ */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {viewedRun ? (
            /* ============================================================ */
            /* Output Viewing Mode                                          */
            /* ============================================================ */
            <div className="flex flex-col h-full">
              {/* Exit code info */}
              {viewedRun.exitCode != null && viewedRun.exitCode !== 0 && (
                <div className="px-6 py-2 bg-red-500/5 border-b border-red-500/10 text-xs text-red-500 flex items-center gap-1.5">
                  <XCircle className="w-3 h-3" />
                  Exit code: {viewedRun.exitCode}
                </div>
              )}

              {/* Log output with ANSI support */}
              <div className="flex-1 min-h-0 p-4">
                {viewedRun.output ? (
                  <DeployLogOutput
                    output={viewedRun.output}
                    isStreaming={false}
                    maxHeight="max-h-[55vh]"
                    className="h-full"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
                    <div className="p-3 rounded-full bg-muted/50 mb-3">
                      <Terminal className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No output captured for this run.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer with message */}
              {viewedRun.message && (
                <div className="px-6 py-3 border-t border-border bg-muted/30 shrink-0">
                  <p className="text-xs text-muted-foreground">{viewedRun.message}</p>
                </div>
              )}
            </div>
          ) : completedRuns.length === 0 ? (
            /* ============================================================ */
            /* Empty State                                                   */
            /* ============================================================ */
            <div
              className="flex flex-col items-center justify-center py-16 px-6 text-center"
              data-testid="completed-runs-empty-state"
            >
              <div className="p-4 rounded-full bg-muted/50 mb-4">
                <Clock className="h-10 w-10 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground mb-1">No Completed Runs</p>
              <p className="text-xs text-muted-foreground/70 max-w-[280px]">
                Completed deploy script runs will appear here after they finish. Run a script from
                the Deploy panel to get started.
              </p>
            </div>
          ) : (
            /* ============================================================ */
            /* Run List                                                      */
            /* ============================================================ */
            <ScrollArea className="h-full" style={{ maxHeight: 'calc(80vh - 140px)' }}>
              <div className="py-1" data-testid="completed-runs-list">
                {completedRuns.map((run) => (
                  <div
                    key={run.id}
                    className={cn(
                      'group flex items-center gap-3 px-6 py-3',
                      'hover:bg-accent/50 transition-colors cursor-pointer',
                      'border-b border-border/50 last:border-b-0'
                    )}
                    data-testid={`completed-run-${run.id}`}
                  >
                    {/* Clickable run info area */}
                    <button
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      onClick={() => handleViewRun(run.id)}
                    >
                      {/* Status icon */}
                      <div
                        className={cn(
                          'w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0',
                          run.status === 'success' ? 'bg-green-500/10' : 'bg-red-500/10'
                        )}
                      >
                        {run.status === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>

                      {/* Run details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{run.scriptName}</p>
                          <Badge variant={run.status === 'success' ? 'success' : 'error'} size="sm">
                            {run.status === 'success' ? 'Success' : 'Failed'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-muted-foreground truncate">{run.message}</p>
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {run.duration != null && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {formatDuration(run.duration)}
                          </span>
                        )}
                        <span
                          className="text-[10px] text-muted-foreground/60"
                          title={formatFullTimestamp(run.completedAt)}
                        >
                          {formatRelativeTime(run.completedAt)}
                        </span>
                        <Eye className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-brand-500 transition-colors" />
                      </div>
                    </button>

                    {/* Delete button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(run.id);
                      }}
                      title="Delete this run"
                      data-testid={`completed-run-delete-${run.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
