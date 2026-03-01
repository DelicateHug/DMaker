/**
 * MCP routes - HTTP API for testing MCP servers
 *
 * Provides endpoints for:
 * - Testing MCP server connections
 * - Listing available tools from MCP servers
 *
 * Mounted at /api/mcp in the main server.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '@dmaker/utils';
import type { MCPTestService } from '../services/mcp-test-service.js';

// ---------------------------------------------------------------------------
// Logger & error helpers
// ---------------------------------------------------------------------------

const logger = createLogger('MCP');

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function logError(error: unknown, message: string): void {
  logger.error(`${message}:`, error);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestServerRequest {
  serverId: string;
}

interface ListToolsRequest {
  serverId: string;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/mcp/test - Test MCP server connection and list tools
 *
 * SECURITY: Only accepts serverId to look up saved configs. Does NOT accept
 * arbitrary serverConfig to prevent drive-by command execution attacks.
 * Users must explicitly save a server config through the UI before testing.
 */
function createTestServerHandler(mcpTestService: MCPTestService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as TestServerRequest;

      if (!body.serverId || typeof body.serverId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'serverId is required',
        });
        return;
      }

      const result = await mcpTestService.testServerById(body.serverId);
      res.json(result);
    } catch (error) {
      logError(error, 'Test server failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * POST /api/mcp/tools - List tools for an MCP server
 *
 * SECURITY: Only accepts serverId to look up saved configs. Does NOT accept
 * arbitrary serverConfig to prevent drive-by command execution attacks.
 * Users must explicitly save a server config through the UI before testing.
 */
function createListToolsHandler(mcpTestService: MCPTestService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as ListToolsRequest;

      if (!body.serverId || typeof body.serverId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'serverId is required',
        });
        return;
      }

      const result = await mcpTestService.testServerById(body.serverId);

      // Return only tool-related information
      res.json({
        success: result.success,
        tools: result.tools,
        error: result.error,
      });
    } catch (error) {
      logError(error, 'List tools failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Create MCP router with all endpoints
 *
 * Endpoints:
 * - POST /test - Test MCP server connection
 * - POST /tools - List tools from MCP server
 *
 * @param mcpTestService - Instance of MCPTestService for testing connections
 * @returns Express Router configured with all MCP endpoints
 */
export function createMCPRoutes(mcpTestService: MCPTestService): Router {
  const router = Router();

  // Test MCP server connection
  router.post('/test', createTestServerHandler(mcpTestService));

  // List tools from MCP server
  router.post('/tools', createListToolsHandler(mcpTestService));

  return router;
}
