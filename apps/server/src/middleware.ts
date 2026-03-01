/**
 * Server middleware - Content-type enforcement and path validation
 *
 * Consolidated from middleware/ directory into a single flat file.
 */

import type { Request, Response, NextFunction } from 'express';
import { validatePath, PathNotAllowedError } from '@dmaker/platform';

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
