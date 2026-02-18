import { useState, useEffect, useCallback } from 'react';
import {
  FolderOpen,
  Folder,
  ChevronRight,
  HardDrive,
  Clock,
  X,
  FileIcon,
  FileCode,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PathInput } from '@/components/ui/path-input';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { getDefaultWorkspaceDirectory, saveLastProjectDirectory } from '@/lib/workspace-config';
import { useOSDetection } from '@/hooks';
import { apiPost } from '@/lib/api-fetch';
import { useAppStore } from '@/store/app-store';

interface DirectoryEntry {
  name: string;
  path: string;
}

interface FileEntry {
  name: string;
  path: string;
}

interface BrowseResult {
  success: boolean;
  currentPath: string;
  parentPath: string | null;
  directories: DirectoryEntry[];
  files?: FileEntry[];
  drives?: string[];
  error?: string;
  warning?: string;
}

export type FileBrowserMode = 'directory' | 'file';

interface FileBrowserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
  title?: string;
  description?: string;
  initialPath?: string;
  /** Whether to select a directory or a file. Defaults to 'directory'. */
  mode?: FileBrowserMode;
  /** File extensions to filter by when mode is 'file' (e.g. ['sh', 'py', 'js']). */
  fileExtensions?: string[];
}

const MAX_RECENT_FOLDERS = 5;

