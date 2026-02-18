/**
 * Syntax theme definitions for CodeMirror editors
 *
 * Provides centralized, reusable syntax highlighting styles and editor chrome themes
 * that automatically adapt to any of the app's 40+ themes via CSS variables.
 *
 * Similar to terminal-themes.ts but for CodeMirror-based code editors.
 *
 * Usage:
 *   import { getSyntaxTheme, syntaxThemes } from '@/config/syntax-themes';
 *
 *   // Get a named theme preset
 *   const theme = getSyntaxTheme('default');
 *   const extensions = [language, ...theme.extensions];
 *
 *   // Or use individual parts
 *   const extensions = [language, syntaxHighlighting(theme.highlightStyle), theme.editorTheme];
 */

import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Names of available syntax theme presets */
export type SyntaxThemeName = 'default' | 'compact' | 'inline' | 'minimal';

/** A complete syntax theme combining highlight colors and editor chrome styling */
export interface SyntaxTheme {
  /** Human-readable name for display */
  name: string;
  /** Descriptive label explaining the theme's purpose */
  description: string;
  /** Syntax token highlight style (colors for keywords, strings, etc.) */
  highlightStyle: HighlightStyle;
  /** Editor chrome theme (gutters, cursor, selection, etc.) */
  editorTheme: Extension;
  /** Pre-composed array of [syntaxHighlighting, editorTheme] ready to spread into extensions */
  extensions: Extension[];
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

/** Default monospace font stack used across all editor themes */
const EDITOR_FONT_FAMILY = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

/** Selection background color - consistent blue tint across all themes */
const SELECTION_BG = 'oklch(0.55 0.25 265 / 0.3)';

// ---------------------------------------------------------------------------
// Syntax highlight styles (token colors)
// ---------------------------------------------------------------------------

/**
 * Default syntax highlighting - full-featured color scheme using CSS variables.
 *
 * Maps semantic token types to the app's chart/theme CSS variables so colors
 * automatically adapt when the user switches between any of the 40 themes.
 *
 * Color mapping:
 *   --chart-1  -> strings, attribute values (warm/orange family)
 *   --chart-2  -> properties, variables, attributes (teal/cyan family)
 *   --chart-3  -> numbers, constants (green family)
 *   --chart-4  -> keywords, booleans, null (purple/pink family)
 *   --chart-5  -> special tokens, decorators (yellow family)
 *   --primary  -> function names, type names
 *   --foreground / --muted-foreground -> default text, punctuation
 */
const defaultHighlightStyle = HighlightStyle.define([
  // Keywords (if, else, for, while, return, etc.)
  { tag: t.keyword, color: 'var(--chart-4, oklch(0.7 0.15 280))' },
  { tag: t.controlKeyword, color: 'var(--chart-4, oklch(0.7 0.15 280))' },
  { tag: t.operatorKeyword, color: 'var(--chart-4, oklch(0.7 0.15 280))' },
  { tag: t.definitionKeyword, color: 'var(--chart-4, oklch(0.7 0.15 280))' },
  { tag: t.moduleKeyword, color: 'var(--chart-4, oklch(0.7 0.15 280))' },

  // Strings and attribute values
  { tag: t.string, color: 'var(--chart-1, oklch(0.646 0.222 41.116))' },
  { tag: t.special(t.string), color: 'var(--chart-1, oklch(0.646 0.222 41.116))' },
  { tag: t.attributeValue, color: 'var(--chart-1, oklch(0.646 0.222 41.116))' },

  // Numbers
  { tag: t.number, color: 'var(--chart-3, oklch(0.7 0.15 150))' },
  { tag: t.integer, color: 'var(--chart-3, oklch(0.7 0.15 150))' },
  { tag: t.float, color: 'var(--chart-3, oklch(0.7 0.15 150))' },

  // Booleans, null, special constants
  { tag: t.bool, color: 'var(--chart-4, oklch(0.7 0.15 280))' },
  { tag: t.null, color: 'var(--chart-4, oklch(0.7 0.15 280))' },

  // Properties and variables
  { tag: t.propertyName, color: 'var(--chart-2, oklch(0.6 0.118 184.704))' },
  { tag: t.variableName, color: 'var(--chart-2, oklch(0.6 0.118 184.704))' },
  { tag: t.definition(t.variableName), color: 'var(--chart-2, oklch(0.6 0.118 184.704))' },

  // Functions and type names
  { tag: t.function(t.variableName), color: 'var(--primary)' },
  { tag: t.definition(t.function(t.variableName)), color: 'var(--primary)' },
  { tag: t.typeName, color: 'var(--primary)' },
  { tag: t.className, color: 'var(--primary)' },
  { tag: t.namespace, color: 'var(--primary)' },

  // Attributes (XML/HTML)
  { tag: t.attributeName, color: 'var(--chart-5, oklch(0.65 0.2 30))' },

  // Tags (XML/HTML)
  { tag: t.tagName, color: 'var(--primary)' },
  { tag: t.angleBracket, color: 'var(--muted-foreground)' },

  // Comments
  { tag: t.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: t.lineComment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: t.blockComment, color: 'var(--muted-foreground)', fontStyle: 'italic' },

  // Operators and punctuation
  { tag: t.operator, color: 'var(--muted-foreground)' },
  { tag: t.bracket, color: 'var(--muted-foreground)' },
  { tag: t.punctuation, color: 'var(--muted-foreground)' },

  // Special / meta
  { tag: t.meta, color: 'var(--chart-5, oklch(0.65 0.2 30))' },
  { tag: t.annotation, color: 'var(--chart-5, oklch(0.65 0.2 30))' },
  { tag: t.processingInstruction, color: 'var(--muted-foreground)' },
  { tag: t.documentMeta, color: 'var(--muted-foreground)' },

  // Regular expressions
  { tag: t.regexp, color: 'var(--chart-1, oklch(0.646 0.222 41.116))' },
  { tag: t.escape, color: 'var(--chart-5, oklch(0.65 0.2 30))' },

  // Headings (markdown)
  { tag: t.heading, color: 'var(--primary)', fontWeight: 'bold' },
  { tag: t.heading1, color: 'var(--primary)', fontWeight: 'bold' },
  { tag: t.heading2, color: 'var(--primary)', fontWeight: 'bold' },
  { tag: t.heading3, color: 'var(--primary)', fontWeight: 'bold' },

  // Emphasis (markdown)
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },

  // Links
  { tag: t.link, color: 'var(--chart-2, oklch(0.6 0.118 184.704))', textDecoration: 'underline' },
  { tag: t.url, color: 'var(--chart-2, oklch(0.6 0.118 184.704))' },

  // Default text
  { tag: t.content, color: 'var(--foreground)' },
]);

