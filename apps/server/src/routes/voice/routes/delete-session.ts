/**
 * POST /delete-session endpoint - Delete a voice session
 *
 * Permanently removes a voice session from both memory and disk.
 * This operation cannot be undone.
 */

import type { Request, Response } from 'express';
import type { VoiceService } from '../../../services/voice-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createDeleteSessionHandler(voiceService: VoiceService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.body as { sessionId: string };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      const result = await voiceService.deleteSession(sessionId);

      if (!result.success) {
        res.status(404).json({ success: false, error: result.error });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Delete voice session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
