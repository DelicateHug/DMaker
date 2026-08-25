/**
 * RemoteBranchDiscovery - finds branches that live on a project's remote but
 * have no worktree locally.
 *
 * This is what lets the sidebar surface work started on another machine (or by
 * someone else) instead of it staying invisible until someone thinks to look.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { isGitRepo } from '@dmaker/git-utils';

const execFileAsync = promisify(execFile);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/** The fetch is a network round trip — do not let it wedge the sidebar poll. */
const REMOTE_FETCH_TIMEOUT_MS = 20000;
/** Reading local refs is cheap; a short leash is plenty. */
const REMOTE_READ_TIMEOUT_MS = 5000;
/** Field separator for for-each-ref output — cannot occur in a ref name. */
const REF_FIELD_SEP = '\u001f';

/** A branch that exists on the remote but has no worktree here. */
export interface RemoteBranchInfo {
  /** Branch name with the remote prefix stripped, e.g. 'feature/login' */
  name: string;
  /** Remote-tracking ref it came from, e.g. 'origin/feature/login' */
  remoteRef: string;
  /** ISO timestamp of the tip commit */
  lastCommitAt?: string;
  lastCommitBy?: string;
  lastCommitSubject?: string;
  /** A local branch of the same name already exists (just no worktree) */
  hasLocalBranch: boolean;
}

export interface RemoteBranchesForProject {
  projectPath: string;
  /** Remote the branches were read from — 'origin' unless it has none */
  remote?: string;
  defaultBranch?: string;
  branches: RemoteBranchInfo[];
  /** Why discovery was partial or empty; `branches` may still hold stale refs */
  error?: string;
}

/** git invocation with a timeout, for the discovery reads. */
async function gitRead(
  args: string[],
  cwd: string,
  timeout = REMOTE_READ_TIMEOUT_MS
): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, timeout, windowsHide: true });
  return stdout;
}

/** 'origin' when it exists, else the first remote, else null. */
export async function resolveRemoteName(projectPath: string): Promise<string | null> {
  const remotes = (await gitRead(['remote'], projectPath))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (remotes.length === 0) return null;
  return remotes.includes('origin') ? 'origin' : remotes[0];
}

/**
 * The remote's trunk. Prefers what origin/HEAD points at; falls back to the
 * usual names when the symref was never set up (a common state for clones made
 * with --single-branch, or for older git).
 */
