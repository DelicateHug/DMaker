/**
 * Feature Loader - Handles loading and managing features from individual feature folders
 *
 * Features are organised under `.automaker/features/{status}/{featureId}/feature.json`
 * where `{status}` is one of: backlog, in_progress, waiting_approval, completed, pipeline_*
 *
 * Legacy layouts (flat and month-based) are auto-migrated on first access.
 */

import path from 'path';
import type {
  Feature,
  DescriptionHistoryEntry,
  SummaryHistoryEntry,
  FeatureListSummary,
} from '@automaker/types';
import {
  createLogger,
  atomicWriteJson,
  readJsonWithRecovery,
  logRecoveryWarning,
  DEFAULT_BACKUP_COUNT,
} from '@automaker/utils';
import * as secureFs from '../lib/secure-fs.js';
import {
  getFeaturesDir,
  getFeatureDir,
  getFeatureStatusDir,
  getAppSpecPath,
  ensureAutomakerDir,
  isMonthDir,
  isStatusDir,
} from '@automaker/platform';
import { addImplementedFeature, type ImplementedFeature } from '../lib/xml-extractor.js';

const logger = createLogger('FeatureLoader');

/** Default status for features that have no status field set */
const DEFAULT_STATUS = 'backlog';

// Re-export Feature types for convenience
export type { Feature, FeatureListSummary };

export class FeatureLoader {
  /** In-memory cache: featureId → absolute feature directory path */
  private featureDirCache = new Map<string, string>();

  /** Set of project paths that have already been migrated to status-based layout */
  private migratedProjects = new Set<string>();

  /**
   * Collect all feature directories from the features root.
   *
   * Handles three layouts (in priority order):
   *  1. **Status-based:** `features/{status}/{featureId}/` — status directories
   *     contain feature subdirectories. The status is inferred from the parent dir name.
   *  2. **Month-based (legacy):** `features/{YYYY}-{monthname}/{featureId}/`
   *  3. **Flat (legacy):** `features/{featureId}/` — each directory is a feature.
   *
   * @returns Array of `{ featureId, featureDir, knownStatus? }` tuples.
   */
  private async collectFeatureDirs(
    featuresDir: string,
    options?: { excludeStatuses?: string[]; includeStatuses?: string[] }
  ): Promise<Array<{ featureId: string; featureDir: string; knownStatus?: string }>> {
    const entries = (await secureFs.readdir(featuresDir, {
      withFileTypes: true,
    })) as any[];

    const dirs = entries.filter((entry) => entry.isDirectory());

    const result: Array<{ featureId: string; featureDir: string; knownStatus?: string }> = [];

    const excludeSet = options?.excludeStatuses ? new Set(options.excludeStatuses) : null;
    const includeSet = options?.includeStatuses ? new Set(options.includeStatuses) : null;

    // Process directories — status dirs and month dirs are expanded, others are treated as features
    await Promise.all(
      dirs.map(async (dir) => {
        if (isStatusDir(dir.name)) {
          // Skip excluded or non-included status directories
          if (excludeSet?.has(dir.name)) return;
          if (includeSet && !includeSet.has(dir.name)) return;
          // Status-based directory — children are feature directories
          const statusPath = path.join(featuresDir, dir.name);
          try {
            const statusEntries = (await secureFs.readdir(statusPath, {
              withFileTypes: true,
            })) as any[];
            for (const child of statusEntries) {
              if (child.isDirectory()) {
                result.push({
                  featureId: child.name,
                  featureDir: path.join(statusPath, child.name),
                  knownStatus: dir.name,
                });
              }
            }
          } catch (err) {
            logger.warn(`Failed to read status directory ${dir.name}:`, err);
          }
        } else if (isMonthDir(dir.name)) {
          // Legacy month-based subdirectory
          const monthPath = path.join(featuresDir, dir.name);
          try {
            const monthEntries = (await secureFs.readdir(monthPath, {
              withFileTypes: true,
            })) as any[];
            for (const child of monthEntries) {
              if (child.isDirectory()) {
                result.push({
                  featureId: child.name,
                  featureDir: path.join(monthPath, child.name),
                });
              }
            }
          } catch (err) {
            logger.warn(`Failed to read month directory ${dir.name}:`, err);
          }
        } else {
          // Legacy flat feature directory
          result.push({
            featureId: dir.name,
            featureDir: path.join(featuresDir, dir.name),
          });
        }
      })
    );

    // Deduplicate by featureId — if a feature exists in multiple directories
    // (e.g., due to interrupted move during status change), prefer the entry
    // whose directory matches the feature's actual status. The stale duplicate
    // directory is cleaned up automatically.
    const seenIds = new Map<string, number>();
    const deduplicated: typeof result = [];
    for (let i = 0; i < result.length; i++) {
      const entry = result[i];
      const prevIndex = seenIds.get(entry.featureId);
      if (prevIndex !== undefined) {
        const prev = deduplicated[prevIndex];
        let kept = prev;
        let stale = entry;

        // Prefer status-based over legacy
        if (!prev.knownStatus && entry.knownStatus) {
          kept = entry;
          stale = prev;
          deduplicated[prevIndex] = entry;
        }

        logger.info(
          `Duplicate feature directory for ${entry.featureId}: keeping ${kept.knownStatus || 'legacy'}/, removing stale copy from ${stale.knownStatus || 'legacy'}/`
        );

        // Clean up the stale duplicate directory in the background
        secureFs.rm(stale.featureDir, { recursive: true, force: true }).catch((err) => {
          logger.warn(`Failed to clean up stale duplicate directory ${stale.featureDir}:`, err);
        });
      } else {
        seenIds.set(entry.featureId, deduplicated.length);
        deduplicated.push(entry);
      }
    }

    // Update the in-memory directory cache
    for (const entry of deduplicated) {
      this.featureDirCache.set(entry.featureId, entry.featureDir);
    }

    return deduplicated;
  }

