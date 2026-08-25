import { useState, useCallback } from 'react';
import { createLogger } from '@dmaker/utils/logger';
import { useNavigate } from '@tanstack/react-router';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, type ThemeMode } from '@/store/app-store';
import { openLayer } from '@/store/layer-store';
import { getElectronAPI } from '@/lib/electron';
import { initializeProject } from '@/lib/project-init';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NewProjectModal } from '@/components/dialogs/new-project-modal';
import { WorkspacePickerModal } from '@/components/dialogs/workspace-picker-modal';
import type { StarterTemplate } from '@/lib/templates';
import {
  FolderOpen,
  Plus,
  Star,
  Clock,
  Loader2,
  ChevronDown,
  MessageSquare,
  MoreVertical,
  Trash2,
  Search,
  X,
} from 'lucide-react';
import { getProjectIcon } from '@/lib/icon-registry';
import { Input } from '@/components/ui/forms';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';
import { LazyImage } from '@/components/ui/lazy-image';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';

const logger = createLogger('ProjectPicker');

const blankSpec = (projectName: string) => `<project_specification>
  <project_name>${projectName}</project_name>

  <overview>
    Describe your project here. This file will be analyzed by an AI agent
    to understand your project structure and tech stack.
  </overview>

  <technology_stack>
    <!-- The AI agent will fill this in after analyzing your project -->
  </technology_stack>

  <core_capabilities>
    <!-- List core features and capabilities -->
  </core_capabilities>

  <implemented_features>
    <!-- The AI agent will populate this based on code analysis -->
  </implemented_features>
</project_specification>`;

export interface ProjectPickerProps {
  /** Extra classes for the outer container */
  className?: string;
  /** Fired once a project has been opened or created — used to close the modal */
  onOpened?: () => void;
  /** Drops the big heading; the modal supplies its own title */
  compact?: boolean;
}

/**
 * The project list, search and create/open actions that used to be the
 * standalone `/dashboard` screen. Rendered inline as the board's empty state
 * and inside `ProjectPickerModal` when switching projects.
 */
