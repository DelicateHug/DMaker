/**
 * BranchSyncService - keeps the sidebar's branches honest about the remote.
 *
 * The sidebar already shows ahead/behind counts, but those are read from
 * whatever the local refs happen to know — which goes stale the moment someone
 * else pushes. This service does the round trip: fetch the remote, work out
 * what each worktree's branch is actually doing relative to its upstream, and
 * (when it is unambiguously safe) fast-forward it.
 *
 * Two deliberate boundaries:
 *
 * - The automatic pass only ever fast-forwards a clean worktree. It will not
 *   stash, rebase or merge behind your back — an agent may be mid-run in that
 *   checkout, and rewriting its history underneath it is how you lose work.
 * - Anything the automatic pass will not touch is *reported*, not fixed, and
 *   the UI decides whether to offer the deterministic repair (`autoFixBranch`)
 *   or hand the branch to an agent.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { createLogger } from '@dmaker/utils';
import { resolveRemoteName } from './remote-branch-discovery.js';

const execFileAsync = promisify(execFile);
const logger = createLogger('BranchSync');

/** Talking to the remote — slow, and must never wedge the sidebar poll. */
const FETCH_TIMEOUT_MS = 20000;
/** Reading local refs and status. Cheap. */
const READ_TIMEOUT_MS = 5000;
/** Merges, rebases and stashes touch the working tree, so they get longer. */
const WRITE_TIMEOUT_MS = 30000;

/** Stash label, so a stash we created is recognisable if a pop goes wrong. */
const STASH_LABEL = 'dmaker-branch-autofix';

/**
 * What a branch is doing relative to its upstream.
 *
 * Ordered roughly by how much it wants from you: the first four are fine, the
 * last four are what turns the sidebar's refresh icon into a '!'.
 */
export type BranchSyncState =
  /** Level with the upstream — nothing to do. */
  | 'in-sync'
  /** Was behind, and this pass fast-forwarded it. */
  | 'updated'
  /** Local commits not yet pushed. Normal, not a problem. */
  | 'ahead'
  /** No upstream configured, so there is nothing to compare against. */
  | 'no-upstream'
  /** Behind, but left alone (check-only pass, or the fast-forward failed). */
  | 'behind'
  /** Behind with uncommitted changes in the way of a fast-forward. */
  | 'blocked'
  /** Commits on both sides — needs a rebase or merge, not a fast-forward. */
  | 'diverged'
  /** Unmerged paths sitting in the worktree right now. */
  | 'conflict'
  /** Git itself failed (corrupt repo, missing worktree, permissions). */
  | 'error';

/** States that should surface the blinking '!' rather than a refresh icon. */
const ATTENTION_STATES: ReadonlySet<BranchSyncState> = new Set<BranchSyncState>([
  'blocked',
  'diverged',
  'conflict',
  'error',
]);

export function branchNeedsAttention(state: BranchSyncState): boolean {
  return ATTENTION_STATES.has(state);
}

export interface BranchSyncResult {
  worktreePath: string;
  branch: string;
  /** e.g. 'origin/feature/login'; absent when the branch tracks nothing */
  upstream?: string;
  ahead: number;
  behind: number;
  dirtyCount: number;
  /** Paths with unmerged entries — non-empty only in the 'conflict' state */
  conflictedFiles: string[];
  state: BranchSyncState;
  /** Why it is in this state, or what git said when it refused */
  message?: string;
  /**
   * A deterministic git repair exists for this state (stash / fast-forward /
   * rebase). False for real conflicts, which need a judgement call.
   */
  canAutoFix: boolean;
  /** True when this pass moved the branch forward. */
  didUpdate: boolean;
}

