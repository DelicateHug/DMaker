/**
 * POST /github/current-user
 *
 * Returns the GitHub username authenticated with the gh CLI for this machine.
 * Used by the UI to know who "I" am for displaying claim ownership.
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from './common.js';
import { getGitHubSyncService } from '../../../services/github-sync-service.js';
import type { EventEmitter } from '../../../lib/events.js';

export function createCurrentUserHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const syncService = getGitHubSyncService(events);
      const username = await syncService.getCurrentUser(projectPath);

      res.json({ success: true, username });
    } catch (error) {
      logError(error, 'Get current user failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
