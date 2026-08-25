/**
 * Deploy script frontmatter
 *
 * Every deploy script carries a small comment block at the top of the file
 * that gives it a stable identity:
 *
 * ```
 * # --- dmaker ---
 * # id: scr_8f3a21c47b0e
 * # name: Deploy Prod
 * # description: Ships main to production
 * # --- /dmaker ---
 * ```
 *
 * The id is what run history binds to, so renaming or moving a script keeps
 * its runs attached. The comment prefix follows the script's language, and a
 * shebang always stays on line one.
 */

import crypto from 'crypto';

/** Parsed frontmatter fields. Only `id` is ever guaranteed. */
export interface ScriptMeta {
  id: string;
  name?: string;
  description?: string;
}

/** Fence text, written between the comment prefix and the end of the line. */
const OPEN_FENCE = '--- dmaker ---';
const CLOSE_FENCE = '--- /dmaker ---';

/** Comment prefixes we understand, in the order we try them when parsing. */
const COMMENT_PREFIXES = ['#', '//', '::', 'REM'] as const;

/** The comment prefix a given script extension should be written with. */
export function commentPrefixFor(extension: string): string {
  switch (extension.toLowerCase()) {
    case '.js':
    case '.ts':
      return '//';
    case '.bat':
    case '.cmd':
      return '::';
    default:
      // .ps1, .sh, .py and anything else fall back to '#'
      return '#';
  }
}

/** Generate a fresh script id. */
export function generateScriptId(): string {
  return `scr_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Strip a leading comment prefix from a line.
 *
 * @returns The remainder of the line, or null if the line is not a comment.
 */
function stripCommentPrefix(line: string): string | null {
  const trimmed = line.trim();
  for (const prefix of COMMENT_PREFIXES) {
    if (trimmed.toUpperCase().startsWith(prefix.toUpperCase())) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return null;
}

/** Does this line look like a shebang? */
function isShebang(line: string): boolean {
  return line.startsWith('#!');
}

/**
 * Locate the frontmatter block in a script's content.
 *
 * @returns Line indices of the fences, or null when there is no block.
 */
function locateBlock(lines: string[]): { start: number; end: number } | null {
  // The block must sit at the very top, allowing a shebang and blank lines.
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (index === 0 && isShebang(line)) {
      index += 1;
      continue;
    }
    if (line.trim() === '') {
      index += 1;
      continue;
    }
    break;
  }

  const opener = index < lines.length ? stripCommentPrefix(lines[index]) : null;
  if (opener !== OPEN_FENCE) return null;

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    if (stripCommentPrefix(lines[cursor]) === CLOSE_FENCE) {
      return { start: index, end: cursor };
    }
  }

  // An unterminated opener is not a block — leave the file alone.
  return null;
}

/**
 * Read the frontmatter out of a script's content.
 *
 * @returns The parsed meta, or null when the script has no frontmatter (or
 *   has a block with no usable id).
 */
export function parseScriptFrontmatter(content: string): ScriptMeta | null {
  const lines = content.split(/\r?\n/);
  const block = locateBlock(lines);
  if (!block) return null;

  const fields: Record<string, string> = {};
  for (let cursor = block.start + 1; cursor < block.end; cursor += 1) {
    const body = stripCommentPrefix(lines[cursor]);
    if (body === null) continue;
    const separator = body.indexOf(':');
    if (separator <= 0) continue;
    const key = body.slice(0, separator).trim().toLowerCase();
    const value = body.slice(separator + 1).trim();
    if (key) fields[key] = value;
  }

  if (!fields.id) return null;

  return {
    id: fields.id,
    name: fields.name || undefined,
    description: fields.description || undefined,
  };
}

/** Render a frontmatter block for the given script language. */
export function serializeFrontmatter(meta: ScriptMeta, extension: string): string {
  const prefix = commentPrefixFor(extension);
  const lines = [`${prefix} ${OPEN_FENCE}`, `${prefix} id: ${meta.id}`];
  if (meta.name) lines.push(`${prefix} name: ${meta.name}`);
  if (meta.description) lines.push(`${prefix} description: ${meta.description}`);
  lines.push(`${prefix} ${CLOSE_FENCE}`);
  return lines.join('\n');
}

/**
 * Insert or replace a script's frontmatter block, preserving a shebang and
 * the script body.
 *
 * @param content - Current file contents
 * @param meta - Frontmatter to write
 * @param extension - Script extension, which decides the comment prefix
 * @returns The updated file contents
 */
export function upsertFrontmatter(content: string, meta: ScriptMeta, extension: string): string {
  const usesCrlf = content.includes('\r\n');
  const lines = content.split(/\r?\n/);
  const block = serializeFrontmatter(meta, extension).split('\n');
  const existing = locateBlock(lines);

  let next: string[];
  if (existing) {
    next = [...lines.slice(0, existing.start), ...block, ...lines.slice(existing.end + 1)];
  } else if (lines.length > 0 && isShebang(lines[0])) {
    next = [lines[0], ...block, ...lines.slice(1)];
  } else {
    // A brand-new or bodyless file should not gain a leading blank line.
    const body = lines.length === 1 && lines[0].trim() === '' ? [] : lines;
    next = [...block, ...body];
  }

  const joined = next.join('\n');
  return usesCrlf ? joined.replace(/\n/g, '\r\n') : joined;
}

/**
 * Read the frontmatter from a script, generating an id when it has none.
 *
 * @returns The meta plus the content that should be written back, or null
 *   for `updatedContent` when the file already had a usable id.
 */
export function ensureFrontmatter(
  content: string,
  extension: string
): { meta: ScriptMeta; updatedContent: string | null } {
  const existing = parseScriptFrontmatter(content);
  if (existing) {
    return { meta: existing, updatedContent: null };
  }
  const meta: ScriptMeta = { id: generateScriptId() };
  return { meta, updatedContent: upsertFrontmatter(content, meta, extension) };
}
