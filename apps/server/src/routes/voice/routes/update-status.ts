/**
 * POST /update-status endpoint - Update voice session status
 *
 * Updates the current status of a voice session (e.g., recording,
 * processing, transcribing). Used by the UI to sync session state.
 */

import type { Request, Response } from 'express';
import type { VoiceService } from '../../../services/voice-service.js';
import type { VoiceSessionStatus } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

const VALID_STATUSES: VoiceSessionStatus[] = [
  'idle',
  'recording',
  'processing',
  'transcribing',
  'responding',
  'speaking',
  'error',
];

export function createUpdateStatusHandler(voiceService: VoiceService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, status } = req.body as {
        sessionId: string;
        status: VoiceSessionStatus;
      };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      if (!status) {
        res.status(400).json({ success: false, error: 'status is required' });
        return;
      }

      if (!VALID_STATUSES.includes(status)) {
        res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        });
        return;
      }

      const result = await voiceService.updateSessionStatus(sessionId, status);

      if (!result.success) {
        res.status(404).json({ success: false, error: result.error });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Update voice session status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
