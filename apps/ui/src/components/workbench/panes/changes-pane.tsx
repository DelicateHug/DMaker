import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, PencilLine, RefreshCw } from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading-state';
import { CodeEditorWindow } from '@/components/views/board-view/dialogs';
import { cn } from '@/lib/utils';
import { DiffLine, getFileIcon, getStatusBadgeColor, getStatusDisplayName } from './diff-view';
import {
  buildChangedFileRows,
  countDiffLines,
  isDirectoryRow,
  normalizeRootPath,
  selectDiffsForPath,
  splitRowPath,
  toAbsolutePath,
  useChangedFiles,
} from './use-changed-files';

interface ChangesPaneProps {
  /** The project's main checkout. Used when the feature has no worktree. */
  projectPath: string;
  /**
   * The worktree resolved for this feature's branch, or `null` when none
   * matched. Passed separately from the root it produces so the pane can tell
   * "the feature has no branch" from "the branch's worktree was not found" —
   * the second is a fallback the user has to be told about.
   */
  worktreePath: string | null;
  /** The feature's branch, when it has one. Only ever displayed. */
  branchName?: string;
  /**
   * Whether this pane is the one on screen. Panes stay mounted once visited,
   * so an ungated poll here runs in every hidden Changes pane of every open
   * task for as long as the app is open.
   */
  isActive?: boolean;
}

/**
 * Uncommitted changes for the open feature: the changed-file list and the
 * selected file's diff, side by side.
 *
 * This replaces the separate Diff and Files tabs. Files showed the whole tree,
 * which is the repository's business rather than the feature's; what a reviewer
 * wants is the handful of files this agent touched, and the diff for whichever
 * one they click. One fetch backs both halves, so selecting a row costs a map
 * lookup rather than a request.
 */