/**
 * Minimal syntax highlighting - fewer token categories for simpler contexts.
 * Best for read-only or config-style content where full syntax coloring is distracting.
 */
const minimalHighlightStyle = HighlightStyle.define([
  // Keywords
  { tag: t.keyword, color: 'var(--chart-4, oklch(0.7 0.15 280))' },

  // Strings
  { tag: t.string, color: 'var(--chart-1, oklch(0.646 0.222 41.116))' },

  // Numbers
  { tag: t.number, color: 'var(--chart-3, oklch(0.7 0.15 150))' },

  // Comments
  { tag: t.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },

  // Properties / variables
  { tag: t.propertyName, color: 'var(--chart-2, oklch(0.6 0.118 184.704))' },
  { tag: t.variableName, color: 'var(--chart-2, oklch(0.6 0.118 184.704))' },

  // Tags (for XML)
  { tag: t.tagName, color: 'var(--primary)' },
  { tag: t.angleBracket, color: 'var(--muted-foreground)' },
  { tag: t.attributeName, color: 'var(--chart-2, oklch(0.6 0.118 184.704))' },
  { tag: t.attributeValue, color: 'var(--chart-1, oklch(0.646 0.222 41.116))' },

  // Booleans and null
  { tag: t.bool, color: 'var(--chart-4, oklch(0.7 0.15 280))' },
  { tag: t.null, color: 'var(--chart-4, oklch(0.7 0.15 280))' },

  // Punctuation
  { tag: t.bracket, color: 'var(--muted-foreground)' },
  { tag: t.punctuation, color: 'var(--muted-foreground)' },
  { tag: t.operator, color: 'var(--muted-foreground)' },

  // Default text
  { tag: t.content, color: 'var(--foreground)' },
]);

// ---------------------------------------------------------------------------
// Editor chrome themes (UI styling for the editor itself)
// ---------------------------------------------------------------------------

/**
 * Default editor chrome - full-featured with line numbers, gutters, and active line.
 * Suitable for the main code editor window and JSON editors.
 */
const defaultEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '0.8125rem',
    fontFamily: EDITOR_FONT_FAMILY,
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: EDITOR_FONT_FAMILY,
  },
  '.cm-content': {
    padding: '0.75rem',
    minHeight: '100%',
    caretColor: 'var(--primary)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--primary)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: SELECTION_BG,
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--accent)',
    opacity: '0.3',
  },
  '.cm-line': {
    padding: '0 0.25rem',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    border: 'none',
    paddingRight: '0.5rem',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '2.5rem',
    textAlign: 'right',
    paddingRight: '0.5rem',
  },
  '.cm-placeholder': {
    color: 'var(--muted-foreground)',
    fontStyle: 'italic',
  },
});

/**
 * Compact editor chrome - slightly larger font, visible gutters with border.
 * Suitable for the multi-tab code editor window with file browser.
 */
const compactEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    fontFamily: EDITOR_FONT_FAMILY,
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: EDITOR_FONT_FAMILY,
  },
  '.cm-content': {
    padding: '8px 0',
    minHeight: '100%',
    caretColor: 'var(--primary)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--primary)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: SELECTION_BG,
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--accent)',
    opacity: '0.3',
  },
  '.cm-line': {
    padding: '0 8px',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--background)',
    color: 'var(--muted-foreground)',
    border: 'none',
    borderRight: '1px solid var(--border)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '3rem',
    textAlign: 'right',
    paddingRight: '12px',
  },
  '.cm-placeholder': {
    color: 'var(--muted-foreground)',
    fontStyle: 'italic',
  },
});

