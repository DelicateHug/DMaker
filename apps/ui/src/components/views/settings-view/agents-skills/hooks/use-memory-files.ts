/**
 * Memory Files Hook - Manages .dmaker/memory/ file CRUD operations
 *
 * Discovers memory files from ALL projects (like useContextFiles),
 * tagging each file with its projectName for grouped display.
 * Memory files are AI-generated learnings; enable/disable state
 * is stored in memory-metadata.json (separate from YAML frontmatter).
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { createLogger } from '@dmaker/utils/logger';

const logger = createLogger('MemoryFiles');

export interface MemoryFile {
  name: string;
  path: string;
  content?: string;
  description?: string;
  enabled: boolean;
  /** Relative subfolder within .dmaker/memory/ (empty string = root) */
  folder: string;
  projectName?: string;
  projectPath?: string;
}

interface MemoryMetadata {
  files: Record<string, { description?: string; enabled?: boolean }>;
}

/** Strip YAML frontmatter from markdown content, returning body only */
function stripFrontmatter(content: string): string {
  const match = content.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/);
  return match ? content.slice(match[0].length) : content;
}

/** Extract YAML frontmatter from markdown content (including delimiters) */
function extractFrontmatter(content: string): string | null {
  const match = content.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/);
  return match ? match[0] : null;
}

/** Derive the memory directory path for a project */
function memoryDirFor(projectPath: string) {
  return `${projectPath}/.dmaker/memory`;
}

/** Derive the memory directory from a MemoryFile (always returns the memory root) */
function memoryDirOfFile(file: MemoryFile) {
  if (file.projectPath) return memoryDirFor(file.projectPath);
  // Fallback for files without projectPath — strip folder + filename from path
  const suffix = file.folder ? `/${file.folder}/${file.name}` : `/${file.name}`;
  return file.path.endsWith(suffix)
    ? file.path.slice(0, -suffix.length)
    : file.path.substring(0, file.path.lastIndexOf('/'));
}

/** Compute the metadata key for a memory file (relative path from memory root) */
function metadataKey(file: MemoryFile): string {
  return file.folder ? `${file.folder}/${file.name}` : file.name;
}

