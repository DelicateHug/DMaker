import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import {
  getAutomakerDir,
  getFeaturesDir,
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
} from '@automaker/platform';

describe('automaker-paths.ts', () => {
  const projectPath = path.join('/test', 'project');

  describe('getAutomakerDir', () => {
    it('should return path to .automaker directory', () => {
      expect(getAutomakerDir(projectPath)).toBe(path.join(projectPath, '.automaker'));
    });

    it('should handle paths with trailing slashes', () => {
      const pathWithSlash = path.join('/test', 'project') + path.sep;
      expect(getAutomakerDir(pathWithSlash)).toBe(path.join(pathWithSlash, '.automaker'));
    });
  });

  describe('getFeaturesDir', () => {
    it('should return path to features directory', () => {
      expect(getFeaturesDir(projectPath)).toBe(path.join(projectPath, '.automaker', 'features'));
    });
  });

  describe('getFeatureDir', () => {
    it('should return path to specific feature directory', () => {
      expect(getFeatureDir(projectPath, 'feature-123')).toBe(
        path.join(projectPath, '.automaker', 'features', 'feature-123')
      );
    });

    it('should handle feature IDs with special characters', () => {
      expect(getFeatureDir(projectPath, 'my-feature_v2')).toBe(
        path.join(projectPath, '.automaker', 'features', 'my-feature_v2')
      );
    });
  });

  describe('getFeatureImagesDir', () => {
    it('should return path to feature images directory', () => {
      expect(getFeatureImagesDir(projectPath, 'feature-123')).toBe(
        path.join(projectPath, '.automaker', 'features', 'feature-123', 'images')
      );
    });
  });

  describe('getBoardDir', () => {
    it('should return path to board directory', () => {
      expect(getBoardDir(projectPath)).toBe(path.join(projectPath, '.automaker', 'board'));
    });
  });

  describe('getImagesDir', () => {
    it('should return path to images directory', () => {
      expect(getImagesDir(projectPath)).toBe(path.join(projectPath, '.automaker', 'images'));
    });
  });

  describe('getWorktreesDir', () => {
    it('should return path to worktrees directory', () => {
      expect(getWorktreesDir(projectPath)).toBe(path.join(projectPath, '.automaker', 'worktrees'));
    });
  });

  describe('getAppSpecPath', () => {
    it('should return path to app_spec.txt file', () => {
      expect(getAppSpecPath(projectPath)).toBe(
        path.join(projectPath, '.automaker', 'app_spec.txt')
      );
    });
  });

  describe('getBranchTrackingPath', () => {
    it('should return path to active-branches.json file', () => {
      expect(getBranchTrackingPath(projectPath)).toBe(
        path.join(projectPath, '.automaker', 'active-branches.json')
      );
    });
  });

  describe('getNotificationsPath', () => {
    it('should return path to notifications.json file', () => {
      expect(getNotificationsPath(projectPath)).toBe(
        path.join(projectPath, '.automaker', 'notifications.json')
      );
    });

    it('should handle paths with trailing slashes', () => {
      const pathWithSlash = path.join('/test', 'project') + path.sep;
      expect(getNotificationsPath(pathWithSlash)).toBe(
        path.join(pathWithSlash, '.automaker', 'notifications.json')
      );
    });
  });

  describe('getExecutionStatePath', () => {
    it('should return path to execution-state.json file', () => {
      expect(getExecutionStatePath(projectPath)).toBe(
        path.join(projectPath, '.automaker', 'execution-state.json')
      );
    });

    it('should handle paths with trailing slashes', () => {
      const pathWithSlash = path.join('/test', 'project') + path.sep;
      expect(getExecutionStatePath(pathWithSlash)).toBe(
        path.join(pathWithSlash, '.automaker', 'execution-state.json')
      );
    });
  });

  describe('getContextDir', () => {
    it('should return path to context directory', () => {
      expect(getContextDir(projectPath)).toBe(path.join(projectPath, '.automaker', 'context'));
    });
  });

  describe('Feature subdirectory paths', () => {
    it('should return path to feature summaries directory', () => {
      expect(getFeatureSummariesDir(projectPath, 'feature-123')).toBe(
        path.join(projectPath, '.automaker', 'features', 'feature-123', 'summaries')
      );
    });

    it('should return path to feature logs directory', () => {
      expect(getFeatureLogsDir(projectPath, 'feature-123')).toBe(
        path.join(projectPath, '.automaker', 'features', 'feature-123', 'logs')
      );
    });

    it('should return path to feature backups directory', () => {
      expect(getFeatureBackupsDir(projectPath, 'feature-123')).toBe(
        path.join(projectPath, '.automaker', 'features', 'feature-123', 'backups')
      );
    });
  });

  describe('Validation paths', () => {
    it('should return path to validations directory', () => {
      expect(getValidationsDir(projectPath)).toBe(
        path.join(projectPath, '.automaker', 'validations')
      );
    });

    it('should return path to specific validation directory', () => {
      expect(getValidationDir(projectPath, 42)).toBe(
        path.join(projectPath, '.automaker', 'validations', '42')
      );
    });

    it('should return path to validation.json file', () => {
      expect(getValidationPath(projectPath, 42)).toBe(
        path.join(projectPath, '.automaker', 'validations', '42', 'validation.json')
      );
    });
  });

  describe('Ideation paths', () => {
    it('should return path to ideation directory', () => {
      expect(getIdeationDir(projectPath)).toBe(path.join(projectPath, '.automaker', 'ideation'));
    });

    it('should return path to ideas directory', () => {
      expect(getIdeasDir(projectPath)).toBe(
        path.join(projectPath, '.automaker', 'ideation', 'ideas')
      );
    });

    it('should return path to specific idea directory', () => {
      expect(getIdeaDir(projectPath, 'idea-1')).toBe(
        path.join(projectPath, '.automaker', 'ideation', 'ideas', 'idea-1')
      );
    });

    it('should return path to idea.json file', () => {
      expect(getIdeaPath(projectPath, 'idea-1')).toBe(
        path.join(projectPath, '.automaker', 'ideation', 'ideas', 'idea-1', 'idea.json')
      );
    });

    it('should return path to idea attachments directory', () => {
      expect(getIdeaAttachmentsDir(projectPath, 'idea-1')).toBe(
        path.join(projectPath, '.automaker', 'ideation', 'ideas', 'idea-1', 'attachments')
      );
    });

    it('should return path to ideation sessions directory', () => {
      expect(getIdeationSessionsDir(projectPath)).toBe(
        path.join(projectPath, '.automaker', 'ideation', 'sessions')
      );
    });

    it('should return path to specific session file', () => {
      expect(getIdeationSessionPath(projectPath, 'session-abc')).toBe(
        path.join(projectPath, '.automaker', 'ideation', 'sessions', 'session-abc.json')
      );
    });

    it('should return path to ideation drafts directory', () => {
      expect(getIdeationDraftsDir(projectPath)).toBe(
        path.join(projectPath, '.automaker', 'ideation', 'drafts')
      );
    });

    it('should return path to ideation analysis file', () => {
      expect(getIdeationAnalysisPath(projectPath)).toBe(
        path.join(projectPath, '.automaker', 'ideation', 'analysis.json')
      );
    });
  });

  describe('Event history paths', () => {
    it('should return path to event history directory', () => {
      expect(getEventHistoryDir(projectPath)).toBe(path.join(projectPath, '.automaker', 'events'));
    });

    it('should return path to event history index file', () => {
      expect(getEventHistoryIndexPath(projectPath)).toBe(
        path.join(projectPath, '.automaker', 'events', 'index.json')
      );
    });

    it('should return path to specific event file', () => {
      expect(getEventPath(projectPath, 'evt-12345')).toBe(
        path.join(projectPath, '.automaker', 'events', 'evt-12345.json')
      );
    });
  });

  describe('ensureIdeationDir', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = path.join(os.tmpdir(), `ideation-dir-test-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should create ideation directory structure and return path', async () => {
      const result = await ensureIdeationDir(testDir);

      expect(result).toBe(path.join(testDir, '.automaker', 'ideation'));
      const stats = await fs.stat(result);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should succeed if directory already exists', async () => {
      const ideationDir = path.join(testDir, '.automaker', 'ideation');
      await fs.mkdir(ideationDir, { recursive: true });

      const result = await ensureIdeationDir(testDir);

      expect(result).toBe(ideationDir);
    });
  });

  describe('ensureEventHistoryDir', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = path.join(os.tmpdir(), `event-history-dir-test-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should create event history directory and return path', async () => {
      const result = await ensureEventHistoryDir(testDir);

      expect(result).toBe(path.join(testDir, '.automaker', 'events'));
      const stats = await fs.stat(result);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should succeed if directory already exists', async () => {
      const eventsDir = path.join(testDir, '.automaker', 'events');
      await fs.mkdir(eventsDir, { recursive: true });

      const result = await ensureEventHistoryDir(testDir);

      expect(result).toBe(eventsDir);
    });
  });

  describe('ensureAutomakerDir', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = path.join(os.tmpdir(), `automaker-paths-test-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should create automaker directory and return path', async () => {
      const result = await ensureAutomakerDir(testDir);

      expect(result).toBe(path.join(testDir, '.automaker'));
      const stats = await fs.stat(result);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should succeed if directory already exists', async () => {
      const automakerDir = path.join(testDir, '.automaker');
      await fs.mkdir(automakerDir, { recursive: true });

      const result = await ensureAutomakerDir(testDir);

      expect(result).toBe(automakerDir);
    });
  });

  describe('getGlobalSettingsPath', () => {
    it('should return path to settings.json in data directory', () => {
      const dataDir = '/test/data';
      const result = getGlobalSettingsPath(dataDir);
      expect(result).toBe(path.join(dataDir, 'settings.json'));
    });

    it('should handle paths with trailing slashes', () => {
      const dataDir = '/test/data' + path.sep;
      const result = getGlobalSettingsPath(dataDir);
      expect(result).toBe(path.join(dataDir, 'settings.json'));
    });
  });

  describe('getCredentialsPath', () => {
    it('should return path to credentials.json in data directory', () => {
      const dataDir = '/test/data';
      const result = getCredentialsPath(dataDir);
      expect(result).toBe(path.join(dataDir, 'credentials.json'));
    });

    it('should handle paths with trailing slashes', () => {
      const dataDir = '/test/data' + path.sep;
      const result = getCredentialsPath(dataDir);
      expect(result).toBe(path.join(dataDir, 'credentials.json'));
    });
  });

  describe('getProjectSettingsPath', () => {
    it('should return path to settings.json in project .automaker directory', () => {
      const projectPath = '/test/project';
      const result = getProjectSettingsPath(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'settings.json'));
    });

    it('should handle paths with trailing slashes', () => {
      const projectPath = '/test/project' + path.sep;
      const result = getProjectSettingsPath(projectPath);
      expect(result).toBe(path.join(projectPath, '.automaker', 'settings.json'));
    });
  });

  describe('ensureDataDir', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = path.join(os.tmpdir(), `data-dir-test-${Date.now()}`);
    });

    afterEach(async () => {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should create data directory and return path', async () => {
      const result = await ensureDataDir(testDir);

      expect(result).toBe(testDir);
      const stats = await fs.stat(testDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should succeed if directory already exists', async () => {
      await fs.mkdir(testDir, { recursive: true });

      const result = await ensureDataDir(testDir);

      expect(result).toBe(testDir);
    });

    it('should create nested directories', async () => {
      const nestedDir = path.join(testDir, 'nested', 'deep');
      const result = await ensureDataDir(nestedDir);

      expect(result).toBe(nestedDir);
      const stats = await fs.stat(nestedDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });
});
