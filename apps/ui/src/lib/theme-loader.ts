/**
 * Dynamic theme CSS loader.
 *
 * Instead of importing all 40 theme CSS files synchronously at startup,
 * this module loads theme CSS on demand using Vite's dynamic import().
 * Base themes (dark, light) are always loaded synchronously via theme-imports.ts.
 */

/** Tracks which theme CSS modules have already been loaded. */
const loadedThemes = new Set<string>(['dark', 'light']);

/** Maps theme names to their dynamic import() promises to deduplicate concurrent requests. */
const pendingLoads = new Map<string, Promise<void>>();

/**
 * Vite glob import for all theme CSS files (lazy).
 * Each entry is a function that returns a Promise which, when called,
 * injects the CSS into the document.
 */
const themeModules = import.meta.glob('../styles/themes/*.css') as Record<
  string,
  () => Promise<unknown>
>;

/** Resolve the glob key for a given theme name. */
function getModuleKey(themeName: string): string {
  return `../styles/themes/${themeName}.css`;
}

/**
 * Load a theme's CSS dynamically. No-op if already loaded or if it's a base theme.
 * Returns a promise that resolves once the CSS is injected.
 */
export async function loadTheme(themeName: string): Promise<void> {
  if (!themeName || loadedThemes.has(themeName)) return;

  // Check for an in-flight load to avoid duplicate imports
  const pending = pendingLoads.get(themeName);
  if (pending) return pending;

  const key = getModuleKey(themeName);
  const loader = themeModules[key];
  if (!loader) {
    // Theme CSS not found — fall back silently (dark theme will be used)
    return;
  }

  const promise = loader()
    .then(() => {
      loadedThemes.add(themeName);
    })
    .catch(() => {
      // CSS failed to load — swallow error so the app doesn't break
    })
    .finally(() => {
      pendingLoads.delete(themeName);
    });

  pendingLoads.set(themeName, promise);
  return promise;
}

/**
 * Preload a theme's CSS (same as loadTheme, but semantically indicates
 * it's being loaded ahead of time, e.g. on hover).
 */
export function preloadTheme(themeName: string): void {
  void loadTheme(themeName);
}

/**
 * Resolves the concrete theme name when the mode might be 'system'.
 */
function resolveSystemTheme(themeMode: string): string {
  if (themeMode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return themeMode;
}

/**
 * Load the user's stored theme CSS on app startup.
 * Called from app.tsx to eagerly load the active theme before first paint.
 */
export async function loadStoredTheme(storedTheme: string | null): Promise<void> {
  if (!storedTheme) return;
  const resolved = resolveSystemTheme(storedTheme);
  await loadTheme(resolved);
}
