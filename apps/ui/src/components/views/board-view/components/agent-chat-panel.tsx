import { useState, useCallback, useRef, useEffect, memo, useMemo } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import { useAppStore } from '@/store/app-store';
import type { PhaseModelEntry } from '@automaker/types';
import { useElectronAgent } from '@/hooks/use-electron-agent';
import { cn } from '@/lib/utils';
import { getElectronAPI, type Project } from '@/lib/electron';
import { Bot, ChevronLeft, ChevronRight, ChevronDown, Check } from 'lucide-react';
import { getProjectIcon } from '@/lib/icon-registry';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';
import { LazyImage } from '@/components/ui/lazy-image';

// Random session name generator
const adjectives = [
  'Swift',
  'Bright',
  'Clever',
  'Dynamic',
  'Eager',
  'Focused',
  'Gentle',
  'Happy',
  'Inventive',
  'Jolly',
  'Keen',
  'Lively',
  'Mighty',
  'Noble',
  'Optimal',
  'Peaceful',
  'Quick',
  'Radiant',
  'Smart',
  'Tranquil',
  'Unique',
  'Vibrant',
  'Wise',
  'Zealous',
];

const nouns = [
  'Agent',
  'Builder',
  'Coder',
  'Developer',
  'Explorer',
  'Forge',
  'Garden',
  'Helper',
  'Innovator',
  'Journey',
  'Kernel',
  'Lighthouse',
  'Mission',
  'Navigator',
  'Oracle',
  'Project',
  'Quest',
  'Runner',
  'Spark',
  'Task',
  'Unicorn',
  'Voyage',
  'Workshop',
];

function generateRandomSessionName(): string {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 100);
  return `${adjective} ${noun} ${number}`;
}

// Stable welcome message array to avoid creating new references on each render
const WELCOME_MESSAGES = [
  {
    id: 'welcome',
    role: 'assistant' as const,
    content:
      "Hello! I'm the Automaker Agent. I can help you build software autonomously. I can read and modify files in this project, run commands, and execute tests. What would you like to create today?",
    timestamp: new Date(0).toISOString(), // Stable timestamp
  },
];

// Reuse hooks from agent-view
import {
  useAgentScroll,
  useFileAttachments,
  useAgentShortcuts,
  useAgentSession,
} from '../../agent-view/hooks';

// Reuse components from agent-view
import { AgentHeader, ChatArea } from '../../agent-view/components';
import { AgentInputArea } from '../../agent-view/input-area';

export interface AgentChatPanelProps {
  /** Additional CSS classes for the container */
  className?: string;
  /** Project for the session manager (new preferred prop) */
  project?: Project | null;
  /** Project path for the session manager (deprecated, use project prop instead) */
  projectPath?: string;
  /** Whether the panel is collapsed */
  isCollapsed?: boolean;
  /** Callback when collapse state changes */
  onCollapseChange?: (collapsed: boolean) => void;
  /** Compact mode for smaller display */
  compact?: boolean;
  /** Callback when user selects a different project from within the panel */
  onProjectChange?: (project: Project) => void;
  /** Whether to show the project selector in the session dropdown */
  showProjectSelector?: boolean;
}

/**
 * Custom comparison function for memo to prevent unnecessary re-renders.
 * This ensures the AgentChatPanel only re-renders when its own props change,
 * not when unrelated parent state changes.
 */
function arePropsEqual(prevProps: AgentChatPanelProps, nextProps: AgentChatPanelProps): boolean {
  // Compare primitive props
  if (prevProps.className !== nextProps.className) return false;
  if (prevProps.isCollapsed !== nextProps.isCollapsed) return false;
  if (prevProps.compact !== nextProps.compact) return false;
  if (prevProps.showProjectSelector !== nextProps.showProjectSelector) return false;
  if (prevProps.projectPath !== nextProps.projectPath) return false;

  // Compare project by id (stable identifier) rather than reference
  const prevProjectId = prevProps.project?.id;
  const nextProjectId = nextProps.project?.id;
  if (prevProjectId !== nextProjectId) return false;

  // Compare callback references (these should be memoized by parent)
  if (prevProps.onCollapseChange !== nextProps.onCollapseChange) return false;
  if (prevProps.onProjectChange !== nextProps.onProjectChange) return false;

  return true;
}

