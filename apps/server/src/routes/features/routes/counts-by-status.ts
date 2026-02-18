/**
 * POST /counts-by-status endpoint - Get feature counts per status
 *
 * Returns a lightweight { status: count } mapping by counting subdirectories
 * in each status directory. No JSON parsing is needed, making this extremely fast.
 */

import type { Request, Response } from 'express';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { getErrorMessage, logError } from '../common.js';

export function createCountsByStatusHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const counts = await featureLoader.getCountsByStatus(projectPath);

      res.json({ success: true, counts });
    } catch (error) {
      logError(error, 'Counts by status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
