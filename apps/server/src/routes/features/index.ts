/**
 * Features routes - HTTP API for feature management
 */

import { Router } from 'express';
import { FeatureLoader } from '../../services/feature-loader.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { AutoModeService } from '../../services/auto-mode-service.js';
import type { EventEmitter } from '../../lib/events.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createListHandler } from './routes/list.js';
import { createGetHandler } from './routes/get.js';
import { createCreateHandler } from './routes/create.js';
import { createUpdateHandler } from './routes/update.js';
import { createBulkUpdateHandler } from './routes/bulk-update.js';
import { createBulkDeleteHandler } from './routes/bulk-delete.js';
import { createDeleteHandler } from './routes/delete.js';
import { createAgentOutputHandler, createRawOutputHandler } from './routes/agent-output.js';
import { createGenerateTitleHandler } from './routes/generate-title.js';
import { createListSummariesHandler, createGetSummaryHandler } from './routes/summaries.js';
import { createListSummariesHandler as createListFeatureSummariesHandler } from './routes/list-summaries.js';
import { createRunningHandler } from './routes/running.js';
import { createCountsByStatusHandler } from './routes/counts-by-status.js';

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
  router.post('/update', validatePathParams('projectPath'), createUpdateHandler(featureLoader));
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
