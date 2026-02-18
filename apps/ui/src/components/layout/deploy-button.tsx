import { useCallback } from 'react';
import { Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useBoardControlsStore } from '@/store/board-controls-store';

/**
 * DeployButton - Simplified deploy button for the top navigation bar.
 *
 * Instead of containing inline deploy popover logic (environment tabs,
 * script configuration, deploy triggers), this button simply opens or
 * focuses the DeployPanel in the board view via the board controls store.
 *
 * The full deploy experience (script listing, environment selection,
 * execution, history, streaming output) lives in the DeployPanel component.
 */
export interface DeployButtonProps {
  className?: string;
}

export function DeployButton({ className }: DeployButtonProps) {
  const isDeployPanelCollapsed = useBoardControlsStore((s) => s.isDeployPanelCollapsed);
  const onToggleDeployPanel = useBoardControlsStore((s) => s.onToggleDeployPanel);
  const onOpenDeployPanel = useBoardControlsStore((s) => s.onOpenDeployPanel);

  const handleClick = useCallback(() => {
    // If there's an explicit open handler, use it (expands + optionally focuses)
    if (onOpenDeployPanel) {
      onOpenDeployPanel();
      return;
    }
    // Fallback: toggle the panel via the toggle callback
    if (onToggleDeployPanel) {
      onToggleDeployPanel();
    }
  }, [onOpenDeployPanel, onToggleDeployPanel]);

  const isPanelOpen = !isDeployPanelCollapsed;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={cn(
        'flex items-center gap-2 h-8 px-3',
        'hover:bg-accent/50 transition-colors duration-150',
        'font-medium text-sm',
        isPanelOpen && 'bg-brand-500/10 text-brand-500',
        className
      )}
      data-testid="deploy-button"
      title={isPanelOpen ? 'Focus Deploy Panel' : 'Open Deploy Panel'}
    >
      {/* Deploy Icon */}
      <div
        className={cn(
          'w-5 h-5 rounded flex items-center justify-center',
          isPanelOpen ? 'bg-brand-500/20' : 'bg-muted'
        )}
      >
        <Rocket
          className={cn('w-3.5 h-3.5', isPanelOpen ? 'text-brand-500' : 'text-muted-foreground')}
        />
      </div>

      {/* Label */}
      <span>Deploy</span>
    </Button>
  );
}
