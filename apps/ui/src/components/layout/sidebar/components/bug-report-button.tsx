import { Bug } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BugReportButtonProps } from '../types';

export function BugReportButton({ sidebarExpanded, onClick }: BugReportButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'titlebar-no-drag px-3 py-2.5 rounded-xl',
        'text-muted-foreground hover:text-foreground hover:bg-accent/80',
        'border border-transparent hover:border-border/40',
        'transition-all duration-200 ease-out',
        'hover:scale-[1.02] active:scale-[0.97]',
        sidebarExpanded && 'absolute right-3'
      )}
      title="Report Bug / Feature Request"
      data-testid={sidebarExpanded ? 'bug-report-link' : 'bug-report-link-collapsed'}
    >
      <Bug className="w-4 h-4" />
    </button>
  );
}
