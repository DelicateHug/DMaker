import { describe, it, expect } from 'vitest';
import {
  commentPrefixFor,
  ensureFrontmatter,
  generateScriptId,
  parseScriptFrontmatter,
  serializeFrontmatter,
  upsertFrontmatter,
} from '@/services/deploy-script-meta.js';

describe('deploy script frontmatter', () => {
  describe('commentPrefixFor', () => {
    it('uses // for JavaScript and TypeScript', () => {
      expect(commentPrefixFor('.js')).toBe('//');
      expect(commentPrefixFor('.ts')).toBe('//');
    });

    it('uses :: for batch files', () => {
      expect(commentPrefixFor('.bat')).toBe('::');
      expect(commentPrefixFor('.CMD')).toBe('::');
    });

    it('falls back to # for shell, PowerShell and Python', () => {
      expect(commentPrefixFor('.sh')).toBe('#');
      expect(commentPrefixFor('.ps1')).toBe('#');
      expect(commentPrefixFor('.py')).toBe('#');
      expect(commentPrefixFor('.unknown')).toBe('#');
    });
  });

  describe('generateScriptId', () => {
    it('produces a prefixed, unique id', () => {
      const first = generateScriptId();
      const second = generateScriptId();
      expect(first).toMatch(/^scr_[0-9a-f]{12}$/);
      expect(first).not.toBe(second);
    });
  });

  describe('parseScriptFrontmatter', () => {
    it('reads id, name and description from a hash-commented block', () => {
      const content = [
        '# --- dmaker ---',
        '# id: scr_abc123',
        '# name: Deploy Prod',
        '# description: Ships main to production',
        '# --- /dmaker ---',
        'echo hello',
      ].join('\n');

      expect(parseScriptFrontmatter(content)).toEqual({
        id: 'scr_abc123',
        name: 'Deploy Prod',
        description: 'Ships main to production',
      });
    });

    it('reads a block written with // or :: comments', () => {
      const js = ['// --- dmaker ---', '// id: scr_js', '// --- /dmaker ---'].join('\n');
      const bat = [':: --- dmaker ---', ':: id: scr_bat', ':: --- /dmaker ---'].join('\n');

      expect(parseScriptFrontmatter(js)?.id).toBe('scr_js');
      expect(parseScriptFrontmatter(bat)?.id).toBe('scr_bat');
    });

    it('looks past a shebang and blank lines', () => {
      const content = [
        '#!/usr/bin/env bash',
        '',
        '# --- dmaker ---',
        '# id: scr_shebang',
        '# --- /dmaker ---',
      ].join('\n');

      expect(parseScriptFrontmatter(content)?.id).toBe('scr_shebang');
    });

    it('returns null when there is no block', () => {
      expect(parseScriptFrontmatter('echo hello')).toBeNull();
    });

    it('returns null for a block with no id', () => {
      const content = ['# --- dmaker ---', '# name: Nameless', '# --- /dmaker ---'].join('\n');
      expect(parseScriptFrontmatter(content)).toBeNull();
    });

    it('ignores an unterminated block rather than eating the file', () => {
      const content = ['# --- dmaker ---', '# id: scr_open', 'echo hello'].join('\n');
      expect(parseScriptFrontmatter(content)).toBeNull();
    });

    it('ignores a block that does not sit at the top', () => {
      const content = [
        'echo hello',
        '# --- dmaker ---',
        '# id: scr_late',
        '# --- /dmaker ---',
      ].join('\n');
      expect(parseScriptFrontmatter(content)).toBeNull();
    });
  });

  describe('serializeFrontmatter', () => {
    it('omits optional fields that are absent', () => {
      expect(serializeFrontmatter({ id: 'scr_1' }, '.sh')).toBe(
        ['# --- dmaker ---', '# id: scr_1', '# --- /dmaker ---'].join('\n')
      );
    });
  });

  describe('upsertFrontmatter', () => {
    it('inserts a block above the body', () => {
      const result = upsertFrontmatter('echo hello\n', { id: 'scr_new' }, '.sh');
      expect(result.startsWith('# --- dmaker ---\n# id: scr_new\n# --- /dmaker ---\n')).toBe(true);
      expect(result).toContain('echo hello');
    });

    it('keeps a shebang on the first line', () => {
      const result = upsertFrontmatter('#!/usr/bin/env bash\necho hi\n', { id: 'scr_sb' }, '.sh');
      expect(result.split('\n')[0]).toBe('#!/usr/bin/env bash');
      expect(result.split('\n')[1]).toBe('# --- dmaker ---');
      expect(result).toContain('echo hi');
    });

    it('replaces an existing block instead of stacking a second one', () => {
      const original = [
        '# --- dmaker ---',
        '# id: scr_old',
        '# name: Old',
        '# --- /dmaker ---',
        'echo hello',
      ].join('\n');

      const result = upsertFrontmatter(original, { id: 'scr_old', name: 'New' }, '.sh');

      expect(result.match(/--- dmaker ---/g)).toHaveLength(1);
      expect(parseScriptFrontmatter(result)).toEqual({
        id: 'scr_old',
        name: 'New',
        description: undefined,
      });
      expect(result).toContain('echo hello');
    });

    it('does not add a leading blank line to an empty file', () => {
      expect(upsertFrontmatter('', { id: 'scr_empty' }, '.sh')).toBe(
        ['# --- dmaker ---', '# id: scr_empty', '# --- /dmaker ---'].join('\n')
      );
    });

    it('preserves CRLF line endings', () => {
      const result = upsertFrontmatter('@echo off\r\n', { id: 'scr_bat' }, '.bat');
      expect(result).toContain('\r\n');
      expect(result).not.toMatch(/[^\r]\n/);
      expect(parseScriptFrontmatter(result)?.id).toBe('scr_bat');
    });
  });

  describe('ensureFrontmatter', () => {
    it('leaves a file that already has an id untouched', () => {
      const content = ['# --- dmaker ---', '# id: scr_keep', '# --- /dmaker ---', 'echo'].join(
        '\n'
      );
      const { meta, updatedContent } = ensureFrontmatter(content, '.sh');

      expect(meta.id).toBe('scr_keep');
      expect(updatedContent).toBeNull();
    });

    it('stamps a new id into a file that has none', () => {
      const { meta, updatedContent } = ensureFrontmatter('echo hello', '.sh');

      expect(meta.id).toMatch(/^scr_[0-9a-f]{12}$/);
      expect(updatedContent).not.toBeNull();
      expect(parseScriptFrontmatter(updatedContent!)?.id).toBe(meta.id);
      expect(updatedContent).toContain('echo hello');
    });
  });
});
