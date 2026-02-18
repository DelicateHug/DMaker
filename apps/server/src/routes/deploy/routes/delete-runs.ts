/**
 * DELETE /runs endpoint - Clear deploy run history
 *
 * Clears the in-memory history of script runs.
 *
 * Returns the number of entries that were cleared.
 */

import type { Request, Response } from 'express';
import type { DeployScriptRunner } from '../../../services/deploy-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createDeleteRunsHandler(runner: DeployScriptRunner) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const history = runner.getHistory();
      const cleared = history.length;

      runner.clearHistory();

      res.json({
        success: true,
        cleared,
      });
    } catch (error) {
      logError(error, 'Clear deploy run history failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