  /**
   * Migrate features from legacy layouts (flat / month-based) into the
   * status-based directory structure: `features/{status}/{featureId}/`.
   *
   * This is idempotent — already-migrated features (inside a status directory)
   * are skipped.  Runs once per project per server lifetime.
   */
  async migrateToStatusLayout(projectPath: string): Promise<void> {
    if (this.migratedProjects.has(projectPath)) return;

    const featuresDir = getFeaturesDir(projectPath);
    try {
      await secureFs.access(featuresDir);
    } catch {
      // No features directory yet — nothing to migrate
      this.migratedProjects.add(projectPath);
      return;
    }

    const entries = await this.collectFeatureDirs(featuresDir);

    // Only migrate entries that don't already have a known status (i.e. legacy layout)
    const legacyEntries = entries.filter((e) => !e.knownStatus);

    if (legacyEntries.length === 0) {
      this.migratedProjects.add(projectPath);
      return;
    }

    logger.info(
      `Migrating ${legacyEntries.length} features to status-based layout in ${projectPath}`
    );

    for (const { featureId, featureDir } of legacyEntries) {
      try {
        const featureJsonPath = path.join(featureDir, 'feature.json');
        let status = DEFAULT_STATUS;

        try {
          const raw = (await secureFs.readFile(featureJsonPath, 'utf-8')) as string;
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.status === 'string' && parsed.status) {
            status = parsed.status;
          }
        } catch {
          // Cannot read feature.json — use default status
        }

        const targetDir = getFeatureStatusDir(projectPath, status, featureId);

        // Skip if already at the target location
        if (path.resolve(featureDir) === path.resolve(targetDir)) continue;

        // Ensure the status parent directory exists
        await secureFs.mkdir(path.dirname(targetDir), { recursive: true });

        // Move the feature directory
        await secureFs.rename(featureDir, targetDir);

        // Update cache
        this.featureDirCache.set(featureId, targetDir);

        logger.debug(`Migrated feature ${featureId} → ${status}/`);
      } catch (err) {
        logger.warn(`Failed to migrate feature ${featureId}:`, err);
      }
    }

