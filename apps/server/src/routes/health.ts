/**
 * Health check routes
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getVersion } from '../lib/version.js';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function createIndexHandler() {
  return (_req: Request, res: Response): void => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: getVersion(),
    });
  };
}

export function createDetailedHandler() {
  return (_req: Request, res: Response): void => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: getVersion(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      dataDir: process.env.DATA_DIR || './data',
      auth: { enabled: false },
      env: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    });
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createHealthRoutes(): Router {
  const router = Router();

  // Basic health check
  router.get('/', createIndexHandler());

  return router;
}
