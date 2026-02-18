import { useCallback } from 'react';
import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';

interface VoiceButtonProps {
  className?: string;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * Voice Mode Toggle Button
 *
 * A button that toggles the floating voice widget visibility
 * for hands-free interaction with the application.
 *
 * Keyboard shortcut: Alt+M (global, works even when typing)
 */
export function VoiceButton({ className, variant = 'ghost', size = 'icon' }: VoiceButtonProps) {
  const { voiceSessionActive, voiceSettings, voiceWidgetVisible, toggleVoiceWidget } = useAppStore(
    useShallow((state) => ({
      voiceSessionActive: state.voiceSessionActive,
      voiceSettings: state.voiceSettings,
      voiceWidgetVisible: state.voiceWidgetVisible,
      toggleVoiceWidget: state.toggleVoiceWidget,
    }))
  );

  const handleClick = useCallback(() => {
    toggleVoiceWidget();
  }, [toggleVoiceWidget]);

  // Don't render if voice mode is disabled
  if (!voiceSettings.enabled) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size={size}
          onClick={handleClick}
          className={cn(
            'relative',
            voiceSessionActive && 'text-primary',
            voiceWidgetVisible && 'bg-accent',
            className
          )}
          aria-pressed={voiceWidgetVisible}
          aria-label={voiceWidgetVisible ? 'Hide voice widget' : 'Show voice widget'}
        >
          <Mic className="h-4 w-4" />
          {/* Active indicator - shows when recording/session is active */}
          {voiceSessionActive && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-primary rounded-full animate-pulse" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Voice Mode (Alt+M)</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Hook for controlling the voice widget programmatically
 *
 * @deprecated Use the Zustand store actions directly:
 * - toggleVoiceWidget()
 * - showVoiceWidget()
 * - hideVoiceWidget()
 * - setVoiceWidgetVisible(visible)
 */
export function useVoiceWidget() {
  const {
    voiceWidgetVisible,
    toggleVoiceWidget,
    showVoiceWidget,
    hideVoiceWidget,
    setVoiceWidgetVisible,
  } = useAppStore(
    useShallow((state) => ({
      voiceWidgetVisible: state.voiceWidgetVisible,
      toggleVoiceWidget: state.toggleVoiceWidget,
      showVoiceWidget: state.showVoiceWidget,
      hideVoiceWidget: state.hideVoiceWidget,
      setVoiceWidgetVisible: state.setVoiceWidgetVisible,
    }))
  );

  return {
    isVisible: voiceWidgetVisible,
    setVisible: setVoiceWidgetVisible,
    show: showVoiceWidget,
    hide: hideVoiceWidget,
    toggle: toggleVoiceWidget,
  };
}

/**
 * @deprecated Use useVoiceWidget instead
 */
export const useVoiceDialog = useVoiceWidget;
