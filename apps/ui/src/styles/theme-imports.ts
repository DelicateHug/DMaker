/**
 * Base theme imports loaded synchronously to prevent flash of unstyled content.
 * All other themes are loaded on demand via lib/theme-loader.ts.
 */

// Base dark theme (default) - always needed synchronously
import './themes/dark.css';

// Light theme overrides (scrollbar styles) - always needed synchronously
import './themes/light.css';