export async function resolveRemoteDefaultBranch(
  projectPath: string,
  remote: string
): Promise<string | undefined> {
  try {
    const ref = (
      await gitRead(['symbolic-ref', '--quiet', `refs/remotes/${remote}/HEAD`], projectPath)
    ).trim();
    if (ref.startsWith(`refs/remotes/${remote}/`)) {
      return ref.slice(`refs/remotes/${remote}/`.length);
    }
  } catch {
    // origin/HEAD not set — fall through to the guesses.
  }

  for (const candidate of ['main', 'master', 'develop']) {
    try {
      await gitRead(
        ['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${candidate}`],
        projectPath
      );
      return candidate;
    } catch {
      // Not this one.
    }
  }
  return undefined;
}

/** Branches checked out in a worktree — those already have a home. */
async function getWorktreeBranches(projectPath: string): Promise<Set<string>> {
  const branches = new Set<string>();
  try {
    const output = await gitRead(['worktree', 'list', '--porcelain'], projectPath);
    for (const line of output.split('\n')) {
      if (!line.startsWith('branch ')) continue;
      branches.add(
        line
          .slice('branch '.length)
          .trim()
          .replace(/^refs\/heads\//, '')
      );
    }
  } catch {
    // Treat as "nothing checked out" rather than failing discovery.
  }
  return branches;
}

async function getLocalBranches(projectPath: string): Promise<Set<string>> {
  try {
    const output = await gitRead(
      ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
      projectPath
    );
    return new Set(
      output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

/**
 * Remote branches already merged into the trunk. Merged means the work landed,
 * so the branch is history — it should not be offered as something to pick up.
 */
async function getMergedRemoteBranches(
  projectPath: string,
  remote: string,
  defaultBranch: string | undefined
): Promise<Set<string>> {
  if (!defaultBranch) return new Set();
  try {
    const output = await gitRead(
      [
        'for-each-ref',
        '--format=%(refname:short)',
        '--merged',
        `refs/remotes/${remote}/${defaultBranch}`,
        `refs/remotes/${remote}`,
      ],
      projectPath
    );
    return new Set(
      output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

/**
 * Fetch, then list the remote's live branches that have no worktree locally.
 *
 * `--prune` is what makes branches deleted on the remote drop out of the
 * result, and the merged-into-trunk filter is what keeps landed work out. What
 * survives is branches still in flight somewhere else.
 *
 * Never throws: a project that is offline, unauthenticated or not a repo comes
 * back with `error` set, so one bad project cannot blank the whole sidebar.
 */
export async function discoverRemoteBranches(
  projectPath: string
): Promise<RemoteBranchesForProject> {
  const result: RemoteBranchesForProject = { projectPath, branches: [] };

  if (!existsSync(projectPath) || !(await isGitRepo(projectPath))) {
    return { ...result, error: 'Not a git repository' };
  }

  let remote: string | null;
  try {
    remote = await resolveRemoteName(projectPath);
  } catch (error) {
    return { ...result, error: getErrorMessage(error) };
  }
  if (!remote) return { ...result, error: 'No git remote configured' };
  result.remote = remote;

  try {
    await execFileAsync('git', ['fetch', '--prune', '--quiet', remote], {
      cwd: projectPath,
      timeout: REMOTE_FETCH_TIMEOUT_MS,
      windowsHide: true,
      // A background poll must never sit on a credential prompt: fail fast and
      // report it instead of hanging until the timeout fires.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  } catch (error) {
    // Offline, or credentials missing. Report it, but still list the refs we
    // already have rather than showing the user nothing.
    result.error = `Fetch failed: ${getErrorMessage(error)}`;
  }

  const defaultBranch = await resolveRemoteDefaultBranch(projectPath, remote);
  result.defaultBranch = defaultBranch;

  const [merged, worktreeBranches, localBranches] = await Promise.all([
    getMergedRemoteBranches(projectPath, remote, defaultBranch),
    getWorktreeBranches(projectPath),
    getLocalBranches(projectPath),
  ]);

  let raw: string;
  try {
    raw = await gitRead(
      [
        'for-each-ref',
        `--format=%(refname:short)${REF_FIELD_SEP}%(committerdate:iso-strict)${REF_FIELD_SEP}%(authorname)${REF_FIELD_SEP}%(contents:subject)`,
        `refs/remotes/${remote}`,
      ],
      projectPath
    );
  } catch (error) {
    return { ...result, error: result.error ?? getErrorMessage(error) };
  }

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;

    const [shortRef, committedAt, author, subject] = line.split(REF_FIELD_SEP);
    if (!shortRef) continue;

    const name = shortRef.slice(remote.length + 1);
    if (!name) continue;
    if (name === 'HEAD') continue; // origin/HEAD is a symref, not a branch
    if (name === defaultBranch) continue; // the trunk is never "missing"
    if (merged.has(shortRef)) continue; // landed work
    if (worktreeBranches.has(name)) continue; // already checked out here

    result.branches.push({
      name,
      remoteRef: shortRef,
      lastCommitAt: committedAt || undefined,
      lastCommitBy: author || undefined,
      lastCommitSubject: subject || undefined,
      hasLocalBranch: localBranches.has(name),
    });
  }

  // Most recently touched first — that is the one you are likely looking for.
  result.branches.sort(
    (a, b) =>
      (b.lastCommitAt ?? '').localeCompare(a.lastCommitAt ?? '') || a.name.localeCompare(b.name)
  );

  return result;
}
