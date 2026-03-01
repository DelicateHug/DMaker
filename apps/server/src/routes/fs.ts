/**
 * File system routes
 * Provides REST API equivalents for Electron IPC file operations
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { EventEmitter } from '../lib/events.js';
import {
  secureFs,
  PathNotAllowedError,
  isPathAllowed,
  getAllowedRootDirectory,
  getImagesDir,
  getBoardDir,
} from '@dmaker/platform';
import path from 'path';
import os from 'os';
import { createLogger, mkdirSafe } from '@dmaker/utils';

// ---------------------------------------------------------------------------
// Logger & error helpers (inlined from common.ts)
// ---------------------------------------------------------------------------

const logger = createLogger('FS');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`\u274C ${context}:`, error);
}

// ---------------------------------------------------------------------------
// POST /read - Read file
// ---------------------------------------------------------------------------

// Optional files that are expected to not exist in new projects
// Don't log ENOENT errors for these to reduce noise
const OPTIONAL_FILES = ['categories.json', 'app_spec.txt'];

function isOptionalFile(filePath: string): boolean {
  return OPTIONAL_FILES.some((optionalFile) => filePath.endsWith(optionalFile));
}

function isENOENT(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

function createReadHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      const content = await secureFs.readFile(filePath, 'utf-8');

      res.json({ success: true, content });
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      // Don't log ENOENT errors for optional files (expected to be missing in new projects)
      const shouldLog = !(isENOENT(error) && isOptionalFile(req.body?.filePath || ''));
      if (shouldLog) {
        logError(error, 'Read file failed');
      }
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /write - Write file
// ---------------------------------------------------------------------------

function createWriteHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath, content } = req.body as {
        filePath: string;
        content: string;
      };

      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      // Ensure parent directory exists (symlink-safe)
      await mkdirSafe(path.dirname(path.resolve(filePath)));
      await secureFs.writeFile(filePath, content, 'utf-8');

      res.json({ success: true });
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      logError(error, 'Write file failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /mkdir - Create directory (handles symlinks safely)
// ---------------------------------------------------------------------------

function createMkdirHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { dirPath } = req.body as { dirPath: string };

      if (!dirPath) {
        res.status(400).json({ success: false, error: 'dirPath is required' });
        return;
      }

      const resolvedPath = path.resolve(dirPath);

      // Check if path already exists using lstat (doesn't follow symlinks)
      try {
        const stats = await secureFs.lstat(resolvedPath);
        // Path exists - if it's a directory or symlink, consider it success
        if (stats.isDirectory() || stats.isSymbolicLink()) {
          res.json({ success: true });
          return;
        }
        // It's a file - can't create directory
        res.status(400).json({
          success: false,
          error: 'Path exists and is not a directory',
        });
        return;
      } catch (statError: any) {
        // ENOENT means path doesn't exist - we should create it
        if (statError.code !== 'ENOENT') {
          // Some other error (could be ELOOP in parent path)
          throw statError;
        }
      }

      // Path doesn't exist, create it
      await secureFs.mkdir(resolvedPath, { recursive: true });

      res.json({ success: true });
    } catch (error: any) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      // Handle ELOOP specifically
      if (error.code === 'ELOOP') {
        logError(error, 'Create directory failed - symlink loop detected');
        res.status(400).json({
          success: false,
          error: 'Cannot create directory: symlink loop detected in path',
        });
        return;
      }
      logError(error, 'Create directory failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /readdir - Read directory
// ---------------------------------------------------------------------------

function createReaddirHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { dirPath } = req.body as { dirPath: string };

      if (!dirPath) {
        res.status(400).json({ success: false, error: 'dirPath is required' });
        return;
      }

      const entries = await secureFs.readdir(dirPath, { withFileTypes: true });

      const result = entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      }));

      res.json({ success: true, entries: result });
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      logError(error, 'Read directory failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /exists - Check if file/directory exists
// ---------------------------------------------------------------------------

function createExistsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      try {
        await secureFs.access(filePath);
        res.json({ success: true, exists: true });
      } catch (accessError) {
        // Check if it's a path not allowed error vs file not existing
        if (accessError instanceof PathNotAllowedError) {
          throw accessError;
        }
        res.json({ success: true, exists: false });
      }
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      logError(error, 'Check exists failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /stat - Get file stats
// ---------------------------------------------------------------------------

function createStatHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      const stats = await secureFs.stat(filePath);

      res.json({
        success: true,
        stats: {
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          size: stats.size,
          mtime: stats.mtime,
        },
      });
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      logError(error, 'Get file stats failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /delete - Delete file
// ---------------------------------------------------------------------------

function createDeleteHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      await secureFs.rm(filePath, { recursive: true });

      res.json({ success: true });
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      logError(error, 'Delete file failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /validate-path - Validate and add path to allowed list
// ---------------------------------------------------------------------------

function createValidatePathHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      const resolvedPath = path.resolve(filePath);

      // Validate path against ALLOWED_ROOT_DIRECTORY before checking if it exists
      if (!isPathAllowed(resolvedPath)) {
        const allowedRoot = getAllowedRootDirectory();
        const errorMessage = allowedRoot
          ? `Path not allowed: ${filePath}. Must be within ALLOWED_ROOT_DIRECTORY: ${allowedRoot}`
          : `Path not allowed: ${filePath}`;
        res.status(403).json({
          success: false,
          error: errorMessage,
          isAllowed: false,
        });
        return;
      }

      // Check if path exists
      try {
        const stats = await secureFs.stat(resolvedPath);

        if (!stats.isDirectory()) {
          res.status(400).json({ success: false, error: 'Path is not a directory' });
          return;
        }

        res.json({
          success: true,
          path: resolvedPath,
          isAllowed: true,
        });
      } catch {
        res.status(400).json({ success: false, error: 'Path does not exist' });
      }
    } catch (error) {
      logError(error, 'Validate path failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /resolve-directory - Resolve directory path from directory name
// ---------------------------------------------------------------------------

function createResolveDirectoryHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { directoryName, sampleFiles, fileCount } = req.body as {
        directoryName: string;
        sampleFiles?: string[];
        fileCount?: number;
      };

      if (!directoryName) {
        res.status(400).json({ success: false, error: 'directoryName is required' });
        return;
      }

      // If directoryName looks like an absolute path, try validating it directly
      if (path.isAbsolute(directoryName) || directoryName.includes(path.sep)) {
        try {
          const resolvedPath = path.resolve(directoryName);
          const stats = await secureFs.stat(resolvedPath);
          if (stats.isDirectory()) {
            res.json({
              success: true,
              path: resolvedPath,
            });
            return;
          }
        } catch {
          // Not a valid absolute path, continue to search
        }
      }

      // Search for directory in common locations
      const searchPaths: string[] = [
        process.cwd(), // Current working directory
        process.env.HOME || process.env.USERPROFILE || '', // User home
        path.join(process.env.HOME || process.env.USERPROFILE || '', 'Documents'),
        path.join(process.env.HOME || process.env.USERPROFILE || '', 'Desktop'),
        // Common project locations
        path.join(process.env.HOME || process.env.USERPROFILE || '', 'Projects'),
      ].filter(Boolean);

      // Also check parent of current working directory
      try {
        const parentDir = path.dirname(process.cwd());
        if (!searchPaths.includes(parentDir)) {
          searchPaths.push(parentDir);
        }
      } catch {
        // Ignore
      }

      // Search for directory matching the name and file structure
      for (const searchPath of searchPaths) {
        try {
          const candidatePath = path.join(searchPath, directoryName);
          const stats = await secureFs.stat(candidatePath);

          if (stats.isDirectory()) {
            // Verify it matches by checking for sample files
            if (sampleFiles && sampleFiles.length > 0) {
              let matches = 0;
              for (const sampleFile of sampleFiles.slice(0, 5)) {
                // Remove directory name prefix from sample file path
                const relativeFile = sampleFile.startsWith(directoryName + '/')
                  ? sampleFile.substring(directoryName.length + 1)
                  : sampleFile.split('/').slice(1).join('/') ||
                    sampleFile.split('/').pop() ||
                    sampleFile;

                try {
                  const filePath = path.join(candidatePath, relativeFile);
                  await secureFs.access(filePath);
                  matches++;
                } catch {
                  // File doesn't exist, continue checking
                }
              }

              // If at least one file matches, consider it a match
              if (matches === 0 && sampleFiles.length > 0) {
                continue; // Try next candidate
              }
            }

            // Found matching directory
            res.json({
              success: true,
              path: candidatePath,
            });
            return;
          }
        } catch {
          // Directory doesn't exist at this location, continue searching
          continue;
        }
      }

      // Directory not found
      res.status(404).json({
        success: false,
        error: `Directory "${directoryName}" not found in common locations. Please ensure the directory exists.`,
      });
    } catch (error) {
      logError(error, 'Resolve directory failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /save-image - Save image to .dmaker images directory
// ---------------------------------------------------------------------------

function createSaveImageHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { data, filename, mimeType, projectPath } = req.body as {
        data: string;
        filename: string;
        mimeType: string;
        projectPath: string;
      };

      if (!data || !filename || !projectPath) {
        res.status(400).json({
          success: false,
          error: 'data, filename, and projectPath are required',
        });
        return;
      }

      // Get images directory
      const imagesDir = getImagesDir(projectPath);
      await secureFs.mkdir(imagesDir, { recursive: true });

      // Decode base64 data (remove data URL prefix if present)
      const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const ext = path.extname(filename) || '.png';
      const baseName = path.basename(filename, ext);
      const uniqueFilename = `${baseName}-${timestamp}${ext}`;
      const filePath = path.join(imagesDir, uniqueFilename);

      // Write file
      await secureFs.writeFile(filePath, buffer);

      // Return the absolute path
      res.json({ success: true, path: filePath });
    } catch (error) {
      logError(error, 'Save image failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /browse - Browse directories for file browser UI
// ---------------------------------------------------------------------------

function createBrowseHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { dirPath, includeFiles, fileExtensions } = req.body as {
        dirPath?: string;
        includeFiles?: boolean;
        fileExtensions?: string[];
      };

      // Default to ALLOWED_ROOT_DIRECTORY if set, otherwise home directory
      const defaultPath = getAllowedRootDirectory() || os.homedir();
      const targetPath = dirPath ? path.resolve(dirPath) : defaultPath;

      // Detect available drives on Windows
      const detectDrives = async (): Promise<string[]> => {
        if (os.platform() !== 'win32') {
          return [];
        }

        const drives: string[] = [];
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

        for (const letter of letters) {
          const drivePath = `${letter}:\\`;
          try {
            await secureFs.access(drivePath);
            drives.push(drivePath);
          } catch {
            // Drive doesn't exist, skip it
          }
        }

        return drives;
      };

      // Get parent directory - only if it's within the allowed root
      const parentPath = path.dirname(targetPath);

      // Determine if parent navigation should be allowed:
      // 1. Must have a different parent (not at filesystem root)
      // 2. If ALLOWED_ROOT_DIRECTORY is set, parent must be within it
      const hasParent = parentPath !== targetPath && isPathAllowed(parentPath);

      // Security: Don't expose parent path outside allowed root
      const safeParentPath = hasParent ? parentPath : null;

      // Get available drives
      const drives = await detectDrives();

      try {
        const stats = await secureFs.stat(targetPath);

        if (!stats.isDirectory()) {
          res.status(400).json({ success: false, error: 'Path is not a directory' });
          return;
        }

        // Read directory contents
        const entries = await secureFs.readdir(targetPath, { withFileTypes: true });

        // Filter for directories only and add parent directory option
        const directories = entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => ({
            name: entry.name,
            path: path.join(targetPath, entry.name),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        // Optionally include files in the listing (for file selection mode)
        let files: Array<{ name: string; path: string }> = [];
        if (includeFiles) {
          files = entries
            .filter((entry) => {
              if (!entry.isFile()) return false;
              if (fileExtensions && fileExtensions.length > 0) {
                const ext = path.extname(entry.name).toLowerCase().replace('.', '');
                return fileExtensions.includes(ext) || fileExtensions.includes('*');
              }
              return true;
            })
            .map((entry) => ({
              name: entry.name,
              path: path.join(targetPath, entry.name),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
        }

        res.json({
          success: true,
          currentPath: targetPath,
          parentPath: safeParentPath,
          directories,
          files,
          drives,
        });
      } catch (error) {
        // Handle permission errors gracefully - still return path info so user can navigate away
        const errorMessage = error instanceof Error ? error.message : 'Failed to read directory';
        const isPermissionError = errorMessage.includes('EPERM') || errorMessage.includes('EACCES');

        if (isPermissionError) {
          // Return success with empty directories so user can still navigate to parent
          res.json({
            success: true,
            currentPath: targetPath,
            parentPath: safeParentPath,
            directories: [],
            drives,
            warning:
              'Permission denied - grant Full Disk Access to Terminal in System Preferences > Privacy & Security',
          });
        } else {
          res.status(400).json({
            success: false,
            error: errorMessage,
          });
        }
      }
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      logError(error, 'Browse directories failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// GET /image - Serve image files
// ---------------------------------------------------------------------------

function createImageHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { path: imagePath, projectPath } = req.query as {
        path?: string;
        projectPath?: string;
      };

      if (!imagePath) {
        res.status(400).json({ success: false, error: 'path is required' });
        return;
      }

      // Resolve full path
      const fullPath = path.isAbsolute(imagePath)
        ? imagePath
        : projectPath
          ? path.join(projectPath, imagePath)
          : imagePath;

      // Check if file exists
      try {
        await secureFs.access(fullPath);
      } catch (accessError) {
        if (accessError instanceof PathNotAllowedError) {
          res.status(403).json({ success: false, error: 'Path not allowed' });
          return;
        }
        res.status(404).json({ success: false, error: 'Image not found' });
        return;
      }

      // Read the file
      const buffer = await secureFs.readFile(fullPath);

      // Determine MIME type from extension
      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
      };

      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buffer);
    } catch (error) {
      logError(error, 'Serve image failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /save-board-background - Save board background image
// ---------------------------------------------------------------------------

function createSaveBoardBackgroundHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { data, filename, mimeType, projectPath } = req.body as {
        data: string;
        filename: string;
        mimeType: string;
        projectPath: string;
      };

      if (!data || !filename || !projectPath) {
        res.status(400).json({
          success: false,
          error: 'data, filename, and projectPath are required',
        });
        return;
      }

      // Get board directory
      const boardDir = getBoardDir(projectPath);
      await secureFs.mkdir(boardDir, { recursive: true });

      // Decode base64 data (remove data URL prefix if present)
      const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Use a fixed filename for the board background (overwrite previous)
      const ext = path.extname(filename) || '.png';
      const uniqueFilename = `background${ext}`;
      const filePath = path.join(boardDir, uniqueFilename);

      // Write file
      await secureFs.writeFile(filePath, buffer);

      // Return the absolute path
      res.json({ success: true, path: filePath });
    } catch (error) {
      logError(error, 'Save board background failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// POST /delete-board-background - Delete board background image
// ---------------------------------------------------------------------------

function createDeleteBoardBackgroundHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      // Get board directory
      const boardDir = getBoardDir(projectPath);

      try {
        // Try to remove all background files in the board directory
        const files = await secureFs.readdir(boardDir);
        for (const file of files) {
          if (file.startsWith('background')) {
            await secureFs.unlink(path.join(boardDir, file));
          }
        }
      } catch {
        // Directory may not exist, that's fine
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Delete board background failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createFsRoutes(_events: EventEmitter): Router {
  const router = Router();

  router.post('/read', createReadHandler());
  router.post('/write', createWriteHandler());
  router.post('/mkdir', createMkdirHandler());
  router.post('/readdir', createReaddirHandler());
  router.post('/exists', createExistsHandler());
  router.post('/stat', createStatHandler());
  router.post('/delete', createDeleteHandler());
  router.post('/validate-path', createValidatePathHandler());
  router.post('/resolve-directory', createResolveDirectoryHandler());
  router.post('/save-image', createSaveImageHandler());
  router.post('/browse', createBrowseHandler());
  router.get('/image', createImageHandler());
  router.post('/save-board-background', createSaveBoardBackgroundHandler());
  router.post('/delete-board-background', createDeleteBoardBackgroundHandler());

  return router;
}
