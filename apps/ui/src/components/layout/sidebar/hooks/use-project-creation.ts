import { useState, useCallback } from 'react';
import { getElectronAPI } from '@/lib/electron';
import { initializeProject } from '@/lib/project-init';
import { toast } from 'sonner';
import type { StarterTemplate } from '@/lib/templates';
import type { ThemeMode } from '@/store/app-store';
import type { TrashedProject, Project } from '@/lib/electron';

interface UseProjectCreationProps {
  trashedProjects: TrashedProject[];
  currentProject: Project | null;
  globalTheme: ThemeMode;
  upsertAndSetCurrentProject: (path: string, name: string, theme: ThemeMode) => Project;
}

export function useProjectCreation({
  trashedProjects,
  currentProject,
  globalTheme,
  upsertAndSetCurrentProject,
}: UseProjectCreationProps) {
  // Modal state
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Onboarding state
  const [showOnboardingDialog, setShowOnboardingDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');

  /**
   * Common logic for all project creation flows
   */
  const finalizeProjectCreation = useCallback(
    async (projectPath: string, projectName: string) => {
      try {
        // Initialize .automaker directory structure
        await initializeProject(projectPath);

        // Write initial app_spec.txt with basic XML structure
        const api = getElectronAPI();
        await api.fs.writeFile(
          `${projectPath}/app_spec.txt`,
          `<?xml version="1.0" encoding="UTF-8"?>\n<project>\n  <name>${projectName}</name>\n  <description>Add your project description here</description>\n</project>`
        );

        // Determine theme: try trashed project theme, then current project theme, then global
        const trashedProject = trashedProjects.find((p) => p.path === projectPath);
        const effectiveTheme =
          (trashedProject?.theme as ThemeMode | undefined) ||
          (currentProject?.theme as ThemeMode | undefined) ||
          globalTheme;

        upsertAndSetCurrentProject(projectPath, projectName, effectiveTheme);

        setShowNewProjectModal(false);

        // Show onboarding dialog for new project
        setNewProjectName(projectName);
        setNewProjectPath(projectPath);
        setShowOnboardingDialog(true);

        toast.success('Project created successfully');
      } catch (error) {
        console.error('[ProjectCreation] Failed to finalize project:', error);
        toast.error('Failed to initialize project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }
    },
    [trashedProjects, currentProject, globalTheme, upsertAndSetCurrentProject]
  );

  /**
   * Create a blank project with .automaker structure
   */
  const handleCreateBlankProject = useCallback(
    async (projectName: string, parentDir: string) => {
      setIsCreatingProject(true);
      try {
        const api = getElectronAPI();
        const projectPath = `${parentDir}/${projectName}`;

        // Create project directory
        await api.fs.createFolder(projectPath);

        // Finalize project setup
        await finalizeProjectCreation(projectPath, projectName);
      } catch (error) {
        console.error('[ProjectCreation] Failed to create blank project:', error);
        toast.error('Failed to create project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setIsCreatingProject(false);
      }
    },
    [finalizeProjectCreation]
  );

  /**
   * Create project from a starter template
   */
  const handleCreateFromTemplate = useCallback(
    async (template: StarterTemplate, projectName: string, parentDir: string) => {
      setIsCreatingProject(true);
      try {
        const api = getElectronAPI();
        const projectPath = `${parentDir}/${projectName}`;

        // Clone template repository
        await api.git.clone(template.githubUrl, projectPath);

        // Finalize project setup
        await finalizeProjectCreation(projectPath, projectName);
      } catch (error) {
        console.error('[ProjectCreation] Failed to create from template:', error);
        toast.error('Failed to create project from template', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setIsCreatingProject(false);
      }
    },
    [finalizeProjectCreation]
  );

  /**
   * Create project from a custom GitHub URL
   */
  const handleCreateFromCustomUrl = useCallback(
    async (repoUrl: string, projectName: string, parentDir: string) => {
      setIsCreatingProject(true);
      try {
        const api = getElectronAPI();
        const projectPath = `${parentDir}/${projectName}`;

        // Clone custom repository
        await api.git.clone(repoUrl, projectPath);

        // Finalize project setup
        await finalizeProjectCreation(projectPath, projectName);
      } catch (error) {
        console.error('[ProjectCreation] Failed to create from custom URL:', error);
        toast.error('Failed to create project from URL', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setIsCreatingProject(false);
      }
    },
    [finalizeProjectCreation]
  );

  return {
    // Modal state
    showNewProjectModal,
    setShowNewProjectModal,
    isCreatingProject,

    // Onboarding state
    showOnboardingDialog,
    setShowOnboardingDialog,
    newProjectName,
    setNewProjectName,
    newProjectPath,
    setNewProjectPath,

    // Handlers
    handleCreateBlankProject,
    handleCreateFromTemplate,
    handleCreateFromCustomUrl,
  };
}
