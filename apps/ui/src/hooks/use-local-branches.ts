import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getHttpApiClient, type LocalBranchInfo } from '@/lib/http-api-client';
import { createLogger } from '@dmaker/utils/logger';

const logger = createLogger('useLocalBranches');

/**
 * How often the sidebar re-reads each project's branches.
 *
 * This is local only — no fetch, no network — so it can run far more often than
 * remote discovery. It has to: it is what makes a branch created in a terminal
 * appear on its own, and what makes a deleted one stop being drawn.
 */
const POLL_INTERVAL_MS = 30_000;

export type LocalBranchesByProject = Record<string, LocalBranchInfo[]>;

export interface UseLocalBranchesResult {
  /** Every branch each project has, keyed by project path */
  branchesByProject: LocalBranchesByProject;
  /** Per-project read failure (moved, deleted, not a repo), keyed by path */
  errorsByProject: Record<string, string>;
  /**
   * Projects whose listing is trustworthy — a project that errored is
   * "unknown", and callers must not read its absence as "all branches gone".
   */
  knownProjects: Set<string>;
  isLoading: boolean;
  /** Re-read now, either everything or one project */
  refresh: (projectPath?: string) => Promise<void>;
}

/**
 * The live set of branches each project has.
 *
 * The sidebar used to infer its branch list from the branch names features
 * carry and the worktrees git has open. Neither survives a branch being
 * deleted, and neither notices a branch that has no task and no worktree — so
 * 'master' went missing from a repo checked out on a feature branch, while
 * long-dead feature branches stayed on screen forever. This reads the refs, so
 * the list is simply what the repository has.
 */
export function useLocalBranches(
  projectPaths: string[],
  options: { enabled?: boolean } = {}
): UseLocalBranchesResult {
  const { enabled = true } = options;
  const [branchesByProject, setBranchesByProject] = useState<LocalBranchesByProject>({});
  const [errorsByProject, setErrorsByProject] = useState<Record<string, string>>({});
  const [knownProjects, setKnownProjects] = useState<Set<string>>(() => new Set());
  const [isLoading, setIsLoading] = useState(false);

  // Stable key so the poll effect only restarts when the set of projects
  // changes, not on every render that rebuilds the array.
  const pathsKey = useMemo(
    () =>
      Array.from(new Set(projectPaths.filter(Boolean)))
        .sort()
        .join('\n'),
    [projectPaths]
  );
  const pathsKeyRef = useRef(pathsKey);
  pathsKeyRef.current = pathsKey;

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (projectPath?: string) => {
    const paths = projectPath ? [projectPath] : pathsKeyRef.current.split('\n').filter(Boolean);
    if (paths.length === 0) return;

    setIsLoading(true);
    try {
      const result = await getHttpApiClient().worktree.getLocalBranches(paths);
      if (!isMountedRef.current) return;
      if (!result.success || !result.projects) return;

      // Merge rather than replace: a single-project refresh must not wipe out
      // what is known about the others.
      setBranchesByProject((previous) => {
        const next = { ...previous };
        for (const project of result.projects ?? []) {
          if (project.error) continue; // unknown, not empty — keep the last good list
          next[project.projectPath] = project.branches;
        }
        return next;
      });

      setErrorsByProject((previous) => {
        const next = { ...previous };
        for (const project of result.projects ?? []) {
          if (project.error) next[project.projectPath] = project.error;
          else delete next[project.projectPath];
        }
        return next;
      });

      setKnownProjects((previous) => {
        const next = new Set(previous);
        for (const project of result.projects ?? []) {
          if (project.error) next.delete(project.projectPath);
          else next.add(project.projectPath);
        }
        return next;
      });
    } catch (error) {
      logger.warn('Failed to list local branches', error);
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !pathsKey) return;

    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, pathsKey, load]);

  return { branchesByProject, errorsByProject, knownProjects, isLoading, refresh: load };
}
