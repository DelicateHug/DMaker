/**
 * POST /github/sync-issue
 *
 * Fetches the latest assignee, label, and state data from GitHub for a linked issue
 * and writes it back onto the feature. Used by the board on refresh.
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from './common.js';
import { getGitHubSyncService } from '../../../services/github-sync-service.js';
import { FeatureLoader } from '../../../services/feature-loader.js';
import type { EventEmitter } from '../../../lib/events.js';

const featureLoader = new FeatureLoader();

export function createSyncIssueHandler(events: EventEmitter) {
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
      const issueData = await syncService.syncIssueData(projectPath, issueNumber);

      if (!issueData) {
        res
          .status(502)
          .json({ success: false, error: `Could not fetch issue #${issueNumber} from GitHub` });
        return;
      }

      // Update the feature with fresh GitHub data
      const feature = await featureLoader.get(projectPath, featureId);
      if (feature) {
        // Reconcile claimedBy with actual GitHub assignees
        const currentUser = await syncService.getCurrentUser(projectPath);
        const updates: Record<string, unknown> = { githubIssue: issueData };

        // If claimedBy user is no longer in assignees, clear the local claim
        if (feature.claimedBy && !issueData.assignees.includes(feature.claimedBy)) {
          updates.claimedBy = undefined;
          updates.claimedAt = undefined;
        }

        // If current user is now in assignees but feature isn't claimed locally, set it
        if (currentUser && issueData.assignees.includes(currentUser) && !feature.claimedBy) {
          updates.claimedBy = currentUser;
          updates.claimedAt = issueData.syncedAt;
        }

        await featureLoader.update(projectPath, featureId, updates);
      }

      res.json({ success: true, issueData });
    } catch (error) {
      logError(error, 'Sync issue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
