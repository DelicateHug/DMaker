/**
 * Agents Hook - Manages agent discovery, CRUD operations
 *
 * Fetches discovered agents via the settings API and provides
 * save/delete operations via the agents API.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import type { AgentDefinition } from '@dmaker/types';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';

export type AgentScope = 'global' | 'project';
export type AgentSource = 'user' | 'project';

export interface AgentWithScope {
  name: string;
  definition: AgentDefinition;
  scope: AgentScope;
  source: AgentSource;
  filePath: string;
  folder: string;
  projectName?: string;
}

export function useAgents() {
  const currentProject = useAppStore((state) => state.currentProject);
  const allProjects = useAppStore((state) => state.projects);
  const [isLoading, setIsLoading] = useState(false);
  const [agents, setAgents] = useState<AgentWithScope[]>([]);

  const fetchAgents = useCallback(async () => {
    setIsLoading(true);
    try {
      const api = getElectronAPI();
      if (!api.settings) {
        console.warn('Settings API not available');
        return;
      }

      // Pass all projects so the server discovers agents from every project
      const projectsList = allProjects.map((p) => ({ name: p.name, path: p.path }));
      const data = await api.settings.discoverAgents(
        currentProject?.path,
        ['user', 'project'],
        projectsList.length > 0 ? projectsList : undefined
      );

      if (data.success && data.agents) {
        const mapped: AgentWithScope[] = data.agents.map(
          ({
            name,
            definition,
            source,
            filePath,
            folder,
            projectName,
          }: {
            name: string;
            definition: AgentDefinition;
            source: AgentSource;
            filePath: string;
            folder?: string;
            projectName?: string;
          }) => ({
            name,
            definition,
            scope: source === 'user' ? 'global' : ('project' as AgentScope),
            source,
            filePath,
            folder: folder || '',
            projectName,
          })
        );
        setAgents(mapped);
      }
    } catch (error) {
      console.error('Failed to fetch agents:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentProject?.path, allProjects]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const saveAgent = useCallback(
    async (data: {
      name: string;
      description: string;
      prompt: string;
      tools?: string[];
      model?: string;
      scope: 'user' | 'project';
      projectPath?: string;
      originalFilePath?: string;
    }) => {
      try {
        const api = getElectronAPI();
        if (!api.agents) {
          throw new Error('Agents API not available');
        }
        const result = await api.agents.save({
          ...data,
          projectPath: data.projectPath || currentProject?.path,
        });
        if (result.success) {
          toast.success(`Agent "${data.name}" saved`);
          await fetchAgents();
          return true;
        } else {
          toast.error(result.error || 'Failed to save agent');
          return false;
        }
      } catch (error) {
        toast.error('Failed to save agent');
        console.error(error);
        return false;
      }
    },
    [currentProject?.path, fetchAgents]
  );

  const deleteAgent = useCallback(
    async (filePath: string, name: string) => {
      try {
        const api = getElectronAPI();
        if (!api.agents) {
          throw new Error('Agents API not available');
        }
        const result = await api.agents.delete(filePath);
        if (result.success) {
          toast.success(`Agent "${name}" deleted`);
          await fetchAgents();
          return true;
        } else {
          toast.error(result.error || 'Failed to delete agent');
          return false;
        }
      } catch (error) {
        toast.error('Failed to delete agent');
        console.error(error);
        return false;
      }
    },
    [fetchAgents]
  );

  return {
    agents,
    isLoading,
    hasProject: !!currentProject,
    projectPath: currentProject?.path,
    refresh: fetchAgents,
    saveAgent,
    deleteAgent,
  };
}
