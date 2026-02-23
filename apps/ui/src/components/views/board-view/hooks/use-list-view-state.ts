import { useState, useCallback, useEffect, useMemo } from 'react';
import { getJSON, setJSON } from '@/lib/storage';

/** Columns that can be sorted in the list view */
export type SortColumn = 'title' | 'status' | 'category' | 'priority' | 'createdAt' | 'updatedAt';

/** Sort direction */
export type SortDirection = 'asc' | 'desc';

/** Sort configuration */
export interface SortConfig {
  column: SortColumn;
  direction: SortDirection;
}

/** Persisted state for the list view */
interface ListViewPersistedState {
  sortConfig: SortConfig;
}

/** Storage key for list view preferences */
const STORAGE_KEY = 'automaker:list-view-state';

/** Default sort configuration */
const DEFAULT_SORT_CONFIG: SortConfig = {
  column: 'createdAt',
  direction: 'desc',
};

/** Default persisted state */
const DEFAULT_STATE: ListViewPersistedState = {
  sortConfig: DEFAULT_SORT_CONFIG,
};

/**
 * Validates and returns a valid SortColumn, defaulting to 'createdAt' if invalid
 */
function validateSortColumn(value: unknown): SortColumn {
  const validColumns: SortColumn[] = [
    'title',
    'status',
    'category',
    'priority',
    'createdAt',
    'updatedAt',
  ];
  if (typeof value === 'string' && validColumns.includes(value as SortColumn)) {
    return value as SortColumn;
  }
  return 'createdAt';
}

/**
 * Validates and returns a valid SortDirection, defaulting to 'desc' if invalid
 */
function validateSortDirection(value: unknown): SortDirection {
  if (value === 'asc' || value === 'desc') {
    return value;
  }
  return 'desc';
}

/**
 * Load persisted state from localStorage with validation
 */
function loadPersistedState(): ListViewPersistedState {
  const stored = getJSON<Partial<ListViewPersistedState>>(STORAGE_KEY);

  if (!stored) {
    return DEFAULT_STATE;
  }

  return {
    sortConfig: {
      column: validateSortColumn(stored.sortConfig?.column),
      direction: validateSortDirection(stored.sortConfig?.direction),
    },
  };
}

/**
 * Save state to localStorage
 */
function savePersistedState(state: ListViewPersistedState): void {
  setJSON(STORAGE_KEY, state);
}

export interface UseListViewStateReturn {
  /** Current sort configuration */
  sortConfig: SortConfig;
  /** Set the sort column (toggles direction if same column) */
  setSortColumn: (column: SortColumn) => void;
  /** Set the full sort configuration */
  setSortConfig: (config: SortConfig) => void;
  /** Reset sort to default */
  resetSort: () => void;
}

/**
 * Hook for managing list view sort state with localStorage persistence.
 *
 * @example
 * ```tsx
 * const { sortConfig, setSortColumn } = useListViewState();
 *
 * // Sort by column (clicking same column toggles direction)
 * <TableHeader onClick={() => setSortColumn('title')}>Title</TableHeader>
 * ```
 */
export function useListViewState(): UseListViewStateReturn {
  const [sortConfig, setSortConfigState] = useState<SortConfig>(
    () => loadPersistedState().sortConfig
  );

  // Persist state changes to localStorage
  useEffect(() => {
    savePersistedState({ sortConfig });
  }, [sortConfig]);

  // Set sort column - toggles direction if same column is clicked
  const setSortColumn = useCallback((column: SortColumn) => {
    setSortConfigState((prev) => {
      if (prev.column === column) {
        // Toggle direction if same column
        return {
          column,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      // New column - default to descending for dates, ascending for others
      const defaultDirection: SortDirection =
        column === 'createdAt' || column === 'updatedAt' ? 'desc' : 'asc';
      return { column, direction: defaultDirection };
    });
  }, []);

  // Set full sort configuration
  const setSortConfig = useCallback((config: SortConfig) => {
    setSortConfigState(config);
  }, []);

  // Reset sort to default
  const resetSort = useCallback(() => {
    setSortConfigState(DEFAULT_SORT_CONFIG);
  }, []);

  return useMemo(
    () => ({
      sortConfig,
      setSortColumn,
      setSortConfig,
      resetSort,
    }),
    [sortConfig, setSortColumn, setSortConfig, resetSort]
  );
}
