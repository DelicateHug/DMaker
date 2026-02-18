/**
 * POST /list endpoint - List all features for a project
 *
 * Uses the shared featuresCache to avoid redundant disk reads when the same
 * project's features are requested multiple times within the TTL window.
 */

import type { Request, Response } from 'express';
import type { Feature } from '@automaker/types';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { getErrorMessage, logError, featuresCache } from '../common.js';

export function createListHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, excludeStatuses, includeStatuses } = req.body as {
        projectPath: string;
        excludeStatuses?: string[];
        includeStatuses?: string[];
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const filterKey =
        excludeStatuses?.sort().join(',') || includeStatuses?.sort().join(',') || '';
      const cacheKey = `list:${projectPath}:${filterKey}`;
      const options =
        excludeStatuses || includeStatuses ? { excludeStatuses, includeStatuses } : undefined;
      const features = (await featuresCache.getOrSet(cacheKey, () =>
        featureLoader.getAll(projectPath, options)
      )) as Feature[];

      res.json({ success: true, features });
    } catch (error) {
      logError(error, 'List features failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
