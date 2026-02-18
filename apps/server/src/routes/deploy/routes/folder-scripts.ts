/**
 * GET /folder-scripts endpoint - List scripts in the deploy folder
 *
 * Returns supported scripts (.py, .ps1, .js, .ts, .sh, .bat, .cmd)
 * from the project's .automaker/deploy folder.
 *
 * Query params:
 * - projectPath (required) - Absolute path to the project directory
 */

import type { Request, Response } from 'express';
import type { DeployScriptRunner } from '../../../services/deploy-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createFolderScriptsHandler(runner: DeployScriptRunner) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = req.query.projectPath as string | undefined;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath query parameter is required',
        });
        return;
      }

      const scripts = await runner.listScripts(projectPath);
      const folderPath = runner.getDeployFolderPath(projectPath);

      res.json({
        success: true,
        scripts,
        folderPath,
        folderExists: scripts.length > 0 || (await folderExists(runner, projectPath)),
      });
    } catch (error) {
      logError(error, 'List deploy scripts failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/** Check if the deploy folder exists (used when script list is empty) */
async function folderExists(runner: DeployScriptRunner, projectPath: string): Promise<boolean> {
  try {
    const { stat } = await import('../../../lib/secure-fs.js');
    const s = await stat(runner.getDeployFolderPath(projectPath));
    return s.isDirectory();
  } catch {
    return false;
  }
}
