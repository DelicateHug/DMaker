import { useEffect, useRef, useCallback, useState, memo } from 'react';
import { cn } from '@/lib/utils';
import { AnsiOutput } from '@/components/ui/ansi-output';
import { ArrowDown } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface DeployLogOutputProps {
  /** The raw output text (may contain ANSI escape codes) */
  output: string;
  /** Whether the log is still actively streaming */
  isStreaming?: boolean;
  /** Maximum height of the output container */
  maxHeight?: string;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * DeployLogOutput - A log output display component with ANSI color support
 * and auto-scroll behavior for the DeployPanel.
 *
 * Features:
 * - ANSI escape code rendering (colors, bold, italic, underline, 256-color, RGB)
 * - Auto-scroll to bottom during streaming (pauses when user scrolls up)
 * - "Scroll to bottom" indicator when not at bottom during streaming
 * - Blinking cursor indicator during active streaming
 * - Compact design for embedded panel usage
 *
 * @example
 * ```tsx
 * <DeployLogOutput
 *   output={entry.output}
 *   isStreaming={entry.status === 'running'}
 *   maxHeight="max-h-64"
 * />
 * ```
 */
export const DeployLogOutput = memo(function DeployLogOutput({
  output,
  isStreaming = false,
  maxHeight = 'max-h-64',
  className,
}: DeployLogOutputProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const isUserScrollingRef = useRef(false);

  // Check if the container is scrolled to the bottom
  const isAtBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    // Allow a small tolerance (5px) for "at bottom" detection
    return container.scrollHeight - container.scrollTop - container.clientHeight <= 5;
  }, []);

  // Scroll to the bottom of the container
  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
    setAutoScrollEnabled(true);
    setIsUserScrolledUp(false);
  }, []);

  // Handle scroll events to detect user scrolling away from bottom
  const handleScroll = useCallback(() => {
    if (isUserScrollingRef.current) return;

    const atBottom = isAtBottom();
    if (atBottom) {
      setAutoScrollEnabled(true);
      setIsUserScrolledUp(false);
    } else {
      setAutoScrollEnabled(false);
      setIsUserScrolledUp(true);
    }
  }, [isAtBottom]);

  // Handle wheel events to distinguish user-initiated scrolls
  const handleWheel = useCallback(() => {
    isUserScrollingRef.current = true;
    // Reset after a short delay
    requestAnimationFrame(() => {
      isUserScrollingRef.current = false;
    });
  }, []);

  // Auto-scroll when output changes and auto-scroll is enabled
  useEffect(() => {
    if (autoScrollEnabled && isStreaming) {
      requestAnimationFrame(() => {
        const container = scrollContainerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }
  }, [output, autoScrollEnabled, isStreaming]);

  // Re-enable auto-scroll when streaming starts
  useEffect(() => {
    if (isStreaming) {
      setAutoScrollEnabled(true);
      setIsUserScrolledUp(false);
    }
  }, [isStreaming]);

  // No output yet
  if (!output && !isStreaming) {
    return null;
  }

  return (
    <div className={cn('relative mt-1.5', className)}>
      {/* Scrollable output container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        className={cn(
          'p-2 rounded bg-background/80 overflow-y-auto border border-border/50',
          maxHeight
        )}
      >
        <AnsiOutput text={output || ''} className="text-[10px] text-muted-foreground" />
        {/* Streaming cursor indicator */}
        {isStreaming && (
          <span className="animate-pulse text-blue-400 font-mono text-[10px]">▋</span>
        )}
      </div>

      {/* Scroll-to-bottom indicator (shown when user scrolled up during streaming) */}
      {isStreaming && isUserScrolledUp && (
        <button
          onClick={scrollToBottom}
          className={cn(
            'absolute bottom-2 right-3 z-10',
            'inline-flex items-center gap-1 px-2 py-1',
            'rounded-full text-[10px] font-medium',
            'bg-blue-500/90 text-white shadow-sm',
            'hover:bg-blue-600/90 transition-colors',
            'backdrop-blur-sm'
          )}
          title="Scroll to bottom"
        >
          <ArrowDown className="w-3 h-3" />
          Follow
        </button>
      )}
    </div>
  );
});

export default DeployLogOutput;
