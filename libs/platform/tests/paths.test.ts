import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  getMonthName,
  isMonthDir,
  getAutomakerDir,
  getFeaturesDir,
  getFeatureMonthDir,
  getFeatureDir,
  getFeatureImagesDir,
  getFeatureSummariesDir,
  getFeatureLogsDir,
  getFeatureBackupsDir,
  getBoardDir,
  getImagesDir,
  getContextDir,
  getWorktreesDir,
  getValidationsDir,
  getValidationDir,
  getValidationPath,
  getAppSpecPath,
  getNotificationsPath,
  getBranchTrackingPath,
  getExecutionStatePath,
  ensureAutomakerDir,
  getGlobalSettingsPath,
  getCredentialsPath,
  getProjectSettingsPath,
  ensureDataDir,
  // Ideation paths
  getIdeationDir,
  getIdeasDir,
  getIdeaDir,
  getIdeaPath,
  getIdeaAttachmentsDir,
  getIdeationSessionsDir,
  getIdeationSessionPath,
  getIdeationDraftsDir,
  getIdeationAnalysisPath,
  ensureIdeationDir,
  // Event history paths
  getEventHistoryDir,
  getEventHistoryIndexPath,
  getEventPath,
  ensureEventHistoryDir,
  // Status-based paths
  getFeatureStatusDir,
  isStatusDir,
} from '../src/paths';

