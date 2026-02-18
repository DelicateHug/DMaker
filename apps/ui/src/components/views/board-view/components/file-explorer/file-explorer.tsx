import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getElectronAPI, type FileEntry } from '@/lib/electron';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  isLoading?: boolean;
  isExpanded?: boolean;
}

interface FileExplorerProps {
  projectPath: string | null;
  onFileSelect: (filePath: string) => void;
  className?: string;
}

// Get file icon based on extension
function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const codeExtensions = [
    'ts',
    'tsx',
    'js',
    'jsx',
    'py',
    'ps1',
    'sh',
    'bash',
    'json',
    'yaml',
    'yml',
    'toml',
    'xml',
    'html',
    'css',
    'scss',
    'less',
    'sql',
    'go',
    'rs',
    'java',
    'c',
    'cpp',
    'h',
    'hpp',
    'cs',
    'rb',
    'php',
    'swift',
    'kt',
    'vue',
    'svelte',
  ];
  const textExtensions = [
    'md',
    'txt',
    'log',
    'ini',
    'cfg',
    'conf',
    'env',
    'gitignore',
    'dockerignore',
    'editorconfig',
  ];

  if (codeExtensions.includes(ext || '')) {
    return FileCode;
  }
  if (textExtensions.includes(ext || '')) {
    return FileText;
  }
  return File;
}

// Check if a directory should be hidden/ignored (only noisy build artifacts)
function shouldHideEntry(name: string): boolean {
  const hiddenPatterns = ['node_modules', '__pycache__', '.tox', '.nox'];
  return hiddenPatterns.includes(name);
}

interface FileTreeItemProps {
  node: FileNode;
  depth: number;
  expandedPaths: Set<string>;
  onFileSelect: (filePath: string) => void;
  onToggleExpand: (path: string) => void;
  onLoadChildren: (path: string) => Promise<void>;
}

function FileTreeItem({
  node,
  depth,
  expandedPaths,
  onFileSelect,
  onToggleExpand,
  onLoadChildren,
}: FileTreeItemProps) {
  const [isOpen, setIsOpen] = useState(node.isExpanded || false);

  // Keep local isOpen state in sync with parent's expanded state
  useEffect(() => {
    setIsOpen(node.isExpanded || false);
  }, [node.isExpanded]);

  const Icon = node.isDirectory ? (isOpen ? FolderOpen : Folder) : getFileIcon(node.name);

  const handleClick = useCallback(async () => {
    if (node.isDirectory) {
      const newIsOpen = !isOpen;
      setIsOpen(newIsOpen);
      onToggleExpand(node.path);

      if (newIsOpen && !node.children) {
        await onLoadChildren(node.path);
      }
    } else {
      onFileSelect(node.path);
    }
  }, [node, isOpen, onFileSelect, onToggleExpand, onLoadChildren]);

  const paddingLeft = depth * 12 + 8;

  if (node.isDirectory) {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              'flex w-full items-center gap-1 py-1 text-sm hover:bg-accent/50 rounded-sm transition-colors',
              'focus:outline-none focus:bg-accent/50'
            )}
            style={{ paddingLeft }}
            onClick={handleClick}
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <Icon
              className={cn('h-4 w-4 shrink-0', isOpen ? 'text-yellow-500' : 'text-yellow-600')}
            />
            <span className="truncate text-foreground">{node.name}</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {node.isLoading ? (
            <div
              className="flex items-center gap-2 py-1 text-sm text-muted-foreground"
              style={{ paddingLeft: paddingLeft + 20 }}
            >
              <RefreshCw className="h-3 w-3 animate-spin" />
              Loading...
            </div>
          ) : (
            node.children?.map((child) => (
              <FileTreeItem
                key={child.path}
                node={{ ...child, isExpanded: expandedPaths.has(child.path) }}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                onFileSelect={onFileSelect}
                onToggleExpand={onToggleExpand}
                onLoadChildren={onLoadChildren}
              />
            ))
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <button
      className={cn(
        'flex w-full items-center gap-1 py-1 text-sm hover:bg-accent/50 rounded-sm transition-colors',
        'focus:outline-none focus:bg-accent/50'
      )}
      style={{ paddingLeft: paddingLeft + 16 }}
      onClick={handleClick}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-foreground">{node.name}</span>
    </button>
  );
}