    // Clean up empty month directories after migration
    try {
      const topEntries = (await secureFs.readdir(featuresDir, { withFileTypes: true })) as any[];
      for (const entry of topEntries) {
        if (entry.isDirectory() && isMonthDir(entry.name)) {
          const monthPath = path.join(featuresDir, entry.name);
          try {
            const children = (await secureFs.readdir(monthPath)) as string[];
            if (children.length === 0) {
              await secureFs.rm(monthPath, { recursive: true, force: true });
              logger.debug(`Removed empty month directory: ${entry.name}`);
            }
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    } catch {
      // Ignore cleanup errors
    }

    this.migratedProjects.add(projectPath);
    logger.info(`Migration complete for ${projectPath}`);
  }

  /**
   * Move a feature directory to a new status subdirectory.
   *
   * Called after a feature's status is updated so the on-disk layout matches.
   * Uses `fs.rename()` for atomic moves within the same filesystem.
   */
  async moveFeatureToStatusDir(
    projectPath: string,
    featureId: string,
    newStatus: string
  ): Promise<void> {
    const targetDir = getFeatureStatusDir(projectPath, newStatus, featureId);
    const currentDir = await this.resolveFeatureDir(projectPath, featureId);

    if (!currentDir) {
      logger.warn(`Cannot move feature ${featureId}: directory not found`);
      return;
    }

    // Skip if already in the correct location
    if (path.resolve(currentDir) === path.resolve(targetDir)) return;

    try {
      // Ensure the target status directory exists
      await secureFs.mkdir(path.dirname(targetDir), { recursive: true });

      // Move the feature directory
      await secureFs.rename(currentDir, targetDir);

      // Update cache
      this.featureDirCache.set(featureId, targetDir);

      logger.debug(`Moved feature ${featureId} → ${newStatus}/`);
    } catch (err) {
      logger.warn(`Failed to move feature ${featureId} to ${newStatus}/:`, err);
    }
  }

  /**
   * Resolve the actual on-disk directory for a feature by its ID.
   *
   * Checks the in-memory cache first, then falls back to scanning
   * the features directory.
   */
  async resolveFeatureDir(projectPath: string, featureId: string): Promise<string | null> {
    // Check cache first
    const cached = this.featureDirCache.get(featureId);
    if (cached) {
      try {
        await secureFs.access(cached);
        return cached;
      } catch {
        // Cache entry stale — fall through to scan
        this.featureDirCache.delete(featureId);
      }
    }

    // Check the default status-based path (getFeatureDir constructs month/flat path,
    // but we should check common status dirs first)
    const featuresDir = getFeaturesDir(projectPath);
    try {
      const topEntries = (await secureFs.readdir(featuresDir, { withFileTypes: true })) as any[];
      for (const entry of topEntries) {
        if (entry.isDirectory() && isStatusDir(entry.name)) {
          const candidatePath = path.join(featuresDir, entry.name, featureId);
          try {
            await secureFs.access(candidatePath);
            this.featureDirCache.set(featureId, candidatePath);
            return candidatePath;
          } catch {
            // Not in this status dir
          }
        }
      }

      // Status dir scan didn't find the feature — check pipeline_* directories
      // that may not be caught by isStatusDir if they use dynamic names
      for (const entry of topEntries) {
        if (entry.isDirectory() && !isStatusDir(entry.name) && !isMonthDir(entry.name)) {
          // Check other directories that might contain features (e.g., custom pipeline states)
          const candidatePath = path.join(featuresDir, entry.name, featureId);
          try {
            await secureFs.access(candidatePath);
            this.featureDirCache.set(featureId, candidatePath);
            return candidatePath;
          } catch {
            // Not in this dir
          }
        }
      }
    } catch {
      // Cannot read features dir
    }

    // Fall back to legacy path resolution (month-based or flat)
    const legacyPath = getFeatureDir(projectPath, featureId);
    try {
      await secureFs.access(legacyPath);
      this.featureDirCache.set(featureId, legacyPath);
      return legacyPath;
    } catch {
      // Not found
    }

    return null;
  }

  /**
   * Get feature counts per status directory by counting subdirectories.
   * This is a lightweight operation — no JSON parsing needed.
   */
  async getCountsByStatus(projectPath: string): Promise<Record<string, number>> {
    const featuresDir = getFeaturesDir(projectPath);
    const counts: Record<string, number> = {};

    try {
      const entries = (await secureFs.readdir(featuresDir, { withFileTypes: true })) as any[];
      await Promise.all(
        entries.map(async (entry) => {
          if (entry.isDirectory() && isStatusDir(entry.name)) {
            const statusPath = path.join(featuresDir, entry.name);
            try {
              const children = (await secureFs.readdir(statusPath, {
                withFileTypes: true,
              })) as any[];
              counts[entry.name] = children.filter((c: any) => c.isDirectory()).length;
            } catch {
              counts[entry.name] = 0;
            }
          }
        })
      );
    } catch {
      // Features directory doesn't exist
    }

    return counts;
  }

  /**
   * Get the features directory path
   */
  getFeaturesDir(projectPath: string): string {
    return getFeaturesDir(projectPath);
  }

  /**
   * Get the images directory path for a feature
   */
  getFeatureImagesDir(projectPath: string, featureId: string): string {
    return path.join(this.getFeatureDir(projectPath, featureId), 'images');
  }

  /**
   * Get the summaries directory path for a feature
   */
  getSummariesDir(projectPath: string, featureId: string): string {
    return path.join(this.getFeatureDir(projectPath, featureId), 'summaries');
  }

  /**
   * Delete images that were removed from a feature
   */
  private async deleteOrphanedImages(
    projectPath: string,
    oldPaths: Array<string | { path: string; [key: string]: unknown }> | undefined,
    newPaths: Array<string | { path: string; [key: string]: unknown }> | undefined
  ): Promise<void> {
    if (!oldPaths || oldPaths.length === 0) {
      return;
    }

    // Build sets of paths for comparison
    const oldPathSet = new Set(oldPaths.map((p) => (typeof p === 'string' ? p : p.path)));
    const newPathSet = new Set((newPaths || []).map((p) => (typeof p === 'string' ? p : p.path)));

    // Find images that were removed
    for (const oldPath of oldPathSet) {
      if (!newPathSet.has(oldPath)) {
        try {
          // Paths are now absolute
          await secureFs.unlink(oldPath);
          logger.info(`Deleted orphaned image: ${oldPath}`);
        } catch (error) {
          // Ignore errors when deleting (file may already be gone)
          logger.warn(`Failed to delete image: ${oldPath}`, error);
        }
      }
    }
  }

  /**
   * Copy images from temp directory to feature directory and update paths
   */
  private async migrateImages(
    projectPath: string,
    featureId: string,
    imagePaths?: Array<string | { path: string; [key: string]: unknown }>
  ): Promise<Array<string | { path: string; [key: string]: unknown }> | undefined> {
    if (!imagePaths || imagePaths.length === 0) {
      return imagePaths;
    }

    const featureImagesDir = this.getFeatureImagesDir(projectPath, featureId);
    await secureFs.mkdir(featureImagesDir, { recursive: true });

    const updatedPaths: Array<string | { path: string; [key: string]: unknown }> = [];

    for (const imagePath of imagePaths) {
      try {
        const originalPath = typeof imagePath === 'string' ? imagePath : imagePath.path;

        // Skip if already in feature directory (already absolute path in external storage)
        if (originalPath.includes(`/features/${featureId}/images/`)) {
          updatedPaths.push(imagePath);
          continue;
        }

        // Resolve the full path
        const fullOriginalPath = path.isAbsolute(originalPath)
          ? originalPath
          : path.join(projectPath, originalPath);

        // Check if file exists
        try {
          await secureFs.access(fullOriginalPath);
        } catch {
          logger.warn(`Image not found, skipping: ${fullOriginalPath}`);
          continue;
        }

        // Get filename and create new path in external storage
        const filename = path.basename(originalPath);
        const newPath = path.join(featureImagesDir, filename);

        // Copy the file
        await secureFs.copyFile(fullOriginalPath, newPath);
        logger.info(`Copied image: ${originalPath} -> ${newPath}`);

        // Try to delete the original temp file
        try {
          await secureFs.unlink(fullOriginalPath);
        } catch {
          // Ignore errors when deleting temp file
        }

        // Update the path in the result (use absolute path)
        if (typeof imagePath === 'string') {
          updatedPaths.push(newPath);
        } else {
          updatedPaths.push({ ...imagePath, path: newPath });
        }
      } catch (error) {
        logger.error(`Failed to migrate image:`, error);
        // Rethrow error to let caller decide how to handle it
        // Keeping original path could lead to broken references
        throw error;
      }
    }

    return updatedPaths;
  }

  /**
   * Get the path to a specific feature folder.
   *
   * Checks the in-memory cache first (populated by collectFeatureDirs / resolveFeatureDir).
   * Falls back to the platform-level path helper for new features.
   */
  getFeatureDir(projectPath: string, featureId: string): string {
    const cached = this.featureDirCache.get(featureId);
    if (cached) return cached;
    // Fallback — returns month-based or flat path (for new features not yet cached)
    return getFeatureDir(projectPath, featureId);
  }

  /**
   * Get the path to a feature's feature.json file
   */
  getFeatureJsonPath(projectPath: string, featureId: string): string {
    return path.join(this.getFeatureDir(projectPath, featureId), 'feature.json');
  }

  /**
   * Get the path to a feature's agent-output.md file (inside logs/ subdirectory)
   */
  getAgentOutputPath(projectPath: string, featureId: string): string {
    return path.join(this.getFeatureDir(projectPath, featureId), 'logs', 'agent-output.md');
  }

  /**
   * Get the path to a feature's raw-output.jsonl file (inside logs/ subdirectory)
   */
  getRawOutputPath(projectPath: string, featureId: string): string {
    return path.join(this.getFeatureDir(projectPath, featureId), 'logs', 'raw-output.jsonl');
  }

  /**
   * Generate a new feature ID
   *
   * Format: `{dd}-{MM}-{YYYY}-{slug_or_random}`
   *
   * When a description is provided, a slug is derived from the first four
   * words (lowercased, non-alphanumeric characters stripped, joined with
   * underscores). When no usable words remain, a 9-character random
   * alphanumeric suffix is used instead.
   *
   * @param description - Optional feature description used to derive the slug.
   *
   * @example
   * generateFeatureId('Restore Summary tab dropdown')
   * // => "17-02-2026-restore_summary_tab_dropdown"
   *
   * generateFeatureId()
   * // => "17-02-2026-k8f3a1b2c"
   */
  generateFeatureId(description?: string): string {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const YYYY = String(now.getFullYear());

    // Extract up to the first 4 words, lowercase & stripped of non-alphanumeric chars
    const slug = (description ?? '')
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(Boolean)
      .join('_');

    // Fall back to a random suffix when there are no usable words
    const suffix = slug || Math.random().toString(36).substring(2, 11);

    return `${dd}-${MM}-${YYYY}-${suffix}`;
  }

  /**
   * Get all features for a project
   */
  async getAll(
    projectPath: string,
    options?: { excludeStatuses?: string[]; includeStatuses?: string[] }
  ): Promise<Feature[]> {
    try {
      // Ensure legacy features are migrated to status-based layout
      await this.migrateToStatusLayout(projectPath);

      const featuresDir = this.getFeaturesDir(projectPath);

      // Check if features directory exists
      try {
        await secureFs.access(featuresDir);
      } catch {
        return [];
      }

      // Collect feature directories from status-based, month-based, and flat layouts
      const featureEntries = await this.collectFeatureDirs(featuresDir, options);

      // Load all features concurrently with automatic recovery from backups
      const featurePromises = featureEntries.map(async ({ featureId, knownStatus }) => {
        const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);

        // Quick check: if feature.json doesn't exist, check for any recovery files
        // before invoking the full recovery flow. This avoids noisy warnings for
        // orphaned directories (e.g., a feature was deleted but the directory remains).
        try {
          await secureFs.access(featureJsonPath);
        } catch {
          // Main file missing — check if any temp or backup files exist
          const featureDir = this.getFeatureDir(projectPath, featureId);
          try {
            const dirFiles = (await secureFs.readdir(featureDir)) as string[];
            const hasRecoveryFiles = dirFiles.some(
              (f: string) => f.startsWith('feature.json.tmp.') || f.startsWith('feature.json.bak')
            );
            if (!hasRecoveryFiles) {
              // Orphaned directory with no feature data — skip silently
              logger.debug(`Skipping orphaned feature directory: ${featureId}`);
              return null;
            }
          } catch {
            // Cannot read directory — skip
            return null;
          }
        }

        // Use recovery-enabled read to handle corrupted files
        const result = await readJsonWithRecovery<Feature | null>(featureJsonPath, null, {
          maxBackups: DEFAULT_BACKUP_COUNT,
          autoRestore: true,
        });

        logRecoveryWarning(result, `Feature ${featureId}`, logger);

        const feature = result.data;

        if (!feature) {
          return null;
        }

        if (!feature.id) {
          logger.warn(`Feature ${featureId} missing required 'id' field, skipping`);
          return null;
        }

        // Ensure required string fields have safe defaults to prevent client-side crashes
        if (!feature.description) {
          feature.description = '';
        }
        if (!feature.category) {
          feature.category = 'Uncategorized';
        }

        // Clear stale titleGenerating flag — this is a transient client-side state
        // that should not survive across server/app restarts. If it's still true on
        // disk, the original generation process is no longer running.
        if (feature.titleGenerating) {
          feature.titleGenerating = false;
        }

        // Use directory-derived status when available (faster than reading JSON)
        if (knownStatus && (!feature.status || feature.status !== knownStatus)) {
          feature.status = knownStatus;
        }

        return feature;
      });

      const results = await Promise.all(featurePromises);
      const features = results.filter((f): f is Feature => f !== null);

      // Sort by creation order (feature IDs contain timestamp)
      // Supports three formats:
      //   - Old:     feature-{unixMs}-{random}
      //   - Legacy:  project-{MMHHddmmYYYY}-{random}
      //   - Current: {dd}-{YYYY}-{slug_or_random}
      const parseIdTime = (id: string): number => {
        if (!id) return 0;
        const parts = id.split('-');
        if (parts[0] === 'project' && parts[1]?.length === 12) {
          // Legacy format: project-MMHHddmmYYYY-{random}
          const seg = parts[1];
          const MM = seg.substring(0, 2);
          const HH = seg.substring(2, 4);
          const dd = seg.substring(4, 6);
          const mm = seg.substring(6, 8);
          const YYYY = seg.substring(8, 12);
          return new Date(
            parseInt(YYYY),
            parseInt(MM) - 1,
            parseInt(dd),
            parseInt(HH),
            parseInt(mm)
          ).getTime();
        }
        if (parts[0] === 'feature') {
          // Old format: feature-{unixMs}-{random}
          return parseInt(parts[1] || '0');
        }
        // Current format: {dd}-{YYYY}-{slug_or_random}
        const dd = parseInt(parts[0]);
        const YYYY = parseInt(parts[1]);
        if (!isNaN(dd) && !isNaN(YYYY) && YYYY >= 2020) {
          return new Date(YYYY, 0, dd).getTime();
        }
        return 0;
      };
      features.sort((a, b) => parseIdTime(a.id) - parseIdTime(b.id));

      return features;
    } catch (error) {
      logger.error('Failed to get all features:', error);
      return [];
    }
  }

  /**
   * Get all features for a project as lightweight summaries.
   * Returns only the fields needed for list views, omitting heavy fields
   * like description, spec, descriptionHistory, summaryHistory, etc.
   */
  async getAllListSummaries(
    projectPath: string,
    options?: { excludeStatuses?: string[]; includeStatuses?: string[] }
  ): Promise<FeatureListSummary[]> {
    const features = await this.getAll(projectPath, options);
    return features.map((feature) => ({
      id: feature.id,
      title: feature.title,
      titleGenerating: feature.titleGenerating,
      category: feature.category,
      status: feature.status,
      priority: feature.priority,
      isFavorite: feature.isFavorite,
      model: feature.model,
      thinkingLevel: feature.thinkingLevel,
      branchName: feature.branchName,
      error: feature.error,
      startedAt: feature.startedAt,
      imagePathsCount: feature.imagePaths?.length ?? 0,
    }));
  }

  /**
   * Get all feature summaries directly from feature.json files.
   *
   * Reads each feature directory's feature.json and extracts only
   * lightweight fields needed for summary/list views. Unlike getAll(),
   * this method does not return the full Feature objects — it returns
   * FeatureListSummary objects with only the essential fields.
   *
   * This is the preferred method when you only need summary data,
   * as it clearly communicates the intent and returns a minimal payload.
   */
  async getAllSummaries(
    projectPath: string,
    options?: { excludeStatuses?: string[]; includeStatuses?: string[] }
  ): Promise<FeatureListSummary[]> {
    try {
      // Ensure legacy features are migrated to status-based layout
      await this.migrateToStatusLayout(projectPath);

      const featuresDir = this.getFeaturesDir(projectPath);

      // Check if features directory exists
      try {
        await secureFs.access(featuresDir);
      } catch {
        return [];
      }

      // Collect feature directories from status-based, month-based, and flat layouts
      const featureEntries = await this.collectFeatureDirs(featuresDir, options);

      // Load and extract summary fields concurrently
      const summaryPromises = featureEntries.map(async ({ featureId, knownStatus }) => {
        const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);

        // Quick check: skip orphaned directories with no feature data
        try {
          await secureFs.access(featureJsonPath);
        } catch {
          const featureDir = this.getFeatureDir(projectPath, featureId);
          try {
            const dirFiles = (await secureFs.readdir(featureDir)) as string[];
            const hasRecoveryFiles = dirFiles.some(
              (f: string) => f.startsWith('feature.json.tmp.') || f.startsWith('feature.json.bak')
            );
            if (!hasRecoveryFiles) {
              logger.debug(`Skipping orphaned feature directory: ${featureId}`);
              return null;
            }
          } catch {
            return null;
          }
        }

        // Use recovery-enabled read to handle corrupted files
        const result = await readJsonWithRecovery<Feature | null>(featureJsonPath, null, {
          maxBackups: DEFAULT_BACKUP_COUNT,
          autoRestore: true,
        });

        logRecoveryWarning(result, `Feature ${featureId}`, logger);

        const feature = result.data;

        if (!feature) {
          return null;
        }

        if (!feature.id) {
          logger.warn(`Feature ${featureId} missing required 'id' field, skipping`);
          return null;
        }

        // Extract only lightweight summary fields
        // Always clear titleGenerating — it's a transient state that doesn't survive restarts
        // Use directory-derived status when available (faster than reading JSON)
        const effectiveStatus = knownStatus || feature.status;
        const summary: FeatureListSummary = {
          id: feature.id,
          title: feature.title,
          titleGenerating: false,
          category: feature.category || 'Uncategorized',
          status: effectiveStatus,
          priority: feature.priority,
          isFavorite: feature.isFavorite,
          model: feature.model,
          thinkingLevel: feature.thinkingLevel,
          branchName: feature.branchName,
          error: feature.error,
          startedAt: feature.startedAt,
          imagePathsCount: feature.imagePaths?.length ?? 0,
        };

        return summary;
      });

      const results = await Promise.all(summaryPromises);
      const summaries = results.filter((s): s is FeatureListSummary => s !== null);

      // Sort by creation order (feature IDs contain timestamp)
      // Supports three formats:
      //   - Old:     feature-{unixMs}-{random}
      //   - Legacy:  project-{MMHHddmmYYYY}-{random}
      //   - Current: {dd}-{YYYY}-{slug_or_random}
      const parseIdTime = (id: string): number => {
        if (!id) return 0;
        const parts = id.split('-');
        if (parts[0] === 'project' && parts[1]?.length === 12) {
          const seg = parts[1];
          const MM = seg.substring(0, 2);
          const HH = seg.substring(2, 4);
          const dd = seg.substring(4, 6);
          const mm = seg.substring(6, 8);
          const YYYY = seg.substring(8, 12);
          return new Date(
            parseInt(YYYY),
            parseInt(MM) - 1,
            parseInt(dd),
            parseInt(HH),
            parseInt(mm)
          ).getTime();
        }
        if (parts[0] === 'feature') {
          return parseInt(parts[1] || '0');
        }
        // Current format: {dd}-{YYYY}-{slug_or_random}
        const dd = parseInt(parts[0]);
        const YYYY = parseInt(parts[1]);
        if (!isNaN(dd) && !isNaN(YYYY) && YYYY >= 2020) {
          return new Date(YYYY, 0, dd).getTime();
        }
        return 0;
      };
      summaries.sort((a, b) => parseIdTime(a.id) - parseIdTime(b.id));

      return summaries;
    } catch (error) {
      logger.error('Failed to get all feature summaries:', error);
      return [];
    }
  }

