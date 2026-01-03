/**
 * POST /session/stop - Stop an ideation session
 */

import type { Request, Response } from 'express';
import type { IdeationService } from '../../../services/ideation-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createSessionStopHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.body as { sessionId: string };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      await ideationService.stopSession(sessionId);
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Stop session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