describe('paths.ts', () => {
  let tempDir: string;
  let projectPath: string;
  let dataDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'platform-paths-test-'));
    projectPath = path.join(tempDir, 'test-project');
    dataDir = path.join(tempDir, 'user-data');
    await fs.mkdir(projectPath, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Project-level path construction', () => {
    it('should return automaker directory path', () => {
      const result = getAutomakerDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker'));
    });

    it('should return features directory path', () => {
      const result = getFeaturesDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'features'));
    });

    it('should return feature directory path', () => {
      const featureId = 'auth-feature';
      const result = getFeatureDir(projectPath, featureId);
      expect(result).toBe(path.join(projectPath, '.automaker', 'features', featureId));
    });

    it('should return feature images directory path', () => {
      const featureId = 'auth-feature';
      const result = getFeatureImagesDir(projectPath, featureId);
      expect(result).toBe(path.join(projectPath, '.automaker', 'features', featureId, 'images'));
    });

    it('should return board directory path', () => {
      const result = getBoardDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'board'));
    });

    it('should return images directory path', () => {
      const result = getImagesDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'images'));
    });

    it('should return context directory path', () => {
      const result = getContextDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'context'));
    });

    it('should return worktrees directory path', () => {
      const result = getWorktreesDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'worktrees'));
    });

    it('should return app spec file path', () => {
      const result = getAppSpecPath(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'app_spec.txt'));
    });

    it('should return branch tracking file path', () => {
      const result = getBranchTrackingPath(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'active-branches.json'));
    });

    it('should return project settings file path', () => {
      const result = getProjectSettingsPath(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'settings.json'));
    });

    it('should return notifications file path', () => {
      const result = getNotificationsPath(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'notifications.json'));
    });

    it('should return execution state file path', () => {
      const result = getExecutionStatePath(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'execution-state.json'));
    });
  });

  describe('Global settings path construction', () => {
    it('should return global settings path', () => {
      const result = getGlobalSettingsPath(dataDir);
      expect(result).toBe(path.join(dataDir, 'settings.json'));
    });

    it('should return credentials path', () => {
      const result = getCredentialsPath(dataDir);
      expect(result).toBe(path.join(dataDir, 'credentials.json'));
    });
  });

  describe('Directory creation', () => {
    it('should create automaker directory', async () => {
      const automakerDir = await ensureAutomakerDir(projectPath);

      expect(automakerDir).toBe(path.join(projectPath, '.automaker'));

      const stats = await fs.stat(automakerDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should be idempotent when creating automaker directory', async () => {
      // Create directory first time
      const firstResult = await ensureAutomakerDir(projectPath);

      // Create directory second time
      const secondResult = await ensureAutomakerDir(projectPath);

      expect(firstResult).toBe(secondResult);

      const stats = await fs.stat(firstResult);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create data directory', async () => {
      const result = await ensureDataDir(dataDir);

      expect(result).toBe(dataDir);

      const stats = await fs.stat(dataDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should be idempotent when creating data directory', async () => {
      // Create directory first time
      const firstResult = await ensureDataDir(dataDir);

      // Create directory second time
      const secondResult = await ensureDataDir(dataDir);

      expect(firstResult).toBe(secondResult);

      const stats = await fs.stat(firstResult);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create nested directories recursively', async () => {
      const deepProjectPath = path.join(tempDir, 'nested', 'deep', 'project');
      await fs.mkdir(deepProjectPath, { recursive: true });

      const automakerDir = await ensureAutomakerDir(deepProjectPath);

      const stats = await fs.stat(automakerDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('Path handling with special characters', () => {
    it('should handle feature IDs with special characters', () => {
      const featureId = 'feature-with-dashes_and_underscores';
      const result = getFeatureDir(projectPath, featureId);
      expect(result).toContain(featureId);
    });

    it('should handle paths with spaces', () => {
      const pathWithSpaces = path.join(tempDir, 'path with spaces');
      const result = getAutomakerDir(pathWithSpaces);
      expect(result).toBe(path.join(pathWithSpaces, '.automaker'));
    });
  });

  describe('getMonthName', () => {
    it('should return correct month names for all months', () => {
      expect(getMonthName(1)).toBe('january');
      expect(getMonthName(2)).toBe('february');
      expect(getMonthName(3)).toBe('march');
      expect(getMonthName(4)).toBe('april');
      expect(getMonthName(5)).toBe('may');
      expect(getMonthName(6)).toBe('june');
      expect(getMonthName(7)).toBe('july');
      expect(getMonthName(8)).toBe('august');
      expect(getMonthName(9)).toBe('september');
      expect(getMonthName(10)).toBe('october');
      expect(getMonthName(11)).toBe('november');
      expect(getMonthName(12)).toBe('december');
    });

    it('should throw RangeError for month 0', () => {
      expect(() => getMonthName(0)).toThrow(RangeError);
    });

    it('should throw RangeError for month 13', () => {
      expect(() => getMonthName(13)).toThrow(RangeError);
    });

    it('should throw RangeError for negative month', () => {
      expect(() => getMonthName(-1)).toThrow(RangeError);
    });
  });

  describe('isMonthDir', () => {
    it('should return true for valid month directory names', () => {
      expect(isMonthDir('2026-january')).toBe(true);
      expect(isMonthDir('2026-february')).toBe(true);
      expect(isMonthDir('2025-december')).toBe(true);
      expect(isMonthDir('2024-june')).toBe(true);
    });

    it('should return false for non-month directory names', () => {
      expect(isMonthDir('auth-feature')).toBe(false);
      expect(isMonthDir('2026-Jan')).toBe(false);
      expect(isMonthDir('2026-JANUARY')).toBe(false);
      expect(isMonthDir('january-2026')).toBe(false);
      expect(isMonthDir('2026')).toBe(false);
      expect(isMonthDir('')).toBe(false);
    });

    it('should return false for feature IDs that look similar', () => {
      expect(isMonthDir('17-02-2026-add_dark_mode')).toBe(false);
      expect(isMonthDir('dep-feature-manual-1708300000000')).toBe(false);
    });
  });

  describe('isStatusDir', () => {
    it('should return true for valid status directory names', () => {
      expect(isStatusDir('backlog')).toBe(true);
      expect(isStatusDir('in_progress')).toBe(true);
      expect(isStatusDir('waiting_approval')).toBe(true);
      expect(isStatusDir('completed')).toBe(true);
    });

    it('should return true for pipeline step directories', () => {
      expect(isStatusDir('pipeline_test')).toBe(true);
      expect(isStatusDir('pipeline_deploy')).toBe(true);
      expect(isStatusDir('pipeline_review')).toBe(true);
    });

    it('should return false for non-status directory names', () => {
      expect(isStatusDir('feature-123')).toBe(false);
      expect(isStatusDir('2026-february')).toBe(false);
      expect(isStatusDir('auth-feature')).toBe(false);
      expect(isStatusDir('')).toBe(false);
    });
  });

  describe('getFeatureStatusDir', () => {
    it('should return status-based path', () => {
      const result = getFeatureStatusDir(projectPath, 'backlog', 'feature-123');
      expect(result).toBe(
        path.join(projectPath, '.automaker', 'features', 'backlog', 'feature-123')
      );
    });

    it('should handle pipeline step statuses', () => {
      const result = getFeatureStatusDir(projectPath, 'pipeline_test', 'feature-456');
      expect(result).toBe(
        path.join(projectPath, '.automaker', 'features', 'pipeline_test', 'feature-456')
      );
    });
  });

  describe('getFeatureMonthDir', () => {
    it('should return month directory for new-format IDs', () => {
      const result = getFeatureMonthDir(projectPath, '17-02-2026-add_dark_mode');
      expect(result).toBe(path.join(projectPath, '.automaker', 'features', '2026-february'));
    });

    it('should return null for old-format IDs', () => {
      const result = getFeatureMonthDir(projectPath, 'auth-feature');
      expect(result).toBeNull();
    });

    it('should return null for IDs with invalid month values', () => {
      const result = getFeatureMonthDir(projectPath, '17-13-2026-bad_month');
      expect(result).toBeNull();
    });

    it('should return null for IDs with month 00', () => {
      const result = getFeatureMonthDir(projectPath, '17-00-2026-bad_month');
      expect(result).toBeNull();
    });

    it('should return month directory for January (01)', () => {
      const result = getFeatureMonthDir(projectPath, '01-01-2026-new_feature');
      expect(result).toBe(path.join(projectPath, '.automaker', 'features', '2026-january'));
    });

    it('should return month directory for December (12)', () => {
      const result = getFeatureMonthDir(projectPath, '25-12-2025-holiday_update');
      expect(result).toBe(path.join(projectPath, '.automaker', 'features', '2025-december'));
    });
  });

  describe('Month-based feature directory structure', () => {
    it('should use month-based path for new-format IDs (dd-MM-YYYY-slug)', () => {
      const featureId = '17-02-2026-add_dark_mode';
      const result = getFeatureDir(projectPath, featureId);
      expect(result).toBe(
        path.join(projectPath, '.automaker', 'features', '2026-february', featureId)
      );
    });

    it('should use month-based path for January', () => {
      const featureId = '01-01-2026-new_feature';
      const result = getFeatureDir(projectPath, featureId);
      expect(result).toBe(
        path.join(projectPath, '.automaker', 'features', '2026-january', featureId)
      );
    });

    it('should use month-based path for December', () => {
      const featureId = '25-12-2025-holiday_update';
      const result = getFeatureDir(projectPath, featureId);
      expect(result).toBe(
        path.join(projectPath, '.automaker', 'features', '2025-december', featureId)
      );
    });

    it('should fall back to flat structure for old-format IDs (dd-YYYY-slug)', () => {
      const featureId = '17-2026-add_dark_mode';
      const result = getFeatureDir(projectPath, featureId);
      expect(result).toBe(path.join(projectPath, '.automaker', 'features', featureId));
    });

    it('should fall back to flat structure for arbitrary string IDs', () => {
      const featureId = 'auth-feature';
      const result = getFeatureDir(projectPath, featureId);
      expect(result).toBe(path.join(projectPath, '.automaker', 'features', featureId));
    });

    it('should fall back to flat structure for manually crafted IDs', () => {
      const featureId = 'dep-feature-manual-1708300000000';
      const result = getFeatureDir(projectPath, featureId);
      expect(result).toBe(path.join(projectPath, '.automaker', 'features', featureId));
    });

    it('should propagate month-based path to feature images dir', () => {
      const featureId = '17-02-2026-add_dark_mode';
      const result = getFeatureImagesDir(projectPath, featureId);
      expect(result).toBe(
        path.join(projectPath, '.automaker', 'features', '2026-february', featureId, 'images')
      );
    });

    it('should propagate month-based path to feature summaries dir', () => {
      const featureId = '17-02-2026-add_dark_mode';
      const result = getFeatureSummariesDir(projectPath, featureId);
      expect(result).toBe(
        path.join(projectPath, '.automaker', 'features', '2026-february', featureId, 'summaries')
      );
    });

    it('should propagate month-based path to feature logs dir', () => {
      const featureId = '17-02-2026-add_dark_mode';
      const result = getFeatureLogsDir(projectPath, featureId);
      expect(result).toBe(
        path.join(projectPath, '.automaker', 'features', '2026-february', featureId, 'logs')
      );
    });

    it('should propagate month-based path to feature backups dir', () => {
      const featureId = '17-02-2026-add_dark_mode';
      const result = getFeatureBackupsDir(projectPath, featureId);
      expect(result).toBe(
        path.join(projectPath, '.automaker', 'features', '2026-february', featureId, 'backups')
      );
    });

    it('should still have feature dir as child of features dir with new format', () => {
      const featuresDir = getFeaturesDir(projectPath);
      const featureDir = getFeatureDir(projectPath, '17-02-2026-add_dark_mode');
      expect(featureDir.startsWith(featuresDir)).toBe(true);
    });
  });

  describe('Feature subdirectory path construction', () => {
    it('should return feature summaries directory path', () => {
      const featureId = 'auth-feature';
      const result = getFeatureSummariesDir(projectPath, featureId);
      expect(result).toBe(path.join(projectPath, '.automaker', 'features', featureId, 'summaries'));
    });

    it('should return feature logs directory path', () => {
      const featureId = 'auth-feature';
      const result = getFeatureLogsDir(projectPath, featureId);
      expect(result).toBe(path.join(projectPath, '.automaker', 'features', featureId, 'logs'));
    });

    it('should return feature backups directory path', () => {
      const featureId = 'auth-feature';
      const result = getFeatureBackupsDir(projectPath, featureId);
      expect(result).toBe(path.join(projectPath, '.automaker', 'features', featureId, 'backups'));
    });

    it('should have all feature subdirectories under the feature directory', () => {
      const featureId = 'test-feature';
      const featureDir = getFeatureDir(projectPath, featureId);
      const subdirs = [
        getFeatureImagesDir(projectPath, featureId),
        getFeatureSummariesDir(projectPath, featureId),
        getFeatureLogsDir(projectPath, featureId),
        getFeatureBackupsDir(projectPath, featureId),
      ];

      subdirs.forEach((subdir) => {
        expect(subdir.startsWith(featureDir)).toBe(true);
      });
    });
  });

  describe('Validation path construction', () => {
    it('should return validations directory path', () => {
      const result = getValidationsDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'validations'));
    });

    it('should return validation directory for a specific issue', () => {
      const result = getValidationDir(projectPath, 42);
      expect(result).toBe(path.join(projectPath, '.automaker', 'validations', '42'));
    });

    it('should return validation file path for a specific issue', () => {
      const result = getValidationPath(projectPath, 42);
      expect(result).toBe(
        path.join(projectPath, '.automaker', 'validations', '42', 'validation.json')
      );
    });

    it('should have validation dir under validations dir', () => {
      const validationsDir = getValidationsDir(projectPath);
      const validationDir = getValidationDir(projectPath, 123);
      expect(validationDir.startsWith(validationsDir)).toBe(true);
    });

    it('should have validation path under validation dir', () => {
      const validationDir = getValidationDir(projectPath, 123);
      const validationPath = getValidationPath(projectPath, 123);
      expect(validationPath.startsWith(validationDir)).toBe(true);
    });
  });

  describe('Ideation path construction', () => {
    it('should return ideation directory path', () => {
      const result = getIdeationDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'ideation'));
    });

    it('should return ideas directory path', () => {
      const result = getIdeasDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'ideation', 'ideas'));
    });

    it('should return idea directory for a specific idea', () => {
      const result = getIdeaDir(projectPath, 'idea-1');
      expect(result).toBe(path.join(projectPath, '.automaker', 'ideation', 'ideas', 'idea-1'));
    });

    it('should return idea file path', () => {
      const result = getIdeaPath(projectPath, 'idea-1');
      expect(result).toBe(
        path.join(projectPath, '.automaker', 'ideation', 'ideas', 'idea-1', 'idea.json')
      );
    });

    it('should return idea attachments directory path', () => {
      const result = getIdeaAttachmentsDir(projectPath, 'idea-1');
      expect(result).toBe(
        path.join(projectPath, '.automaker', 'ideation', 'ideas', 'idea-1', 'attachments')
      );
    });

    it('should return ideation sessions directory path', () => {
      const result = getIdeationSessionsDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'ideation', 'sessions'));
    });

    it('should return ideation session file path', () => {
      const result = getIdeationSessionPath(projectPath, 'session-abc');
      expect(result).toBe(
        path.join(projectPath, '.automaker', 'ideation', 'sessions', 'session-abc.json')
      );
    });

    it('should return ideation drafts directory path', () => {
      const result = getIdeationDraftsDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'ideation', 'drafts'));
    });

    it('should return ideation analysis file path', () => {
      const result = getIdeationAnalysisPath(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'ideation', 'analysis.json'));
    });

    it('should have all ideation paths under ideation dir', () => {
      const ideationDir = getIdeationDir(projectPath);
      const paths = [
        getIdeasDir(projectPath),
        getIdeaDir(projectPath, 'idea-1'),
        getIdeaPath(projectPath, 'idea-1'),
        getIdeaAttachmentsDir(projectPath, 'idea-1'),
        getIdeationSessionsDir(projectPath),
        getIdeationSessionPath(projectPath, 'session-1'),
        getIdeationDraftsDir(projectPath),
        getIdeationAnalysisPath(projectPath),
      ];

      paths.forEach((p) => {
        expect(p.startsWith(ideationDir)).toBe(true);
      });
    });
  });

  describe('Ideation directory creation', () => {
    it('should create ideation directory structure', async () => {
      const ideationDir = await ensureIdeationDir(projectPath);

      expect(ideationDir).toBe(path.join(projectPath, '.automaker', 'ideation'));

      const stats = await fs.stat(ideationDir);
      expect(stats.isDirectory()).toBe(true);

      // Verify subdirectories were created
      const ideasStats = await fs.stat(getIdeasDir(projectPath));
      expect(ideasStats.isDirectory()).toBe(true);

      const sessionsStats = await fs.stat(getIdeationSessionsDir(projectPath));
      expect(sessionsStats.isDirectory()).toBe(true);

      const draftsStats = await fs.stat(getIdeationDraftsDir(projectPath));
      expect(draftsStats.isDirectory()).toBe(true);
    });

    it('should be idempotent when creating ideation directory', async () => {
      const firstResult = await ensureIdeationDir(projectPath);
      const secondResult = await ensureIdeationDir(projectPath);

      expect(firstResult).toBe(secondResult);

      const stats = await fs.stat(firstResult);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('Event history path construction', () => {
    it('should return event history directory path', () => {
      const result = getEventHistoryDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'events'));
    });

    it('should return event history index file path', () => {
      const result = getEventHistoryIndexPath(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'events', 'index.json'));
    });

    it('should return specific event file path', () => {
      const result = getEventPath(projectPath, 'evt-12345');
      expect(result).toBe(path.join(projectPath, '.automaker', 'events', 'evt-12345.json'));
    });

    it('should have all event paths under event history dir', () => {
      const eventsDir = getEventHistoryDir(projectPath);
      const paths = [getEventHistoryIndexPath(projectPath), getEventPath(projectPath, 'evt-1')];

      paths.forEach((p) => {
        expect(p.startsWith(eventsDir)).toBe(true);
      });
    });
  });

  describe('Event history directory creation', () => {
    it('should create event history directory', async () => {
      const eventsDir = await ensureEventHistoryDir(projectPath);

      expect(eventsDir).toBe(path.join(projectPath, '.automaker', 'events'));

      const stats = await fs.stat(eventsDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should be idempotent when creating event history directory', async () => {
      const firstResult = await ensureEventHistoryDir(projectPath);
      const secondResult = await ensureEventHistoryDir(projectPath);

      expect(firstResult).toBe(secondResult);

      const stats = await fs.stat(firstResult);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('Path relationships', () => {
    it('should have feature dir as child of features dir', () => {
      const featuresDir = getFeaturesDir(projectPath);
      const featureDir = getFeatureDir(projectPath, 'test-feature');

      expect(featureDir.startsWith(featuresDir)).toBe(true);
    });

    it('should have all project paths under automaker dir', () => {
      const automakerDir = getAutomakerDir(projectPath);
      const paths = [
        getFeaturesDir(projectPath),
        getBoardDir(projectPath),
        getImagesDir(projectPath),
        getContextDir(projectPath),
        getWorktreesDir(projectPath),
        getValidationsDir(projectPath),
        getAppSpecPath(projectPath),
        getNotificationsPath(projectPath),
        getBranchTrackingPath(projectPath),
        getExecutionStatePath(projectPath),
        getProjectSettingsPath(projectPath),
        getIdeationDir(projectPath),
        getEventHistoryDir(projectPath),
      ];

      paths.forEach((p) => {
        expect(p.startsWith(automakerDir)).toBe(true);
      });
    });
  });
});
