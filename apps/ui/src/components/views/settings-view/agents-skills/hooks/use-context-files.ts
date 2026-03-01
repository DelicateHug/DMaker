/**
 * Context Files Hook - Manages .dmaker/context/ file CRUD operations
 *
 * Discovers context files from ALL projects (like useAgents),
 * tagging each file with its projectName for grouped display.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { createLogger } from '@dmaker/utils/logger';

const logger = createLogger('ContextFiles');

export interface ContextFile {
  name: string;
  path: string;
  content?: string;
  description?: string;
  enabled: boolean;
  /** Relative subfolder within .dmaker/context/ (empty string = root) */
  folder: string;
  projectName?: string;
  projectPath?: string;
}

interface ContextMetadata {
  files: Record<string, { description?: string; enabled?: boolean }>;
}

/** Derive the context directory path for a project */
function contextDirFor(projectPath: string) {
  return `${projectPath}/.dmaker/context`;
}

/** Derive the context directory from a ContextFile (always returns the context root) */
function contextDirOfFile(file: ContextFile) {
  if (file.projectPath) return contextDirFor(file.projectPath);
  // Fallback for files without projectPath — strip folder + filename from path
  const suffix = file.folder ? `/${file.folder}/${file.name}` : `/${file.name}`;
  return file.path.endsWith(suffix)
    ? file.path.slice(0, -suffix.length)
    : file.path.substring(0, file.path.lastIndexOf('/'));
}

/** Compute the metadata key for a context file (relative path from context root) */
function metadataKey(file: ContextFile): string {
  return file.folder ? `${file.folder}/${file.name}` : file.name;
}

