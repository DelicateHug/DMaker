/**
 * GitHub routes - HTTP API for GitHub integration
 */

import { Router } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createCheckGitHubRemoteHandler } from './routes/check-github-remote.js';
import { createListIssuesHandler } from './routes/list-issues.js';
import { createListPRsHandler } from './routes/list-prs.js';
import { createListCommentsHandler } from './routes/list-comments.js';
import { createValidateIssueHandler } from './routes/validate-issue.js';
import {
  createValidationStatusHandler,
  createValidationStopHandler,
  createGetValidationsHandler,
  createDeleteValidationHandler,
  createMarkViewedHandler,
} from './routes/validation-endpoints.js';
import { createClaimIssueHandler } from './routes/claim-issue.js';
import { createUnclaimIssueHandler } from './routes/unclaim-issue.js';
import { createSyncIssueHandler } from './routes/sync-issue.js';
import { createCurrentUserHandler } from './routes/current-user.js';
import { createCreateIssueHandler } from './routes/create-issue.js';
import { createUpdateIssueLabelsHandler } from './routes/update-issue-labels.js';
import { createAddCommentHandler } from './routes/add-comment.js';
import {
  createLockIssueHandler,
  createUnlockIssueHandler,
  createPinIssueHandler,
  createUnpinIssueHandler,
  createDeleteIssueHandler,
} from './routes/manage-issue.js';
import { getGitHubSyncService } from '../../services/github-sync-service.js';
import type { SettingsService } from '../../services/settings-service.js';

export function createGitHubRoutes(
  events: EventEmitter,
  settingsService?: SettingsService
): Router {
  const router = Router();

  // Initialize the singleton sync service with the shared event emitter
  getGitHubSyncService(events);

  router.post('/check-remote', validatePathParams('projectPath'), createCheckGitHubRemoteHandler());
  router.post('/issues', validatePathParams('projectPath'), createListIssuesHandler());
  router.post('/prs', validatePathParams('projectPath'), createListPRsHandler());
  router.post('/issue-comments', validatePathParams('projectPath'), createListCommentsHandler());
  router.post(
    '/validate-issue',
    validatePathParams('projectPath'),
    createValidateIssueHandler(events, settingsService)
  );

  // Validation management endpoints
  router.post(
    '/validation-status',
    validatePathParams('projectPath'),
    createValidationStatusHandler()
  );
  router.post('/validation-stop', validatePathParams('projectPath'), createValidationStopHandler());
  router.post('/validations', validatePathParams('projectPath'), createGetValidationsHandler());
  router.post(
    '/validation-delete',
    validatePathParams('projectPath'),
    createDeleteValidationHandler()
  );
  router.post(
    '/validation-mark-viewed',
    validatePathParams('projectPath'),
    createMarkViewedHandler(events)
  );

  // Collaboration: claim/unclaim/sync issue assignees
  router.post('/claim-issue', validatePathParams('projectPath'), createClaimIssueHandler(events));
  router.post(
    '/unclaim-issue',
    validatePathParams('projectPath'),
    createUnclaimIssueHandler(events)
  );
  router.post('/sync-issue', validatePathParams('projectPath'), createSyncIssueHandler(events));
  router.post('/current-user', validatePathParams('projectPath'), createCurrentUserHandler(events));
  router.post('/create-issue', validatePathParams('projectPath'), createCreateIssueHandler());
  router.post(
    '/update-issue-labels',
    validatePathParams('projectPath'),
    createUpdateIssueLabelsHandler()
  );
  router.post('/add-comment', validatePathParams('projectPath'), createAddCommentHandler());

  // Issue management: lock, unlock, pin, unpin, delete
  router.post('/lock-issue', validatePathParams('projectPath'), createLockIssueHandler());
  router.post('/unlock-issue', validatePathParams('projectPath'), createUnlockIssueHandler());
  router.post('/pin-issue', validatePathParams('projectPath'), createPinIssueHandler());
  router.post('/unpin-issue', validatePathParams('projectPath'), createUnpinIssueHandler());
  router.post('/delete-issue', validatePathParams('projectPath'), createDeleteIssueHandler());

  return router;
}
