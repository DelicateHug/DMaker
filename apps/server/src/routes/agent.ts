/**
 * Agent routes - HTTP API for Claude agent interactions
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '@dmaker/utils';
import type { ThinkingLevel } from '@dmaker/types';
import { AgentService } from '../services/agent-service.js';
import type { EventEmitter } from '../lib/events.js';
import { validatePathParams } from '../middleware.js';

// ---------------------------------------------------------------------------
// Logger & error helpers
// ---------------------------------------------------------------------------

const logger = createLogger('Agent');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`❌ ${context}:`, error);
}

// ---------------------------------------------------------------------------
// POST /start - Start a conversation
// ---------------------------------------------------------------------------

function createStartHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, workingDirectory } = req.body as {
        sessionId: string;
        workingDirectory?: string;
      };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      const result = await agentService.startConversation({
        sessionId,
        workingDirectory,
      });

      res.json(result);
    } catch (error) {
      logError(error, 'Start conversation failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /send - Send a message
// ---------------------------------------------------------------------------

function createSendHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, message, workingDirectory, imagePaths, model, thinkingLevel } =
        req.body as {
          sessionId: string;
          message: string;
          workingDirectory?: string;
          imagePaths?: string[];
          model?: string;
          thinkingLevel?: ThinkingLevel;
        };

      logger.debug('Received request:', {
        sessionId,
        messageLength: message?.length,
        workingDirectory,
        imageCount: imagePaths?.length || 0,
        model,
        thinkingLevel,
      });

      if (!sessionId || !message) {
        logger.warn('Validation failed - missing sessionId or message');
        res.status(400).json({
          success: false,
          error: 'sessionId and message are required',
        });
        return;
      }

      logger.debug('Validation passed, calling agentService.sendMessage()');

      // Start the message processing (don't await - it streams via WebSocket)
      agentService
        .sendMessage({
          sessionId,
          message,
          workingDirectory,
          imagePaths,
          model,
          thinkingLevel,
        })
        .catch((error) => {
          logger.error('Background error in sendMessage():', error);
          logError(error, 'Send message failed (background)');
        });

      logger.debug('Returning immediate response to client');

      // Return immediately - responses come via WebSocket
      res.json({ success: true, message: 'Message sent' });
    } catch (error) {
      logger.error('Synchronous error:', error);
      logError(error, 'Send message failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /history - Get conversation history
// ---------------------------------------------------------------------------

function createHistoryHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.body as { sessionId: string };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      const result = agentService.getHistory(sessionId);
      res.json(result);
    } catch (error) {
      logError(error, 'Get history failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /stop - Stop execution
// ---------------------------------------------------------------------------

function createStopHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.body as { sessionId: string };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      const result = await agentService.stopExecution(sessionId);
      res.json(result);
    } catch (error) {
      logError(error, 'Stop execution failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /clear - Clear conversation
// ---------------------------------------------------------------------------

function createClearHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.body as { sessionId: string };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      const result = await agentService.clearSession(sessionId);
      res.json(result);
    } catch (error) {
      logError(error, 'Clear session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /model - Set session model
// ---------------------------------------------------------------------------

function createModelHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, model } = req.body as {
        sessionId: string;
        model: string;
      };

      if (!sessionId || !model) {
        res.status(400).json({ success: false, error: 'sessionId and model are required' });
        return;
      }

      const result = await agentService.setSessionModel(sessionId, model);
      res.json({ success: result });
    } catch (error) {
      logError(error, 'Set session model failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /queue/add - Add a prompt to the queue
// ---------------------------------------------------------------------------

function createQueueAddHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, message, imagePaths, model, thinkingLevel } = req.body as {
        sessionId: string;
        message: string;
        imagePaths?: string[];
        model?: string;
        thinkingLevel?: ThinkingLevel;
      };

      if (!sessionId || !message) {
        res.status(400).json({
          success: false,
          error: 'sessionId and message are required',
        });
        return;
      }

      const result = await agentService.addToQueue(sessionId, {
        message,
        imagePaths,
        model,
        thinkingLevel,
      });
      res.json(result);
    } catch (error) {
      logError(error, 'Add to queue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /queue/list - List queued prompts
// ---------------------------------------------------------------------------

function createQueueListHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.body as { sessionId: string };

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'sessionId is required',
        });
        return;
      }

      const result = agentService.getQueue(sessionId);
      res.json(result);
    } catch (error) {
      logError(error, 'List queue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /queue/remove - Remove a prompt from the queue
// ---------------------------------------------------------------------------

function createQueueRemoveHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, promptId } = req.body as {
        sessionId: string;
        promptId: string;
      };

      if (!sessionId || !promptId) {
        res.status(400).json({
          success: false,
          error: 'sessionId and promptId are required',
        });
        return;
      }

      const result = await agentService.removeFromQueue(sessionId, promptId);
      res.json(result);
    } catch (error) {
      logError(error, 'Remove from queue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /queue/clear - Clear all prompts from the queue
// ---------------------------------------------------------------------------

function createQueueClearHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.body as { sessionId: string };

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'sessionId is required',
        });
        return;
      }

      const result = await agentService.clearQueue(sessionId);
      res.json(result);
    } catch (error) {
      logError(error, 'Clear queue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createAgentRoutes(agentService: AgentService, _events: EventEmitter): Router {
  const router = Router();

  router.post('/start', validatePathParams('workingDirectory?'), createStartHandler(agentService));
  router.post(
    '/send',
    validatePathParams('workingDirectory?', 'imagePaths[]'),
    createSendHandler(agentService)
  );
  router.post('/history', createHistoryHandler(agentService));
  router.post('/stop', createStopHandler(agentService));
  router.post('/clear', createClearHandler(agentService));
  router.post('/model', createModelHandler(agentService));

  // Queue routes
  router.post(
    '/queue/add',
    validatePathParams('imagePaths[]'),
    createQueueAddHandler(agentService)
  );
  router.post('/queue/list', createQueueListHandler(agentService));
  router.post('/queue/remove', createQueueRemoveHandler(agentService));
  router.post('/queue/clear', createQueueClearHandler(agentService));

  return router;
}
