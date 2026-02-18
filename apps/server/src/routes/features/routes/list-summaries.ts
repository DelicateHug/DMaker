/**
 * POST /list-summaries endpoint - List lightweight feature summaries for a project
 *
 * Returns only the fields needed for list/board views, omitting heavy fields
 * like description, spec, descriptionHistory, summaryHistory, etc.
 * This significantly reduces payload size when only summary data is needed.
 *
 * Uses the shared featuresCache to avoid redundant disk reads within the TTL window.
 */

import type { Request, Response } from 'express';
import type { FeatureListSummary } from '@automaker/types';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { getErrorMessage, logError, featuresCache } from '../common.js';

export function createListSummariesHandler(featureLoader: FeatureLoader) {
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
      const cacheKey = `list-summaries:${projectPath}:${filterKey}`;
      const options =
        excludeStatuses || includeStatuses ? { excludeStatuses, includeStatuses } : undefined;
      const features = (await featuresCache.getOrSet(cacheKey, () =>
        featureLoader.getAllListSummaries(projectPath, options)
      )) as FeatureListSummary[];

      res.json({ success: true, features });
    } catch (error) {
      logError(error, 'List feature summaries failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
