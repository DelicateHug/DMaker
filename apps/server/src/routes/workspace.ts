/**
 * Workspace routes
 * Provides API endpoints for workspace directory management
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { createLogger } from '@dmaker/utils';
import { getAllowedRootDirectory, getDataDirectory, secureFs } from '@dmaker/platform';

// ---------------------------------------------------------------------------
// Logger & error helpers
// ---------------------------------------------------------------------------

const logger = createLogger('Workspace');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`\u274c ${context}:`, error);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function createConfigHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const allowedRootDirectory = getAllowedRootDirectory();
      const dataDirectory = getDataDirectory();

      if (!allowedRootDirectory) {
        // When ALLOWED_ROOT_DIRECTORY is not set, return DATA_DIR as default directory
        res.json({
          success: true,
          configured: false,
          defaultDir: dataDirectory || null,
        });
        return;
      }

      // Check if the directory exists
      try {
        const resolvedWorkspaceDir = path.resolve(allowedRootDirectory);
        const stats = await secureFs.stat(resolvedWorkspaceDir);
        if (!stats.isDirectory()) {
          res.json({
            success: true,
            configured: false,
            error: 'ALLOWED_ROOT_DIRECTORY is not a valid directory',
          });
          return;
        }

        res.json({
          success: true,
          configured: true,
          workspaceDir: resolvedWorkspaceDir,
          defaultDir: resolvedWorkspaceDir,
        });
      } catch {
        res.json({
          success: true,
          configured: false,
          error: 'ALLOWED_ROOT_DIRECTORY path does not exist',
        });
      }
    } catch (error) {
      logError(error, 'Get workspace config failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createDirectoriesHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const allowedRootDirectory = getAllowedRootDirectory();

      if (!allowedRootDirectory) {
        res.status(400).json({
          success: false,
          error: 'ALLOWED_ROOT_DIRECTORY is not configured',
        });
        return;
      }

      const resolvedWorkspaceDir = path.resolve(allowedRootDirectory);

      // Check if directory exists
      try {
        await secureFs.stat(resolvedWorkspaceDir);
      } catch {
        res.status(400).json({
          success: false,
          error: 'Workspace directory path does not exist',
        });
        return;
      }

      // Read directory contents
      const entries = await secureFs.readdir(resolvedWorkspaceDir, {
        withFileTypes: true,
      });

      // Filter to directories only and map to result format
      const directories = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => ({
          name: entry.name,
          path: path.join(resolvedWorkspaceDir, entry.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        success: true,
        directories,
      });
    } catch (error) {
      logError(error, 'List workspace directories failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createWorkspaceRoutes(): Router {
  const router = Router();

  router.get('/config', createConfigHandler());
  router.get('/directories', createDirectoriesHandler());

  return router;
}
