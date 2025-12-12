/**
 * File system routes
 * Provides REST API equivalents for Electron IPC file operations
 */

import { Router, type Request, type Response } from "express";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { validatePath, addAllowedPath, isPathAllowed } from "../lib/security.js";
import type { EventEmitter } from "../lib/events.js";

export function createFsRoutes(_events: EventEmitter): Router {
  const router = Router();

  // Read file
  router.post("/read", async (req: Request, res: Response) => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: "filePath is required" });
        return;
      }

      const resolvedPath = validatePath(filePath);
      const content = await fs.readFile(resolvedPath, "utf-8");

      res.json({ success: true, content });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Write file
  router.post("/write", async (req: Request, res: Response) => {
    try {
      const { filePath, content } = req.body as {
        filePath: string;
        content: string;
      };

      if (!filePath) {
        res.status(400).json({ success: false, error: "filePath is required" });
        return;
      }

      const resolvedPath = validatePath(filePath);

      // Ensure parent directory exists
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      await fs.writeFile(resolvedPath, content, "utf-8");

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Create directory
  router.post("/mkdir", async (req: Request, res: Response) => {
    try {
      const { dirPath } = req.body as { dirPath: string };

      if (!dirPath) {
        res.status(400).json({ success: false, error: "dirPath is required" });
        return;
      }

      const resolvedPath = validatePath(dirPath);
      await fs.mkdir(resolvedPath, { recursive: true });

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Read directory
  router.post("/readdir", async (req: Request, res: Response) => {
    try {
      const { dirPath } = req.body as { dirPath: string };

      if (!dirPath) {
        res.status(400).json({ success: false, error: "dirPath is required" });
        return;
      }

      const resolvedPath = validatePath(dirPath);
      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

      const result = entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      }));

      res.json({ success: true, entries: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Check if file/directory exists
  router.post("/exists", async (req: Request, res: Response) => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: "filePath is required" });
        return;
      }

      // For exists, we check but don't require the path to be pre-allowed
      // This allows the UI to validate user-entered paths
      const resolvedPath = path.resolve(filePath);

      try {
        await fs.access(resolvedPath);
        res.json({ success: true, exists: true });
      } catch {
        res.json({ success: true, exists: false });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Get file stats
  router.post("/stat", async (req: Request, res: Response) => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: "filePath is required" });
        return;
      }

      const resolvedPath = validatePath(filePath);
      const stats = await fs.stat(resolvedPath);

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
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Delete file
  router.post("/delete", async (req: Request, res: Response) => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: "filePath is required" });
        return;
      }

      const resolvedPath = validatePath(filePath);
      await fs.rm(resolvedPath, { recursive: true });

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Validate and add path to allowed list
  // This is the web equivalent of dialog:openDirectory
  router.post("/validate-path", async (req: Request, res: Response) => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: "filePath is required" });
        return;
      }

      const resolvedPath = path.resolve(filePath);

      // Check if path exists
      try {
        const stats = await fs.stat(resolvedPath);

        if (!stats.isDirectory()) {
          res.status(400).json({ success: false, error: "Path is not a directory" });
          return;
        }

        // Add to allowed paths
        addAllowedPath(resolvedPath);

        res.json({
          success: true,
          path: resolvedPath,
          isAllowed: isPathAllowed(resolvedPath),
        });
      } catch {
        res.status(400).json({ success: false, error: "Path does not exist" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Save image to .automaker/images directory
  router.post("/save-image", async (req: Request, res: Response) => {
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
          error: "data, filename, and projectPath are required",
        });
        return;
      }

      // Create .automaker/images directory if it doesn't exist
      const imagesDir = path.join(projectPath, ".automaker", "images");
      await fs.mkdir(imagesDir, { recursive: true });

      // Decode base64 data (remove data URL prefix if present)
      const base64Data = data.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const ext = path.extname(filename) || ".png";
      const baseName = path.basename(filename, ext);
      const uniqueFilename = `${baseName}-${timestamp}${ext}`;
      const filePath = path.join(imagesDir, uniqueFilename);

      // Write file
      await fs.writeFile(filePath, buffer);

      // Add project path to allowed paths if not already
      addAllowedPath(projectPath);

      res.json({ success: true, path: filePath });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Browse directories - for file browser UI
  router.post("/browse", async (req: Request, res: Response) => {
    try {
      const { dirPath } = req.body as { dirPath?: string };

      // Default to home directory if no path provided
      const targetPath = dirPath ? path.resolve(dirPath) : os.homedir();

      // Detect available drives on Windows
      const detectDrives = async (): Promise<string[]> => {
        if (os.platform() !== "win32") {
          return [];
        }

        const drives: string[] = [];
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

        for (const letter of letters) {
          const drivePath = `${letter}:\\`;
          try {
            await fs.access(drivePath);
            drives.push(drivePath);
          } catch {
            // Drive doesn't exist, skip it
          }
        }

        return drives;
      };

      try {
        const stats = await fs.stat(targetPath);

        if (!stats.isDirectory()) {
          res.status(400).json({ success: false, error: "Path is not a directory" });
          return;
        }

        // Read directory contents
        const entries = await fs.readdir(targetPath, { withFileTypes: true });

        // Filter for directories only and add parent directory option
        const directories = entries
          .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
          .map((entry) => ({
            name: entry.name,
            path: path.join(targetPath, entry.name),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        // Get parent directory
        const parentPath = path.dirname(targetPath);
        const hasParent = parentPath !== targetPath;

        // Get available drives
        const drives = await detectDrives();

        res.json({
          success: true,
          currentPath: targetPath,
          parentPath: hasParent ? parentPath : null,
          directories,
          drives,
        });
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : "Failed to read directory",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Serve image files
  router.get("/image", async (req: Request, res: Response) => {
    try {
      const { path: imagePath, projectPath } = req.query as {
        path?: string;
        projectPath?: string;
      };

      if (!imagePath) {
        res.status(400).json({ success: false, error: "path is required" });
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
        await fs.access(fullPath);
      } catch {
        res.status(404).json({ success: false, error: "Image not found" });
        return;
      }

      // Read the file
      const buffer = await fs.readFile(fullPath);

      // Determine MIME type from extension
      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".bmp": "image/bmp",
      };

      res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