/**
 * Inline editor chrome - transparent background, no gutters.
 * Suitable for XML/config editors embedded within other UI components.
 */
const inlineEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '0.875rem',
    fontFamily: 'ui-monospace, monospace',
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'ui-monospace, monospace',
  },
  '.cm-content': {
    padding: '1rem',
    minHeight: '100%',
    caretColor: 'var(--primary)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--primary)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: SELECTION_BG,
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-line': {
    padding: '0',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-placeholder': {
    color: 'var(--muted-foreground)',
    fontStyle: 'italic',
  },
});

/**
 * Minimal editor chrome - line numbers visible, no active line highlight.
 * Suitable for shell/script editors and read-only code views.
 */
const minimalEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '0.875rem',
    fontFamily: EDITOR_FONT_FAMILY,
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: EDITOR_FONT_FAMILY,
  },
  '.cm-content': {
    padding: '0.75rem',
    minHeight: '100%',
    caretColor: 'var(--primary)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--primary)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: SELECTION_BG,
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-line': {
    padding: '0 0.25rem',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    border: 'none',
    paddingRight: '0.5rem',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '2rem',
    textAlign: 'right',
    paddingRight: '0.5rem',
  },
  '.cm-placeholder': {
    color: 'var(--muted-foreground)',
    fontStyle: 'italic',
  },
});

// ---------------------------------------------------------------------------
// Helper to compose a SyntaxTheme
// ---------------------------------------------------------------------------

function createSyntaxTheme(
  name: string,
  description: string,
  highlightStyle: HighlightStyle,
  editorTheme: Extension
): SyntaxTheme {
  return {
    name,
    description,
    highlightStyle,
    editorTheme,
    extensions: [syntaxHighlighting(highlightStyle), editorTheme],
  };
}

// ---------------------------------------------------------------------------
// Theme presets
// ---------------------------------------------------------------------------

/**
 * All available syntax theme presets.
 *
 * Each preset combines a syntax highlight style with an editor chrome theme
 * optimized for a specific editor context:
 *
 * - **default**: Full-featured editor with line numbers, gutters, and active
 *   line highlighting. Best for JSON editors and primary code editing.
 *
 * - **compact**: Dense layout with bordered gutters, designed for multi-tab
 *   code editor windows where vertical space is at a premium.
 *
 * - **inline**: Transparent, gutter-less editor for embedding within other
 *   UI components (e.g., XML config editors).
 *
 * - **minimal**: Clean editor with line numbers but no active line highlight.
 *   Ideal for shell/script editors and read-only code views.
 */
export const syntaxThemes: Record<SyntaxThemeName, SyntaxTheme> = {
  default: createSyntaxTheme(
    'Default',
    'Full-featured editor with line numbers and active line highlighting',
    defaultHighlightStyle,
    defaultEditorTheme
  ),
  compact: createSyntaxTheme(
    'Compact',
    'Dense layout with bordered gutters for multi-tab code editors',
    defaultHighlightStyle,
    compactEditorTheme
  ),
  inline: createSyntaxTheme(
    'Inline',
    'Transparent editor without gutters for embedding in UI components',
    minimalHighlightStyle,
    inlineEditorTheme
  ),
  minimal: createSyntaxTheme(
    'Minimal',
    'Clean editor with line numbers, no active line highlight',
    defaultHighlightStyle,
    minimalEditorTheme
  ),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a syntax theme by name.
 *
 * @param name - The theme preset name ('default' | 'compact' | 'inline' | 'minimal')
 * @returns The complete SyntaxTheme object with highlight style, editor theme, and pre-composed extensions
 *
 * @example
 * ```ts
 * import { getSyntaxTheme } from '@/config/syntax-themes';
 *
 * const theme = getSyntaxTheme('default');
 * const extensions = [jsonLanguage, ...theme.extensions];
 *
 * <CodeMirror extensions={extensions} theme="none" />
 * ```
 */
export function getSyntaxTheme(name: SyntaxThemeName): SyntaxTheme {
  return syntaxThemes[name];
}

/**
 * Get just the highlight style from a theme.
 * Useful when you want the syntax colors but provide your own editor chrome.
 *
 * @param name - The theme preset name
 * @returns The HighlightStyle for the specified theme
 */
export function getHighlightStyle(name: SyntaxThemeName = 'default'): HighlightStyle {
  return syntaxThemes[name].highlightStyle;
}

/**
 * Get just the editor chrome theme from a theme.
 * Useful when you want the editor styling but provide your own syntax colors.
 *
 * @param name - The theme preset name
 * @returns The EditorView theme Extension for the specified theme
 */
export function getEditorTheme(name: SyntaxThemeName = 'default'): Extension {
  return syntaxThemes[name].editorTheme;
}

/** Default export for convenience */
export default syntaxThemes;
