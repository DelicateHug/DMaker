/**
 * Font Imports — Deferred preload of bundled Zed fonts.
 *
 * Only Zed fonts (Zed Sans & Zed Mono) are bundled with the app.
 * All other fonts rely on the user's system-installed fonts.
 *
 * Font preloading is deferred until after the initial render to avoid
 * blocking startup. Fonts are loaded on-demand when actually needed
 * (via the font-loader's loadFontByFamily), and this module triggers
 * a background preload as a warm-up after a short delay.
 */

import { preloadAllFonts } from '@/lib/font-loader';

// Defer font preloading to avoid blocking the initial render.
// Fonts will still load on-demand if needed before this fires.
setTimeout(() => {
  void preloadAllFonts();
}, 2000);