/**
 * AgentChatPanel - An embedded chat panel for interacting with AI agents
 *
 * This component is extracted from AgentView and designed to be embedded
 * in the board view alongside the Kanban board and Running Agents panel.
 * It includes the SessionManager sidebar and full chat interface.
 *
 * The component is memoized to prevent unnecessary re-renders when the board's
 * project changes. When used with a `project` prop, it maintains its own
 * isolated state independent of the board's currentProject.
 *
 * The component responds to project changes by:
 * - Resetting the current session selection (via useAgentSession hook)
 * - Clearing the input field
 * - Clearing any file attachments
 *
 * @example
 * ```tsx
 * // Using project prop (recommended for isolation from board state)
 * <AgentChatPanel
 *   project={agentPanelProject}
 *   isCollapsed={isAgentChatPanelCollapsed}
 *   onCollapseChange={handleAgentChatPanelCollapseChange}
 *   onProjectChange={handleAgentPanelProjectChange}
 *   showProjectSelector
 * />
 *
 * // Using deprecated projectPath prop (for backwards compatibility)
 * <AgentChatPanel
 *   projectPath={currentProject.path}
 *   isCollapsed={isAgentChatPanelCollapsed}
 *   onCollapseChange={setAgentChatPanelCollapsed}
 * />
 * ```
 */
