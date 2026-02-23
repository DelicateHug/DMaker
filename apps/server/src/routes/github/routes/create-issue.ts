/**
 * POST /github/create-issue
 *
 * Creates a new GitHub issue via the gh CLI.
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from './common.js';
import { getGitHubSyncService } from '../../../services/github-sync-service.js';

export function createCreateIssueHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, title, body, labels } = req.body as {
        projectPath: string;
        title: string;
        body?: string;
        labels?: string[];
      };

      if (!projectPath || !title) {
        res.status(400).json({ success: false, error: 'projectPath and title are required' });
        return;
      }

      const syncService = getGitHubSyncService();
      const result = await syncService.createIssue(projectPath, title, body, labels);

      if (!result.success) {
        res.status(500).json({ success: false, error: result.error });
        return;
      }

      res.json({
        success: true,
        issueNumber: result.issueNumber,
        url: result.url,
      });
    } catch (error) {
      logError(error, 'Create issue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
