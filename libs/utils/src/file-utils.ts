/**
 * File and Path Utilities
 *
 * Consolidated module for:
 * - File system operations with safe symlink handling
 * - Cross-platform path manipulation helpers
 */

import { secureFs } from '@dmaker/platform';
import path from 'path';

// =============================================================================
// File System Utilities (safe symlink handling)
// =============================================================================

/**
 * Create a directory, handling symlinks safely to avoid ELOOP errors.
 * If the path already exists as a directory or symlink, returns success.
 */
export async function mkdirSafe(dirPath: string): Promise<void> {
  const resolvedPath = path.resolve(dirPath);

  // Check if path already exists using lstat (doesn't follow symlinks)
  try {
    const stats = await secureFs.lstat(resolvedPath);
    // Path exists - if it's a directory or symlink, consider it success
    if (stats.isDirectory() || stats.isSymbolicLink()) {
      return;
    }
    // It's a file - can't create directory
    throw new Error(`Path exists and is not a directory: ${resolvedPath}`);
  } catch (error: any) {
    // ENOENT means path doesn't exist - we should create it
    if (error.code !== 'ENOENT') {
      // Some other error (could be ELOOP in parent path)
      // If it's ELOOP, the path involves symlinks - don't try to create
      if (error.code === 'ELOOP') {
        console.warn(`[fs-utils] Symlink loop detected at ${resolvedPath}, skipping mkdir`);
        return;
      }
      throw error;
    }
  }

  // Path doesn't exist, create it
  try {
    await secureFs.mkdir(resolvedPath, { recursive: true });
  } catch (error: any) {
    // Handle race conditions and symlink issues
    if (error.code === 'EEXIST' || error.code === 'ELOOP') {
      return;
    }
    throw error;
  }
}

/**
 * Check if a path exists, handling symlinks safely.
 * Returns true if the path exists as a file, directory, or symlink.
 */
export async function existsSafe(filePath: string): Promise<boolean> {
  try {
    await secureFs.lstat(filePath);
    return true;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return false;
    }
    // ELOOP or other errors - path exists but is problematic
    if (error.code === 'ELOOP') {
      return true; // Symlink exists, even if looping
    }
    throw error;
  }
}

// =============================================================================
// Path Utilities (cross-platform path manipulation)
// =============================================================================

/**
 * Normalize a path by converting backslashes to forward slashes
 *
 * This ensures consistent path representation across platforms:
 * - Windows: C:\Users\foo\bar -> C:/Users/foo/bar
 * - Unix: /home/foo/bar -> /home/foo/bar (unchanged)
 *
 * @param p - Path string to normalize
 * @returns Normalized path with forward slashes
 *
 * @example
 * ```typescript
 * normalizePath("C:\\Users\\foo\\bar"); // "C:/Users/foo/bar"
 * normalizePath("/home/foo/bar");       // "/home/foo/bar"
 * ```
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Compare two paths for equality after normalization
 *
 * Handles null/undefined values and normalizes paths before comparison.
 * Useful for checking if two paths refer to the same location regardless
 * of platform-specific path separators.
 *
 * @param p1 - First path to compare (or null/undefined)
 * @param p2 - Second path to compare (or null/undefined)
 * @returns true if paths are equal (or both null/undefined), false otherwise
 *
 * @example
 * ```typescript
 * pathsEqual("C:\\foo\\bar", "C:/foo/bar");     // true
 * pathsEqual("/home/user", "/home/user");       // true
 * pathsEqual("/home/user", "/home/other");      // false
 * pathsEqual(null, undefined);                  // false
 * pathsEqual(null, null);                       // true
 * ```
 */
export function pathsEqual(p1: string | undefined | null, p2: string | undefined | null): boolean {
  if (!p1 || !p2) return p1 === p2;
  return normalizePath(p1) === normalizePath(p2);
}
