/**
 * Font Loader Utility
 *
 * Provides dynamic font loading with import maps and an in-memory cache.
 * Only Zed fonts (Zed Sans & Zed Mono) are bundled with the app.
 * All other fonts rely on the user's system-installed fonts.
 *
 * Features:
 * - Dynamic import map: lazily resolves font CSS via dynamic import()
 * - Load cache: tracks which fonts have been loaded to prevent duplicate imports
 * - Category-based loading: load all sans or mono fonts in one call
 * - Preload all: eagerly load every registered font (mirrors legacy behavior)
 * - Font readiness check via document.fonts API when available
 */

import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('FontLoader');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FontCategory = 'sans' | 'mono';

export interface FontImportEntry {
  /** Unique key used to identify the font (e.g. 'zed-sans', 'zed-mono') */
  id: string;
  /** Human-readable name (e.g. 'Zed Sans', 'Zed Mono') */
  name: string;
  /** CSS font-family value to use once loaded */
  family: string;
  /** Category for grouping */
  category: FontCategory;
  /** Weights to load (e.g. [400, 500, 600, 700]) */
  weights: number[];
  /**
   * Dynamic import functions for each weight's CSS.
   * Keyed by weight number. Each function returns a Promise (dynamic import).
   */
  imports: Record<number, () => Promise<unknown>>;
}

export interface FontLoadResult {
  id: string;
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Import Map — maps font IDs to their dynamic CSS imports
// ---------------------------------------------------------------------------

const FONT_IMPORT_MAP: FontImportEntry[] = [
  // ========================================
  // Zed Fonts — loaded via bundled CSS file
  // ========================================
  {
    id: 'zed-sans',
    name: 'Zed Sans',
    family: "'Zed Sans', system-ui, sans-serif",
    category: 'sans',
    weights: [400, 700],
    imports: {
      // Zed fonts are in a single CSS file with all @font-face declarations
      400: () => import('@/assets/fonts/zed/zed-fonts.css'),
      700: () => import('@/assets/fonts/zed/zed-fonts.css'),
    },
  },
  {
    id: 'zed-mono',
    name: 'Zed Mono',
    family: "'Zed Mono', monospace",
    category: 'mono',
    weights: [400, 700],
    imports: {
      // Same CSS file covers both Zed Sans and Zed Mono
      400: () => import('@/assets/fonts/zed/zed-fonts.css'),
      700: () => import('@/assets/fonts/zed/zed-fonts.css'),
    },
  },
];

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/** Set of font IDs that have been fully loaded */
const loadedFonts = new Set<string>();

/** Map of in-flight load promises to deduplicate concurrent requests */
const pendingLoads = new Map<string, Promise<FontLoadResult>>();

/** Track whether the Zed CSS file has been imported (shared between zed-sans/zed-mono) */
let zedCssLoaded = false;

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Build a lookup map from font ID to FontImportEntry for O(1) access
 */
const fontMapById = new Map<string, FontImportEntry>(
  FONT_IMPORT_MAP.map((entry) => [entry.id, entry])
);

/**
 * Build a lookup map from CSS font-family value to font ID.
 * This allows resolving a font-family string (e.g. from ui-font-options.ts)
 * back to the font loader entry.
 */
const fontMapByFamily = new Map<string, string>();
for (const entry of FONT_IMPORT_MAP) {
  fontMapByFamily.set(entry.family, entry.id);
  // Also map the primary family name (without fallbacks) for flexible lookup
  const primaryFamily = entry.family.split(',')[0].trim().replace(/'/g, '');
  fontMapByFamily.set(primaryFamily, entry.id);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load a font by its ID. All weights are loaded in parallel.
 * Returns immediately if the font is already loaded or loading.
 *
 * @param fontId - The font identifier (e.g. 'inter', 'fira-code')
 * @returns Promise resolving with the load result
 */
export async function loadFont(fontId: string): Promise<FontLoadResult> {
  // Already loaded — return immediately
  if (loadedFonts.has(fontId)) {
    return { id: fontId, success: true };
  }

  // Deduplicate concurrent loads for the same font
  const pending = pendingLoads.get(fontId);
  if (pending) {
    return pending;
  }

  const entry = fontMapById.get(fontId);
  if (!entry) {
    logger.warn(`Font "${fontId}" not found in import map`);
    return { id: fontId, success: false, error: `Unknown font: ${fontId}` };
  }

  const loadPromise = _performLoad(entry);
  pendingLoads.set(fontId, loadPromise);

  try {
    const result = await loadPromise;
    return result;
  } finally {
    pendingLoads.delete(fontId);
  }
}

/**
 * Load a font by its CSS font-family value.
 * Useful when integrating with ui-font-options.ts which stores font-family strings.
 *
 * @param fontFamily - The CSS font-family value (e.g. "Inter, system-ui, sans-serif")
 * @returns Promise resolving with the load result, or null if no matching font found
 */
export async function loadFontByFamily(fontFamily: string): Promise<FontLoadResult | null> {
  const fontId = fontMapByFamily.get(fontFamily);
  if (!fontId) {
    // Try matching with the primary family name only
    const primaryFamily = fontFamily.split(',')[0].trim().replace(/'/g, '');
    const fallbackId = fontMapByFamily.get(primaryFamily);
    if (fallbackId) {
      return loadFont(fallbackId);
    }
    logger.debug(`No font loader entry for family "${fontFamily}"`);
    return null;
  }
  return loadFont(fontId);
}

/**
 * Load all fonts in a given category.
 *
 * @param category - The font category ('sans' or 'mono')
 * @returns Promise resolving with results for each font in the category
 */
export async function loadFontsByCategory(category: FontCategory): Promise<FontLoadResult[]> {
  const entries = FONT_IMPORT_MAP.filter((entry) => entry.category === category);
  const results = await Promise.allSettled(entries.map((entry) => loadFont(entry.id)));

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      id: entries[index].id,
      success: false,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });
}

/**
 * Preload all registered fonts.
 * This mirrors the legacy behavior of font-imports.ts (eagerly loads everything).
 *
 * @returns Promise resolving with results for every registered font
 */
export async function preloadAllFonts(): Promise<FontLoadResult[]> {
  logger.info(`Preloading all ${FONT_IMPORT_MAP.length} registered fonts...`);
  const results = await Promise.allSettled(FONT_IMPORT_MAP.map((entry) => loadFont(entry.id)));

  const loaded = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.length - loaded;

  logger.info(`Font preload complete: ${loaded} loaded, ${failed} failed`);

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      id: FONT_IMPORT_MAP[index].id,
      success: false,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });
}

