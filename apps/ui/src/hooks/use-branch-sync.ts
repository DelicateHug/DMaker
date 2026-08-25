import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getHttpApiClient,
  type BranchSyncResult,
  type BranchSyncState,
} from '@/lib/http-api-client';
import { toast } from 'sonner';
import { createLogger } from '@dmaker/utils/logger';

const logger = createLogger('useBranchSync');

/**
 * Baseline cadence for the remote check. Each pass is a real `git fetch`, so it
 * runs on the same slow footing as remote-branch discovery rather than the
 * local ahead/behind poll.
 *
 * Nothing actually waits exactly this long — see {@link nextCheckDelayMs}.
 */
const BASE_POLL_INTERVAL_MS = 3 * 60_000;

/**
 * Each branch waits somewhere between double and triple the baseline, drawn
 * fresh after every check.
 *
 * A single shared interval meant every branch in the sidebar fetched on the
 * same tick — six branches, six simultaneous `git fetch` calls, and a visible
 * stall every three minutes. Giving each branch its own randomised delay both
 * halves how often any one branch fetches and stops any two of them staying in
 * lockstep.
 */
const MIN_INTERVAL_FACTOR = 2;
const MAX_INTERVAL_FACTOR = 3;

/** How often the scheduler looks for branches that have come due. */
const TICK_INTERVAL_MS = 1_000;

/** A fresh randomised delay in [2x, 3x] the baseline. */
export function nextCheckDelayMs(): number {
  const factor = MIN_INTERVAL_FACTOR + Math.random() * (MAX_INTERVAL_FACTOR - MIN_INTERVAL_FACTOR);
  return Math.round(BASE_POLL_INTERVAL_MS * factor);
}

/** States that should show the blinking '!' instead of a refresh icon. */
const ATTENTION_STATES: ReadonlySet<BranchSyncState> = new Set<BranchSyncState>([
  'blocked',
  'diverged',
  'conflict',
  'error',
]);

export function branchNeedsAttention(state: BranchSyncState | undefined): boolean {
  return !!state && ATTENTION_STATES.has(state);
}

/** Short label for the state, for the indicator's tooltip and popover title. */
export function branchStateLabel(state: BranchSyncState): string {
  switch (state) {
    case 'in-sync':
      return 'Up to date';
    case 'updated':
      return 'Updated from remote';
    case 'ahead':
      return 'Not pushed';
    case 'no-upstream':
      return 'No upstream';
    case 'behind':
      return 'Behind remote';
    case 'blocked':
      return 'Update blocked';
    case 'diverged':
      return 'Diverged from remote';
    case 'conflict':
      return 'Merge conflicts';
    case 'error':
      return 'Sync failed';
  }
}

/** Worktrees the caller wants watched, grouped by the project they belong to. */
export interface BranchSyncTarget {
  projectPath: string;
  worktrees: Array<{ path: string; branch: string }>;
}

/** `${projectPath} ${branch}` — branch names only collide across projects. */
export function branchSyncKey(projectPath: string, branch: string): string {
  return `${projectPath} ${branch}`;
}

/** One watched branch, flattened out of the per-project targets. */
interface FlatBranch {
  key: string;
  projectPath: string;
  worktreePath: string;
  branch: string;
}

export interface UseBranchSyncResult {
  /** Latest result per branch, keyed by `branchSyncKey` */
  resultByBranch: Record<string, BranchSyncResult>;
  /** Project-level failure (offline, no remote), keyed by project path */
  errorsByProject: Record<string, string>;
  /** Project paths with a check in flight right now */
  checkingProjects: Set<string>;
  /** Branch keys with a check in flight right now */
  checkingBranches: Set<string>;
  /** When each branch is next due a check, as epoch ms, keyed by branch */
  nextCheckAtByBranch: Record<string, number>;
  /**
   * Re-check everything, one project, or one branch. Always fast-forwards, and
   * always restarts the countdown for whatever it touched.
   */
  refresh: (projectPath?: string, branchName?: string) => Promise<void>;
  /** Run the deterministic repair on one branch; resolves to true on success */
  autoFix: (projectPath: string, worktreePath: string) => Promise<boolean>;
  /** Branch keys with a repair running */
  fixingBranches: Set<string>;
  /** Steps the last repair took, keyed by branch — shown back in the popover */
  lastFixSteps: Record<string, string[]>;
}

/**
 * Keeps the sidebar's branches honest about the remote.
 *
 * Every branch runs on its own randomised timer: it fetches when it comes due,
 * fast-forwards anything that is cleanly behind, and reports everything it will
 * not touch so the UI can put a '!' on it. The server does all the git work —
 * see branch-sync-service for the rules about what is and is not safe to do
 * automatically.
 */
