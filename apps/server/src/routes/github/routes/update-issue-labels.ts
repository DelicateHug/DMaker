/**
 * POST /github/update-issue-labels
 *
 * Adds and/or removes labels from a GitHub issue.
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from './common.js';
import { getGitHubSyncService } from '../../../services/github-sync-service.js';

export function createUpdateIssueLabelsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber, addLabels, removeLabels } = req.body as {
        projectPath: string;
        issueNumber: number;
        addLabels?: string[];
        removeLabels?: string[];
      };

      if (!projectPath || !issueNumber) {
        res.status(400).json({ success: false, error: 'projectPath and issueNumber are required' });
        return;
      }

      const syncService = getGitHubSyncService();
      const result = await syncService.updateIssueLabels(
        projectPath,
        issueNumber,
        addLabels,
        removeLabels
      );

      if (!result.success) {
        res.status(500).json({ success: false, error: result.error });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Update issue labels failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
