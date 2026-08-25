import { createLogger } from '@dmaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore, type Feature } from '@/store/app-store';
import { useWorkbenchStore } from '@/store/workbench-store';
import { protectOptimisticUpdate } from '@/components/views/board-view/hooks/use-board-persistence';

const logger = createLogger('SidebarPinning');

/**
 * Pinning from the sidebar.
 *
 * The board has its own pin toggle wired through the board's persistence hook;
 * the sidebar is rendered outside that tree, so it writes the same
 * `isFavorite` flag directly. The optimistic update goes in first (the sidebar
 * has to feel instant), guarded by `protectOptimisticUpdate` so the next poll
 * of the server's feature cache cannot undo it.
 */
export async function setFeaturePinned(feature: Feature, pinned: boolean): Promise<void> {
  const { updateFeature, currentProject } = useAppStore.getState();
  const projectPath = (feature as { projectPath?: string }).projectPath || currentProject?.path;

  updateFeature(feature.id, { isFavorite: pinned } as Partial<Feature>);

  // Unpinning drops the group membership too, so re-pinning later starts at
  // the top level rather than silently reappearing inside an old group.
  if (!pinned) {
    useWorkbenchStore.getState().movePinnedFeature(feature.id, null);
  }

  if (!projectPath) return;

  protectOptimisticUpdate(feature.id);
  try {
    const api = getElectronAPI();
    if (!api.features) return;
    const result = await api.features.update(projectPath, feature.id, {
      isFavorite: pinned,
    } as Partial<Feature>);
    if (!result.success) {
      throw new Error(result.error || 'Failed to update feature');
    }
  } catch (error) {
    logger.error('Failed to persist pin state', { featureId: feature.id, pinned, error });
    // Put the row back where it was rather than leaving a lie on screen.
    updateFeature(feature.id, { isFavorite: !pinned } as Partial<Feature>);
  }
}
