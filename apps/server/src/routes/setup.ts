/**
 * Setup routes - HTTP API for CLI detection, API keys, and platform info
 *
 * Consolidated from setup/ directory into a single flat file.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import { createLogger } from '@dmaker/utils';
import { secureFs } from '@dmaker/platform';
import {
  getClaudeCliPaths,
  getClaudeAuthIndicators,
  systemPathAccess,
  getGitHubCliPaths,
  getExtendedPath,
  getCodexAuthIndicators,
} from '@dmaker/platform';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { CODEX_MODEL_MAP } from '@dmaker/types';
import { ProviderFactory } from '../providers/provider-factory.js';
import { CodexProvider } from '../providers/codex-provider.js';
import { CursorProvider } from '../providers/cursor-provider.js';
import { OpencodeProvider, type OpenCodeProviderInfo } from '../providers/opencode-provider.js';
import type { ModelDefinition } from '@dmaker/types';
import { CursorConfigManager } from '../providers/cursor-config-manager.js';
import {
  CURSOR_MODEL_MAP,
  CURSOR_PERMISSION_PROFILES,
  type CursorModelId,
  type CursorPermissionProfile,
  type CursorCliPermissions,
} from '@dmaker/types';
import {
  readGlobalConfig,
  readProjectConfig,
  getEffectivePermissions,
  applyProfileToProject,
  applyProfileGlobally,
  writeProjectConfig,
  deleteProjectConfig,
  detectProfile,
  hasProjectConfig,
  getAvailableProfiles,
  generateExampleConfig,
} from '../services/cursor-config-service.js';
import {
  createSecureAuthEnv,
  AuthSessionManager,
  AuthRateLimiter,
  validateApiKey,
  createTempEnvOverride,
} from '../lib/security.js';

const execAsync = promisify(exec);

// ============================================================================
// Logger & Error Utilities (inlined from common.ts)
// ============================================================================

const logger = createLogger('Setup');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`\u274c ${context}:`, error);
}

// ============================================================================
// API Key Storage (from setup/common.ts)
// ============================================================================

const apiKeys: Record<string, string> = {};

function getApiKey(provider: string): string | undefined {
  return apiKeys[provider];
}

function setApiKey(provider: string, key: string): void {
  apiKeys[provider] = key;
}

function getAllApiKeys(): Record<string, string> {
  return { ...apiKeys };
}

async function persistApiKeyToEnv(key: string, value: string): Promise<void> {
  const envPath = path.join(process.cwd(), '.env');

  try {
    await secureFs.writeEnvKey(envPath, key, value);
    logger.info(`[Setup] Persisted ${key} to .env file`);
  } catch (error) {
    logger.error(`[Setup] Failed to persist ${key} to .env:`, error);
    throw error;
  }
}

// ============================================================================
// Claude Status Business Logic (from setup/get-claude-status.ts)
// ============================================================================

const DISCONNECTED_MARKER_FILE = '.claude-disconnected';

function isDisconnectedFromApp(): boolean {
  try {
    const projectRoot = process.cwd();
    const markerPath = path.join(projectRoot, '.dmaker', DISCONNECTED_MARKER_FILE);
    return fs.existsSync(markerPath);
  } catch {
    return false;
  }
}

async function getClaudeStatus() {
  let installed = false;
  let version = '';
  let cliPath = '';
  let method = 'none';

  const isWindows = process.platform === 'win32';

  try {
    const findCommand = isWindows ? 'where claude' : 'which claude';
    const { stdout } = await execAsync(findCommand);
    cliPath = stdout.trim().split(/\r?\n/)[0];
    installed = true;
    method = 'path';

    try {
      const { stdout: versionOut } = await execAsync('claude --version');
      version = versionOut.trim();
    } catch {
      // Version command might not be available
    }
  } catch {
    const commonPaths = getClaudeCliPaths();

    for (const p of commonPaths) {
      try {
        if (await systemPathAccess(p)) {
          cliPath = p;
          installed = true;
          method = 'local';

          try {
            const { stdout: versionOut } = await execAsync(`"${p}" --version`);
            version = versionOut.trim();
          } catch {
            // Version command might not be available
          }
          break;
        }
      } catch {
        // Not found at this path
      }
    }
  }

  if (isDisconnectedFromApp()) {
    return {
      status: installed ? 'installed' : 'not_installed',
      installed,
      method,
      version,
      path: cliPath,
      auth: {
        authenticated: false,
        method: 'none',
        hasCredentialsFile: false,
        hasToken: false,
        hasStoredOAuthToken: false,
        hasStoredApiKey: false,
        hasEnvApiKey: false,
        oauthTokenValid: false,
        apiKeyValid: false,
        hasCliAuth: false,
        hasRecentActivity: false,
      },
    };
  }

  const auth = {
    authenticated: false,
    method: 'none' as string,
    hasCredentialsFile: false,
    hasToken: false,
    hasStoredOAuthToken: !!getApiKey('anthropic_oauth_token'),
    hasStoredApiKey: !!getApiKey('anthropic'),
    hasEnvApiKey: !!process.env.ANTHROPIC_API_KEY,
    oauthTokenValid: false,
    apiKeyValid: false,
    hasCliAuth: false,
    hasRecentActivity: false,
  };

  const indicators = await getClaudeAuthIndicators();

  if (indicators.hasStatsCacheWithActivity) {
    auth.hasRecentActivity = true;
    auth.hasCliAuth = true;
    auth.authenticated = true;
    auth.method = 'cli_authenticated';
  }

  if (!auth.hasCliAuth && indicators.hasSettingsFile && indicators.hasProjectsSessions) {
    auth.hasCliAuth = true;
    auth.authenticated = true;
    auth.method = 'cli_authenticated';
  }

  if (indicators.hasCredentialsFile && indicators.credentials) {
    auth.hasCredentialsFile = true;
    if (indicators.credentials.hasOAuthToken) {
      auth.hasStoredOAuthToken = true;
      auth.oauthTokenValid = true;
      auth.authenticated = true;
      auth.method = 'oauth_token';
    } else if (indicators.credentials.hasApiKey) {
      auth.apiKeyValid = true;
      auth.authenticated = true;
      auth.method = 'api_key';
    }
  }

  if (auth.hasEnvApiKey) {
    auth.authenticated = true;
    auth.apiKeyValid = true;
    auth.method = 'api_key_env';
  }

  if (!auth.authenticated && getApiKey('anthropic_oauth_token')) {
    auth.authenticated = true;
    auth.oauthTokenValid = true;
    auth.method = 'oauth_token';
  }

  if (!auth.authenticated && getApiKey('anthropic')) {
    auth.authenticated = true;
    auth.apiKeyValid = true;
    auth.method = 'api_key';
  }

  return {
    status: installed ? 'installed' : 'not_installed',
    installed,
    method,
    version,
    path: cliPath,
    auth,
  };
}

// ============================================================================
// GitHub Status (from setup/routes/gh-status.ts)
// ============================================================================

const ghExecEnv = {
  ...process.env,
  PATH: getExtendedPath(),
};

export interface GhStatus {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  path: string | null;
  user: string | null;
  error?: string;
}

async function getGhStatus(): Promise<GhStatus> {
  const status: GhStatus = {
    installed: false,
    authenticated: false,
    version: null,
    path: null,
    user: null,
  };

  const isWindows = process.platform === 'win32';

  try {
    const findCommand = isWindows ? 'where gh' : 'command -v gh';
    const { stdout } = await execAsync(findCommand, { env: ghExecEnv });
    status.path = stdout.trim().split(/\r?\n/)[0];
    status.installed = true;
  } catch {
    const commonPaths = getGitHubCliPaths();

    for (const p of commonPaths) {
      try {
        if (await systemPathAccess(p)) {
          status.path = p;
          status.installed = true;
          break;
        }
      } catch {
        // Not found at this path
      }
    }
  }

  if (!status.installed) {
    return status;
  }

  try {
    const { stdout } = await execAsync('gh --version', { env: ghExecEnv });
    const versionMatch = stdout.match(/gh version ([\d.]+)/);
    status.version = versionMatch ? versionMatch[1] : stdout.trim().split('\n')[0];
  } catch {
    // Version command failed
  }

  let apiCallSucceeded = false;
  try {
    const { stdout } = await execAsync('gh api user --jq ".login"', { env: ghExecEnv });
    const user = stdout.trim();
    if (user) {
      status.authenticated = true;
      status.user = user;
      apiCallSucceeded = true;
    }
  } catch {
    // API call failed
  }

  if (!apiCallSucceeded) {
    try {
      const { stdout } = await execAsync('gh auth status', { env: ghExecEnv });
      status.authenticated = true;

      const userMatch =
        stdout.match(/Logged in to [^\s]+ account ([^\s]+)/i) ||
        stdout.match(/Logged in to [^\s]+ as ([^\s]+)/i);
      if (userMatch) {
        status.user = userMatch[1];
      }
    } catch {
      status.authenticated = false;
    }
  }

  return status;
}

// ============================================================================
// Verify Claude Auth (from setup/routes/verify-claude-auth.ts)
// ============================================================================

const claudeRateLimiter = new AuthRateLimiter();

const CLAUDE_AUTH_ERROR_PATTERNS = [
  'OAuth token revoked',
  'Please run /login',
  'please run /login',
  'token revoked',
  'invalid_api_key',
  'authentication_error',
  'unauthorized',
  'not authenticated',
  'authentication failed',
  'invalid api key',
  'api key is invalid',
];

const CLAUDE_BILLING_ERROR_PATTERNS = [
  'credit balance is too low',
  'credit balance too low',
  'insufficient credits',
  'insufficient balance',
  'no credits',
  'out of credits',
  'billing',
  'payment required',
  'add credits',
];

const CLAUDE_RATE_LIMIT_PATTERNS = [
  'limit reached',
  'rate limit',
  'rate_limit',
  'resets',
  '/upgrade',
  'extra-usage',
];

function isClaudeRateLimitError(text: string): boolean {
  const lowerText = text.toLowerCase();
  if (isClaudeBillingError(text)) {
    return false;
  }
  return CLAUDE_RATE_LIMIT_PATTERNS.some((pattern) => lowerText.includes(pattern.toLowerCase()));
}

function isClaudeBillingError(text: string): boolean {
  const lowerText = text.toLowerCase();
  return CLAUDE_BILLING_ERROR_PATTERNS.some((pattern) => lowerText.includes(pattern.toLowerCase()));
}

function containsClaudeAuthError(text: string): boolean {
  const lowerText = text.toLowerCase();
  return CLAUDE_AUTH_ERROR_PATTERNS.some((pattern) => lowerText.includes(pattern.toLowerCase()));
}

// ============================================================================
// Verify Codex Auth (from setup/routes/verify-codex-auth.ts)
// ============================================================================

const codexRateLimiter = new AuthRateLimiter();
const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';
const CODEX_AUTH_PROMPT = "Reply with only the word 'ok'";
const CODEX_AUTH_TIMEOUT_MS = 30000;
const CODEX_ERROR_BILLING_MESSAGE =
  'Credit balance is too low. Please add credits to your OpenAI account.';
const CODEX_ERROR_RATE_LIMIT_MESSAGE =
  'Rate limit reached. Please wait a while before trying again or upgrade your plan.';
const CODEX_ERROR_CLI_AUTH_REQUIRED =
  "CLI authentication failed. Please run 'codex login' to authenticate.";
const CODEX_ERROR_API_KEY_REQUIRED = 'No API key configured. Please enter an API key first.';
const CODEX_AUTH_ERROR_PATTERNS = [
  'authentication',
  'unauthorized',
  'invalid_api_key',
  'invalid api key',
  'api key is invalid',
  'not authenticated',
  'login',
  'auth(',
  'token refresh',
  'tokenrefresh',
  'failed to parse server response',
  'transport channel closed',
];
const CODEX_BILLING_ERROR_PATTERNS = [
  'credit balance is too low',
  'credit balance too low',
  'insufficient credits',
  'insufficient balance',
  'no credits',
  'out of credits',
  'billing',
  'payment required',
  'add credits',
];
const CODEX_RATE_LIMIT_PATTERNS = [
  'limit reached',
  'rate limit',
  'rate_limit',
  'too many requests',
  'resets',
  '429',
];

function containsCodexAuthError(text: string): boolean {
  const lowerText = text.toLowerCase();
  return CODEX_AUTH_ERROR_PATTERNS.some((pattern) => lowerText.includes(pattern));
}

function isCodexBillingError(text: string): boolean {
  const lowerText = text.toLowerCase();
  return CODEX_BILLING_ERROR_PATTERNS.some((pattern) => lowerText.includes(pattern));
}

function isCodexRateLimitError(text: string): boolean {
  if (isCodexBillingError(text)) {
    return false;
  }
  const lowerText = text.toLowerCase();
  return CODEX_RATE_LIMIT_PATTERNS.some((pattern) => lowerText.includes(pattern));
}

// ============================================================================
// Cursor disconnection helpers
// ============================================================================

const CURSOR_DISCONNECTED_MARKER_FILE = '.cursor-disconnected';

function isCursorDisconnectedFromApp(): boolean {
  try {
    const projectRoot = process.cwd();
    const markerPath = path.join(projectRoot, '.dmaker', CURSOR_DISCONNECTED_MARKER_FILE);
    return fs.existsSync(markerPath);
  } catch {
    return false;
  }
}

// ============================================================================
// Codex disconnection helpers
// ============================================================================

const CODEX_DISCONNECTED_MARKER_FILE = '.codex-disconnected';

function isCodexDisconnectedFromApp(): boolean {
  try {
    const projectRoot = process.cwd();
    const markerPath = path.join(projectRoot, '.dmaker', CODEX_DISCONNECTED_MARKER_FILE);
    return fs.existsSync(markerPath);
  } catch {
    return false;
  }
}

// ============================================================================
// OpenCode Models (singleton provider)
// ============================================================================

const opencodeModelsLogger = createLogger('OpenCodeModelsRoute');

let opencodeProviderInstance: OpencodeProvider | null = null;

function getOpencodeProvider(): OpencodeProvider {
  if (!opencodeProviderInstance) {
    opencodeProviderInstance = new OpencodeProvider();
  }
  return opencodeProviderInstance;
}

interface ModelsResponse {
  success: boolean;
  models?: ModelDefinition[];
  count?: number;
  cached?: boolean;
  error?: string;
}

interface ProvidersResponse {
  success: boolean;
  providers?: OpenCodeProviderInfo[];
  authenticated?: OpenCodeProviderInfo[];
  error?: string;
}

// ============================================================================
// Cursor Config path validation
// ============================================================================

function validateProjectPath(projectPath: string): void {
  const resolved = path.resolve(projectPath);
  const normalized = path.normalize(projectPath);

  if (normalized.includes('..') || projectPath.includes('..')) {
    throw new Error('Invalid project path: path traversal not allowed');
  }

  if (!resolved.startsWith(path.resolve(normalized))) {
    throw new Error('Invalid project path: path traversal detected');
  }
}

// ============================================================================
// Delete API Key helper
// ============================================================================

const deleteApiKeyLogger = createLogger('Setup');

async function removeApiKeyFromEnv(key: string): Promise<void> {
  const envPath = path.join(process.cwd(), '.env');

  try {
    await secureFs.removeEnvKey(envPath, key);
    deleteApiKeyLogger.info(`[Setup] Removed ${key} from .env file`);
  } catch (error) {
    deleteApiKeyLogger.error(`[Setup] Failed to remove ${key} from .env:`, error);
    throw error;
  }
}

// ============================================================================
// Route Handler Functions
// ============================================================================

function createClaudeStatusHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const status = await getClaudeStatus();
      res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      logError(error, 'Get Claude status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createInstallClaudeHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json({
        success: false,
        error:
          'CLI installation requires terminal access. Please install manually using: npm install -g @anthropic-ai/claude-code',
      });
    } catch (error) {
      logError(error, 'Install Claude CLI failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createAuthClaudeHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const markerPath = path.join(process.cwd(), '.dmaker', '.claude-disconnected');
      if (fs.existsSync(markerPath)) {
        fs.unlinkSync(markerPath);
      }

      const { getClaudeAuthIndicators: getIndicators } = await import('@dmaker/platform');
      const indicators = await getIndicators();
      const isAlreadyAuthenticated =
        indicators.hasStatsCacheWithActivity ||
        (indicators.hasSettingsFile && indicators.hasProjectsSessions) ||
        indicators.hasCredentialsFile;

      if (isAlreadyAuthenticated) {
        res.json({
          success: true,
          message: 'Claude CLI is now linked with the app',
          wasAlreadyAuthenticated: true,
        });
      } else {
        res.json({
          success: true,
          message:
            'Claude CLI is now linked with the app. If prompted, please authenticate with "claude login" in your terminal.',
          requiresManualAuth: true,
        });
      }
    } catch (error) {
      logError(error, 'Auth Claude failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: 'Failed to link Claude CLI with the app',
      });
    }
  };
}

function createDeauthClaudeHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const dmakerDir = path.join(process.cwd(), '.dmaker');
      const markerPath = path.join(dmakerDir, '.claude-disconnected');

      if (!fs.existsSync(dmakerDir)) {
        fs.mkdirSync(dmakerDir, { recursive: true });
      }

      fs.writeFileSync(
        markerPath,
        JSON.stringify({
          disconnectedAt: new Date().toISOString(),
          message: 'Claude CLI is disconnected from the app',
        })
      );

      res.json({
        success: true,
        message: 'Claude CLI is now disconnected from the app',
      });
    } catch (error) {
      logError(error, 'Deauth Claude failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: 'Failed to disconnect Claude CLI from the app',
      });
    }
  };
}

function createStoreApiKeyHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { provider, apiKey } = req.body as {
        provider: string;
        apiKey: string;
      };

      if (!provider || !apiKey) {
        res.status(400).json({ success: false, error: 'provider and apiKey required' });
        return;
      }

      const providerEnvMap: Record<string, string> = {
        anthropic: 'ANTHROPIC_API_KEY',
        anthropic_oauth_token: 'ANTHROPIC_API_KEY',
        openai: 'OPENAI_API_KEY',
      };
      const envKey = providerEnvMap[provider];
      if (!envKey) {
        res.status(400).json({
          success: false,
          error: `Unsupported provider: ${provider}. Only anthropic and openai are supported.`,
        });
        return;
      }

      setApiKey(provider, apiKey);
      process.env[envKey] = apiKey;
      await persistApiKeyToEnv(envKey, apiKey);
      logger.info(`[Setup] Stored API key as ${envKey}`);

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Store API key failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createDeleteApiKeyHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { provider } = req.body as { provider: string };

      if (!provider) {
        res.status(400).json({
          success: false,
          error: 'Provider is required',
        });
        return;
      }

      logger.info(`[Setup] Deleting API key for provider: ${provider}`);

      const envKeyMap: Record<string, string> = {
        anthropic: 'ANTHROPIC_API_KEY',
        openai: 'OPENAI_API_KEY',
      };

      const envKey = envKeyMap[provider];
      if (!envKey) {
        res.status(400).json({
          success: false,
          error: `Unknown provider: ${provider}. Only anthropic and openai are supported.`,
        });
        return;
      }

      setApiKey(provider, '');
      delete process.env[envKey];
      await removeApiKeyFromEnv(envKey);

      logger.info(`[Setup] Successfully deleted API key for ${provider}`);

      res.json({
        success: true,
        message: `API key for ${provider} has been deleted`,
      });
    } catch (error) {
      logger.error('[Setup] Delete API key error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete API key',
      });
    }
  };
}

function createApiKeysHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json({
        success: true,
        hasAnthropicKey: !!getApiKey('anthropic') || !!process.env.ANTHROPIC_API_KEY,
        hasGoogleKey: !!getApiKey('google'),
        hasOpenaiKey: !!getApiKey('openai') || !!process.env.OPENAI_API_KEY,
      });
    } catch (error) {
      logError(error, 'Get API keys failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createPlatformHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const platform = os.platform();
      res.json({
        success: true,
        platform,
        arch: os.arch(),
        homeDir: os.homedir(),
        isWindows: platform === 'win32',
        isMac: platform === 'darwin',
        isLinux: platform === 'linux',
      });
    } catch (error) {
      logError(error, 'Get platform info failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createVerifyClaudeAuthHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { authMethod, apiKey } = req.body as {
        authMethod?: 'cli' | 'api_key';
        apiKey?: string;
      };

      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      if (!claudeRateLimiter.canAttempt(clientIp)) {
        const resetTime = claudeRateLimiter.getResetTime(clientIp);
        res.status(429).json({
          success: false,
          authenticated: false,
          error: 'Too many authentication attempts. Please try again later.',
          resetTime,
        });
        return;
      }

      logger.info(
        `[Setup] Verifying Claude authentication using method: ${authMethod || 'auto'}${apiKey ? ' (with provided key)' : ''}`
      );

      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 30000);

      let authenticated = false;
      let errorMessage = '';
      let receivedAnyContent = false;

      const sessionId = `claude-auth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      try {
        if (authMethod === 'api_key' && apiKey) {
          const validation = validateApiKey(apiKey, 'anthropic');
          if (!validation.isValid) {
            res.json({
              success: true,
              authenticated: false,
              error: validation.error,
            });
            return;
          }
        }

        const authEnv = createSecureAuthEnv(authMethod || 'api_key', apiKey, 'anthropic');

        if (authMethod === 'api_key' && !apiKey) {
          const storedApiKey = getApiKey('anthropic');
          if (storedApiKey) {
            authEnv.ANTHROPIC_API_KEY = storedApiKey;
            logger.info('[Setup] Using stored API key for verification');
          } else if (!authEnv.ANTHROPIC_API_KEY) {
            res.json({
              success: true,
              authenticated: false,
              error: 'No API key configured. Please enter an API key first.',
            });
            return;
          }
        }

        AuthSessionManager.createSession(sessionId, authMethod || 'api_key', apiKey, 'anthropic');

        const cleanupEnv = createTempEnvOverride(authEnv);

        const stream = query({
          prompt: "Reply with only the word 'ok'",
          options: {
            model: 'claude-sonnet-4-20250514',
            maxTurns: 1,
            allowedTools: [],
            abortController,
          },
        });

        const allMessages: string[] = [];

        for await (const msg of stream) {
          const msgStr = JSON.stringify(msg);
          allMessages.push(msgStr);
          logger.info('[Setup] Stream message:', msgStr.substring(0, 500));

          if (isClaudeBillingError(msgStr)) {
            logger.error('[Setup] Found billing error in message');
            errorMessage =
              'Credit balance is too low. Please add credits to your Anthropic account at console.anthropic.com';
            authenticated = false;
            break;
          }

          if (containsClaudeAuthError(msgStr)) {
            logger.error('[Setup] Found auth error in message');
            if (authMethod === 'cli') {
              errorMessage =
                "CLI authentication failed. Please run 'claude login' in your terminal to authenticate.";
            } else {
              errorMessage = 'API key is invalid or has been revoked.';
            }
            break;
          }

          if (msg.type === 'assistant' && (msg as any).message?.content) {
            const content = (msg as any).message.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  const text = block.text;
                  logger.info('[Setup] Assistant text:', text);

                  if (containsClaudeAuthError(text)) {
                    if (authMethod === 'cli') {
                      errorMessage =
                        "CLI authentication failed. Please run 'claude login' in your terminal to authenticate.";
                    } else {
                      errorMessage = 'API key is invalid or has been revoked.';
                    }
                    break;
                  }

                  if (text.toLowerCase().includes('ok') || text.length > 0) {
                    receivedAnyContent = true;
                  }
                }
              }
            }
          }

          if (msg.type === 'result') {
            const resultStr = JSON.stringify(msg);

            if (isClaudeBillingError(resultStr)) {
              logger.error('[Setup] Billing error detected - insufficient credits');
              errorMessage =
                'Credit balance is too low. Please add credits to your Anthropic account at console.anthropic.com';
              authenticated = false;
              break;
            } else if (isClaudeRateLimitError(resultStr)) {
              logger.warn('[Setup] Rate limit detected - treating as unverified');
              errorMessage =
                'Rate limit reached. Please wait a while before trying again or upgrade your plan.';
              authenticated = false;
              break;
            } else if (containsClaudeAuthError(resultStr)) {
              if (authMethod === 'cli') {
                errorMessage =
                  "CLI authentication failed. Please run 'claude login' in your terminal to authenticate.";
              } else {
                errorMessage = 'API key is invalid or has been revoked.';
              }
            } else {
              receivedAnyContent = true;
            }
          }
        }

        if (errorMessage) {
          authenticated = false;
        } else if (receivedAnyContent) {
          authenticated = true;
        } else {
          logger.warn('[Setup] No content received from stream');
          logger.warn('[Setup] All messages:', allMessages.join('\n'));
          errorMessage = 'No response received from Claude. Please check your authentication.';
        }
      } catch (error: unknown) {
        const errMessage = error instanceof Error ? error.message : String(error);

        logger.error('[Setup] Claude auth verification exception:', errMessage);

        if (isClaudeBillingError(errMessage)) {
          authenticated = false;
          errorMessage =
            'Credit balance is too low. Please add credits to your Anthropic account at console.anthropic.com';
        } else if (isClaudeRateLimitError(errMessage)) {
          authenticated = false;
          errorMessage =
            'Rate limit reached. Please wait a while before trying again or upgrade your plan.';
          logger.warn('[Setup] Rate limit in exception - treating as unverified');
        } else if (authenticated) {
          logger.info('[Setup] Auth already confirmed, ignoring exception');
        } else if (containsClaudeAuthError(errMessage)) {
          if (authMethod === 'cli') {
            errorMessage =
              "CLI authentication failed. Please run 'claude login' in your terminal to authenticate.";
          } else {
            errorMessage = 'API key is invalid or has been revoked.';
          }
        } else if (errMessage.includes('abort') || errMessage.includes('timeout')) {
          errorMessage = 'Verification timed out. Please try again.';
        } else if (errMessage.includes('exit') && errMessage.includes('code 1')) {
          if (receivedAnyContent && !errorMessage) {
            authenticated = true;
            logger.info('[Setup] Process exit 1 but content received - auth valid');
          } else if (!errorMessage) {
            errorMessage = errMessage;
          }
        } else if (!errorMessage) {
          errorMessage = errMessage;
        }
      } finally {
        clearTimeout(timeoutId);
        AuthSessionManager.destroySession(sessionId);
      }

      logger.info('[Setup] Verification result:', {
        authenticated,
        errorMessage,
        authMethod,
      });

      res.json({
        success: true,
        authenticated,
        error: errorMessage || undefined,
      });
    } catch (error) {
      logger.error('[Setup] Verify Claude auth endpoint error:', error);
      res.status(500).json({
        success: false,
        authenticated: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      });
    }
  };
}

function createVerifyCodexAuthHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    const { authMethod, apiKey } = req.body as {
      authMethod?: 'cli' | 'api_key';
      apiKey?: string;
    };

    const sessionId = `codex-auth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!codexRateLimiter.canAttempt(clientIp)) {
      const resetTime = codexRateLimiter.getResetTime(clientIp);
      res.status(429).json({
        success: false,
        authenticated: false,
        error: 'Too many authentication attempts. Please try again later.',
        resetTime,
      });
      return;
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), CODEX_AUTH_TIMEOUT_MS);

    try {
      const authEnv = createSecureAuthEnv(authMethod || 'api_key', apiKey, 'openai');

      if (authMethod === 'api_key') {
        if (apiKey) {
          const validation = validateApiKey(apiKey, 'openai');
          if (!validation.isValid) {
            res.json({ success: true, authenticated: false, error: validation.error });
            return;
          }
          authEnv[OPENAI_API_KEY_ENV] = validation.normalizedKey;
        } else {
          const storedApiKey = getApiKey('openai');
          if (storedApiKey) {
            const validation = validateApiKey(storedApiKey, 'openai');
            if (!validation.isValid) {
              res.json({ success: true, authenticated: false, error: validation.error });
              return;
            }
            authEnv[OPENAI_API_KEY_ENV] = validation.normalizedKey;
          } else if (!authEnv[OPENAI_API_KEY_ENV]) {
            res.json({ success: true, authenticated: false, error: CODEX_ERROR_API_KEY_REQUIRED });
            return;
          }
        }
      }

      AuthSessionManager.createSession(sessionId, authMethod || 'api_key', undefined, 'openai');
      const cleanupEnv = createTempEnvOverride(authEnv);

      try {
        if (authMethod === 'cli') {
          const authIndicators = await getCodexAuthIndicators();
          if (!authIndicators.hasOAuthToken && !authIndicators.hasApiKey) {
            res.json({
              success: true,
              authenticated: false,
              error: CODEX_ERROR_CLI_AUTH_REQUIRED,
            });
            return;
          }
        }

        const provider = ProviderFactory.getProviderByName('codex');
        if (!provider) {
          throw new Error('Codex provider not available');
        }
        const stream = provider.executeQuery({
          prompt: CODEX_AUTH_PROMPT,
          model: CODEX_MODEL_MAP.gpt52Codex,
          cwd: process.cwd(),
          maxTurns: 1,
          allowedTools: [],
          abortController,
        });

        let receivedAnyContent = false;
        let errorMessage = '';

        for await (const msg of stream) {
          if (msg.type === 'error' && msg.error) {
            if (isCodexBillingError(msg.error)) {
              errorMessage = CODEX_ERROR_BILLING_MESSAGE;
            } else if (isCodexRateLimitError(msg.error)) {
              errorMessage = CODEX_ERROR_RATE_LIMIT_MESSAGE;
            } else {
              errorMessage = msg.error;
            }
            break;
          }

          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'text' && block.text) {
                receivedAnyContent = true;
                if (isCodexBillingError(block.text)) {
                  errorMessage = CODEX_ERROR_BILLING_MESSAGE;
                  break;
                }
                if (isCodexRateLimitError(block.text)) {
                  errorMessage = CODEX_ERROR_RATE_LIMIT_MESSAGE;
                  break;
                }
                if (containsCodexAuthError(block.text)) {
                  errorMessage = block.text;
                  break;
                }
              }
            }
          }

          if (msg.type === 'result' && msg.result) {
            receivedAnyContent = true;
            if (isCodexBillingError(msg.result)) {
              errorMessage = CODEX_ERROR_BILLING_MESSAGE;
            } else if (isCodexRateLimitError(msg.result)) {
              errorMessage = CODEX_ERROR_RATE_LIMIT_MESSAGE;
            } else if (containsCodexAuthError(msg.result)) {
              errorMessage = msg.result;
              break;
            }
          }
        }

        if (errorMessage) {
          const isUsageLimitError =
            errorMessage === CODEX_ERROR_BILLING_MESSAGE ||
            errorMessage === CODEX_ERROR_RATE_LIMIT_MESSAGE;

          const response: {
            success: boolean;
            authenticated: boolean;
            error: string;
            details?: string;
          } = {
            success: true,
            authenticated: isUsageLimitError ? true : false,
            error: isUsageLimitError
              ? errorMessage
              : authMethod === 'cli'
                ? CODEX_ERROR_CLI_AUTH_REQUIRED
                : 'API key is invalid or has been revoked.',
          };

          if (!isUsageLimitError && errorMessage !== response.error) {
            response.details = errorMessage;
          }

          res.json(response);
          return;
        }

        if (!receivedAnyContent) {
          res.json({
            success: true,
            authenticated: false,
            error: 'No response received from Codex. Please check your authentication.',
          });
          return;
        }

        res.json({ success: true, authenticated: true });
      } finally {
        cleanupEnv();
      }
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : String(error);
      logger.error('[Setup] Codex auth verification error:', errMessage);
      const normalizedError = isCodexBillingError(errMessage)
        ? CODEX_ERROR_BILLING_MESSAGE
        : isCodexRateLimitError(errMessage)
          ? CODEX_ERROR_RATE_LIMIT_MESSAGE
          : errMessage;
      res.json({
        success: true,
        authenticated: false,
        error: normalizedError,
      });
    } finally {
      clearTimeout(timeoutId);
      AuthSessionManager.destroySession(sessionId);
    }
  };
}

function createGhStatusHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const status = await getGhStatus();
      res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      logError(error, 'Get GitHub CLI status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createCursorStatusHandler() {
  const installCommand = 'curl https://cursor.com/install -fsS | bash';
  const loginCommand = 'cursor-agent login';

  return async (_req: Request, res: Response): Promise<void> => {
    try {
      if (isCursorDisconnectedFromApp()) {
        const provider = new CursorProvider();
        const [installed, version] = await Promise.all([
          provider.isInstalled(),
          provider.getVersion(),
        ]);
        const cliPath = installed ? provider.getCliPath() : null;

        res.json({
          success: true,
          installed,
          version: version || null,
          path: cliPath,
          auth: {
            authenticated: false,
            method: 'none',
          },
          installCommand,
          loginCommand,
        });
        return;
      }

      const provider = new CursorProvider();

      const [installed, version, auth] = await Promise.all([
        provider.isInstalled(),
        provider.getVersion(),
        provider.checkAuth(),
      ]);

      const cliPath = installed ? provider.getCliPath() : null;

      res.json({
        success: true,
        installed,
        version: version || null,
        path: cliPath,
        auth: {
          authenticated: auth.authenticated,
          method: auth.method,
        },
        installCommand,
        loginCommand,
      });
    } catch (error) {
      logError(error, 'Get Cursor status failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

function createCodexStatusHandler() {
  const installCommand = 'npm install -g @openai/codex';
  const loginCommand = 'codex login';

  return async (_req: Request, res: Response): Promise<void> => {
    try {
      if (isCodexDisconnectedFromApp()) {
        res.json({
          success: true,
          installed: true,
          version: null,
          path: null,
          auth: {
            authenticated: false,
            method: 'none',
            hasApiKey: false,
          },
          installCommand,
          loginCommand,
        });
        return;
      }

      const provider = new CodexProvider();
      const status = await provider.detectInstallation();

      let authMethod = 'none';
      if (status.authenticated) {
        authMethod = status.hasApiKey ? 'api_key_env' : 'cli_authenticated';
      }

      res.json({
        success: true,
        installed: status.installed,
        version: status.version || null,
        path: status.path || null,
        auth: {
          authenticated: status.authenticated || false,
          method: authMethod,
          hasApiKey: status.hasApiKey || false,
        },
        installCommand,
        loginCommand,
      });
    } catch (error) {
      logError(error, 'Get Codex status failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

function createInstallCodexHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const installCommand = 'npm install -g @openai/codex';

      res.json({
        success: true,
        message: `Please install Codex CLI manually by running: ${installCommand}`,
        requiresManualInstall: true,
        installCommand,
      });
    } catch (error) {
      logError(error, 'Install Codex failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

function createAuthCodexHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const markerPath = path.join(process.cwd(), '.dmaker', '.codex-disconnected');
      if (fs.existsSync(markerPath)) {
        fs.unlinkSync(markerPath);
      }

      const { getCodexAuthIndicators: getIndicators } = await import('@dmaker/platform');
      const indicators = await getIndicators();

      const isAlreadyAuthenticated =
        indicators.hasApiKey || indicators.hasAuthFile || indicators.hasOAuthToken;

      if (isAlreadyAuthenticated) {
        res.json({
          success: true,
          message: 'Codex CLI is now linked with the app',
          wasAlreadyAuthenticated: true,
        });
      } else {
        res.json({
          success: true,
          message:
            'Codex CLI is now linked with the app. If prompted, please authenticate with "codex login" in your terminal.',
          requiresManualAuth: true,
        });
      }
    } catch (error) {
      logError(error, 'Auth Codex failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: 'Failed to link Codex CLI with the app',
      });
    }
  };
}

function createAuthCursorHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const markerPath = path.join(process.cwd(), '.dmaker', '.cursor-disconnected');
      if (fs.existsSync(markerPath)) {
        fs.unlinkSync(markerPath);
      }

      const isAlreadyAuthenticated = (): boolean => {
        if (process.env.CURSOR_API_KEY) {
          return true;
        }

        const credentialPaths = [
          path.join(os.homedir(), '.cursor', 'credentials.json'),
          path.join(os.homedir(), '.config', 'cursor', 'credentials.json'),
        ];

        for (const credPath of credentialPaths) {
          if (fs.existsSync(credPath)) {
            try {
              const content = fs.readFileSync(credPath, 'utf8');
              const creds = JSON.parse(content);
              if (creds.accessToken || creds.token) {
                return true;
              }
            } catch {
              // Invalid credentials file, continue checking
            }
          }
        }

        return false;
      };

      if (isAlreadyAuthenticated()) {
        res.json({
          success: true,
          message: 'Cursor CLI is now linked with the app',
          wasAlreadyAuthenticated: true,
        });
      } else {
        res.json({
          success: true,
          message:
            'Cursor CLI is now linked with the app. If prompted, please authenticate with "cursor auth" in your terminal.',
          requiresManualAuth: true,
        });
      }
    } catch (error) {
      logError(error, 'Auth Cursor failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: 'Failed to link Cursor CLI with the app',
      });
    }
  };
}

function createDeauthCodexHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const dmakerDir = path.join(process.cwd(), '.dmaker');
      const markerPath = path.join(dmakerDir, '.codex-disconnected');

      if (!fs.existsSync(dmakerDir)) {
        fs.mkdirSync(dmakerDir, { recursive: true });
      }

      fs.writeFileSync(
        markerPath,
        JSON.stringify({
          disconnectedAt: new Date().toISOString(),
          message: 'Codex CLI is disconnected from the app',
        })
      );

      res.json({
        success: true,
        message: 'Codex CLI is now disconnected from the app',
      });
    } catch (error) {
      logError(error, 'Deauth Codex failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: 'Failed to disconnect Codex CLI from the app',
      });
    }
  };
}

function createDeauthCursorHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const dmakerDir = path.join(process.cwd(), '.dmaker');
      const markerPath = path.join(dmakerDir, '.cursor-disconnected');

      if (!fs.existsSync(dmakerDir)) {
        fs.mkdirSync(dmakerDir, { recursive: true });
      }

      fs.writeFileSync(
        markerPath,
        JSON.stringify({
          disconnectedAt: new Date().toISOString(),
          message: 'Cursor CLI is disconnected from the app',
        })
      );

      res.json({
        success: true,
        message: 'Cursor CLI is now disconnected from the app',
      });
    } catch (error) {
      logError(error, 'Deauth Cursor failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: 'Failed to disconnect Cursor CLI from the app',
      });
    }
  };
}

function createAuthOpencodeHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const markerPath = path.join(process.cwd(), '.dmaker', '.opencode-disconnected');
      if (fs.existsSync(markerPath)) {
        fs.unlinkSync(markerPath);
      }

      const hasApiKey = !!process.env.OPENCODE_API_KEY;

      if (hasApiKey) {
        res.json({
          success: true,
          message: 'OpenCode CLI is now linked with the app',
          wasAlreadyAuthenticated: true,
        });
      } else {
        res.json({
          success: true,
          message:
            'OpenCode CLI is now linked with the app. If prompted, please authenticate with OpenCode.',
          requiresManualAuth: true,
        });
      }
    } catch (error) {
      logError(error, 'Auth OpenCode failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: 'Failed to link OpenCode CLI with the app',
      });
    }
  };
}

function createDeauthOpencodeHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const dmakerDir = path.join(process.cwd(), '.dmaker');
      const markerPath = path.join(dmakerDir, '.opencode-disconnected');

      if (!fs.existsSync(dmakerDir)) {
        fs.mkdirSync(dmakerDir, { recursive: true });
      }

      fs.writeFileSync(
        markerPath,
        JSON.stringify({
          disconnectedAt: new Date().toISOString(),
          message: 'OpenCode CLI is disconnected from the app',
        })
      );

      res.json({
        success: true,
        message: 'OpenCode CLI is now disconnected from the app',
      });
    } catch (error) {
      logError(error, 'Deauth OpenCode failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: 'Failed to disconnect OpenCode CLI from the app',
      });
    }
  };
}

function createAuthGcpHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const markerPath = path.join(process.cwd(), '.dmaker', '.gcp-disconnected');
      if (fs.existsSync(markerPath)) {
        fs.unlinkSync(markerPath);
      }

      const hasCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const hasProject = !!process.env.GOOGLE_CLOUD_PROJECT;

      if (hasCredentials || hasProject) {
        res.json({
          success: true,
          message: 'GCP Vertex AI is now linked with the app',
          wasAlreadyAuthenticated: true,
        });
      } else {
        res.json({
          success: true,
          message:
            'GCP Vertex AI is now linked with the app. Please set GOOGLE_APPLICATION_CREDENTIALS or run `gcloud auth application-default login`.',
          requiresManualAuth: true,
        });
      }
    } catch (error) {
      logError(error, 'Auth GCP failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: 'Failed to link GCP Vertex AI with the app',
      });
    }
  };
}

function createDeauthGcpHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const dmakerDir = path.join(process.cwd(), '.dmaker');
      const markerPath = path.join(dmakerDir, '.gcp-disconnected');

      if (!fs.existsSync(dmakerDir)) {
        fs.mkdirSync(dmakerDir, { recursive: true });
      }

      fs.writeFileSync(
        markerPath,
        JSON.stringify({
          disconnectedAt: new Date().toISOString(),
          message: 'GCP Vertex AI is disconnected from the app',
        })
      );

      res.json({
        success: true,
        message: 'GCP Vertex AI is now disconnected from the app',
      });
    } catch (error) {
      logError(error, 'Deauth GCP failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: 'Failed to disconnect GCP Vertex AI from the app',
      });
    }
  };
}

function createOpencodeStatusHandler() {
  const installCommand = 'curl -fsSL https://opencode.ai/install | bash';
  const loginCommand = 'opencode auth login';

  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const provider = new OpencodeProvider();
      const status = await provider.detectInstallation();

      let authMethod = 'none';
      if (status.authenticated) {
        authMethod = status.hasApiKey ? 'api_key_env' : 'cli_authenticated';
      }

      res.json({
        success: true,
        installed: status.installed,
        version: status.version || null,
        path: status.path || null,
        auth: {
          authenticated: status.authenticated || false,
          method: authMethod,
          hasApiKey: status.hasApiKey || false,
          hasEnvApiKey: !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY,
          hasOAuthToken: status.hasOAuthToken || false,
        },
        recommendation: status.installed
          ? undefined
          : 'Install OpenCode CLI to use multi-provider AI models.',
        installCommand,
        loginCommand,
        installCommands: {
          macos: installCommand,
          linux: installCommand,
          npm: 'npm install -g opencode-ai',
        },
      });
    } catch (error) {
      logError(error, 'Get OpenCode status failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

function createGetOpencodeModelsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const provider = getOpencodeProvider();
      const forceRefresh = req.query.refresh === 'true';

      let models: ModelDefinition[];
      let cached = true;

      if (forceRefresh) {
        models = await provider.refreshModels();
        cached = false;
      } else {
        const cachedModels = provider.getAvailableModels();

        if (!provider.hasCachedModels()) {
          models = await provider.refreshModels();
          cached = false;
        } else {
          models = cachedModels;
        }
      }

      const response: ModelsResponse = {
        success: true,
        models,
        count: models.length,
        cached,
      };

      res.json(response);
    } catch (error) {
      logError(error, 'Get OpenCode models failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      } as ModelsResponse);
    }
  };
}

function createRefreshOpencodeModelsHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const provider = getOpencodeProvider();
      const models = await provider.refreshModels();

      const response: ModelsResponse = {
        success: true,
        models,
        count: models.length,
        cached: false,
      };

      res.json(response);
    } catch (error) {
      logError(error, 'Refresh OpenCode models failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      } as ModelsResponse);
    }
  };
}

function createGetOpencodeProvidersHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const provider = getOpencodeProvider();
      const providers = await provider.fetchAuthenticatedProviders();

      const authenticated = providers.filter((p) => p.authenticated);

      const response: ProvidersResponse = {
        success: true,
        providers,
        authenticated,
      };

      res.json(response);
    } catch (error) {
      logError(error, 'Get OpenCode providers failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      } as ProvidersResponse);
    }
  };
}

function createClearOpencodeCacheHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const provider = getOpencodeProvider();
      provider.clearModelCache();

      res.json({
        success: true,
        message: 'OpenCode model cache cleared',
      });
    } catch (error) {
      logError(error, 'Clear OpenCode cache failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

function createGetCursorConfigHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = req.query.projectPath as string;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath query parameter is required',
        });
        return;
      }

      validateProjectPath(projectPath);

      const configManager = new CursorConfigManager(projectPath);

      res.json({
        success: true,
        config: configManager.getConfig(),
        availableModels: Object.values(CURSOR_MODEL_MAP),
      });
    } catch (error) {
      logError(error, 'Get Cursor config failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

function createSetCursorDefaultModelHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { model, projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      validateProjectPath(projectPath);

      if (!model || !(model in CURSOR_MODEL_MAP)) {
        res.status(400).json({
          success: false,
          error: `Invalid model ID. Valid models: ${Object.keys(CURSOR_MODEL_MAP).join(', ')}`,
        });
        return;
      }

      const configManager = new CursorConfigManager(projectPath);
      configManager.setDefaultModel(model as CursorModelId);

      res.json({ success: true, model });
    } catch (error) {
      logError(error, 'Set Cursor default model failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

function createSetCursorModelsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { models, projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      validateProjectPath(projectPath);

      if (!Array.isArray(models)) {
        res.status(400).json({
          success: false,
          error: 'Models must be an array',
        });
        return;
      }

      const validModels = models.filter((m): m is CursorModelId => m in CURSOR_MODEL_MAP);

      if (validModels.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No valid models provided',
        });
        return;
      }

      const configManager = new CursorConfigManager(projectPath);
      configManager.setEnabledModels(validModels);

      res.json({ success: true, models: validModels });
    } catch (error) {
      logError(error, 'Set Cursor models failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

function createGetCursorPermissionsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = req.query.projectPath as string | undefined;

      if (projectPath) {
        validateProjectPath(projectPath);
      }

      const globalConfig = await readGlobalConfig();
      const projectConfig = projectPath ? await readProjectConfig(projectPath) : null;
      const effectivePermissions = await getEffectivePermissions(projectPath);
      const activeProfile = detectProfile(effectivePermissions);
      const hasProject = projectPath ? await hasProjectConfig(projectPath) : false;

      res.json({
        success: true,
        globalPermissions: globalConfig?.permissions || null,
        projectPermissions: projectConfig?.permissions || null,
        effectivePermissions,
        activeProfile,
        hasProjectConfig: hasProject,
        availableProfiles: getAvailableProfiles(),
      });
    } catch (error) {
      logError(error, 'Get Cursor permissions failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

function createApplyPermissionProfileHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { profileId, projectPath, scope } = req.body as {
        profileId: CursorPermissionProfile;
        projectPath?: string;
        scope: 'global' | 'project';
      };

      const validProfiles = CURSOR_PERMISSION_PROFILES.map((p) => p.id);
      if (!validProfiles.includes(profileId)) {
        res.status(400).json({
          success: false,
          error: `Invalid profile. Valid profiles: ${validProfiles.join(', ')}`,
        });
        return;
      }

      if (scope === 'project') {
        if (!projectPath) {
          res.status(400).json({
            success: false,
            error: 'projectPath is required for project scope',
          });
          return;
        }
        validateProjectPath(projectPath);
        await applyProfileToProject(projectPath, profileId);
      } else {
        await applyProfileGlobally(profileId);
      }

      res.json({
        success: true,
        message: `Applied "${profileId}" profile to ${scope}`,
        scope,
        profileId,
      });
    } catch (error) {
      logError(error, 'Apply Cursor permission profile failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

function createSetCustomPermissionsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, permissions } = req.body as {
        projectPath: string;
        permissions: CursorCliPermissions;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      validateProjectPath(projectPath);

      if (!permissions || !Array.isArray(permissions.allow) || !Array.isArray(permissions.deny)) {
        res.status(400).json({
          success: false,
          error: 'permissions must have allow and deny arrays',
        });
        return;
      }

      await writeProjectConfig(projectPath, {
        version: 1,
        permissions,
      });

      res.json({
        success: true,
        message: 'Custom permissions saved',
        permissions,
      });
    } catch (error) {
      logError(error, 'Set custom Cursor permissions failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

function createDeleteProjectPermissionsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = req.query.projectPath as string;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath query parameter is required',
        });
        return;
      }

      validateProjectPath(projectPath);

      await deleteProjectConfig(projectPath);

      res.json({
        success: true,
        message: 'Project permissions deleted, using global config',
      });
    } catch (error) {
      logError(error, 'Delete Cursor project permissions failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

function createGetExampleConfigHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const profileId = (req.query.profileId as CursorPermissionProfile) || 'development';

      const exampleConfig = generateExampleConfig(profileId);

      res.json({
        success: true,
        profileId,
        config: exampleConfig,
      });
    } catch (error) {
      logError(error, 'Get example Cursor config failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

// ============================================================================
// Router Factory
// ============================================================================

export function createSetupRoutes(): Router {
  const router = Router();

  router.get('/claude-status', createClaudeStatusHandler());
  router.post('/install-claude', createInstallClaudeHandler());
  router.post('/auth-claude', createAuthClaudeHandler());
  router.post('/deauth-claude', createDeauthClaudeHandler());
  router.post('/store-api-key', createStoreApiKeyHandler());
  router.post('/delete-api-key', createDeleteApiKeyHandler());
  router.get('/api-keys', createApiKeysHandler());
  router.get('/platform', createPlatformHandler());
  router.post('/verify-claude-auth', createVerifyClaudeAuthHandler());
  router.post('/verify-codex-auth', createVerifyCodexAuthHandler());
  router.get('/gh-status', createGhStatusHandler());

  // Cursor CLI routes
  router.get('/cursor-status', createCursorStatusHandler());
  router.post('/auth-cursor', createAuthCursorHandler());
  router.post('/deauth-cursor', createDeauthCursorHandler());

  // Codex CLI routes
  router.get('/codex-status', createCodexStatusHandler());
  router.post('/install-codex', createInstallCodexHandler());
  router.post('/auth-codex', createAuthCodexHandler());
  router.post('/deauth-codex', createDeauthCodexHandler());

  // OpenCode CLI routes
  router.get('/opencode-status', createOpencodeStatusHandler());
  router.post('/auth-opencode', createAuthOpencodeHandler());
  router.post('/deauth-opencode', createDeauthOpencodeHandler());

  // GCP/Vertex AI routes
  router.post('/auth-gcp', createAuthGcpHandler());
  router.post('/deauth-gcp', createDeauthGcpHandler());

  // OpenCode Dynamic Model Discovery routes
  router.get('/opencode/models', createGetOpencodeModelsHandler());
  router.post('/opencode/models/refresh', createRefreshOpencodeModelsHandler());
  router.get('/opencode/providers', createGetOpencodeProvidersHandler());
  router.post('/opencode/cache/clear', createClearOpencodeCacheHandler());
  router.get('/cursor-config', createGetCursorConfigHandler());
  router.post('/cursor-config/default-model', createSetCursorDefaultModelHandler());
  router.post('/cursor-config/models', createSetCursorModelsHandler());

  // Cursor CLI Permissions routes
  router.get('/cursor-permissions', createGetCursorPermissionsHandler());
  router.post('/cursor-permissions/profile', createApplyPermissionProfileHandler());
  router.post('/cursor-permissions/custom', createSetCustomPermissionsHandler());
  router.delete('/cursor-permissions', createDeleteProjectPermissionsHandler());
  router.get('/cursor-permissions/example', createGetExampleConfigHandler());

  return router;
}
