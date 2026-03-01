/**
 * Auto Mode routes - HTTP API for autonomous feature implementation
 *
 * Uses the AutoModeService for real feature execution with Claude Agent SDK
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AutoModeService } from '../services/auto-mode-service.js';
import { validatePathParams } from '../middleware.js';
import { createLogger } from '@dmaker/utils';
import { getBlockingDependencies } from '@dmaker/dependency-resolver';
import { getGitHubSyncService } from '../services/github-sync-service.js';

// ---------------------------------------------------------------------------
// Logger & error helpers (inlined from common.ts)
// ---------------------------------------------------------------------------

const logger = createLogger('AutoMode');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`\u274C ${context}:`, error);
}

// ---------------------------------------------------------------------------
// POST /run-feature - Run a single feature
// ---------------------------------------------------------------------------

function createRunFeatureHandler(autoModeService: AutoModeService) {
  // Use the shared FeatureLoader from AutoModeService to avoid separate cache instances
  const featureLoader = autoModeService.getFeatureLoader();

  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, forceRun, forceRunClaimed } = req.body as {
        projectPath: string;
        featureId: string;
        forceRun?: boolean; // If true, bypass dependency warning and run anyway
        forceRunClaimed?: boolean; // If true, bypass claim-by-other warning and run anyway
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId are required',
        });
        return;
      }

      // Load the feature and all features to check dependencies
      const [feature, allFeatures] = await Promise.all([
        featureLoader.get(projectPath, featureId),
        featureLoader.getAll(projectPath),
      ]);

      if (!feature) {
        res.status(404).json({
          success: false,
          error: `Feature ${featureId} not found`,
        });
        return;
      }

      // Check for unsatisfied dependencies if the feature requires waiting
      // and the caller hasn't explicitly requested to force run
      if (feature.waitForDependencies && !forceRun) {
        const blockingDeps = getBlockingDependencies(feature, allFeatures);

        if (blockingDeps.length > 0) {
          // Return warning with blocking dependency information
          // The UI can use this to show a confirmation dialog (T011)
          const blockingDependencyDetails = blockingDeps.map((depId) => {
            const dep = allFeatures.find((f) => f.id === depId);
            return {
              id: depId,
              title: dep?.title,
              description: dep?.description,
              status: dep?.status,
            };
          });

          res.json({
            success: false,
            warning: 'unsatisfied_dependencies',
            message: `Feature has ${blockingDeps.length} unsatisfied ${blockingDeps.length === 1 ? 'dependency' : 'dependencies'}`,
            blockingDependencies: blockingDependencyDetails,
          });
          return;
        }
      }

      // Check if the feature is claimed by someone else on GitHub
      if (!forceRunClaimed && feature.githubIssue) {
        try {
          const syncService = getGitHubSyncService();
          const canExecute = await syncService.canExecute(projectPath, feature);
          if (!canExecute.allowed) {
            res.json({
              success: false,
              warning: 'claimed_by_other',
              message: `This issue is claimed by ${canExecute.claimedBy} on GitHub`,
              claimedBy: canExecute.claimedBy,
            });
            return;
          }
        } catch (claimCheckErr) {
          logger.warn('Claim check failed, allowing execution:', claimCheckErr);
        }
      }

      // Auto-claim: if feature has an unclaimed GitHub issue, claim for current user
      if (feature.githubIssue?.number) {
        try {
          const assignees = feature.githubIssue.assignees ?? [];
          if (assignees.length === 0) {
            const syncService = getGitHubSyncService();
            const currentUser = await syncService.getCurrentUser(projectPath);
            if (currentUser) {
              logger.info(`Auto-claiming issue #${feature.githubIssue.number} for ${currentUser}`);
              const claimResult = await syncService.claimIssue(
                projectPath,
                feature.githubIssue.number
              );
              if (claimResult.success) {
                await featureLoader.update(projectPath, featureId, {
                  claimedBy: currentUser,
                  claimedAt: new Date().toISOString(),
                });
                // Refresh issue data to reflect new assignee
                const issueData = await syncService.syncIssueData(
                  projectPath,
                  feature.githubIssue.number
                );
                if (issueData) {
                  await featureLoader.update(projectPath, featureId, { githubIssue: issueData });
                }
              } else {
                logger.warn(
                  `Auto-claim failed for issue #${feature.githubIssue.number}: ${claimResult.error}`
                );
              }
            }
          }
        } catch (autoClaimErr) {
          logger.warn('Auto-claim failed, continuing with execution:', autoClaimErr);
        }
      }

      // Check if feature is already running before attempting execution
      if (autoModeService.isFeatureRunning(featureId)) {
        logger.warn(`Run feature ${featureId}: already running, skipping`);
        res.json({
          success: false,
          error: 'Feature is already running',
          alreadyRunning: true,
        });
        return;
      }

      // Start execution in background
      // executeFeature derives workDir from feature.branchName
      autoModeService
        .executeFeature(projectPath, featureId, false)
        .catch((error) => {
          logger.error(`Feature ${featureId} error:`, error);
        })
        .finally(() => {
          // Release the starting slot when execution completes (success or error)
          // Note: The feature should be in runningFeatures by this point
        });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Run feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /stop-feature - Stop a specific feature
// ---------------------------------------------------------------------------

function createStopFeatureHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { featureId } = req.body as { featureId: string };

      if (!featureId) {
        res.status(400).json({ success: false, error: 'featureId is required' });
        return;
      }

      const stopped = await autoModeService.stopFeature(featureId);
      res.json({ success: true, stopped });
    } catch (error) {
      logError(error, 'Stop feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /status - Get auto mode status
// ---------------------------------------------------------------------------

function createStatusHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const status = autoModeService.getStatus();
      res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      logError(error, 'Get status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /verify-feature - Verify a feature
// ---------------------------------------------------------------------------

function createVerifyFeatureHandler(autoModeService: AutoModeService) {
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

      const passes = await autoModeService.verifyFeature(projectPath, featureId);
      res.json({ success: true, passes });
    } catch (error) {
      logError(error, 'Verify feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /resume-feature - Resume a feature
// ---------------------------------------------------------------------------

function createResumeFeatureHandler(autoModeService: AutoModeService) {
  // Use the shared FeatureLoader from AutoModeService to avoid separate cache instances
  const featureLoader = autoModeService.getFeatureLoader();

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

      // Check if feature is already running before attempting resume
      if (autoModeService.isFeatureRunning(featureId)) {
        logger.warn(`Resume feature ${featureId}: already running, skipping`);
        res.json({
          success: false,
          error: 'Feature is already running',
          alreadyRunning: true,
        });
        return;
      }

      // Validate the feature exists before starting the async resume.
      // This eagerly populates the FeatureLoader cache and returns a clear
      // error to the client instead of silently failing in the background.
      const feature = await featureLoader.get(projectPath, featureId);
      if (!feature) {
        logger.error(`Resume feature ${featureId}: feature not found at project ${projectPath}`);
        res.json({
          success: false,
          error: `Feature ${featureId} not found`,
        });
        return;
      }

      // Start resume in background
      autoModeService.resumeFeature(projectPath, featureId).catch((error) => {
        logger.error(`Resume feature ${featureId} error:`, error);
      });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Resume feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /context-exists - Check if context exists for a feature
// ---------------------------------------------------------------------------

function createContextExistsHandler(autoModeService: AutoModeService) {
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

      const exists = await autoModeService.contextExists(projectPath, featureId);
      res.json({ success: true, exists });
    } catch (error) {
      logError(error, 'Check context exists failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /analyze-project - Analyze project
// ---------------------------------------------------------------------------

function createAnalyzeProjectHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // Start analysis in background
      autoModeService.analyzeProject(projectPath).catch((error) => {
        logger.error(`[AutoMode] Project analysis error:`, error);
      });

      res.json({ success: true, message: 'Project analysis started' });
    } catch (error) {
      logError(error, 'Analyze project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /follow-up-feature - Follow up on a feature
// ---------------------------------------------------------------------------

function createFollowUpFeatureHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, prompt, imagePaths } = req.body as {
        projectPath: string;
        featureId: string;
        prompt: string;
        imagePaths?: string[];
      };

      if (!projectPath || !featureId || !prompt) {
        res.status(400).json({
          success: false,
          error: 'projectPath, featureId, and prompt are required',
        });
        return;
      }

      // Start follow-up in background
      // followUpFeature derives workDir from feature.branchName
      autoModeService
        .followUpFeature(projectPath, featureId, prompt, imagePaths)
        .catch((error) => {
          logger.error(`[AutoMode] Follow up feature ${featureId} error:`, error);
        })
        .finally(() => {
          // Release the starting slot when follow-up completes (success or error)
          // Note: The feature should be in runningFeatures by this point
        });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Follow up feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /commit-feature - Commit feature changes
// ---------------------------------------------------------------------------

function createCommitFeatureHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, worktreePath } = req.body as {
        projectPath: string;
        featureId: string;
        worktreePath?: string;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId are required',
        });
        return;
      }

      const commitHash = await autoModeService.commitFeature(projectPath, featureId, worktreePath);
      res.json({ success: true, commitHash });
    } catch (error) {
      logError(error, 'Commit feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /approve-plan - Approve or reject a generated plan/spec
// ---------------------------------------------------------------------------

function createApprovePlanHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { featureId, approved, editedPlan, feedback, projectPath } = req.body as {
        featureId: string;
        approved: boolean;
        editedPlan?: string;
        feedback?: string;
        projectPath?: string;
      };

      if (!featureId) {
        res.status(400).json({
          success: false,
          error: 'featureId is required',
        });
        return;
      }

      if (typeof approved !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'approved must be a boolean',
        });
        return;
      }

      // Note: We no longer check hasPendingApproval here because resolvePlanApproval
      // can handle recovery when pending approval is not in Map but feature has planSpec.status='generated'
      // This supports cases where the server restarted while waiting for approval

      logger.info(
        `[AutoMode] Plan ${approved ? 'approved' : 'rejected'} for feature ${featureId}${
          editedPlan ? ' (with edits)' : ''
        }${feedback ? ` - Feedback: ${feedback}` : ''}`
      );

      // Resolve the pending approval (with recovery support)
      const result = await autoModeService.resolvePlanApproval(
        featureId,
        approved,
        editedPlan,
        feedback,
        projectPath
      );

      if (!result.success) {
        res.status(500).json({
          success: false,
          error: result.error,
        });
        return;
      }

      res.json({
        success: true,
        approved,
        message: approved
          ? 'Plan approved - implementation will continue'
          : 'Plan rejected - feature execution stopped',
      });
    } catch (error) {
      logError(error, 'Approve plan failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /resume-interrupted - Resume features interrupted by server restart
// ---------------------------------------------------------------------------

const resumeLogger = createLogger('ResumeInterrupted');

interface ResumeInterruptedRequest {
  projectPath: string;
}

function createResumeInterruptedHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    const { projectPath } = req.body as ResumeInterruptedRequest;

    if (!projectPath) {
      res.status(400).json({ error: 'Project path is required' });
      return;
    }

    resumeLogger.info(`Checking for interrupted features in ${projectPath}`);

    try {
      await autoModeService.resumeInterruptedFeatures(projectPath);
      res.json({
        success: true,
        message: 'Resume check completed',
      });
    } catch (error) {
      resumeLogger.error('Error resuming interrupted features:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createAutoModeRoutes(autoModeService: AutoModeService): Router {
  const router = Router();

  router.post('/stop-feature', createStopFeatureHandler(autoModeService));
  router.post('/status', validatePathParams('projectPath?'), createStatusHandler(autoModeService));
  router.post(
    '/run-feature',
    validatePathParams('projectPath'),
    createRunFeatureHandler(autoModeService)
  );
  router.post(
    '/verify-feature',
    validatePathParams('projectPath'),
    createVerifyFeatureHandler(autoModeService)
  );
  router.post(
    '/resume-feature',
    validatePathParams('projectPath'),
    createResumeFeatureHandler(autoModeService)
  );
  router.post(
    '/context-exists',
    validatePathParams('projectPath'),
    createContextExistsHandler(autoModeService)
  );
  router.post(
    '/analyze-project',
    validatePathParams('projectPath'),
    createAnalyzeProjectHandler(autoModeService)
  );
  router.post(
    '/follow-up-feature',
    validatePathParams('projectPath', 'imagePaths[]'),
    createFollowUpFeatureHandler(autoModeService)
  );
  router.post(
    '/commit-feature',
    validatePathParams('projectPath', 'worktreePath?'),
    createCommitFeatureHandler(autoModeService)
  );
  router.post(
    '/approve-plan',
    validatePathParams('projectPath'),
    createApprovePlanHandler(autoModeService)
  );
  router.post(
    '/resume-interrupted',
    validatePathParams('projectPath'),
    createResumeInterruptedHandler(autoModeService)
  );

  return router;
}
