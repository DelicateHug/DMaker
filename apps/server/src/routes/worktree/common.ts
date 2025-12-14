/**
 * Common utilities for worktree routes
 */

import { createLogger } from "../../lib/logger.js";
import { exec } from "child_process";
import { promisify } from "util";
import {
  getErrorMessage as getErrorMessageShared,
  createLogError,
} from "../common.js";

const logger = createLogger("Worktree");
const execAsync = promisify(exec);

/**
 * Check if a path is a git repo
 */
export async function isGitRepo(repoPath: string): Promise<boolean> {
  try {
    await execAsync("git rev-parse --is-inside-work-tree", { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

// Re-export shared utilities
export { getErrorMessageShared as getErrorMessage };
export const logError = createLogError(logger);
