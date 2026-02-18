import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Mic,
  Minus,
  ChevronUp,
  CheckCircle2,
  Loader2,
  Square,
  Volume2,
  AlertCircle,
  Radio,
  GripVertical,
} from 'lucide-react';
import type { VoiceMessage } from '@automaker/types';
import type { VoiceSessionStatus } from '@automaker/types';

/**
 * VoiceWidget - Floating voice chat widget for non-intrusive voice commands
 *
 * Features:
 * - Fixed bottom-right positioning (coworking style, like support chat widgets)
 * - Collapsed/expanded states with smooth transitions
 * - Minimize button to collapse to compact view
 * - Message list display with auto-scroll (T003)
 * - Recording controls with toggle button (T004)
 * - Audio level indicator with visual feedback (T004)
 * - Recording duration display (T004)
 * - Error display with dismiss button (T004)
 * - Status indicators with visual feedback (T005)
 *   - Recording: Red pulsing indicator with microphone icon
 *   - Processing/Transcribing/Responding: Spinning loader
 *   - Speaking: Animated sound wave indicator
 *   - Error: Red alert indicator
 *   - Idle: Green ready indicator
 * - Visual feedback animations (T013)
 *   - Slide-in animation when widget appears
 *   - Expand/collapse animations for content area
 *   - Enhanced recording pulse with glow and ring effects
 * - Drag/reposition capability (T014)
 *   - Drag handle in header allows repositioning
 *   - Position is persisted in Zustand store
 *   - Constrained to viewport bounds
 *   - Double-click on drag handle resets to default position
 *
 * This component replaces the full-screen VoiceModeDialog with a less intrusive
 * floating panel that allows users to continue working while using voice commands.
 */

interface VoiceWidgetProps {
  /** Whether the widget is visible */
  isVisible?: boolean;
  /** Initial expanded state (default: true) */
  defaultExpanded?: boolean;
  /** Controlled expanded state (optional) */
  isExpanded?: boolean;
  /** Callback when expanded state changes */
  onExpandedChange?: (expanded: boolean) => void;
  /** Voice conversation messages */
  messages?: VoiceMessage[];
  /** Whether the assistant is processing a message */
  isProcessing?: boolean;
  /** Current status text to display while processing */
  statusText?: string;
  /** Additional class names */
  className?: string;
  // ========== Recording Controls Props (T004) ==========
  /** Whether recording is currently active */
  isRecording?: boolean;
  /** Current audio level (0-1) for visualization */
  audioLevel?: number;
  /** Recording duration in milliseconds */
  recordingDurationMs?: number;
  /** Current voice session status */
  sessionStatus?: VoiceSessionStatus;
  /** Callback when record button is clicked */
  onToggleRecording?: () => void;
  /** Error message to display */
  error?: string | null;
  /** Callback to clear the error */
  onClearError?: () => void;
  // ========== Drag/Reposition Props (T014) ==========
  /** Custom position for the widget (null = default bottom-right) */
  position?: { x: number; y: number } | null;
  /** Callback when widget position changes via drag */
  onPositionChange?: (position: { x: number; y: number } | null) => void;
}

