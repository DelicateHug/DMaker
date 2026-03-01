/**
 * Features routes - HTTP API for feature management
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  FEATURES_CACHE_TTL_MS,
  type Feature,
  type FeatureStatus,
  type FeatureListSummary,
  type ListSummariesRequest,
  type GetSummaryRequest,
  type ListSummariesResponse,
  type GetSummaryResponse,
  type SummaryErrorResponse,
} from '@dmaker/types';
import { createLogger } from '@dmaker/utils';
import { CLAUDE_MODEL_MAP } from '@dmaker/model-resolver';
import { FeatureLoader } from '../services/feature-loader.js';
import type { SettingsService } from '../services/settings-service.js';
import type { AutoModeService } from '../services/auto-mode-service.js';
import type { EventEmitter } from '../lib/events.js';
import { validatePathParams } from '../middleware.js';
import { RequestCache } from '../lib/request-cache.js';
import { simpleQuery } from '../providers/simple-query-service.js';
import { getPromptCustomization } from '../lib/settings-helpers.js';

// ---------------------------------------------------------------------------
// Logger & error helpers (inlined from common.ts)
// ---------------------------------------------------------------------------

const logger = createLogger('Features');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`\u274C ${context}:`, error);
}

// ---------------------------------------------------------------------------
// Shared features cache
// ---------------------------------------------------------------------------

/**
 * Shared in-memory cache for feature list / summary responses.
 *
 * Used by GET-style endpoints (/list, /list-summaries) to avoid redundant
 * disk reads. Invalidated by every mutation endpoint on successful writes.
 *
 * TTL: 10 seconds -- features are actively modified during normal workflow.
 */
const featuresCache = new RequestCache<string, Feature[] | unknown>({
  defaultTtl: FEATURES_CACHE_TTL_MS,
  maxEntries: 200,
});

/**
 * Invalidate all cached feature list/summary entries for a given project path.
 *
 * Should be called after any successful feature mutation (create, update,
 * delete, bulkUpdate, bulkDelete) so that subsequent list/summary requests
 * return fresh data.
 *
 * @param projectPath - The project whose feature caches should be invalidated
 * @returns Number of cache entries invalidated
 */
export function invalidateFeaturesCache(projectPath: string): number {
  return featuresCache.invalidateBy((key) => key.includes(projectPath));
}

// ---------------------------------------------------------------------------
// POST /list - List all features for a project
// ---------------------------------------------------------------------------

function createListHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, excludeStatuses, includeStatuses } = req.body as {
        projectPath: string;
        excludeStatuses?: string[];
        includeStatuses?: string[];
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const filterKey =
        excludeStatuses?.sort().join(',') || includeStatuses?.sort().join(',') || '';
      const cacheKey = `list:${projectPath}:${filterKey}`;
      const options =
        excludeStatuses || includeStatuses ? { excludeStatuses, includeStatuses } : undefined;
      const features = (await featuresCache.getOrSet(cacheKey, () =>
        featureLoader.getAll(projectPath, options)
      )) as Feature[];

      res.json({ success: true, features });
    } catch (error) {
      logError(error, 'List features failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /get - Get a single feature
// ---------------------------------------------------------------------------

function createGetHandler(featureLoader: FeatureLoader) {
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

      const feature = await featureLoader.get(projectPath, featureId);
      if (!feature) {
        res.status(404).json({ success: false, error: 'Feature not found' });
        return;
      }

      res.json({ success: true, feature });
    } catch (error) {
      logError(error, 'Get feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /create - Create a new feature
// ---------------------------------------------------------------------------

function createCreateHandler(featureLoader: FeatureLoader, events?: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, feature } = req.body as {
        projectPath: string;
        feature: Partial<Feature>;
      };

      if (!projectPath || !feature) {
        res.status(400).json({
          success: false,
          error: 'projectPath and feature are required',
        });
        return;
      }

      // Check for duplicate title if title is provided
      if (feature.title && feature.title.trim()) {
        const duplicate = await featureLoader.findDuplicateTitle(projectPath, feature.title);
        if (duplicate) {
          res.status(409).json({
            success: false,
            error: `A feature with title "${feature.title}" already exists`,
            duplicateFeatureId: duplicate.id,
          });
          return;
        }
      }

      const created = await featureLoader.create(projectPath, feature);

      // Invalidate cached feature lists so subsequent reads return fresh data
      invalidateFeaturesCache(projectPath);

      // Emit feature_created event for hooks
      if (events) {
        events.emit('feature:created', {
          featureId: created.id,
          featureName: created.name,
          projectPath,
        });
      }

      res.json({ success: true, feature: created });
    } catch (error) {
      logError(error, 'Create feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /update - Update a feature
// ---------------------------------------------------------------------------

// Statuses that should trigger syncing to app_spec.txt
const SYNC_TRIGGER_STATUSES: FeatureStatus[] = ['completed'];

const updateLogger = createLogger('features/update');

function createUpdateHandler(featureLoader: FeatureLoader, autoModeService?: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        featureId,
        updates,
        descriptionHistorySource,
        enhancementMode,
        preEnhancementDescription,
      } = req.body as {
        projectPath: string;
        featureId: string;
        updates: Partial<Feature>;
        descriptionHistorySource?: 'enhance' | 'edit';
        enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer';
        preEnhancementDescription?: string;
      };

      if (!projectPath || !featureId || !updates) {
        res.status(400).json({
          success: false,
          error: 'projectPath, featureId, and updates are required',
        });
        return;
      }

      // Check for duplicate title if title is being updated
      if (updates.title && updates.title.trim()) {
        const duplicate = await featureLoader.findDuplicateTitle(
          projectPath,
          updates.title,
          featureId // Exclude the current feature from duplicate check
        );
        if (duplicate) {
          res.status(409).json({
            success: false,
            error: `A feature with title "${updates.title}" already exists`,
            duplicateFeatureId: duplicate.id,
          });
          return;
        }
      }

      // Get the current feature to detect status changes
      const currentFeature = await featureLoader.get(projectPath, featureId);
      const previousStatus = currentFeature?.status as FeatureStatus | undefined;
      const newStatus = updates.status as FeatureStatus | undefined;

      const updated = await featureLoader.update(
        projectPath,
        featureId,
        updates,
        descriptionHistorySource,
        enhancementMode,
        preEnhancementDescription
      );

      // Trigger sync to app_spec.txt when status changes to verified or completed
      if (newStatus && SYNC_TRIGGER_STATUSES.includes(newStatus) && previousStatus !== newStatus) {
        try {
          const synced = await featureLoader.syncFeatureToAppSpec(projectPath, updated);
          if (synced) {
            updateLogger.info(
              `Synced feature "${updated.title || updated.id}" to app_spec.txt on status change to ${newStatus}`
            );
          }
        } catch (syncError) {
          // Log the sync error but don't fail the update operation
          updateLogger.error(`Failed to sync feature to app_spec.txt:`, syncError);
        }
      }

      // Auto-merge feature branch when manually completed via UI
      if (
        autoModeService &&
        newStatus === 'completed' &&
        previousStatus !== 'completed' &&
        updated.branchName
      ) {
        autoModeService.autoMergeFeature(projectPath, updated).catch((mergeError) => {
          updateLogger.error(`Auto-merge failed for feature ${featureId}:`, mergeError);
        });
      }

      // Invalidate cached feature lists so subsequent reads return fresh data
      invalidateFeaturesCache(projectPath);

      res.json({ success: true, feature: updated });
    } catch (error) {
      logError(error, 'Update feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /bulk-update - Update multiple features at once
// ---------------------------------------------------------------------------

interface BulkUpdateRequest {
  projectPath: string;
  featureIds: string[];
  updates: Partial<Feature>;
}

interface BulkUpdateResult {
  featureId: string;
  success: boolean;
  error?: string;
}

function createBulkUpdateHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureIds, updates } = req.body as BulkUpdateRequest;

      if (!projectPath || !featureIds || !Array.isArray(featureIds) || featureIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureIds (non-empty array) are required',
        });
        return;
      }

      if (!updates || Object.keys(updates).length === 0) {
        res.status(400).json({
          success: false,
          error: 'updates object with at least one field is required',
        });
        return;
      }

      const results: BulkUpdateResult[] = [];
      const updatedFeatures: Feature[] = [];

      // Process in parallel batches of 20 for efficiency
      const BATCH_SIZE = 20;
      for (let i = 0; i < featureIds.length; i += BATCH_SIZE) {
        const batch = featureIds.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (featureId) => {
            try {
              const updated = await featureLoader.update(projectPath, featureId, updates);
              return { featureId, success: true as const, feature: updated };
            } catch (error) {
              return {
                featureId,
                success: false as const,
                error: getErrorMessage(error),
              };
            }
          })
        );

        for (const result of batchResults) {
          if (result.success) {
            results.push({ featureId: result.featureId, success: true });
            updatedFeatures.push(result.feature);
          } else {
            results.push({
              featureId: result.featureId,
              success: false,
              error: result.error,
            });
          }
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      if (successCount > 0) {
        invalidateFeaturesCache(projectPath);
      }

      res.json({
        success: failureCount === 0,
        updatedCount: successCount,
        failedCount: failureCount,
        results,
        features: updatedFeatures,
      });
    } catch (error) {
      logError(error, 'Bulk update features failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /bulk-delete - Delete multiple features at once
// ---------------------------------------------------------------------------

interface BulkDeleteRequest {
  projectPath: string;
  featureIds: string[];
}

interface BulkDeleteResult {
  featureId: string;
  success: boolean;
  error?: string;
}

function createBulkDeleteHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureIds } = req.body as BulkDeleteRequest;

      if (!projectPath || !featureIds || !Array.isArray(featureIds) || featureIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureIds (non-empty array) are required',
        });
        return;
      }

      // Process in parallel batches of 20 for efficiency
      const BATCH_SIZE = 20;
      const results: BulkDeleteResult[] = [];

      for (let i = 0; i < featureIds.length; i += BATCH_SIZE) {
        const batch = featureIds.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (featureId) => {
            const success = await featureLoader.delete(projectPath, featureId);
            if (success) {
              return { featureId, success: true };
            }
            return {
              featureId,
              success: false,
              error: 'Deletion failed. Check server logs for details.',
            };
          })
        );
        results.push(...batchResults);
      }

      const successCount = results.reduce((count, r) => count + (r.success ? 1 : 0), 0);
      const failureCount = results.length - successCount;

      if (successCount > 0) {
        invalidateFeaturesCache(projectPath);
      }

      res.json({
        success: failureCount === 0,
        deletedCount: successCount,
        failedCount: failureCount,
        results,
      });
    } catch (error) {
      logError(error, 'Bulk delete features failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /delete - Delete a feature
// ---------------------------------------------------------------------------

function createDeleteHandler(featureLoader: FeatureLoader) {
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

      const success = await featureLoader.delete(projectPath, featureId);

      if (success) {
        invalidateFeaturesCache(projectPath);
      }

      res.json({ success });
    } catch (error) {
      logError(error, 'Delete feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /agent-output - Get agent output for a feature
// POST /raw-output - Get raw JSONL output for debugging
// ---------------------------------------------------------------------------

function createAgentOutputHandler(featureLoader: FeatureLoader, autoModeService?: AutoModeService) {
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

      // For running features, prefer the in-memory buffer which is always up-to-date
      // (the disk file may lag behind due to debounced writes)
      const inMemoryContent = autoModeService?.getInMemoryOutput(featureId);
      if (inMemoryContent !== null && inMemoryContent !== undefined) {
        res.json({ success: true, content: inMemoryContent });
        return;
      }

      // Fall back to reading from disk for completed features
      const content = await featureLoader.getAgentOutput(projectPath, featureId);
      res.json({ success: true, content });
    } catch (error) {
      logError(error, 'Get agent output failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createRawOutputHandler(featureLoader: FeatureLoader) {
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

      const content = await featureLoader.getRawOutput(projectPath, featureId);
      res.json({ success: true, content });
    } catch (error) {
      logError(error, 'Get raw output failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /generate-title - Generate a concise title from description
// ---------------------------------------------------------------------------

interface GenerateTitleRequestBody {
  description: string;
}

interface GenerateTitleSuccessResponse {
  success: true;
  title: string;
}

interface GenerateTitleErrorResponse {
  success: false;
  error: string;
}

const titleLogger = createLogger('GenerateTitle');

function createGenerateTitleHandler(
  settingsService?: SettingsService
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { description } = req.body as GenerateTitleRequestBody;

      if (!description || typeof description !== 'string') {
        const response: GenerateTitleErrorResponse = {
          success: false,
          error: 'description is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      const trimmedDescription = description.trim();
      if (trimmedDescription.length === 0) {
        const response: GenerateTitleErrorResponse = {
          success: false,
          error: 'description cannot be empty',
        };
        res.status(400).json(response);
        return;
      }

      titleLogger.info(
        `Generating title for description: ${trimmedDescription.substring(0, 50)}...`
      );

      // Get customized prompts from settings
      const prompts = await getPromptCustomization(settingsService, '[GenerateTitle]');
      const systemPrompt = prompts.titleGeneration.systemPrompt;

      const userPrompt = `Generate a concise title for this feature:\n\n${trimmedDescription}`;

      // Use simpleQuery - provider abstraction handles all the streaming/extraction
      const result = await simpleQuery({
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        model: CLAUDE_MODEL_MAP.haiku,
        cwd: process.cwd(),
        maxTurns: 1,
        allowedTools: [],
      });

      const title = result.text;

      if (!title || title.trim().length === 0) {
        titleLogger.warn('Received empty response from AI');
        const response: GenerateTitleErrorResponse = {
          success: false,
          error: 'Failed to generate title - empty response',
        };
        res.status(500).json(response);
        return;
      }

      titleLogger.info(`Generated title: ${title.trim()}`);

      const response: GenerateTitleSuccessResponse = {
        success: true,
        title: title.trim(),
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      titleLogger.error('Title generation failed:', errorMessage);

      const response: GenerateTitleErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}

// ---------------------------------------------------------------------------
// POST /summaries - List all summary files for a feature
// POST /summary - Get a single summary file by timestamp
// ---------------------------------------------------------------------------

function createListSummariesHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body as ListSummariesRequest;

      if (!projectPath || !featureId) {
        const errorResponse: SummaryErrorResponse = {
          success: false,
          error: 'projectPath and featureId are required',
        };
        res.status(400).json(errorResponse);
        return;
      }

      const summaries = await featureLoader.getSummaryFiles(projectPath, featureId);
      const response: ListSummariesResponse = { success: true, summaries };
      res.json(response);
    } catch (error) {
      logError(error, 'List summaries failed');
      const errorResponse: SummaryErrorResponse = {
        success: false,
        error: getErrorMessage(error),
      };
      res.status(500).json(errorResponse);
    }
  };
}

function createGetSummaryHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, timestamp } = req.body as GetSummaryRequest;

      if (!projectPath || !featureId || !timestamp) {
        const errorResponse: SummaryErrorResponse = {
          success: false,
          error: 'projectPath, featureId, and timestamp are required',
        };
        res.status(400).json(errorResponse);
        return;
      }

      const summary = await featureLoader.getSummaryFile(projectPath, featureId, timestamp);
      if (!summary) {
        const errorResponse: SummaryErrorResponse = {
          success: false,
          error: 'Summary not found',
        };
        res.status(404).json(errorResponse);
        return;
      }

      const response: GetSummaryResponse = { success: true, summary };
      res.json(response);
    } catch (error) {
      logError(error, 'Get summary failed');
      const errorResponse: SummaryErrorResponse = {
        success: false,
        error: getErrorMessage(error),
      };
      res.status(500).json(errorResponse);
    }
  };
}

// ---------------------------------------------------------------------------
// POST /list-summaries - List lightweight feature summaries for a project
// ---------------------------------------------------------------------------

function createListFeatureSummariesHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, excludeStatuses, includeStatuses } = req.body as {
        projectPath: string;
        excludeStatuses?: string[];
        includeStatuses?: string[];
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const filterKey =
        excludeStatuses?.sort().join(',') || includeStatuses?.sort().join(',') || '';
      const cacheKey = `list-summaries:${projectPath}:${filterKey}`;
      const options =
        excludeStatuses || includeStatuses ? { excludeStatuses, includeStatuses } : undefined;
      const features = (await featuresCache.getOrSet(cacheKey, () =>
        featureLoader.getAllListSummaries(projectPath, options)
      )) as FeatureListSummary[];

      res.json({ success: true, features });
    } catch (error) {
      logError(error, 'List feature summaries failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /running - Get lightweight list of running (in_progress) features
// ---------------------------------------------------------------------------

function createRunningHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // Reuse the summaries cache to avoid redundant disk reads
      const cacheKey = `list-summaries:${projectPath}`;
      const allSummaries = (await featuresCache.getOrSet(cacheKey, () =>
        featureLoader.getAllListSummaries(projectPath)
      )) as FeatureListSummary[];

      // Filter to running features and return minimal data
      const running = allSummaries
        .filter((f) => f.status === 'in_progress')
        .map((f) => ({
          id: f.id,
          title: f.title,
          titleGenerating: f.titleGenerating,
          status: f.status,
        }));

      res.json({
        success: true,
        count: running.length,
        features: running,
      });
    } catch (error) {
      logError(error, 'Get running features failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /counts-by-status - Get feature counts per status
// ---------------------------------------------------------------------------

function createCountsByStatusHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const counts = await featureLoader.getCountsByStatus(projectPath);

      res.json({ success: true, counts });
    } catch (error) {
      logError(error, 'Counts by status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createFeaturesRoutes(
  featureLoader: FeatureLoader,
  settingsService?: SettingsService,
  events?: EventEmitter,
  autoModeService?: AutoModeService
): Router {
  const router = Router();

  router.post('/list', validatePathParams('projectPath'), createListHandler(featureLoader));
  router.post(
    '/list-summaries',
    validatePathParams('projectPath'),
    createListFeatureSummariesHandler(featureLoader)
  );
  router.post('/get', validatePathParams('projectPath'), createGetHandler(featureLoader));
  router.post(
    '/create',
    validatePathParams('projectPath'),
    createCreateHandler(featureLoader, events)
  );
  router.post(
    '/update',
    validatePathParams('projectPath'),
    createUpdateHandler(featureLoader, autoModeService)
  );
  router.post(
    '/bulk-update',
    validatePathParams('projectPath'),
    createBulkUpdateHandler(featureLoader)
  );
  router.post(
    '/bulk-delete',
    validatePathParams('projectPath'),
    createBulkDeleteHandler(featureLoader)
  );
  router.post('/delete', validatePathParams('projectPath'), createDeleteHandler(featureLoader));
  router.post('/agent-output', createAgentOutputHandler(featureLoader, autoModeService));
  router.post('/raw-output', createRawOutputHandler(featureLoader));
  router.post(
    '/summaries',
    validatePathParams('projectPath'),
    createListSummariesHandler(featureLoader)
  );
  router.post(
    '/summary',
    validatePathParams('projectPath'),
    createGetSummaryHandler(featureLoader)
  );
  router.post('/generate-title', createGenerateTitleHandler(settingsService));
  router.post('/running', validatePathParams('projectPath'), createRunningHandler(featureLoader));
  router.post(
    '/counts-by-status',
    validatePathParams('projectPath'),
    createCountsByStatusHandler(featureLoader)
  );

  return router;
}