  /**
   * Normalize a title for comparison (case-insensitive, trimmed)
   */
  private normalizeTitle(title: string): string {
    return title.toLowerCase().trim();
  }

  /**
   * Build a Map from normalized title to Feature for O(1) lookups.
   * If multiple features share the same normalized title, the first one wins.
   */
  private buildTitleIndex(features: Feature[]): Map<string, Feature> {
    const index = new Map<string, Feature>();
    for (const feature of features) {
      if (feature.title) {
        const key = this.normalizeTitle(feature.title);
        if (!index.has(key)) {
          index.set(key, feature);
        }
      }
    }
    return index;
  }

  /**
   * Find a feature by its title (case-insensitive match)
   * Uses a title index for O(1) lookup instead of scanning all features.
   * @param projectPath - Path to the project
   * @param title - Title to search for
   * @returns The matching feature or null if not found
   */
  async findByTitle(projectPath: string, title: string): Promise<Feature | null> {
    if (!title || !title.trim()) {
      return null;
    }

    const features = await this.getAll(projectPath);
    const titleIndex = this.buildTitleIndex(features);
    return titleIndex.get(this.normalizeTitle(title)) ?? null;
  }

  /**
   * Check if a title already exists on another feature (for duplicate detection)
   * Uses a title index for O(1) lookup instead of scanning all features.
   * @param projectPath - Path to the project
   * @param title - Title to check
   * @param excludeFeatureId - Optional feature ID to exclude from the check (for updates)
   * @returns The duplicate feature if found, null otherwise
   */
  async findDuplicateTitle(
    projectPath: string,
    title: string,
    excludeFeatureId?: string
  ): Promise<Feature | null> {
    if (!title || !title.trim()) {
      return null;
    }

    const features = await this.getAll(projectPath);
    const titleIndex = this.buildTitleIndex(features);
    const match = titleIndex.get(this.normalizeTitle(title));

    if (!match) {
      return null;
    }

    // If the match is the feature being updated, it's not a duplicate
    if (excludeFeatureId && match.id === excludeFeatureId) {
      return null;
    }

    return match;
  }

