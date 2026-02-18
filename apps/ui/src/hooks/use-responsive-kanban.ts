// @ts-nocheck
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/store/app-store';

/**
 * Selector for sidebar open state used in responsive kanban calculations
 */
const selectSidebarOpen = (state: ReturnType<typeof useAppStore.getState>) => state.sidebarOpen;

export interface ResponsiveKanbanConfig {
  columnWidth: number;
  columnMinWidth: number;
  columnMaxWidth: number;
  gap: number;
  padding: number;
}

/**
 * Default configuration for responsive Kanban columns
 */
const DEFAULT_CONFIG: ResponsiveKanbanConfig = {
  columnWidth: 288, // 18rem = 288px (w-72)
  columnMinWidth: 260, // Minimum column width - ensures usability (reduced for tighter layout)
  columnMaxWidth: Infinity, // No max width - columns scale evenly to fill viewport
  gap: 12, // gap-3 = 12px (reduced from 20px for tighter layout)
  padding: 24, // px-3 on both sides = 24px (reduced from 40px for more space efficiency)
};

// Sidebar transition duration (matches sidebar.tsx)
const SIDEBAR_TRANSITION_MS = 300;

export interface UseResponsiveKanbanResult {
  columnWidth: number;
  containerStyle: React.CSSProperties;
  columnStyle: React.CSSProperties;
  isCompact: boolean;
  totalBoardWidth: number;
  isInitialized: boolean;
  gap: number;
  /** Calculated width for single-column mode (60-70% of available space) */
  singleColumnWidth: number;
  /** Container style optimized for single-column mode */
  singleColumnContainerStyle: React.CSSProperties;
}

/**
 * Single-column mode configuration
 */
const SINGLE_COLUMN_CONFIG = {
  /** Target percentage of available width (65% = middle of 60-70% range) */
  targetPercentage: 0.65,
  /** Minimum width for readability */
  minWidth: 400,
  /** Maximum width to prevent overly wide cards */
  maxWidth: 800,
  /** Horizontal padding in single-column mode */
  padding: 16,
};

/**
 * Hook to calculate responsive Kanban column widths based on window size.
 * Ensures columns scale intelligently to fill available space without
 * dead space on the right or content being cut off.
 *
 * Features:
 * - Uses useLayoutEffect to calculate width before paint (prevents bounce)
 * - Observes actual board container for accurate sizing
 * - Recalculates after sidebar transitions
 * - Provides optimized width calculations for single-column mode
 *
 * @param columnCount - Number of columns in the Kanban board
 * @param config - Optional configuration for column sizing
 * @returns Object with calculated column width, container styles, and metrics
 */
