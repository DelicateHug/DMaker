import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import {
  syncProjectBranches,
  readBranchSync,
  autoFixBranch,
  branchNeedsAttention,
} from '../../../src/services/branch-sync-service.js';

const execFileAsync = promisify(execFile);

/** Deterministic identity + no signing, so the fixture builds on any machine. */
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: path.join(tmpdir(), 'dmaker-nonexistent-gitconfig'),
  GIT_CONFIG_SYSTEM: path.join(tmpdir(), 'dmaker-nonexistent-gitconfig'),
};

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env: GIT_ENV });
  return stdout;
}

/** Runs git and swallows failure — for the commands meant to conflict. */
async function gitAllowFail(args: string[], cwd: string): Promise<void> {
  try {
    await git(args, cwd);
  } catch {
    // Expected for the conflict fixture.
  }
}

async function commit(repo: string, file: string, body: string, message: string): Promise<void> {
  await writeFile(path.join(repo, file), `${body}\n`, 'utf8');
  await git(['add', '.'], repo);
  await git(['commit', '-m', message], repo);
}

/**
 * These tests drive real git rather than a mock: the whole value of the
 * service is that it reads git's actual answers, and a mocked `execFile`
 * would only ever confirm what we already believed.
 */
describe('branch-sync-service', () => {
  let root: string;
  let remote: string;
  let seed: string;
  let clone: string;
  let dirtyTree: string;
  let divergedTree: string;
  let conflictTree: string;
  let stashConflictTree: string;
  let untrackedTree: string;

  const FEATURES = ['feature/dirty', 'feature/diverged', 'feature/conflict', 'feature/stash'];

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'dmaker-branch-sync-'));
    remote = path.join(root, 'remote.git');
    seed = path.join(root, 'seed');
    clone = path.join(root, 'clone');

    // A bare "origin", seeded from a scratch repo that also stands in for the
    // teammate who keeps pushing while you are not looking.
    await git(['init', '-b', 'main', seed], root);
    await commit(seed, 'README.md', 'initial', 'initial');

    await git(['init', '--bare', '-b', 'main', remote], root);
    await git(['remote', 'add', 'origin', remote], seed);
    await git(['push', '-u', 'origin', 'main'], seed);

    for (const branch of FEATURES) {
      await git(['checkout', '-b', branch, 'main'], seed);
      await commit(seed, 'shared.txt', `base for ${branch}`, `start ${branch}`);
      await git(['push', '-u', 'origin', branch], seed);
    }
    await git(['checkout', 'main'], seed);

    // The project itself, with a worktree per feature branch. Real worktrees,
    // because they share an object store — which is exactly why the service
    // fetches once per project rather than once per branch.
    await git(['clone', remote, clone], root);
    await git(['config', 'user.name', 'Test'], clone);
    await git(['config', 'user.email', 'test@example.com'], clone);

    dirtyTree = path.join(root, 'wt-dirty');
    divergedTree = path.join(root, 'wt-diverged');
    conflictTree = path.join(root, 'wt-conflict');
    stashConflictTree = path.join(root, 'wt-stash');
    untrackedTree = path.join(root, 'wt-untracked');

    await git(
      ['worktree', 'add', '--track', '-b', 'feature/dirty', dirtyTree, 'origin/feature/dirty'],
      clone
    );
    await git(
      [
        'worktree',
        'add',
        '--track',
        '-b',
        'feature/diverged',
        divergedTree,
        'origin/feature/diverged',
      ],
      clone
    );
    await git(
      [
        'worktree',
        'add',
        '--track',
        '-b',
        'feature/conflict',
        conflictTree,
        'origin/feature/conflict',
      ],
      clone
    );
    await git(
      [
        'worktree',
        'add',
        '--track',
        '-b',
        'feature/stash',
        stashConflictTree,
        'origin/feature/stash',
      ],
      clone
    );
    // A branch that exists only here — nothing to compare it against.
    await git(['worktree', 'add', '-b', 'feature/local-only', untrackedTree, 'main'], clone);

    // Now the teammate pushes to every branch, putting all of them behind.
    for (const branch of ['main', ...FEATURES]) {
      await git(['checkout', branch], seed);
      await commit(seed, 'shared.txt', `remote work on ${branch}`, `remote commit on ${branch}`);
      await git(['push', 'origin', branch], seed);
    }

    // feature/dirty: uncommitted work standing in the way of the update, but
    // in a file the remote never touched — so stashing it is recoverable.
    await writeFile(path.join(dirtyTree, 'notes.txt'), 'my uncommitted note\n', 'utf8');

    // feature/stash: uncommitted work on the very file the remote changed, so
    // the stash cannot be popped back cleanly once the branch moves forward.
    await writeFile(path.join(stashConflictTree, 'shared.txt'), 'my uncommitted edit\n', 'utf8');

    // feature/diverged: a local commit on a file the remote did not touch, so
    // the rebase in autoFixBranch has a clean run at it.
    await commit(divergedTree, 'local-only.txt', 'local work', 'local commit');

    // feature/conflict: a local commit on the same file the remote changed,
    // then a merge left half-finished so unmerged paths are actually present.
    await commit(conflictTree, 'shared.txt', 'my conflicting edit', 'conflicting local commit');
    await git(['fetch', 'origin'], conflictTree);
    await gitAllowFail(['merge', 'origin/feature/conflict'], conflictTree);
  }, 60_000);

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  describe('readBranchSync', () => {
    it('reports a branch with no upstream rather than guessing one', async () => {
      const result = await readBranchSync(untrackedTree);

      expect(result.branch).toBe('feature/local-only');
      expect(result.state).toBe('no-upstream');
      expect(result.upstream).toBeUndefined();
      expect(result.canAutoFix).toBe(false);
    });

    it('reports a missing worktree instead of throwing', async () => {
      const result = await readBranchSync(path.join(root, 'does-not-exist'));

      expect(result.state).toBe('error');
      expect(result.message).toContain('no longer exists');
    });

    it('surfaces unresolved conflicts above everything else', async () => {
      const result = await readBranchSync(conflictTree);

      expect(result.state).toBe('conflict');
      expect(result.conflictedFiles).toContain('shared.txt');
      // Conflicts are the one thing the deterministic repair must refuse.
      expect(result.canAutoFix).toBe(false);
      expect(branchNeedsAttention(result.state)).toBe(true);
    });
  });

  describe('syncProjectBranches', () => {
    it('fast-forwards only the branch that is cleanly behind', async () => {
      const sync = await syncProjectBranches({
        projectPath: clone,
        worktreePaths: [clone, dirtyTree, divergedTree, conflictTree],
        autoUpdate: true,
      });

      expect(sync.fetched).toBe(true);
      expect(sync.remote).toBe('origin');
      expect(sync.error).toBeUndefined();

      const byBranch = new Map(sync.branches.map((branch) => [branch.branch, branch]));

      // main was clean and behind, so it moved.
      const main = byBranch.get('main')!;
      expect(main.state).toBe('updated');
      expect(main.didUpdate).toBe(true);
      expect(main.behind).toBe(0);

      // Uncommitted work must never be walked over by the automatic pass.
      const dirty = byBranch.get('feature/dirty')!;
      expect(dirty.state).toBe('blocked');
      expect(dirty.didUpdate).toBe(false);
      expect(dirty.dirtyCount).toBeGreaterThan(0);
      expect(dirty.canAutoFix).toBe(true);

      // Commits on both sides need a rebase, which is not automatic either.
      const diverged = byBranch.get('feature/diverged')!;
      expect(diverged.state).toBe('diverged');
      expect(diverged.didUpdate).toBe(false);
      expect(diverged.ahead).toBeGreaterThan(0);
      expect(diverged.behind).toBeGreaterThan(0);
      expect(diverged.canAutoFix).toBe(true);

      const conflict = byBranch.get('feature/conflict')!;
      expect(conflict.state).toBe('conflict');
      expect(conflict.didUpdate).toBe(false);
    });

    it('leaves branches alone when autoUpdate is off', async () => {
      // main was already fast-forwarded above, so use a fresh clone to get a
      // branch that is genuinely behind again.
      const observer = path.join(root, 'observer');
      await git(['clone', remote, observer], root);
      await git(['config', 'user.name', 'Test'], observer);
      await git(['config', 'user.email', 'test@example.com'], observer);
      await git(['checkout', 'main'], seed);
      await commit(seed, 'shared.txt', 'yet more remote work', 'another remote commit');
      await git(['push', 'origin', 'main'], seed);

      const sync = await syncProjectBranches({
        projectPath: observer,
        worktreePaths: [observer],
        autoUpdate: false,
      });

      const main = sync.branches[0];
      expect(main.state).toBe('behind');
      expect(main.behind).toBeGreaterThan(0);
      expect(main.didUpdate).toBe(false);
      // 'behind' is a normal, fixable state — it must not raise the alarm.
      expect(branchNeedsAttention(main.state)).toBe(false);
    }, 30_000);

    it('reports a project with no remote without failing the batch', async () => {
      const lonely = path.join(root, 'lonely');
      await git(['init', '-b', 'main', lonely], root);
      await git(['config', 'user.name', 'Test'], lonely);
      await git(['config', 'user.email', 'test@example.com'], lonely);
      await commit(lonely, 'README.md', 'alone', 'initial');

      const sync = await syncProjectBranches({
        projectPath: lonely,
        worktreePaths: [lonely],
        autoUpdate: true,
      });

      expect(sync.error).toContain('No git remote');
      expect(sync.fetched).toBe(false);
      expect(sync.branches[0].state).toBe('no-upstream');
    });
  });

  describe('autoFixBranch', () => {
    it('refuses a conflicted branch and leaves it exactly as it found it', async () => {
      const before = await readBranchSync(conflictTree);
      const outcome = await autoFixBranch(conflictTree);

      expect(outcome.success).toBe(false);
      expect(outcome.error).toContain('unresolved conflicts');
      expect(outcome.steps).toHaveLength(0);

      const after = await readBranchSync(conflictTree);
      expect(after.state).toBe('conflict');
      expect(after.conflictedFiles).toEqual(before.conflictedFiles);
    });

    it('stashes, fast-forwards and restores the uncommitted work', async () => {
      const outcome = await autoFixBranch(dirtyTree);

      expect(outcome.success).toBe(true);
      expect(outcome.steps.join(' ')).toMatch(/Stashed/);
      expect(outcome.steps.join(' ')).toMatch(/Restored/);

      // Level with the remote again, with the local edit still sitting there.
      expect(outcome.result.behind).toBe(0);
      expect(outcome.result.dirtyCount).toBeGreaterThan(0);
      expect(branchNeedsAttention(outcome.result.state)).toBe(false);
    }, 30_000);

    it('keeps the stash and reports honestly when it cannot be popped back', async () => {
      const outcome = await autoFixBranch(stashConflictTree);

      // The branch itself did move — it is the user's own edit that now needs
      // reconciling, and pretending otherwise would be the worst outcome.
      expect(outcome.success).toBe(false);
      expect(outcome.error).toContain('stash is still saved');
      expect(outcome.steps.join(' ')).toMatch(/Stashed/);
      expect(outcome.result.state).toBe('conflict');

      // Nothing was thrown away: the stash entry survives for recovery.
      const stashes = await git(['stash', 'list'], stashConflictTree);
      expect(stashes).toContain('dmaker-branch-autofix');
    }, 30_000);

    it('rebases a diverged branch onto its upstream', async () => {
      const outcome = await autoFixBranch(divergedTree);

      expect(outcome.success).toBe(true);
      expect(outcome.steps.join(' ')).toMatch(/Rebased/);

      // The local commit survives, now sitting on top of the remote's.
      expect(outcome.result.behind).toBe(0);
      expect(outcome.result.ahead).toBe(1);
      expect(outcome.result.state).toBe('ahead');
    }, 30_000);

    it('says there is nothing to do rather than churning', async () => {
      const outcome = await autoFixBranch(untrackedTree);

      expect(outcome.success).toBe(false);
      expect(outcome.error).toContain('tracks no remote branch');
    });
  });
});
