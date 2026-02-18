import { useState, useEffect, useMemo } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MessageSquare, ChevronDown, Loader2, Check, Layers, Trash2 } from 'lucide-react';
import { getProjectIcon } from '@/lib/icon-registry';
import { cn } from '@/lib/utils';
import type { SessionListItem } from '@/types/electron';
import { getElectronAPI, type Project } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';
import { LazyImage } from '@/components/ui/lazy-image';
import { DeleteSessionDialog } from '@/components/dialogs/delete-session-dialog';

const logger = createLogger('SessionSelector');

interface SessionSelectorProps {
  currentSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
  projectPath: string;
  isCurrentSessionThinking?: boolean;
  /** Called when user selects a different project from the dropdown */
  onProjectChange?: (project: Project) => void;
  /** Whether to show the project selector section */
  showProjectSelector?: boolean;
  /**
   * The currently selected project for this selector (optional).
   * When provided, this overrides the global currentProject for display purposes.
   * Used when the selector should operate independently of global state.
   */
  selectedProject?: Project | null;
}

export function SessionSelector({
  currentSessionId,
  onSelectSession,
  projectPath,
  isCurrentSessionThinking = false,
  onProjectChange,
  showProjectSelector = false,
  selectedProject: selectedProjectProp,
}: SessionSelectorProps) {
  const [allSessions, setAllSessions] = useState<SessionListItem[]>([]);
  const [runningSessions, setRunningSessions] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<SessionListItem | null>(null);

  // Get projects from store for project selector
  const { projects, currentProject, setCurrentProject, showAllProjects, setShowAllProjects } =
    useAppStore(
      useShallow((state) => ({
        projects: state.projects,
        currentProject: state.currentProject,
        setCurrentProject: state.setCurrentProject,
        showAllProjects: state.showAllProjects,
        setShowAllProjects: state.setShowAllProjects,
      }))
    );

  // Use selectedProject prop if provided (for independent mode), otherwise use global currentProject
  const effectiveSelectedProject =
    selectedProjectProp !== undefined ? selectedProjectProp : currentProject;

  // Check if we're in independent mode (parent controls the project selection)
  const isIndependentMode = selectedProjectProp !== undefined || onProjectChange !== undefined;

  // Filter sessions based on selected project
  // When a specific project is selected, filter sessions by that project's path
  const sessions = useMemo(() => {
    // In independent mode, filter by the effective selected project
    if (isIndependentMode && effectiveSelectedProject?.path) {
      return allSessions.filter((session) => session.projectPath === effectiveSelectedProject.path);
    }

    // In global mode, respect showAllProjects toggle
    if (!isIndependentMode && showAllProjects) {
      // Show all sessions when "All Projects" is selected
      return allSessions;
    }

    if (effectiveSelectedProject?.path) {
      // Filter sessions to only show those matching the selected project's path
      return allSessions.filter((session) => session.projectPath === effectiveSelectedProject.path);
    }

    // Fallback: if no project context, filter by the provided projectPath prop
    if (projectPath) {
      return allSessions.filter((session) => session.projectPath === projectPath);
    }

    // No filtering if no project context is available
    return allSessions;
  }, [
    allSessions,
    showAllProjects,
    effectiveSelectedProject?.path,
    projectPath,
    isIndependentMode,
  ]);

  // Check running state for all sessions
  const checkRunningSessions = async (sessionList: SessionListItem[]) => {
    const api = getElectronAPI();
    if (!api?.agent) return;

    const runningIds = new Set<string>();

    // Check each session's running state
    for (const session of sessionList) {
      try {
        const result = await api.agent.getHistory(session.id);
        if (result.success && result.isRunning) {
          runningIds.add(session.id);
        }
      } catch (err) {
        // Ignore errors for individual session checks
        logger.warn(`Failed to check running state for ${session.id}:`, err);
      }
    }

    setRunningSessions(runningIds);
  };

  // Load sessions
  const loadSessions = async () => {
    const api = getElectronAPI();
    if (!api?.sessions) return;

    // Load all sessions (only active, not archived)
    const result = await api.sessions.list(true);
    if (result.success && result.sessions) {
      // Filter to only show active sessions and sort by most recently updated
      const activeSessions = result.sessions
        .filter((s) => !s.isArchived)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setAllSessions(activeSessions);
      // Check running state for all sessions
      await checkRunningSessions(activeSessions);
    }
  };

  // Watch for session list changes from other components (e.g., SessionManager deleting a session)
  const sessionListVersion = useAppStore((state) => state.sessionListVersion);
  const bumpSessionListVersion = useAppStore((state) => state.bumpSessionListVersion);

  // Load sessions on mount, when project context changes, or when session list is mutated elsewhere
  useEffect(() => {
    loadSessions();
  }, [sessionListVersion]);

  // Reload sessions when the selected project changes (to ensure we have fresh data)
  useEffect(() => {
    // Skip initial mount - handled by the effect above
    if (effectiveSelectedProject?.path) {
      loadSessions();
      logger.info(`Reloading sessions due to project change: ${effectiveSelectedProject.path}`);
    }
  }, [effectiveSelectedProject?.path]);

  // Periodically check running state for sessions
  useEffect(() => {
    if (runningSessions.size === 0 && !isCurrentSessionThinking) return;

    const interval = setInterval(async () => {
      if (allSessions.length > 0) {
        await checkRunningSessions(allSessions);
      }
    }, 3000); // Check every 3 seconds

    return () => clearInterval(interval);
  }, [allSessions, runningSessions.size, isCurrentSessionThinking]);

  // Validate that currentSessionId still exists in the sessions list
  // If not, clear the selection (e.g., when a session is deleted)
  useEffect(() => {
    if (!currentSessionId) return;

    // Check if the current session exists in the filtered sessions list
    const currentSessionExists = sessions.some((s) => s.id === currentSessionId);

    if (!currentSessionExists) {
      logger.info(`Current session ${currentSessionId} no longer exists, clearing selection`);
      onSelectSession(null);
    }
  }, [currentSessionId, sessions, onSelectSession]);

  // Create new session with placeholder name (will be auto-renamed on first message)
  const handleQuickCreateSession = async () => {
    const api = getElectronAPI();
    if (!api?.sessions) return;

    const sessionName = 'New Session';

    // Use the effective selected project's path if available, otherwise fall back to the provided projectPath
    const sessionProjectPath = effectiveSelectedProject?.path || projectPath;

    const result = await api.sessions.create(sessionName, sessionProjectPath, sessionProjectPath);

    if (result.success && result.session?.id) {
      await loadSessions();
      bumpSessionListVersion();
      onSelectSession(result.session.id);
      setOpen(false);
    }
  };

  // Delete session handler (shift+click skips confirmation)
  const handleDeleteSession = (session: SessionListItem, shiftKey: boolean) => {
    if (shiftKey) {
      confirmDeleteSession(session.id);
    } else {
      setSessionToDelete(session);
      setIsDeleteDialogOpen(true);
    }
  };

  const confirmDeleteSession = async (sessionId: string) => {
    const api = getElectronAPI();
    if (!api?.sessions) return;

    const result = await api.sessions.delete(sessionId);
    if (result.success) {
      if (currentSessionId === sessionId) {
        onSelectSession(null);
      }
      await loadSessions();
      bumpSessionListVersion();
    }
    setSessionToDelete(null);
  };

  // Find current session
  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const currentSessionName = currentSession?.name || 'Select a chat';

  // Check if current session is running
  const isCurrentSessionRunning =
    (currentSessionId && isCurrentSessionThinking) ||
    (currentSessionId && runningSessions.has(currentSessionId));

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-9 px-3 gap-2 rounded-lg',
              'text-sm font-medium',
              'hover:bg-muted/70 hover:shadow-sm',
              'transition-all duration-200',
              'max-w-[200px]'
            )}
          >
            {isCurrentSessionRunning ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <MessageSquare className="w-4 h-4 shrink-0" />
            )}
            <span className="truncate">{currentSessionName}</span>
            <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[280px] max-h-[400px] overflow-y-auto">
          {/* Project Selector Section */}
          {showProjectSelector && projects.length > 0 && (
            <>
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                Project
              </DropdownMenuLabel>

              {/* All Projects option - only show in global mode (not independent mode) */}
              {!isIndependentMode && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    setShowAllProjects(true);
                  }}
                  className={cn('cursor-pointer', showAllProjects && 'bg-primary/10 text-primary')}
                >
                  <div className="flex items-center gap-2 w-full min-w-0">
                    <div
                      className={cn(
                        'w-5 h-5 rounded flex items-center justify-center shrink-0',
                        showAllProjects ? 'bg-primary/20' : 'bg-muted'
                      )}
                    >
                      <Layers
                        className={cn(
                          'w-3 h-3',
                          showAllProjects ? 'text-primary' : 'text-muted-foreground'
                        )}
                      />
                    </div>
                    <span className="flex-1 truncate text-sm">All Projects</span>
                    {showAllProjects && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </div>
                </DropdownMenuItem>
              )}

              {/* Individual project options */}
              {projects.map((project) => {
                const ProjectIcon = getProjectIcon(project.icon);
                const isSelected = !showAllProjects && effectiveSelectedProject?.id === project.id;

                return (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={(e) => {
                      e.preventDefault();
                      if (isIndependentMode) {
                        // In independent mode, only notify parent - don't update global state
                        onProjectChange?.(project);
                      } else {
                        // In global mode, update the global store
                        setShowAllProjects(false);
                        setCurrentProject(project);
                      }
                    }}
                    className={cn('cursor-pointer', isSelected && 'bg-primary/10 text-primary')}
                  >
                    <div className="flex items-center gap-2 w-full min-w-0">
                      {project.customIconPath ? (
                        <LazyImage
                          src={getAuthenticatedImageUrl(project.customIconPath, project.path)}
                          alt={project.name}
                          className="w-5 h-5 rounded object-cover ring-1 ring-border/50 shrink-0"
                          containerClassName="w-5 h-5 shrink-0"
                          errorIconSize="w-2.5 h-2.5"
                        />
                      ) : (
                        <div
                          className={cn(
                            'w-5 h-5 rounded flex items-center justify-center shrink-0',
                            isSelected ? 'bg-primary/20' : 'bg-muted'
                          )}
                        >
                          <ProjectIcon
                            className={cn(
                              'w-3 h-3',
                              isSelected ? 'text-primary' : 'text-muted-foreground'
                            )}
                          />
                        </div>
                      )}
                      <span className="flex-1 truncate text-sm">{project.name}</span>
                      {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                    </div>
                  </DropdownMenuItem>
                );
              })}

              <DropdownMenuSeparator />

              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                Chats
              </DropdownMenuLabel>
            </>
          )}

          {/* Session list */}
          {sessions.map((session) => (
            <DropdownMenuItem
              key={session.id}
              onClick={() => {
                onSelectSession(session.id);
                setOpen(false);
              }}
              className={cn(
                'cursor-pointer',
                currentSessionId === session.id && 'bg-primary/10 text-primary'
              )}
            >
              <div className="flex items-center gap-2 w-full min-w-0">
                {runningSessions.has(session.id) ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <MessageSquare className="w-4 h-4 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{session.name}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{session.messageCount} msgs</span>
                    <span>·</span>
                    <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteSession(session, e.shiftKey);
                  }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="shrink-0 p-1 rounded text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive transition-colors"
                  title="Delete session"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </DropdownMenuItem>
          ))}

          {/* Empty state */}
          {sessions.length === 0 && (
            <div className="text-center py-4 text-muted-foreground">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No chats yet</p>
            </div>
          )}

          {/* Separator */}
          <DropdownMenuSeparator />

          {/* Start new chat button */}
          <DropdownMenuItem
            onClick={handleQuickCreateSession}
            className="cursor-pointer font-medium text-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            Start new chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Session Confirmation Dialog */}
      <DeleteSessionDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        session={sessionToDelete}
        onConfirm={confirmDeleteSession}
      />
    </>
  );
}
