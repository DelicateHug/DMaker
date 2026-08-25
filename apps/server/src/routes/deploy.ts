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
import path from 'path';
import { createLogger } from '@dmaker/utils';
import { secureFs } from '@dmaker/platform';
import type { DeployScriptRunner } from '../services/deploy-service.js';
import {
  ensureFrontmatter,
  parseScriptFrontmatter,
  upsertFrontmatter,
} from '../services/deploy-script-meta.js';
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
// Script authoring - read, write and delete files in .dmaker/deploy
// ---------------------------------------------------------------------------

/** Extensions the deploy runner knows how to execute. */
const ALLOWED_SCRIPT_EXTENSIONS = ['.ps1', '.sh', '.bat', '.cmd', '.js', '.py'];

/**
 * Resolve a script's absolute path inside the project's deploy folder.
 * Rejects anything that escapes the folder or is not a runnable script.
 */
function resolveScriptPath(
  runner: DeployScriptRunner,
  projectPath: string,
  relativePath: string
): { path: string } | { error: string } {
  const folder = runner.getDeployFolderPath(projectPath);
  const target = path.resolve(folder, relativePath);
  const relative = path.relative(folder, target);

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { error: 'Script path must stay inside the deploy folder' };
  }
  if (!ALLOWED_SCRIPT_EXTENSIONS.includes(path.extname(target).toLowerCase())) {
    return {
      error: `Script must use one of: ${ALLOWED_SCRIPT_EXTENSIONS.join(', ')}`,
    };
  }
  return { path: target };
}