export function FileBrowserDialog({
  open,
  onOpenChange,
  onSelect,
  title,
  description,
  initialPath,
  mode = 'directory',
  fileExtensions,
}: FileBrowserDialogProps) {
  const isFileMode = mode === 'file';
  const resolvedTitle = title || (isFileMode ? 'Select File' : 'Select Project Directory');
  const resolvedDescription =
    description ||
    (isFileMode
      ? 'Navigate to the file you want to select'
      : 'Navigate to your project folder or paste a path directly');

  const { isMac } = useOSDetection();
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [drives, setDrives] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  // Use recent folders from app store (synced via API)
  const recentFolders = useAppStore((s) => s.recentFolders);
  const setRecentFolders = useAppStore((s) => s.setRecentFolders);
  const addRecentFolder = useAppStore((s) => s.addRecentFolder);

  const handleRemoveRecent = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      const updated = recentFolders.filter((p) => p !== path);
      setRecentFolders(updated);
    },
    [recentFolders, setRecentFolders]
  );

  const browseDirectory = useCallback(
    async (dirPath?: string) => {
      setLoading(true);
      setError('');
      setWarning('');
      setSelectedFile(null);

      try {
        const body: Record<string, unknown> = { dirPath };
        if (isFileMode) {
          body.includeFiles = true;
          if (fileExtensions && fileExtensions.length > 0) {
            body.fileExtensions = fileExtensions;
          }
        }

        const result = await apiPost<BrowseResult>('/api/fs/browse', body);

        if (result.success) {
          setCurrentPath(result.currentPath);
          setParentPath(result.parentPath);
          setDirectories(result.directories);
          setFiles(result.files || []);
          setDrives(result.drives || []);
          setWarning(result.warning || '');
        } else {
          setError(result.error || 'Failed to browse directory');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load directories');
      } finally {
        setLoading(false);
      }
    },
    [isFileMode, fileExtensions]
  );

  const handleSelectRecent = useCallback(
    (path: string) => {
      browseDirectory(path);
    },
    [browseDirectory]
  );

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setCurrentPath('');
      setParentPath(null);
      setDirectories([]);
      setFiles([]);
      setSelectedFile(null);
      setError('');
      setWarning('');
    }
  }, [open]);

  // Load initial path or workspace directory when dialog opens
  useEffect(() => {
    if (open && !currentPath) {
      // Priority order:
      // 1. initialPath prop (from parent component) - always takes priority when provided
      // 2. Default workspace directory (last used > Documents/Automaker > DATA_DIR)
      // 3. Home directory
      const loadInitialPath = async () => {
        // If initialPath is explicitly provided, use it directly (e.g. file selection starting at project dir)
        if (initialPath) {
          browseDirectory(initialPath);
          return;
        }

        try {
          const defaultDir = await getDefaultWorkspaceDirectory();

          if (defaultDir) {
            browseDirectory(defaultDir);
          } else {
            browseDirectory();
          }
        } catch {
          browseDirectory();
        }
      };

      loadInitialPath();
    }
  }, [open, initialPath, currentPath, browseDirectory]);

  const handleSelectDirectory = (dir: DirectoryEntry) => {
    browseDirectory(dir.path);
  };

  const handleGoHome = useCallback(() => {
    browseDirectory();
  }, [browseDirectory]);

  const handleNavigate = useCallback(
    (path: string) => {
      browseDirectory(path);
    },
    [browseDirectory]
  );

  const handleSelectDrive = (drivePath: string) => {
    browseDirectory(drivePath);
  };

  const handleSelect = useCallback(() => {
    if (isFileMode) {
      if (selectedFile) {
        onSelect(selectedFile);
        onOpenChange(false);
      }
    } else if (currentPath) {
      addRecentFolder(currentPath);
      // Save to last project directory so it's used as default next time
      saveLastProjectDirectory(currentPath);
      onSelect(currentPath);
      onOpenChange(false);
    }
  }, [isFileMode, selectedFile, currentPath, onSelect, onOpenChange]);

  // Handle Command/Ctrl+Enter keyboard shortcut to select current folder
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Command+Enter (Mac) or Ctrl+Enter (Windows/Linux)
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const canSelect = isFileMode ? !!selectedFile : !!currentPath;
        if (canSelect && !loading) {
          handleSelect();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentPath, loading, handleSelect]);

  // Helper to get folder name from path
  const getFolderName = (path: string) => {
    const parts = path.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1] || path;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-popover border-border max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-4 focus:outline-none focus-visible:outline-none"
        data-testid="file-browser-dialog"
      >
        <DialogHeader className="pb-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isFileMode ? (
              <FileCode className="w-4 h-4 text-brand-500" />
            ) : (
              <FolderOpen className="w-4 h-4 text-brand-500" />
            )}
            {resolvedTitle}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            {resolvedDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 min-h-[350px] flex-1 overflow-hidden py-1">
          {/* Path navigation */}
          <PathInput
            currentPath={currentPath}
            parentPath={parentPath}
            loading={loading}
            error={!!error}
            onNavigate={handleNavigate}
            onHome={handleGoHome}
            entries={[
              ...directories.map((dir) => ({ ...dir, isDirectory: true })),
              ...(isFileMode ? files.map((f) => ({ ...f, isDirectory: false })) : []),
            ]}
            onSelectEntry={(entry) => {
              if (entry.isDirectory) {
                handleSelectDirectory(entry);
              } else if (isFileMode) {
                setSelectedFile(entry.path);
              }
            }}
          />

          {/* Recent folders - only show in directory mode (not useful for file selection) */}
          {!isFileMode && recentFolders.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 rounded-md bg-sidebar-accent/10 border border-sidebar-border">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
                <Clock className="w-3 h-3" />
                <span>Recent:</span>
              </div>
              {recentFolders.map((folder) => (
                <button
                  key={folder}
                  onClick={() => handleSelectRecent(folder)}
                  className="group flex items-center gap-1 h-6 px-2 text-xs bg-sidebar-accent/20 hover:bg-sidebar-accent/40 rounded border border-sidebar-border transition-colors"
                  disabled={loading}
                  title={folder}
                >
                  <Folder className="w-3 h-3 text-brand-500 shrink-0" />
                  <span className="truncate max-w-[120px]">{getFolderName(folder)}</span>
                  <button
                    onClick={(e) => handleRemoveRecent(e, folder)}
                    className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                    title="Remove from recent"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </button>
              ))}
            </div>
          )}

          {/* Drives selector (Windows only) */}
          {drives.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 rounded-md bg-sidebar-accent/10 border border-sidebar-border">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
                <HardDrive className="w-3 h-3" />
                <span>Drives:</span>
              </div>
              {drives.map((drive) => (
                <Button
                  key={drive}
                  variant={currentPath.startsWith(drive) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSelectDrive(drive)}
                  className="h-6 px-2 text-xs"
                  disabled={loading}
                >
                  {drive.replace('\\', '')}
                </Button>
              ))}
            </div>
          )}

          {/* Directory list */}
          <div
            className="flex-1 overflow-y-auto border border-sidebar-border rounded-md scrollbar-styled"
            data-testid="file-browser-directory-list"
          >
            {loading && (
              <div className="flex items-center justify-center h-full p-4">
                <div className="text-xs text-muted-foreground">Loading directories...</div>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center h-full p-4">
                <div className="text-xs text-destructive">{error}</div>
              </div>
            )}

            {warning && (
              <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-md mb-1">
                <div className="text-xs text-yellow-500">{warning}</div>
              </div>
            )}

            {!loading && !error && !warning && directories.length === 0 && files.length === 0 && (
              <div className="flex items-center justify-center h-full p-4">
                <div className="text-xs text-muted-foreground">
                  {isFileMode ? 'No matching files or folders found' : 'No subdirectories found'}
                </div>
              </div>
            )}

            {!loading && !error && (directories.length > 0 || files.length > 0) && (
              <div className="divide-y divide-sidebar-border">
                {directories.map((dir) => (
                  <button
                    key={dir.path}
                    onClick={() => handleSelectDirectory(dir)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-sidebar-accent/10 transition-colors text-left group"
                  >
                    <Folder className="w-4 h-4 text-brand-500 shrink-0" />
                    <span className="flex-1 truncate text-xs">{dir.name}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
                {isFileMode &&
                  files.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => setSelectedFile(file.path)}
                      onDoubleClick={() => {
                        setSelectedFile(file.path);
                        onSelect(file.path);
                        onOpenChange(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 hover:bg-sidebar-accent/10 transition-colors text-left group ${
                        selectedFile === file.path ? 'bg-brand-500/10 ring-1 ring-brand-500/30' : ''
                      }`}
                    >
                      <FileIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate text-xs">{file.name}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="text-[10px] text-muted-foreground">
            {isFileMode
              ? 'Navigate to the folder containing your file, then click a file to select it. Double-click to select immediately.'
              : 'Paste a full path above, or click on folders to navigate. Press Enter or click \u2192 to jump to a path.'}
          </div>
        </div>

        <DialogFooter className="border-t border-border pt-3 gap-2 mt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            data-testid="file-browser-cancel-button"
          >
            Cancel
          </Button>
          {isFileMode ? (
            <Button
              size="sm"
              onClick={handleSelect}
              disabled={!selectedFile || loading}
              title="Select file (Cmd+Enter / Ctrl+Enter)"
              data-testid="file-browser-select-button"
            >
              <FileIcon className="w-3.5 h-3.5 mr-1.5" />
              {selectedFile ? `Select "${selectedFile.split(/[/\\]/).pop()}"` : 'Select File'}
              <KbdGroup className="ml-1">
                <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
                <Kbd>↵</Kbd>
              </KbdGroup>
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSelect}
              disabled={!currentPath || loading}
              title="Select current folder (Cmd+Enter / Ctrl+Enter)"
              data-testid="file-browser-select-button"
            >
              <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
              Select Current Folder
              <KbdGroup className="ml-1">
                <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
                <Kbd>↵</Kbd>
              </KbdGroup>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
