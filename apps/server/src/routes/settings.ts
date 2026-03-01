/**
 * Settings routes - HTTP API for persistent file-based settings
 *
 * Consolidated from settings/ directory into a single flat file.
 *
 * Provides endpoints for:
 * - Status checking (migration readiness)
 * - Global settings CRUD
 * - Credentials management
 * - Project-specific settings
 * - localStorage to file migration
 * - Filesystem agent discovery
 *
 * All endpoints use handler factories that receive the SettingsService instance.
 * Mounted at /api/settings in the main server.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '@dmaker/utils';
import { setLogLevel, LogLevel } from '@dmaker/utils';
import type { SettingsService } from '../services/settings-service.js';
import type { GlobalSettings, Credentials, ProjectSettings } from '../types/settings.js';
import { validatePathParams } from '../middleware.js';
import { RequestCache } from '../lib/request-cache.js';
import { discoverFilesystemAgents } from '../lib/agent-discovery.js';
import { setRequestLoggingEnabled } from '../index.js';

// ---------------------------------------------------------------------------
// Logger & error helpers
// ---------------------------------------------------------------------------

const logger = createLogger('Settings');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`Settings ${context}:`, error);
}

// ---------------------------------------------------------------------------
// Shared settings cache
// ---------------------------------------------------------------------------

/** Cache key used for global settings */
const GLOBAL_SETTINGS_CACHE_KEY = 'global-settings';

/** TTL for cached global settings (60 seconds) */
const GLOBAL_SETTINGS_TTL_MS = 60_000;

/**
 * Shared in-memory cache for global settings.
 *
 * Used by GET /api/settings/global to avoid redundant file reads.
 * Invalidated by PUT /api/settings/global on successful writes.
 *
 * TTL: 60 seconds -- settings only change on explicit user save.
 */
const globalSettingsCache = new RequestCache<string, GlobalSettings>({
  defaultTtl: GLOBAL_SETTINGS_TTL_MS,
});

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * Map server log level string to LogLevel enum
 */
const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  error: LogLevel.ERROR,
  warn: LogLevel.WARN,
  info: LogLevel.INFO,
  debug: LogLevel.DEBUG,
};

// --- GET /status ---