export function useContextFiles() {
  const currentProject = useAppStore((state) => state.currentProject);
  const allProjects = useAppStore((state) => state.projects);
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const isContextFile = (filename: string): boolean => {
    if (filename === 'context-metadata.json') return false;
    const ext = filename.toLowerCase();
    return ext.endsWith('.md') || ext.endsWith('.txt') || ext.endsWith('.markdown');
  };

  const loadMetadata = useCallback(async (contextPath: string): Promise<ContextMetadata> => {
    try {
      const api = getElectronAPI();
      const metaPath = `${contextPath}/context-metadata.json`;
      const metaExists = await api.exists(metaPath);
      if (!metaExists) return { files: {} };

      const result = await api.readFile(metaPath);
      if (result.success && result.content) {
        return JSON.parse(result.content);
      }
    } catch {
      // Metadata file missing or invalid — not a problem
    }
    return { files: {} };
  }, []);

  const saveMetadata = useCallback(async (contextPath: string, metadata: ContextMetadata) => {
    try {
      const api = getElectronAPI();
      const result = await api.writeFile(
        `${contextPath}/context-metadata.json`,
        JSON.stringify(metadata, null, 2)
      );
      if (!result.success) {
        logger.error('Failed to save context metadata:', result.error);
      }
    } catch (error) {
      logger.error('Failed to save context metadata:', error);
    }
  }, []);

  /** Recursively scan a directory for context files */
  const scanDir = useCallback(
    async (
      api: ReturnType<typeof getElectronAPI>,
      dirPath: string,
      contextRoot: string,
      metadata: ContextMetadata,
      projectPath: string,
      projectName: string
    ): Promise<ContextFile[]> => {
      const result = await api.readdir(dirPath);
      if (!result.success || !result.entries) return [];

      const files: ContextFile[] = [];

      for (const entry of result.entries) {
        if (entry.isFile && isContextFile(entry.name)) {
          const relFolder =
            dirPath === contextRoot ? '' : dirPath.substring(contextRoot.length + 1);
          const relPath = relFolder ? `${relFolder}/${entry.name}` : entry.name;
          files.push({
            name: entry.name,
            path: `${dirPath}/${entry.name}`,
            description: metadata.files[relPath]?.description,
            enabled: metadata.files[relPath]?.enabled !== false,
            folder: relFolder,
            projectName,
            projectPath,
          });
        } else if (!entry.isFile && entry.name !== 'context-metadata.json') {
          // Recurse into subdirectory
          const subFiles = await scanDir(
            api,
            `${dirPath}/${entry.name}`,
            contextRoot,
            metadata,
            projectPath,
            projectName
          );
          files.push(...subFiles);
        }
      }

      return files.sort((a, b) => a.name.localeCompare(b.name));
    },
    []
  );

  /** Load context files from a single project */
  const loadProjectFiles = useCallback(
    async (projectPath: string, projectName: string): Promise<ContextFile[]> => {
      const contextPath = contextDirFor(projectPath);
      try {
        const api = getElectronAPI();
        const metadata = await loadMetadata(contextPath);
        return await scanDir(api, contextPath, contextPath, metadata, projectPath, projectName);
      } catch {
        // Project context dir may not exist — that's fine
        return [];
      }
    },
    [loadMetadata, scanDir]
  );

  /** Discover context files from ALL projects */
  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const results = await Promise.all(allProjects.map((p) => loadProjectFiles(p.path, p.name)));
      setFiles(results.flat());
    } catch (error) {
      logger.error('Failed to load context files:', error);
      toast.error('Failed to refresh context files');
    } finally {
      setIsLoading(false);
    }
  }, [allProjects, loadProjectFiles]);

  // Reload when projects change
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const loadFileContent = useCallback(async (file: ContextFile): Promise<string> => {
    try {
      const api = getElectronAPI();
      const result = await api.readFile(file.path);
      if (result.success && result.content !== undefined) {
        return result.content;
      }
      logger.error('Failed to load file content:', result);
    } catch (error) {
      logger.error('Failed to load file content:', error);
    }
    return '';
  }, []);

  const createFile = useCallback(
    async (name: string, content: string, description?: string): Promise<boolean> => {
      const projectPath = currentProject?.path;
      if (!projectPath) return false;
      const contextPath = contextDirFor(projectPath);

      try {
        const api = getElectronAPI();
        let filename = name.trim();
        if (!filename.includes('.')) {
          filename += '.md';
        }

        const filePath = `${contextPath}/${filename}`;

        // Ensure directory exists
        const mkdirResult = await api.mkdir(contextPath);
        if (!mkdirResult.success) {
          logger.error('Failed to create context directory:', mkdirResult);
          toast.error('Failed to create context directory');
          return false;
        }

        // Check if file exists
        const exists = await api.exists(filePath);
        if (exists) {
          toast.error(`File "${filename}" already exists`);
          return false;
        }

        // Write file and verify
        const writeResult = await api.writeFile(filePath, content);
        if (!writeResult.success) {
          logger.error('Failed to write context file:', writeResult);
          toast.error(writeResult.error || 'Failed to write file');
          return false;
        }

        const verifyExists = await api.exists(filePath);
        if (!verifyExists) {
          logger.error('File write reported success but file does not exist:', filePath);
          toast.error('File write failed — file not found after save');
          return false;
        }

        if (description) {
          const metadata = await loadMetadata(contextPath);
          metadata.files[filename] = { description };
          await saveMetadata(contextPath, metadata);
        }

        toast.success(`Created "${filename}"`);
        await loadFiles();
        return true;
      } catch (error) {
        logger.error('Failed to create context file:', error);
        toast.error('Failed to create file');
        return false;
      }
    },
    [currentProject?.path, loadFiles, loadMetadata, saveMetadata]
  );

  const saveFile = useCallback(
    async (file: ContextFile, content: string, description?: string): Promise<boolean> => {
      const contextPath = contextDirOfFile(file);

      try {
        const api = getElectronAPI();
        const writeResult = await api.writeFile(file.path, content);
        if (!writeResult.success) {
          logger.error('Failed to save context file:', writeResult);
          toast.error(writeResult.error || 'Failed to save file');
          return false;
        }

        const key = metadataKey(file);
        const metadata = await loadMetadata(contextPath);
        if (description !== undefined) {
          metadata.files[key] = { description };
        }
        await saveMetadata(contextPath, metadata);

        toast.success(`Saved "${file.name}"`);
        await loadFiles();
        return true;
      } catch (error) {
        logger.error('Failed to save context file:', error);
        toast.error('Failed to save file');
        return false;
      }
    },
    [loadFiles, loadMetadata, saveMetadata]
  );

  const deleteFile = useCallback(
    async (file: ContextFile): Promise<boolean> => {
      const contextPath = contextDirOfFile(file);

      try {
        const api = getElectronAPI();
        const deleteResult = await api.deleteFile(file.path);
        if (!deleteResult.success) {
          logger.error('Failed to delete context file:', deleteResult);
          toast.error(deleteResult.error || 'Failed to delete file');
          return false;
        }

        const key = metadataKey(file);
        const metadata = await loadMetadata(contextPath);
        delete metadata.files[key];
        await saveMetadata(contextPath, metadata);

        toast.success(`Deleted "${file.name}"`);
        await loadFiles();
        return true;
      } catch (error) {
        logger.error('Failed to delete context file:', error);
        toast.error('Failed to delete file');
        return false;
      }
    },
    [loadFiles, loadMetadata, saveMetadata]
  );

  const renameFile = useCallback(
    async (file: ContextFile, newName: string): Promise<boolean> => {
      const contextPath = contextDirOfFile(file);

      let filename = newName.trim();
      if (!filename.includes('.')) {
        filename += '.md';
      }

      if (filename === file.name) return true;

      try {
        const api = getElectronAPI();
        const newPath = `${contextPath}/${filename}`;

        const exists = await api.exists(newPath);
        if (exists) {
          toast.error(`File "${filename}" already exists`);
          return false;
        }

        const readResult = await api.readFile(file.path);
        if (!readResult.success || readResult.content === undefined) {
          toast.error('Failed to read file for rename');
          return false;
        }

        const writeResult = await api.writeFile(newPath, readResult.content);
        if (!writeResult.success) {
          toast.error(writeResult.error || 'Failed to write renamed file');
          return false;
        }

        await api.deleteFile(file.path);

        const oldKey = metadataKey(file);
        const newKey = file.folder ? `${file.folder}/${filename}` : filename;
        const metadata = await loadMetadata(contextPath);
        if (metadata.files[oldKey]) {
          metadata.files[newKey] = metadata.files[oldKey];
          delete metadata.files[oldKey];
          await saveMetadata(contextPath, metadata);
        }

        toast.success(`Renamed to "${filename}"`);
        await loadFiles();
        return true;
      } catch (error) {
        logger.error('Failed to rename context file:', error);
        toast.error('Failed to rename file');
        return false;
      }
    },
    [loadFiles, loadMetadata, saveMetadata]
  );

  const toggleFileEnabled = useCallback(
    async (file: ContextFile, enabled: boolean): Promise<boolean> => {
      const contextPath = contextDirOfFile(file);

      try {
        const key = metadataKey(file);
        const metadata = await loadMetadata(contextPath);
        if (!metadata.files[key]) {
          metadata.files[key] = {};
        }
        metadata.files[key].enabled = enabled;
        await saveMetadata(contextPath, metadata);
        await loadFiles();
        return true;
      } catch (error) {
        logger.error('Failed to toggle context file:', error);
        toast.error('Failed to toggle context file');
        return false;
      }
    },
    [loadMetadata, saveMetadata, loadFiles]
  );

  return {
    files,
    isLoading,
    hasProject: allProjects.length > 0,
    refresh: loadFiles,
    loadFileContent,
    createFile,
    saveFile,
    deleteFile,
    renameFile,
    toggleFileEnabled,
  };
}
