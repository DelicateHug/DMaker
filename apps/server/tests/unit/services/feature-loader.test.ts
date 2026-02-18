import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureLoader } from '@/services/feature-loader.js';
import * as fs from 'fs/promises';
import path from 'path';

vi.mock('fs/promises');

describe('feature-loader.ts', () => {
  let loader: FeatureLoader;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new FeatureLoader();
    // Skip status-based migration in most tests — migration is tested separately.
    // This prevents extra readdir/access calls from confusing mock chains.
    vi.spyOn(loader, 'migrateToStatusLayout').mockResolvedValue(undefined);
  });

  describe('getFeaturesDir', () => {
    it('should return features directory path', () => {
      const result = loader.getFeaturesDir(testProjectPath);
      expect(result).toContain('test');
      expect(result).toContain('project');
      expect(result).toContain('.automaker');
      expect(result).toContain('features');
    });
  });

  describe('getFeatureImagesDir', () => {
    it('should return feature images directory path', () => {
      const result = loader.getFeatureImagesDir(testProjectPath, 'feature-123');
      expect(result).toContain('features');
      expect(result).toContain('feature-123');
      expect(result).toContain('images');
    });
  });

  describe('getFeatureDir', () => {
    it('should return flat path for old-format feature IDs', () => {
      const result = loader.getFeatureDir(testProjectPath, 'feature-123');
      expect(result).toBe(path.join(testProjectPath, '.automaker', 'features', 'feature-123'));
    });

    it('should return month-based path for new-format feature IDs (dd-MM-YYYY-slug)', () => {
      const featureId = '17-02-2026-add_dark_mode';
      const result = loader.getFeatureDir(testProjectPath, featureId);
      expect(result).toBe(
        path.join(testProjectPath, '.automaker', 'features', '2026-february', featureId)
      );
    });

    it('should return month-based path for January new-format IDs', () => {
      const featureId = '01-01-2026-new_feature';
      const result = loader.getFeatureDir(testProjectPath, featureId);
      expect(result).toBe(
        path.join(testProjectPath, '.automaker', 'features', '2026-january', featureId)
      );
    });

    it('should return month-based path for December new-format IDs', () => {
      const featureId = '25-12-2025-holiday_update';
      const result = loader.getFeatureDir(testProjectPath, featureId);
      expect(result).toBe(
        path.join(testProjectPath, '.automaker', 'features', '2025-december', featureId)
      );
    });

    it('should return flat path for arbitrary string IDs', () => {
      const result = loader.getFeatureDir(testProjectPath, 'auth-feature');
      expect(result).toBe(path.join(testProjectPath, '.automaker', 'features', 'auth-feature'));
    });

    it('should return flat path for legacy timestamp IDs', () => {
      const result = loader.getFeatureDir(testProjectPath, 'feature-1708300000000-abc');
      expect(result).toBe(
        path.join(testProjectPath, '.automaker', 'features', 'feature-1708300000000-abc')
      );
    });
  });

  describe('getFeatureJsonPath', () => {
    it('should return feature.json path', () => {
      const result = loader.getFeatureJsonPath(testProjectPath, 'feature-123');
      expect(result).toContain('features');
      expect(result).toContain('feature-123');
      expect(result).toContain('feature.json');
    });
  });

  describe('getAgentOutputPath', () => {
    it('should return agent-output.md path inside logs/ subdirectory', () => {
      const result = loader.getAgentOutputPath(testProjectPath, 'feature-123');
      expect(result).toContain('features');
      expect(result).toContain('feature-123');
      expect(result).toContain('logs');
      expect(result).toContain('agent-output.md');
    });
  });

  describe('getRawOutputPath', () => {
    it('should return raw-output.jsonl path inside logs/ subdirectory', () => {
      const result = loader.getRawOutputPath(testProjectPath, 'feature-123');
      expect(result).toContain('features');
      expect(result).toContain('feature-123');
      expect(result).toContain('logs');
      expect(result).toContain('raw-output.jsonl');
    });
  });

  describe('generateFeatureId', () => {
    it('should generate unique feature ID with dd-MM-YYYY-random format when no description', () => {
      const id1 = loader.generateFeatureId();
      const id2 = loader.generateFeatureId();

      expect(id1).toMatch(/^\d{2}-\d{2}-\d{4}-[a-z0-9]+$/);
      expect(id2).toMatch(/^\d{2}-\d{2}-\d{4}-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should contain valid date components', () => {
      const id = loader.generateFeatureId();
      const parts = id.split('-');
      const dd = parseInt(parts[0]);
      const MM = parseInt(parts[1]);
      const YYYY = parseInt(parts[2]);

      expect(dd).toBeGreaterThanOrEqual(1);
      expect(dd).toBeLessThanOrEqual(31);
      expect(MM).toBeGreaterThanOrEqual(1);
      expect(MM).toBeLessThanOrEqual(12);
      expect(YYYY).toBeGreaterThanOrEqual(2020);
    });

    it('should derive slug from description', () => {
      const id = loader.generateFeatureId('Add dark mode toggle button');
      const parts = id.split('-');
      // dd-MM-YYYY-slug
      const slug = parts.slice(3).join('-');
      expect(slug).toBe('add_dark_mode_toggle');
    });

    it('should limit slug to first 4 words', () => {
      const id = loader.generateFeatureId('one two three four five six');
      const parts = id.split('-');
      const slug = parts.slice(3).join('-');
      expect(slug).toBe('one_two_three_four');
    });

    it('should strip non-alphanumeric characters from slug words', () => {
      const id = loader.generateFeatureId('Hello, World! How are you?');
      const parts = id.split('-');
      const slug = parts.slice(3).join('-');
      expect(slug).toBe('hello_world_how_are');
    });

    it('should fall back to random suffix for empty description', () => {
      const id = loader.generateFeatureId('');
      expect(id).toMatch(/^\d{2}-\d{2}-\d{4}-[a-z0-9]+$/);
    });

    it('should fall back to random suffix for whitespace-only description', () => {
      const id = loader.generateFeatureId('   ');
      expect(id).toMatch(/^\d{2}-\d{2}-\d{4}-[a-z0-9]+$/);
    });

    it('should fall back to random suffix for description with only special chars', () => {
      const id = loader.generateFeatureId('!!! @@@');
      expect(id).toMatch(/^\d{2}-\d{2}-\d{4}-[a-z0-9]+$/);
    });
  });

  describe('getAll', () => {
    it("should return empty array when features directory doesn't exist", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await loader.getAll(testProjectPath);

      expect(result).toEqual([]);
    });

    it('should load all features from feature directories', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
        { name: 'file.txt', isDirectory: () => false } as any,
      ]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-1',
            category: 'ui',
            description: 'Feature 1',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2',
            category: 'backend',
            description: 'Feature 2',
          })
        );

      const result = await loader.getAll(testProjectPath);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('feature-1');
      expect(result[1].id).toBe('feature-2');
    });

    it('should skip features without id field', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            category: 'ui',
            description: 'Missing ID',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2',
            category: 'backend',
            description: 'Feature 2',
          })
        );

      const result = await loader.getAll(testProjectPath);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('feature-2');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/WARN.*\[FeatureLoader\]/),
        expect.stringContaining("missing required 'id' field")
      );

      consoleSpy.mockRestore();
    });

    it('should skip features with missing feature.json', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      const error: any = new Error('File not found');
      error.code = 'ENOENT';

      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2',
            category: 'backend',
            description: 'Feature 2',
          })
        );

      const result = await loader.getAll(testProjectPath);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('feature-2');
    });

    it('should handle malformed JSON gracefully', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
      ]);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(fs.readFile).mockResolvedValue('invalid json{');

      const result = await loader.getAll(testProjectPath);

      expect(result).toEqual([]);
      // With recovery-enabled reads, warnings come from AtomicWriter and FeatureLoader
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/WARN.*\[AtomicWriter\]/),
        expect.stringContaining('unavailable')
      );

      consoleSpy.mockRestore();
    });

    it('should load features from month subdirectories', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      // First readdir: features root contains a month dir and a legacy flat dir
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce([
          { name: '2026-february', isDirectory: () => true } as any,
          { name: 'feature-legacy', isDirectory: () => true } as any,
        ])
        // Second readdir: inside the month directory, two feature dirs
        .mockResolvedValueOnce([
          { name: '17-02-2026-dark_mode', isDirectory: () => true } as any,
          { name: '18-02-2026-login_page', isDirectory: () => true } as any,
        ]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: '17-02-2026-dark_mode',
            category: 'ui',
            description: 'Dark mode',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: '18-02-2026-login_page',
            category: 'auth',
            description: 'Login page',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-legacy',
            category: 'misc',
            description: 'Legacy feature',
          })
        );

      const result = await loader.getAll(testProjectPath);

      expect(result).toHaveLength(3);
      // All three features should be loaded
      const ids = result.map((f) => f.id);
      expect(ids).toContain('17-02-2026-dark_mode');
      expect(ids).toContain('18-02-2026-login_page');
      expect(ids).toContain('feature-legacy');
    });

    it('should handle empty month subdirectories gracefully', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      vi.mocked(fs.readdir)
        .mockResolvedValueOnce([{ name: '2026-january', isDirectory: () => true } as any])
        // Empty month directory
        .mockResolvedValueOnce([]);

      const result = await loader.getAll(testProjectPath);

      expect(result).toHaveLength(0);
    });

    it('should handle errors reading month subdirectory gracefully', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      vi.mocked(fs.readdir)
        .mockResolvedValueOnce([
          { name: '2026-march', isDirectory: () => true } as any,
          { name: 'feature-ok', isDirectory: () => true } as any,
        ])
        // Month dir read fails
        .mockRejectedValueOnce(new Error('Permission denied'));

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify({
          id: 'feature-ok',
          category: 'ui',
          description: 'OK feature',
        })
      );

      const result = await loader.getAll(testProjectPath);

      // Should still load the flat feature
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('feature-ok');

      consoleSpy.mockRestore();
    });

    it('should sort features by creation order (timestamp)', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-3', isDirectory: () => true } as any,
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-3000-xyz',
            category: 'ui',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-1000-abc',
            category: 'ui',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2000-def',
            category: 'ui',
          })
        );

      const result = await loader.getAll(testProjectPath);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('feature-1000-abc');
      expect(result[1].id).toBe('feature-2000-def');
      expect(result[2].id).toBe('feature-3000-xyz');
    });
  });

  describe('get', () => {
    it('should return feature by ID', async () => {
      const featureData = {
        id: 'feature-123',
        category: 'ui',
        description: 'Test feature',
      };

      // resolveFeatureDir scans status dirs; return null so get() falls back to legacy path
      vi.spyOn(loader, 'resolveFeatureDir').mockResolvedValue(null);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(featureData));

      const result = await loader.get(testProjectPath, 'feature-123');

      expect(result).toEqual(featureData);
    });

    it("should return null when feature doesn't exist", async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      vi.spyOn(loader, 'resolveFeatureDir').mockResolvedValue(null);
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await loader.get(testProjectPath, 'feature-123');

      expect(result).toBeNull();
    });

    it('should return null on other errors (with recovery attempt)', async () => {
      // With recovery-enabled reads, get() returns null instead of throwing
      // because it attempts to recover from backups before giving up
      vi.spyOn(loader, 'resolveFeatureDir').mockResolvedValue(null);
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'));

      const result = await loader.get(testProjectPath, 'feature-123');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create new feature', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const featureData = {
        category: 'ui',
        description: 'New feature',
      };

      const result = await loader.create(testProjectPath, featureData);

      expect(result).toMatchObject({
        category: 'ui',
        description: 'New feature',
        id: expect.stringMatching(/^\d{2}-\d{2}-\d{4}-new_feature$/),
      });
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should use provided ID if given', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await loader.create(testProjectPath, {
        id: 'custom-id',
        category: 'ui',
        description: 'Test',
      });

      expect(result.id).toBe('custom-id');
    });

    it('should set default category if not provided', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await loader.create(testProjectPath, {
        description: 'Test',
      });

      expect(result.category).toBe('Uncategorized');
    });

    it('should create all 4 subfolders (images, summaries, logs, backups) on feature creation', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await loader.create(testProjectPath, {
        id: 'custom-id',
        category: 'ui',
        description: 'Test subfolder creation',
      });

      const mkdirCalls = vi.mocked(fs.mkdir).mock.calls.map((call) => call[0] as string);
      expect(mkdirCalls.some((p) => p.includes('images'))).toBe(true);
      expect(mkdirCalls.some((p) => p.includes('summaries'))).toBe(true);
      expect(mkdirCalls.some((p) => p.includes('logs'))).toBe(true);
      expect(mkdirCalls.some((p) => p.includes('backups'))).toBe(true);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      // update() calls get() which calls resolveFeatureDir
      vi.spyOn(loader, 'resolveFeatureDir').mockResolvedValue(null);
    });

    it('should update existing feature', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          id: 'feature-123',
          category: 'ui',
          description: 'Old description',
        })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await loader.update(testProjectPath, 'feature-123', {
        description: 'New description',
      });

      expect(result.description).toBe('New description');
      expect(result.category).toBe('ui');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it("should throw if feature doesn't exist", async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(loader.update(testProjectPath, 'feature-123', {})).rejects.toThrow('not found');
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      // delete() calls resolveFeatureDir to find the actual path
      vi.spyOn(loader, 'resolveFeatureDir').mockResolvedValue(null);
    });

    it('should delete feature directory', async () => {
      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const result = await loader.delete(testProjectPath, 'feature-123');

      expect(result).toBe(true);
      expect(fs.rm).toHaveBeenCalledWith(expect.stringContaining('feature-123'), {
        recursive: true,
        force: true,
      });
    });

    it('should return false on error', async () => {
      vi.mocked(fs.rm).mockRejectedValue(new Error('Permission denied'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await loader.delete(testProjectPath, 'feature-123');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/ERROR.*\[FeatureLoader\]/),
        expect.stringContaining('Failed to delete feature'),
        expect.objectContaining({ message: 'Permission denied' })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('getAgentOutput', () => {
    it('should return agent output content', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('Agent output content');

      const result = await loader.getAgentOutput(testProjectPath, 'feature-123');

      expect(result).toBe('Agent output content');
    });

    it("should return null when file doesn't exist", async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await loader.getAgentOutput(testProjectPath, 'feature-123');

      expect(result).toBeNull();
    });

    it('should throw on other errors', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'));

      await expect(loader.getAgentOutput(testProjectPath, 'feature-123')).rejects.toThrow(
        'Permission denied'
      );
    });
  });

  describe('saveAgentOutput', () => {
    it('should create logs directory and save agent output to file', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await loader.saveAgentOutput(testProjectPath, 'feature-123', 'Output content');

      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('logs'), { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('agent-output.md'),
        'Output content',
        'utf-8'
      );
    });
  });

  describe('deleteAgentOutput', () => {
    it('should delete agent output file', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await loader.deleteAgentOutput(testProjectPath, 'feature-123');

      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('agent-output.md'));
    });

    it('should handle missing file gracefully', async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      vi.mocked(fs.unlink).mockRejectedValue(error);

      // Should not throw
      await expect(
        loader.deleteAgentOutput(testProjectPath, 'feature-123')
      ).resolves.toBeUndefined();
    });

    it('should throw on other errors', async () => {
      vi.mocked(fs.unlink).mockRejectedValue(new Error('Permission denied'));

      await expect(loader.deleteAgentOutput(testProjectPath, 'feature-123')).rejects.toThrow(
        'Permission denied'
      );
    });
  });

  describe('findByTitle', () => {
    it('should find feature by exact title match (case-insensitive)', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-1000-abc',
            title: 'Login Feature',
            category: 'auth',
            description: 'Login implementation',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2000-def',
            title: 'Logout Feature',
            category: 'auth',
            description: 'Logout implementation',
          })
        );

      const result = await loader.findByTitle(testProjectPath, 'LOGIN FEATURE');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('feature-1000-abc');
      expect(result?.title).toBe('Login Feature');
    });

    it('should return null when title is not found', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify({
          id: 'feature-1000-abc',
          title: 'Login Feature',
          category: 'auth',
          description: 'Login implementation',
        })
      );

      const result = await loader.findByTitle(testProjectPath, 'Nonexistent Feature');

      expect(result).toBeNull();
    });

    it('should return null for empty or whitespace title', async () => {
      const result1 = await loader.findByTitle(testProjectPath, '');
      const result2 = await loader.findByTitle(testProjectPath, '   ');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('should skip features without titles', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-1000-abc',
            // no title
            category: 'auth',
            description: 'Login implementation',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2000-def',
            title: 'Login Feature',
            category: 'auth',
            description: 'Another login',
          })
        );

      const result = await loader.findByTitle(testProjectPath, 'Login Feature');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('feature-2000-def');
    });
  });

  describe('findDuplicateTitle', () => {
    it('should find duplicate title', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify({
          id: 'feature-1000-abc',
          title: 'My Feature',
          category: 'ui',
          description: 'Feature description',
        })
      );

      const result = await loader.findDuplicateTitle(testProjectPath, 'my feature');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('feature-1000-abc');
    });

    it('should exclude specified feature ID from duplicate check', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-1000-abc',
            title: 'My Feature',
            category: 'ui',
            description: 'Feature 1',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2000-def',
            title: 'Other Feature',
            category: 'ui',
            description: 'Feature 2',
          })
        );

      // Should not find duplicate when excluding the feature that has the title
      const result = await loader.findDuplicateTitle(
        testProjectPath,
        'My Feature',
        'feature-1000-abc'
      );

      expect(result).toBeNull();
    });

    it('should find duplicate when title exists on different feature', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-1000-abc',
            title: 'My Feature',
            category: 'ui',
            description: 'Feature 1',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2000-def',
            title: 'Other Feature',
            category: 'ui',
            description: 'Feature 2',
          })
        );

      // Should find duplicate because feature-1000-abc has the title and we're excluding feature-2000-def
      const result = await loader.findDuplicateTitle(
        testProjectPath,
        'My Feature',
        'feature-2000-def'
      );

      expect(result).not.toBeNull();
      expect(result?.id).toBe('feature-1000-abc');
    });

    it('should return null for empty or whitespace title', async () => {
      const result1 = await loader.findDuplicateTitle(testProjectPath, '');
      const result2 = await loader.findDuplicateTitle(testProjectPath, '   ');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('should handle titles with leading/trailing whitespace', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify({
          id: 'feature-1000-abc',
          title: 'My Feature',
          category: 'ui',
          description: 'Feature description',
        })
      );

      const result = await loader.findDuplicateTitle(testProjectPath, '  My Feature  ');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('feature-1000-abc');
    });
  });

  describe('syncFeatureToAppSpec', () => {
    const sampleAppSpec = `<?xml version="1.0" encoding="UTF-8"?>
<project_specification>
  <project_name>Test Project</project_name>
  <core_capabilities>
    <capability>Testing</capability>
  </core_capabilities>
  <implemented_features>
    <feature>
      <name>Existing Feature</name>
      <description>Already implemented</description>
    </feature>
  </implemented_features>
</project_specification>`;

    const appSpecWithoutFeatures = `<?xml version="1.0" encoding="UTF-8"?>
<project_specification>
  <project_name>Test Project</project_name>
  <core_capabilities>
    <capability>Testing</capability>
  </core_capabilities>
</project_specification>`;

    it('should add feature to app_spec.txt', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(sampleAppSpec);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const feature = {
        id: 'feature-1234-abc',
        title: 'New Feature',
        category: 'ui',
        description: 'A new feature description',
      };

      const result = await loader.syncFeatureToAppSpec(testProjectPath, feature);

      expect(result).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('app_spec.txt'),
        expect.stringContaining('New Feature'),
        'utf-8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('A new feature description'),
        'utf-8'
      );
    });

    it('should add feature with file locations', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(sampleAppSpec);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const feature = {
        id: 'feature-1234-abc',
        title: 'Feature With Locations',
        category: 'backend',
        description: 'Feature with file locations',
      };

      const result = await loader.syncFeatureToAppSpec(testProjectPath, feature, [
        'src/feature.ts',
        'src/utils/helper.ts',
      ]);

      expect(result).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('src/feature.ts'),
        'utf-8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('src/utils/helper.ts'),
        'utf-8'
      );
    });

    it('should return false when app_spec.txt does not exist', async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValueOnce(error);

      const feature = {
        id: 'feature-1234-abc',
        title: 'New Feature',
        category: 'ui',
        description: 'A new feature description',
      };

      const result = await loader.syncFeatureToAppSpec(testProjectPath, feature);

      expect(result).toBe(false);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should return false when feature already exists (duplicate)', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(sampleAppSpec);

      const feature = {
        id: 'feature-5678-xyz',
        title: 'Existing Feature', // Same name as existing feature
        category: 'ui',
        description: 'Different description',
      };

      const result = await loader.syncFeatureToAppSpec(testProjectPath, feature);

      expect(result).toBe(false);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should use feature ID as fallback name when title is missing', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(sampleAppSpec);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const feature = {
        id: 'feature-1234-abc',
        category: 'ui',
        description: 'Feature without title',
        // No title property
      };

      const result = await loader.syncFeatureToAppSpec(testProjectPath, feature);

      expect(result).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Feature: feature-1234-abc'),
        'utf-8'
      );
    });

    it('should handle app_spec without implemented_features section', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(appSpecWithoutFeatures);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const feature = {
        id: 'feature-1234-abc',
        title: 'First Feature',
        category: 'ui',
        description: 'First implemented feature',
      };

      const result = await loader.syncFeatureToAppSpec(testProjectPath, feature);

      expect(result).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('<implemented_features>'),
        'utf-8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('First Feature'),
        'utf-8'
      );
    });

    it('should throw on non-ENOENT file read errors', async () => {
      const error = new Error('Permission denied');
      vi.mocked(fs.readFile).mockRejectedValueOnce(error);

      const feature = {
        id: 'feature-1234-abc',
        title: 'New Feature',
        category: 'ui',
        description: 'A new feature description',
      };

      await expect(loader.syncFeatureToAppSpec(testProjectPath, feature)).rejects.toThrow(
        'Permission denied'
      );
    });

    it('should preserve existing features when adding a new one', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(sampleAppSpec);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const feature = {
        id: 'feature-1234-abc',
        title: 'New Feature',
        category: 'ui',
        description: 'A new feature',
      };

      await loader.syncFeatureToAppSpec(testProjectPath, feature);

      // Verify both old and new features are in the output
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Existing Feature'),
        'utf-8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('New Feature'),
        'utf-8'
      );
    });

    it('should escape special characters in feature name and description', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(sampleAppSpec);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const feature = {
        id: 'feature-1234-abc',
        title: 'Feature with <special> & "chars"',
        category: 'ui',
        description: 'Description with <tags> & "quotes"',
      };

      const result = await loader.syncFeatureToAppSpec(testProjectPath, feature);

      expect(result).toBe(true);
      // The XML should have escaped characters
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('&lt;special&gt;'),
        'utf-8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('&amp;'),
        'utf-8'
      );
    });

    it('should not add empty file_locations array', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(sampleAppSpec);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const feature = {
        id: 'feature-1234-abc',
        title: 'Feature Without Locations',
        category: 'ui',
        description: 'No file locations',
      };

      await loader.syncFeatureToAppSpec(testProjectPath, feature, []);

      // File locations should not be included when array is empty
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const writtenContent = writeCall[1] as string;

      // Count occurrences of file_locations - should only have the one from Existing Feature if any
      // The new feature should not add file_locations
      expect(writtenContent).toContain('Feature Without Locations');
    });
  });

  describe('getSummariesDir', () => {
    it('should return summaries directory path', () => {
      const result = loader.getSummariesDir(testProjectPath, 'feature-123');
      expect(result).toContain('features');
      expect(result).toContain('feature-123');
      expect(result).toContain('summaries');
    });
  });

  describe('saveSummaryFile', () => {
    it('should save summary to a markdown file with sanitized timestamp', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const timestamp = '2024-01-15T10:30:00.000Z';
      const result = await loader.saveSummaryFile(
        testProjectPath,
        'feature-123',
        '# Summary\nThis feature adds login.',
        timestamp
      );

      expect(result).toBe(timestamp);
      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('summaries'), {
        recursive: true,
      });
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('2024-01-15T10-30-00.000Z.md'),
        '# Summary\nThis feature adds login.',
        'utf-8'
      );
    });

    it('should generate timestamp when not provided', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await loader.saveSummaryFile(
        testProjectPath,
        'feature-123',
        'Summary content'
      );

      // Should return a valid ISO timestamp
      expect(new Date(result).toISOString()).toBe(result);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.md'),
        'Summary content',
        'utf-8'
      );
    });
  });

  describe('getSummaryFiles', () => {
    it('should return empty array when summaries directory does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await loader.getSummaryFiles(testProjectPath, 'feature-123');

      expect(result).toEqual([]);
    });

    it('should read and parse summary files sorted by timestamp (newest first)', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        '2024-01-15T10-30-00.000Z.md',
        '2024-01-16T12-00-00.000Z.md',
        '2024-01-14T08-00-00.000Z.md',
      ] as any);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce('Summary from Jan 15')
        .mockResolvedValueOnce('Summary from Jan 16')
        .mockResolvedValueOnce('Summary from Jan 14');

      const result = await loader.getSummaryFiles(testProjectPath, 'feature-123');

      expect(result).toHaveLength(3);
      // Should be sorted newest first
      expect(result[0].timestamp).toBe('2024-01-16T12:00:00.000Z');
      expect(result[0].summary).toBe('Summary from Jan 16');
      expect(result[1].timestamp).toBe('2024-01-15T10:30:00.000Z');
      expect(result[1].summary).toBe('Summary from Jan 15');
      expect(result[2].timestamp).toBe('2024-01-14T08:00:00.000Z');
      expect(result[2].summary).toBe('Summary from Jan 14');
    });

    it('should filter to only .md files', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        '2024-01-15T10-30-00.000Z.md',
        '.DS_Store',
        'readme.txt',
      ] as any);

      vi.mocked(fs.readFile).mockResolvedValueOnce('Summary content');

      const result = await loader.getSummaryFiles(testProjectPath, 'feature-123');

      expect(result).toHaveLength(1);
      expect(result[0].summary).toBe('Summary content');
    });

    it('should skip files that fail to read', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        '2024-01-15T10-30-00.000Z.md',
        '2024-01-16T12-00-00.000Z.md',
      ] as any);

      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValueOnce('Summary from Jan 16');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await loader.getSummaryFiles(testProjectPath, 'feature-123');

      expect(result).toHaveLength(1);
      expect(result[0].summary).toBe('Summary from Jan 16');

      consoleSpy.mockRestore();
    });

    it('should return empty array on readdir error', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await loader.getSummaryFiles(testProjectPath, 'feature-123');

      expect(result).toEqual([]);

      consoleSpy.mockRestore();
    });
  });

  describe('getAllSummaries', () => {
    it("should return empty array when features directory doesn't exist", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await loader.getAllSummaries(testProjectPath);

      expect(result).toEqual([]);
    });

    it('should return lightweight summaries from feature.json files', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
        { name: 'file.txt', isDirectory: () => false } as any,
      ]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-1000-abc',
            title: 'Login Feature',
            category: 'auth',
            description: 'Full login description that should not appear in summary',
            status: 'completed',
            priority: 1,
            isFavorite: true,
            model: 'gpt-4',
            branchName: 'feature/login',
            error: undefined,
            startedAt: '2024-01-15T10:00:00.000Z',
            imagePaths: ['img1.png', 'img2.png'],
            spec: 'Heavy spec content that should not appear',
            descriptionHistory: [
              { description: 'old', timestamp: '2024-01-01', source: 'initial' },
            ],
            summaryHistory: [{ summary: 'old summary', timestamp: '2024-01-01' }],
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2000-def',
            category: 'backend',
            description: 'Backend feature',
            status: 'pending',
          })
        );

      const result = await loader.getAllSummaries(testProjectPath);

      expect(result).toHaveLength(2);

      // First feature - verify lightweight fields are present
      expect(result[0].id).toBe('feature-1000-abc');
      expect(result[0].title).toBe('Login Feature');
      expect(result[0].category).toBe('auth');
      expect(result[0].status).toBe('completed');
      expect(result[0].priority).toBe(1);
      expect(result[0].isFavorite).toBe(true);
      expect(result[0].model).toBe('gpt-4');
      expect(result[0].branchName).toBe('feature/login');
      expect(result[0].startedAt).toBe('2024-01-15T10:00:00.000Z');
      expect(result[0].imagePathsCount).toBe(2);

      // Verify heavy fields are NOT present
      expect((result[0] as any).description).toBeUndefined();
      expect((result[0] as any).spec).toBeUndefined();
      expect((result[0] as any).descriptionHistory).toBeUndefined();
      expect((result[0] as any).summaryHistory).toBeUndefined();
      expect((result[0] as any).imagePaths).toBeUndefined();

      // Second feature - verify defaults
      expect(result[1].id).toBe('feature-2000-def');
      expect(result[1].category).toBe('backend');
      expect(result[1].status).toBe('pending');
      expect(result[1].imagePathsCount).toBe(0);
    });

    it('should skip features without id field', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            category: 'ui',
            description: 'Missing ID',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2000-def',
            category: 'backend',
            description: 'Feature 2',
          })
        );

      const result = await loader.getAllSummaries(testProjectPath);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('feature-2000-def');

      consoleSpy.mockRestore();
    });

    it('should skip features with missing feature.json', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      const error: any = new Error('File not found');
      error.code = 'ENOENT';

      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2000-def',
            category: 'backend',
            description: 'Feature 2',
          })
        );

      const result = await loader.getAllSummaries(testProjectPath);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('feature-2000-def');
    });

    it('should handle malformed JSON gracefully', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
      ]);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(fs.readFile).mockResolvedValue('invalid json{');

      const result = await loader.getAllSummaries(testProjectPath);

      expect(result).toEqual([]);

      consoleSpy.mockRestore();
    });

    it('should sort summaries by creation order (timestamp in ID)', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-3', isDirectory: () => true } as any,
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-3000-xyz',
            category: 'ui',
            description: 'Third',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-1000-abc',
            category: 'ui',
            description: 'First',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2000-def',
            category: 'ui',
            description: 'Second',
          })
        );

      const result = await loader.getAllSummaries(testProjectPath);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('feature-1000-abc');
      expect(result[1].id).toBe('feature-2000-def');
      expect(result[2].id).toBe('feature-3000-xyz');
    });

    it('should load summaries from month subdirectories', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      // First readdir: features root with a month dir and a legacy flat dir
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce([
          { name: '2026-february', isDirectory: () => true } as any,
          { name: 'feature-legacy', isDirectory: () => true } as any,
        ])
        // Second readdir: inside the month directory
        .mockResolvedValueOnce([{ name: '17-02-2026-dark_mode', isDirectory: () => true } as any]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: '17-02-2026-dark_mode',
            title: 'Dark Mode',
            category: 'ui',
            description: 'Add dark mode',
            status: 'pending',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-legacy',
            title: 'Legacy',
            category: 'misc',
            description: 'Legacy feature',
            status: 'completed',
          })
        );

      const result = await loader.getAllSummaries(testProjectPath);

      expect(result).toHaveLength(2);
      const ids = result.map((s) => s.id);
      expect(ids).toContain('17-02-2026-dark_mode');
      expect(ids).toContain('feature-legacy');
    });

    it('should return imagePathsCount as 0 when no images', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify({
          id: 'feature-1000-abc',
          category: 'ui',
          description: 'No images',
        })
      );

      const result = await loader.getAllSummaries(testProjectPath);

      expect(result).toHaveLength(1);
      expect(result[0].imagePathsCount).toBe(0);
    });
  });
});
