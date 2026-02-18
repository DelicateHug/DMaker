import { useEffect, useRef, useState, useCallback } from 'react';

interface UseInViewOptions {
  /** Root margin to expand/shrink the observation area (e.g., '100px' to start loading just before visible) */
  rootMargin?: string;
  /** Visibility threshold (0-1) required to be considered "in view" */
  threshold?: number;
  /** If true, once the element enters the viewport it stays "in view" forever (no unloading) */
  once?: boolean;
}

/**
 * Tracks whether a DOM element is within the viewport using IntersectionObserver.
 * Returns a callback ref to attach to the target element and a boolean `isInView`.
 *
 * @example
 * const { ref, isInView } = useInView({ rootMargin: '200px' });
 * return <div ref={ref}>{isInView && <ExpensiveContent />}</div>;
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(options: UseInViewOptions = {}) {
  const { rootMargin = '200px', threshold = 0, once = false } = options;
  const [isInView, setIsInView] = useState(false);
  // Store the DOM node in state so that changes trigger the effect
  const [node, setNode] = useState<T | null>(null);
  // Track whether the element has been seen (for `once` mode)
  const hasBeenSeen = useRef(false);

  // Callback ref – updating state ensures the observer effect re-runs when the element mounts/unmounts
  const ref = useCallback((el: T | null) => {
    setNode(el);
  }, []);

  useEffect(() => {
    if (!node) return;

    // If `once` mode and already seen, keep isInView true and skip observing
    if (once && hasBeenSeen.current) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting;
        setIsInView(visible);

        if (visible && once) {
          hasBeenSeen.current = true;
          observer.disconnect();
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [node, rootMargin, threshold, once]);

  return { ref, isInView };
}
