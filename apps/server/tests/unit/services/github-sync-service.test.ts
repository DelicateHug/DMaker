import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock child_process so we can drive gh/git outcomes. promisify() wraps these
// callback-style, so each mock must invoke its callback with { stdout, stderr }.
vi.mock('child_process', () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
}));

import { exec, execFile } from 'child_process';
import { GitHubSyncService } from '../../../src/services/github-sync-service.js';
import type { Feature } from '@dmaker/types';

type Cb = (err: Error | null, result?: { stdout: string; stderr: string }) => void;

const execFileMock = execFile as unknown as ReturnType<typeof vi.fn>;
const execMock = exec as unknown as ReturnType<typeof vi.fn>;

/**
 * Drive `exec` (the shell-string form gh uses for user lookup and claiming)
 * from the command text. Returns the commands that were run, in order.
 */
function stubExec(handler: (command: string) => { stdout?: string } | Error): string[] {
  const commands: string[] = [];
  execMock.mockImplementation((command: string, _opts: unknown, cb: Cb) => {
    commands.push(command);
    const outcome = handler(command);
    if (outcome instanceof Error) cb(outcome);
    else cb(null, { stdout: outcome.stdout ?? '', stderr: '' });
    return undefined as never;
  });
  return commands;
}

/** A task linked to issue #7, with whatever assignees and labels a test needs. */
function featureWithIssue(overrides: { assignees?: string[]; labels?: string[] } = {}): Feature {
  return {
    id: 'feat-1',
    title: 'A task',
    githubIssue: {
      number: 7,
      url: 'https://github.com/me/repo/issues/7',
      assignees: overrides.assignees ?? [],
      labels: overrides.labels ?? [],
      state: 'open',
    },
  } as unknown as Feature;
}

/** Record of one execFile invocation, for asserting on the argv we built. */
interface Call {
  file: string;
  args: string[];
}

/**
 * Drive execFile with a handler that decides each call's outcome from its argv.
 * Returns the list of calls made.
 */
function stubExecFile(handler: (call: Call) => { stdout?: string } | Error): Call[] {
  const calls: Call[] = [];
  execFileMock.mockImplementation((file: string, args: string[], _opts: unknown, cb: Cb) => {
    calls.push({ file, args });
    const outcome = handler({ file, args });
    if (outcome instanceof Error) {
      cb(outcome);
    } else {
      cb(null, { stdout: outcome.stdout ?? '', stderr: '' });
    }
    return undefined as never;
  });
  return calls;
}

/** A rejection shaped like child_process's, with gh's message on stderr. */
function ghFailure(stderr: string): Error {
  const err = new Error(`Command failed: gh ...\n${stderr}`) as Error & { stderr: string };
  err.stderr = stderr;
  return err;
}

