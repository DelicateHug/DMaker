import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { discoverLocalBranches } from '../../../src/services/local-branch-discovery.js';

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

describe('discoverLocalBranches', () => {
  let root: string;
  let repo: string;
  let worktree: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'dmaker-local-branches-'));
    repo = path.join(root, 'repo');
    worktree = path.join(root, 'wt-feature');

    await git(['init', '-b', 'master', repo], root);
    await commit(repo, 'README.md', 'initial');

    // A second branch, checked out in a worktree — which leaves the main
    // working copy sitting on a branch that is *not* the trunk. That is the
    // shape the sidebar used to lose 'master' in.
    await git(['branch', 'feature/worktree'], repo);
    await git(['worktree', 'add', worktree, 'feature/worktree'], repo);
    await commit(worktree, 'feature.txt', 'work in the worktree');

    // A branch with neither a worktree nor any task pointing at it.
    await git(['branch', 'feature/idle'], repo);

    // ...and put the main working copy on something other than the trunk.
    await git(['checkout', '-b', 'feature/current'], repo);
    await commit(repo, 'current.txt', 'work on the checked-out branch');
  }, 60_000);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  });

  it('lists every branch, including the trunk nothing is checked out on', async () => {
    const result = await discoverLocalBranches(repo);

    expect(result.error).toBeUndefined();
    expect(result.branches.map((branch) => branch.name).sort()).toEqual([
      'feature/current',
      'feature/idle',
      'feature/worktree',
      'master',
    ]);
  }, 30_000);

  it('identifies the trunk even when it is not checked out anywhere', async () => {
    const result = await discoverLocalBranches(repo);
    const master = result.branches.find((branch) => branch.name === 'master');

    expect(result.defaultBranch).toBe('master');
    expect(master?.isDefault).toBe(true);
    expect(master?.isCurrent).toBe(false);
    expect(master?.hasWorktree).toBe(false);
    // The trunk leads the list, so the sidebar can render it first.
    expect(result.branches[0]?.name).toBe('master');
  }, 30_000);

  it('reports which branch the main working copy is on', async () => {
    const result = await discoverLocalBranches(repo);
    const current = result.branches.find((branch) => branch.name === 'feature/current');

    expect(current?.isCurrent).toBe(true);
    expect(current?.hasWorktree).toBe(true);
    expect(current?.worktreePath).toBeTruthy();
    expect(result.branches.filter((branch) => branch.isCurrent)).toHaveLength(1);
  }, 30_000);

  it('points a branch at the worktree it is checked out in', async () => {
    const result = await discoverLocalBranches(repo);
    const checked = result.branches.find((branch) => branch.name === 'feature/worktree');
    const idle = result.branches.find((branch) => branch.name === 'feature/idle');

    expect(checked?.hasWorktree).toBe(true);
    // Compared by leaf, not in full: on Windows the temp root comes back as an
    // 8.3 short path from `tmpdir()` but long from git.
    expect(path.basename(checked?.worktreePath ?? '')).toBe(path.basename(worktree));
    expect(checked?.isCurrent).toBe(false);

    expect(idle?.hasWorktree).toBe(false);
    expect(idle?.worktreePath).toBeUndefined();
  }, 30_000);

  it('carries the tip commit, so the sidebar can order and explain a branch', async () => {
    const result = await discoverLocalBranches(repo);
    const checked = result.branches.find((branch) => branch.name === 'feature/worktree');

    expect(checked?.lastCommitAt).toBeTruthy();
    expect(checked?.lastCommitBy).toBe('Test');
    expect(checked?.lastCommitSubject).toBe('work in the worktree');
  }, 30_000);

  it('stops listing a branch as soon as it is deleted', async () => {
    const doomed = 'feature/doomed';
    await git(['branch', doomed], repo);

    expect((await discoverLocalBranches(repo)).branches.map((b) => b.name)).toContain(doomed);

    await git(['branch', '-D', doomed], repo);

    expect((await discoverLocalBranches(repo)).branches.map((b) => b.name)).not.toContain(doomed);
  }, 30_000);

  it('reports a path that is not a git repository instead of throwing', async () => {
    const result = await discoverLocalBranches(path.join(root, 'does-not-exist'));

    expect(result.branches).toEqual([]);
    expect(result.error).toBe('Not a git repository');
  });
});
