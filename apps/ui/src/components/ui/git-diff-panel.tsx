import { useState, useEffect, useMemo, useCallback } from 'react';
import { getElectronAPI } from '@/lib/electron';
import { cn } from '@/lib/utils';
import {
  FileText,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  GitBranch,
  AlertCircle,
} from 'lucide-react';
import { Button } from './button';
import {
  DiffLine,
  parseDiff,
  getFileIcon,
  getStatusBadgeColor,
  getStatusDisplayName,
  type ParsedFileDiff,
} from '@/components/workbench/panes/diff-view';
import type { FileStatus } from '@/types/electron';

interface GitDiffPanelProps {
  projectPath: string;
  featureId: string;
  className?: string;
  /** Whether to show the panel in a compact/minimized state initially */
  compact?: boolean;
  /** Whether worktrees are enabled - if false, shows diffs from main project */
  useWorktrees?: boolean;
}

function FileDiffSection({
  fileDiff,
  isExpanded,
  onToggle,
}: {
  fileDiff: ParsedFileDiff;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const additions = fileDiff.hunks.reduce(
    (acc, hunk) => acc + hunk.lines.filter((l) => l.type === 'addition').length,
    0
  );
  const deletions = fileDiff.hunks.reduce(
    (acc, hunk) => acc + hunk.lines.filter((l) => l.type === 'deletion').length,
    0
  );

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center gap-2 text-left bg-card hover:bg-accent/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="flex-1 text-sm font-mono truncate text-foreground">
          {fileDiff.filePath}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {fileDiff.isNew && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
              new
            </span>
          )}
          {fileDiff.isDeleted && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
              deleted
            </span>
          )}
          {fileDiff.isRenamed && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
              renamed
            </span>
          )}
          {additions > 0 && <span className="text-xs text-green-400">+{additions}</span>}
          {deletions > 0 && <span className="text-xs text-red-400">-{deletions}</span>}
        </div>
      </button>
      {isExpanded && (
        <div className="bg-background border-t border-border max-h-[400px] overflow-y-auto scrollbar-visible">
          {fileDiff.hunks.map((hunk, hunkIndex) => (
            <div key={hunkIndex} className="border-b border-border-glass last:border-b-0">
              {hunk.lines.map((line, lineIndex) => (
                <DiffLine
                  key={lineIndex}
                  type={line.type}
                  content={line.content}
                  lineNumber={line.lineNumber}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function GitDiffPanel({
  projectPath,
  featureId,
  className,
  compact = true,
  useWorktrees = true,
}: GitDiffPanelProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [diffContent, setDiffContent] = useState<string>('');
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const loadDiffs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const api = getElectronAPI();

      // Use worktree API if worktrees are enabled, otherwise use git API for main project
      if (useWorktrees) {
        if (!api?.worktree?.getDiffs) {
          throw new Error('Worktree API not available');
        }
        const result = await api.worktree.getDiffs(projectPath, featureId);
        if (result.success) {
          setFiles(result.files || []);
          setDiffContent(result.diff || '');
        } else {
          setError(result.error || 'Failed to load diffs');
        }
      } else {
        // Use git API for main project diffs
        if (!api?.git?.getDiffs) {
          throw new Error('Git API not available');
        }
        const result = await api.git.getDiffs(projectPath);
        if (result.success) {
          setFiles(result.files || []);
          setDiffContent(result.diff || '');
        } else {
          setError(result.error || 'Failed to load diffs');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load diffs');
    } finally {
      setIsLoading(false);
    }
  }, [projectPath, featureId, useWorktrees]);

  // Load diffs when expanded
  useEffect(() => {
    if (isExpanded) {
      loadDiffs();
    }
  }, [isExpanded, loadDiffs]);

  const parsedDiffs = useMemo(() => parseDiff(diffContent), [diffContent]);

  const toggleFile = (filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const expandAllFiles = () => {
    setExpandedFiles(new Set(parsedDiffs.map((d) => d.filePath)));
  };

  const collapseAllFiles = () => {
    setExpandedFiles(new Set());
  };

  // Total stats
  const totalAdditions = parsedDiffs.reduce(
    (acc, file) =>
      acc +
      file.hunks.reduce(
        (hAcc, hunk) => hAcc + hunk.lines.filter((l) => l.type === 'addition').length,
        0
      ),
    0
  );
  const totalDeletions = parsedDiffs.reduce(
    (acc, file) =>
      acc +
      file.hunks.reduce(
        (hAcc, hunk) => hAcc + hunk.lines.filter((l) => l.type === 'deletion').length,
        0
      ),
    0
  );

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card backdrop-blur-sm overflow-hidden',
        className
      )}
      data-testid="git-diff-panel"
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-card hover:bg-accent/50 transition-colors text-left flex-shrink-0"
        data-testid="git-diff-panel-toggle"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          <GitBranch className="w-4 h-4 text-brand-500" />
          <span className="font-medium text-sm text-foreground">Git Changes</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {!isExpanded && files.length > 0 && (
            <>
              <span className="text-muted-foreground">
                {files.length} {files.length === 1 ? 'file' : 'files'}
              </span>
              {totalAdditions > 0 && <span className="text-green-400">+{totalAdditions}</span>}
              {totalDeletions > 0 && <span className="text-red-400">-{totalDeletions}</span>}
            </>
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-border">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading changes...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <span className="text-sm">{error}</span>
              <Button variant="ghost" size="sm" onClick={loadDiffs} className="mt-2">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : files.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <span className="text-sm">No changes detected</span>
            </div>
          ) : (
            <div>
              {/* Summary bar */}
              <div className="p-4 pb-2 border-b border-border-glass">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-wrap">
                    {(() => {
                      // Group files by status
                      const statusGroups = files.reduce(
                        (acc, file) => {
                          const status = file.status;
                          if (!acc[status]) {
                            acc[status] = {
                              count: 0,
                              statusText: getStatusDisplayName(status),
                              files: [],
                            };
                          }
                          acc[status].count += 1;
                          acc[status].files.push(file.path);
                          return acc;
                        },
                        {} as Record<string, { count: number; statusText: string; files: string[] }>
                      );

                      return Object.entries(statusGroups).map(([status, group]) => (
                        <div
                          key={status}
                          className="flex items-center gap-1.5"
                          title={group.files.join('\n')}
                          data-testid={`git-status-group-${status.toLowerCase()}`}
                        >
                          {getFileIcon(status)}
                          <span
                            className={cn(
                              'text-xs px-1.5 py-0.5 rounded border font-medium',
                              getStatusBadgeColor(status)
                            )}
                          >
                            {group.count} {group.statusText}
                          </span>
                        </div>
                      ));
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={expandAllFiles}
                      className="text-xs h-7"
                    >
                      Expand All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={collapseAllFiles}
                      className="text-xs h-7"
                    >
                      Collapse All
                    </Button>
                    <Button variant="ghost" size="sm" onClick={loadDiffs} className="text-xs h-7">
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Refresh
                    </Button>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-sm mt-2">
                  <span className="text-muted-foreground">
                    {files.length} {files.length === 1 ? 'file' : 'files'} changed
                  </span>
                  {totalAdditions > 0 && (
                    <span className="text-green-400">+{totalAdditions} additions</span>
                  )}
                  {totalDeletions > 0 && (
                    <span className="text-red-400">-{totalDeletions} deletions</span>
                  )}
                </div>
              </div>

              {/* File diffs */}
              <div className="p-4 space-y-3">
                {parsedDiffs.map((fileDiff) => (
                  <FileDiffSection
                    key={fileDiff.filePath}
                    fileDiff={fileDiff}
                    isExpanded={expandedFiles.has(fileDiff.filePath)}
                    onToggle={() => toggleFile(fileDiff.filePath)}
                  />
                ))}
                {/* Fallback for files that have no diff content (shouldn't happen after fix, but safety net) */}
                {files.length > 0 && parsedDiffs.length === 0 && (
                  <div className="space-y-2">
                    {files.map((file) => (
                      <div
                        key={file.path}
                        className="border border-border rounded-lg overflow-hidden"
                      >
                        <div className="w-full px-3 py-2 flex items-center gap-2 text-left bg-card">
                          {getFileIcon(file.status)}
                          <span className="flex-1 text-sm font-mono truncate text-foreground">
                            {file.path}
                          </span>
                          <span
                            className={cn(
                              'text-xs px-1.5 py-0.5 rounded border font-medium',
                              getStatusBadgeColor(file.status)
                            )}
                          >
                            {getStatusDisplayName(file.status)}
                          </span>
                        </div>
                        <div className="px-4 py-3 text-sm text-muted-foreground bg-background border-t border-border">
                          {file.status === '?' ? (
                            <span>New file - content preview not available</span>
                          ) : file.status === 'D' ? (
                            <span>File deleted</span>
                          ) : (
                            <span>Diff content not available</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
