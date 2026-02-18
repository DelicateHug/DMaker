/**
 * POST /stop-session endpoint - Stop an active voice session
 *
 * Ends the voice session, stopping any active processing and persisting
 * the session state. Emits a 'voice:session-ended' event.
 */

import type { Request, Response } from 'express';
import type { VoiceService } from '../../../services/voice-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createStopSessionHandler(voiceService: VoiceService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.body as { sessionId: string };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      const result = await voiceService.endSession(sessionId);

      if (!result.success) {
        res.status(404).json({ success: false, error: result.error });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Stop voice session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