  /**
   * Get a single feature by ID
   * Uses automatic recovery from backups if the main file is corrupted.
   * Resolves the feature directory from the in-memory cache or by scanning
   * status directories.
   */
  async get(projectPath: string, featureId: string): Promise<Feature | null> {
    // Ensure migration has run so the cache is populated
    await this.migrateToStatusLayout(projectPath);

    // Try cached/resolved path first
    let resolvedDir = await this.resolveFeatureDir(projectPath, featureId);

    // If resolveFeatureDir failed, force a full directory scan to repopulate the cache.
    // This handles edge cases where the cache was cold (e.g., after server restart)
    // and the initial scan missed the feature directory.
    if (!resolvedDir) {
      const featuresDir = getFeaturesDir(projectPath);
      try {
        await secureFs.access(featuresDir);
        await this.collectFeatureDirs(featuresDir);
        resolvedDir = this.featureDirCache.get(featureId) ?? null;
        if (resolvedDir) {
          logger.debug(`Found feature ${featureId} after full directory scan`);
        }
      } catch {
        // Features directory doesn't exist
      }
    }

    const featureJsonPath = resolvedDir
      ? path.join(resolvedDir, 'feature.json')
      : this.getFeatureJsonPath(projectPath, featureId);

    // Use recovery-enabled read to handle corrupted files
    const result = await readJsonWithRecovery<Feature | null>(featureJsonPath, null, {
      maxBackups: DEFAULT_BACKUP_COUNT,
      autoRestore: true,
    });

    logRecoveryWarning(result, `Feature ${featureId}`, logger);

    return result.data;
  }

