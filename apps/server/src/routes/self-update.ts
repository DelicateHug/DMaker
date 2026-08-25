/**
 * Update Prod routes.
 *
 * `POST /api/self-update/start` kicks the update off and returns as soon as it
 * finishes (or aborts). Progress streams over the normal event WebSocket as
 * `self-update:event`, so the UI can show the pull and build output live and
 * survive a page reload mid-update.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '@dmaker/utils';
import type { SelfUpdateService } from '../services/self-update-service.js';
import { getRuntimeInfo } from '../lib/runtime-env.js';

const logger = createLogger('SelfUpdateRoutes');

export function createSelfUpdateRoutes(selfUpdateService: SelfUpdateService): Router {
  const router = Router();

  router.get('/status', (_req: Request, res: Response): void => {
    const info = getRuntimeInfo();
    res.json({
      success: true,
      enabled: info.selfUpdateEnabled,
      running: selfUpdateService.isRunning(),
      projectPath: info.selfProjectPath,
      lastResult: selfUpdateService.getLastResult(),
    });
  });

  router.post('/start', async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await selfUpdateService.update();
      res.status(result.success ? 200 : 409).json({ ...result, success: result.success });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Update Prod threw:', error);
      res.status(500).json({ success: false, phase: 'failed', message });
    }
  });

  return router;
}
