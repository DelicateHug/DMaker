/**
 * POST /process-command endpoint - Process a voice command
 *
 * Takes transcribed text and processes it through the AI to generate
 * a response. Handles command interpretation and execution, emitting
 * appropriate events throughout the process.
 */

import type { Request, Response } from 'express';
import type { VoiceService } from '../../../services/voice-service.js';
import type { ProcessVoiceCommandRequest } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

export function createProcessCommandHandler(voiceService: VoiceService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, text, audioDurationMs, confidence } =
        req.body as ProcessVoiceCommandRequest;

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      if (!text) {
        res.status(400).json({ success: false, error: 'text is required' });
        return;
      }

      // Check if session exists
      const session = await voiceService.getSession(sessionId);
      if (!session) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      // Check if session is already processing
      if (voiceService.isSessionProcessing(sessionId)) {
        res.status(409).json({
          success: false,
          error: 'Session is already processing a command',
        });
        return;
      }

      const response = await voiceService.processCommand({
        sessionId,
        text,
        audioDurationMs,
        confidence,
      });

      res.json({
        success: true,
        ...response,
      });
    } catch (error) {
      logError(error, 'Process voice command failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
