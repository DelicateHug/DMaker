import { useState, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAppStore, type ThemeMode } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { initializeProject } from '@/lib/project-init';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Folder,
  FolderOpen,
  Star,
  Search,
  X,
  MoreVertical,
  Trash2,
  FolderPlus,
  Copy,
  Pencil,
} from 'lucide-react';
import { getProjectIcon } from '@/lib/icon-registry';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';
import { LazyImage } from '@/components/ui/lazy-image';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteProjectDialog } from '../components/delete-project-dialog';
import { EditProjectDialog } from '../components/edit-project-dialog';
import { NewProjectModal } from '@/components/dialogs/new-project-modal';
import { WorkspacePickerModal } from '@/components/dialogs/workspace-picker-modal';
import type { StarterTemplate } from '@/lib/templates';
import type { Project } from '@/lib/electron';

export function ProjectsSection() {
  const navigate = useNavigate();
  const {
    projects,
    trashedProjects,
    currentProject,
    upsertAndSetCurrentProject,
    addProject,
    setCurrentProject,
    toggleProjectFavorite,
    moveProjectToTrash,
    setProjectName,
    setProjectIcon,
    setProjectCustomIcon,
    theme: globalTheme,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Sort projects: favorites first, then by last opened
  const sortedProjects = [...projects].sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    const dateA = a.lastOpened ? new Date(a.lastOpened).getTime() : 0;
    const dateB = b.lastOpened ? new Date(b.lastOpened).getTime() : 0;
    return dateB - dateA;
  });

  // Filter projects based on search query
  const filteredProjects = sortedProjects.filter((project) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return project.name.toLowerCase().includes(query) || project.path.toLowerCase().includes(query);
  });

  const handleToggleFavorite = useCallback(
    (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      toggleProjectFavorite(projectId);
    },
    [toggleProjectFavorite]
  );

  const handleDeleteClick = useCallback((e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setProjectToDelete(project);
  }, []);

  const handleEditClick = useCallback((e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setProjectToEdit(project);
  }, []);

  const handleSaveProject = useCallback(
    (
      projectId: string,
      updates: { name?: string; icon?: string | null; customIconPath?: string | null }
    ) => {
      if (updates.name !== undefined) {
        setProjectName(projectId, updates.name);
      }
      if (updates.icon !== undefined) {
        setProjectIcon(projectId, updates.icon);
      }
      if (updates.customIconPath !== undefined) {
        setProjectCustomIcon(projectId, updates.customIconPath);
      }
      setProjectToEdit(null);
    },
    [setProjectName, setProjectIcon, setProjectCustomIcon]
  );

  const handleConfirmDelete = useCallback(
    (projectId: string) => {
      moveProjectToTrash(projectId);
      toast.success('Project removed', {
        description: 'Project has been moved to trash',
      });
      setProjectToDelete(null);
    },
    [moveProjectToTrash]
  );

  const handleCopyPath = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(path);
    toast.success('Path copied to clipboard');
  }, []);

  const initializeAndOpenProject = useCallback(
    async (path: string, name: string) => {
      try {
        const initResult = await initializeProject(path);
        if (!initResult.success) {
          toast.error('Failed to initialize project', {
            description: initResult.error || 'Unknown error occurred',
          });
          return;
        }

        const trashedProject = trashedProjects.find((p) => p.path === path);
        const effectiveTheme = (trashedProject?.theme || currentProject?.theme || globalTheme) as
          | ThemeMode
          | undefined;
        upsertAndSetCurrentProject(path, name, effectiveTheme);

        toast.success('Project opened', {
          description: `Opened ${name}`,
        });

        navigate({ to: '/board' });
      } catch (error) {
        toast.error('Failed to open project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [trashedProjects, currentProject, globalTheme, upsertAndSetCurrentProject, navigate]
  );

  const handleProjectClick = useCallback(
    async (project: Project) => {
      await initializeAndOpenProject(project.path, project.name);
    },
    [initializeAndOpenProject]
  );

  const handleOpenProject = useCallback(async () => {
    try {
      const httpClient = getHttpApiClient();
      const configResult = await httpClient.workspace.getConfig();

      if (configResult.success && configResult.configured) {
        setShowWorkspacePicker(true);
      } else {
        const api = getElectronAPI();
        const result = await api.openDirectory();

        if (!result.canceled && result.filePaths[0]) {
          const path = result.filePaths[0];
          const name = path.split(/[/\\]/).filter(Boolean).pop() || 'Untitled Project';
          await initializeAndOpenProject(path, name);
        }
      }
    } catch (error) {
      const api = getElectronAPI();
      const result = await api.openDirectory();

      if (!result.canceled && result.filePaths[0]) {
        const path = result.filePaths[0];
        const name = path.split(/[/\\]/).filter(Boolean).pop() || 'Untitled Project';
        await initializeAndOpenProject(path, name);
      }
    }
  }, [initializeAndOpenProject]);

  const handleWorkspaceSelect = useCallback(
    async (path: string, name: string) => {
      setShowWorkspacePicker(false);
      await initializeAndOpenProject(path, name);
    },
    [initializeAndOpenProject]
  );

  const handleCreateBlankProject = async (projectName: string, parentDir: string) => {
    setIsCreating(true);
    try {
      const api = getElectronAPI();
      const projectPath = `${parentDir}/${projectName}`;

      const parentExists = await api.exists(parentDir);
      if (!parentExists) {
        toast.error('Parent directory does not exist');
        return;
      }

      const mkdirResult = await api.mkdir(projectPath);
      if (!mkdirResult.success) {
        toast.error('Failed to create project directory');
        return;
      }

      const initResult = await initializeProject(projectPath);
      if (!initResult.success) {
        toast.error('Failed to initialize project');
        return;
      }

      await api.writeFile(
        `${projectPath}/.automaker/app_spec.txt`,
        `<project_specification>
  <project_name>${projectName}</project_name>

  <overview>
    Describe your project here.
  </overview>

  <technology_stack>
  </technology_stack>

  <core_capabilities>
  </core_capabilities>

  <implemented_features>
  </implemented_features>
</project_specification>`
      );

      const project = {
        id: `project-${Date.now()}`,
        name: projectName,
        path: projectPath,
        lastOpened: new Date().toISOString(),
      };

      addProject(project);
      setCurrentProject(project);
      setShowNewProjectModal(false);

      toast.success('Project created', {
        description: `Created ${projectName}`,
      });

      navigate({ to: '/board' });
    } catch (error) {
      toast.error('Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateFromTemplate = async (
    template: StarterTemplate,
    projectName: string,
    parentDir: string
  ) => {
    setIsCreating(true);
    try {
      const httpClient = getHttpApiClient();
      const api = getElectronAPI();

      const cloneResult = await httpClient.templates.clone(
        template.repoUrl,
        projectName,
        parentDir
      );
      if (!cloneResult.success || !cloneResult.projectPath) {
        toast.error('Failed to clone template');
        return;
      }

      const projectPath = cloneResult.projectPath;
      const initResult = await initializeProject(projectPath);
      if (!initResult.success) {
        toast.error('Failed to initialize project');
        return;
      }

      await api.writeFile(
        `${projectPath}/.automaker/app_spec.txt`,
        `<project_specification>
  <project_name>${projectName}</project_name>

  <overview>
    Created from the "${template.name}" starter template.
    ${template.description}
  </overview>

  <technology_stack>
    ${template.techStack.map((tech) => `<technology>${tech}</technology>`).join('\n    ')}
  </technology_stack>

  <core_capabilities>
    ${template.features.map((feature) => `<capability>${feature}</capability>`).join('\n    ')}
  </core_capabilities>

  <implemented_features>
  </implemented_features>
</project_specification>`
      );

      const project = {
        id: `project-${Date.now()}`,
        name: projectName,
        path: projectPath,
        lastOpened: new Date().toISOString(),
      };

      addProject(project);
      setCurrentProject(project);
      setShowNewProjectModal(false);

      toast.success('Project created from template');
      navigate({ to: '/board' });
    } catch (error) {
      toast.error('Failed to create project from template');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateFromCustomUrl = async (
    repoUrl: string,
    projectName: string,
    parentDir: string
  ) => {
    setIsCreating(true);
    try {
      const httpClient = getHttpApiClient();
      const api = getElectronAPI();

      const cloneResult = await httpClient.templates.clone(repoUrl, projectName, parentDir);
      if (!cloneResult.success || !cloneResult.projectPath) {
        toast.error('Failed to clone repository');
        return;
      }

      const projectPath = cloneResult.projectPath;
      const initResult = await initializeProject(projectPath);
      if (!initResult.success) {
        toast.error('Failed to initialize project');
        return;
      }

      await api.writeFile(
        `${projectPath}/.automaker/app_spec.txt`,
        `<project_specification>
  <project_name>${projectName}</project_name>

  <overview>
    Cloned from ${repoUrl}.
  </overview>

  <technology_stack>
  </technology_stack>

  <core_capabilities>
  </core_capabilities>

  <implemented_features>
  </implemented_features>
</project_specification>`
      );

      const project = {
        id: `project-${Date.now()}`,
        name: projectName,
        path: projectPath,
        lastOpened: new Date().toISOString(),
      };

      addProject(project);
      setCurrentProject(project);
      setShowNewProjectModal(false);

      toast.success('Project created from repository');
      navigate({ to: '/board' });
    } catch (error) {
      toast.error('Failed to create project from repository');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div
        className={cn(
          'rounded-2xl overflow-hidden',
          'border border-border/50',
          'bg-gradient-to-br from-card/80 via-card/70 to-card/80 backdrop-blur-xl',
          'shadow-sm'
        )}
      >
        <div className="p-6 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
              <Folder className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">Projects</h2>
          </div>
          <p className="text-sm text-muted-foreground/80 ml-12">
            Manage your projects, add new ones, or remove existing ones.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* Actions Row */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8"
                data-testid="projects-search-input"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted transition-colors"
                  title="Clear search"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Add Project Buttons */}
            <Button variant="outline" onClick={handleOpenProject}>
              <FolderOpen className="w-4 h-4 mr-2" />
              Open Folder
            </Button>
            <Button onClick={() => setShowNewProjectModal(true)}>
              <FolderPlus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </div>

          {/* Projects List */}
          <div className="space-y-2">
            {filteredProjects.length === 0 ? (
              <div className="text-center py-8">
                {searchQuery ? (
                  <>
                    <Search className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No projects match "{searchQuery}"
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSearchQuery('')}
                      className="mt-2"
                    >
                      Clear search
                    </Button>
                  </>
                ) : (
                  <>
                    <Folder className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No projects yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Create a new project or open an existing folder to get started.
                    </p>
                  </>
                )}
              </div>
            ) : (
              filteredProjects.map((project) => {
                const IconComponent = getProjectIcon(project.icon);
                const isCurrentProject = currentProject?.id === project.id;

                return (
                  <div
                    key={project.id}
                    onClick={() => handleProjectClick(project)}
                    className={cn(
                      'group relative flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200',
                      'border',
                      isCurrentProject
                        ? 'bg-brand-500/10 border-brand-500/30 hover:bg-brand-500/15'
                        : 'bg-muted/30 border-border/30 hover:bg-muted/50 hover:border-border/50'
                    )}
                    data-testid={`project-item-${project.id}`}
                  >
                    {/* Project Icon */}
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden',
                        project.isFavorite
                          ? 'bg-yellow-500/10 border border-yellow-500/30'
                          : isCurrentProject
                            ? 'bg-brand-500/20 border border-brand-500/30'
                            : 'bg-muted/50 border border-border/30 group-hover:bg-muted'
                      )}
                    >
                      {project.customIconPath ? (
                        <LazyImage
                          src={getAuthenticatedImageUrl(project.customIconPath, project.path)}
                          alt={project.name}
                          className="w-full h-full object-cover"
                          containerClassName="w-full h-full"
                          errorIconSize="w-3 h-3"
                        />
                      ) : (
                        <IconComponent
                          className={cn(
                            'w-5 h-5',
                            project.isFavorite
                              ? 'text-yellow-500'
                              : isCurrentProject
                                ? 'text-brand-500'
                                : 'text-muted-foreground group-hover:text-foreground'
                          )}
                        />
                      )}
                    </div>

                    {/* Project Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground truncate">{project.name}</p>
                        {isCurrentProject && (
                          <span className="text-xs px-1.5 py-0.5 rounded-md bg-brand-500/20 text-brand-500 font-medium">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground/70 truncate">{project.path}</p>
                      {project.lastOpened && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Last opened: {new Date(project.lastOpened).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => handleToggleFavorite(e, project.id)}
                        className={cn(
                          'p-1.5 rounded-lg transition-colors',
                          project.isFavorite
                            ? 'hover:bg-yellow-500/20'
                            : 'hover:bg-muted opacity-0 group-hover:opacity-100'
                        )}
                        title={project.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star
                          className={cn(
                            'w-4 h-4',
                            project.isFavorite
                              ? 'text-yellow-500 fill-yellow-500'
                              : 'text-muted-foreground hover:text-yellow-500'
                          )}
                        />
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                            title="More options"
                          >
                            <MoreVertical className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) =>
                              handleEditClick(e as unknown as React.MouseEvent, project)
                            }
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit Project
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) =>
                              handleCopyPath(e as unknown as React.MouseEvent, project.path)
                            }
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy Path
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) =>
                              handleDeleteClick(e as unknown as React.MouseEvent, project)
                            }
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Remove from Automaker
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Project Count */}
          {projects.length > 0 && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              {filteredProjects.length} of {projects.length} project
              {projects.length !== 1 ? 's' : ''}
              {searchQuery && ' matching your search'}
            </p>
          )}
        </div>
      </div>

      {/* Delete Project Dialog */}
      <DeleteProjectDialog
        open={!!projectToDelete}
        onOpenChange={(open) => !open && setProjectToDelete(null)}
        project={projectToDelete}
        onConfirm={handleConfirmDelete}
      />

      {/* Edit Project Dialog */}
      <EditProjectDialog
        open={!!projectToEdit}
        onOpenChange={(open) => !open && setProjectToEdit(null)}
        project={projectToEdit}
        onSave={handleSaveProject}
      />

      {/* New Project Modal */}
      <NewProjectModal
        open={showNewProjectModal}
        onOpenChange={setShowNewProjectModal}
        onCreateBlankProject={handleCreateBlankProject}
        onCreateFromTemplate={handleCreateFromTemplate}
        onCreateFromCustomUrl={handleCreateFromCustomUrl}
        isCreating={isCreating}
      />

      {/* Workspace Picker Modal */}
      <WorkspacePickerModal
        open={showWorkspacePicker}
        onOpenChange={setShowWorkspacePicker}
        onSelect={handleWorkspaceSelect}
      />
    </div>
  );
}
