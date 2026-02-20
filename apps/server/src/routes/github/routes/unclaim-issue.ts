/**
 * POST /github/unclaim-issue
 *
 * Removes the current GitHub user from the issue's assignees,
 * then clears the feature's claimedBy / claimedAt fields.
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from './common.js';
import { getGitHubSyncService } from '../../../services/github-sync-service.js';
import { FeatureLoader } from '../../../services/feature-loader.js';
import type { EventEmitter } from '../../../lib/events.js';

const featureLoader = new FeatureLoader();

export function createUnclaimIssueHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, issueNumber } = req.body as {
        projectPath: string;
        featureId: string;
        issueNumber: number;
      };

      if (!projectPath || !featureId || !issueNumber) {
        res
          .status(400)
          .json({ success: false, error: 'projectPath, featureId and issueNumber are required' });
        return;
      }

      const syncService = getGitHubSyncService(events);
      const currentUser = await syncService.getCurrentUser(projectPath);
      if (!currentUser) {
        res.status(400).json({ success: false, error: 'Not authenticated with GitHub CLI.' });
        return;
      }

      // Remove assignee on GitHub
      const unclaimResult = await syncService.unclaimIssue(projectPath, issueNumber);
      if (!unclaimResult.success) {
        res.status(500).json({ success: false, error: unclaimResult.error });
        return;
      }

      // Fetch fresh issue data and clear claim fields on the feature
      const issueData = await syncService.syncIssueData(projectPath, issueNumber);

      await featureLoader.update(projectPath, featureId, {
        claimedBy: undefined,
        claimedAt: undefined,
        ...(issueData ? { githubIssue: issueData } : {}),
      });

      events.emit('feature:unclaimed', {
        featureId,
        issueNumber,
        projectPath,
      });

      res.json({ success: true, issueData });
    } catch (error) {
      logError(error, 'Unclaim issue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