  /**
   * Create a new feature
   */
  async create(projectPath: string, featureData: Partial<Feature>): Promise<Feature> {
    const featureId = featureData.id || this.generateFeatureId(featureData.description);
    const status = (featureData.status as string) || DEFAULT_STATUS;

    // Place the new feature directly in the status-based directory
    const featureDir = getFeatureStatusDir(projectPath, status, featureId);

    // Ensure automaker directory exists
    await ensureAutomakerDir(projectPath);

    // Create feature directory and all standard subfolders
    await secureFs.mkdir(featureDir, { recursive: true });

    // Build subdirectory paths relative to the actual feature directory
    const imagesDir = path.join(featureDir, 'images');
    const summariesDir = path.join(featureDir, 'summaries');
    const logsDir = path.join(featureDir, 'logs');
    const backupsDir = path.join(featureDir, 'backups');
    await Promise.all([
      secureFs.mkdir(imagesDir, { recursive: true }),
      secureFs.mkdir(summariesDir, { recursive: true }),
      secureFs.mkdir(logsDir, { recursive: true }),
      secureFs.mkdir(backupsDir, { recursive: true }),
    ]);

    // Update the in-memory cache with the new feature location
    this.featureDirCache.set(featureId, featureDir);

    const featureJsonPath = path.join(featureDir, 'feature.json');

    // Migrate images from temp directory to feature directory
    const migratedImagePaths = await this.migrateImages(
      projectPath,
      featureId,
      featureData.imagePaths
    );

    // Initialize description history with the initial description
    const initialHistory: DescriptionHistoryEntry[] = [];
    if (featureData.description && featureData.description.trim()) {
      initialHistory.push({
        description: featureData.description,
        timestamp: new Date().toISOString(),
        source: 'initial',
      });
    }

    // Ensure feature has required fields
    const feature: Feature = {
      category: featureData.category || 'Uncategorized',
      description: featureData.description || '',
      ...featureData,
      id: featureId,
      imagePaths: migratedImagePaths,
      descriptionHistory: initialHistory,
    };

    // Write feature.json atomically with backup support
    await atomicWriteJson(featureJsonPath, feature, { backupCount: DEFAULT_BACKUP_COUNT });

    logger.info(`Created feature ${featureId}`);
    return feature;
  }