/**
 * Check whether a font has been loaded.
 *
 * @param fontId - The font identifier
 * @returns true if the font has been loaded via this loader
 */
export function isFontLoaded(fontId: string): boolean {
  return loadedFonts.has(fontId);
}

/**
 * Get all loaded font IDs.
 *
 * @returns Array of font IDs that have been loaded
 */
export function getLoadedFonts(): string[] {
  return [...loadedFonts];
}

/**
 * Get all registered font entries (read-only).
 *
 * @returns The full import map array
 */
export function getFontRegistry(): readonly FontImportEntry[] {
  return FONT_IMPORT_MAP;
}

/**
 * Look up a font entry by its ID.
 *
 * @param fontId - The font identifier
 * @returns The FontImportEntry or undefined if not found
 */
export function getFontEntry(fontId: string): FontImportEntry | undefined {
  return fontMapById.get(fontId);
}

/**
 * Resolve a CSS font-family string to a font ID.
 *
 * @param fontFamily - The CSS font-family value
 * @returns The font ID or undefined if no match
 */
export function resolveFontId(fontFamily: string): string | undefined {
  const direct = fontMapByFamily.get(fontFamily);
  if (direct) return direct;

  // Fallback: try with just the primary family name
  const primaryFamily = fontFamily.split(',')[0].trim().replace(/'/g, '');
  return fontMapByFamily.get(primaryFamily);
}

/**
 * Clear the font load cache. Useful for testing or hot-reload scenarios.
 * Note: This only clears the tracking state — CSS that has already been
 * injected into the document will remain active until page reload.
 */
export function clearFontCache(): void {
  loadedFonts.clear();
  pendingLoads.clear();
  zedCssLoaded = false;
  logger.debug('Font cache cleared');
}

// ---------------------------------------------------------------------------
// Internal Implementation
// ---------------------------------------------------------------------------

/**
 * Perform the actual CSS imports for a font entry
 */
async function _performLoad(entry: FontImportEntry): Promise<FontLoadResult> {
  try {
    // Special handling for Zed fonts — they share a single CSS file
    if (entry.id === 'zed-sans' || entry.id === 'zed-mono') {
      if (!zedCssLoaded) {
        await import('@/assets/fonts/zed/zed-fonts.css');
        zedCssLoaded = true;
        logger.debug('Zed fonts CSS loaded');
      }
      // Mark both zed-sans and zed-mono as loaded since they share the same CSS
      loadedFonts.add('zed-sans');
      loadedFonts.add('zed-mono');
      return { id: entry.id, success: true };
    }

    // Load all weight-specific CSS files in parallel
    const importPromises = entry.weights.map((weight) => {
      const importFn = entry.imports[weight];
      if (!importFn) {
        logger.warn(`Missing import for ${entry.id} weight ${weight}`);
        return Promise.resolve();
      }
      return importFn();
    });

    await Promise.all(importPromises);

    // Optionally wait for the font to be ready in the browser
    if (typeof document !== 'undefined' && document.fonts) {
      try {
        // Check if at least weight 400 is available (most common weight)
        const primaryFamily = entry.family.split(',')[0].trim();
        await document.fonts.load(`400 16px ${primaryFamily}`);
      } catch {
        // document.fonts.load can fail for fonts not yet rendered;
        // this is non-critical so we continue
        logger.debug(`document.fonts.load check skipped for ${entry.name}`);
      }
    }

    loadedFonts.add(entry.id);
    logger.debug(`Font loaded: ${entry.name} (${entry.weights.join(', ')})`);
    return { id: entry.id, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to load font "${entry.name}":`, message);
    return { id: entry.id, success: false, error: message };
  }
}
