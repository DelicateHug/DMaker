import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getElectronAPI } from '@/lib/electron';
import { parseDiff, type ParsedFileDiff } from './diff-view';
import type { FileStatus } from '@/types/electron';

/**
 * The Changes pane's data: one fetch, both halves.
 *
 * `POST /api/git/diffs` returns the changed-file list AND the full diff text in
 * the same reply, so indexing the parsed diffs by path turns selecting a row
 * into a Map lookup instead of a second round trip. The old Diff tab re-fetched
 * per file and paid a request for every click.
 *
 * It deliberately calls `/api/git/diffs` with an explicit root rather than
 * `/api/worktree/diffs` with a featureId: the worktree handler resolves
 * `.worktrees/<featureId>` while worktrees are created as
 * `.worktrees/<branchName>`, so it silently returned the MAIN checkout's
 * changes with `success: true`. `getGitRepositoryDiffs` works on any git
 * directory, linked worktrees included, so handing it the resolved path cannot
 * miss.
 */

/**
 * `getGitRepositoryDiffs` caches per repo path for 3s with in-flight dedup
 * (libs/git-utils/src/diff.ts:23), so polling faster returns the same bytes and
 * still pays the JSON transfer and the re-parse. This is the floor, not a
 * tuning knob.
 */
export const CHANGED_FILES_POLL_INTERVAL_MS = 3000;

/**
 * One separator for the whole pane.
 *
 * A worktree path comes back from git forward-slashed while
 * `currentProject.path` is a Windows backslash path, and both get joined with
 * git's own forward-slashed relative paths. `path.resolve` on the server
 * normalises either form, so the only thing that matters is picking one here.
 */
export function normalizeRootPath(rootPath: string): string {
  return rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
}