export function FileExplorer({ projectPath, onFileSelect, className }: FileExplorerProps) {
  const [rootNodes, setRootNodes] = useState<FileNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const expandedPathsRef = useRef<Set<string>>(expandedPaths);

  // Keep ref in sync with state so loadRootDirectory can access current expanded paths
  useEffect(() => {
    expandedPathsRef.current = expandedPaths;
  }, [expandedPaths]);

  const loadDirectory = useCallback(async (dirPath: string): Promise<FileNode[]> => {
    const api = getElectronAPI();
    const result = await api.readdir(dirPath);

    if (!result.success || !result.entries) {
      throw new Error(result.error || 'Failed to read directory');
    }

    // Filter and sort entries
    const filteredEntries = result.entries
      .filter((entry: FileEntry) => !shouldHideEntry(entry.name))
      .sort((a: FileEntry, b: FileEntry) => {
        // Directories first, then alphabetically
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

    return filteredEntries.map((entry: FileEntry) => ({
      name: entry.name,
      path: `${dirPath}/${entry.name}`.replace(/\\/g, '/'),
      isDirectory: entry.isDirectory,
      children: undefined,
      isLoading: false,
      isExpanded: false,
    }));
  }, []);

  // Recursively reload children for expanded directories to preserve tree state
  const loadExpandedChildren = useCallback(
    async (nodes: FileNode[], expanded: Set<string>): Promise<FileNode[]> => {
      return Promise.all(
        nodes.map(async (node) => {
          if (node.isDirectory && expanded.has(node.path)) {
            try {
              const children = await loadDirectory(node.path);
              const childrenWithExpanded = await loadExpandedChildren(children, expanded);
              return { ...node, children: childrenWithExpanded, isExpanded: true };
            } catch {
              return node;
            }
          }
          return node;
        })
      );
    },
    [loadDirectory]
  );

  const loadRootDirectory = useCallback(async () => {
    if (!projectPath) {
      setRootNodes([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nodes = await loadDirectory(projectPath);
      // Reload children for any currently expanded directories to preserve tree state
      const currentExpanded = expandedPathsRef.current;
      const nodesWithExpanded =
        currentExpanded.size > 0 ? await loadExpandedChildren(nodes, currentExpanded) : nodes;
      setRootNodes(nodesWithExpanded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
      setRootNodes([]);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath, loadDirectory, loadExpandedChildren]);

  useEffect(() => {
    loadRootDirectory();
  }, [loadRootDirectory]);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleLoadChildren = useCallback(
    async (path: string) => {
      // Mark node as loading
      setRootNodes((prev) => updateNodeLoading(prev, path, true));

      try {
        const children = await loadDirectory(path);
        setRootNodes((prev) => updateNodeChildren(prev, path, children));
      } catch (err) {
        console.error('Failed to load directory:', err);
        setRootNodes((prev) => updateNodeLoading(prev, path, false));
      }
    },
    [loadDirectory]
  );

  if (!projectPath) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-medium">Files</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-muted-foreground text-center">
            Select a project to browse files
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-medium">Files</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={loadRootDirectory}
          disabled={isLoading}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {isLoading && rootNodes.length === 0 ? (
          <div className="flex items-center justify-center p-4">
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : rootNodes.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">No files found</div>
        ) : (
          <div className="py-1">
            {rootNodes.map((node) => (
              <FileTreeItem
                key={node.path}
                node={{ ...node, isExpanded: expandedPaths.has(node.path) }}
                depth={0}
                expandedPaths={expandedPaths}
                onFileSelect={onFileSelect}
                onToggleExpand={handleToggleExpand}
                onLoadChildren={handleLoadChildren}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// Helper functions to update nested node state
function updateNodeLoading(nodes: FileNode[], path: string, isLoading: boolean): FileNode[] {
  return nodes.map((node) => {
    if (node.path === path) {
      return { ...node, isLoading };
    }
    if (node.children) {
      return { ...node, children: updateNodeLoading(node.children, path, isLoading) };
    }
    return node;
  });
}

function updateNodeChildren(nodes: FileNode[], path: string, children: FileNode[]): FileNode[] {
  return nodes.map((node) => {
    if (node.path === path) {
      return { ...node, children, isLoading: false };
    }
    if (node.children) {
      return { ...node, children: updateNodeChildren(node.children, path, children) };
    }
    return node;
  });
}
