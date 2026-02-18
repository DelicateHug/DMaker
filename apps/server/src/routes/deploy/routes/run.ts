/**
 * POST /run endpoint - Execute a deploy script with SSE streaming output
 *
 * Runs a script from the project's .automaker/deploy folder and streams
 * real-time stdout/stderr via Server-Sent Events (SSE).
 *
 * Additionally emits deploy events via the WebSocket event emitter so that
 * clients can fall back to WebSocket when SSE streaming is unreliable
 * (e.g. proxies that buffer SSE, Electron environments, etc.).
 *
 * Request body:
 * - projectPath (required) - Absolute path to the project directory
 * - scriptName  (required) - Script filename in the deploy folder
 * - timeout     (optional) - Timeout in milliseconds (default: 5 minutes)
 *
 * SSE Event Types:
 * - start   - Script execution started
 * - stdout  - Standard output chunk from script
 * - stderr  - Standard error chunk from script
 * - done    - Script execution finished (includes full result)
 * - error   - Fatal error preventing execution
 */

import type { Request, Response } from 'express';
import type { DeployScriptRunner } from '../../../services/deploy-service.js';
import type { EventEmitter } from '../../../lib/events.js';
import { getErrorMessage, logError } from '../common.js';

export function createRunHandler(runner: DeployScriptRunner, events?: EventEmitter) {
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
      // This forces any buffering proxies/middleware to flush and ensures
      // the client's fetch promise resolves immediately.
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

          // Also emit via WebSocket (fallback channel) so clients that
          // cannot receive SSE still get real-time updates
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
