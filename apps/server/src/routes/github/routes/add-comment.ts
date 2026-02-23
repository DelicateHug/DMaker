/**
 * POST /github/add-comment
 *
 * Posts a comment on a GitHub issue.
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from './common.js';
import { getGitHubSyncService } from '../../../services/github-sync-service.js';

export function createAddCommentHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber, body } = req.body as {
        projectPath: string;
        issueNumber: number;
        body: string;
      };

      if (!projectPath || !issueNumber || !body) {
        res
          .status(400)
          .json({ success: false, error: 'projectPath, issueNumber, and body are required' });
        return;
      }

      const syncService = getGitHubSyncService();
      const result = await syncService.addComment(projectPath, issueNumber, body);

      if (!result.success) {
        res.status(500).json({ success: false, error: result.error });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Add comment failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
