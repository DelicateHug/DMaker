/**
 * Deploy routes - HTTP API for listing and running deploy scripts
 *
 * Provides endpoints for:
 * - Listing available scripts in the project's .automaker/deploy folder
 * - Running a script with real-time SSE streaming output
 * - Querying run history
 *
 * All endpoints use handler factories that receive the DeployScriptRunner instance.
 * Mounted at /api/deploy in the main server.
 */

import { Router } from 'express';
import type { DeployScriptRunner } from '../../services/deploy-service.js';
import type { EventEmitter } from '../../lib/events.js';
import { createFolderScriptsHandler } from './routes/folder-scripts.js';
import { createRunHandler } from './routes/run.js';
import { createRunsHandler } from './routes/runs.js';
import { createDeleteRunsHandler } from './routes/delete-runs.js';

/**
 * Create deploy router with all endpoints
 *
 * Endpoints:
 * - GET    /folder-scripts?projectPath=...  - List deploy folder scripts
 * - POST   /run                             - Run a script with SSE streaming output
 * - GET    /runs?limit=N                    - Get run history
 * - DELETE /runs                            - Clear run history
 *
 * @param runner - Instance of DeployScriptRunner
 * @param events - Event emitter for WebSocket broadcast of deploy events
 * @returns Express Router configured with all deploy endpoints
 */
export function createDeployRoutes(runner: DeployScriptRunner, events?: EventEmitter): Router {
  const router = Router();

  // List available deploy scripts
  router.get('/folder-scripts', createFolderScriptsHandler(runner));

  // Run a deploy script with SSE streaming output
  router.post('/run', createRunHandler(runner, events));

  // Get run history
  router.get('/runs', createRunsHandler(runner));

  // Clear run history
  router.delete('/runs', createDeleteRunsHandler(runner));

  return router;
}
