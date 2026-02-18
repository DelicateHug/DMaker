/**
 * POST /list-sessions endpoint - List voice sessions
 *
 * Returns all voice sessions, optionally filtered by project path.
 * Sessions are sorted by updatedAt in descending order (most recent first).
 */

import type { Request, Response } from 'express';
import type { VoiceService } from '../../../services/voice-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createListSessionsHandler(voiceService: VoiceService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath?: string };

      const sessions = await voiceService.listSessions(projectPath);

      res.json({
        success: true,
        sessions,
        count: sessions.length,
      });
    } catch (error) {
      logError(error, 'List voice sessions failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