describe('GitHubSyncService', () => {
  let service: GitHubSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GitHubSyncService(new EventEmitter() as never);
  });

  describe('createIssue', () => {
    it('classifies a project with no remote as no-remote so the UI can offer a repo', async () => {
      stubExecFile(({ args }) =>
        args[0] === 'issue' ? ghFailure('no git remotes found\n') : { stdout: '' }
      );

      const result = await service.createIssue('/proj', 'Some title', 'Body', ['label-backlog']);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('no-remote');
      expect(result.error).toContain('no GitHub repository');
    });

    it('classifies a missing gh login as not-authenticated', async () => {
      stubExecFile(({ args }) =>
        args[0] === 'issue' ? ghFailure('gh auth login required to authenticate\n') : { stdout: '' }
      );

      const result = await service.createIssue('/proj', 'Some title');

      expect(result.errorCode).toBe('not-authenticated');
    });

    it('drops a label it cannot create rather than failing the whole issue', async () => {
      // gh rejects `--label` for a label that does not exist, so a repo where
      // label creation is refused must not lose the ability to file issues.
      const calls = stubExecFile(({ args }) => {
        if (args[0] === 'label') return ghFailure('HTTP 403: Resource not accessible');
        if (args[0] === 'issue') return { stdout: 'https://github.com/o/r/issues/7' };
        return { stdout: '' };
      });

      const result = await service.createIssue('/proj', 'Title', 'Body', ['label-backlog']);

      expect(result).toMatchObject({ success: true, issueNumber: 7 });
      expect(result.appliedLabels).toEqual([]);
      const issueCall = calls.find((c) => c.args[0] === 'issue');
      expect(issueCall?.args).not.toContain('--label');
    });

    it('reports the labels it actually applied', async () => {
      stubExecFile(({ args }) => {
        if (args[0] === 'label' && args[2] === 'nope') return ghFailure('denied');
        if (args[0] === 'issue') return { stdout: 'https://github.com/o/r/issues/8' };
        return { stdout: '' };
      });

      const result = await service.createIssue('/proj', 'Title', 'Body', ['label-backlog', 'nope']);

      expect(result.appliedLabels).toEqual(['label-backlog']);
    });

    it('surfaces the exit code when gh fails silently instead of echoing the command', async () => {
      // A bare `Command failed: gh issue create ...` told the user nothing.
      stubExecFile(({ args }) => {
        if (args[0] !== 'issue') return { stdout: '' };
        const err = new Error('Command failed: gh issue create --title Title') as Error & {
          stderr: string;
          code: number;
        };
        err.stderr = '';
        err.code = 1;
        return err;
      });

      const result = await service.createIssue('/proj', 'Title');

      expect(result.success).toBe(false);
      expect(result.error).toContain('exit code 1');
    });

    it('prefers stdout when gh writes its failure there', async () => {
      stubExecFile(({ args }) => {
        if (args[0] !== 'issue') return { stdout: '' };
        const err = new Error('Command failed: gh issue create') as Error & {
          stderr: string;
          stdout: string;
        };
        err.stderr = '';
        err.stdout = 'could not add label: not found';
        return err;
      });

      const result = await service.createIssue('/proj', 'Title');

      expect(result.error).toBe('could not add label: not found');
    });

    it('passes the body through argv so newlines survive', async () => {
      const calls = stubExecFile(({ args }) =>
        args[0] === 'issue' ? { stdout: 'https://github.com/o/r/issues/42\n' } : { stdout: '' }
      );

      const result = await service.createIssue('/proj', 'Title', 'line one\nline two', ['bug']);

      expect(result).toMatchObject({ success: true, issueNumber: 42 });
      const issueCall = calls.find((c) => c.args[0] === 'issue');
      expect(issueCall?.args).toEqual([
        'issue',
        'create',
        '--title',
        'Title',
        '--body',
        'line one\nline two',
        '--label',
        'bug',
      ]);
    });
  });

  describe('createRepo', () => {
    it('rejects names GitHub would not accept without shelling out', async () => {
      const calls = stubExecFile(() => ({ stdout: '' }));

      const result = await service.createRepo('/proj', 'not a valid name');

      expect(result.success).toBe(false);
      expect(result.error).toContain('letters, numbers');
      expect(calls).toHaveLength(0);
    });

    it('creates a private repo wired to origin and pushes when there are commits', async () => {
      const calls = stubExecFile(({ args }) =>
        args[0] === 'repo' ? { stdout: 'https://github.com/me/my-project\n' } : { stdout: 'ok' }
      );

      const result = await service.createRepo('/proj', 'my-project');

      expect(result.success).toBe(true);
      expect(result.nameWithOwner).toBe('me/my-project');
      const repoCall = calls.find((c) => c.args[0] === 'repo');
      expect(repoCall?.args).toEqual([
        'repo',
        'create',
        'my-project',
        '--private',
        '--source',
        '.',
        '--remote',
        'origin',
        '--push',
      ]);
    });

    it('omits --push when the repo has no commits yet', async () => {
      const calls = stubExecFile(({ args }) => {
        if (args[0] === 'rev-parse' && args.includes('HEAD')) {
          return new Error('fatal: Needed a single revision');
        }
        if (args[0] === 'repo') return { stdout: 'https://github.com/me/fresh\n' };
        return { stdout: 'ok' };
      });

      const result = await service.createRepo('/proj', 'fresh', 'public');

      expect(result.success).toBe(true);
      const repoCall = calls.find((c) => c.args[0] === 'repo');
      expect(repoCall?.args).toContain('--public');
      expect(repoCall?.args).not.toContain('--push');
    });

    it('runs git init when the project is not a git repo yet', async () => {
      const calls = stubExecFile(({ file, args }) => {
        if (file === 'git' && args[0] === 'rev-parse' && args.includes('--git-dir')) {
          return new Error('fatal: not a git repository');
        }
        if (args[0] === 'repo') return { stdout: 'https://github.com/me/fresh\n' };
        return { stdout: 'ok' };
      });

      await service.createRepo('/proj', 'fresh');

      expect(calls.some((c) => c.file === 'git' && c.args[0] === 'init')).toBe(true);
    });
  });

  describe('resolveOwnership', () => {
    it('grants writes when the issue is already assigned to me', async () => {
      stubExec(() => ({ stdout: 'me\n' }));

      const result = await service.resolveOwnership(
        '/proj',
        featureWithIssue({ assignees: ['me'] })
      );

      expect(result).toMatchObject({ canWrite: true, owner: 'me' });
      expect(result.autoClaimed).toBeUndefined();
    });

    it('denies writes to a task with no GitHub issue behind it', async () => {
      const commands = stubExec(() => ({ stdout: 'me\n' }));

      const result = await service.resolveOwnership('/proj', {
        id: 'local-1',
      } as unknown as Feature);

      expect(result.canWrite).toBe(false);
      expect(result.reason).toBe('no_issue');
      // No issue means no question to ask GitHub.
      expect(commands).toHaveLength(0);
    });

    it('denies writes when someone else is assigned, and never takes the issue', async () => {
      const commands = stubExec(() => ({ stdout: 'me\n' }));

      const result = await service.resolveOwnership(
        '/proj',
        featureWithIssue({ assignees: ['someone-else'] }),
        { autoClaim: true }
      );

      expect(result).toMatchObject({
        canWrite: false,
        reason: 'owned_by_other',
        owner: 'someone-else',
      });
      expect(commands.some((c) => c.includes('--add-assignee'))).toBe(false);
    });

    it('honours an owner-{login} label over the assignee list', async () => {
      stubExec(() => ({ stdout: 'me\n' }));

      const result = await service.resolveOwnership(
        '/proj',
        featureWithIssue({ assignees: ['me'], labels: ['owner-someone-else'] }),
        { autoClaim: true }
      );

      expect(result).toMatchObject({
        canWrite: false,
        reason: 'owned_by_other',
        owner: 'someone-else',
      });
    });

    it('reports an unclaimed issue as unclaimed when not asked to claim it', async () => {
      const commands = stubExec(() => ({ stdout: 'me\n' }));

      const result = await service.resolveOwnership('/proj', featureWithIssue());

      expect(result).toMatchObject({ canWrite: false, reason: 'unclaimed' });
      expect(commands.some((c) => c.includes('--add-assignee'))).toBe(false);
    });

    it('claims an unclaimed issue and then grants writes', async () => {
      const commands = stubExec(() => ({ stdout: 'me\n' }));

      const result = await service.resolveOwnership('/proj', featureWithIssue(), {
        autoClaim: true,
      });

      expect(result).toMatchObject({ canWrite: true, owner: 'me', autoClaimed: true });
      expect(commands.some((c) => c.includes('gh issue edit 7 --add-assignee "me"'))).toBe(true);
    });

    it('denies writes when the claim does not stick', async () => {
      stubExec((command) =>
        command.includes('--add-assignee') ? ghFailure('HTTP 403') : { stdout: 'me\n' }
      );

      const result = await service.resolveOwnership('/proj', featureWithIssue(), {
        autoClaim: true,
      });

      expect(result).toMatchObject({ canWrite: false, reason: 'claim_failed' });
    });

    it('denies writes when gh cannot say who we are', async () => {
      stubExec(() => ghFailure('gh auth login required'));

      const result = await service.resolveOwnership('/proj', featureWithIssue(), {
        autoClaim: true,
      });

      expect(result).toMatchObject({ canWrite: false, reason: 'no_identity' });
    });
  });
});
