import { describe, it, expect } from 'vitest';
import { parseDiff } from '@/components/workbench/panes/diff-view';

/**
 * `parseDiff` was private to git-diff-panel.tsx and therefore untested. These
 * cases pin the behaviour as it stands so the extraction is provably a move,
 * and so the Changes pane can key a file map on `filePath` with confidence.
 */

// A real `git diff HEAD` pair: one modified file, one deleted. Deliberately no
// trailing newline — the trailing-newline case is pinned separately below.
const TWO_FILE_DIFF = [
  'diff --git a/src/alpha.ts b/src/alpha.ts',
  'index 1111111..2222222 100644',
  '--- a/src/alpha.ts',
  '+++ b/src/alpha.ts',
  '@@ -1,3 +1,4 @@',
  ' const a = 1;',
  '-const b = 2;',
  '+const b = 3;',
  '+const c = 4;',
  ' export { a };',
  'diff --git a/src/beta.ts b/src/beta.ts',
  'deleted file mode 100644',
  'index 3333333..0000000',
  '--- a/src/beta.ts',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-const gone = true;',
  '-export { gone };',
].join('\n');

const RENAME_DIFF = [
  'diff --git a/src/old-name.ts b/src/new-name.ts',
  'similarity index 92%',
  'rename from src/old-name.ts',
  'rename to src/new-name.ts',
  'index 4444444..5555555 100644',
  '--- a/src/old-name.ts',
  '+++ b/src/new-name.ts',
  '@@ -1,2 +1,2 @@',
  "-const label = 'old';",
  "+const label = 'new';",
  ' export { label };',
].join('\n');

// Byte-for-byte the shape `createNewFileDiff` emits in libs/git-utils/src/diff.ts
// for an untracked file, trailing newline included. `git diff HEAD` never
// reports untracked files, so this synthetic block is the ONLY way a new file
// reaches the parser.
const UNTRACKED_FILE_DIFF = `diff --git a/notes/new-file.md b/notes/new-file.md
new file mode 100644
index 0000000..0000000
--- /dev/null
+++ b/notes/new-file.md
@@ -0,0 +1,2 @@
+first line
+second line
`;

describe('parseDiff', () => {
  it('splits a multi-file diff at each `diff --git` boundary', () => {
    const files = parseDiff(TWO_FILE_DIFF);

    expect(files).toHaveLength(2);
    expect(files.map((f) => f.filePath)).toEqual(['src/alpha.ts', 'src/beta.ts']);
    expect(files[0].hunks).toHaveLength(1);
    expect(files[1].hunks).toHaveLength(1);
  });

  it('classifies each line and numbers the old and new sides independently', () => {
    const [alpha] = parseDiff(TWO_FILE_DIFF);

    expect(alpha.hunks[0].header).toBe('@@ -1,3 +1,4 @@');
    expect(alpha.hunks[0].lines).toEqual([
      { type: 'header', content: '@@ -1,3 +1,4 @@' },
      { type: 'context', content: 'const a = 1;', lineNumber: { old: 1, new: 1 } },
      { type: 'deletion', content: 'const b = 2;', lineNumber: { old: 2 } },
      { type: 'addition', content: 'const b = 3;', lineNumber: { new: 2 } },
      { type: 'addition', content: 'const c = 4;', lineNumber: { new: 3 } },
      { type: 'context', content: 'export { a };', lineNumber: { old: 3, new: 4 } },
    ]);
  });

  it('flags a deleted file and drops the `--- ` / `+++ ` header lines', () => {
    const [, beta] = parseDiff(TWO_FILE_DIFF);

    expect(beta.isDeleted).toBe(true);
    expect(beta.isNew).toBeUndefined();
    // '+++ /dev/null' must not survive as an addition, or every deletion hunk
    // gains a phantom first line.
    expect(beta.hunks[0].lines.filter((l) => l.type === 'addition')).toEqual([]);
    expect(beta.hunks[0].lines.filter((l) => l.type === 'deletion')).toEqual([
      { type: 'deletion', content: 'const gone = true;', lineNumber: { old: 1 } },
      { type: 'deletion', content: 'export { gone };', lineNumber: { old: 2 } },
    ]);
  });

  it('keys a rename on the b/ side, so the map matches the path git status reports', () => {
    const [renamed] = parseDiff(RENAME_DIFF);

    expect(renamed.filePath).toBe('src/new-name.ts');
    expect(renamed.isRenamed).toBe(true);
  });

  it('parses a synthetic untracked-file diff as a new file of pure additions', () => {
    const files = parseDiff(UNTRACKED_FILE_DIFF);

    expect(files).toHaveLength(1);
    expect(files[0].filePath).toBe('notes/new-file.md');
    expect(files[0].isNew).toBe(true);
    expect(files[0].hunks[0].lines.filter((l) => l.type === 'addition')).toEqual([
      { type: 'addition', content: 'first line', lineNumber: { new: 1 } },
      { type: 'addition', content: 'second line', lineNumber: { new: 2 } },
    ]);
  });

  it('turns the trailing newline into one empty context line', () => {
    const [file] = parseDiff(UNTRACKED_FILE_DIFF);
    const lines = file.hunks[0].lines;

    // Pre-existing behaviour, pinned rather than endorsed: split('\n') on a
    // newline-terminated diff yields a final '' element, which falls into the
    // context branch. Every file in a real `git diff` payload therefore ends
    // with a blank rendered row. Fixing it is a behaviour change, not part of
    // this extraction.
    expect(lines[lines.length - 1]).toEqual({
      type: 'context',
      content: '',
      lineNumber: { old: 0, new: 3 },
    });
  });

  it('returns an empty array for an empty diff rather than a one-file placeholder', () => {
    expect(parseDiff('')).toEqual([]);
  });
});