/** `FileStatus.path` is repo-relative; `api.readFile` wants an absolute path. */
export function toAbsolutePath(normalizedRoot: string, repoRelativePath: string): string {
  const relative = repoRelativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${normalizedRoot}/${relative}`;
}

/**
 * `git status --porcelain` collapses a wholly-new directory into a single
 * `?? dir/` row, so a trailing slash means "a group of files", not a file.
 */
export function isDirectoryRow(repoRelativePath: string): boolean {
  return repoRelativePath.endsWith('/');
}

/** Split a row path into the part worth reading and the part worth dimming. */
export function splitRowPath(rowPath: string): { name: string; directory: string } {
  const isDirectory = isDirectoryRow(rowPath);
  const trimmed = isDirectory ? rowPath.slice(0, -1) : rowPath;
  const lastSlash = trimmed.lastIndexOf('/');
  return {
    name: trimmed.slice(lastSlash + 1) + (isDirectory ? '/' : ''),
    directory: lastSlash === -1 ? '' : trimmed.slice(0, lastSlash),
  };
}

/**
 * Index the payload's diffs by path.
 *
 * `ParsedFileDiff.filePath` is the `b/` side of the `diff --git` header, so it
 * is repo-relative and forward-slashed on every platform — the same shape as
 * `FileStatus.path`. A malformed header parses as `unknown`; first-one-wins so
 * a second malformed block cannot evict a real file.
 */
export function buildDiffIndex(diffText: string): Map<string, ParsedFileDiff> {
  const index = new Map<string, ParsedFileDiff>();
  for (const fileDiff of parseDiff(diffText)) {
    if (!index.has(fileDiff.filePath)) index.set(fileDiff.filePath, fileDiff);
  }
  return index;
}

/**
 * Every diff belonging to one row.
 *
 * Exact hit for an ordinary file. For a `?? dir/` row the synthetic-diff
 * generator emitted one block per contained file — keyed `dir/<file>`, never
 * `dir/` — except for an empty directory, which it keys `dir` with the slash
 * stripped. Both of those are why clicking a new directory used to show
 * nothing at all.
 */
export function selectDiffsForPath(
  index: ReadonlyMap<string, ParsedFileDiff>,
  rowPath: string | null
): ParsedFileDiff[] {
  if (!rowPath) return [];

  const exact = index.get(rowPath);
  if (exact) return [exact];
  if (!isDirectoryRow(rowPath)) return [];

  const emptyDirectory = index.get(rowPath.slice(0, -1));
  if (emptyDirectory) return [emptyDirectory];

  const contained: ParsedFileDiff[] = [];
  for (const [filePath, fileDiff] of index) {
    if (filePath.startsWith(rowPath)) contained.push(fileDiff);
  }
  return contained;
}

/** A row in the changed-file list. */
export interface ChangedFileRow {
  /** Repo-relative, forward-slashed. Doubles as the React key. */
  path: string;
  status: string;
  statusText: string;
  /** The `?? dir/` row this file was expanded out of, when it came from one. */
  groupPath?: string;
}

/**
 * Turn the server's status rows into one row per file that actually has a diff.
 *
 * A new directory arrives as a single `?? dir/` entry. Left alone it is a row
 * that renders nothing when clicked and makes the header under-report by
 * however many files the directory holds, so it is expanded into its members.
 * A directory with no diffs of its own (everything inside it was skipped as a
 * build artefact) keeps its original row rather than vanishing from the list.
 */
export function buildChangedFileRows(
  files: readonly FileStatus[],
  index: ReadonlyMap<string, ParsedFileDiff>
): ChangedFileRow[] {
  const rows: ChangedFileRow[] = [];
  const seen = new Set<string>();

  const push = (row: ChangedFileRow) => {
    if (seen.has(row.path)) return;
    seen.add(row.path);
    rows.push(row);
  };

  for (const file of files) {
    if (!isDirectoryRow(file.path)) {
      push({ path: file.path, status: file.status, statusText: file.statusText });
      continue;
    }

    const contained = selectDiffsForPath(index, file.path);
    if (contained.length === 0) {
      push({ path: file.path, status: file.status, statusText: file.statusText });
      continue;
    }

    for (const fileDiff of contained) {
      push({
        path: fileDiff.filePath,
        status: file.status,
        statusText: file.statusText,
        groupPath: file.path,
      });
    }
  }

  return rows;
}

/** Added and removed line counts across a set of parsed diffs. */
export function countDiffLines(diffs: readonly ParsedFileDiff[]): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const file of diffs) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'addition') additions++;
        else if (line.type === 'deletion') deletions++;
      }
    }
  }
  return { additions, deletions };
}

/**
 * Whether two status lists say the same thing.
 *
 * A poll that finds nothing new must not hand back a fresh array: that would
 * re-render the pane, rebuild every row and reset the diff scroll position
 * every three seconds for as long as the tab is open.
 */
export function isSameFileList(a: readonly FileStatus[], b: readonly FileStatus[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every(
    (file, index) =>
      file.path === b[index].path &&
      file.status === b[index].status &&
      file.statusText === b[index].statusText
  );
}

interface ChangedFilesState {
  /** Root these results describe. A reply for a root we have left is dropped. */
  root: string;
  files: FileStatus[];
  diff: string;
  hasLoaded: boolean;
  error: string | null;
}

function emptyState(root: string): ChangedFilesState {
  return { root, files: [], diff: '', hasLoaded: false, error: null };
}

export interface UseChangedFilesResult {
  files: FileStatus[];
  /** Parsed diffs keyed by repo-relative path. */
  diffIndex: Map<string, ParsedFileDiff>;
  /** No result yet for this root. */
  isLoading: boolean;
  /** A fetch is in flight over results already on screen. */
  isRefreshing: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Poll one git root for its uncommitted changes.
 *
 * `enabled` is the visibility gate and is not optional in spirit: panes are
 * hidden rather than unmounted, so six panes across three open tasks is
 * eighteen live components and an ungated interval in each of them.
 */
export function useChangedFiles(
  rootPath: string,
  { enabled }: { enabled: boolean }
): UseChangedFilesResult {
  const [state, setState] = useState<ChangedFilesState>(() => emptyState(rootPath));
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Switching feature must not leave the previous worktree's changes on screen,
  // not even for the frame before the first fetch lands.
  if (state.root !== rootPath) {
    setState(emptyState(rootPath));
  }

  const rootRef = useRef(rootPath);
  rootRef.current = rootPath;
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsRefreshing(true);

    const requestedRoot = rootPath;
    try {
      const api = getElectronAPI();
      if (!api?.git?.getDiffs) throw new Error('Git API not available');

      const result = await api.git.getDiffs(requestedRoot);
      if (rootRef.current !== requestedRoot) return;

      if (!result.success) {
        setState((previous) => ({
          ...previous,
          hasLoaded: true,
          error: result.error || 'Failed to load changes',
        }));
        return;
      }

      const files = result.files ?? [];
      const diff = result.diff ?? '';
      setState((previous) =>
        previous.root === requestedRoot &&
        previous.hasLoaded &&
        previous.error === null &&
        previous.diff === diff &&
        isSameFileList(previous.files, files)
          ? previous
          : { root: requestedRoot, files, diff, hasLoaded: true, error: null }
      );
    } catch (error) {
      if (rootRef.current !== requestedRoot) return;
      setState((previous) => ({
        ...previous,
        hasLoaded: true,
        error: error instanceof Error ? error.message : 'Failed to load changes',
      }));
    } finally {
      inFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, [rootPath]);

  useEffect(() => {
    if (!enabled) return;

    // Re-read on becoming visible: whatever is on screen is at least as old as
    // the moment the pane was hidden.
    void load();
    const timer = setInterval(() => void load(), CHANGED_FILES_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, load]);

  // Keyed on the diff string, so a poll that changed nothing re-uses the parse.
  const diffIndex = useMemo(() => buildDiffIndex(state.diff), [state.diff]);

  return {
    files: state.files,
    diffIndex,
    isLoading: !state.hasLoaded,
    isRefreshing,
    error: state.error,
    refresh: load,
  };
}
