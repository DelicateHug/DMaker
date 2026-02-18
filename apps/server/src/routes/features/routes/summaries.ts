/**
 * POST /summaries endpoint - List all summary files for a feature
 * POST /summary endpoint - Get a single summary file by timestamp
 */

import type { Request, Response } from 'express';
import type {
  ListSummariesRequest,
  GetSummaryRequest,
  ListSummariesResponse,
  GetSummaryResponse,
  SummaryErrorResponse,
} from '@automaker/types';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Handler for listing all summary files for a feature
 * Returns summary entries sorted by timestamp (newest first)
 */
export function createListSummariesHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body as ListSummariesRequest;

      if (!projectPath || !featureId) {
        const errorResponse: SummaryErrorResponse = {
          success: false,
          error: 'projectPath and featureId are required',
        };
        res.status(400).json(errorResponse);
        return;
      }

      const summaries = await featureLoader.getSummaryFiles(projectPath, featureId);
      const response: ListSummariesResponse = { success: true, summaries };
      res.json(response);
    } catch (error) {
      logError(error, 'List summaries failed');
      const errorResponse: SummaryErrorResponse = {
        success: false,
        error: getErrorMessage(error),
      };
      res.status(500).json(errorResponse);
    }
  };
}

/**
 * Handler for getting a single summary file by timestamp
 * Returns the summary content for the specified timestamp
 */
export function createGetSummaryHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, timestamp } = req.body as GetSummaryRequest;

      if (!projectPath || !featureId || !timestamp) {
        const errorResponse: SummaryErrorResponse = {
          success: false,
          error: 'projectPath, featureId, and timestamp are required',
        };
        res.status(400).json(errorResponse);
        return;
      }

      const summary = await featureLoader.getSummaryFile(projectPath, featureId, timestamp);
      if (!summary) {
        const errorResponse: SummaryErrorResponse = {
          success: false,
          error: 'Summary not found',
        };
        res.status(404).json(errorResponse);
        return;
      }

      const response: GetSummaryResponse = { success: true, summary };
      res.json(response);
    } catch (error) {
      logError(error, 'Get summary failed');
      const errorResponse: SummaryErrorResponse = {
        success: false,
        error: getErrorMessage(error),
      };
      res.status(500).json(errorResponse);
    }
  };
}
