import { useRef, useCallback, useMemo } from 'react';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import type { Feature } from '@/store/app-store';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default threshold: columns with this many items or more will be virtualized */
export const VIRTUALIZATION_THRESHOLD = 15;

/** Estimated height (px) for a Kanban card before measurement */
const ESTIMATED_CARD_HEIGHT = 160;

/** Estimated height (px) for a category group header */
const ESTIMATED_CATEGORY_HEADER_HEIGHT = 28;

/** Number of items to render beyond the visible area for smooth scrolling */
const OVERSCAN_COUNT = 5;

/** Gap between cards in pixels (matches space-y-2 = 8px) */
const CARD_GAP = 8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A flat virtual item representing either a category header or a feature card */
export interface VirtualColumnItem {
  type: 'category-header' | 'feature-card';
  key: string;
  /** Only set when type === 'feature-card' */
  feature?: Feature;
  /** Only set when type === 'category-header' */
  category?: string;
  categoryCount?: number;
  /** The original index in the flat item list */
  index: number;
}

export interface UseVirtualizedColumnOptions {
  /** All features (including those inside collapsed categories) for SortableContext IDs */
  features: Feature[];
  /** Threshold to enable virtualization (default: 15) */
  threshold?: number;
  /** Whether virtualization is enabled at all */
  enabled?: boolean;
}

export interface UseVirtualizedColumnResult {
  /** Whether this column is currently using virtualization */
  isVirtualized: boolean;
  /** Ref to attach to the scroll container element */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** The virtualizer instance (null when not virtualized) */
  virtualizer: Virtualizer<HTMLDivElement, Element> | null;
  /** Flat list of virtual items (only populated when virtualized) */
  virtualItems: VirtualColumnItem[];
  /** Total virtual height in px (only meaningful when virtualized) */
  totalSize: number;
  /** The virtualizer's measureElement ref callback */
  measureElement: ((node: Element | null) => void) | undefined;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Provides threshold-based virtualization for a single Kanban column.
 *
 * When the number of features is below `threshold`, virtualization is disabled
 * and the column renders all cards normally (zero overhead).
 *
 * When the count meets or exceeds the threshold, the hook creates a
 * `useVirtualizer` instance that the column component can use to render
 * only the visible cards plus overscan.
 *
 * **SortableContext compatibility**: The caller should always pass ALL
 * feature IDs to `<SortableContext items={...}>` regardless of
 * virtualization state. Only the *rendering* is virtualized; the
 * drag-drop identity list remains complete so @dnd-kit can resolve
 * drag targets correctly.
 */
export function useVirtualizedColumn({
  features,
  threshold = VIRTUALIZATION_THRESHOLD,
  enabled = true,
}: UseVirtualizedColumnOptions): UseVirtualizedColumnResult {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const shouldVirtualize = enabled && features.length >= threshold;

  // Build a flat item list for the virtualizer.
  // When not virtualized we still compute this (cheaply) so the return type
  // is consistent, but the caller will ignore it.
  const virtualItems = useMemo<VirtualColumnItem[]>(() => {
    if (!shouldVirtualize) return [];

    const items: VirtualColumnItem[] = [];
    let idx = 0;

    for (const feature of features) {
      items.push({
        type: 'feature-card',
        key: `card:${feature.id}`,
        feature,
        index: idx++,
      });
    }

    return items;
  }, [features, shouldVirtualize]);

  // Stable estimateSize callback
  const estimateSize = useCallback(
    (_index: number) => {
      if (!shouldVirtualize) return 0;
      const item = virtualItems[_index];
      if (!item) return ESTIMATED_CARD_HEIGHT;
      return item.type === 'category-header'
        ? ESTIMATED_CATEGORY_HEADER_HEIGHT
        : ESTIMATED_CARD_HEIGHT + CARD_GAP;
    },
    [virtualItems, shouldVirtualize]
  );

  // Stable getItemKey callback
  const getItemKey = useCallback(
    (index: number) => {
      if (!shouldVirtualize) return String(index);
      return virtualItems[index]?.key ?? String(index);
    },
    [virtualItems, shouldVirtualize]
  );

  // Always call useVirtualizer (hooks must be called unconditionally).
  // When virtualization is off we give it count=0 so it does nothing.
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? virtualItems.length : 0,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize,
    overscan: OVERSCAN_COUNT,
    getItemKey,
  });

  return {
    isVirtualized: shouldVirtualize,
    scrollContainerRef,
    virtualizer: shouldVirtualize ? virtualizer : null,
    virtualItems,
    totalSize: shouldVirtualize ? virtualizer.getTotalSize() : 0,
    measureElement: shouldVirtualize ? virtualizer.measureElement : undefined,
  };
}