export function ProjectPicker({ className, onOpened, compact = false }: ProjectPickerProps) {
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
    theme: globalTheme,
  } = useAppStore(
    useShallow((state) => ({
      projects: state.projects,
      trashedProjects: state.trashedProjects,
      currentProject: state.currentProject,
      upsertAndSetCurrentProject: state.upsertAndSetCurrentProject,
      addProject: state.addProject,
      setCurrentProject: state.setCurrentProject,
      toggleProjectFavorite: state.toggleProjectFavorite,
      moveProjectToTrash: state.moveProjectToTrash,
      theme: state.theme,
    }))
  );

  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [projectToRemove, setProjectToRemove] = useState<{ id: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Favorites first, then most recently opened.
  const sortedProjects = [...projects].sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    const dateA = a.lastOpened ? new Date(a.lastOpened).getTime() : 0;
    const dateB = b.lastOpened ? new Date(b.lastOpened).getTime() : 0;
    return dateB - dateA;
  });

  const filteredProjects = sortedProjects.filter((project) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return project.name.toLowerCase().includes(query) || project.path.toLowerCase().includes(query);
  });

  const favoriteProjects = filteredProjects.filter((p) => p.isFavorite);
  const recentProjects = filteredProjects.filter((p) => !p.isFavorite);

  const finish = useCallback(() => {
    navigate({ to: '/board' });
    onOpened?.();
  }, [navigate, onOpened]);

  const initializeAndOpenProject = useCallback(
    async (path: string, name: string) => {
      setIsOpening(true);
      try {
        const initResult = await initializeProject(path);

        if (!initResult.success) {
          toast.error('Failed to initialize project', {
            description: initResult.error || 'Unknown error occurred',
          });
          return;
        }

        const trashedProject = trashedProjects.find((p) => p.path === path);
        const effectiveTheme =
          (trashedProject?.theme as ThemeMode | undefined) ||
          (currentProject?.theme as ThemeMode | undefined) ||
          globalTheme;
        upsertAndSetCurrentProject(path, name, effectiveTheme);

        toast.success('Project opened', { description: `Opened ${name}` });
        finish();
      } catch (error) {
        logger.error('Failed to open project:', error);
        toast.error('Failed to open project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setIsOpening(false);
      }
    },
    [trashedProjects, currentProject, globalTheme, upsertAndSetCurrentProject, finish]
  );

  const browseForProject = useCallback(async () => {
    const api = getElectronAPI();
    const result = await api.openDirectory();

    if (!result.canceled && result.filePaths[0]) {
      const path = result.filePaths[0];
      const name = path.split(/[/\\]/).filter(Boolean).pop() || 'Untitled Project';
      await initializeAndOpenProject(path, name);
    }
  }, [initializeAndOpenProject]);

  const handleOpenProject = useCallback(async () => {
    try {
      const httpClient = getHttpApiClient();
      const configResult = await httpClient.workspace.getConfig();

      if (configResult.success && configResult.configured) {
        setShowWorkspacePicker(true);
        return;
      }
      await browseForProject();
    } catch (error) {
      logger.error('Failed to check workspace config:', error);
      await browseForProject();
    }
  }, [browseForProject]);

  const handleWorkspaceSelect = useCallback(
    async (path: string, name: string) => {
      setShowWorkspacePicker(false);
      await initializeAndOpenProject(path, name);
    },
    [initializeAndOpenProject]
  );

  const handleProjectClick = useCallback(
    async (project: { id: string; name: string; path: string }) => {
      await initializeAndOpenProject(project.path, project.name);
    },
    [initializeAndOpenProject]
  );

  const handleToggleFavorite = useCallback(
    (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      toggleProjectFavorite(projectId);
    },
    [toggleProjectFavorite]
  );

  const handleRemoveProject = useCallback(
    (e: React.MouseEvent, project: { id: string; name: string }) => {
      e.stopPropagation();
      setProjectToRemove(project);
    },
    []
  );

  const handleConfirmRemove = useCallback(() => {
    if (projectToRemove) {
      moveProjectToTrash(projectToRemove.id);
      toast.success('Project removed', {
        description: `${projectToRemove.name} has been removed from your projects list`,
      });
      setProjectToRemove(null);
    }
  }, [projectToRemove, moveProjectToTrash]);

  const handleNewProject = () => setShowNewProjectModal(true);

  const handleInteractiveMode = () => {
    openLayer('interview');
    finish();
  };

  /** Registers a freshly created project and lands on its board. */
  const adoptNewProject = useCallback(
    (projectName: string, projectPath: string) => {
      const project = {
        id: `project-${Date.now()}`,
        name: projectName,
        path: projectPath,
        lastOpened: new Date().toISOString(),
      };

      addProject(project);
      setCurrentProject(project);
      setShowNewProjectModal(false);
      finish();
    },
    [addProject, setCurrentProject, finish]
  );

  const handleCreateBlankProject = async (projectName: string, parentDir: string) => {
    setIsCreating(true);
    try {
      const api = getElectronAPI();
      const projectPath = `${parentDir}/${projectName}`;

      const parentExists = await api.exists(parentDir);
      if (!parentExists) {
        toast.error('Parent directory does not exist', {
          description: `Cannot create project in non-existent directory: ${parentDir}`,
        });
        return;
      }

      const parentStat = await api.stat(parentDir);
      if (parentStat && !parentStat.stats?.isDirectory) {
        toast.error('Parent path is not a directory', {
          description: `${parentDir} is not a directory`,
        });
        return;
      }

      const mkdirResult = await api.mkdir(projectPath);
      if (!mkdirResult.success) {
        toast.error('Failed to create project directory', {
          description: mkdirResult.error || 'Unknown error occurred',
        });
        return;
      }

      const initResult = await initializeProject(projectPath);
      if (!initResult.success) {
        toast.error('Failed to initialize project', {
          description: initResult.error || 'Unknown error occurred',
        });
        return;
      }

      await api.writeFile(`${projectPath}/.dmaker/app_spec.txt`, blankSpec(projectName));

      toast.success('Project created', { description: `Created ${projectName}` });
      adoptNewProject(projectName, projectPath);
    } catch (error) {
      logger.error('Failed to create project:', error);
      toast.error('Failed to create project', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
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
        toast.error('Failed to clone template', {
          description: cloneResult.error || 'Unknown error occurred',
        });
        return;
      }

      const projectPath = cloneResult.projectPath;
      const initResult = await initializeProject(projectPath);
      if (!initResult.success) {
        toast.error('Failed to initialize project', {
          description: initResult.error || 'Unknown error occurred',
        });
        return;
      }

      await api.writeFile(
        `${projectPath}/.dmaker/app_spec.txt`,
        `<project_specification>
  <project_name>${projectName}</project_name>

  <overview>
    This project was created from the "${template.name}" starter template.
    ${template.description}
  </overview>

  <technology_stack>
    ${template.techStack.map((tech) => `<technology>${tech}</technology>`).join('\n    ')}
  </technology_stack>

  <core_capabilities>
    ${template.features.map((feature) => `<capability>${feature}</capability>`).join('\n    ')}
  </core_capabilities>

  <implemented_features>
    <!-- The AI agent will populate this based on code analysis -->
  </implemented_features>
</project_specification>`
      );

      toast.success('Project created from template', {
        description: `Created ${projectName} from ${template.name}`,
      });
      adoptNewProject(projectName, projectPath);
    } catch (error) {
      logger.error('Failed to create project from template:', error);
      toast.error('Failed to create project', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
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
        toast.error('Failed to clone repository', {
          description: cloneResult.error || 'Unknown error occurred',
        });
        return;
      }

      const projectPath = cloneResult.projectPath;
      const initResult = await initializeProject(projectPath);
      if (!initResult.success) {
        toast.error('Failed to initialize project', {
          description: initResult.error || 'Unknown error occurred',
        });
        return;
      }

      await api.writeFile(
        `${projectPath}/.dmaker/app_spec.txt`,
        `<project_specification>
  <project_name>${projectName}</project_name>

  <overview>
    This project was cloned from ${repoUrl}.
    The AI agent will analyze the project structure.
  </overview>

  <technology_stack>
    <!-- The AI agent will fill this in after analyzing your project -->
  </technology_stack>

  <core_capabilities>
    <!-- List core features and capabilities -->
  </core_capabilities>

  <implemented_features>
    <!-- The AI agent will populate this based on code analysis -->
  </implemented_features>
</project_specification>`
      );

      toast.success('Project created from repository', { description: `Created ${projectName}` });
      adoptNewProject(projectName, projectPath);
    } catch (error) {
      logger.error('Failed to create project from custom URL:', error);
      toast.error('Failed to create project', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const hasProjects = projects.length > 0;

  const newProjectMenu = (
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuItem onClick={handleNewProject} data-testid="quick-setup-option">
        <Plus className="w-4 h-4 mr-2" />
        Quick Setup
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleInteractiveMode} data-testid="interactive-mode-option">
        <MessageSquare className="w-4 h-4 mr-2" />
        Interactive Mode
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  const renderProjectCard = (project: (typeof projects)[number], tone: 'favorite' | 'recent') => {
    const isFavorite = tone === 'favorite';
    return (
      <div
        key={project.id}
        className={cn(
          'group relative rounded-xl border bg-card/60 backdrop-blur-sm hover:bg-card hover:shadow-lg transition-all duration-300 cursor-pointer hover:-translate-y-0.5',
          isFavorite
            ? 'border-yellow-500/30 hover:border-yellow-500/50 hover:shadow-yellow-500/5'
            : 'border-border hover:border-brand-500/40 hover:shadow-brand-500/5'
        )}
        onClick={() => handleProjectClick(project)}
        data-testid={`project-card-${project.id}`}
      >
        <div className="relative p-3 sm:p-4">
          <div className="flex items-start gap-2.5 sm:gap-3">
            <div
              className={cn(
                'w-9 h-9 sm:w-10 sm:h-10 rounded-lg border flex items-center justify-center transition-all duration-300 shrink-0 overflow-hidden',
                isFavorite
                  ? 'bg-yellow-500/10 border-yellow-500/30 group-hover:bg-yellow-500/20'
                  : 'bg-muted/80 border-border group-hover:bg-brand-500/10 group-hover:border-brand-500/30'
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
                (() => {
                  const IconComponent = getProjectIcon(project.icon);
                  return (
                    <IconComponent
                      className={cn(
                        'w-4 h-4 sm:w-5 sm:h-5',
                        isFavorite
                          ? 'text-yellow-500'
                          : 'text-muted-foreground group-hover:text-brand-500 transition-colors duration-300'
                      )}
                    />
                  );
                })()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  'text-sm sm:text-base font-medium text-foreground truncate transition-colors duration-300',
                  isFavorite ? 'group-hover:text-yellow-500' : 'group-hover:text-brand-500'
                )}
              >
                {project.name}
              </p>
              <p className="text-xs text-muted-foreground/70 truncate mt-0.5 sm:mt-1">
                {project.path}
              </p>
              {project.lastOpened && (
                <p className="text-xs text-muted-foreground mt-1 sm:mt-1.5">
                  {new Date(project.lastOpened).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-0.5 sm:gap-1">
              <button
                onClick={(e) => handleToggleFavorite(e, project.id)}
                className={cn(
                  'p-1 sm:p-1.5 rounded-lg transition-colors',
                  isFavorite ? 'hover:bg-yellow-500/20' : 'hover:bg-muted'
                )}
                title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Star
                  className={cn(
                    'w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors',
                    isFavorite
                      ? 'text-yellow-500 fill-yellow-500'
                      : 'text-muted-foreground/50 hover:text-yellow-500'
                  )}
                />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 sm:p-1.5 rounded-lg hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                    title="More options"
                  >
                    <MoreVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => handleRemoveProject(e, project)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove from DMaker
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={cn('w-full', className)} data-testid="project-picker">
      {/* Nothing known yet — the two getting-started cards */}
      {!hasProjects && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {!compact && (
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
                No project open
              </h2>
              <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto px-2">
                Create a new project or open an existing folder to start building.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-3xl mx-auto">
            {/* New project */}
            <div
              className="group relative rounded-xl border border-border bg-card/80 backdrop-blur-sm hover:bg-card hover:border-brand-500/30 hover:shadow-xl hover:shadow-brand-500/5 transition-all duration-300 hover:-translate-y-1"
              data-testid="new-project-card"
            >
              <div className="relative p-4 sm:p-6 h-full flex flex-col">
                <div className="flex items-start gap-3 sm:gap-4 flex-1">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-linear-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/25 flex items-center justify-center group-hover:scale-105 transition-all duration-300 shrink-0">
                    <Plus className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-foreground mb-1.5">New Project</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Create a new project from scratch with AI-powered development
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="w-full mt-4 sm:mt-5 bg-linear-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white border-0 shadow-md shadow-brand-500/20"
                      data-testid="create-new-project"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Project
                      <ChevronDown className="w-4 h-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  {newProjectMenu}
                </DropdownMenu>
              </div>
            </div>

            {/* Open existing */}
            <div
              className="group relative rounded-xl border border-border bg-card/80 backdrop-blur-sm hover:bg-card hover:border-blue-500/30 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 cursor-pointer hover:-translate-y-1"
              onClick={handleOpenProject}
              data-testid="open-project-card"
            >
              <div className="relative p-4 sm:p-6 h-full flex flex-col">
                <div className="flex items-start gap-3 sm:gap-4 flex-1">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-muted border border-border flex items-center justify-center group-hover:bg-blue-500/10 group-hover:border-blue-500/30 group-hover:scale-105 transition-all duration-300 shrink-0">
                    <FolderOpen className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground group-hover:text-blue-500 transition-colors duration-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-foreground mb-1.5">Open Project</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Open an existing project folder to continue working
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  className="w-full mt-4 sm:mt-5 bg-secondary/80 hover:bg-secondary text-foreground border border-border hover:border-blue-500/30"
                  data-testid="open-existing-project"
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Browse Folder
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Known projects — search, favourites, recents */}
      {hasProjects && (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {!compact && (
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">Your Projects</h2>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 w-full sm:w-64"
                  data-testid="project-search-input"
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
              <Button variant="outline" onClick={handleOpenProject} data-testid="open-folder">
                <FolderOpen className="w-4 h-4 mr-2" />
                Open Folder
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="bg-linear-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white"
                    data-testid="create-new-project"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    New Project
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                {newProjectMenu}
              </DropdownMenu>
            </div>
          </div>

          {favoriteProjects.length > 0 && (
            <div>
              <div className="flex items-center gap-2 sm:gap-2.5 mb-3 sm:mb-4">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-500 fill-yellow-500" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-foreground">Favorites</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {favoriteProjects.map((project) => renderProjectCard(project, 'favorite'))}
              </div>
            </div>
          )}

          {recentProjects.length > 0 && (
            <div>
              <div className="flex items-center gap-2 sm:gap-2.5 mb-3 sm:mb-4">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-muted/50 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-foreground">
                  Recent Projects
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {recentProjects.map((project) => renderProjectCard(project, 'recent'))}
              </div>
            </div>
          )}

          {searchQuery && favoriteProjects.length === 0 && recentProjects.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">No projects found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                No projects match &quot;{searchQuery}&quot;
              </p>
              <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
                Clear search
              </Button>
            </div>
          )}
        </div>
      )}

      <NewProjectModal
        open={showNewProjectModal}
        onOpenChange={setShowNewProjectModal}
        onCreateBlankProject={handleCreateBlankProject}
        onCreateFromTemplate={handleCreateFromTemplate}
        onCreateFromCustomUrl={handleCreateFromCustomUrl}
        isCreating={isCreating}
      />

      <WorkspacePickerModal
        open={showWorkspacePicker}
        onOpenChange={setShowWorkspacePicker}
        onSelect={handleWorkspaceSelect}
      />

      <Dialog open={!!projectToRemove} onOpenChange={(open) => !open && setProjectToRemove(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{projectToRemove?.name}</strong> from DMaker?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This will only remove the project from your DMaker projects list. The project files on
              your computer will not be deleted.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectToRemove(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmRemove}>
              <Trash2 className="w-4 h-4 mr-2" />
              Remove Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isOpening && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          data-testid="project-opening-overlay"
        >
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card border border-border shadow-2xl">
            <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
            <p className="text-foreground font-medium">Opening project...</p>
          </div>
        </div>
      )}
    </div>
  );
}
