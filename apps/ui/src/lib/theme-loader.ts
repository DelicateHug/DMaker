/**
 * Theme loader stubs.
 *
 * All theme CSS is now bundled into a single synchronously-loaded file
 * (styles/themes.css), so dynamic loading is no longer necessary.
 * These functions are kept as no-ops to preserve the existing API surface
 * used by components that call loadTheme / preloadTheme / loadStoredTheme.
 */

/**
 * No-op — all themes are loaded synchronously at startup.
 */
export async function loadTheme(_themeName: string): Promise<void> {
  // All themes are already available via the synchronous themes.css import.
}

/**
 * No-op — all themes are loaded synchronously at startup.
 */
export function preloadTheme(_themeName: string): void {
  // All themes are already available via the synchronous themes.css import.
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
 * No-op — all themes are loaded synchronously at startup.
 * The resolveSystemTheme helper is kept in case callers rely on the
 * side-effect of resolving 'system' to a concrete theme name.
 */
export async function loadStoredTheme(storedTheme: string | null): Promise<void> {
  if (!storedTheme) return;
  // Resolve so the function signature stays compatible, but no loading needed.
  void resolveSystemTheme(storedTheme);
}
