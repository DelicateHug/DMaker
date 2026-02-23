/**
 * POST /github/lock-issue
 * POST /github/unlock-issue
 * POST /github/pin-issue
 * POST /github/unpin-issue
 * POST /github/delete-issue
 *
 * Issue management actions (lock, pin, delete).
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from './common.js';
import { getGitHubSyncService } from '../../../services/github-sync-service.js';

function createIssueActionHandler(
  action: 'lockIssue' | 'unlockIssue' | 'pinIssue' | 'unpinIssue' | 'deleteIssue',
  label: string
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber } = req.body as {
        projectPath: string;
        issueNumber: number;
      };

      if (!projectPath || !issueNumber) {
        res.status(400).json({ success: false, error: 'projectPath and issueNumber are required' });
        return;
      }

      const syncService = getGitHubSyncService();
      const result = await syncService[action](projectPath, issueNumber);

      if (!result.success) {
        res.status(500).json({ success: false, error: result.error });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, `${label} failed`);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export const createLockIssueHandler = () => createIssueActionHandler('lockIssue', 'Lock issue');
export const createUnlockIssueHandler = () =>
  createIssueActionHandler('unlockIssue', 'Unlock issue');
export const createPinIssueHandler = () => createIssueActionHandler('pinIssue', 'Pin issue');
export const createUnpinIssueHandler = () => createIssueActionHandler('unpinIssue', 'Unpin issue');
export const createDeleteIssueHandler = () =>
  createIssueActionHandler('deleteIssue', 'Delete issue');
