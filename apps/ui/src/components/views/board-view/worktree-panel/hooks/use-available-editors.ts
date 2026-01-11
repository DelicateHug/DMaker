import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';

const logger = createLogger('AvailableEditors');

export interface EditorInfo {
  name: string;
  command: string;
}

export function useAvailableEditors() {
  const [editors, setEditors] = useState<EditorInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAvailableEditors = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.getAvailableEditors) {
        setIsLoading(false);
        return;
      }
      const result = await api.worktree.getAvailableEditors();
      if (result.success && result.result?.editors) {
        setEditors(result.result.editors);
      }
    } catch (error) {
      logger.error('Failed to fetch available editors:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAvailableEditors();
  }, [fetchAvailableEditors]);

  return {
    editors,
    isLoading,
    // Convenience property: has multiple editors (for deciding whether to show submenu)
    hasMultipleEditors: editors.length > 1,
    // The first editor is the "default" one
    defaultEditor: editors[0] ?? null,
  };
}
