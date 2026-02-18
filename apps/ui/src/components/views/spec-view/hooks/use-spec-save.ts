import { useState } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';

const logger = createLogger('SpecSave');
import { getElectronAPI } from '@/lib/electron';

export function useSpecSave() {
  const { currentProject, appSpec } = useAppStore(
    useShallow((state) => ({
      currentProject: state.currentProject,
      appSpec: state.appSpec,
    }))
  );
  const setAppSpec = useAppStore((state) => state.setAppSpec);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const saveSpec = async () => {
    if (!currentProject) return;

    setIsSaving(true);
    try {
      const api = getElectronAPI();
      await api.writeFile(`${currentProject.path}/.automaker/app_spec.txt`, appSpec);
      setHasChanges(false);
    } catch (error) {
      logger.error('Failed to save spec:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (value: string) => {
    setAppSpec(value);
    setHasChanges(true);
  };

  return {
    isSaving,
    hasChanges,
    setHasChanges,
    saveSpec,
    handleChange,
  };
}
