import { describe, expect, it } from 'vitest';
import {
  buildChangedFileRows,
  buildDiffIndex,
  countDiffLines,
  isDirectoryRow,
  isSameFileList,
  normalizeRootPath,
  selectDiffsForPath,
  splitRowPath,
  toAbsolutePath,
} from '@/components/workbench/panes/use-changed-files';
import type { FileStatus } from '@/types/electron';

/**
 * The Changes pane's pure half.
 *
 * Every case here is one of the ways the old Diff tab showed the wrong thing:
 * a Windows project path joined to a forward-slashed git path, and a new
 * directory that git reports as one `?? dir/` row while the diff payload
 * carries a block per file inside it.
 */

function untrackedFileDiff(path: string, lines: string[]): string {
  return [
    `diff --git a/${path} b/${path}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${path}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
  ].join('\n');
}

const MODIFIED_DIFF = [
  'diff --git a/src/alpha.ts b/src/alpha.ts',
  'index 1111111..2222222 100644',
  '--- a/src/alpha.ts',
  '+++ b/src/alpha.ts',
  '@@ -1,3 +1,3 @@',
  ' const a = 1;',
  '-const b = 2;',
  '+const b = 3;',
].join('\n');

const NEW_DIRECTORY_DIFF = [
  untrackedFileDiff('src/feature/index.ts', ['export const x = 1;']),
  untrackedFileDiff('src/feature/util.ts', ['export const y = 2;', 'export const z = 3;']),
].join('\n');

function status(path: string, code: string, statusText = 'Changed'): FileStatus {
  return { path, status: code, statusText };
}

describe('normalizeRootPath', () => {
  it('gives a Windows project path and a git worktree path the same spelling', () => {
    expect(normalizeRootPath('C:\\repo\\dmaker')).toBe('C:/repo/dmaker');
    expect(normalizeRootPath('C:/repo/dmaker')).toBe('C:/repo/dmaker');
  });

  it('drops trailing separators so the join cannot double up', () => {
    expect(normalizeRootPath('C:\\repo\\dmaker\\')).toBe('C:/repo/dmaker');
    expect(normalizeRootPath('/home/dylan/repo//')).toBe('/home/dylan/repo');
  });
});

describe('toAbsolutePath', () => {
  it('joins the repo-relative path onto the root', () => {
    expect(toAbsolutePath('C:/repo/dmaker', 'src/alpha.ts')).toBe('C:/repo/dmaker/src/alpha.ts');
  });

  it('never produces a doubled separator', () => {
    expect(toAbsolutePath('C:/repo/dmaker', '/src/alpha.ts')).toBe('C:/repo/dmaker/src/alpha.ts');
    expect(toAbsolutePath('C:/repo/dmaker', 'src\\alpha.ts')).toBe('C:/repo/dmaker/src/alpha.ts');
  });
});

describe('splitRowPath', () => {
  it('splits a nested file into name and directory', () => {
    expect(splitRowPath('src/components/alpha.ts')).toEqual({
      name: 'alpha.ts',
      directory: 'src/components',
    });
  });

  it('leaves a root-level file with no directory', () => {
    expect(splitRowPath('README.md')).toEqual({ name: 'README.md', directory: '' });
  });

  it('keeps the trailing slash on a directory row so it still reads as one', () => {
    expect(isDirectoryRow('src/feature/')).toBe(true);
    expect(splitRowPath('src/feature/')).toEqual({ name: 'feature/', directory: 'src' });
  });
});

describe('buildDiffIndex', () => {
  it('keys on the b/ side of the header', () => {
    const index = buildDiffIndex(MODIFIED_DIFF);
    expect([...index.keys()]).toEqual(['src/alpha.ts']);
  });

  it('lets the first block win so a malformed header cannot evict a real file', () => {
    const malformed = ['diff --git nonsense', '@@ -1 +1 @@', '+broken'].join('\n');
    const index = buildDiffIndex([malformed, malformed].join('\n'));
    expect(index.get('unknown')?.hunks[0].lines[1].content).toBe('broken');
    expect(index.size).toBe(1);
  });
});

describe('selectDiffsForPath', () => {
  const index = buildDiffIndex([MODIFIED_DIFF, NEW_DIRECTORY_DIFF].join('\n'));

  it('returns nothing for no selection', () => {
    expect(selectDiffsForPath(index, null)).toEqual([]);
  });

  it('returns the exact file for an ordinary row', () => {
    expect(selectDiffsForPath(index, 'src/alpha.ts').map((file) => file.filePath)).toEqual([
      'src/alpha.ts',
    ]);
  });

  it('expands a `?? dir/` row into every file the diff carries for it', () => {
    expect(selectDiffsForPath(index, 'src/feature/').map((file) => file.filePath)).toEqual([
      'src/feature/index.ts',
      'src/feature/util.ts',
    ]);
  });

  it('finds an empty directory keyed without its trailing slash', () => {
    const emptyDirectory = buildDiffIndex(untrackedFileDiff('src/empty', []));
    expect(selectDiffsForPath(emptyDirectory, 'src/empty/').map((file) => file.filePath)).toEqual([
      'src/empty',
    ]);
  });

  it('returns nothing for a file the payload has no block for', () => {
    expect(selectDiffsForPath(index, 'src/missing.ts')).toEqual([]);
  });
});

describe('buildChangedFileRows', () => {
  it('passes ordinary files through untouched', () => {
    const index = buildDiffIndex(MODIFIED_DIFF);
    expect(buildChangedFileRows([status('src/alpha.ts', 'M', 'Modified')], index)).toEqual([
      { path: 'src/alpha.ts', status: 'M', statusText: 'Modified' },
    ]);
  });

  it('expands a new directory into one row per contained file, tagged with its group', () => {
    const index = buildDiffIndex(NEW_DIRECTORY_DIFF);
    expect(buildChangedFileRows([status('src/feature/', '?', 'Untracked')], index)).toEqual([
      {
        path: 'src/feature/index.ts',
        status: '?',
        statusText: 'Untracked',
        groupPath: 'src/feature/',
      },
      {
        path: 'src/feature/util.ts',
        status: '?',
        statusText: 'Untracked',
        groupPath: 'src/feature/',
      },
    ]);
  });

  it('keeps a directory row when nothing inside it produced a diff', () => {
    expect(buildChangedFileRows([status('dist/', '?', 'Untracked')], new Map())).toEqual([
      { path: 'dist/', status: '?', statusText: 'Untracked' },
    ]);
  });

  it('does not list a file twice when it arrives both directly and via its directory', () => {
    const index = buildDiffIndex(NEW_DIRECTORY_DIFF);
    const rows = buildChangedFileRows(
      [status('src/feature/index.ts', '?', 'Untracked'), status('src/feature/', '?', 'Untracked')],
      index
    );
    expect(rows.map((row) => row.path)).toEqual(['src/feature/index.ts', 'src/feature/util.ts']);
  });
});

describe('countDiffLines', () => {
  it('counts additions and deletions across every hunk', () => {
    const index = buildDiffIndex([MODIFIED_DIFF, NEW_DIRECTORY_DIFF].join('\n'));
    expect(countDiffLines([...index.values()])).toEqual({ additions: 4, deletions: 1 });
  });

  it('counts nothing for no diffs', () => {
    expect(countDiffLines([])).toEqual({ additions: 0, deletions: 0 });
  });
});

describe('isSameFileList', () => {
  const before = [status('src/alpha.ts', 'M', 'Modified')];

  it('treats an identical poll result as unchanged', () => {
    expect(isSameFileList(before, [status('src/alpha.ts', 'M', 'Modified')])).toBe(true);
  });

  it('notices a changed status, a new file and a removed one', () => {
    expect(isSameFileList(before, [status('src/alpha.ts', 'D', 'Deleted')])).toBe(false);
    expect(isSameFileList(before, [...before, status('src/beta.ts', 'M', 'Modified')])).toBe(false);
    expect(isSameFileList(before, [])).toBe(false);
  });
});
