/**
 * POST /running endpoint - Get lightweight list of running (in_progress) features
 *
 * Returns only the minimal fields needed to display running agents:
 * { count, features: [{ id, title, titleGenerating, status }] }
 *
 * Much lighter than the full /list or /list-summaries endpoints when the
 * caller only needs to know which features are currently running.
 *
 * Uses the shared featuresCache for deduplication and TTL caching.
 */

import type { Request, Response } from 'express';
import type { FeatureListSummary } from '@automaker/types';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { getErrorMessage, logError, featuresCache } from '../common.js';

export function createRunningHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // Reuse the summaries cache to avoid redundant disk reads
      const cacheKey = `list-summaries:${projectPath}`;
      const allSummaries = (await featuresCache.getOrSet(cacheKey, () =>
        featureLoader.getAllListSummaries(projectPath)
      )) as FeatureListSummary[];

      // Filter to running features and return minimal data
      const running = allSummaries
        .filter((f) => f.status === 'in_progress')
        .map((f) => ({
          id: f.id,
          title: f.title,
          titleGenerating: f.titleGenerating,
          status: f.status,
        }));

      res.json({
        success: true,
        count: running.length,
        features: running,
      });
    } catch (error) {
      logError(error, 'Get running features failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
