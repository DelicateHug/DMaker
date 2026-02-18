/**
 * Font options for per-project font customization
 *
 * Zed fonts (Zed Sans & Zed Mono) are bundled with the app from
 * zed-industries/zed-fonts and are self-hosted.
 * All other font options rely on the user's system-installed fonts.
 */

// Sentinel value for "use default font" - Radix Select doesn't allow empty strings
export const DEFAULT_FONT_VALUE = 'default';

export interface UIFontOption {
  value: string; // CSS font-family value ('default' means "use default")
  label: string; // Display label for the dropdown
}

/**
 * Sans/UI fonts for headings, labels, and general text
 *
 * 'default' value means "use the theme default" (Geist Sans for all themes)
 * Only Zed fonts are bundled; others require system installation.
 */
export const UI_SANS_FONT_OPTIONS: readonly UIFontOption[] = [
  { value: DEFAULT_FONT_VALUE, label: 'Default (Geist Sans)' },
  // Bundled fonts
  { value: "'Zed Sans', system-ui, sans-serif", label: 'Zed Sans' },
  { value: "'Zed Mono', monospace", label: 'Zed Mono' },
] as const;

/**
 * Mono/code fonts for code blocks, terminals, and monospaced text
 *
 * 'default' value means "use the theme default" (Geist Mono for all themes)
 * Only Zed Mono is bundled; others require system installation.
 */
export const UI_MONO_FONT_OPTIONS: readonly UIFontOption[] = [
  { value: DEFAULT_FONT_VALUE, label: 'Default (Geist Mono)' },
  // Bundled fonts
  { value: "'Zed Mono', monospace", label: 'Zed Mono' },
  // System fonts
  { value: 'Menlo, Monaco, monospace', label: 'Menlo / Monaco (macOS)' },
] as const;

/**
 * Get the display label for a font value
 */
export function getFontLabel(
  fontValue: string | undefined,
  options: readonly UIFontOption[]
): string {
  if (!fontValue || fontValue === DEFAULT_FONT_VALUE) return options[0].label;
  const option = options.find((o) => o.value === fontValue);
  return option?.label ?? fontValue;
}
