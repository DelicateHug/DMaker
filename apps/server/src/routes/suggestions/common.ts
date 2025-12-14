/**
 * Common utilities and state for suggestions routes
 */

import { createLogger } from "../../lib/logger.js";
import {
  getErrorMessage as getErrorMessageShared,
  createLogError,
} from "../common.js";

const logger = createLogger("Suggestions");

// Shared state for tracking generation status
export let isRunning = false;
export let currentAbortController: AbortController | null = null;

/**
 * Set the running state and abort controller
 */
export function setRunningState(
  running: boolean,
  controller: AbortController | null = null
): void {
  isRunning = running;
  currentAbortController = controller;
}

// Re-export shared utilities
export { getErrorMessageShared as getErrorMessage };
export const logError = createLogError(logger);
