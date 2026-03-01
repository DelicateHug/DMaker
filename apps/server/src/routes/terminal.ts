/**
 * Terminal routes with password protection
 *
 * Consolidated from terminal/ directory into a single flat file.
 *
 * Provides REST API for terminal session management and authentication.
 * WebSocket connections for real-time I/O are handled separately in the main index.ts.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { createLogger } from '@dmaker/utils';
import {
  getTerminalService,
  MIN_MAX_SESSIONS,
  MAX_MAX_SESSIONS,
} from '../services/terminal-service.js';

// ---------------------------------------------------------------------------
// Logger & error helpers
// ---------------------------------------------------------------------------

const logger = createLogger('Terminal');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`Terminal ${context}:`, error);
}

// ---------------------------------------------------------------------------
// Module-level state & token management
// ---------------------------------------------------------------------------

// Read env variables lazily to ensure dotenv has loaded them
function getTerminalPassword(): string | undefined {
  return process.env.TERMINAL_PASSWORD;
}

function getTerminalEnabledConfig(): boolean {
  return process.env.TERMINAL_ENABLED !== 'false'; // Enabled by default
}

// In-memory session tokens (would use Redis in production)
const validTokens: Map<string, { createdAt: Date; expiresAt: Date }> = new Map();
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Add a token to the valid tokens map
 */
function addToken(token: string, data: { createdAt: Date; expiresAt: Date }): void {
  validTokens.set(token, data);
}

/**
 * Delete a token from the valid tokens map
 */
function deleteToken(token: string): void {
  validTokens.delete(token);
}

/**
 * Generate a cryptographically secure random token
 */
function generateToken(): string {
  return `term-${randomBytes(32).toString('base64url')}`;
}

/**
 * Clean up expired tokens
 */
function cleanupExpiredTokens(): void {
  const now = new Date();
  validTokens.forEach((data, token) => {
    if (data.expiresAt < now) {
      validTokens.delete(token);
    }
  });
}

// Clean up expired tokens every 5 minutes
setInterval(cleanupExpiredTokens, 5 * 60 * 1000);

/**
 * Validate a terminal session token
 */
export function validateTerminalToken(token: string | undefined): boolean {
  if (!token) return false;

  const tokenData = validTokens.get(token);
  if (!tokenData) return false;

  if (tokenData.expiresAt < new Date()) {
    validTokens.delete(token);
    return false;
  }

  return true;
}

/**
 * Check if terminal requires password
 */
export function isTerminalPasswordRequired(): boolean {
  return !!getTerminalPassword();
}

/**
 * Check if terminal is enabled
 */
export function isTerminalEnabled(): boolean {
  return getTerminalEnabledConfig();
}

/**
 * Terminal authentication middleware
 * Checks for valid session token if password is configured
 */
function terminalAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check if terminal is enabled
  if (!getTerminalEnabledConfig()) {
    res.status(403).json({
      success: false,
      error: 'Terminal access is disabled',
    });
    return;
  }

  // If no password configured, allow all requests
  if (!getTerminalPassword()) {
    next();
    return;
  }

  // Check for session token
  const token = (req.headers['x-terminal-token'] as string) || (req.query.token as string);

  if (!validateTerminalToken(token)) {
    res.status(401).json({
      success: false,
      error: 'Terminal authentication required',
      passwordRequired: true,
    });
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function createStatusHandler() {
  return (_req: Request, res: Response): void => {
    const terminalService = getTerminalService();
    res.json({
      success: true,
      data: {
        enabled: getTerminalEnabledConfig(),
        passwordRequired: isTerminalPasswordRequired(),
        platform: terminalService.getPlatformInfo(),
      },
    });
  };
}

function createAuthHandler() {
  return (req: Request, res: Response): void => {
    if (!getTerminalEnabledConfig()) {
      res.status(403).json({
        success: false,
        error: 'Terminal access is disabled',
      });
      return;
    }

    const terminalPassword = getTerminalPassword();

    // If no password required, return immediate success
    if (!terminalPassword) {
      res.json({
        success: true,
        data: {
          authenticated: true,
          passwordRequired: false,
        },
      });
      return;
    }

    const { password } = req.body;

    if (!password || password !== terminalPassword) {
      res.status(401).json({
        success: false,
        error: 'Invalid password',
      });
      return;
    }

    // Generate session token
    const token = generateToken();
    const now = new Date();
    addToken(token, {
      createdAt: now,
      expiresAt: new Date(now.getTime() + TOKEN_EXPIRY_MS),
    });

    res.json({
      success: true,
      data: {
        authenticated: true,
        token,
        expiresIn: TOKEN_EXPIRY_MS,
      },
    });
  };
}

function createLogoutHandler() {
  return (req: Request, res: Response): void => {
    const token = (req.headers['x-terminal-token'] as string) || req.body.token;

    if (token) {
      deleteToken(token);
    }

    res.json({
      success: true,
    });
  };
}

function createSessionsListHandler() {
  return (_req: Request, res: Response): void => {
    const terminalService = getTerminalService();
    const sessions = terminalService.getAllSessions();
    res.json({
      success: true,
      data: sessions,
    });
  };
}

function createSessionsCreateHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const terminalService = getTerminalService();
      const { cwd, cols, rows, shell } = req.body;

      const session = await terminalService.createSession({
        cwd,
        cols: cols || 80,
        rows: rows || 24,
        shell,
      });

      // Check if session creation was refused due to limit
      if (!session) {
        const maxSessions = terminalService.getMaxSessions();
        const currentSessions = terminalService.getSessionCount();
        logger.warn(`Session limit reached: ${currentSessions}/${maxSessions}`);
        res.status(429).json({
          success: false,
          error: 'Maximum terminal sessions reached',
          details: `Server limit is ${maxSessions} concurrent sessions. Please close unused terminals.`,
          currentSessions,
          maxSessions,
        });
        return;
      }

      res.json({
        success: true,
        data: {
          id: session.id,
          cwd: session.cwd,
          shell: session.shell,
          createdAt: session.createdAt,
        },
      });
    } catch (error) {
      logError(error, 'Create terminal session failed');
      res.status(500).json({
        success: false,
        error: 'Failed to create terminal session',
        details: getErrorMessage(error),
      });
    }
  };
}