export const AgentChatPanel = memo(function AgentChatPanel({
  className,
  project,
  projectPath: deprecatedProjectPath,
  isCollapsed = false,
  onCollapseChange,
  compact = false,
  onProjectChange,
  showProjectSelector = false,
}: AgentChatPanelProps) {
  // Get projects list from store (for project selector dropdown)
  const projects = useAppStore((state) => state.projects);
  const bumpSessionListVersion = useAppStore((state) => state.bumpSessionListVersion);

  // Only subscribe to storeCurrentProject if no project prop is provided.
  // This prevents re-renders when board's currentProject changes while
  // we have an explicitly provided project prop.
  const storeCurrentProject = useAppStore((state) =>
    project === undefined ? state.currentProject : null
  );

  // Determine the effective project: prop takes precedence, then store
  const effectiveProject = project ?? storeCurrentProject;

  // Derive projectPath from the effective project (or use deprecated prop for backwards compatibility)
  const projectPath = effectiveProject?.path ?? deprecatedProjectPath ?? '';

  const [input, setInput] = useState('');
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [modelSelection, setModelSelection] = useState<PhaseModelEntry>({ model: 'sonnet' });

  // Input ref for auto-focus
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Ref for quick create session function from SessionManager
  const quickCreateSessionRef = useRef<(() => Promise<void>) | null>(null);

  // Session management hook
  const { currentSessionId, handleSelectSession } = useAgentSession({
    projectPath,
  });

  // Create new session directly with a random name
  const handleCreateSession = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.sessions) return;

    const sessionName = generateRandomSessionName();
    const result = await api.sessions.create(sessionName, projectPath, projectPath);

    if (result.success && result.session?.id) {
      bumpSessionListVersion();
      handleSelectSession(result.session.id);
    }
  }, [projectPath, handleSelectSession, bumpSessionListVersion]);

  // Use the Electron agent hook (only if we have a session)
  const {
    messages,
    isProcessing,
    isConnected,
    sendMessage,
    clearHistory,
    stopExecution,
    serverQueue,
    addToServerQueue,
    removeFromServerQueue,
    clearServerQueue,
  } = useElectronAgent({
    sessionId: currentSessionId || '',
    workingDirectory: projectPath,
    model: modelSelection.model,
    thinkingLevel: modelSelection.thinkingLevel,
    onToolUse: (toolName) => {
      setCurrentTool(toolName);
      setTimeout(() => setCurrentTool(null), 2000);
    },
  });

  // File attachments hook
  const fileAttachments = useFileAttachments({
    isProcessing,
    isConnected,
  });

  // Virtualizer instance — set by MessageList on every render
  const virtualizerRef = useRef<Virtualizer<HTMLDivElement, Element> | null>(null);

  const handleVirtualizerReady = useCallback((v: Virtualizer<HTMLDivElement, Element>) => {
    virtualizerRef.current = v;
  }, []);

  // Scroll management hook (now driven by virtualizer.scrollToIndex)
  const { scrollContainerRef, handleScroll } = useAgentScroll({
    messagesLength: messages.length,
    currentSessionId,
    virtualizerRef,
  });

  // Keyboard shortcuts hook
  useAgentShortcuts({
    currentProject: effectiveProject,
    quickCreateSessionRef,
  });

  // Track previous project path for change detection
  const prevProjectPathRef = useRef<string | null>(null);

  // Extract clearAllFiles to avoid dependency on the entire fileAttachments object
  const { clearAllFiles } = fileAttachments;

  // Effect to handle project changes - clear input and reset state
  useEffect(() => {
    const currentPath = effectiveProject?.path ?? null;
    const previousPath = prevProjectPathRef.current;

    // Skip initial mount
    if (previousPath === null) {
      prevProjectPathRef.current = currentPath;
      return;
    }

    // Project actually changed
    if (currentPath !== previousPath) {
      prevProjectPathRef.current = currentPath;

      // Clear input when project changes
      setInput('');
      setCurrentTool(null);

      // Clear file attachments
      clearAllFiles();
    }
  }, [effectiveProject?.path, clearAllFiles]);

  // Handle send message
  const handleSend = useCallback(async () => {
    const {
      selectedImages,
      selectedTextFiles,
      setSelectedImages,
      setSelectedTextFiles,
      setShowImageDropZone,
    } = fileAttachments;

    if (!input.trim() && selectedImages.length === 0 && selectedTextFiles.length === 0) return;

    const messageContent = input;
    const messageImages = selectedImages;
    const messageTextFiles = selectedTextFiles;

    setInput('');
    setSelectedImages([]);
    setSelectedTextFiles([]);
    setShowImageDropZone(false);

    // If already processing, add to server queue instead
    if (isProcessing) {
      await addToServerQueue(messageContent, messageImages, messageTextFiles);
    } else {
      await sendMessage(messageContent, messageImages, messageTextFiles);
    }
  }, [input, fileAttachments, isProcessing, sendMessage, addToServerQueue]);

  const handleClearChat = async () => {
    if (!confirm('Are you sure you want to clear this conversation?')) return;
    await clearHistory();
  };

  // Auto-focus input when session is selected/changed
  useEffect(() => {
    if (currentSessionId && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 200);
    }
  }, [currentSessionId]);

  // Show welcome message if no messages yet - use stable constant to prevent re-renders
  const displayMessages = useMemo(
    () => (messages.length === 0 ? WELCOME_MESSAGES : messages),
    [messages]
  );

  // Collapsed state - show only a vertical bar with expand button
  if (isCollapsed) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center bg-card border-l border-border',
          'w-10 h-full',
          className
        )}
        data-testid="agent-chat-panel-collapsed"
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onCollapseChange?.(false)}
          title="Expand Agent Chat"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Bot className="h-5 w-5" />
            <span
              className="text-xs font-medium"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              Agent Chat
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('flex h-full overflow-hidden bg-background', className)}
      data-testid="agent-chat-panel"
    >
      {/* Chat Area - now full width without sidebar */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header - consistent height with other panels */}
        <div className="flex items-center h-10 border-b border-border bg-muted/30">
          {/* Panel title with icon - consistent with other panels */}
          <div className="flex items-center gap-2 px-3">
            <div className="p-1 rounded bg-brand-500/10">
              <Bot className="h-3.5 w-3.5 text-brand-500" />
            </div>
            <span className="text-sm font-medium">Chat</span>
            {isProcessing && (
              <span className="flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500" />
              </span>
            )}
          </div>

          {/* Project Selector - visible dropdown to switch projects */}
          {showProjectSelector && projects.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 px-2 gap-1.5 rounded-md',
                    'text-xs font-medium',
                    'hover:bg-muted/70',
                    'transition-all duration-200',
                    'max-w-[160px]'
                  )}
                >
                  {effectiveProject?.customIconPath ? (
                    <LazyImage
                      src={getAuthenticatedImageUrl(
                        effectiveProject.customIconPath,
                        effectiveProject.path
                      )}
                      alt={effectiveProject.name}
                      className="w-4 h-4 rounded object-cover ring-1 ring-border/50 shrink-0"
                      containerClassName="w-4 h-4 shrink-0"
                      errorIconSize="w-2 h-2"
                    />
                  ) : (
                    (() => {
                      const ProjectIcon = getProjectIcon(effectiveProject?.icon);
                      return <ProjectIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
                    })()
                  )}
                  <span className="truncate">{effectiveProject?.name || 'Select Project'}</span>
                  <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-[200px] max-h-[300px] overflow-y-auto"
              >
                {projects.map((proj) => {
                  const ProjectIcon = getProjectIcon(proj.icon);
                  const isSelected = effectiveProject?.id === proj.id;

                  return (
                    <DropdownMenuItem
                      key={proj.id}
                      onClick={() => onProjectChange?.(proj)}
                      className={cn('cursor-pointer', isSelected && 'bg-primary/10 text-primary')}
                    >
                      <div className="flex items-center gap-2 w-full min-w-0">
                        {proj.customIconPath ? (
                          <LazyImage
                            src={getAuthenticatedImageUrl(proj.customIconPath, proj.path)}
                            alt={proj.name}
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
                        <span className="flex-1 truncate text-sm">{proj.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Agent Header - status info (compact mode) */}
          <div className="flex-1 min-w-0">
            <AgentHeader
              projectName={effectiveProject?.name || 'Project'}
              projectPath={effectiveProject?.path}
              currentSessionId={currentSessionId}
              isConnected={isConnected}
              isProcessing={isProcessing}
              currentTool={currentTool}
              messagesCount={messages.length}
              showSessionManager={false}
              onToggleSessionManager={() => {}}
              onSelectSession={handleSelectSession}
              onClearChat={handleClearChat}
              onProjectChange={onProjectChange}
              showProjectSelector={false}
              selectedProject={effectiveProject}
              compact
            />
          </div>

          {/* Panel collapse button */}
          <div className="flex items-center px-2 border-l border-border h-full">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onCollapseChange?.(true)}
              title="Collapse Agent Chat Panel"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ChatArea
          currentSessionId={currentSessionId}
          messages={displayMessages}
          isProcessing={isProcessing}
          showSessionManager={false}
          scrollContainerRef={scrollContainerRef}
          onScroll={handleScroll}
          onShowSessionManager={() => {}}
          onCreateSession={handleCreateSession}
          onVirtualizerReady={handleVirtualizerReady}
        />

        {/* Input Area */}
        {currentSessionId && (
          <AgentInputArea
            input={input}
            onInputChange={setInput}
            onSend={handleSend}
            onStop={stopExecution}
            modelSelection={modelSelection}
            onModelSelect={setModelSelection}
            isProcessing={isProcessing}
            isConnected={isConnected}
            selectedImages={fileAttachments.selectedImages}
            selectedTextFiles={fileAttachments.selectedTextFiles}
            showImageDropZone={fileAttachments.showImageDropZone}
            isDragOver={fileAttachments.isDragOver}
            onImagesSelected={fileAttachments.handleImagesSelected}
            onToggleImageDropZone={fileAttachments.toggleImageDropZone}
            onRemoveImage={fileAttachments.removeImage}
            onRemoveTextFile={fileAttachments.removeTextFile}
            onClearAllFiles={fileAttachments.clearAllFiles}
            onDragEnter={fileAttachments.handleDragEnter}
            onDragLeave={fileAttachments.handleDragLeave}
            onDragOver={fileAttachments.handleDragOver}
            onDrop={fileAttachments.handleDrop}
            onPaste={fileAttachments.handlePaste}
            serverQueue={serverQueue}
            onRemoveFromQueue={removeFromServerQueue}
            onClearQueue={clearServerQueue}
            inputRef={inputRef}
          />
        )}
      </div>
    </div>
  );
}, arePropsEqual);

export default AgentChatPanel;
