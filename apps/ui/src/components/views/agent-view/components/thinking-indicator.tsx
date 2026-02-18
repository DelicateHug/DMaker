import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThinkingIndicator() {
  return (
    <div className="flex gap-3 max-w-3xl">
      {/* Avatar - matching assistant message avatar styling */}
      <div
        className={cn(
          'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
          'transition-all duration-200',
          'bg-gradient-to-br from-primary/15 to-primary/5',
          'ring-1 ring-primary/25',
          'shadow-sm shadow-primary/5'
        )}
      >
        <Bot className="w-4 h-4 text-primary" />
      </div>

      {/* Thinking bubble - matching assistant message styling */}
      <div
        className={cn(
          'rounded-2xl px-4 py-3',
          'transition-all duration-200',
          // Matching assistant bubble background and effects
          'bg-card/95 backdrop-blur-sm',
          'border border-border/60',
          'shadow-sm shadow-black/5',
          'ring-1 ring-border/30',
          // Left accent for visual distinction
          'border-l-2 border-l-primary/40'
        )}
      >
        <div className="flex items-center gap-3">
          {/* Animated dots with staggered bounce effect */}
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                'bg-gradient-to-br from-primary to-primary/70',
                'animate-bounce shadow-sm shadow-primary/30'
              )}
              style={{ animationDelay: '0ms', animationDuration: '0.8s' }}
            />
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                'bg-gradient-to-br from-primary to-primary/70',
                'animate-bounce shadow-sm shadow-primary/30'
              )}
              style={{ animationDelay: '150ms', animationDuration: '0.8s' }}
            />
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                'bg-gradient-to-br from-primary to-primary/70',
                'animate-bounce shadow-sm shadow-primary/30'
              )}
              style={{ animationDelay: '300ms', animationDuration: '0.8s' }}
            />
          </div>
          {/* Text with refined styling */}
          <span className="text-sm text-muted-foreground/80 font-medium tracking-tight">
            Thinking...
          </span>
        </div>
      </div>
    </div>
  );
}
