/**
 * Sessions routes - HTTP API for session management
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '@dmaker/utils';
import { AgentService } from '../services/agent-service.js';

// ---------------------------------------------------------------------------
// Logger & error helpers
// ---------------------------------------------------------------------------

const logger = createLogger('Sessions');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`❌ ${context}:`, error);
}

// ---------------------------------------------------------------------------
// GET / - List all sessions
// ---------------------------------------------------------------------------

function createIndexHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const includeArchived = req.query.includeArchived === 'true';
      const sessionsRaw = await agentService.listSessions(includeArchived);

      // Transform to match frontend SessionListItem interface
      const sessions = await Promise.all(
        sessionsRaw.map(async (s) => {
          const messages = await agentService.loadSession(s.id);
          const lastMessage = messages[messages.length - 1];
          const preview = lastMessage?.content?.slice(0, 100) || '';

          return {
            id: s.id,
            name: s.name,
            projectPath: s.projectPath || s.workingDirectory,
            workingDirectory: s.workingDirectory,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            isArchived: s.archived || false,
            tags: s.tags || [],
            messageCount: messages.length,
            preview,
          };
        })
      );

      res.json({ success: true, sessions });
    } catch (error) {
      logError(error, 'List sessions failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST / - Create a new session
// ---------------------------------------------------------------------------

function createCreateHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, projectPath, workingDirectory, model } = req.body as {
        name: string;
        projectPath?: string;
        workingDirectory?: string;
        model?: string;
      };

      if (!name) {
        res.status(400).json({ success: false, error: 'name is required' });
        return;
      }

      const session = await agentService.createSession(name, projectPath, workingDirectory, model);
      res.json({ success: true, session });
    } catch (error) {
      logError(error, 'Create session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// PUT /:sessionId - Update a session
// ---------------------------------------------------------------------------

function createUpdateHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const { name, tags, model } = req.body as {
        name?: string;
        tags?: string[];
        model?: string;
      };

      const session = await agentService.updateSession(sessionId, {
        name,
        tags,
        model,
      });
      if (!session) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      res.json({ success: true, session });
    } catch (error) {
      logError(error, 'Update session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /:sessionId/archive - Archive a session
// ---------------------------------------------------------------------------

function createArchiveHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const success = await agentService.archiveSession(sessionId);

      if (!success) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Archive session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /:sessionId/unarchive - Unarchive a session
// ---------------------------------------------------------------------------

function createUnarchiveHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const success = await agentService.unarchiveSession(sessionId);

      if (!success) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Unarchive session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// DELETE /:sessionId - Delete a session
// ---------------------------------------------------------------------------

function createDeleteHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const success = await agentService.deleteSession(sessionId);

      if (!success) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Delete session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createSessionsRoutes(agentService: AgentService): Router {
  const router = Router();

  router.get('/', createIndexHandler(agentService));
  router.post('/', createCreateHandler(agentService));
  router.put('/:sessionId', createUpdateHandler(agentService));
  router.post('/:sessionId/archive', createArchiveHandler(agentService));
  router.post('/:sessionId/unarchive', createUnarchiveHandler(agentService));
  router.delete('/:sessionId', createDeleteHandler(agentService));

  return router;
}
