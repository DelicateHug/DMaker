import { File, FileText, FilePlus, FileX, FilePen } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Presentation-free primitives for rendering a unified diff.
 *
 * These lived inside `components/ui/git-diff-panel.tsx` and were private to it,
 * so a second consumer had to either re-implement `parseDiff` or import the
 * whole collapsible card. Both of those produce two parsers that drift; this
 * module is the one copy. `git-diff-panel.tsx` keeps its shell and imports from
 * here — nothing about its behaviour changed in the move.
 */

export interface ParsedDiffHunk {
  header: string;
  lines: {
    type: 'context' | 'addition' | 'deletion' | 'header';
    content: string;
    lineNumber?: { old?: number; new?: number };
  }[];
}

export interface ParsedFileDiff {
  filePath: string;
  hunks: ParsedDiffHunk[];
  isNew?: boolean;
  isDeleted?: boolean;
  isRenamed?: boolean;
}

export const getFileIcon = (status: string) => {
  switch (status) {
    case 'A':
    case '?':
      return <FilePlus className="w-4 h-4 text-green-500" />;
    case 'D':
      return <FileX className="w-4 h-4 text-red-500" />;
    case 'M':
    case 'U':
      return <FilePen className="w-4 h-4 text-amber-500" />;
    case 'R':
    case 'C':
      return <File className="w-4 h-4 text-blue-500" />;
    default:
      return <FileText className="w-4 h-4 text-muted-foreground" />;
  }
};

export const getStatusBadgeColor = (status: string) => {
  switch (status) {
    case 'A':
    case '?':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'D':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'M':
    case 'U':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'R':
    case 'C':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
};

export const getStatusDisplayName = (status: string) => {
  switch (status) {
    case 'A':
      return 'Added';
    case '?':
      return 'Untracked';
    case 'D':
      return 'Deleted';
    case 'M':
      return 'Modified';
    case 'U':
      return 'Updated';
    case 'R':
      return 'Renamed';
    case 'C':
      return 'Copied';
    default:
      return 'Changed';
  }
};

/**
 * Parse unified diff format into structured data
 */
export function parseDiff(diffText: string): ParsedFileDiff[] {
  if (!diffText) return [];

  const files: ParsedFileDiff[] = [];
  const lines = diffText.split('\n');
  let currentFile: ParsedFileDiff | null = null;
  let currentHunk: ParsedDiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New file diff
    if (line.startsWith('diff --git')) {
      if (currentFile) {
        if (currentHunk) {
          currentFile.hunks.push(currentHunk);
        }
        files.push(currentFile);
      }
      // Extract file path from diff header
      const match = line.match(/diff --git a\/(.*?) b\/(.*)/);
      currentFile = {
        filePath: match ? match[2] : 'unknown',
        hunks: [],
      };
      currentHunk = null;
      continue;
    }

    // New file indicator
    if (line.startsWith('new file mode')) {
      if (currentFile) currentFile.isNew = true;
      continue;
    }

    // Deleted file indicator
    if (line.startsWith('deleted file mode')) {
      if (currentFile) currentFile.isDeleted = true;
      continue;
    }

    // Renamed file indicator
    if (line.startsWith('rename from') || line.startsWith('rename to')) {
      if (currentFile) currentFile.isRenamed = true;
      continue;
    }

    // Skip index, ---/+++ lines
    if (line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      continue;
    }

    // Hunk header
    if (line.startsWith('@@')) {
      if (currentHunk && currentFile) {
        currentFile.hunks.push(currentHunk);
      }
      // Parse line numbers from @@ -old,count +new,count @@
      const hunkMatch = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      oldLineNum = hunkMatch ? parseInt(hunkMatch[1], 10) : 1;
      newLineNum = hunkMatch ? parseInt(hunkMatch[2], 10) : 1;
      currentHunk = {
        header: line,
        lines: [{ type: 'header', content: line }],
      };
      continue;
    }

    // Diff content lines
    if (currentHunk) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'addition',
          content: line.substring(1),
          lineNumber: { new: newLineNum },
        });
        newLineNum++;
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'deletion',
          content: line.substring(1),
          lineNumber: { old: oldLineNum },
        });
        oldLineNum++;
      } else if (line.startsWith(' ') || line === '') {
        currentHunk.lines.push({
          type: 'context',
          content: line.substring(1) || '',
          lineNumber: { old: oldLineNum, new: newLineNum },
        });
        oldLineNum++;
        newLineNum++;
      }
    }
  }

  // Don't forget the last file and hunk
  if (currentFile) {
    if (currentHunk) {
      currentFile.hunks.push(currentHunk);
    }
    files.push(currentFile);
  }

  return files;
}

export function DiffLine({
  type,
  content,
  lineNumber,
}: {
  type: 'context' | 'addition' | 'deletion' | 'header';
  content: string;
  lineNumber?: { old?: number; new?: number };
}) {
  const bgClass = {
    context: 'bg-transparent',
    addition: 'bg-green-500/10',
    deletion: 'bg-red-500/10',
    header: 'bg-blue-500/10',
  };

  const textClass = {
    context: 'text-foreground-secondary',
    addition: 'text-green-400',
    deletion: 'text-red-400',
    header: 'text-blue-400',
  };

  const prefix = {
    context: ' ',
    addition: '+',
    deletion: '-',
    header: '',
  };

  if (type === 'header') {
    return (
      <div className={cn('px-2 py-1 font-mono text-xs', bgClass[type], textClass[type])}>
        {content}
      </div>
    );
  }

  return (
    <div className={cn('flex font-mono text-xs', bgClass[type])}>
      <span className="w-12 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border-glass">
        {lineNumber?.old ?? ''}
      </span>
      <span className="w-12 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border-glass">
        {lineNumber?.new ?? ''}
      </span>
      <span className={cn('w-4 flex-shrink-0 text-center select-none', textClass[type])}>
        {prefix[type]}
      </span>
      <span className={cn('flex-1 px-2 whitespace-pre-wrap break-all', textClass[type])}>
        {content || '\u00A0'}
      </span>
    </div>
  );
}