  /**
   * Update a feature (partial updates supported)
   * @param projectPath - Path to the project
   * @param featureId - ID of the feature to update
   * @param updates - Partial feature updates
   * @param descriptionHistorySource - Source of description change ('enhance' or 'edit')
   * @param enhancementMode - Enhancement mode if source is 'enhance'
   * @param preEnhancementDescription - Description before enhancement (for restoring original)
   */
  async update(
    projectPath: string,
    featureId: string,
    updates: Partial<Feature>,
    descriptionHistorySource?: 'enhance' | 'edit',
    enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer',
    preEnhancementDescription?: string
  ): Promise<Feature> {
    const feature = await this.get(projectPath, featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    // Handle image path changes
    let updatedImagePaths = updates.imagePaths;
    if (updates.imagePaths !== undefined) {
      // Delete orphaned images (images that were removed)
      await this.deleteOrphanedImages(projectPath, feature.imagePaths, updates.imagePaths);

      // Migrate any new images
      updatedImagePaths = await this.migrateImages(projectPath, featureId, updates.imagePaths);
    }

    // Track description history if description changed
    let updatedHistory = feature.descriptionHistory || [];
    if (
      updates.description !== undefined &&
      updates.description !== feature.description &&
      updates.description.trim()
    ) {
      const timestamp = new Date().toISOString();

      // If this is an enhancement and we have the pre-enhancement description,
      // add the original text to history first (so user can restore to it)
      if (
        descriptionHistorySource === 'enhance' &&
        preEnhancementDescription &&
        preEnhancementDescription.trim()
      ) {
        // Check if this pre-enhancement text is different from the last history entry
        const lastEntry = updatedHistory[updatedHistory.length - 1];
        if (!lastEntry || lastEntry.description !== preEnhancementDescription) {
          const preEnhanceEntry: DescriptionHistoryEntry = {
            description: preEnhancementDescription,
            timestamp,
            source: updatedHistory.length === 0 ? 'initial' : 'edit',
          };
          updatedHistory = [...updatedHistory, preEnhanceEntry];
        }
      }

      // Add the new/enhanced description to history
      const historyEntry: DescriptionHistoryEntry = {
        description: updates.description,
        timestamp,
        source: descriptionHistorySource || 'edit',
        ...(descriptionHistorySource === 'enhance' && enhancementMode ? { enhancementMode } : {}),
      };
      updatedHistory = [...updatedHistory, historyEntry];
    }

    // Merge updates
    const updatedFeature: Feature = {
      ...feature,
      ...updates,
      ...(updatedImagePaths !== undefined ? { imagePaths: updatedImagePaths } : {}),
      descriptionHistory: updatedHistory,
    };

    // Write back to file atomically with backup support
    const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);
    await atomicWriteJson(featureJsonPath, updatedFeature, { backupCount: DEFAULT_BACKUP_COUNT });

    // If status changed, move the feature directory to the new status subdirectory
    const newStatus = updates.status as string | undefined;
    if (newStatus && newStatus !== feature.status) {
      await this.moveFeatureToStatusDir(projectPath, featureId, newStatus);
    }

    logger.info(`Updated feature ${featureId}`);
    return updatedFeature;
  }

  /**
   * Delete a feature
   */
  async delete(projectPath: string, featureId: string): Promise<boolean> {
    try {
      const featureDir =
        (await this.resolveFeatureDir(projectPath, featureId)) ||
        this.getFeatureDir(projectPath, featureId);
      await secureFs.rm(featureDir, { recursive: true, force: true });
      this.featureDirCache.delete(featureId);
      logger.info(`Deleted feature ${featureId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete feature ${featureId}:`, error);
      return false;
    }
  }

  /**
   * Get agent output for a feature
   */
  async getAgentOutput(projectPath: string, featureId: string): Promise<string | null> {
    try {
      const agentOutputPath = this.getAgentOutputPath(projectPath, featureId);
      const content = (await secureFs.readFile(agentOutputPath, 'utf-8')) as string;
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      logger.error(`Failed to get agent output for ${featureId}:`, error);
      throw error;
    }
  }

  /**
   * Get raw output for a feature (JSONL format for debugging)
   */
  async getRawOutput(projectPath: string, featureId: string): Promise<string | null> {
    try {
      const rawOutputPath = this.getRawOutputPath(projectPath, featureId);
      const content = (await secureFs.readFile(rawOutputPath, 'utf-8')) as string;
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      logger.error(`Failed to get raw output for ${featureId}:`, error);
      throw error;
    }
  }

  /**
   * Save agent output for a feature
   */
  async saveAgentOutput(projectPath: string, featureId: string, content: string): Promise<void> {
    const logsDir = path.join(this.getFeatureDir(projectPath, featureId), 'logs');
    await secureFs.mkdir(logsDir, { recursive: true });

    const agentOutputPath = this.getAgentOutputPath(projectPath, featureId);
    await secureFs.writeFile(agentOutputPath, content, 'utf-8');
  }