export function ChangesPane({
  projectPath,
  worktreePath,
  branchName,
  isActive = true,
}: ChangesPaneProps) {
  // The one place separators are normalised. Everything downstream — the
  // request root, the editor's absolute path — is built from this, so a
  // forward-slashed worktree path and a backslashed project path cannot
  // produce two spellings of the same directory.
  const rootPath = useMemo(
    () => normalizeRootPath(worktreePath ?? projectPath),
    [worktreePath, projectPath]
  );

  const { files, diffIndex, isLoading, isRefreshing, error, refresh } = useChangedFiles(rootPath, {
    enabled: isActive,
  });

  const rows = useMemo(() => buildChangedFileRows(files, diffIndex), [files, diffIndex]);
  const totals = useMemo(() => countDiffLines([...diffIndex.values()]), [diffIndex]);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Selection is derived, not stored-and-synced: a poll that drops the selected
  // file (the agent reverted it, or it got committed) falls through to the
  // first row instead of leaving the pane pointing at nothing.
  const selectedRow = rows.find((row) => row.path === selectedPath) ?? rows[0] ?? null;

  const selectedDiffs = useMemo(
    () => selectDiffsForPath(diffIndex, selectedRow?.path ?? null),
    [diffIndex, selectedRow]
  );

  // The icon spins only for a refresh the user asked for. Bound straight to
  // `isRefreshing` it would twitch for the few milliseconds of every 3-second
  // background poll, forever, which reads as a pane that never finishes loading.
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  useEffect(() => {
    if (!isRefreshing) setIsManualRefresh(false);
  }, [isRefreshing]);

  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // A deleted file has nothing left on disk, and a `?? dir/` row that could not
  // be expanded is a directory — `readFile` fails on both.
  const canOpenInEditor =
    selectedRow !== null && selectedRow.status !== 'D' && !isDirectoryRow(selectedRow.path);
  const editorFilePath = selectedRow ? toAbsolutePath(rootPath, selectedRow.path) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="changes-pane">
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-border/60 px-3 text-xs">
        <span className="text-muted-foreground" data-testid="changes-file-count">
          {rows.length} {rows.length === 1 ? 'file' : 'files'} changed
        </span>
        {totals.additions > 0 && (
          <span className="tabular-nums text-green-400">+{totals.additions}</span>
        )}
        {totals.deletions > 0 && (
          <span className="tabular-nums text-red-400">-{totals.deletions}</span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setIsManualRefresh(true);
              refresh();
            }}
            data-testid="changes-refresh"
          >
            <RefreshCw className={cn('mr-1 size-3', isManualRefresh && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={!canOpenInEditor}
            onClick={() => setIsEditorOpen(true)}
            title={
              canOpenInEditor
                ? `Open ${selectedRow?.path} in the editor`
                : 'Nothing to open — pick a file that still exists on disk'
            }
            data-testid="changes-open-editor"
          >
            <PencilLine className="mr-1 size-3" />
            Open in editor
          </Button>
        </div>
      </header>

      {/* The root silently falls back to the main checkout when no worktree
          matches the branch, which reads as "the agent changed nothing". */}
      {branchName && !worktreePath && (
        <p
          className="shrink-0 border-b border-border/60 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-400"
          data-testid="changes-main-checkout-banner"
        >
          Showing the main checkout — no worktree found for{' '}
          <span className="font-mono">{branchName}</span>
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {isLoading ? (
          <LoadingState message="Loading changes..." size="h-6 w-6" />
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <AlertCircle className="size-5 text-amber-500" />
            <p className="text-sm text-muted-foreground" data-testid="changes-error">
              {error}
            </p>
            <Button variant="ghost" size="sm" onClick={refresh} className="text-xs">
              <RefreshCw className="mr-1 size-3" />
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center"
            data-testid="changes-empty"
          >
            <p className="text-sm text-muted-foreground">No uncommitted changes</p>
            <p className="max-w-sm text-xs text-muted-foreground/70">
              Work the agent has already committed does not appear here.
            </p>
          </div>
        ) : (
          <PanelGroup direction="horizontal" className="min-h-0 flex-1">
            <Panel defaultSize={32} minSize={18} className="min-w-0">
              <ul className="h-full overflow-auto py-1" data-testid="changes-file-list">
                {rows.map((row) => {
                  const { name, directory } = splitRowPath(row.path);
                  const isSelected = row.path === selectedRow?.path;
                  return (
                    <li key={row.path}>
                      <button
                        type="button"
                        onClick={() => setSelectedPath(row.path)}
                        title={
                          row.groupPath
                            ? `${row.path} — new directory ${row.groupPath}`
                            : `${row.path} — ${row.statusText}`
                        }
                        data-testid="changes-file-row"
                        data-status={row.status}
                        data-selected={isSelected ? 'true' : 'false'}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-2 px-2 py-1 text-left text-xs',
                          'transition-colors duration-100',
                          isSelected
                            ? 'bg-accent text-accent-foreground'
                            : 'hover:bg-accent/50 text-muted-foreground'
                        )}
                      >
                        <span className="shrink-0">{getFileIcon(row.status)}</span>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium text-foreground">{name}</span>
                          {directory && (
                            <span className="ml-1 text-muted-foreground/70">{directory}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            <PanelResizeHandle className="w-1 bg-border transition-colors hover:bg-brand-500 data-[resize-handle-state=drag]:bg-brand-500 data-[resize-handle-state=hover]:bg-brand-500" />

            <Panel defaultSize={68} minSize={30} className="min-w-0">
              <div className="flex h-full min-h-0 flex-col">
                {selectedRow && (
                  <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/60 px-3">
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-xs"
                      title={selectedRow.path}
                    >
                      {selectedRow.path}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium',
                        getStatusBadgeColor(selectedRow.status)
                      )}
                    >
                      {getStatusDisplayName(selectedRow.status)}
                    </span>
                  </div>
                )}

                {/* One scroll container for the whole file. The old panel capped
                    each file at max-h-[400px], which put a second scrollbar
                    inside a scrolling list. */}
                <div
                  className="min-h-0 flex-1 overflow-auto scrollbar-visible"
                  data-testid="changes-diff"
                >
                  {selectedDiffs.length === 0 ? (
                    <p className="p-4 text-xs text-muted-foreground">
                      No diff for this entry — it may be binary or ignored by the diff generator.
                    </p>
                  ) : (
                    selectedDiffs.map((fileDiff) => (
                      <section key={fileDiff.filePath}>
                        {/* A `?? dir/` row selects every file inside it, so the
                            hunks need saying which file they belong to. */}
                        {selectedDiffs.length > 1 && (
                          <div className="sticky top-0 z-10 border-b border-border-glass bg-muted px-2 py-1 font-mono text-[11px]">
                            {fileDiff.filePath}
                          </div>
                        )}
                        {fileDiff.hunks.map((hunk, hunkIndex) => (
                          <div
                            key={hunkIndex}
                            className="border-b border-border-glass last:border-b-0"
                          >
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
                      </section>
                    ))
                  )}
                </div>
              </div>
            </Panel>
          </PanelGroup>
        )}
      </div>

      <CodeEditorWindow
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        componentProps={{ initialFilePath: editorFilePath, projectPath: rootPath }}
      />
    </div>
  );
}
