/**
 * Memory Files Panel - Interactive manager for .dmaker/memory/ files
 *
 * Discovers memory files from all projects with subfolder support.
 * Memory files are AI-generated learnings from past agent work.
 */

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/forms';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/overlays';
import { Input } from '@/components/ui/forms';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  Brain,
  Plus,
  RefreshCw,
  Loader2,
  FolderOpen,
  Folder,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useMemoryFiles, type MemoryFile } from './hooks/use-memory-files';

export type MemoryFilesData = ReturnType<typeof useMemoryFiles>;
import { MemoryFileCard } from './memory-file-card';
import { MemoryFileEditorDialog } from './memory-file-editor-dialog';

function MemoryFolderGroup({
  path: folderPath,
  files: folderFiles,
  onEdit,
  onDelete,
  onRename,
  onToggleEnabled,
  loadFileContent,
}: {
  path: string;
  files: MemoryFile[];
  onEdit: (file: MemoryFile) => void;
  onDelete: (file: MemoryFile) => void;
  onRename: (file: MemoryFile) => void;
  onToggleEnabled: (file: MemoryFile, enabled: boolean) => void;
  loadFileContent: (file: MemoryFile) => Promise<string>;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left',
          'hover:bg-accent/30 transition-colors cursor-pointer'
        )}
      >
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <Folder className="w-3.5 h-3.5 text-purple-500/70 shrink-0" />
        <span className="text-sm font-medium text-foreground/80 truncate">{folderPath}</span>
        <span className="text-xs text-muted-foreground/60 ml-auto shrink-0">
          {folderFiles.length}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 ml-5 mt-1">
          {folderFiles.map((file) => (
            <MemoryFileCard
              key={file.path}
              file={file}
              onEdit={onEdit}
              onDelete={onDelete}
              onRename={onRename}
              onToggleEnabled={onToggleEnabled}
              loadFileContent={loadFileContent}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function groupByFolder(filesList: MemoryFile[]) {
  const folderMap = new Map<string, MemoryFile[]>();
  for (const file of filesList) {
    const f = file.folder || '';
    if (!folderMap.has(f)) folderMap.set(f, []);
    folderMap.get(f)!.push(file);
  }

  return Array.from(folderMap.entries())
    .sort(([a], [b]) => {
      if (a === '' && b !== '') return -1;
      if (a !== '' && b === '') return 1;
      return a.localeCompare(b);
    })
    .map(([path, files]) => ({ path, files }));
}

export function MemoryFilesPanel({ data }: { data: MemoryFilesData }) {
  const {
    files,
    isLoading,
    hasProject,
    refresh,
    loadFileContent,
    createFile,
    saveFile,
    deleteFile,
    renameFile,
    toggleFileEnabled,
  } = data;

  const folders = useMemo(() => groupByFolder(files), [files]);

  // Editor dialog state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<MemoryFile | null>(null);
  const [editingContent, setEditingContent] = useState('');

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<MemoryFile | null>(null);

  // Rename dialog state
  const [renameTarget, setRenameTarget] = useState<MemoryFile | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleNewFile = () => {
    setEditingFile(null);
    setEditingContent('');
    setEditorOpen(true);
  };

  const handleEditFile = useCallback(
    async (file: MemoryFile) => {
      const content = await loadFileContent(file);
      setEditingFile(file);
      setEditingContent(content);
      setEditorOpen(true);
    },
    [loadFileContent]
  );

  const handleSaveFromEditor = useCallback(
    async (name: string, content: string, description?: string): Promise<boolean> => {
      if (editingFile) {
        return saveFile(editingFile, content, description);
      }
      return createFile(name, content, description);
    },
    [editingFile, saveFile, createFile]
  );

  const handleDeleteFile = (file: MemoryFile) => {
    setDeleteConfirm(file);
  };

  const confirmDelete = async () => {
    if (deleteConfirm) {
      await deleteFile(deleteConfirm);
      setDeleteConfirm(null);
    }
  };

  const handleRenameFile = (file: MemoryFile) => {
    setRenameTarget(file);
    setRenameValue(file.name);
  };

  const confirmRename = async () => {
    if (renameTarget && renameValue.trim()) {
      await renameFile(renameTarget, renameValue.trim());
      setRenameTarget(null);
      setRenameValue('');
    }
  };

  const renderFileList = (folderFiles: MemoryFile[]) =>
    folderFiles.map((file) => (
      <MemoryFileCard
        key={file.path}
        file={file}
        onEdit={handleEditFile}
        onDelete={handleDeleteFile}
        onRename={handleRenameFile}
        onToggleEnabled={toggleFileEnabled}
        loadFileContent={loadFileContent}
      />
    ));

  return (
    <>
      <div className="rounded-xl border border-border/30 bg-muted/30 p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-purple-500/20 flex items-center justify-center shrink-0">
              <Brain className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground/80">Memory Files</span>
              {files.length > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-500">
                  {files.length}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewFile}
              disabled={!hasProject}
              className="gap-1.5 h-7 px-2 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={isLoading}
              className="gap-1.5 h-7 px-2 text-xs"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground">
          Files in <code className="text-xs bg-muted px-1 rounded">.dmaker/memory/</code> contain
          AI-generated learnings from past agent work. These are automatically loaded into agent
          prompts based on relevance. You can also create manual entries.
        </p>

        {/* File List */}
        {!hasProject ? (
          <div className="text-center py-4 text-muted-foreground">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">Select a project to manage memory files</p>
          </div>
        ) : files.length === 0 && !isLoading ? (
          <div className="text-center py-4 text-muted-foreground border border-dashed border-border/50 rounded-lg">
            <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs font-medium">No memory files yet</p>
            <p className="text-xs mt-1">
              Memory files are created automatically as agents complete features, or create one
              manually
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {folders.map((folder) =>
              folder.path === '' ? (
                <div key="__root__" className="space-y-2">
                  {renderFileList(folder.files)}
                </div>
              ) : (
                <MemoryFolderGroup
                  key={folder.path}
                  path={folder.path}
                  files={folder.files}
                  onEdit={handleEditFile}
                  onDelete={handleDeleteFile}
                  onRename={handleRenameFile}
                  onToggleEnabled={toggleFileEnabled}
                  loadFileContent={loadFileContent}
                />
              )
            )}
          </div>
        )}
      </div>

      {/* Editor Dialog */}
      <MemoryFileEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        file={editingFile}
        initialContent={editingContent}
        onSave={handleSaveFromEditor}
      />

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="font-semibold text-base">Delete Memory File</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This will
              remove the file from disk.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Memory File</DialogTitle>
            <DialogDescription>Enter a new name for "{renameTarget?.name}".</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-memory-file">File Name</Label>
              <Input
                id="rename-memory-file"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Enter new filename"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renameValue.trim()) {
                    confirmRename();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={confirmRename}
              disabled={!renameValue.trim() || renameValue === renameTarget?.name}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
