/**
 * POST /get-status endpoint - Get voice session status
 *
 * Returns the current status of a voice session including whether it's
 * active, the current processing state, message count, and any errors.
 */

import type { Request, Response } from 'express';
import type { VoiceService } from '../../../services/voice-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createGetStatusHandler(voiceService: VoiceService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.body as { sessionId: string };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      const status = await voiceService.getSessionStatus(sessionId);

      if (!status) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      logError(error, 'Get voice session status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
