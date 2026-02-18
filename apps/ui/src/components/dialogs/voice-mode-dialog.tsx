import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Mic,
  MicOff,
  Send,
  Square,
  Volume2,
  VolumeX,
  Settings2,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVoiceMode } from '@/hooks/use-voice-mode';
import type { VoiceMessage, VoiceSessionStatus } from '@automaker/types';

interface VoiceModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Voice Mode Dialog - Conversational interface for voice commands
 *
 * Provides:
 * - Push-to-talk or toggle recording
 * - Real-time audio level visualization
 * - Conversation history display
 * - Text input fallback
 * - TTS playback controls
 */
export function VoiceModeDialog({ open, onOpenChange }: VoiceModeDialogProps) {
  const {
    isSessionActive,
    sessionStatus,
    isRecording,
    isProcessing,
    error,
    transcript,
    messages,
    settings,
    audioLevel,
    recordingDuration,
    startSession,
    endSession,
    toggleRecording,
    sendTextCommand,
    stopSpeaking,
    clearError,
  } = useVoiceMode();

  const [textInput, setTextInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Start session when dialog opens
  useEffect(() => {
    if (open && !isSessionActive) {
      startSession();
    }
  }, [open, isSessionActive, startSession]);

  // End session when dialog closes
  const handleClose = useCallback(() => {
    if (isSessionActive) {
      endSession();
    }
    onOpenChange(false);
  }, [isSessionActive, endSession, onOpenChange]);

  // Handle text input submission
  const handleTextSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (textInput.trim() && !isProcessing) {
        sendTextCommand(textInput.trim());
        setTextInput('');
      }
    },
    [textInput, isProcessing, sendTextCommand]
  );

  // Handle keyboard shortcuts within the dialog
  // Note: Global shortcuts (Alt+M for toggle voice mode, Alt+N for recording toggle)
  // are handled by useGlobalVoiceModeShortcut and useGlobalRecordingToggleShortcut
  // in the parent component. This handler only manages dialog-local shortcuts.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      // Skip if a modifier key is pressed (let global shortcuts handle Alt+M, Alt+N, etc.)
      // This prevents conflicts with the global voice mode shortcuts
      if (e.altKey || e.ctrlKey || e.metaKey) {
        return;
      }

      // Space to toggle recording (when not focused on input)
      // This provides a convenient alternative to Alt+N within the dialog
      if (e.code === 'Space' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        e.stopPropagation();
        toggleRecording();
        return;
      }

      // Escape to close - this is a standard dialog pattern
      // Note: Alt+M also closes, but Escape is more discoverable
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
        return;
      }
    };

    // Use capture phase to handle events before they bubble
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [open, toggleRecording, handleClose]);

  // Format recording duration
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Get status message
  const getStatusMessage = (): string => {
    switch (sessionStatus) {
      case 'recording':
        return 'Listening...';
      case 'processing':
        return 'Processing audio...';
      case 'transcribing':
        return 'Transcribing...';
      case 'responding':
        return 'Thinking...';
      case 'speaking':
        return 'Speaking...';
      case 'error':
        return error || 'An error occurred';
      default:
        return 'Ready to listen';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-2xl h-[80vh] flex flex-col p-0 gap-0"
        showCloseButton={false}
        data-voice-mode-dialog="true"
      >
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Mic className="h-5 w-5 text-primary" />
                Voice Mode
              </DialogTitle>
              <DialogDescription className="mt-1">
                Speak or type commands to manage features, run tests, and more.
              </DialogDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Messages area */}
        <ScrollArea className="flex-1 px-6 py-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Mic className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-center">
                Press <kbd className="px-2 py-1 bg-muted rounded text-xs">Alt+N</kbd> or{' '}
                <kbd className="px-2 py-1 bg-muted rounded text-xs">Space</kbd> to start recording.
              </p>
              <p className="text-sm mt-2 text-center max-w-md">
                Try saying: "List all features", "Check status of pending tasks", or "Run the tests"
              </p>
              <p className="text-xs mt-3 text-muted-foreground/70">
                Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Alt+M</kbd> to
                close voice mode
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isProcessing && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">{getStatusMessage()}</span>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Error display */}
        {error && (
          <div className="mx-6 mb-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
            <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={clearError}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        <Separator />

        {/* Recording controls */}
        <div className="px-6 py-4">
          {/* Status indicator panel - shows current activity */}
          {sessionStatus !== 'idle' && !isRecording && (
            <div className="mb-4 flex items-center justify-center">
              <RecordingStateIndicator status={sessionStatus} />
            </div>
          )}

          {/* Audio level indicator - shown when recording */}
          {isRecording && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                <div className="flex items-center gap-2">
                  <RecordingStateIndicator status={sessionStatus} size="sm" />
                  <span>{getStatusMessage()}</span>
                </div>
                <span className="font-mono tabular-nums">{formatDuration(recordingDuration)}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-destructive transition-all duration-75"
                  style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
                />
              </div>
              {/* Audio level dots visualization */}
              <div className="flex items-center justify-center gap-1 mt-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all duration-100',
                      audioLevel > i * 0.2
                        ? 'bg-destructive scale-110'
                        : 'bg-muted-foreground/30 scale-100'
                    )}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Live transcript */}
          {transcript && sessionStatus === 'transcribing' && (
            <div className="mb-4 p-3 bg-muted rounded-lg text-sm italic">"{transcript}"</div>
          )}

          {/* Controls row */}
          <div className="flex items-center gap-3">
            {/* Record button with enhanced visual feedback */}
            <div className="relative">
              {/* Recording ring animation */}
              {isRecording && (
                <div
                  className="absolute inset-0 rounded-full animate-ping bg-destructive/30"
                  aria-hidden="true"
                />
              )}
              <Button
                variant={isRecording ? 'destructive' : 'default'}
                size="lg"
                className={cn(
                  'relative rounded-full h-14 w-14 p-0 transition-all duration-200',
                  isRecording && ['animate-pulse', 'shadow-lg shadow-destructive/40'],
                  !isRecording &&
                    !isProcessing && [
                      'hover:scale-105 hover:shadow-lg hover:shadow-primary/25',
                      'active:scale-95',
                    ]
                )}
                onClick={toggleRecording}
                disabled={isProcessing}
                aria-label={isRecording ? 'Stop recording (Alt+N)' : 'Start recording (Alt+N)'}
                aria-pressed={isRecording}
              >
                {isRecording ? <Square className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </Button>
            </div>

            {/* Text input */}
            <form onSubmit={handleTextSubmit} className="flex-1 flex gap-2">
              <Input
                ref={inputRef}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Or type a command..."
                disabled={isProcessing || isRecording}
                className="flex-1"
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={!textInput.trim() || isProcessing || isRecording}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>

            {/* TTS control */}
            {sessionStatus === 'speaking' && (
              <Button variant="outline" size="icon" onClick={stopSpeaking}>
                <VolumeX className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Keyboard hints */}
          <div className="text-xs text-muted-foreground mt-3 text-center space-y-1">
            <p>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Alt+N</kbd> or{' '}
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Space</kbd> to{' '}
              {isRecording ? 'stop' : 'start'} recording
            </p>
            <p className="text-muted-foreground/70">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Alt+M</kbd> to close voice
              mode
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Message bubble component for conversation display
 */
interface MessageBubbleProps {
  message: VoiceMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        )}
      >
        {/* Command executed indicator */}
        {message.executedCommand && (
          <div className="flex items-center gap-1 text-xs mb-1 opacity-80">
            <CheckCircle2 className="h-3 w-3" />
            <span>Executed: {message.commandName}</span>
          </div>
        )}

        {/* Message content */}
        <p className="whitespace-pre-wrap">{message.content || '...'}</p>

        {/* Timestamp */}
        <p
          className={cn(
            'text-[10px] mt-1',
            isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
          )}
        >
          {new Date(message.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// RecordingStateIndicator - Visual indicator for voice session status
// ============================================================================

interface RecordingStateIndicatorProps {
  /** Current voice session status */
  status: VoiceSessionStatus;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * RecordingStateIndicator - Visual feedback for the current recording/processing state
 *
 * Provides clear visual feedback for the current state of voice interaction:
 * - Recording: Red pulsing indicator with radio icon
 * - Processing/Transcribing: Animated dots
 * - Responding: Bouncing dots (AI thinking)
 * - Speaking: Sound wave animation
 * - Error: Red alert icon
 * - Idle: Green ready indicator
 */
function RecordingStateIndicator({ status, size = 'md' }: RecordingStateIndicatorProps) {
  const iconSize = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
  const containerSize = size === 'sm' ? 'h-6 w-6' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';

  switch (status) {
    case 'recording':
      return (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-destructive/20 animate-pulse',
            containerSize
          )}
          role="status"
          aria-label="Recording"
        >
          <Radio className={cn(iconSize, 'text-destructive')} />
        </div>
      );

    case 'processing':
    case 'transcribing':
      return (
        <div
          className="flex items-center gap-1"
          role="status"
          aria-label={status === 'processing' ? 'Processing audio' : 'Transcribing'}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'w-2 h-2 rounded-full bg-primary animate-pulse',
                size === 'sm' && 'w-1.5 h-1.5'
              )}
              style={{
                animationDelay: `${i * 200}ms`,
                animationDuration: '1s',
              }}
            />
          ))}
        </div>
      );

    case 'responding':
      return (
        <div className="flex items-center gap-1" role="status" aria-label="AI is thinking">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                'w-2.5 h-2.5 rounded-full bg-amber-500 animate-bounce',
                size === 'sm' && 'w-2 h-2'
              )}
              style={{
                animationDelay: `${i * 100}ms`,
                animationDuration: '0.6s',
              }}
            />
          ))}
        </div>
      );

    case 'speaking':
      return (
        <div className="flex items-center gap-1" role="status" aria-label="Speaking response">
          <Volume2 className={cn(iconSize, 'text-green-500 mr-1')} />
          {/* Sound wave bars */}
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn('w-1 bg-green-500 rounded-full', size === 'sm' ? 'h-2' : 'h-3')}
              style={{
                animation: 'speaking-wave 0.5s ease-in-out infinite',
                animationDelay: `${i * 150}ms`,
              }}
            />
          ))}
        </div>
      );

    case 'error':
      return (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-destructive/10',
            containerSize
          )}
          role="status"
          aria-label="Error occurred"
        >
          <AlertCircle className={cn(iconSize, 'text-destructive')} />
        </div>
      );

    case 'idle':
    default:
      return (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-green-500/10',
            containerSize
          )}
          role="status"
          aria-label="Ready to listen"
        >
          <div
            className={cn('rounded-full bg-green-500', size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5')}
          />
        </div>
      );
  }
}
