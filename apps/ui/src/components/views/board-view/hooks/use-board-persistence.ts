import { useCallback } from 'react';
import { Feature } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('BoardPersistence');

/**
 * Tracks feature IDs that have in-flight persist operations.
 * Shared module-level state so that loadFullFeatures (in use-board-features)
 * can avoid overwriting optimistic local status changes with stale server data.
 */
export const pendingPersistIds = new Set<string>();

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

      pendingPersistIds.add(featureId);
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
        pendingPersistIds.delete(featureId);
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
