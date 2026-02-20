import { useCallback } from 'react';
import { Feature } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('BoardPersistence');

/**
 * Tracks feature IDs that have recent optimistic status changes.
 * Maps featureId → timestamp of the optimistic update.
 *
 * Shared module-level state so that loadFullFeatures (in use-board-features)
 * can avoid overwriting optimistic local status changes with stale server data.
 *
 * Protection persists for PERSIST_PROTECTION_TTL_MS after the persist completes
 * to outlive the server-side feature cache TTL (10 seconds), preventing stale
 * cache data from overwriting the optimistic update during polling or
 * WebSocket-triggered reloads.
 */
export const pendingPersistIds = new Map<string, number>();

/** How long to keep optimistic protection after persist completes (ms).
 *  Must exceed the server-side FEATURES_CACHE_TTL_MS (10 s). */
const PERSIST_PROTECTION_TTL_MS = 12_000;

/** Timers for auto-cleanup of pendingPersistIds entries */
const persistCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Mark a feature as having an optimistic update that should be protected
 * from being overwritten by stale server data.
 *
 * Can be called from persist operations (use-board-persistence) or from
 * WebSocket event handlers (use-board-features) that do in-place status updates.
 */
export function protectOptimisticUpdate(featureId: string): void {
  pendingPersistIds.set(featureId, Date.now());

  // Clear any existing cleanup timer for this feature
  const existingTimer = persistCleanupTimers.get(featureId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Schedule cleanup after the protection TTL
  const timer = setTimeout(() => {
    pendingPersistIds.delete(featureId);
    persistCleanupTimers.delete(featureId);
  }, PERSIST_PROTECTION_TTL_MS);

  persistCleanupTimers.set(featureId, timer);
}

interface UseBoardPersistenceProps {
  currentProject: { path: string; id: string } | null;
}

export function useBoardPersistence({ currentProject }: UseBoardPersistenceProps) {
  const { updateFeature } = useAppStore(
    useShallow((state) => ({
      updateFeature: state.updateFeature,
    }))
  );

  // Persist feature update to API (replaces saveFeatures)
  const persistFeatureUpdate = useCallback(
    async (
      featureId: string,
      updates: Partial<Feature>,
      descriptionHistorySource?: 'enhance' | 'edit',
      enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer',
      preEnhancementDescription?: string
    ) => {
      if (!currentProject) return;

      protectOptimisticUpdate(featureId);
      try {
        const api = getElectronAPI();
        if (!api.features) {
          logger.error('Features API not available');
          return;
        }

        // Get the feature to find its project path (needed for "All Projects" mode)
        const { features } = useAppStore.getState();
        const feature = features.find((f) => f.id === featureId);
        const projectPath = (feature as any)?.projectPath || currentProject.path;

        logger.info('Calling API features.update', { featureId, updates, projectPath });
        const result = await api.features.update(
          projectPath,
          featureId,
          updates,
          descriptionHistorySource,
          enhancementMode,
          preEnhancementDescription
        );
        logger.info('API features.update result', {
          success: result.success,
          feature: result.feature,
          featureStatus: result.feature?.status,
        });
        if (result.success && result.feature) {
          logger.info('Updating local feature state after API success', {
            featureId: result.feature.id,
            status: result.feature.status,
          });
          updateFeature(result.feature.id, result.feature);
        } else if (!result.success) {
          logger.error('API features.update failed', result);
          throw new Error(result.error || 'Failed to update feature');
        }
      } catch (error) {
        logger.error('Failed to persist feature update:', error);
        throw error; // Re-throw so caller knows it failed
      } finally {
        // Protection is NOT removed here — it stays active for PERSIST_PROTECTION_TTL_MS
        // via the timer set in protectOptimisticUpdate(). This ensures the optimistic
        // status survives stale server cache data from background polls / WebSocket reloads.
      }
    },
    [currentProject, updateFeature]
  );

  // Persist feature creation to API
  // Optionally accepts a project path to support creating features in a different project
  const persistFeatureCreate = useCallback(
    async (feature: Feature, projectPath?: string) => {
      const targetProjectPath = projectPath || currentProject?.path;
      if (!targetProjectPath) return;

      try {
        const api = getElectronAPI();
        if (!api.features) {
          logger.error('Features API not available');
          return;
        }

        const result = await api.features.create(targetProjectPath, feature);
        if (result.success && result.feature) {
          updateFeature(result.feature.id, result.feature);
        }
      } catch (error) {
        logger.error('Failed to persist feature creation:', error);
      }
    },
    [currentProject, updateFeature]
  );

  // Persist feature deletion to API
  const persistFeatureDelete = useCallback(
    async (featureId: string) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api.features) {
          logger.error('Features API not available');
          return;
        }

        // Get the feature to find its project path (needed for "All Projects" mode)
        const { features } = useAppStore.getState();
        const feature = features.find((f) => f.id === featureId);
        const projectPath = (feature as any)?.projectPath || currentProject.path;

        await api.features.delete(projectPath, featureId);
      } catch (error) {
        logger.error('Failed to persist feature deletion:', error);
      }
    },
    [currentProject]
  );

  return {
    persistFeatureCreate,
    persistFeatureUpdate,
    persistFeatureDelete,
  };
}
