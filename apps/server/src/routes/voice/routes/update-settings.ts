/**
 * POST /update-settings endpoint - Update voice session settings
 *
 * Updates the voice settings for a specific session. Use this to
 * change TTS settings, noise gate threshold, or other preferences.
 */

import type { Request, Response } from 'express';
import type { VoiceService } from '../../../services/voice-service.js';
import type { VoiceSettings } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

export function createUpdateSettingsHandler(voiceService: VoiceService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, settings } = req.body as {
        sessionId: string;
        settings: Partial<VoiceSettings>;
      };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      if (!settings || typeof settings !== 'object') {
        res.status(400).json({ success: false, error: 'settings object is required' });
        return;
      }

      const result = await voiceService.updateSessionSettings(sessionId, settings);

      if (!result.success) {
        res.status(404).json({ success: false, error: result.error });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Update voice settings failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