export function useMemoryFiles() {
  const currentProject = useAppStore((state) => state.currentProject);
  const allProjects = useAppStore((state) => state.projects);
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const isMemoryFile = (filename: string): boolean => {
    if (filename === 'memory-metadata.json') return false;
    if (filename.toLowerCase() === '_index.md') return false;
    const ext = filename.toLowerCase();
    return ext.endsWith('.md') || ext.endsWith('.txt') || ext.endsWith('.markdown');
  };

  const loadMetadata = useCallback(async (memoryPath: string): Promise<MemoryMetadata> => {
    try {
      const api = getElectronAPI();
      const metaPath = `${memoryPath}/memory-metadata.json`;
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

  const saveMetadata = useCallback(async (memoryPath: string, metadata: MemoryMetadata) => {
    try {
      const api = getElectronAPI();
      const result = await api.writeFile(
        `${memoryPath}/memory-metadata.json`,
        JSON.stringify(metadata, null, 2)
      );
      if (!result.success) {
        logger.error('Failed to save memory metadata:', result.error);
      }
    } catch (error) {
      logger.error('Failed to save memory metadata:', error);
    }
  }, []);

  /** Recursively scan a directory for memory files */
  const scanDir = useCallback(
    async (
      api: ReturnType<typeof getElectronAPI>,
      dirPath: string,
      memoryRoot: string,
      metadata: MemoryMetadata,
      projectPath: string,
      projectName: string
    ): Promise<MemoryFile[]> => {
      const result = await api.readdir(dirPath);
      if (!result.success || !result.entries) return [];

      const files: MemoryFile[] = [];

      for (const entry of result.entries) {
        if (entry.isFile && isMemoryFile(entry.name)) {
          const relFolder = dirPath === memoryRoot ? '' : dirPath.substring(memoryRoot.length + 1);
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
        } else if (!entry.isFile && entry.name !== 'memory-metadata.json') {
          // Recurse into subdirectory
          const subFiles = await scanDir(
            api,
            `${dirPath}/${entry.name}`,
            memoryRoot,
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

  /** Load memory files from a single project */
  const loadProjectFiles = useCallback(
    async (projectPath: string, projectName: string): Promise<MemoryFile[]> => {
      const memoryPath = memoryDirFor(projectPath);
      try {
        const api = getElectronAPI();
        const metadata = await loadMetadata(memoryPath);
        return await scanDir(api, memoryPath, memoryPath, metadata, projectPath, projectName);
      } catch {
        // Project memory dir may not exist — that's fine
        return [];
      }
    },
    [loadMetadata, scanDir]
  );

  /** Discover memory files from ALL projects */
  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const results = await Promise.all(allProjects.map((p) => loadProjectFiles(p.path, p.name)));
      setFiles(results.flat());
    } catch (error) {
      logger.error('Failed to load memory files:', error);
      toast.error('Failed to refresh memory files');
    } finally {
      setIsLoading(false);
    }
  }, [allProjects, loadProjectFiles]);

  // Reload when projects change
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const loadFileContent = useCallback(async (file: MemoryFile): Promise<string> => {
    try {
      const api = getElectronAPI();
      const result = await api.readFile(file.path);
      if (result.success && result.content !== undefined) {
        // Strip YAML frontmatter, return body only
        return stripFrontmatter(result.content);
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
      const memoryPath = memoryDirFor(projectPath);

      try {
        const api = getElectronAPI();
        let filename = name.trim();
        if (!filename.includes('.')) {
          filename += '.md';
        }

        const filePath = `${memoryPath}/${filename}`;

        // Ensure directory exists
        const mkdirResult = await api.mkdir(memoryPath);
        if (!mkdirResult.success) {
          logger.error('Failed to create memory directory:', mkdirResult);
          toast.error('Failed to create memory directory');
          return false;
        }

        // Check if file exists
        const exists = await api.exists(filePath);
        if (exists) {
          toast.error(`File "${filename}" already exists`);
          return false;
        }

        // Write file (no frontmatter for user-created files)
        const writeResult = await api.writeFile(filePath, content);
        if (!writeResult.success) {
          logger.error('Failed to write memory file:', writeResult);
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
          const metadata = await loadMetadata(memoryPath);
          metadata.files[filename] = { description };
          await saveMetadata(memoryPath, metadata);
        }

        toast.success(`Created "${filename}"`);
        await loadFiles();
        return true;
      } catch (error) {
        logger.error('Failed to create memory file:', error);
        toast.error('Failed to create file');
        return false;
      }
    },
    [currentProject?.path, loadFiles, loadMetadata, saveMetadata]
  );

  const saveFile = useCallback(
    async (file: MemoryFile, content: string, description?: string): Promise<boolean> => {
      const memoryPath = memoryDirOfFile(file);

      try {
        const api = getElectronAPI();

        // Re-read original file to preserve YAML frontmatter
        const originalResult = await api.readFile(file.path);
        let frontmatter = '';
        if (originalResult.success && originalResult.content) {
          const fm = extractFrontmatter(originalResult.content);
          if (fm) {
            frontmatter = fm;
          }
        }

        const fullContent = frontmatter ? frontmatter + content : content;
        const writeResult = await api.writeFile(file.path, fullContent);
        if (!writeResult.success) {
          logger.error('Failed to save memory file:', writeResult);
          toast.error(writeResult.error || 'Failed to save file');
          return false;
        }

        const key = metadataKey(file);
        const metadata = await loadMetadata(memoryPath);
        if (description !== undefined) {
          metadata.files[key] = { ...metadata.files[key], description };
        }
        await saveMetadata(memoryPath, metadata);

        toast.success(`Saved "${file.name}"`);
        await loadFiles();
        return true;
      } catch (error) {
        logger.error('Failed to save memory file:', error);
        toast.error('Failed to save file');
        return false;
      }
    },
    [loadFiles, loadMetadata, saveMetadata]
  );

  const deleteFile = useCallback(
    async (file: MemoryFile): Promise<boolean> => {
      const memoryPath = memoryDirOfFile(file);

      try {
        const api = getElectronAPI();
        const deleteResult = await api.deleteFile(file.path);
        if (!deleteResult.success) {
          logger.error('Failed to delete memory file:', deleteResult);
          toast.error(deleteResult.error || 'Failed to delete file');
          return false;
        }

        const key = metadataKey(file);
        const metadata = await loadMetadata(memoryPath);
        delete metadata.files[key];
        await saveMetadata(memoryPath, metadata);

        toast.success(`Deleted "${file.name}"`);
        await loadFiles();
        return true;
      } catch (error) {
        logger.error('Failed to delete memory file:', error);
        toast.error('Failed to delete file');
        return false;
      }
    },
    [loadFiles, loadMetadata, saveMetadata]
  );

  const renameFile = useCallback(
    async (file: MemoryFile, newName: string): Promise<boolean> => {
      const memoryPath = memoryDirOfFile(file);

      let filename = newName.trim();
      if (!filename.includes('.')) {
        filename += '.md';
      }

      if (filename === file.name) return true;

      try {
        const api = getElectronAPI();
        const newPath = `${memoryPath}/${filename}`;

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
        const metadata = await loadMetadata(memoryPath);
        if (metadata.files[oldKey]) {
          metadata.files[newKey] = metadata.files[oldKey];
          delete metadata.files[oldKey];
          await saveMetadata(memoryPath, metadata);
        }

        toast.success(`Renamed to "${filename}"`);
        await loadFiles();
        return true;
      } catch (error) {
        logger.error('Failed to rename memory file:', error);
        toast.error('Failed to rename file');
        return false;
      }
    },
    [loadFiles, loadMetadata, saveMetadata]
  );

  const toggleFileEnabled = useCallback(
    async (file: MemoryFile, enabled: boolean): Promise<boolean> => {
      const memoryPath = memoryDirOfFile(file);

      try {
        const key = metadataKey(file);
        const metadata = await loadMetadata(memoryPath);
        if (!metadata.files[key]) {
          metadata.files[key] = {};
        }
        metadata.files[key].enabled = enabled;
        await saveMetadata(memoryPath, metadata);
        await loadFiles();
        return true;
      } catch (error) {
        logger.error('Failed to toggle memory file:', error);
        toast.error('Failed to toggle memory file');
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