function createSessionDeleteHandler() {
  return (req: Request, res: Response): void => {
    const terminalService = getTerminalService();
    const { id } = req.params;
    const killed = terminalService.killSession(id);

    if (!killed) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    res.json({
      success: true,
    });
  };
}

function createSessionResizeHandler() {
  return (req: Request, res: Response): void => {
    const terminalService = getTerminalService();
    const { id } = req.params;
    const { cols, rows } = req.body;

    if (!cols || !rows) {
      res.status(400).json({
        success: false,
        error: 'cols and rows are required',
      });
      return;
    }

    const resized = terminalService.resize(id, cols, rows);

    if (!resized) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    res.json({
      success: true,
    });
  };
}

function createSettingsGetHandler() {
  return (_req: Request, res: Response): void => {
    try {
      const terminalService = getTerminalService();
      res.json({
        success: true,
        data: {
          maxSessions: terminalService.getMaxSessions(),
          currentSessions: terminalService.getSessionCount(),
        },
      });
    } catch (error) {
      logError(error, 'Get terminal settings failed');
      res.status(500).json({
        success: false,
        error: 'Failed to get terminal settings',
        details: getErrorMessage(error),
      });
    }
  };
}

function createSettingsUpdateHandler() {
  return (req: Request, res: Response): void => {
    try {
      const terminalService = getTerminalService();
      const { maxSessions } = req.body;

      // Validate maxSessions if provided
      if (maxSessions !== undefined) {
        if (typeof maxSessions !== 'number') {
          res.status(400).json({
            success: false,
            error: 'maxSessions must be a number',
          });
          return;
        }
        if (!Number.isInteger(maxSessions)) {
          res.status(400).json({
            success: false,
            error: 'maxSessions must be an integer',
          });
          return;
        }
        if (maxSessions < MIN_MAX_SESSIONS || maxSessions > MAX_MAX_SESSIONS) {
          res.status(400).json({
            success: false,
            error: `maxSessions must be between ${MIN_MAX_SESSIONS} and ${MAX_MAX_SESSIONS}`,
          });
          return;
        }
        terminalService.setMaxSessions(maxSessions);
      }

      res.json({
        success: true,
        data: {
          maxSessions: terminalService.getMaxSessions(),
          currentSessions: terminalService.getSessionCount(),
        },
      });
    } catch (error) {
      logError(error, 'Update terminal settings failed');
      res.status(500).json({
        success: false,
        error: 'Failed to update terminal settings',
        details: getErrorMessage(error),
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createTerminalRoutes(): Router {
  const router = Router();

  router.get('/status', createStatusHandler());
  router.post('/auth', createAuthHandler());
  router.post('/logout', createLogoutHandler());

  // Apply terminal auth middleware to all routes below
  router.use(terminalAuthMiddleware);

  router.get('/sessions', createSessionsListHandler());
  router.post('/sessions', createSessionsCreateHandler());
  router.delete('/sessions/:id', createSessionDeleteHandler());
  router.post('/sessions/:id/resize', createSessionResizeHandler());
  router.get('/settings', createSettingsGetHandler());
  router.put('/settings', createSettingsUpdateHandler());

  return router;
}
