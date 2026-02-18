/**
 * POST /resume-feature endpoint - Resume a feature
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('AutoMode');

export function createResumeFeatureHandler(autoModeService: AutoModeService) {
  // Use the shared FeatureLoader from AutoModeService to avoid separate cache instances
  const featureLoader = autoModeService.getFeatureLoader();

  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, useWorktrees } = req.body as {
        projectPath: string;
        featureId: string;
        useWorktrees?: boolean;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId are required',
        });
        return;
      }

      // Check if feature is already running before attempting resume
      if (autoModeService.isFeatureRunning(featureId)) {
        logger.warn(`Resume feature ${featureId}: already running, skipping`);
        res.json({
          success: false,
          error: 'Feature is already running',
          alreadyRunning: true,
        });
        return;
      }

      // Validate the feature exists before starting the async resume.
      // This eagerly populates the FeatureLoader cache and returns a clear
      // error to the client instead of silently failing in the background.
      const feature = await featureLoader.get(projectPath, featureId);
      if (!feature) {
        logger.error(`Resume feature ${featureId}: feature not found at project ${projectPath}`);
        res.json({
          success: false,
          error: `Feature ${featureId} not found`,
        });
        return;
      }

      // Start resume in background
      // Default to false - worktrees should only be used when explicitly enabled
      autoModeService
        .resumeFeature(projectPath, featureId, useWorktrees ?? false)
        .catch((error) => {
          logger.error(`Resume feature ${featureId} error:`, error);
        });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Resume feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
