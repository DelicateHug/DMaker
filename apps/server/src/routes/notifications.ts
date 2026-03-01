/**
 * Notifications routes - HTTP API for project-level notifications
 *
 * Provides endpoints for:
 * - Listing notifications
 * - Getting unread count
 * - Marking notifications as read
 * - Dismissing notifications
 *
 * All endpoints use handler factories that receive the NotificationService instance.
 * Mounted at /api/notifications in the main server.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '@dmaker/utils';
import type { NotificationService } from '../services/notification-service.js';
import { validatePathParams } from '../middleware.js';

// ---------------------------------------------------------------------------
// Logger & error helpers
// ---------------------------------------------------------------------------

const logger = createLogger('Notifications');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`❌ ${context}:`, error);
}

// ---------------------------------------------------------------------------
// POST /list - List all notifications for a project
// ---------------------------------------------------------------------------

function createListHandler(notificationService: NotificationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const notifications = await notificationService.getNotifications(projectPath);

      res.json({
        success: true,
        notifications,
      });
    } catch (error) {
      logError(error, 'List notifications failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /unread-count - Get unread notification count
// ---------------------------------------------------------------------------

function createUnreadCountHandler(notificationService: NotificationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const count = await notificationService.getUnreadCount(projectPath);

      res.json({
        success: true,
        count,
      });
    } catch (error) {
      logError(error, 'Get unread count failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /mark-read - Mark notification(s) as read
// ---------------------------------------------------------------------------

function createMarkReadHandler(notificationService: NotificationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, notificationId } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // If notificationId provided, mark single notification
      if (notificationId) {
        const notification = await notificationService.markAsRead(projectPath, notificationId);
        if (!notification) {
          res.status(404).json({ success: false, error: 'Notification not found' });
          return;
        }
        res.json({ success: true, notification });
        return;
      }

      // Otherwise mark all as read
      const count = await notificationService.markAllAsRead(projectPath);
      res.json({ success: true, count });
    } catch (error) {
      logError(error, 'Mark read failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /dismiss - Dismiss notification(s)
// ---------------------------------------------------------------------------

function createDismissHandler(notificationService: NotificationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, notificationId } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // If notificationId provided, dismiss single notification
      if (notificationId) {
        const dismissed = await notificationService.dismissNotification(
          projectPath,
          notificationId
        );
        if (!dismissed) {
          res.status(404).json({ success: false, error: 'Notification not found' });
          return;
        }
        res.json({ success: true, dismissed: true });
        return;
      }

      // Otherwise dismiss all
      const count = await notificationService.dismissAll(projectPath);
      res.json({ success: true, count });
    } catch (error) {
      logError(error, 'Dismiss failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create notifications router with all endpoints
 *
 * Endpoints:
 * - POST /list - List all notifications for a project
 * - POST /unread-count - Get unread notification count
 * - POST /mark-read - Mark notification(s) as read
 * - POST /dismiss - Dismiss notification(s)
 */
export function createNotificationsRoutes(notificationService: NotificationService): Router {
  const router = Router();

  router.post('/list', validatePathParams('projectPath'), createListHandler(notificationService));

  router.post(
    '/unread-count',
    validatePathParams('projectPath'),
    createUnreadCountHandler(notificationService)
  );

  router.post(
    '/mark-read',
    validatePathParams('projectPath'),
    createMarkReadHandler(notificationService)
  );

  router.post(
    '/dismiss',
    validatePathParams('projectPath'),
    createDismissHandler(notificationService)
  );

  return router;
}