  /**
   * Delete agent output for a feature
   */
  async deleteAgentOutput(projectPath: string, featureId: string): Promise<void> {
    try {
      const agentOutputPath = this.getAgentOutputPath(projectPath, featureId);
      await secureFs.unlink(agentOutputPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Save a summary as an individual markdown file in the summaries directory
   *
   * Files are named with ISO timestamps: {timestamp}.md
   * The timestamp is sanitized to be filesystem-safe (colons replaced with dashes).
   *
   * @param projectPath - Path to the project
   * @param featureId - ID of the feature
   * @param summary - The summary content to save
   * @param timestamp - Optional ISO timestamp (defaults to now)
   * @returns The timestamp used for the filename
   */
  async saveSummaryFile(
    projectPath: string,
    featureId: string,
    summary: string,
    timestamp?: string,
    model?: string
  ): Promise<string> {
    const ts = timestamp || new Date().toISOString();
    const summariesDir = this.getSummariesDir(projectPath, featureId);
    await secureFs.mkdir(summariesDir, { recursive: true });

    // Sanitize timestamp for filesystem (replace colons with dashes)
    const safeTimestamp = ts.replace(/:/g, '-');
    const filePath = path.join(summariesDir, `${safeTimestamp}.md`);

    // Create content with model metadata if provided
    let content = summary;
    if (model) {
      // Add model metadata at the top using HTML comment format (invisible in markdown renderers)
      content = `<!-- model: ${model} -->\n\n${summary}`;
    }

    await secureFs.writeFile(filePath, content, 'utf-8');

    logger.info(`Saved summary file for feature ${featureId}: ${safeTimestamp}.md`);
    return ts;
  }

  /**
   * Get all summary files for a feature, sorted by timestamp (newest first)
   *
   * Reads individual .md files from the summaries directory and returns them
   * as SummaryHistoryEntry objects with the timestamp parsed from the filename.
   *
   * @param projectPath - Path to the project
   * @param featureId - ID of the feature
   * @returns Array of summary entries sorted by timestamp (newest first)
   */
  async getSummaryFiles(projectPath: string, featureId: string): Promise<SummaryHistoryEntry[]> {
    const summariesDir = this.getSummariesDir(projectPath, featureId);

    // Check if summaries directory exists
    try {
      await secureFs.access(summariesDir);
    } catch {
      return [];
    }

    try {
      const entries = (await secureFs.readdir(summariesDir)) as string[];
      const mdFiles = entries.filter((name) => name.endsWith('.md'));

      // Read all summary files concurrently
      const summaryPromises = mdFiles.map(async (filename) => {
        try {
          const filePath = path.join(summariesDir, filename);
          const content = (await secureFs.readFile(filePath, 'utf-8')) as string;

          // Parse model metadata from HTML comment (<!-- model: xxx -->)
          let model: string | undefined;
          let summary = content;
          const modelMatch = content.match(/^<!--\s*model:\s*(.+?)\s*-->\s*\n\n/);
          if (modelMatch) {
            model = modelMatch[1];
            // Remove the metadata comment from the summary content
            summary = content.replace(/^<!--\s*model:\s*(.+?)\s*-->\s*\n\n/, '');
          }

          // Parse timestamp from filename (reverse the sanitization: dashes back to colons)
          // Filename format: 2024-01-15T10-30-00.000Z.md
          const timestampPart = filename.replace(/\.md$/, '');
          // Restore colons in the time portion (after the T)
          const tIndex = timestampPart.indexOf('T');
          let timestamp: string;
          if (tIndex !== -1) {
            const datePart = timestampPart.substring(0, tIndex);
            const timePart = timestampPart.substring(tIndex);
            // Replace the 2nd and 4th dash in the time part back to colons
            // Time format: T10-30-00.000Z -> T10:30:00.000Z
            timestamp = datePart + timePart.replace(/^(T\d{2})-(\d{2})-(\d{2})/, '$1:$2:$3');
          } else {
            timestamp = timestampPart;
          }

          const entry: SummaryHistoryEntry = { summary, timestamp, model };
          return entry;
        } catch (error) {
          logger.warn(`Failed to read summary file ${filename} for feature ${featureId}:`, error);
          return null;
        }
      });

      const results = await Promise.all(summaryPromises);
      const summaries = results.filter((s): s is SummaryHistoryEntry => s !== null);

      // Sort by timestamp, newest first
      summaries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return summaries;
    } catch (error) {
      logger.error(`Failed to get summary files for ${featureId}:`, error);
      return [];
    }
  }

  /**
   * Get a single summary file for a feature by its timestamp
   *
   * Reads an individual .md file from the summaries directory and returns it
   * as a SummaryHistoryEntry with the content and timestamp.
   *
   * @param projectPath - Path to the project
   * @param featureId - ID of the feature
   * @param timestamp - ISO timestamp of the summary to retrieve
   * @returns The summary entry, or null if not found
   */
  async getSummaryFile(
    projectPath: string,
    featureId: string,
    timestamp: string
  ): Promise<SummaryHistoryEntry | null> {
    const summariesDir = this.getSummariesDir(projectPath, featureId);

    // Sanitize timestamp for filesystem (replace colons with dashes)
    const safeTimestamp = timestamp.replace(/:/g, '-');
    const filePath = path.join(summariesDir, `${safeTimestamp}.md`);

    try {
      const content = (await secureFs.readFile(filePath, 'utf-8')) as string;

      // Parse model metadata from HTML comment (<!-- model: xxx -->)
      let model: string | undefined;
      let summary = content;
      const modelMatch = content.match(/^<!--\s*model:\s*(.+?)\s*-->\s*\n\n/);
      if (modelMatch) {
        model = modelMatch[1];
        // Remove the metadata comment from the summary content
        summary = content.replace(/^<!--\s*model:\s*(.+?)\s*-->\s*\n\n/, '');
      }

      return { summary, timestamp, model };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      logger.error(`Failed to get summary file for ${featureId} at ${timestamp}:`, error);
      throw error;
    }
  }

  /**
   * Sync a completed feature to the app_spec.txt implemented_features section
   *
   * When a feature is completed, this method adds it to the implemented_features
   * section of the project's app_spec.txt file. This keeps the spec in sync
   * with the actual state of the codebase.
   *
   * @param projectPath - Path to the project
   * @param feature - The feature to sync (must have title or description)
   * @param fileLocations - Optional array of file paths where the feature was implemented
   * @returns True if the spec was updated, false if no spec exists or feature was skipped
   */
  async syncFeatureToAppSpec(
    projectPath: string,
    feature: Feature,
    fileLocations?: string[]
  ): Promise<boolean> {
    try {
      const appSpecPath = getAppSpecPath(projectPath);

      // Read the current app_spec.txt
      let specContent: string;
      try {
        specContent = (await secureFs.readFile(appSpecPath, 'utf-8')) as string;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          logger.info(`No app_spec.txt found for project, skipping sync for feature ${feature.id}`);
          return false;
        }
        throw error;
      }

      // Build the implemented feature entry
      const featureName = feature.title || `Feature: ${feature.id}`;
      const implementedFeature: ImplementedFeature = {
        name: featureName,
        description: feature.description,
        ...(fileLocations && fileLocations.length > 0 ? { file_locations: fileLocations } : {}),
      };

      // Add the feature to the implemented_features section
      const updatedSpecContent = addImplementedFeature(specContent, implementedFeature);

      // Check if the content actually changed (feature might already exist)
      if (updatedSpecContent === specContent) {
        logger.info(`Feature "${featureName}" already exists in app_spec.txt, skipping`);
        return false;
      }

      // Write the updated spec back to the file
      await secureFs.writeFile(appSpecPath, updatedSpecContent, 'utf-8');

      logger.info(`Synced feature "${featureName}" to app_spec.txt`);
      return true;
    } catch (error) {
      logger.error(`Failed to sync feature ${feature.id} to app_spec.txt:`, error);
      throw error;
    }
  }
}
