/**
 * POST /github/claim-issue
 *
 * Assigns the current GitHub user to the issue linked with a feature,
 * then updates the feature's claimedBy / githubIssue fields.
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from './common.js';
import { getGitHubSyncService } from '../../../services/github-sync-service.js';
import { FeatureLoader } from '../../../services/feature-loader.js';
import type { EventEmitter } from '../../../lib/events.js';

const featureLoader = new FeatureLoader();

export function createClaimIssueHandler(events: EventEmitter) {
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
        res.status(400).json({
          success: false,
          error: 'Not authenticated with GitHub CLI. Run `gh auth login` first.',
        });
        return;
      }

      // Assign on GitHub
      const claimResult = await syncService.claimIssue(projectPath, issueNumber);
      if (!claimResult.success) {
        res.status(500).json({ success: false, error: claimResult.error });
        return;
      }

      // Fetch fresh issue data and update the feature
      const issueData = await syncService.syncIssueData(projectPath, issueNumber);
      const now = new Date().toISOString();

      await featureLoader.update(projectPath, featureId, {
        claimedBy: currentUser,
        claimedAt: now,
        ...(issueData ? { githubIssue: issueData } : {}),
      });

      // Emit real-time event so other board clients refresh
      events.emit('feature:claimed', {
        featureId,
        issueNumber,
        claimedBy: currentUser,
        projectPath,
      });

      res.json({ success: true, claimedBy: currentUser, issueData });
    } catch (error) {
      logError(error, 'Claim issue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
