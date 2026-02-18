import { useState, useEffect } from 'react';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('SessionManager');
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Input } from '@/components/ui/input';
import {
  Plus,
  MessageSquare,
  Archive,
  Trash2,
  Edit2,
  Check,
  X,
  ArchiveRestore,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionListItem } from '@/types/electron';
import { useKeyboardShortcutsConfig } from '@/hooks/use-keyboard-shortcuts';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { DeleteSessionDialog } from '@/components/dialogs/delete-session-dialog';
import { DeleteAllArchivedSessionsDialog } from '@/components/dialogs/delete-all-archived-sessions-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SessionManagerProps {
  currentSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
  projectPath: string;
  isCurrentSessionThinking?: boolean;
  onQuickCreateRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

export function SessionManager({
  currentSessionId,
  onSelectSession,
  projectPath,
  isCurrentSessionThinking = false,
  onQuickCreateRef,
}: SessionManagerProps) {
  const shortcuts = useKeyboardShortcutsConfig();
  const bumpSessionListVersion = useAppStore((state) => state.bumpSessionListVersion);
  const sessionListVersion = useAppStore((state) => state.sessionListVersion);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [runningSessions, setRunningSessions] = useState<Set<string>>(new Set());
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<SessionListItem | null>(null);
  const [isDeleteAllArchivedDialogOpen, setIsDeleteAllArchivedDialogOpen] = useState(false);

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

    // Always load all sessions and filter client-side
    const result = await api.sessions.list(true);
    if (result.success && result.sessions) {
      setSessions(result.sessions);
      // Check running state for all sessions
      await checkRunningSessions(result.sessions);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [sessionListVersion]);

  // Subscribe to WebSocket events for real-time session state updates
  // Replaces 3s polling with push-based updates + 60s fallback
  useEffect(() => {
    const api = getElectronAPI();
    const unsubscribers: (() => void)[] = [];

    // Subscribe to session:state-changed events for instant updates
    if (api.pushEvents?.onSessionStateChanged) {
      unsubscribers.push(
        api.pushEvents.onSessionStateChanged((payload) => {
          const { sessionId, isRunning } = payload;
          setRunningSessions((prev) => {
            const next = new Set(prev);
            if (isRunning) {
              next.add(sessionId);
            } else {
              next.delete(sessionId);
            }
            return next;
          });
        })
      );
    }

    // Subscribe to agent:stream events as backup for detecting session completion
    if (api.agent?.onStream) {
      unsubscribers.push(
        api.agent.onStream((data: unknown) => {
          const event = data as any;
          if (event?.type === 'agent:complete' || event?.type === 'agent:error') {
            // Re-check running sessions to catch completed sessions
            if (sessions.length > 0) {
              checkRunningSessions(sessions);
            }
          }
        })
      );
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [sessions]);

  // Fallback polling at 60s for safety net (only when there are running sessions)
  useEffect(() => {
    if (runningSessions.size === 0 && !isCurrentSessionThinking) return;

    const interval = setInterval(async () => {
      if (sessions.length > 0) {
        await checkRunningSessions(sessions);
      }
    }, 60000); // Fallback check every 60 seconds

    return () => clearInterval(interval);
  }, [sessions, runningSessions.size, isCurrentSessionThinking]);

  // Create new session with random name
  const handleCreateSession = async () => {
    const api = getElectronAPI();
    if (!api?.sessions) return;

    const sessionName = newSessionName.trim() || 'New Session';

    const result = await api.sessions.create(sessionName, projectPath, projectPath);

    if (result.success && result.session?.id) {
      setNewSessionName('');
      setIsCreating(false);
      await loadSessions();
      bumpSessionListVersion();
      onSelectSession(result.session.id);
    }
  };

  // Create new session directly with a placeholder name (will be auto-renamed on first message)
  const handleQuickCreateSession = async () => {
    const api = getElectronAPI();
    if (!api?.sessions) return;

    const sessionName = 'New Session';

    const result = await api.sessions.create(sessionName, projectPath, projectPath);

    if (result.success && result.session?.id) {
      await loadSessions();
      bumpSessionListVersion();
      onSelectSession(result.session.id);
    }
  };

  // Expose the quick create function via ref for keyboard shortcuts
  useEffect(() => {
    if (onQuickCreateRef) {
      onQuickCreateRef.current = handleQuickCreateSession;
    }
    return () => {
      if (onQuickCreateRef) {
        onQuickCreateRef.current = null;
      }
    };
  }, [onQuickCreateRef, projectPath]);

  // Rename session
  const handleRenameSession = async (sessionId: string) => {
    const api = getElectronAPI();
    if (!editingName.trim() || !api?.sessions) return;

    const result = await api.sessions.update(sessionId, editingName, undefined);

    if (result.success) {
      setEditingSessionId(null);
      setEditingName('');
      await loadSessions();
      bumpSessionListVersion();
    }
  };

  // Archive session
  const handleArchiveSession = async (sessionId: string) => {
    const api = getElectronAPI();
    if (!api?.sessions) {
      logger.error('[SessionManager] Sessions API not available');
      return;
    }

    try {
      const result = await api.sessions.archive(sessionId);
      if (result.success) {
        // If the archived session was currently selected, deselect it
        if (currentSessionId === sessionId) {
          onSelectSession(null);
        }
        await loadSessions();
        bumpSessionListVersion();
      } else {
        logger.error('[SessionManager] Archive failed:', result.error);
      }
    } catch (error) {
      logger.error('[SessionManager] Archive error:', error);
    }
  };

  // Unarchive session
  const handleUnarchiveSession = async (sessionId: string) => {
    const api = getElectronAPI();
    if (!api?.sessions) {
      logger.error('[SessionManager] Sessions API not available');
      return;
    }

    try {
      const result = await api.sessions.unarchive(sessionId);
      if (result.success) {
        await loadSessions();
        bumpSessionListVersion();
      } else {
        logger.error('[SessionManager] Unarchive failed:', result.error);
      }
    } catch (error) {
      logger.error('[SessionManager] Unarchive error:', error);
    }
  };

  // Open delete session dialog
  const handleDeleteSession = (session: SessionListItem) => {
    setSessionToDelete(session);
    setIsDeleteDialogOpen(true);
  };

  // Confirm delete session
  const confirmDeleteSession = async (sessionId: string) => {
    const api = getElectronAPI();
    if (!api?.sessions) return;

    const result = await api.sessions.delete(sessionId);
    if (result.success) {
      // If the deleted session was currently selected, clear selection
      // The SessionSelector's validation effect will handle this automatically,
      // but we can proactively clear it for better UX
      if (currentSessionId === sessionId) {
        onSelectSession(null);
      }

      // Reload sessions after clearing selection
      await loadSessions();
      bumpSessionListVersion();
    }
    setSessionToDelete(null);
  };

  // Delete all archived sessions
  const handleDeleteAllArchivedSessions = async () => {
    const api = getElectronAPI();
    if (!api?.sessions) return;

    // Delete each archived session
    for (const session of archivedSessions) {
      await api.sessions.delete(session.id);
    }

    await loadSessions();
    bumpSessionListVersion();
    setIsDeleteAllArchivedDialogOpen(false);
  };

  const activeSessions = sessions.filter((s) => !s.isArchived);
  const archivedSessions = sessions.filter((s) => s.isArchived);
  const displayedSessions = showArchived ? archivedSessions : activeSessions;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header - Clean minimal design */}
      <div className="px-4 py-4">
        {/* Title row with New button */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">Sessions</h2>
          <HotkeyButton
            variant="default"
            size="sm"
            onClick={() => {
              if (showArchived) setShowArchived(false);
              handleQuickCreateSession();
            }}
            hotkey={shortcuts.newSession}
            hotkeyActive={false}
            data-testid="new-session-button"
            title={`New Session (${shortcuts.newSession})`}
            className="h-8 px-3 text-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New
          </HotkeyButton>
        </div>

        {/* View toggle - Dropdown style */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between h-9 px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-2">
                {showArchived ? (
                  <>
                    <Archive className="w-4 h-4" />
                    Archived
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4" />
                    Active
                  </>
                )}
                <span className="text-xs text-muted-foreground/70">
                  ({showArchived ? archivedSessions.length : activeSessions.length})
                </span>
              </span>
              <ChevronDown className="w-4 h-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            <DropdownMenuItem onClick={() => setShowArchived(false)}>
              <MessageSquare className="w-4 h-4 mr-2" />
              Active Sessions
              <span className="ml-auto text-xs text-muted-foreground">{activeSessions.length}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowArchived(true)}>
              <Archive className="w-4 h-4 mr-2" />
              Archived Sessions
              <span className="ml-auto text-xs text-muted-foreground">
                {archivedSessions.length}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1" data-testid="session-list">
        {/* Create new session inline */}
        {isCreating && (
          <div className="p-3 mb-2 rounded-lg bg-muted/50">
            <div className="flex gap-2">
              <Input
                placeholder="Session name..."
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSession();
                  if (e.key === 'Escape') {
                    setIsCreating(false);
                    setNewSessionName('');
                  }
                }}
                autoFocus
                className="h-8 text-sm"
              />
              <Button size="sm" onClick={handleCreateSession} className="h-8 w-8 p-0">
                <Check className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsCreating(false);
                  setNewSessionName('');
                }}
                className="h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Delete All Archived button */}
        {showArchived && archivedSessions.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start h-9 px-3 mb-2 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setIsDeleteAllArchivedDialogOpen(true)}
            data-testid="delete-all-archived-sessions-button"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete All Archived
          </Button>
        )}

        {/* Session items */}
        {displayedSessions.map((session) => (
          <div
            key={session.id}
            className={cn(
              'group relative rounded-lg cursor-pointer',
              'transition-colors duration-150',
              'hover:bg-muted/50',
              currentSessionId === session.id && 'bg-primary/10',
              session.isArchived && 'opacity-70'
            )}
            onClick={() => !session.isArchived && onSelectSession(session.id)}
            data-testid={`session-item-${session.id}`}
          >
            {/* Selected indicator bar */}
            {currentSessionId === session.id && (
              <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-primary rounded-full" />
            )}

            <div className="p-3 pl-4">
              {editingSessionId === session.id ? (
                <div className="flex gap-2">
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSession(session.id);
                      if (e.key === 'Escape') {
                        setEditingSessionId(null);
                        setEditingName('');
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                    className="h-7 text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRenameSession(session.id);
                    }}
                    className="h-7 w-7 p-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingSessionId(null);
                      setEditingName('');
                    }}
                    className="h-7 w-7 p-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  {/* Session name row */}
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Running indicator */}
                    {(currentSessionId === session.id && isCurrentSessionThinking) ||
                    runningSessions.has(session.id) ? (
                      <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                    ) : (
                      <MessageSquare
                        className={cn(
                          'w-4 h-4 shrink-0',
                          currentSessionId === session.id ? 'text-primary' : 'text-muted-foreground'
                        )}
                      />
                    )}
                    <span
                      className={cn(
                        'text-sm font-medium truncate flex-1',
                        currentSessionId === session.id && 'text-primary'
                      )}
                      title={session.name}
                    >
                      {session.name}
                    </span>
                    {((currentSessionId === session.id && isCurrentSessionThinking) ||
                      runningSessions.has(session.id)) && (
                      <span className="text-xs text-primary shrink-0">●</span>
                    )}
                  </div>

                  {/* Metadata row */}
                  <div className="flex items-center gap-1.5 mt-1 ml-6 text-xs text-muted-foreground">
                    <span>{session.messageCount} msgs</span>
                    <span>·</span>
                    <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
                  </div>

                  {/* Action buttons - appear on hover */}
                  <div
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!session.isArchived && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingSessionId(session.id);
                            setEditingName(session.name);
                          }}
                          className="h-7 w-7 p-0 hover:bg-background"
                          title="Rename"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleArchiveSession(session.id)}
                          className="h-7 w-7 p-0 hover:bg-background"
                          data-testid={`archive-session-${session.id}`}
                          title="Archive"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    {session.isArchived && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUnarchiveSession(session.id)}
                          className="h-7 w-7 p-0 hover:bg-background"
                          title="Restore"
                        >
                          <ArchiveRestore className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteSession(session)}
                          className="h-7 w-7 p-0 text-destructive hover:bg-background"
                          data-testid={`delete-session-${session.id}`}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Empty state */}
        {displayedSessions.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">{showArchived ? 'No archived sessions' : 'No sessions yet'}</p>
            {!showArchived && <p className="text-xs mt-1 opacity-70">Click "New" to create one</p>}
          </div>
        )}
      </div>

      {/* Delete Session Confirmation Dialog */}
      <DeleteSessionDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        session={sessionToDelete}
        onConfirm={confirmDeleteSession}
      />

      {/* Delete All Archived Sessions Confirmation Dialog */}
      <DeleteAllArchivedSessionsDialog
        open={isDeleteAllArchivedDialogOpen}
        onOpenChange={setIsDeleteAllArchivedDialogOpen}
        archivedCount={archivedSessions.length}
        onConfirm={handleDeleteAllArchivedSessions}
      />
    </div>
  );
}
