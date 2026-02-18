/**
 * GET /runs endpoint - Get deploy run history
 *
 * Returns the in-memory history of script runs, most recent first.
 *
 * Query params:
 * - limit (optional) - Maximum number of entries to return
 */

import type { Request, Response } from 'express';
import type { DeployScriptRunner } from '../../../services/deploy-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createRunsHandler(runner: DeployScriptRunner) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const limitStr = req.query.limit as string | undefined;
      const limit = limitStr ? parseInt(limitStr, 10) : undefined;

      const history = runner.getHistory(limit);

      res.json({
        success: true,
        history,
        total: history.length,
      });
    } catch (error) {
      logError(error, 'Get deploy runs failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
