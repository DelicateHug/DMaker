import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createLogger } from '@dmaker/utils/logger';
import { useNotificationsStore } from '@/store/notifications-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { pathsEqual } from '@/lib/utils';
import type { Notification } from '@dmaker/types';
import type { ImageAttachment, TextFileAttachment } from '@/store/app-store';

// --- useMediaQuery ---

/**
 * Hook to detect if a media query matches
 * @param query - The media query string (e.g., '(max-width: 768px)')
 * @returns boolean indicating if the media query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  const isInitialMount = useRef(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);
    const handleChange = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };

    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      setMatches(mediaQuery.matches);
    }

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [query]);

  return matches;
}

/**
 * Hook to detect if the device is mobile (screen width <= 768px)
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 768px)');
}

/**
 * Hook to detect if the device is tablet or smaller (screen width <= 1024px)
 */
export function useIsTablet(): boolean {
  return useMediaQuery('(max-width: 1024px)');
}

/**
 * Hook to detect compact layout (screen width <= 1240px)
 * Used for collapsing top bar controls into mobile menu
 */
export function useIsCompact(): boolean {
  return useMediaQuery('(max-width: 1240px)');
}

// --- useOSDetection ---

export type OperatingSystem = 'mac' | 'windows' | 'linux' | 'unknown';

export interface OSDetectionResult {
  readonly os: OperatingSystem;
  readonly isMac: boolean;
  readonly isWindows: boolean;
  readonly isLinux: boolean;
}

function detectOS(): OperatingSystem {
  if (typeof window !== 'undefined' && window.electronAPI?.platform) {
    const platform = window.electronAPI.platform;
    if (platform === 'darwin') return 'mac';
    if (platform === 'win32') return 'windows';
    if (platform === 'linux') return 'linux';
  }

  if (typeof navigator === 'undefined') {
    return 'unknown';
  }

  const nav = navigator as Navigator & { userAgentData?: { platform: string } };
  const platform = (nav.userAgentData?.platform ?? navigator.platform ?? '').toLowerCase();

  if (platform.includes('mac')) return 'mac';
  if (platform.includes('win')) return 'windows';
  if (platform.includes('linux') || platform.includes('x11')) return 'linux';
  return 'unknown';
}

/**
 * Hook to detect the user's operating system.
 * Returns OS information and convenience boolean flags.
 */
export function useOSDetection(): OSDetectionResult {
  return useMemo(() => {
    const os = detectOS();
    return {
      os,
      isMac: os === 'mac',
      isWindows: os === 'windows',
      isLinux: os === 'linux',
    };
  }, []);
}

// --- useWindowState ---

export interface WindowState {
  isMaximized: boolean;
  windowWidth: number;
  windowHeight: number;
}

/**
 * Hook to track window state (dimensions and maximized status)
 * For Electron apps, considers window maximized if width > 1400px
 * Also listens for window resize events to update state
 */
export function useWindowState(): WindowState {
  const [windowState, setWindowState] = useState<WindowState>(() => {
    if (typeof window === 'undefined') {
      return { isMaximized: false, windowWidth: 0, windowHeight: 0 };
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    return {
      isMaximized: width > 1400,
      windowWidth: width,
      windowHeight: height,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateWindowState = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setWindowState({
        isMaximized: width > 1400,
        windowWidth: width,
        windowHeight: height,
      });
    };

    updateWindowState();

    window.addEventListener('resize', updateWindowState);

    return () => {
      window.removeEventListener('resize', updateWindowState);
    };
  }, []);

  return windowState;
}

// --- useScrollTracking ---

interface ScrollTrackingItem {
  id: string;
}

interface UseScrollTrackingOptions<T extends ScrollTrackingItem> {
  /** Navigation items with at least an id property */
  items: T[];
  /** Optional filter function to determine which items should be tracked */
  filterFn?: (item: T) => boolean;
  /** Optional initial active section (defaults to first item's id) */
  initialSection?: string;
  /** Optional offset from top when scrolling to section (defaults to 24) */
  scrollOffset?: number;
}

/**
 * Generic custom hook for managing scroll-based navigation tracking
 * Automatically highlights the active section based on scroll position
 * and provides smooth scrolling to sections
 */
export function useScrollTracking<T extends ScrollTrackingItem>({
  items,
  filterFn = () => true,
  initialSection,
  scrollOffset = 24,
}: UseScrollTrackingOptions<T>) {
  const [activeSection, setActiveSection] = useState(initialSection || items[0]?.id || '');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const sections = items
        .filter(filterFn)
        .map((item) => ({
          id: item.id,
          element: document.getElementById(item.id),
        }))
        .filter((s) => s.element);

      const containerRect = container.getBoundingClientRect();
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;

      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;

      if (isAtBottom && sections.length > 0) {
        setActiveSection(sections[sections.length - 1].id);
        return;
      }

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section.element) {
          const rect = section.element.getBoundingClientRect();
          const relativeTop = rect.top - containerRect.top + scrollTop;
          if (scrollTop >= relativeTop - 100) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [items, filterFn]);

  const scrollToSection = useCallback(
    (sectionId: string) => {
      const element = document.getElementById(sectionId);
      if (element && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const relativeTop = elementRect.top - containerRect.top + container.scrollTop;

        container.scrollTo({
          top: relativeTop - scrollOffset,
          behavior: 'smooth',
        });
      }
    },
    [scrollOffset]
  );

  return {
    activeSection,
    scrollToSection,
    scrollContainerRef,
  };
}