export function useResponsiveKanban(
  columnCount: number = 4,
  config: Partial<ResponsiveKanbanConfig> = {}
): UseResponsiveKanbanResult {
  const { columnMinWidth, columnMaxWidth, gap, padding } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const sidebarOpen = useAppStore(selectSidebarOpen);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [isInitialized, setIsInitialized] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  const calculateColumnWidth = useCallback(
    (containerWidth?: number) => {
      if (typeof window === 'undefined') {
        return DEFAULT_CONFIG.columnWidth;
      }

      // Get the actual board container width
      // The flex layout already accounts for sidebar width, so we use the container's actual width
      let width = containerWidth;
      if (width === undefined) {
        const boardContainer = document.querySelector('[data-testid="board-view"]')?.parentElement;
        width = boardContainer ? boardContainer.clientWidth : window.innerWidth;
      }

      // Get the available width (subtract padding only)
      const availableWidth = width - padding;

      // Calculate total gap space needed
      const totalGapWidth = gap * (columnCount - 1);

      // Calculate width available for all columns
      const widthForColumns = availableWidth - totalGapWidth;

      // Calculate ideal column width
      let idealWidth = Math.floor(widthForColumns / columnCount);

      // Clamp to min/max bounds
      idealWidth = Math.max(columnMinWidth, Math.min(columnMaxWidth, idealWidth));

      return idealWidth;
    },
    [columnCount, columnMinWidth, columnMaxWidth, gap, padding]
  );

  const [columnWidth, setColumnWidth] = useState<number>(() => calculateColumnWidth());

  // Use useLayoutEffect to calculate width synchronously before paint
  // This prevents the "bounce" effect when navigating to the kanban view
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const updateWidth = () => {
      // Get current container width for single-column calculations
      const boardContainer = document.querySelector('[data-testid="board-view"]')?.parentElement;
      const width = boardContainer ? boardContainer.clientWidth : window.innerWidth;
      setContainerWidth(width);

      const newWidth = calculateColumnWidth();
      setColumnWidth(newWidth);
      setIsInitialized(true);
    };

    // Calculate immediately before paint
    updateWidth();
  }, [calculateColumnWidth]);

  // Set up ResizeObserver for ongoing resize handling
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateWidth = () => {
      const newWidth = calculateColumnWidth();
      setColumnWidth(newWidth);
    };

    // Debounced update for smooth resize transitions
    const scheduleUpdate = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(updateWidth, 50);
    };

    // Use ResizeObserver on the actual board container for precise updates
    let resizeObserver: ResizeObserver | null = null;
    const boardView = document.querySelector('[data-testid="board-view"]');
    const container = boardView?.parentElement;

    if (container && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        // Use the observed container's width for calculation
        const entry = entries[0];
        if (entry) {
          const observedWidth = entry.contentRect.width;
          setContainerWidth(observedWidth);
          const newWidth = calculateColumnWidth(observedWidth);
          setColumnWidth(newWidth);
        }
      });
      resizeObserver.observe(container);
    }

    // Fallback to window resize event
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', scheduleUpdate);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [calculateColumnWidth]);

  // Re-calculate after sidebar transitions complete
  useEffect(() => {
    const timeout = setTimeout(() => {
      const newWidth = calculateColumnWidth();
      setColumnWidth(newWidth);
    }, SIDEBAR_TRANSITION_MS + 50); // Wait for transition to complete

    return () => clearTimeout(timeout);
  }, [sidebarOpen, calculateColumnWidth]);

  // Determine if we're in compact mode (columns at minimum width)
  const isCompact = columnWidth <= columnMinWidth + 10;

  // Calculate total board width for container sizing
  const totalBoardWidth = columnWidth * columnCount + gap * (columnCount - 1);

  // Container style for horizontal scrolling support with stretch behavior
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    gap: `${gap}px`,
    width: '100%', // Fill available space for better utilization
    minWidth: 'max-content', // Ensure minimum width when content exceeds container
    minHeight: '100%', // Ensure full height
    padding: `0 ${padding / 2}px`, // Apply horizontal padding to container
  };

  // Column style for flex-based stretching
  const columnStyle: React.CSSProperties = {
    flex: `1 1 ${columnWidth}px`, // Grow and shrink from base width
    minWidth: `${columnMinWidth}px`,
    maxWidth: columnMaxWidth === Infinity ? 'none' : `${columnMaxWidth}px`,
  };

  // Calculate single-column width based on actual container width
  // Uses 65% of available space (middle of 60-70% range per spec)
  // with reasonable min/max bounds for usability
  const calculateSingleColumnWidth = (): number => {
    const availableWidth = containerWidth || window.innerWidth;
    const targetWidth = Math.floor(availableWidth * SINGLE_COLUMN_CONFIG.targetPercentage);

    return Math.max(
      SINGLE_COLUMN_CONFIG.minWidth,
      Math.min(SINGLE_COLUMN_CONFIG.maxWidth, targetWidth)
    );
  };

  const singleColumnWidth = calculateSingleColumnWidth();

  // Container style optimized for single-column mode (centered layout)
  const singleColumnContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: `${gap}px`,
    width: '100%',
    minHeight: '100%',
    justifyContent: 'center',
    padding: `0 ${SINGLE_COLUMN_CONFIG.padding}px`,
  };

  return {
    columnWidth,
    containerStyle,
    columnStyle,
    isCompact,
    totalBoardWidth,
    isInitialized,
    gap,
    singleColumnWidth,
    singleColumnContainerStyle,
  };
}
