/**
 * POST /start-session endpoint - Start a new voice session
 *
 * Creates a new voice interaction session for the specified project.
 * Returns the created session with its ID and initial settings.
 */

import type { Request, Response } from 'express';
import type { VoiceService } from '../../../services/voice-service.js';
import type { CreateVoiceSessionParams } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

export function createStartSessionHandler(voiceService: VoiceService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, settings } = req.body as CreateVoiceSessionParams;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const session = await voiceService.startSession({ projectPath, settings });

      res.json({
        success: true,
        session,
      });
    } catch (error) {
      logError(error, 'Start voice session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
