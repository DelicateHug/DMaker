/**
 * Agents Settings Hook - Manages enable/disable and source configuration
 */

import { useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';
import { getElectronAPI } from '@/lib/electron';

export function useAgentsSettings() {
  const enabled = useAppStore((state) => state.enableSubagents);
  const sources = useAppStore((state) => state.subagentsSources);
  const [isLoading, setIsLoading] = useState(false);

  const updateEnabled = async (newEnabled: boolean) => {
    setIsLoading(true);
    try {
      const api = getElectronAPI();
      if (!api.settings) {
        throw new Error('Settings API not available');
      }
      await api.settings.updateGlobal({ enableSubagents: newEnabled });
      useAppStore.setState({ enableSubagents: newEnabled });
      toast.success(newEnabled ? 'Agents enabled' : 'Agents disabled');
    } catch (error) {
      toast.error('Failed to update agents settings');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSources = async (newSources: Array<'user' | 'project'>) => {
    setIsLoading(true);
    try {
      const api = getElectronAPI();
      if (!api.settings) {
        throw new Error('Settings API not available');
      }
      await api.settings.updateGlobal({ subagentsSources: newSources });
      useAppStore.setState({ subagentsSources: newSources });
      toast.success('Agent sources updated');
    } catch (error) {
      toast.error('Failed to update agent sources');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    enabled,
    sources,
    updateEnabled,
    updateSources,
    isLoading,
  };
}