// --- useMessageQueue ---

const messageQueueLogger = createLogger('MessageQueue');

export interface QueuedMessage {
  id: string;
  content: string;
  images?: ImageAttachment[];
  textFiles?: TextFileAttachment[];
  timestamp: Date;
}

interface UseMessageQueueOptions {
  onProcessNext: (message: QueuedMessage) => Promise<void>;
}

interface UseMessageQueueResult {
  queuedMessages: QueuedMessage[];
  isProcessingQueue: boolean;
  addToQueue: (
    content: string,
    images?: ImageAttachment[],
    textFiles?: TextFileAttachment[]
  ) => void;
  clearQueue: () => void;
  removeFromQueue: (messageId: string) => void;
  processNext: () => Promise<void>;
}

/**
 * React hook for managing a queue of messages to be sent to the agent
 */
export function useMessageQueue({ onProcessNext }: UseMessageQueueOptions): UseMessageQueueResult {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  const addToQueue = useCallback(
    (content: string, images?: ImageAttachment[], textFiles?: TextFileAttachment[]) => {
      const queuedMessage: QueuedMessage = {
        id: `queued-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content: content.trim(),
        images,
        textFiles,
        timestamp: new Date(),
      };

      setQueuedMessages((prev) => [...prev, queuedMessage]);
    },
    []
  );

  const removeFromQueue = useCallback((messageId: string) => {
    setQueuedMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }, []);

  const clearQueue = useCallback(() => {
    setQueuedMessages([]);
  }, []);

  const processNext = useCallback(async () => {
    if (queuedMessages.length === 0 || isProcessingQueue) {
      return;
    }

    const nextMessage = queuedMessages[0];
    setIsProcessingQueue(true);

    try {
      await onProcessNext(nextMessage);
      setQueuedMessages((prev) => prev.slice(1));
    } catch (error) {
      messageQueueLogger.error('Error processing queued message:', error);
    } finally {
      setIsProcessingQueue(false);
    }
  }, [queuedMessages, isProcessingQueue, onProcessNext]);

  return {
    queuedMessages,
    isProcessingQueue,
    addToQueue,
    clearQueue,
    removeFromQueue,
    processNext,
  };
}

// --- useNotificationEvents ---

/**
 * Hook to subscribe to notification events and update the store.
 * Should be used in a component that's always mounted when a project is open.
 */
export function useNotificationEvents(projectPath: string | null) {
  const addNotification = useNotificationsStore((s) => s.addNotification);

  useEffect(() => {
    if (!projectPath) return;

    const api = getHttpApiClient();

    const unsubscribe = api.notifications.onNotificationCreated((notification: Notification) => {
      if (!pathsEqual(notification.projectPath, projectPath)) return;

      addNotification(notification);
    });

    return unsubscribe;
  }, [projectPath, addNotification]);
}

/**
 * Hook to load notifications for a project.
 * Should be called when switching projects or on initial load.
 */
export function useLoadNotifications(projectPath: string | null) {
  const setNotifications = useNotificationsStore((s) => s.setNotifications);
  const setUnreadCount = useNotificationsStore((s) => s.setUnreadCount);
  const setLoading = useNotificationsStore((s) => s.setLoading);
  const setError = useNotificationsStore((s) => s.setError);
  const reset = useNotificationsStore((s) => s.reset);

  useEffect(() => {
    if (!projectPath) {
      reset();
      return;
    }

    const loadNotifications = async () => {
      setLoading(true);
      setError(null);

      try {
        const api = getHttpApiClient();
        const [listResult, countResult] = await Promise.all([
          api.notifications.list(projectPath),
          api.notifications.getUnreadCount(projectPath),
        ]);

        if (listResult.success && listResult.notifications) {
          setNotifications(listResult.notifications);
        }

        if (countResult.success && countResult.count !== undefined) {
          setUnreadCount(countResult.count);
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to load notifications');
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();
  }, [projectPath, setNotifications, setUnreadCount, setLoading, setError, reset]);
}
