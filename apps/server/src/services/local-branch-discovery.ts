/**
 * LocalBranchDiscovery — the authoritative list of branches a project actually
 * has, read straight from `refs/heads`.
 *
 * The sidebar used to infer its branch list from two indirect sources: the
 * branch names features carry, and the worktrees git has open. Both lie in the
 * same direction. A feature keeps its branch name long after the branch is
 * gone, so the sidebar showed branches that no longer existed; and a branch
 * with no worktree and no task — 'master' in a repo checked out on a feature
 * branch, or anything created from a terminal — never appeared at all.
 *
 * This reads the refs themselves, so a branch is listed exactly when it exists
 * and stops being listed the moment it is deleted. No fetch: everything here is
 * local, which is what makes it cheap enough to poll.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { isGitRepo } from '@dmaker/git-utils';
import { resolveRemoteDefaultBranch, resolveRemoteName } from './remote-branch-discovery.js';

const execFileAsync = promisify(execFile);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/** Reading local refs is cheap; a short leash is plenty. */
const LOCAL_READ_TIMEOUT_MS = 5000;
/** Field separator for for-each-ref output — cannot occur in a ref name. */
const REF_FIELD_SEP = '\u001f';

/** A branch that exists in this repository right now. */
export interface LocalBranchInfo {
  /** Branch name, e.g. 'master' or 'feature/login' */
  name: string;
  /** The repository's trunk */
  isDefault: boolean;
  /** Checked out in the main working copy */
  isCurrent: boolean;
  /** Checked out in some worktree (the main one counts) */
  hasWorktree: boolean;
  /** Where it is checked out, when it is */
  worktreePath?: string;
  /** ISO timestamp of the tip commit */
  lastCommitAt?: string;
  lastCommitBy?: string;
  lastCommitSubject?: string;
  /** Tracked upstream, e.g. 'origin/master' */
  upstream?: string;
  /** An upstream is configured but the remote-tracking ref has been deleted */
  upstreamGone: boolean;
}

export interface LocalBranchesForProject {
  projectPath: string;
  defaultBranch?: string;
  branches: LocalBranchInfo[];
  /**
   * Why the listing is empty or partial. A project that errors must be treated
   * as "unknown", never as "every branch was deleted".
   */
  error?: string;
}

/** git invocation with a timeout, for the discovery reads. */
async function gitRead(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    timeout: LOCAL_READ_TIMEOUT_MS,
    windowsHide: true,
  });
  return stdout;
}

/** Branch name -> the worktree it is checked out in. */
async function getWorktreePathsByBranch(projectPath: string): Promise<Map<string, string>> {
  const byBranch = new Map<string, string>();
  try {
    const output = await gitRead(['worktree', 'list', '--porcelain'], projectPath);
    let currentPath: string | undefined;

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        currentPath = line.slice('worktree '.length).trim();
      } else if (line.startsWith('branch ') && currentPath) {
        const branch = line
          .slice('branch '.length)
          .trim()
          .replace(/^refs\/heads\//, '');
        if (branch) byBranch.set(branch, currentPath);
      } else if (line === '') {
        currentPath = undefined;
      }
    }
  } catch {
    // Treat as "nothing checked out" rather than failing the whole listing.
  }
  return byBranch;
}

/**
 * The repository's trunk.
 *
 * Prefers what the remote calls its default, since that is the branch everyone
 * agrees on, but only when the repo actually has it locally. Falls back to the
 * usual names for a repo with no remote at all.
 */
async function resolveDefaultBranch(
  projectPath: string,
  localNames: Set<string>
): Promise<string | undefined> {
  try {
    const remote = await resolveRemoteName(projectPath);
    if (remote) {
      const remoteDefault = await resolveRemoteDefaultBranch(projectPath, remote);
      if (remoteDefault && localNames.has(remoteDefault)) return remoteDefault;
    }
  } catch {
    // No remote, or it could not be read — the local guesses still apply.
  }

  return ['main', 'master', 'develop', 'trunk'].find((candidate) => localNames.has(candidate));
}

/**
 * Every branch this project has, with where it is checked out and how it sits
 * against its upstream.
 *
 * Never throws: a project that has been moved, deleted or was never a repo
 * comes back with `error` set and no branches, so one bad project cannot blank
 * the sidebar for the rest.
 */
export async function discoverLocalBranches(projectPath: string): Promise<LocalBranchesForProject> {
  const result: LocalBranchesForProject = { projectPath, branches: [] };

  if (!existsSync(projectPath) || !(await isGitRepo(projectPath))) {
    return { ...result, error: 'Not a git repository' };
  }

  let raw: string;
  try {
    raw = await gitRead(
      [
        'for-each-ref',
        [
          '--format=%(refname:short)',
          '%(committerdate:iso-strict)',
          '%(authorname)',
          '%(contents:subject)',
          '%(upstream:short)',
          '%(upstream:track)',
        ].join(REF_FIELD_SEP),
        'refs/heads',
      ],
      projectPath
    );
  } catch (error) {
    return { ...result, error: getErrorMessage(error) };
  }

  const rows = raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => line.split(REF_FIELD_SEP));

  const localNames = new Set(rows.map((row) => row[0]).filter(Boolean));

  const [worktreePaths, defaultBranch] = await Promise.all([
    getWorktreePathsByBranch(projectPath),
    resolveDefaultBranch(projectPath, localNames),
  ]);
  result.defaultBranch = defaultBranch;

  // The main working copy is the first worktree git lists.
  let currentBranch = '';
  try {
    currentBranch = (await gitRead(['branch', '--show-current'], projectPath)).trim();
  } catch {
    // Detached HEAD, or unreadable — nothing is "current" then.
  }

  for (const [name, committedAt, author, subject, upstream, track] of rows) {
    if (!name) continue;

    const worktreePath = worktreePaths.get(name);

    result.branches.push({
      name,
      isDefault: name === defaultBranch,
      isCurrent: name === currentBranch,
      hasWorktree: !!worktreePath,
      worktreePath,
      lastCommitAt: committedAt || undefined,
      lastCommitBy: author || undefined,
      lastCommitSubject: subject || undefined,
      upstream: upstream || undefined,
      upstreamGone: (track ?? '').includes('gone'),
    });
  }

  // Trunk first, then whatever was touched most recently — the same order the
  // sidebar wants to render them in.
  result.branches.sort(
    (a, b) =>
      Number(b.isDefault) - Number(a.isDefault) ||
      (b.lastCommitAt ?? '').localeCompare(a.lastCommitAt ?? '') ||
      a.name.localeCompare(b.name)
  );

  return result;
}
