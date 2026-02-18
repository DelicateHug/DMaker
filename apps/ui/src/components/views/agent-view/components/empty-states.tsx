import { Sparkles, Bot, Plus, FolderOpen, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function NoProjectState() {
  return (
    <div
      className={cn(
        'flex-1 flex items-center justify-center',
        'bg-gradient-to-b from-background via-background to-muted/20'
      )}
      data-testid="agent-view-no-project"
    >
      <div className="text-center max-w-md px-6">
        {/* Decorative background glow */}
        <div className="relative">
          <div className="absolute inset-0 blur-3xl bg-primary/5 rounded-full scale-150" />

          {/* Icon container with enhanced styling */}
          <div
            className={cn(
              'relative w-20 h-20 rounded-2xl mx-auto mb-8',
              'bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5',
              'ring-1 ring-primary/20',
              'shadow-lg shadow-primary/10',
              'flex items-center justify-center',
              'transition-transform duration-300 hover:scale-105',
              'group'
            )}
          >
            {/* Inner glow effect */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-transparent to-white/10" />
            <FolderOpen
              className={cn(
                'w-9 h-9 text-primary relative z-10',
                'transition-transform duration-300 group-hover:scale-110'
              )}
            />

            {/* Sparkle accent */}
            <div
              className={cn(
                'absolute -top-1.5 -right-1.5 w-6 h-6 rounded-lg',
                'bg-gradient-to-br from-primary to-primary/80',
                'shadow-md shadow-primary/30',
                'flex items-center justify-center',
                'ring-2 ring-background'
              )}
            >
              <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
          </div>
        </div>

        {/* Text content with refined typography */}
        <h2 className={cn('text-xl font-semibold mb-3', 'text-foreground tracking-tight')}>
          No Project Selected
        </h2>
        <p className={cn('text-muted-foreground leading-relaxed', 'text-[15px]')}>
          Open or create a project to start working with the AI agent.
        </p>

        {/* Subtle hint text */}
        <p
          className={cn(
            'text-xs text-muted-foreground/60 mt-4',
            'flex items-center justify-center gap-1.5'
          )}
        >
          <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/40" />
          Your conversations will appear here
          <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/40" />
        </p>
      </div>
    </div>
  );
}

interface NoSessionStateProps {
  showSessionManager: boolean;
  onShowSessionManager: () => void;
  /** Optional callback to create a new session directly */
  onCreateSession?: () => void;
}

export function NoSessionState({
  showSessionManager,
  onShowSessionManager,
  onCreateSession,
}: NoSessionStateProps) {
  // Use onCreateSession if available (new flow), otherwise fall back to onShowSessionManager (legacy)
  const handleAction = onCreateSession || onShowSessionManager;

  return (
    <div
      className={cn(
        'flex-1 flex items-center justify-center',
        'bg-gradient-to-b from-background/80 via-background/60 to-muted/10',
        'backdrop-blur-sm'
      )}
      data-testid="no-session-placeholder"
    >
      <div className="text-center max-w-sm px-6">
        {/* Decorative background glow */}
        <div className="relative">
          <div className="absolute inset-0 blur-3xl bg-primary/3 rounded-full scale-125" />

          {/* Icon container with gradient styling */}
          <div
            className={cn(
              'relative w-16 h-16 rounded-2xl mx-auto mb-6',
              'bg-gradient-to-br from-muted/80 via-muted/60 to-muted/40',
              'ring-1 ring-border/50',
              'shadow-md shadow-black/5',
              'flex items-center justify-center',
              'transition-all duration-300 hover:scale-105 hover:shadow-lg',
              'group'
            )}
          >
            {/* Subtle inner highlight */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-transparent to-white/5" />
            <Bot
              className={cn(
                'w-8 h-8 text-muted-foreground/70 relative z-10',
                'transition-all duration-300 group-hover:text-primary group-hover:scale-110'
              )}
            />

            {/* Message accent bubble */}
            <div
              className={cn(
                'absolute -bottom-1 -right-1 w-5 h-5 rounded-lg',
                'bg-gradient-to-br from-muted to-muted/80',
                'shadow-sm',
                'flex items-center justify-center',
                'ring-2 ring-background',
                'transition-colors duration-300 group-hover:from-primary group-hover:to-primary/80'
              )}
            >
              <MessageSquare
                className={cn(
                  'w-2.5 h-2.5 text-muted-foreground/60',
                  'transition-colors duration-300 group-hover:text-primary-foreground'
                )}
              />
            </div>
          </div>
        </div>

        {/* Text content */}
        <h2 className={cn('text-base font-semibold mb-2.5', 'text-foreground tracking-tight')}>
          No Session Selected
        </h2>
        <p className={cn('text-sm text-muted-foreground leading-relaxed mb-6')}>
          {onCreateSession
            ? 'Start a new chat or select one from the dropdown above'
            : 'Open the sessions panel to select or create a session'}
        </p>

        {/* Enhanced button - Start New Chat */}
        <Button
          onClick={handleAction}
          variant="outline"
          size="sm"
          className={cn(
            'gap-2.5 px-5 h-10',
            'rounded-xl',
            'border-border/60 bg-card/50',
            'shadow-sm hover:shadow-md',
            'hover:bg-card hover:border-primary/30',
            'transition-all duration-200',
            'hover:scale-[1.02] active:scale-[0.98]',
            'group/btn'
          )}
        >
          <Plus
            className={cn(
              'w-4 h-4 text-muted-foreground',
              'transition-colors duration-200 group-hover/btn:text-primary'
            )}
          />
          <span className="font-medium">Start New Chat</span>
        </Button>
      </div>
    </div>
  );
}
