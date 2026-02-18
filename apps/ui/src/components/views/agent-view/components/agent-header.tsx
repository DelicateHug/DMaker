import { Bot, PanelLeftClose, PanelLeft, Wrench, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SessionSelector } from './session-selector';
import type { Project } from '@/lib/electron';

interface AgentHeaderProps {
  projectName: string;
  projectPath?: string;
  currentSessionId: string | null;
  isConnected: boolean;
  isProcessing: boolean;
  currentTool: string | null;
  messagesCount: number;
  showSessionManager: boolean;
  onToggleSessionManager: () => void;
  onSelectSession: (sessionId: string | null) => void;
  onClearChat: () => void;
  /** Compact mode for embedded use in unified layout (hides title, smaller padding) */
  compact?: boolean;
  /** Callback when user selects a different project from the session selector */
  onProjectChange?: (project: Project) => void;
  /** Whether to show the project selector in the session dropdown */
  showProjectSelector?: boolean;
  /** The currently selected project for independent mode (passed to SessionSelector) */
  selectedProject?: Project | null;
}

export function AgentHeader({
  projectName,
  projectPath,
  currentSessionId,
  isConnected,
  isProcessing,
  currentTool,
  messagesCount,
  showSessionManager,
  onToggleSessionManager,
  onSelectSession,
  onClearChat,
  compact = false,
  onProjectChange,
  showProjectSelector = false,
  selectedProject,
}: AgentHeaderProps) {
  // Compact mode: optimized for unified layout - shows status and actions inline
  if (compact) {
    return (
      <div className="flex items-center justify-end gap-2.5">
        {/* Connection status indicator */}
        {currentSessionId && !isConnected && (
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full',
              'text-[10px] text-amber-600 dark:text-amber-400 font-medium',
              'bg-amber-500/10 ring-1 ring-amber-500/20',
              'animate-pulse'
            )}
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Connecting...</span>
          </div>
        )}

        {/* Current tool indicator */}
        {currentTool && (
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full',
              'text-[10px] text-muted-foreground font-medium',
              'bg-muted/60 backdrop-blur-sm',
              'border border-border/50 shadow-sm',
              'transition-all duration-200'
            )}
          >
            <div className="p-0.5 rounded-md bg-primary/10">
              <Wrench className="w-2.5 h-2.5 text-primary" />
            </div>
            <span className="truncate max-w-[100px]">{currentTool}</span>
          </div>
        )}

        {/* Session Selector - to the left of clear button */}
        {projectPath && (
          <SessionSelector
            currentSessionId={currentSessionId}
            onSelectSession={onSelectSession}
            projectPath={projectPath}
            isCurrentSessionThinking={isProcessing}
            onProjectChange={onProjectChange}
            showProjectSelector={showProjectSelector}
            selectedProject={selectedProject}
          />
        )}

        {/* Clear chat button */}
        {currentSessionId && messagesCount > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClearChat}
            disabled={isProcessing}
            className={cn(
              'h-7 w-7 rounded-lg',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-muted/70 hover:shadow-sm',
              'transition-all duration-200',
              'hover:scale-105 active:scale-95'
            )}
            title="Clear chat history"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    );
  }

  // Full mode: original header with title
  return (
    <div
      className={cn(
        'flex items-center justify-between px-6 py-4',
        'border-b border-border/40',
        'bg-gradient-to-b from-card/80 to-card/50 backdrop-blur-sm',
        'shadow-sm'
      )}
    >
      <div className="flex items-center gap-4">
        {/* Enhanced avatar with gradient matching other components */}
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            'bg-gradient-to-br from-primary/15 to-primary/5',
            'ring-1 ring-primary/25',
            'shadow-sm shadow-primary/10',
            'transition-transform duration-200 hover:scale-105'
          )}
        >
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div className="space-y-0.5">
          <h1 className="text-lg font-semibold tracking-tight text-foreground/95">AI Agent</h1>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground/80 font-medium">{projectName}</p>
            {currentSessionId && !isConnected && (
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2 py-0.5 rounded-full',
                  'text-[10px] text-amber-600 dark:text-amber-400 font-medium',
                  'bg-amber-500/10 ring-1 ring-amber-500/20',
                  'animate-pulse'
                )}
              >
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                <span>Connecting...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status indicators & actions */}
      <div className="flex items-center gap-2.5">
        {/* Session Selector */}
        {projectPath && (
          <SessionSelector
            currentSessionId={currentSessionId}
            onSelectSession={onSelectSession}
            projectPath={projectPath}
            isCurrentSessionThinking={isProcessing}
            onProjectChange={onProjectChange}
            showProjectSelector={showProjectSelector}
            selectedProject={selectedProject}
          />
        )}

        {currentTool && (
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full',
              'text-xs text-muted-foreground font-medium',
              'bg-muted/60 backdrop-blur-sm',
              'border border-border/50 shadow-sm',
              'transition-all duration-200'
            )}
          >
            <div className="p-1 rounded-md bg-primary/10">
              <Wrench className="w-3 h-3 text-primary" />
            </div>
            <span className="truncate max-w-[150px]">{currentTool}</span>
          </div>
        )}
        {currentSessionId && messagesCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearChat}
            disabled={isProcessing}
            className={cn(
              'h-9 px-3 rounded-lg',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-muted/70 hover:shadow-sm',
              'transition-all duration-200',
              'hover:scale-[1.02] active:scale-[0.98]'
            )}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
