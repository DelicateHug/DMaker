/**
 * Server middleware - Content-type enforcement and path validation
 *
 * Consolidated from middleware/ directory into a single flat file.
 */

import type { Request, Response, NextFunction } from 'express';
import { validatePath, PathNotAllowedError } from '@dmaker/platform';
import { createLogger } from '@dmaker/utils';
import { findReadOnlyRule } from './lib/execution-routes.js';
import { getPeerUrl, isReadOnly } from './lib/runtime-env.js';

const readOnlyLogger = createLogger('ReadOnly');

// ============================================================================
// Require JSON Content-Type (from middleware/require-json-content-type.ts)
// ============================================================================

// HTTP methods that typically include request bodies
const METHODS_REQUIRING_JSON = ['POST', 'PUT', 'PATCH'];

/**
 * Middleware that requires Content-Type: application/json for POST/PUT/PATCH requests
 *
 * Returns 415 Unsupported Media Type if:
 * - The request method is POST, PUT, or PATCH
 * - AND the Content-Type header is missing or not application/json
 *
 * Allows requests to pass through if:
 * - The request method is GET, DELETE, OPTIONS, HEAD, etc.
 * - OR the Content-Type is properly set to application/json (with optional charset)
 */
export function requireJsonContentType(req: Request, res: Response, next: NextFunction): void {
  // Skip validation for methods that don't require a body
  if (!METHODS_REQUIRING_JSON.includes(req.method)) {
    next();
    return;
  }

  const contentType = req.headers['content-type'];

  // Check if Content-Type header exists and contains application/json
  // Allows for charset parameter: "application/json; charset=utf-8"
  if (!contentType || !contentType.toLowerCase().includes('application/json')) {
    res.status(415).json({
      success: false,
      error: 'Unsupported Media Type',
      message: 'Content-Type header must be application/json',
    });
    return;
  }

  next();
}

// ============================================================================
// Validate Path Params (from middleware/validate-paths.ts)
// ============================================================================

/**
 * Helper to get parameter value from request (checks body first, then query)
 */
function getParamValue(req: Request, paramName: string): unknown {
  // Check body first (for POST/PUT/PATCH requests)
  if (req.body && req.body[paramName] !== undefined) {
    return req.body[paramName];
  }
  // Fall back to query params (for GET requests)
  if (req.query && req.query[paramName] !== undefined) {
    return req.query[paramName];
  }
  return undefined;
}

/**
 * Creates a middleware that validates specified path parameters in req.body or req.query
 * @param paramNames - Names of parameters to validate (e.g., 'projectPath', 'worktreePath')
 * @example
 * router.post('/create', validatePathParams('projectPath'), handler);
 * router.post('/delete', validatePathParams('projectPath', 'worktreePath'), handler);
 * router.post('/send', validatePathParams('workingDirectory?', 'imagePaths[]'), handler);
 * router.get('/logs', validatePathParams('worktreePath'), handler); // Works with query params too
 *
 * Special syntax:
 * - 'paramName?' - Optional parameter (only validated if present)
 * - 'paramName[]' - Array parameter (validates each element)
 */
export function validatePathParams(...paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      for (const paramName of paramNames) {
        // Handle optional parameters (paramName?)
        if (paramName.endsWith('?')) {
          const actualName = paramName.slice(0, -1);
          const value = getParamValue(req, actualName);
          if (value && typeof value === 'string') {
            validatePath(value);
          }
          continue;
        }

        // Handle array parameters (paramName[])
        if (paramName.endsWith('[]')) {
          const actualName = paramName.slice(0, -2);
          const values = getParamValue(req, actualName);
          if (Array.isArray(values) && values.length > 0) {
            for (const value of values) {
              if (typeof value === 'string') {
                validatePath(value);
              }
            }
          }
          continue;
        }

        // Handle regular parameters
        const value = getParamValue(req, paramName);
        if (value && typeof value === 'string') {
          validatePath(value);
        }
      }

      next();
    } catch (error) {
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({
          success: false,
          error: error.message,
        });
        return;
      }

      // Re-throw unexpected errors
      throw error;
    }
  };
}

// ============================================================================
// Read-only gate (dev half of a start.ps1 pair)
// ============================================================================

/**
 * Refuse execution requests when this process is the read-only environment.
 *
 * Dev exists to look at and edit — browse the board, write features, change
 * settings, read diffs. It must never *start* anything: two environments
 * pointed at the same repo both running agents would fight over worktrees and
 * over the shared git checkout.
 *
 * The refusal carries `readOnly: true` so the UI can tell "you're on the
 * read-only environment, switch to prod" apart from a real permission error.
 */
export function createReadOnlyMiddleware() {
  return function readOnlyGuard(req: Request, res: Response, next: NextFunction): void {
    if (!isReadOnly()) {
      next();
      return;
    }

    const rule = findReadOnlyRule(req.method, req.originalUrl);
    if (!rule) {
      next();
      return;
    }

    readOnlyLogger.warn(`Blocked in read-only dev: ${req.method} ${req.originalUrl}`);
    res.status(403).json({
      success: false,
      readOnly: true,
      // Machine-readable so the UI can offer "switch to prod" rather than just
      // echoing the message as a generic failure.
      errorCode: 'READ_ONLY_ENV',
      error: `${rule.what} is disabled on the read-only dev environment.`,
      message: `Switch to the prod environment (${getPeerUrl()}) to run tasks.`,
      peerUrl: getPeerUrl(),
    });
  };
}