export function useBranchSync(
  targets: BranchSyncTarget[],
  options: { enabled?: boolean } = {}
): UseBranchSyncResult {
  const { enabled = true } = options;

  const [resultByBranch, setResultByBranch] = useState<Record<string, BranchSyncResult>>({});
  const [errorsByProject, setErrorsByProject] = useState<Record<string, string>>({});
  const [checkingProjects, setCheckingProjects] = useState<Set<string>>(() => new Set());
  const [checkingBranches, setCheckingBranches] = useState<Set<string>>(() => new Set());
  const [nextCheckAtByBranch, setNextCheckAtByBranch] = useState<Record<string, number>>({});
  const [fixingBranches, setFixingBranches] = useState<Set<string>>(() => new Set());
  const [lastFixSteps, setLastFixSteps] = useState<Record<string, string[]>>({});

  // Stable key so the schedule effects only react when the actual set of
  // worktrees changes, not on every render that rebuilds the array.
  const targetsKey = useMemo(
    () =>
      targets
        .filter((target) => target.projectPath && target.worktrees.length > 0)
        .map(
          (target) =>
            `${target.projectPath} ${target.worktrees
              .map((worktree) => worktree.path)
              .sort()
              .join('')}`
        )
        .sort()
        .join(''),
    [targets]
  );

  // Read the current targets without making them an effect dependency.
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /** Every watched branch, flattened, optionally narrowed to one project/branch. */
  const flatten = useCallback((projectPath?: string, branchName?: string): FlatBranch[] => {
    return targetsRef.current
      .filter((target) => target.projectPath)
      .filter((target) => !projectPath || target.projectPath === projectPath)
      .flatMap((target) =>
        target.worktrees
          .filter((worktree) => worktree.path && worktree.branch)
          .filter((worktree) => !branchName || worktree.branch === branchName)
          .map((worktree) => ({
            key: branchSyncKey(target.projectPath, worktree.branch),
            projectPath: target.projectPath,
            worktreePath: worktree.path,
            branch: worktree.branch,
          }))
      );
  }, []);

  // The schedule is read on every tick and rendered as a live countdown, so it
  // lives in a ref and is mirrored into state purely so the UI re-renders.
  const scheduleRef = useRef<Record<string, number>>({});
  const writeSchedule = useCallback((next: Record<string, number>) => {
    scheduleRef.current = next;
    if (isMountedRef.current) setNextCheckAtByBranch(next);
  }, []);

  /** Push the named branches out by a fresh randomised delay. */
  const reschedule = useCallback(
    (keys: string[]) => {
      if (keys.length === 0) return;
      const now = Date.now();
      const next = { ...scheduleRef.current };
      for (const key of keys) next[key] = now + nextCheckDelayMs();
      writeSchedule(next);
    },
    [writeSchedule]
  );

  // Branches already being fetched must not be picked up again by the next
  // tick — a slow fetch would otherwise stack up behind itself.
  const inFlightRef = useRef<Set<string>>(new Set());

  const markChecking = useCallback((branches: FlatBranch[], checking: boolean) => {
    const branchKeys = branches.map((branch) => branch.key);
    const projectPaths = new Set(branches.map((branch) => branch.projectPath));

    setCheckingBranches((previous) => {
      const next = new Set(previous);
      for (const key of branchKeys) {
        if (checking) next.add(key);
        else next.delete(key);
      }
      return next;
    });

    setCheckingProjects((previous) => {
      const next = new Set(previous);
      for (const path of projectPaths) {
        if (checking) {
          next.add(path);
          continue;
        }
        // A project is only idle again once none of its branches are running.
        const stillRunning = Array.from(inFlightRef.current).some((key) =>
          key.startsWith(`${path} `)
        );
        if (!stillRunning) next.delete(path);
      }
      return next;
    });
  }, []);

  /** Check exactly these branches, then restart their countdowns. */
  const runBranches = useCallback(
    async (branches: FlatBranch[]) => {
      const pending = branches.filter((branch) => !inFlightRef.current.has(branch.key));
      if (pending.length === 0) return;

      for (const branch of pending) inFlightRef.current.add(branch.key);
      // Restart the countdown up front: a check that is running has, as far as
      // the timer is concerned, happened — so a slow fetch cannot leave the
      // branch looking permanently overdue or fire again underneath itself.
      reschedule(pending.map((branch) => branch.key));
      markChecking(pending, true);

      const byProject = new Map<string, string[]>();
      for (const branch of pending) {
        const paths = byProject.get(branch.projectPath) ?? [];
        paths.push(branch.worktreePath);
        byProject.set(branch.projectPath, paths);
      }
      const requests = Array.from(byProject.entries()).map(([projectPath, worktreePaths]) => ({
        projectPath,
        worktreePaths,
      }));

      try {
        const response = await getHttpApiClient().worktree.branchSync(requests, true);
        if (!isMountedRef.current) return;
        if (!response.success || !response.projects) return;

        setResultByBranch((previous) => {
          const next = { ...previous };
          for (const project of response.projects ?? []) {
            for (const branch of project.branches) {
              if (!branch.branch) continue;
              next[branchSyncKey(project.projectPath, branch.branch)] = branch;
            }
          }
          return next;
        });

        // A branch moving under you is worth knowing about, even though it was
        // safe. Only a real fast-forward reports `didUpdate`, and only once —
        // the next pass sees it as plain 'in-sync'.
        const updated = (response.projects ?? [])
          .flatMap((project) => project.branches)
          .filter((branch) => branch.didUpdate);

        if (updated.length === 1) {
          toast.success(`${updated[0].branch} updated from ${updated[0].upstream ?? 'remote'}`);
        } else if (updated.length > 1) {
          toast.success(`${updated.length} branches updated from their remotes`, {
            description: updated.map((branch) => branch.branch).join(', '),
          });
        }

        setErrorsByProject((previous) => {
          const next = { ...previous };
          for (const project of response.projects ?? []) {
            if (project.error) next[project.projectPath] = project.error;
            else delete next[project.projectPath];
          }
          return next;
        });
      } catch (error) {
        logger.warn('Branch sync check failed', error);
      } finally {
        for (const branch of pending) inFlightRef.current.delete(branch.key);
        if (isMountedRef.current) markChecking(pending, false);
      }
    },
    [markChecking, reschedule]
  );

  const refresh = useCallback(
    async (projectPath?: string, branchName?: string) => {
      await runBranches(flatten(projectPath, branchName));
    },
    [flatten, runBranches]
  );

  // Keep the schedule in step with the watched set: a branch that has just
  // appeared is due immediately, and one that has gone away stops counting.
  useEffect(() => {
    if (!enabled || !targetsKey) {
      if (Object.keys(scheduleRef.current).length > 0) writeSchedule({});
      return;
    }

    const now = Date.now();
    const live = flatten().map((branch) => branch.key);
    const liveKeys = new Set(live);
    const next: Record<string, number> = {};
    let changed = false;

    for (const key of liveKeys) {
      const existing = scheduleRef.current[key];
      next[key] = existing ?? now;
      if (existing === undefined) changed = true;
    }
    for (const key of Object.keys(scheduleRef.current)) {
      if (!liveKeys.has(key)) changed = true;
    }

    if (changed) writeSchedule(next);
  }, [enabled, targetsKey, flatten, writeSchedule]);

  // The scheduler itself: one cheap tick that fires only the branches that have
  // actually come due, each on its own randomised delay.
  useEffect(() => {
    if (!enabled || !targetsKey) return;

    const tick = () => {
      const now = Date.now();
      const due = flatten().filter((branch) => (scheduleRef.current[branch.key] ?? now) <= now);
      if (due.length > 0) void runBranches(due);
    };

    tick();
    const interval = setInterval(tick, TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, targetsKey, flatten, runBranches]);

  const autoFix = useCallback(
    async (projectPath: string, worktreePath: string): Promise<boolean> => {
      const target = targetsRef.current.find((entry) => entry.projectPath === projectPath);
      const branchName = target?.worktrees.find(
        (worktree) => worktree.path === worktreePath
      )?.branch;
      const key = branchName ? branchSyncKey(projectPath, branchName) : worktreePath;

      setFixingBranches((previous) => new Set(previous).add(key));

      try {
        const response = await getHttpApiClient().worktree.branchAutoFix(worktreePath);
        if (!isMountedRef.current) return response.success;

        if (response.steps) {
          setLastFixSteps((previous) => ({ ...previous, [key]: response.steps ?? [] }));
        }

        if (response.result?.branch) {
          const resultKey = branchSyncKey(projectPath, response.result.branch);
          setResultByBranch((previous) => ({
            ...previous,
            [resultKey]: response.result as BranchSyncResult,
          }));
          // The branch has just been brought level, so its countdown starts
          // again from now rather than running out moments later.
          reschedule([resultKey]);
        }

        return response.success;
      } catch (error) {
        logger.warn('Branch auto-fix failed', error);
        return false;
      } finally {
        if (isMountedRef.current) {
          setFixingBranches((previous) => {
            const next = new Set(previous);
            next.delete(key);
            return next;
          });
        }
      }
    },
    [reschedule]
  );

  return {
    resultByBranch,
    errorsByProject,
    checkingProjects,
    checkingBranches,
    nextCheckAtByBranch,
    refresh,
    autoFix,
    fixingBranches,
    lastFixSteps,
  };
}
