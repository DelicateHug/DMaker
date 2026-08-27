/**
 * The worktree read handlers used to resolve `.worktrees/<featureId>`, but
 * worktrees are created at `.worktrees/<sanitised branch name>`. A feature id
 * never matches its branch, so the guess always missed and `createDiffsHandler`
 * fell through to the main checkout while still answering `success: true` —
 * the Diff tab showed the developer's own uncommitted work as the feature's.
 *
 * These tests pin both halves: the miss is still handled, and it is now
 * labelled; and a caller that supplies `branchName` gets the real worktree.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createDiffsHandler,
  createFileDiffHandler,
  createInfoHandler,
  createStatusHandler,
} from '@/routes/worktree.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const execAsync = promisify(exec);

const GIT_IDENTITY = '-c user.name=DMaker -c user.email=dmaker@localhost';

const BRANCH_NAME = 'feature/worktree-diff-check';
/** What `worktreeDirNameForBranch` turns BRANCH_NAME into. */
const WORKTREE_DIR = 'feature-worktree-diff-check';
/** Deliberately unrelated to the branch — this is the real-world shape. */
const FEATURE_ID = '26-08-2026-worktree_diff_check';

const WORKTREE_FILE = 'only-in-worktree.txt';
const MAIN_FILE = 'only-in-main.txt';

interface CapturedResponse {
  status: number | null;
  body: any;
}

function makeRes(): { res: any; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: null, body: undefined };
  const res: any = {
    json: (payload: unknown) => {
      captured.body = payload;
      return res;
    },
    status: (code: number) => {
      captured.status = code;
      return res;
    },
  };
  return { res, captured };
}

async function call(handler: (req: any, res: any) => Promise<void>, body: unknown) {
  const { res, captured } = makeRes();
  await handler({ body } as any, res);
  return captured;
}

describe('worktree read handlers - resolving a feature to its worktree', () => {
  let projectPath: string;
  let worktreePath: string;

  beforeAll(async () => {
    projectPath = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'dmaker-wt-diff-')));

    await execAsync('git init', { cwd: projectPath });
    await fs.writeFile(path.join(projectPath, 'README.md'), 'base\n');
    await execAsync('git add -A', { cwd: projectPath });
    await execAsync(`git ${GIT_IDENTITY} commit -m "base"`, { cwd: projectPath });

    worktreePath = path.join(projectPath, '.worktrees', WORKTREE_DIR);
    await execAsync(`git worktree add -b ${BRANCH_NAME} "${worktreePath}"`, { cwd: projectPath });

    // One uncommitted file on each side, so a wrong answer is unmistakable.
    await fs.writeFile(path.join(worktreePath, WORKTREE_FILE), 'work from the agent\n');
    await fs.writeFile(path.join(projectPath, MAIN_FILE), 'work from the developer\n');
  }, 60_000);

  afterAll(async () => {
    if (!projectPath) return;
    await fs.rm(projectPath, { recursive: true, force: true });
  });

  describe('diffs', () => {
    it('returns the worktree diff when branchName is supplied', async () => {
      const { status, body } = await call(createDiffsHandler(), {
        projectPath,
        featureId: FEATURE_ID,
        branchName: BRANCH_NAME,
      });

      expect(status).toBeNull();
      expect(body.success).toBe(true);
      expect(body.usedMainCheckout).toBe(false);
      expect(body.worktreePath).toContain(WORKTREE_DIR);
      expect(body.diff).toContain(WORKTREE_FILE);
      expect(body.diff).not.toContain(MAIN_FILE);
      expect(body.files.map((f: { path: string }) => f.path)).toContain(WORKTREE_FILE);
    });

    it('labels the main-checkout fallback instead of passing it off as the feature', async () => {
      const { body } = await call(createDiffsHandler(), {
        projectPath,
        featureId: FEATURE_ID,
      });

      // Still answers, still `success: true` — but no longer silently.
      expect(body.success).toBe(true);
      expect(body.usedMainCheckout).toBe(true);
      expect(body.worktreePath).toBeNull();
      expect(body.diff).toContain(MAIN_FILE);
    });

    it('rejects a request with no featureId', async () => {
      const { status, body } = await call(createDiffsHandler(), { projectPath });
      expect(status).toBe(400);
      expect(body.success).toBe(false);
    });
  });

  describe('info', () => {
    it('reports the worktree and its branch when branchName is supplied', async () => {
      const { body } = await call(createInfoHandler(), {
        projectPath,
        featureId: FEATURE_ID,
        branchName: BRANCH_NAME,
      });

      expect(body.success).toBe(true);
      expect(body.worktreePath).toContain(WORKTREE_DIR);
      expect(body.branchName).toBe(BRANCH_NAME);
    });

    it('reports no worktree when only the feature id is known', async () => {
      const { body } = await call(createInfoHandler(), {
        projectPath,
        featureId: FEATURE_ID,
      });

      expect(body).toEqual({ success: true, worktreePath: null, branchName: null });
    });
  });

  describe('status', () => {
    it("counts the worktree's changes, not the main checkout's", async () => {
      const { body } = await call(createStatusHandler(), {
        projectPath,
        featureId: FEATURE_ID,
        branchName: BRANCH_NAME,
      });

      expect(body.success).toBe(true);
      expect(body.files).toContain(WORKTREE_FILE);
      expect(body.files).not.toContain(MAIN_FILE);
      expect(body.modifiedFiles).toBe(1);
    });

    it('reports an empty status when no worktree resolves', async () => {
      const { body } = await call(createStatusHandler(), {
        projectPath,
        featureId: FEATURE_ID,
      });

      expect(body.success).toBe(true);
      expect(body.modifiedFiles).toBe(0);
      expect(body.files).toEqual([]);
    });
  });

  describe('file-diff', () => {
    it('diffs a file inside the worktree when branchName is supplied', async () => {
      const { body } = await call(createFileDiffHandler(), {
        projectPath,
        featureId: FEATURE_ID,
        filePath: WORKTREE_FILE,
        branchName: BRANCH_NAME,
      });

      expect(body.success).toBe(true);
      expect(body.filePath).toBe(WORKTREE_FILE);
      expect(body.diff).toContain('work from the agent');
    });

    it('returns an empty diff when no worktree resolves', async () => {
      const { body } = await call(createFileDiffHandler(), {
        projectPath,
        featureId: FEATURE_ID,
        filePath: WORKTREE_FILE,
      });

      expect(body).toEqual({ success: true, diff: '', filePath: WORKTREE_FILE });
    });
  });

  describe('branch name that needs sanitising', () => {
    it('finds the worktree through git even though the directory name differs', async () => {
      // `feature/worktree-diff-check` cannot be a directory name; the worktree
      // lives at `feature-worktree-diff-check`. Both lookups must land on it.
      expect(WORKTREE_DIR).not.toBe(BRANCH_NAME);

      const { body } = await call(createInfoHandler(), {
        projectPath,
        featureId: 'a-feature-id-matching-nothing',
        branchName: BRANCH_NAME,
      });

      expect(body.worktreePath).toContain(WORKTREE_DIR);
      expect(body.branchName).toBe(BRANCH_NAME);
    });
  });
});
