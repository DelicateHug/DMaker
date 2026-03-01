/**
 * Models routes - HTTP API for model providers and availability
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '@dmaker/utils';
import { ProviderFactory } from '../providers/provider-factory.js';

// ---------------------------------------------------------------------------
// Logger & error helpers
// ---------------------------------------------------------------------------

const logger = createLogger('Models');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`\u274c ${context}:`, error);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function createAvailableHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Get all models from all registered providers (Claude + Cursor)
      const models = ProviderFactory.getAllAvailableModels();

      res.set('Cache-Control', 'public, max-age=300'); // 5 minutes
      res.json({ success: true, models });
    } catch (error) {
      logError(error, 'Get available models failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createProvidersHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Get installation status from all providers
      const statuses = await ProviderFactory.checkAllProviders();

      const providers: Record<string, any> = {
        anthropic: {
          available: statuses.claude?.installed || false,
          hasApiKey: !!process.env.ANTHROPIC_API_KEY,
        },
        cursor: {
          available: statuses.cursor?.installed || false,
          version: statuses.cursor?.version,
          path: statuses.cursor?.path,
          method: statuses.cursor?.method,
          authenticated: statuses.cursor?.authenticated,
        },
      };

      res.set('Cache-Control', 'public, max-age=30'); // 30 seconds
      res.json({ success: true, providers });
    } catch (error) {
      logError(error, 'Get providers failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createModelsRoutes(): Router {
  const router = Router();

  router.get('/available', createAvailableHandler());
  router.get('/providers', createProvidersHandler());

  return router;
}
