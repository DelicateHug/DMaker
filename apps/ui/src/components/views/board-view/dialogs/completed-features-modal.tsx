// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Feature, useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { CompletedFeaturesListView } from '../completed-features-list-view';
import { toast } from 'sonner';

interface CompletedFeaturesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Project paths to load completed features from. When empty, uses current project. */
  projectPaths?: string[];
  /** Available projects for filtering (project path -> project name) */
  availableProjects?: Map<string, string>;
  /** Current project path (for single project view) */
  currentProjectPath?: string;
}

export function CompletedFeaturesModal({
  open,
  onOpenChange,
  projectPaths,
  availableProjects,
  currentProjectPath,
}: CompletedFeaturesModalProps) {
  const [completedFeatures, setCompletedFeatures] = useState<Feature[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch completed features independently when the modal opens
  useEffect(() => {
    if (!open) return;

    const paths = projectPaths?.length
      ? projectPaths
      : currentProjectPath
        ? [currentProjectPath]
        : [];
    if (paths.length === 0) return;

    setIsLoading(true);
    const api = getElectronAPI();
    if (!api.features) {
      setIsLoading(false);
      return;
    }

    const featuresApi = api.features;
    Promise.all(
      paths.map(async (projectPath) => {
        try {
          const result = await featuresApi.getAll(projectPath, true, {
            includeStatuses: ['completed'],
          });
          if (result.success && result.features) {
            // Attach project info for multi-project support
            const projectName = availableProjects?.get(projectPath);
            return result.features.map((f: any) => ({
              ...f,
              projectPath,
              projectName,
            }));
          }
          return [];
        } catch {
          return [];
        }
      })
    )
      .then((arrays) => {
        setCompletedFeatures(arrays.flat());
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [open, projectPaths, currentProjectPath, availableProjects]);

  const handleRestore = useCallback(
    async (feature: Feature) => {
      const projectPath = (feature as any).projectPath || currentProjectPath;
      if (!projectPath) return;

      const api = getElectronAPI();
      if (!api.features) return;

      try {
        const updates = { status: 'waiting_approval' as const };
        await api.features.update(projectPath, feature.id, updates);
        // Remove from local list
        setCompletedFeatures((prev) => prev.filter((f) => f.id !== feature.id));
        toast.success('Feature restored', {
          description: `Moved back to Waiting Approval: ${(feature.title as string) || feature.id}`,
        });
      } catch (error) {
        toast.error('Failed to restore feature');
      }
    },
    [currentProjectPath]
  );

  const handleDelete = useCallback(
    async (feature: Feature) => {
      const projectPath = (feature as any).projectPath || currentProjectPath;
      if (!projectPath) return;

      const api = getElectronAPI();
      if (!api.features) return;

      try {
        await api.features.delete(projectPath, feature.id);
        // Remove from local list
        setCompletedFeatures((prev) => prev.filter((f) => f.id !== feature.id));
        toast.success('Feature deleted');
      } catch (error) {
        toast.error('Failed to delete feature');
      }
    },
    [currentProjectPath]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl max-h-[90vh] flex flex-col p-0 gap-0"
        data-testid="completed-features-modal"
      >
        <CompletedFeaturesListView
          completedFeatures={completedFeatures}
          onRestore={handleRestore}
          onDelete={handleDelete}
          onClose={() => onOpenChange(false)}
          availableProjects={availableProjects}
          currentProjectPath={currentProjectPath}
          className="h-[85vh]"
        />
      </DialogContent>
    </Dialog>
  );
}