/** GET /script - Read one script's contents for editing */
function createReadScriptHandler(runner: DeployScriptRunner) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = req.query.projectPath as string | undefined;
      const scriptPath = req.query.path as string | undefined;

      if (!projectPath || !scriptPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath and path query parameters are required',
        });
        return;
      }

      const resolved = resolveScriptPath(runner, projectPath, scriptPath);
      if ('error' in resolved) {
        res.status(400).json({ success: false, error: resolved.error });
        return;
      }

      const content = String(await secureFs.readFile(resolved.path, 'utf-8'));
      const meta = parseScriptFrontmatter(content);
      res.json({ success: true, content, path: resolved.path, meta });
    } catch (error) {
      logError(error, 'Read deploy script failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/** POST /script - Create or update a script in the deploy folder */
function createSaveScriptHandler(runner: DeployScriptRunner) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        path: scriptPath,
        content,
      } = req.body as {
        projectPath?: string;
        path?: string;
        content?: string;
      };

      if (!projectPath || !scriptPath || typeof content !== 'string') {
        res.status(400).json({
          success: false,
          error: 'projectPath, path and content are required',
        });
        return;
      }

      const resolved = resolveScriptPath(runner, projectPath, scriptPath);
      if ('error' in resolved) {
        res.status(400).json({ success: false, error: resolved.error });
        return;
      }

      // Keep the script's identity across edits. If the incoming content
      // still declares an id we take it as-is; if the author deleted the
      // frontmatter we restore the id the file already had on disk, so its
      // run history stays attached. Only a genuinely new script gets a new id.
      const extension = path.extname(resolved.path).toLowerCase();
      let finalContent = content;

      if (!parseScriptFrontmatter(content)) {
        let existingId: string | undefined;
        try {
          const onDisk = String(await secureFs.readFile(resolved.path, 'utf-8'));
          existingId = parseScriptFrontmatter(onDisk)?.id;
        } catch {
          // New file — nothing to preserve
        }
        finalContent = existingId
          ? upsertFrontmatter(content, { id: existingId }, extension)
          : ensureFrontmatter(content, extension).updatedContent!;
      }

      await secureFs.mkdir(path.dirname(resolved.path), { recursive: true });
      await secureFs.writeFile(resolved.path, finalContent, 'utf-8');
      logger.info(`Saved deploy script: ${resolved.path}`);

      res.json({
        success: true,
        path: resolved.path,
        content: finalContent,
        meta: parseScriptFrontmatter(finalContent),
      });
    } catch (error) {
      logError(error, 'Save deploy script failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/** DELETE /script - Remove a script from the deploy folder */
function createDeleteScriptHandler(runner: DeployScriptRunner) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, path: scriptPath } = req.body as {
        projectPath?: string;
        path?: string;
      };

      if (!projectPath || !scriptPath) {
        res.status(400).json({ success: false, error: 'projectPath and path are required' });
        return;
      }

      const resolved = resolveScriptPath(runner, projectPath, scriptPath);
      if ('error' in resolved) {
        res.status(400).json({ success: false, error: resolved.error });
        return;
      }

      await secureFs.unlink(resolved.path);
      logger.info(`Deleted deploy script: ${resolved.path}`);

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Delete deploy script failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /run - Execute a deploy script with SSE streaming output
// ---------------------------------------------------------------------------

function createRunHandler(runner: DeployScriptRunner, events?: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        scriptName,
        timeout,
        runId: requestedRunId,
      } = req.body as {
        projectPath?: string;
        scriptName?: string;
        timeout?: number;
        runId?: string;
      };

      // Clients pass their own run id so they can route streamed output to
      // the right run when several are in flight at once.
      const runId =
        typeof requestedRunId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(requestedRunId)
          ? requestedRunId
          : undefined;

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
        runId,
        timeout,
        onEvent: (event) => {
          // Send via SSE (primary channel)
          sendEvent(event.type, event);

          // Also emit via WebSocket (fallback channel). Every payload carries
          // the run id so clients watching concurrent runs can tell them apart.
          if (events) {
            if (event.type === 'stdout' || event.type === 'stderr') {
              events.emit('deploy:output', {
                runId: event.runId,
                scriptName,
                data: event.data,
              });
            } else if (event.type === 'start') {
              events.emit('deploy:started', {
                runId: event.runId,
                scriptId: event.script.id,
                scriptName,
                startedAt: new Date().toISOString(),
              });
            } else if (event.type === 'done') {
              const result = event.result;
              if (result.success) {
                events.emit('deploy:success', {
                  runId: event.runId,
                  scriptId: result.scriptId,
                  scriptName,
                  message: `Completed "${scriptName}"`,
                  duration: result.duration,
                });
              } else {
                events.emit('deploy:error', {
                  runId: event.runId,
                  scriptId: result.scriptId,
                  scriptName,
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
      const scriptId = (req.query.scriptId as string | undefined) || undefined;

      const history = runner.getHistory({ limit, scriptId });

      res.json({
        success: true,
        history,
        total: history.length,
        active: runner.getActiveRuns(scriptId),
      });
    } catch (error) {
      logError(error, 'Get deploy runs failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /cancel - Stop a run in flight
// ---------------------------------------------------------------------------

function createCancelHandler(runner: DeployScriptRunner) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { runId } = req.body as { runId?: string };

      if (!runId) {
        res.status(400).json({ success: false, error: 'runId is required' });
        return;
      }

      const cancelled = runner.cancelRun(runId);
      res.json({ success: true, cancelled });
    } catch (error) {
      logError(error, 'Cancel deploy run failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// DELETE /runs - Clear deploy run history
// ---------------------------------------------------------------------------

function createDeleteRunsHandler(runner: DeployScriptRunner) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { scriptId, runId } = (req.body ?? {}) as { scriptId?: string; runId?: string };

      // Deleting one run, one script's runs, or everything.
      if (runId) {
        const deleted = runner.deleteRun(runId);
        res.json({ success: true, cleared: deleted ? 1 : 0 });
        return;
      }

      const cleared = runner.clearHistory(scriptId);
      res.json({ success: true, cleared });
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
 * - GET    /folder-scripts?projectPath=...     - List deploy folder scripts
 * - GET    /script?projectPath=...&path=...    - Read one script for editing
 * - POST   /script                             - Create or update a script
 * - DELETE /script                             - Delete a script
 * - POST   /run                                - Run a script with SSE streaming output
 * - POST   /cancel                             - Stop a run in flight
 * - GET    /runs?limit=N&scriptId=...          - Get run history (optionally per script)
 * - DELETE /runs                               - Clear run history (all, per script, or one run)
 */
export function createDeployRoutes(runner: DeployScriptRunner, events?: EventEmitter): Router {
  const router = Router();

  router.get('/folder-scripts', createFolderScriptsHandler(runner));
  router.get('/script', createReadScriptHandler(runner));
  router.post('/script', createSaveScriptHandler(runner));
  router.delete('/script', createDeleteScriptHandler(runner));
  router.post('/run', createRunHandler(runner, events));
  router.post('/cancel', createCancelHandler(runner));
  router.get('/runs', createRunsHandler(runner));
  router.delete('/runs', createDeleteRunsHandler(runner));

  return router;
}
