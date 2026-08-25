import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { discoverRemoteBranches } from '../../../src/services/remote-branch-discovery.js';

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

async function commit(repo: string, file: string, message: string): Promise<void> {
  await writeFile(path.join(repo, file), `${message}\n`, 'utf8');
  await git(['add', '.'], repo);
  await git(['commit', '-m', message], repo);
}

describe('discoverRemoteBranches', () => {
  let root: string;
  let remote: string;
  let clone: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'dmaker-remote-branches-'));
    remote = path.join(root, 'remote.git');
    clone = path.join(root, 'clone');

    // A bare "origin" built from a seed repo.
    const seed = path.join(root, 'seed');
    await git(['init', '-b', 'main', seed], root);
    await commit(seed, 'README.md', 'initial');

    await git(['init', '--bare', '-b', 'main', remote], root);
    await git(['remote', 'add', 'origin', remote], seed);
    await git(['push', '-u', 'origin', 'main'], seed);

    // Three branches: one live, one merged into main, one that gets deleted.
    for (const branch of ['feature/live', 'feature/merged', 'feature/gone']) {
      await git(['checkout', '-b', branch, 'main'], seed);
      await commit(seed, `${branch.replace(/\//g, '-')}.txt`, `work on ${branch}`);
      await git(['push', '-u', 'origin', branch], seed);
    }

    await git(['checkout', 'main'], seed);
    await git(['merge', '--no-ff', '-m', 'merge feature/merged', 'feature/merged'], seed);
    await git(['push', 'origin', 'main'], seed);

    await git(['clone', remote, clone], root);

    // Delete one branch on the remote *after* cloning, so the clone starts with
    // a stale remote-tracking ref that only --prune can clear.
    await git(['push', 'origin', '--delete', 'feature/gone'], seed);
  }, 60_000);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  });

  it('lists branches that exist on the remote but have no worktree here', async () => {
    const result = await discoverRemoteBranches(clone);

    expect(result.error).toBeUndefined();
    expect(result.remote).toBe('origin');
    expect(result.defaultBranch).toBe('main');
    expect(result.branches.map((branch) => branch.name)).toEqual(['feature/live']);

    const [live] = result.branches;
    expect(live.remoteRef).toBe('origin/feature/live');
    expect(live.hasLocalBranch).toBe(false);
    expect(live.lastCommitAt).toBeTruthy();
    expect(live.lastCommitSubject).toBe('work on feature/live');
  }, 30_000);

  it('drops branches merged into the trunk and branches deleted on the remote', async () => {
    const names = (await discoverRemoteBranches(clone)).branches.map((branch) => branch.name);

    expect(names).not.toContain('feature/merged');
    expect(names).not.toContain('feature/gone');
    expect(names).not.toContain('main');
  }, 30_000);

  it('drops a branch once it has a worktree', async () => {
    const worktree = path.join(root, 'wt-live');
    await git(
      ['worktree', 'add', '--track', '-b', 'feature/live', worktree, 'origin/feature/live'],
      clone
    );

    try {
      const names = (await discoverRemoteBranches(clone)).branches.map((branch) => branch.name);
      expect(names).not.toContain('feature/live');
    } finally {
      await git(['worktree', 'remove', '--force', worktree], clone);
      await git(['branch', '-D', 'feature/live'], clone);
    }
  }, 30_000);

  it('reports a path that is not a git repository instead of throwing', async () => {
    const result = await discoverRemoteBranches(path.join(root, 'does-not-exist'));

    expect(result.branches).toEqual([]);
    expect(result.error).toBe('Not a git repository');
  });

  it('reports a repository with no remote instead of throwing', async () => {
    const solo = path.join(root, 'solo');
    await git(['init', '-b', 'main', solo], root);
    await commit(solo, 'README.md', 'initial');

    const result = await discoverRemoteBranches(solo);

    expect(result.branches).toEqual([]);
    expect(result.error).toBe('No git remote configured');
  }, 30_000);
});
