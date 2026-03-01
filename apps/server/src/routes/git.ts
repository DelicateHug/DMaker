/**
 * Git routes - HTTP API for git operations (non-worktree)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@dmaker/utils';
import { validatePathParams } from '../middleware.js';
import { getGitRepositoryDiffs, generateSyntheticDiffForNewFile } from '@dmaker/git-utils';

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Logger & error helpers
// ---------------------------------------------------------------------------

const logger = createLogger('Git');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`❌ ${context}:`, error);
}

// ---------------------------------------------------------------------------
// POST /diffs - Get diffs for the main project
// ---------------------------------------------------------------------------

function createDiffsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      try {
        const result = await getGitRepositoryDiffs(projectPath);
        res.json({
          success: true,
          diff: result.diff,
          files: result.files,
          hasChanges: result.hasChanges,
        });
      } catch (innerError) {
        logError(innerError, 'Git diff failed');
        res.json({ success: true, diff: '', files: [], hasChanges: false });
      }
    } catch (error) {
      logError(error, 'Get diffs failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /file-diff - Get diff for a specific file
// ---------------------------------------------------------------------------

function createFileDiffHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, filePath } = req.body as {
        projectPath: string;
        filePath: string;
      };

      if (!projectPath || !filePath) {
        res.status(400).json({ success: false, error: 'projectPath and filePath required' });
        return;
      }

      try {
        // First check if the file is untracked
        const { stdout: status } = await execAsync(`git status --porcelain -- "${filePath}"`, {
          cwd: projectPath,
        });

        const isUntracked = status.trim().startsWith('??');

        let diff: string;
        if (isUntracked) {
          // Generate synthetic diff for untracked file
          diff = await generateSyntheticDiffForNewFile(projectPath, filePath);
        } else {
          // Use regular git diff for tracked files
          const result = await execAsync(`git diff HEAD -- "${filePath}"`, {
            cwd: projectPath,
            maxBuffer: 10 * 1024 * 1024,
          });
          diff = result.stdout;
        }

        res.json({ success: true, diff, filePath });
      } catch (innerError) {
        logError(innerError, 'Git file diff failed');
        res.json({ success: true, diff: '', filePath });
      }
    } catch (error) {
      logError(error, 'Get file diff failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createGitRoutes(): Router {
  const router = Router();

  router.post('/diffs', validatePathParams('projectPath'), createDiffsHandler());
  router.post('/file-diff', validatePathParams('projectPath', 'filePath'), createFileDiffHandler());

  return router;
}
