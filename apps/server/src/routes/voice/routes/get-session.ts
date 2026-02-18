/**
 * POST /get-session endpoint - Get voice session details
 *
 * Returns the full session object including all messages and settings.
 * Use this for restoring session state or displaying conversation history.
 */

import type { Request, Response } from 'express';
import type { VoiceService } from '../../../services/voice-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createGetSessionHandler(voiceService: VoiceService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.body as { sessionId: string };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      const session = await voiceService.getSession(sessionId);

      if (!session) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      res.json({
        success: true,
        session,
      });
    } catch (error) {
      logError(error, 'Get voice session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
