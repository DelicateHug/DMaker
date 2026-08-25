import { useState } from 'react';
import { FileExplorer } from '@/components/views/board-view/components/file-explorer';
import { CodeEditorWindow } from '@/components/views/board-view/dialogs';

interface FilesPaneProps {
  /** Worktree path for the open feature, falling back to the project root */
  rootPath: string;
}

/**
 * File tree for the feature's worktree. Selecting a file opens it in the
 * existing code editor window.
 */
export function FilesPane({ rootPath }: FilesPaneProps) {
  const [editorFilePath, setEditorFilePath] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  return (
    <div className="h-full min-h-0">
      <FileExplorer
        projectPath={rootPath}
        onFileSelect={(filePath) => {
          setEditorFilePath(filePath);
          setIsEditorOpen(true);
        }}
        className="h-full"
      />

      <CodeEditorWindow
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        componentProps={{
          initialFilePath: editorFilePath ?? undefined,
          projectPath: rootPath,
        }}
      />
    </div>
  );
}
