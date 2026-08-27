/**
 * Running Agents routes - HTTP API for tracking active agent executions
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { createLogger } from '@dmaker/utils';
import type { AutoModeService } from '../services/auto-mode-service.js';
import type { FeatureLoader } from '../services/feature-loader.js';
import { getBacklogPlanStatus, getRunningDetails } from './backlog-plan.js';
import { getAllRunningGenerations } from './app-spec.js';

// ---------------------------------------------------------------------------
// Logger & error helpers
// ---------------------------------------------------------------------------

const logger = createLogger('RunningAgents');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`\u274c ${context}:`, error);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function createIndexHandler(autoModeService: AutoModeService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const runningAgents = [...(await autoModeService.getRunningAgents())];
      const backlogPlanStatus = getBacklogPlanStatus();
      const backlogPlanDetails = getRunningDetails();

      if (backlogPlanStatus.isRunning && backlogPlanDetails) {
        runningAgents.push({
          featureId: `backlog-plan:${backlogPlanDetails.projectPath}`,
          projectPath: backlogPlanDetails.projectPath,
          projectName: path.basename(backlogPlanDetails.projectPath),
          isAutoMode: false,
          title: 'Backlog plan',
          description: backlogPlanDetails.prompt,
        });
      }

      // Add spec/feature generation tasks
      const specGenerations = getAllRunningGenerations();
      for (const generation of specGenerations) {
        let title: string;
        let description: string;

        switch (generation.type) {
          case 'feature_generation':
            title = 'Generating features from spec';
            description = 'Creating features from the project specification';
            break;
          case 'sync':
            title = 'Syncing spec with code';
            description = 'Updating spec from codebase and completed features';
            break;
          default:
            title = 'Regenerating spec';
            description = 'Analyzing project and generating specification';
        }

        runningAgents.push({
          featureId: `spec-generation:${generation.projectPath}`,
          projectPath: generation.projectPath,
          projectName: path.basename(generation.projectPath),
          isAutoMode: false,
          title,
          description,
        });
      }

      res.json({
        success: true,
        runningAgents,
        totalCount: runningAgents.length,
      });
    } catch (error) {
      logError(error, 'Get running agents failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /tree - Get the parent/child agent tree for one feature
// ---------------------------------------------------------------------------

/**
 * The live tracker wins over the sidecar: the sidecar is only rewritten on the
 * 10s metrics interval and at teardown, so mid-run it is up to ten seconds
 * stale and can be missing a sub-agent the UI has already been told about.
 *
 * `tree: null` is a normal answer, not a failure - every run recorded before
 * the tree was tracked has no sidecar, and the client synthesises a one-node
 * tree over the flat transcript for those.
 */
export function createTreeHandler(autoModeService: AutoModeService, featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body as {
        projectPath: string;
        featureId: string;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId are required',
        });
        return;
      }

      const tree =
        autoModeService.getInMemoryAgentTree(featureId) ??
        (await featureLoader.getAgentTree(projectPath, featureId));

      res.json({ success: true, tree });
    } catch (error) {
      logError(error, 'Get agent tree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createRunningAgentsRoutes(
  autoModeService: AutoModeService,
  featureLoader: FeatureLoader
): Router {
  const router = Router();

  router.get('/', createIndexHandler(autoModeService));
  router.post('/tree', createTreeHandler(autoModeService, featureLoader));

  return router;
}