export function VoiceWidget({
  isVisible = true,
  defaultExpanded = true,
  isExpanded: controlledExpanded,
  onExpandedChange,
  messages = [],
  isProcessing = false,
  statusText = 'Thinking...',
  className,
  // Recording controls props (T004)
  isRecording = false,
  audioLevel = 0,
  recordingDurationMs = 0,
  sessionStatus = 'idle',
  onToggleRecording,
  error = null,
  onClearError,
  // Drag/reposition props (T014)
  position = null,
  onPositionChange,
}: VoiceWidgetProps) {
  // Internal state for uncontrolled mode
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);

  // Ref for message list auto-scroll
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Track if user has scrolled up manually
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

  // Determine if we're in controlled mode
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : internalExpanded;

  // Track animation states (T013)
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false);
  const [expandAnimationClass, setExpandAnimationClass] = useState<string | null>(null);
  const prevExpandedRef = useRef(expanded);

  // Drag state (T014)
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    widgetX: number;
    widgetY: number;
  } | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  // Toggle expanded state
  const toggleExpanded = useCallback(() => {
    const newExpanded = !expanded;
    if (!isControlled) {
      setInternalExpanded(newExpanded);
    }
    onExpandedChange?.(newExpanded);
  }, [expanded, isControlled, onExpandedChange]);

  // ========== Drag Handlers (T014) ==========
  // Start dragging when mouse down on drag handle
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Get current widget position
    const widget = widgetRef.current;
    if (!widget) return;

    const rect = widget.getBoundingClientRect();
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      widgetX: rect.left,
      widgetY: rect.top,
    };
    setIsDragging(true);
  }, []);

  // Handle mouse move during drag
  const handleDragMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      let newX = dragStartRef.current.widgetX + deltaX;
      let newY = dragStartRef.current.widgetY + deltaY;

      // Constrain to viewport bounds
      const widget = widgetRef.current;
      if (widget) {
        const widgetWidth = widget.offsetWidth;
        const widgetHeight = widget.offsetHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Keep at least 100px of widget visible
        const minVisible = 100;
        newX = Math.max(-widgetWidth + minVisible, Math.min(newX, viewportWidth - minVisible));
        newY = Math.max(0, Math.min(newY, viewportHeight - minVisible));
      }

      onPositionChange?.({ x: newX, y: newY });
    },
    [isDragging, onPositionChange]
  );

  // End dragging
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  // Reset position to default (bottom-right corner)
  const handleResetPosition = useCallback(() => {
    onPositionChange?.(null);
  }, [onPositionChange]);

  // Add/remove global mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      // Prevent text selection during drag
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
    }

    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isAutoScrollEnabled && messagesEndRef.current && expanded) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isProcessing, isAutoScrollEnabled, expanded]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    // If user is within 50px of bottom, re-enable auto-scroll
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAutoScrollEnabled(isNearBottom);
  }, []);

  // Handle slide-in animation on first visibility (T013)
  useEffect(() => {
    if (isVisible && !hasAnimatedIn) {
      setHasAnimatedIn(true);
    }
  }, [isVisible, hasAnimatedIn]);

  // Handle expand/collapse animation (T013)
  useEffect(() => {
    if (prevExpandedRef.current !== expanded) {
      // Trigger appropriate animation
      setExpandAnimationClass(
        expanded ? 'animate-voice-widget-expand' : 'animate-voice-widget-collapse'
      );

      // Clear animation class after animation completes
      const timeout = setTimeout(() => {
        setExpandAnimationClass(null);
      }, 300); // Match animation duration

      prevExpandedRef.current = expanded;
      return () => clearTimeout(timeout);
    }
  }, [expanded]);

  // Format recording duration (T004)
  const formatDuration = useCallback((ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  // Get status message based on session status (T004)
  const getStatusMessage = useCallback((): string => {
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
  }, [sessionStatus, error]);

  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  // Compute position style (T014)
  const positionStyle: React.CSSProperties = position
    ? {
        left: position.x,
        top: position.y,
        right: 'auto',
        bottom: 'auto',
      }
    : {};

  return (
    <div
      ref={widgetRef}
      className={cn(
        // Fixed positioning - default bottom-right, or custom position
        'fixed z-50',
        // Default position when not dragged
        !position && 'bottom-4 right-4',
        // Widget dimensions - compact size for floating widget
        'w-80',
        // Card styling matching the codebase patterns
        'bg-card text-card-foreground',
        'rounded-xl border border-border/50 backdrop-blur-xl',
        // Shadow for floating effect
        'shadow-2xl shadow-black/20',
        // Smooth transitions for expand/collapse animations (disable during drag)
        !isDragging && 'transition-all duration-300 ease-in-out',
        // Slide-in animation on first appearance (T013) - only when not dragged
        hasAnimatedIn && !position && 'animate-voice-widget-slide-in',
        // Recording state glow effect (T013)
        isRecording && 'shadow-destructive/30',
        // Dragging state
        isDragging && 'cursor-grabbing select-none',
        className
      )}
      style={positionStyle}
      role="complementary"
      aria-label="Voice command widget"
      aria-expanded={expanded}
    >
      {/* Widget Header - Always visible */}
      <div
        className={cn(
          'flex items-center justify-between px-4 py-3',
          expanded && 'border-b border-border/30'
        )}
      >
        {/* Drag Handle (T014) */}
        <div
          className={cn(
            'flex items-center justify-center',
            'w-6 h-8 -ml-2 mr-1',
            'cursor-grab active:cursor-grabbing',
            'text-muted-foreground/50 hover:text-muted-foreground',
            'transition-colors duration-150',
            'touch-none select-none',
            isDragging && 'cursor-grabbing text-muted-foreground'
          )}
          onMouseDown={handleDragStart}
          onDoubleClick={handleResetPosition}
          role="slider"
          aria-label="Drag to reposition widget. Double-click to reset position."
          title="Drag to move, double-click to reset"
          tabIndex={0}
          onKeyDown={(e) => {
            // Allow keyboard-based position adjustment
            const step = e.shiftKey ? 50 : 10;
            const widget = widgetRef.current;
            if (!widget) return;

            const rect = widget.getBoundingClientRect();
            let newPos: { x: number; y: number } | null = null;

            switch (e.key) {
              case 'ArrowLeft':
                newPos = { x: (position?.x ?? rect.left) - step, y: position?.y ?? rect.top };
                break;
              case 'ArrowRight':
                newPos = { x: (position?.x ?? rect.left) + step, y: position?.y ?? rect.top };
                break;
              case 'ArrowUp':
                newPos = { x: position?.x ?? rect.left, y: (position?.y ?? rect.top) - step };
                break;
              case 'ArrowDown':
                newPos = { x: position?.x ?? rect.left, y: (position?.y ?? rect.top) + step };
                break;
              case 'Home':
              case 'Escape':
                // Reset to default position
                e.preventDefault();
                handleResetPosition();
                return;
            }

            if (newPos) {
              e.preventDefault();
              // Constrain to viewport
              const viewportWidth = window.innerWidth;
              const viewportHeight = window.innerHeight;
              const minVisible = 100;
              newPos.x = Math.max(
                -widget.offsetWidth + minVisible,
                Math.min(newPos.x, viewportWidth - minVisible)
              );
              newPos.y = Math.max(0, Math.min(newPos.y, viewportHeight - minVisible));
              onPositionChange?.(newPos);
            }
          }}
        >
          <GripVertical className="w-4 h-4" />
        </div>

        <div
          className={cn(
            'flex items-center gap-2',
            // Make header clickable in collapsed mode to expand
            !expanded && 'cursor-pointer flex-1'
          )}
          onClick={!expanded ? toggleExpanded : undefined}
          role={!expanded ? 'button' : undefined}
          tabIndex={!expanded ? 0 : undefined}
          onKeyDown={
            !expanded
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleExpanded();
                  }
                }
              : undefined
          }
          aria-label={!expanded ? 'Expand voice widget' : undefined}
        >
          {/* Status Indicator Icon (T005) */}
          <StatusIndicator status={sessionStatus} size="lg" />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Voice Mode</h3>
              {/* Compact status badge for collapsed state (T005) */}
              {!expanded && sessionStatus !== 'idle' && <StatusBadge status={sessionStatus} />}
            </div>
            {expanded && <p className="text-xs text-muted-foreground">{getStatusMessage()}</p>}
          </div>
        </div>

        {/* Minimize/Expand button */}
        <button
          type="button"
          onClick={toggleExpanded}
          className={cn(
            'flex items-center justify-center',
            'w-7 h-7 rounded-md',
            'text-muted-foreground',
            'hover:bg-accent hover:text-accent-foreground',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background'
          )}
          aria-label={expanded ? 'Minimize voice widget' : 'Expand voice widget'}
          title={expanded ? 'Minimize' : 'Expand'}
        >
          {expanded ? <Minus className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Collapsible Content Area */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0',
          // Expand/collapse animation (T013)
          expandAnimationClass
        )}
        aria-hidden={!expanded}
      >
        {/* Message List Area */}
        <div
          ref={messagesContainerRef}
          className="h-48 overflow-y-auto px-4 py-3 scroll-smooth"
          onScroll={handleScroll}
          data-testid="voice-message-list"
        >
          {messages.length === 0 ? (
            // Empty state - show instructions
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <Mic className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">
                Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Alt+N</kbd>{' '}
                to start recording
              </p>
              <p className="text-xs mt-1 text-muted-foreground/70">
                Or click the microphone button
              </p>
            </div>
          ) : (
            // Message list
            <div className="space-y-3">
              {messages.map((message) => (
                <VoiceMessageBubble key={message.id} message={message} />
              ))}

              {/* Processing indicator */}
              {isProcessing && (
                <div className="flex items-center gap-2 text-muted-foreground py-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-xs">{statusText}</span>
                </div>
              )}

              {/* Invisible scroll anchor */}
              <div ref={messagesEndRef} aria-hidden="true" />
            </div>
          )}
        </div>

        {/* Widget Footer - Recording controls (T004) and Status Indicators (T005) */}
        <div className="px-4 py-3 border-t border-border/30 bg-secondary/5">
          {/* Error display */}
          {error && (
            <div className="mb-3 p-2 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive">
              <span className="text-xs flex-1 truncate">{error}</span>
              {onClearError && (
                <button
                  type="button"
                  onClick={onClearError}
                  className="p-1 hover:bg-destructive/20 rounded transition-colors"
                  aria-label="Dismiss error"
                >
                  <Minus className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {/* Status indicator panel - shows current activity (T005) */}
          {sessionStatus !== 'idle' && sessionStatus !== 'error' && (
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <div className="flex items-center gap-2">
                  <StatusIndicator status={sessionStatus} size="sm" showLabel />
                </div>
                {/* Show duration when recording */}
                {isRecording && (
                  <span className="font-mono tabular-nums">
                    {formatDuration(recordingDurationMs)}
                  </span>
                )}
              </div>

              {/* Audio level bar - shown when recording */}
              {isRecording && (
                <>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-75',
                        'bg-gradient-to-r from-destructive via-destructive to-destructive/80'
                      )}
                      style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
                      role="meter"
                      aria-label="Audio input level"
                      aria-valuenow={Math.round(audioLevel * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                  {/* Visual feedback dots for audio level */}
                  <div className="flex items-center justify-center gap-1 mt-2">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          'w-1.5 h-1.5 rounded-full transition-all duration-100',
                          audioLevel > i * 0.2
                            ? 'bg-destructive scale-110'
                            : 'bg-muted-foreground/30 scale-100'
                        )}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Processing/Transcribing animation (T005) */}
              {(sessionStatus === 'processing' || sessionStatus === 'transcribing') && (
                <div className="flex items-center justify-center gap-1 py-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={cn('w-1.5 h-1.5 rounded-full bg-primary', 'animate-pulse')}
                      style={{
                        animationDelay: `${i * 200}ms`,
                        animationDuration: '1s',
                      }}
                      aria-hidden="true"
                    />
                  ))}
                </div>
              )}

              {/* AI Responding animation (T005) */}
              {sessionStatus === 'responding' && (
                <div className="flex items-center justify-center gap-1 py-2">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={cn('w-2 h-2 rounded-full bg-amber-500', 'animate-bounce')}
                      style={{
                        animationDelay: `${i * 100}ms`,
                        animationDuration: '0.6s',
                      }}
                      aria-hidden="true"
                    />
                  ))}
                </div>
              )}

              {/* Speaking indicator (T005) */}
              {sessionStatus === 'speaking' && (
                <div className="flex items-center justify-center gap-1 py-2">
                  <Volume2 className="w-4 h-4 text-green-500 mr-1" />
                  <SpeakingWaveIndicator size="lg" />
                </div>
              )}
            </div>
          )}

          {/* Recording button with enhanced animations (T013) */}
          <div className="flex items-center justify-center">
            <div className="relative">
              {/* Recording ring animation container (T013) */}
              {isRecording && (
                <div className="absolute inset-0 voice-recording-ring" aria-hidden="true" />
              )}
              <button
                type="button"
                onClick={onToggleRecording}
                disabled={isProcessing}
                className={cn(
                  'relative flex items-center justify-center',
                  'w-12 h-12 rounded-full',
                  'transition-all duration-200',
                  'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background',
                  // Recording state styling with enhanced animations (T013)
                  isRecording
                    ? [
                        'bg-destructive text-destructive-foreground',
                        'hover:bg-destructive/90',
                        'focus:ring-destructive',
                        // Enhanced pulse and glow animations (T013)
                        'animate-voice-recording-pulse animate-voice-recording-glow',
                      ]
                    : [
                        'bg-primary text-primary-foreground',
                        'hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25',
                        'focus:ring-primary',
                        // Subtle hover scale effect
                        'hover:scale-105 active:scale-95',
                      ],
                  // Disabled state
                  isProcessing && 'opacity-50 cursor-not-allowed'
                )}
                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                aria-pressed={isRecording}
              >
                {isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Keyboard shortcut hint */}
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Press <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">Alt+N</kbd> to{' '}
            {isRecording ? 'stop' : 'start'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// StatusIndicator - Visual status indicator component (T005)
// ============================================================================

interface StatusIndicatorProps {
  /** Current voice session status */
  status: VoiceSessionStatus;
  /** Size variant - 'sm' for header, 'lg' for expanded view */
  size?: 'sm' | 'lg';
  /** Whether to show status text label */
  showLabel?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * StatusIndicator - Visual indicator for voice session status
 *
 * Provides clear visual feedback for the current state of voice interaction:
 * - Recording: Red pulsing indicator
 * - Processing/Transcribing/Responding: Animated spinner
 * - Speaking: Sound wave animation
 * - Error: Red alert icon
 * - Idle: Green ready indicator
 */
function StatusIndicator({
  status,
  size = 'sm',
  showLabel = false,
  className,
}: StatusIndicatorProps) {
  const isSmall = size === 'sm';
  const iconSize = isSmall ? 'w-3 h-3' : 'w-4 h-4';
  const containerSize = isSmall ? 'w-5 h-5' : 'w-7 h-7';

  // Get status-specific styling and icon
  const getStatusConfig = () => {
    switch (status) {
      case 'recording':
        return {
          icon: <Radio className={cn(iconSize, 'text-destructive')} />,
          containerClass: 'bg-destructive/20 animate-pulse',
          label: 'Recording',
          labelClass: 'text-destructive',
        };
      case 'processing':
      case 'transcribing':
        return {
          icon: <Loader2 className={cn(iconSize, 'text-primary animate-spin')} />,
          containerClass: 'bg-primary/10',
          label: status === 'processing' ? 'Processing' : 'Transcribing',
          labelClass: 'text-primary',
        };
      case 'responding':
        return {
          icon: <Loader2 className={cn(iconSize, 'text-amber-500 animate-spin')} />,
          containerClass: 'bg-amber-500/10',
          label: 'Thinking',
          labelClass: 'text-amber-500',
        };
      case 'speaking':
        return {
          icon: <SpeakingWaveIndicator size={size} />,
          containerClass: 'bg-green-500/10',
          label: 'Speaking',
          labelClass: 'text-green-500',
        };
      case 'error':
        return {
          icon: <AlertCircle className={cn(iconSize, 'text-destructive')} />,
          containerClass: 'bg-destructive/10',
          label: 'Error',
          labelClass: 'text-destructive',
        };
      case 'idle':
      default:
        return {
          icon: (
            <div className={cn('rounded-full bg-green-500', isSmall ? 'w-2 h-2' : 'w-2.5 h-2.5')} />
          ),
          containerClass: 'bg-green-500/10',
          label: 'Ready',
          labelClass: 'text-green-500',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div
      className={cn('flex items-center gap-1.5', className)}
      role="status"
      aria-label={`Voice status: ${config.label}`}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full',
          containerSize,
          config.containerClass
        )}
      >
        {config.icon}
      </div>
      {showLabel && (
        <span className={cn('text-xs font-medium', config.labelClass, isSmall && 'text-[10px]')}>
          {config.label}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// StatusBadge - Compact status badge for collapsed state (T005)
// ============================================================================

interface StatusBadgeProps {
  status: VoiceSessionStatus;
}

/**
 * StatusBadge - Compact badge showing current status
 *
 * Used in the collapsed header to provide a quick visual of the current state
 * without taking up too much space.
 */
function StatusBadge({ status }: StatusBadgeProps) {
  const getBadgeConfig = () => {
    switch (status) {
      case 'recording':
        return {
          label: 'REC',
          className: 'bg-destructive/20 text-destructive border-destructive/30 animate-pulse',
        };
      case 'processing':
      case 'transcribing':
        return {
          label: 'PROC',
          className: 'bg-primary/20 text-primary border-primary/30',
        };
      case 'responding':
        return {
          label: 'AI',
          className: 'bg-amber-500/20 text-amber-500 border-amber-500/30',
        };
      case 'speaking':
        return {
          label: 'TTS',
          className: 'bg-green-500/20 text-green-500 border-green-500/30',
        };
      case 'error':
        return {
          label: 'ERR',
          className: 'bg-destructive/20 text-destructive border-destructive/30',
        };
      default:
        return null;
    }
  };

  const config = getBadgeConfig();
  if (!config) return null;

  return (
    <span className={cn('px-1.5 py-0.5 text-[9px] font-bold rounded border', config.className)}>
      {config.label}
    </span>
  );
}

// ============================================================================
// SpeakingWaveIndicator - Animated sound wave for speaking state (T005)
// ============================================================================

interface SpeakingWaveIndicatorProps {
  size?: 'sm' | 'lg';
}

/**
 * SpeakingWaveIndicator - Animated sound wave bars
 *
 * Displays 3 animated bars that represent audio output during TTS playback.
 * Uses staggered animation delays for a natural wave effect.
 */
function SpeakingWaveIndicator({ size = 'sm' }: SpeakingWaveIndicatorProps) {
  const isSmall = size === 'sm';
  const barHeight = isSmall ? 'h-2' : 'h-3';
  const barWidth = isSmall ? 'w-0.5' : 'w-1';

  return (
    <div className="flex items-center justify-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn(barWidth, barHeight, 'bg-green-500 rounded-full', 'animate-speaking-wave')}
          style={{
            animationDelay: `${i * 150}ms`,
          }}
        />
      ))}
    </div>
  );
}

// ============================================================================
// VoiceMessageBubble - Individual message display component
// ============================================================================

interface VoiceMessageBubbleProps {
  message: VoiceMessage;
}

/**
 * VoiceMessageBubble - Displays a single message in the voice conversation
 *
 * Renders user messages aligned to the right with primary styling,
 * and assistant messages aligned to the left with muted styling.
 * Shows command execution indicators for assistant responses that
 * triggered actions.
 *
 * Includes slide-in animation for new messages (T013).
 */
function VoiceMessageBubble({ message }: VoiceMessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex animate-voice-message-slide-in',
        isUser ? 'justify-end' : 'justify-start'
      )}
      data-testid={`voice-message-${message.id}`}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-3 py-2',
          'transition-transform duration-200',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        )}
      >
        {/* Command executed indicator */}
        {message.executedCommand && (
          <div className="flex items-center gap-1 text-[10px] mb-1 opacity-80">
            <CheckCircle2 className="h-2.5 w-2.5" />
            <span>{message.commandName || 'Command executed'}</span>
          </div>
        )}

        {/* Message content */}
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content || '...'}</p>

        {/* Timestamp */}
        <p
          className={cn(
            'text-[10px] mt-1',
            isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
          )}
        >
          {formatMessageTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}

/**
 * Format message timestamp for display
 * Shows time in a compact format (e.g., "2:30 PM")
 */
function formatMessageTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
