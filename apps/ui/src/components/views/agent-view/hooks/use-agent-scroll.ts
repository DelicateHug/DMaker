import { useRef, useState, useCallback, useEffect } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

interface UseAgentScrollOptions {
  messagesLength: number;
  currentSessionId: string | null;
  /** A ref holding the current virtualizer instance (may be null before mount) */
  virtualizerRef: React.RefObject<Virtualizer<HTMLDivElement, Element> | null>;
}

interface UseAgentScrollResult {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  isUserAtBottom: boolean;
  handleScroll: () => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

const BOTTOM_THRESHOLD = 50; // px from bottom considered "at bottom"

export function useAgentScroll({
  messagesLength,
  currentSessionId,
  virtualizerRef,
}: UseAgentScrollOptions): UseAgentScrollResult {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);
  const prevSessionIdRef = useRef<string | null>(currentSessionId);

  // Scroll position detection — works on the raw scroll container
  const checkIfUserIsAtBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <= BOTTOM_THRESHOLD;

    setIsUserAtBottom(isAtBottom);
  }, []);

  // Scroll to bottom using the virtualizer's scrollToIndex.
  // We read from the ref so this callback is stable and always sees the latest instance.
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const virtualizer = virtualizerRef.current;
      if (!virtualizer) return;

      const lastIndex = virtualizer.options.count - 1;
      if (lastIndex < 0) return;

      // TanStack Virtual's scrollToIndex accepts 'auto' | 'smooth' for behavior.
      // Map the standard ScrollBehavior values accordingly ('instant' → 'auto').
      const virtualizerBehavior = behavior === 'instant' ? 'auto' : behavior;

      virtualizer.scrollToIndex(lastIndex, {
        align: 'end',
        behavior: virtualizerBehavior as 'auto' | 'smooth',
      });
    },
    [virtualizerRef]
  );

  // Handle scroll events from the container
  const handleScroll = useCallback(() => {
    checkIfUserIsAtBottom();
  }, [checkIfUserIsAtBottom]);

  // Auto-scroll when new messages arrive (only if user was already at bottom)
  useEffect(() => {
    if (isUserAtBottom && messagesLength > 0) {
      // Small delay to let the virtualizer measure the new item
      const timer = setTimeout(() => {
        scrollToBottom('smooth');
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [messagesLength, isUserAtBottom, scrollToBottom]);

  // Instant scroll to bottom when switching sessions
  useEffect(() => {
    if (currentSessionId && currentSessionId !== prevSessionIdRef.current && messagesLength > 0) {
      const timer = setTimeout(() => {
        scrollToBottom('auto');
        setIsUserAtBottom(true);
      }, 50);
      prevSessionIdRef.current = currentSessionId;
      return () => clearTimeout(timer);
    }
    prevSessionIdRef.current = currentSessionId;
  }, [currentSessionId, scrollToBottom, messagesLength]);

  return {
    scrollContainerRef,
    isUserAtBottom,
    handleScroll,
    scrollToBottom,
  };
}