function createStatusHandler(settingsService: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const hasGlobalSettings = await settingsService.hasGlobalSettings();
      const hasCredentials = await settingsService.hasCredentials();

      res.json({
        success: true,
        hasGlobalSettings,
        hasCredentials,
        dataDir: settingsService.getDataDir(),
        needsMigration: !hasGlobalSettings,
      });
    } catch (error) {
      logError(error, 'Get settings status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// --- GET /global ---

function createGetGlobalHandler(settingsService: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const settings = await globalSettingsCache.getOrSet(GLOBAL_SETTINGS_CACHE_KEY, () =>
        settingsService.getGlobalSettings()
      );

      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      logError(error, 'Get global settings failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// --- PUT /global ---

function createUpdateGlobalHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const updates = req.body as Partial<GlobalSettings>;

      if (!updates || typeof updates !== 'object') {
        res.status(400).json({
          success: false,
          error: 'Invalid request body - expected settings object',
        });
        return;
      }

      // Minimal debug logging to help diagnose accidental wipes.
      if ('projects' in updates || 'theme' in updates || 'localStorageMigrated' in updates) {
        const projectsLen = Array.isArray((updates as any).projects)
          ? (updates as any).projects.length
          : undefined;
        logger.info(
          `Update global settings request: projects=${projectsLen ?? 'n/a'}, theme=${
            (updates as any).theme ?? 'n/a'
          }, localStorageMigrated=${(updates as any).localStorageMigrated ?? 'n/a'}`
        );
      }

      const settings = await settingsService.updateGlobalSettings(updates);

      // Invalidate cached global settings and seed with fresh value
      globalSettingsCache.delete(GLOBAL_SETTINGS_CACHE_KEY);
      globalSettingsCache.set(GLOBAL_SETTINGS_CACHE_KEY, settings);

      // Apply server log level if it was updated
      if ('serverLogLevel' in updates && updates.serverLogLevel) {
        const level = LOG_LEVEL_MAP[updates.serverLogLevel];
        if (level !== undefined) {
          setLogLevel(level);
          logger.info(`Server log level changed to: ${updates.serverLogLevel}`);
        }
      }

      // Apply request logging setting if it was updated
      if ('enableRequestLogging' in updates && typeof updates.enableRequestLogging === 'boolean') {
        setRequestLoggingEnabled(updates.enableRequestLogging);
        logger.info(
          `HTTP request logging ${updates.enableRequestLogging ? 'enabled' : 'disabled'}`
        );
      }

      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      logError(error, 'Update global settings failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// --- GET /credentials ---

function createGetCredentialsHandler(settingsService: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const credentials = await settingsService.getMaskedCredentials();

      res.json({
        success: true,
        credentials,
      });
    } catch (error) {
      logError(error, 'Get credentials failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// --- PUT /credentials ---

function createUpdateCredentialsHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const updates = req.body as Partial<Credentials>;

      if (!updates || typeof updates !== 'object') {
        res.status(400).json({
          success: false,
          error: 'Invalid request body - expected credentials object',
        });
        return;
      }

      await settingsService.updateCredentials(updates);

      // Return masked credentials for confirmation
      const masked = await settingsService.getMaskedCredentials();

      res.json({
        success: true,
        credentials: masked,
      });
    } catch (error) {
      logError(error, 'Update credentials failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// --- POST /project ---

function createGetProjectHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath?: string };

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      const settings = await settingsService.getProjectSettings(projectPath);

      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      logError(error, 'Get project settings failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// --- PUT /project ---

function createUpdateProjectHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, updates } = req.body as {
        projectPath?: string;
        updates?: Partial<ProjectSettings>;
      };

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      if (!updates || typeof updates !== 'object') {
        res.status(400).json({
          success: false,
          error: 'updates object is required',
        });
        return;
      }

      const settings = await settingsService.updateProjectSettings(projectPath, updates);

      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      logError(error, 'Update project settings failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// --- POST /migrate ---

function createMigrateHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { data } = req.body as {
        data?: {
          'dmaker-storage'?: string;
          'dmaker-setup'?: string;
          'worktree-panel-collapsed'?: string;
          'file-browser-recent-folders'?: string;
          'dmaker:lastProjectDir'?: string;
        };
      };

      if (!data || typeof data !== 'object') {
        res.status(400).json({
          success: false,
          error: 'data object is required containing localStorage data',
        });
        return;
      }

      logger.info('Starting settings migration from localStorage');

      const result = await settingsService.migrateFromLocalStorage(data);

      if (result.success) {
        logger.info(`Migration successful: ${result.migratedProjectCount} projects migrated`);
      } else {
        logger.warn(`Migration completed with errors: ${result.errors.join(', ')}`);
      }

      res.json({
        success: result.success,
        migratedGlobalSettings: result.migratedGlobalSettings,
        migratedCredentials: result.migratedCredentials,
        migratedProjectCount: result.migratedProjectCount,
        errors: result.errors,
      });
    } catch (error) {
      logError(error, 'Migration failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// --- POST /agents/discover ---

interface DiscoverAgentsRequest {
  projectPath?: string;
  sources?: Array<'user' | 'project'>;
  projects?: Array<{ name: string; path: string }>;
}

function createDiscoverAgentsHandler() {
  return async (req: Request, res: Response) => {
    try {
      const {
        projectPath,
        sources = ['user', 'project'],
        projects,
      } = req.body as DiscoverAgentsRequest;

      logger.info(
        `Discovering agents from sources: ${sources.join(', ')}${projects?.length ? ` (${projects.length} projects)` : projectPath ? ` (project: ${projectPath})` : ''}`
      );

      const agents = await discoverFilesystemAgents(projectPath, sources, projects);

      logger.info(`Discovered ${agents.length} filesystem agents`);

      res.json({
        success: true,
        agents,
      });
    } catch (error) {
      logger.error('Failed to discover agents:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to discover agents',
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create settings router with all endpoints
 *
 * Registers handlers for all settings-related HTTP endpoints.
 * Each handler is created with the provided SettingsService instance.
 *
 * Endpoints:
 * - GET /status - Check migration status and data availability
 * - GET /global - Get global settings
 * - PUT /global - Update global settings
 * - GET /credentials - Get masked credentials (safe for UI)
 * - PUT /credentials - Update API keys
 * - POST /project - Get project settings (requires projectPath in body)
 * - PUT /project - Update project settings
 * - POST /migrate - Migrate settings from localStorage
 * - POST /agents/discover - Discover filesystem agents from .claude/agents/ (read-only)
 *
 * @param settingsService - Instance of SettingsService for file I/O
 * @returns Express Router configured with all settings endpoints
 */
export function createSettingsRoutes(settingsService: SettingsService): Router {
  const router = Router();

  // Status endpoint (check if migration needed)
  router.get('/status', createStatusHandler(settingsService));

  // Global settings
  router.get('/global', createGetGlobalHandler(settingsService));
  router.put('/global', createUpdateGlobalHandler(settingsService));

  // Credentials (separate for security)
  router.get('/credentials', createGetCredentialsHandler(settingsService));
  router.put('/credentials', createUpdateCredentialsHandler(settingsService));

  // Project settings
  router.post(
    '/project',
    validatePathParams('projectPath'),
    createGetProjectHandler(settingsService)
  );
  router.put(
    '/project',
    validatePathParams('projectPath'),
    createUpdateProjectHandler(settingsService)
  );

  // Migration from localStorage
  router.post('/migrate', createMigrateHandler(settingsService));

  // Filesystem agents discovery (read-only)
  router.post('/agents/discover', createDiscoverAgentsHandler());

  return router;
}
