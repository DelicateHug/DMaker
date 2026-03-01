/**
 * Pipeline routes - HTTP API for pipeline configuration management
 *
 * Provides endpoints for:
 * - Getting pipeline configuration
 * - Saving pipeline configuration
 * - Adding, updating, deleting, and reordering pipeline steps
 *
 * All endpoints use handler factories that receive the PipelineService instance.
 * Mounted at /api/pipeline in the main server.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '@dmaker/utils';
import type { PipelineService } from '../services/pipeline-service.js';
import type { PipelineStep, PipelineConfig } from '@dmaker/types';
import { validatePathParams } from '../middleware.js';

// ---------------------------------------------------------------------------
// Logger & error helpers
// ---------------------------------------------------------------------------

const logger = createLogger('Pipeline');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`❌ ${context}:`, error);
}

// ---------------------------------------------------------------------------
// POST /config - Get pipeline configuration
// ---------------------------------------------------------------------------

function createGetConfigHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const config = await pipelineService.getPipelineConfig(projectPath);

      res.json({
        success: true,
        config,
      });
    } catch (error) {
      logError(error, 'Get pipeline config failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /config/save - Save entire pipeline configuration
// ---------------------------------------------------------------------------

function createSaveConfigHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, config } = req.body as {
        projectPath: string;
        config: PipelineConfig;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!config) {
        res.status(400).json({ success: false, error: 'config is required' });
        return;
      }

      await pipelineService.savePipelineConfig(projectPath, config);

      res.json({
        success: true,
      });
    } catch (error) {
      logError(error, 'Save pipeline config failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /steps/add - Add a new pipeline step
// ---------------------------------------------------------------------------

function createAddStepHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, step } = req.body as {
        projectPath: string;
        step: Omit<PipelineStep, 'id' | 'createdAt' | 'updatedAt'>;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!step) {
        res.status(400).json({ success: false, error: 'step is required' });
        return;
      }

      if (!step.name) {
        res.status(400).json({ success: false, error: 'step.name is required' });
        return;
      }

      if (step.instructions === undefined) {
        res.status(400).json({ success: false, error: 'step.instructions is required' });
        return;
      }

      const newStep = await pipelineService.addStep(projectPath, step);

      res.json({
        success: true,
        step: newStep,
      });
    } catch (error) {
      logError(error, 'Add pipeline step failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /steps/update - Update an existing pipeline step
// ---------------------------------------------------------------------------

function createUpdateStepHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, stepId, updates } = req.body as {
        projectPath: string;
        stepId: string;
        updates: Partial<Omit<PipelineStep, 'id' | 'createdAt'>>;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!stepId) {
        res.status(400).json({ success: false, error: 'stepId is required' });
        return;
      }

      if (!updates || Object.keys(updates).length === 0) {
        res.status(400).json({ success: false, error: 'updates is required' });
        return;
      }

      const updatedStep = await pipelineService.updateStep(projectPath, stepId, updates);

      res.json({
        success: true,
        step: updatedStep,
      });
    } catch (error) {
      logError(error, 'Update pipeline step failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /steps/delete - Delete a pipeline step
// ---------------------------------------------------------------------------

function createDeleteStepHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, stepId } = req.body as {
        projectPath: string;
        stepId: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!stepId) {
        res.status(400).json({ success: false, error: 'stepId is required' });
        return;
      }

      await pipelineService.deleteStep(projectPath, stepId);

      res.json({
        success: true,
      });
    } catch (error) {
      logError(error, 'Delete pipeline step failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /steps/reorder - Reorder pipeline steps
// ---------------------------------------------------------------------------

function createReorderStepsHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, stepIds } = req.body as {
        projectPath: string;
        stepIds: string[];
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!stepIds || !Array.isArray(stepIds)) {
        res.status(400).json({ success: false, error: 'stepIds array is required' });
        return;
      }

      await pipelineService.reorderSteps(projectPath, stepIds);

      res.json({
        success: true,
      });
    } catch (error) {
      logError(error, 'Reorder pipeline steps failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create pipeline router with all endpoints
 *
 * Endpoints:
 * - POST /config - Get pipeline configuration
 * - POST /config/save - Save entire pipeline configuration
 * - POST /steps/add - Add a new pipeline step
 * - POST /steps/update - Update an existing pipeline step
 * - POST /steps/delete - Delete a pipeline step
 * - POST /steps/reorder - Reorder pipeline steps
 */
export function createPipelineRoutes(pipelineService: PipelineService): Router {
  const router = Router();

  router.post(
    '/config',
    validatePathParams('projectPath'),
    createGetConfigHandler(pipelineService)
  );

  router.post(
    '/config/save',
    validatePathParams('projectPath'),
    createSaveConfigHandler(pipelineService)
  );

  router.post(
    '/steps/add',
    validatePathParams('projectPath'),
    createAddStepHandler(pipelineService)
  );
  router.post(
    '/steps/update',
    validatePathParams('projectPath'),
    createUpdateStepHandler(pipelineService)
  );
  router.post(
    '/steps/delete',
    validatePathParams('projectPath'),
    createDeleteStepHandler(pipelineService)
  );
  router.post(
    '/steps/reorder',
    validatePathParams('projectPath'),
    createReorderStepsHandler(pipelineService)
  );

  return router;
}
