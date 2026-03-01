import { GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

export function WorktreesSection() {
  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <GitBranch className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Worktrees</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Git worktree isolation for feature development.
        </p>
      </div>
      <div className="p-6 space-y-5">
        <div className="rounded-xl border border-border/30 bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">
            Every feature runs in an isolated git worktree with an auto-generated branch. When a
            feature is marked as completed, its branch is automatically merged into the project's
            default branch. Project-specific worktree preferences (init script, delete branch
            behavior) can be configured in each project's settings via the sidebar.
          </p>
        </div>
      </div>
    </div>
  );
}
