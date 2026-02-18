/**
 * POST /agent-output endpoint - Get agent output for a feature
 * POST /raw-output endpoint - Get raw JSONL output for debugging
 */

import type { Request, Response } from 'express';
import { FeatureLoader } from '../../../services/feature-loader.js';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createAgentOutputHandler(
  featureLoader: FeatureLoader,
  autoModeService?: AutoModeService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body as {
        projectPath: string;
        featureId: string;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId are required',
        });
        return;
      }

      // For running features, prefer the in-memory buffer which is always up-to-date
      // (the disk file may lag behind due to debounced writes)
      const inMemoryContent = autoModeService?.getInMemoryOutput(featureId);
      if (inMemoryContent !== null && inMemoryContent !== undefined) {
        res.json({ success: true, content: inMemoryContent });
        return;
      }

      // Fall back to reading from disk for completed features
      const content = await featureLoader.getAgentOutput(projectPath, featureId);
      res.json({ success: true, content });
    } catch (error) {
      logError(error, 'Get agent output failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * Handler for getting raw JSONL output for debugging
 */
export function createRawOutputHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body as {
        projectPath: string;
        featureId: string;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId are required',
        });
        return;
      }

      const content = await featureLoader.getRawOutput(projectPath, featureId);
      res.json({ success: true, content });
    } catch (error) {
      logError(error, 'Get raw output failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
