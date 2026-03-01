/**
 * Deploy routes - HTTP API for listing and running deploy scripts
 *
 * Provides endpoints for:
 * - Listing available scripts in the project's .dmaker/deploy folder
 * - Running a script with real-time SSE streaming output
 * - Querying run history
 *
 * All endpoints use handler factories that receive the DeployScriptRunner instance.
 * Mounted at /api/deploy in the main server.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '@dmaker/utils';
import { secureFs } from '@dmaker/platform';
import type { DeployScriptRunner } from '../services/deploy-service.js';
import type { EventEmitter } from '../lib/events.js';

// ---------------------------------------------------------------------------
// Logger & error helpers
// ---------------------------------------------------------------------------

const logger = createLogger('Deploy');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`❌ ${context}:`, error);
}

// ---------------------------------------------------------------------------
// GET /folder-scripts - List scripts in the deploy folder
// ---------------------------------------------------------------------------

function createFolderScriptsHandler(runner: DeployScriptRunner) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = req.query.projectPath as string | undefined;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath query parameter is required',
        });
        return;
      }

      const scripts = await runner.listScripts(projectPath);
      const folderPath = runner.getDeployFolderPath(projectPath);

      res.json({
        success: true,
        scripts,
        folderPath,
        folderExists: scripts.length > 0 || (await folderExists(runner, projectPath)),
      });
    } catch (error) {
      logError(error, 'List deploy scripts failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/** Check if the deploy folder exists (used when script list is empty) */
async function folderExists(runner: DeployScriptRunner, projectPath: string): Promise<boolean> {
  try {
    const s = await secureFs.stat(runner.getDeployFolderPath(projectPath));
    return s.isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// POST /run - Execute a deploy script with SSE streaming output
// ---------------------------------------------------------------------------

function createRunHandler(runner: DeployScriptRunner, events?: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, scriptName, timeout } = req.body as {
        projectPath?: string;
        scriptName?: string;
        timeout?: number;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!scriptName) {
        res.status(400).json({ success: false, error: 'scriptName is required' });
        return;
      }

      // Set up SSE headers (bypass compression)
      res.setHeader('Content-Encoding', 'identity');
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      if (req.socket) {
        req.socket.setNoDelay(true);
        req.socket.setTimeout(0);
      }

      res.flushHeaders();

      // Send an initial SSE comment to confirm the connection is open.
      res.write(':ok\n\n');

      let clientDisconnected = false;
      req.on('close', () => {
        clientDisconnected = true;
      });

      /** Send an SSE event to the client */
      const sendEvent = (event: string, data: unknown): void => {
        if (clientDisconnected) return;
        try {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        } catch {
          // Client may have disconnected
        }
      };

      await runner.runScript({
        projectPath,
        scriptName,
        timeout,
        onEvent: (event) => {
          // Send via SSE (primary channel)
          sendEvent(event.type, event);

          // Also emit via WebSocket (fallback channel)
          if (events) {
            if (event.type === 'stdout' || event.type === 'stderr') {
              events.emit('deploy:output', { data: event.data });
            } else if (event.type === 'done') {
              const result = event.result;
              if (result.success) {
                events.emit('deploy:success', {
                  message: `Completed "${scriptName}"`,
                  duration: result.duration,
                });
              } else {
                events.emit('deploy:error', {
                  message:
                    result.exitCode != null
                      ? `Failed "${scriptName}" (exit code ${result.exitCode})`
                      : `Failed "${scriptName}"`,
                  error: result.error || `Process exited with code ${result.exitCode}`,
                  exitCode: result.exitCode,
                  duration: result.duration,
                });
              }
            }
          }
        },
      });

      if (!clientDisconnected) {
        res.end();
      }
    } catch (error) {
      logError(error, 'Deploy script run failed');

      // Emit error via WebSocket so fallback clients are notified
      if (events) {
        events.emit('deploy:error', {
          message: 'Deploy script run failed',
          error: getErrorMessage(error),
        });
      }

      if (!res.headersSent) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      } else {
        try {
          res.write(`event: error\ndata: ${JSON.stringify({ error: getErrorMessage(error) })}\n\n`);
          res.end();
        } catch {
          // Client may have disconnected
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// GET /runs - Get deploy run history
// ---------------------------------------------------------------------------

function createRunsHandler(runner: DeployScriptRunner) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const limitStr = req.query.limit as string | undefined;
      const limit = limitStr ? parseInt(limitStr, 10) : undefined;

      const history = runner.getHistory(limit);

      res.json({
        success: true,
        history,
        total: history.length,
      });
    } catch (error) {
      logError(error, 'Get deploy runs failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// DELETE /runs - Clear deploy run history
// ---------------------------------------------------------------------------

function createDeleteRunsHandler(runner: DeployScriptRunner) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const history = runner.getHistory();
      const cleared = history.length;

      runner.clearHistory();

      res.json({
        success: true,
        cleared,
      });
    } catch (error) {
      logError(error, 'Clear deploy run history failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create deploy router with all endpoints
 *
 * Endpoints:
 * - GET    /folder-scripts?projectPath=...  - List deploy folder scripts
 * - POST   /run                             - Run a script with SSE streaming output
 * - GET    /runs?limit=N                    - Get run history
 * - DELETE /runs                            - Clear run history
 */
export function createDeployRoutes(runner: DeployScriptRunner, events?: EventEmitter): Router {
  const router = Router();

  router.get('/folder-scripts', createFolderScriptsHandler(runner));
  router.post('/run', createRunHandler(runner, events));
  router.get('/runs', createRunsHandler(runner));
  router.delete('/runs', createDeleteRunsHandler(runner));

  return router;
}
