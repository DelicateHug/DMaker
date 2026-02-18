/**
 * Voice routes - HTTP API for voice mode interactions
 *
 * Provides endpoints for:
 * - Session management (start, stop, get, list, delete)
 * - Command processing (process-command, stop-processing)
 * - Status management (get-status, update-status)
 * - Settings management (update-settings)
 */

import { Router } from 'express';
import type { VoiceService } from '../../services/voice-service.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createStartSessionHandler } from './routes/start-session.js';
import { createStopSessionHandler } from './routes/stop-session.js';
import { createGetSessionHandler } from './routes/get-session.js';
import { createListSessionsHandler } from './routes/list-sessions.js';
import { createDeleteSessionHandler } from './routes/delete-session.js';
import { createProcessCommandHandler } from './routes/process-command.js';
import { createStopProcessingHandler } from './routes/stop-processing.js';
import { createGetStatusHandler } from './routes/get-status.js';
import { createUpdateStatusHandler } from './routes/update-status.js';
import { createUpdateSettingsHandler } from './routes/update-settings.js';

export function createVoiceRoutes(voiceService: VoiceService): Router {
  const router = Router();

  // Session management
  router.post(
    '/start-session',
    validatePathParams('projectPath'),
    createStartSessionHandler(voiceService)
  );
  router.post('/stop-session', createStopSessionHandler(voiceService));
  router.post('/get-session', createGetSessionHandler(voiceService));
  router.post(
    '/list-sessions',
    validatePathParams('projectPath?'),
    createListSessionsHandler(voiceService)
  );
  router.post('/delete-session', createDeleteSessionHandler(voiceService));

  // Command processing
  router.post('/process-command', createProcessCommandHandler(voiceService));
  router.post('/stop-processing', createStopProcessingHandler(voiceService));

  // Status management
  router.post('/get-status', createGetStatusHandler(voiceService));
  router.post('/update-status', createUpdateStatusHandler(voiceService));

  // Settings management
  router.post('/update-settings', createUpdateSettingsHandler(voiceService));

  return router;
}
