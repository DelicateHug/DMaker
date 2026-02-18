/**
 * POST /stop-processing endpoint - Stop command processing
 *
 * Aborts any ongoing AI command processing for the specified session.
 * Useful when the user wants to cancel a long-running command.
 */

import type { Request, Response } from 'express';
import type { VoiceService } from '../../../services/voice-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createStopProcessingHandler(voiceService: VoiceService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.body as { sessionId: string };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      const result = await voiceService.stopProcessing(sessionId);

      if (!result.success) {
        res.status(404).json({ success: false, error: result.error });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Stop voice processing failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
