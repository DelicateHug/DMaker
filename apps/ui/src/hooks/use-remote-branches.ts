import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getHttpApiClient, type RemoteBranchInfo } from '@/lib/http-api-client';
import { createLogger } from '@dmaker/utils/logger';

const logger = createLogger('useRemoteBranches');

/**
 * How often the sidebar re-fetches remotes. This is a real network round trip
 * per project, so it runs far slower than the ahead/behind poll.
 */
const POLL_INTERVAL_MS = 5 * 60_000;

export type RemoteBranchesByProject = Record<string, RemoteBranchInfo[]>;

export interface UseRemoteBranchesResult {
  /** Discovered branches keyed by project path; projects with none are absent */
  branchesByProject: RemoteBranchesByProject;
  /** Per-project discovery failure (offline, no remote, auth), keyed by path */
  errorsByProject: Record<string, string>;
  isLoading: boolean;
  refresh: () => void;
}

/**
 * Discovers branches that exist on a project's remote but have no worktree
 * locally — work started on another machine, or by a teammate.
 *
 * The server does the filtering: it fetches with --prune (so branches deleted
 * on the remote disappear) and drops branches already merged into the trunk,
 * leaving only branches that are still live.
 */
export function useRemoteBranches(
  projectPaths: string[],
  options: { enabled?: boolean } = {}
): UseRemoteBranchesResult {
  const { enabled = true } = options;
  const [branchesByProject, setBranchesByProject] = useState<RemoteBranchesByProject>({});
  const [errorsByProject, setErrorsByProject] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Stable key so the effect only re-runs when the set of projects changes,
  // not on every render that rebuilds the array.
  const pathsKey = useMemo(
    () =>
      Array.from(new Set(projectPaths.filter(Boolean)))
        .sort()
        .join('\n'),
    [projectPaths]
  );

  // A fetch can outlive its poll tick; only the newest result may write state.
  const runIdRef = useRef(0);

  useEffect(() => {
    if (!enabled || !pathsKey) {
      setBranchesByProject({});
      setErrorsByProject({});
      return;
    }

    let cancelled = false;

    const load = async () => {
      const paths = pathsKey.split('\n').filter(Boolean);
      const runId = ++runIdRef.current;
      setIsLoading(true);

      try {
        const result = await getHttpApiClient().worktree.getRemoteBranches(paths);
        if (cancelled || runId !== runIdRef.current) return;
        if (!result.success || !result.projects) return;

        const nextBranches: RemoteBranchesByProject = {};
        const nextErrors: Record<string, string> = {};
        for (const project of result.projects) {
          if (project.branches.length > 0) nextBranches[project.projectPath] = project.branches;
          if (project.error) nextErrors[project.projectPath] = project.error;
        }
        setBranchesByProject(nextBranches);
        setErrorsByProject(nextErrors);
      } catch (error) {
        if (!cancelled) logger.warn('Failed to discover remote branches', error);
      } finally {
        if (!cancelled && runId === runIdRef.current) setIsLoading(false);
      }
    };

    void load();
    const interval = setInterval(load, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pathsKey, enabled, refreshCounter]);

  const refresh = useCallback(() => setRefreshCounter((count) => count + 1), []);

  return { branchesByProject, errorsByProject, isLoading, refresh };
}