export interface ProjectBranchSync {
  projectPath: string;
  /** Remote that was fetched — absent when the project has none */
  remote?: string;
  /** Whether the fetch actually ran and succeeded */
  fetched: boolean;
  /** Project-level failure (offline, not a repo, auth) */
  error?: string;
  branches: BranchSyncResult[];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // execFile rejections carry git's stderr, which is the useful half.
    const stderr = (error as { stderr?: string }).stderr;
    const detail = typeof stderr === 'string' ? stderr.trim() : '';
    if (detail) return detail;
    return error.message;
  }
  return 'Unknown error';
}

async function git(args: string[], cwd: string, timeout = READ_TIMEOUT_MS): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, timeout, windowsHide: true });
  return stdout;
}

/** Runs git and reports failure rather than throwing. */
async function tryGit(
  args: string[],
  cwd: string,
  timeout = READ_TIMEOUT_MS
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  try {
    return { ok: true, stdout: await git(args, cwd, timeout) };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Reading state
// ---------------------------------------------------------------------------

/**
 * Reads a worktree's position relative to its upstream. Local reads only —
 * the caller is responsible for having fetched first.
 */
export async function readBranchSync(worktreePath: string): Promise<BranchSyncResult> {
  const result: BranchSyncResult = {
    worktreePath,
    branch: '',
    ahead: 0,
    behind: 0,
    dirtyCount: 0,
    conflictedFiles: [],
    state: 'error',
    canAutoFix: false,
    didUpdate: false,
  };

  // A worktree can be deleted out from under us between poll ticks.
  if (!existsSync(worktreePath)) {
    result.message = 'Worktree no longer exists on disk';
    return result;
  }

  const branch = await tryGit(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);
  if (!branch.ok) {
    result.message = branch.error;
    return result;
  }
  result.branch = branch.stdout.trim();

  // Detached HEAD has no upstream and no meaningful sync story.
  if (result.branch === 'HEAD') {
    result.state = 'no-upstream';
    result.message = 'Detached HEAD — not on a branch';
    return result;
  }

  // Unmerged paths outrank everything else: whatever else is true, the
  // worktree is mid-conflict and nothing automatic should touch it.
  const unmerged = await tryGit(
    ['diff', '--name-only', '--diff-filter=U', '--relative'],
    worktreePath
  );
  if (unmerged.ok) {
    result.conflictedFiles = unmerged.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const status = await tryGit(['status', '--porcelain'], worktreePath);
  if (status.ok) {
    result.dirtyCount = status.stdout.split('\n').filter((line) => line.trim()).length;
  }

  const upstream = await tryGit(
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    worktreePath
  );
  if (upstream.ok) result.upstream = upstream.stdout.trim() || undefined;

  if (result.conflictedFiles.length > 0) {
    result.state = 'conflict';
    result.message = `${result.conflictedFiles.length} file(s) have unresolved merge conflicts`;
    return result;
  }

  if (!result.upstream) {
    result.state = 'no-upstream';
    result.message = 'Branch does not track a remote branch';
    return result;
  }

  const counts = await tryGit(
    ['rev-list', '--left-right', '--count', `${result.upstream}...HEAD`],
    worktreePath
  );
  if (!counts.ok) {
    result.message = counts.error;
    return result;
  }
  const [behind, ahead] = counts.stdout.trim().split(/\s+/).map(Number);
  result.behind = Number.isFinite(behind) ? behind : 0;
  result.ahead = Number.isFinite(ahead) ? ahead : 0;

  if (result.behind > 0 && result.ahead > 0) {
    result.state = 'diverged';
    result.message = `${result.ahead} local commit(s) and ${result.behind} remote commit(s) have to be reconciled`;
    result.canAutoFix = true;
    return result;
  }

  if (result.behind > 0) {
    if (result.dirtyCount > 0) {
      result.state = 'blocked';
      result.message = `${result.behind} commit(s) behind, but ${result.dirtyCount} uncommitted change(s) are in the way`;
    } else {
      result.state = 'behind';
      result.message = `${result.behind} commit(s) behind ${result.upstream}`;
    }
    result.canAutoFix = true;
    return result;
  }

  result.state = result.ahead > 0 ? 'ahead' : 'in-sync';
  result.message =
    result.ahead > 0 ? `${result.ahead} commit(s) not pushed yet` : `Level with ${result.upstream}`;
  return result;
}

// ---------------------------------------------------------------------------
// The automatic pass
// ---------------------------------------------------------------------------

/**
 * Fast-forwards a branch that is cleanly behind. Anything else is refused —
 * see the note at the top of the file about not rewriting under a running
 * agent.
 */
async function fastForwardIfSafe(result: BranchSyncResult): Promise<BranchSyncResult> {
  if (result.state !== 'behind' || !result.upstream) return result;

  const merge = await tryGit(
    ['merge', '--ff-only', result.upstream],
    result.worktreePath,
    WRITE_TIMEOUT_MS
  );

  if (!merge.ok) {
    // Refusing to fast-forward is not a crash — report and move on.
    return {
      ...result,
      state: 'blocked',
      message: merge.error,
      canAutoFix: true,
    };
  }

  const pulled = result.behind;
  return {
    ...result,
    ahead: 0,
    behind: 0,
    state: 'updated',
    message: `Fast-forwarded ${pulled} commit(s) from ${result.upstream}`,
    canAutoFix: false,
    didUpdate: true,
  };
}

/**
 * Fetches a project's remote, then reports (and optionally fast-forwards)
 * every worktree passed in.
 *
 * One fetch serves every worktree in the project — they share an object store,
 * so fetching per worktree would be the same network call N times over.
 */
export async function syncProjectBranches(options: {
  projectPath: string;
  worktreePaths: string[];
  /** Fast-forward clean branches that are behind. Off = report only. */
  autoUpdate?: boolean;
}): Promise<ProjectBranchSync> {
  const { projectPath, worktreePaths, autoUpdate = false } = options;
  const sync: ProjectBranchSync = { projectPath, fetched: false, branches: [] };

  if (!existsSync(projectPath)) {
    sync.error = 'Project directory no longer exists';
    return sync;
  }

  try {
    const remote = await resolveRemoteName(projectPath);
    if (!remote) {
      sync.error = 'No git remote configured';
    } else {
      sync.remote = remote;
      const fetched = await tryGit(
        ['fetch', '--prune', '--quiet', remote],
        projectPath,
        FETCH_TIMEOUT_MS
      );
      // A failed fetch (offline, auth) still leaves the local refs readable,
      // so carry on and report against what we already know.
      if (fetched.ok) sync.fetched = true;
      else sync.error = fetched.error;
    }
  } catch (error) {
    sync.error = getErrorMessage(error);
  }

  sync.branches = await Promise.all(
    worktreePaths.map(async (worktreePath) => {
      const read = await readBranchSync(worktreePath);
      return autoUpdate ? fastForwardIfSafe(read) : read;
    })
  );

  const moved = sync.branches.filter((branch) => branch.didUpdate);
  if (moved.length > 0) {
    logger.info(
      `Fast-forwarded ${moved.length} branch(es) in ${projectPath}: ${moved
        .map((branch) => branch.branch)
        .join(', ')}`
    );
  }

  return sync;
}

// ---------------------------------------------------------------------------
// The deterministic repair
// ---------------------------------------------------------------------------

/**
 * The explicit "Auto fix" the user asks for from the sidebar.
 *
 * Goes further than the automatic pass — it will stash uncommitted work and
 * rebase a diverged branch — because the user asked for it on this branch,
 * right now. It still refuses a branch that is already conflicted: resolving
 * those is a judgement call, which is what the AI task is for.
 *
 * If the rebase fails it is aborted and the stash restored, so a failed repair
 * leaves the worktree exactly as it found it.
 */
export async function autoFixBranch(worktreePath: string): Promise<{
  success: boolean;
  result: BranchSyncResult;
  /** What was actually done, in order — shown back to the user */
  steps: string[];
  error?: string;
}> {
  const steps: string[] = [];
  let current = await readBranchSync(worktreePath);

  if (current.state === 'conflict') {
    return {
      success: false,
      result: current,
      steps,
      error: 'This branch has unresolved conflicts — those need a human or an agent, not a retry.',
    };
  }

  if (!current.upstream) {
    return {
      success: false,
      result: current,
      steps,
      error: 'Branch tracks no remote branch, so there is nothing to sync it with.',
    };
  }

  if (current.state === 'in-sync' || current.state === 'ahead' || current.state === 'updated') {
    return { success: true, result: current, steps: ['Already up to date'] };
  }

  const upstream = current.upstream;

  // Refresh the remote first — the state we are repairing may be minutes old.
  const remote = upstream.includes('/') ? upstream.split('/')[0] : undefined;
  if (remote) {
    const fetched = await tryGit(
      ['fetch', '--prune', '--quiet', remote],
      worktreePath,
      FETCH_TIMEOUT_MS
    );
    steps.push(fetched.ok ? `Fetched ${remote}` : `Fetch failed: ${fetched.error}`);
    current = await readBranchSync(worktreePath);
    if (current.state === 'in-sync' || current.state === 'ahead') {
      return { success: true, result: current, steps };
    }
  }

  // Get the working tree out of the way, remembering whether we did so —
  // popping a stash we did not push would restore someone else's work.
  let stashed = false;
  if (current.dirtyCount > 0) {
    const stash = await tryGit(
      ['stash', 'push', '--include-untracked', '--message', STASH_LABEL],
      worktreePath,
      WRITE_TIMEOUT_MS
    );
    if (!stash.ok) {
      return {
        success: false,
        result: current,
        steps,
        error: `Could not stash local changes: ${stash.error}`,
      };
    }
    stashed = true;
    steps.push(`Stashed ${current.dirtyCount} uncommitted change(s)`);
  }

  const restoreStash = async (): Promise<boolean> => {
    if (!stashed) return true;
    const pop = await tryGit(['stash', 'pop'], worktreePath, WRITE_TIMEOUT_MS);
    // A pop that hits a conflict leaves the stash entry in place, so the work
    // is still recoverable even though the worktree now needs resolving.
    steps.push(
      pop.ok
        ? 'Restored stashed changes'
        : `Could not restore stash cleanly — it is still saved as \`${STASH_LABEL}\`: ${pop.error}`
    );
    return pop.ok;
  };

  // Diverged needs a rebase; behind is a plain fast-forward.
  const advance =
    current.ahead > 0
      ? await tryGit(['rebase', upstream], worktreePath, WRITE_TIMEOUT_MS)
      : await tryGit(['merge', '--ff-only', upstream], worktreePath, WRITE_TIMEOUT_MS);

  if (!advance.ok) {
    if (current.ahead > 0) {
      // Leave no half-finished rebase behind.
      await tryGit(['rebase', '--abort'], worktreePath, WRITE_TIMEOUT_MS);
      steps.push('Rebase failed — aborted, worktree left untouched');
    } else {
      steps.push('Fast-forward failed');
    }
    await restoreStash();

    const after = await readBranchSync(worktreePath);
    return {
      success: false,
      result: after,
      steps,
      error: advance.error,
    };
  }

  steps.push(current.ahead > 0 ? `Rebased onto ${upstream}` : `Fast-forwarded to ${upstream}`);

  const popped = await restoreStash();
  const after = await readBranchSync(worktreePath);
  const success = popped && after.state !== 'conflict';

  return {
    success,
    result: after,
    steps,
    error: success
      ? undefined
      : `The branch was brought up to date, but your stashed changes conflict with the incoming commits. Nothing is lost — the stash is still saved as \`${STASH_LABEL}\` — but resolving it is a judgement call.`,
  };
}
