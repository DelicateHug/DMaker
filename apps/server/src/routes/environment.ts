/**
 * Environment routes — what this server is, and what it can do.
 *
 * The UI calls `GET /api/environment` once on boot to decide whether to render
 * itself as the read-only dev environment or as prod, where to point the
 * "switch environment" link, and whether to offer Update Prod.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getVersion } from '../lib/version.js';
import { getRuntimeInfo } from '../lib/runtime-env.js';
import type { RunnerClient } from '../lib/runner-client.js';

export function createEnvironmentRoutes(runnerClient: RunnerClient | null): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response): void => {
    const info = getRuntimeInfo();
    res.json({
      success: true,
      ...info,
      version: getVersion(),
      runner: {
        configured: info.runnerUrl !== null,
        connected: runnerClient?.isConnected() ?? false,
        url: info.runnerUrl,
      },
    });
  });

  return router;
}
