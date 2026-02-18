/**
 * POST /run-feature endpoint - Run a single feature
 *
 * This endpoint checks for unsatisfied dependencies when the feature has
 * `waitForDependencies: true` and returns blocking information so the UI
 * can show a confirmation dialog before proceeding.
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';
import { getBlockingDependencies } from '@automaker/dependency-resolver';

const logger = createLogger('AutoMode');

export function createRunFeatureHandler(autoModeService: AutoModeService) {
  // Use the shared FeatureLoader from AutoModeService to avoid separate cache instances
  const featureLoader = autoModeService.getFeatureLoader();

  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, useWorktrees, forceRun } = req.body as {
        projectPath: string;
        featureId: string;
        useWorktrees?: boolean;
        forceRun?: boolean; // If true, bypass dependency warning and run anyway
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId are required',
        });
        return;
      }

      // Load the feature and all features to check dependencies
      const [feature, allFeatures] = await Promise.all([
        featureLoader.get(projectPath, featureId),
        featureLoader.getAll(projectPath),
      ]);

      if (!feature) {
        res.status(404).json({
          success: false,
          error: `Feature ${featureId} not found`,
        });
        return;
      }

      // Check for unsatisfied dependencies if the feature requires waiting
      // and the caller hasn't explicitly requested to force run
      if (feature.waitForDependencies && !forceRun) {
        const blockingDeps = getBlockingDependencies(feature, allFeatures);

        if (blockingDeps.length > 0) {
          // Return warning with blocking dependency information
          // The UI can use this to show a confirmation dialog (T011)
          const blockingDependencyDetails = blockingDeps.map((depId) => {
            const dep = allFeatures.find((f) => f.id === depId);
            return {
              id: depId,
              title: dep?.title,
              description: dep?.description,
              status: dep?.status,
            };
          });

          res.json({
            success: false,
            warning: 'unsatisfied_dependencies',
            message: `Feature has ${blockingDeps.length} unsatisfied ${blockingDeps.length === 1 ? 'dependency' : 'dependencies'}`,
            blockingDependencies: blockingDependencyDetails,
          });
          return;
        }
      }

      // Check if feature is already running before attempting execution
      if (autoModeService.isFeatureRunning(featureId)) {
        logger.warn(`Run feature ${featureId}: already running, skipping`);
        res.json({
          success: false,
          error: 'Feature is already running',
          alreadyRunning: true,
        });
        return;
      }

      // Start execution in background
      // executeFeature derives workDir from feature.branchName
      autoModeService
        .executeFeature(projectPath, featureId, useWorktrees ?? false, false)
        .catch((error) => {
          logger.error(`Feature ${featureId} error:`, error);
        })
        .finally(() => {
          // Release the starting slot when execution completes (success or error)
          // Note: The feature should be in runningFeatures by this point
        });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Run feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
