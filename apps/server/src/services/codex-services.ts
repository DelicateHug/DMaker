/**
 * Codex Services - App server communication, model caching, and usage tracking
 *
 * Consolidated from codex-app-server-service.ts, codex-model-cache-service.ts,
 * and codex-usage-service.ts.
 */

import { spawn, type ChildProcess } from 'child_process';
import readline from 'readline';
import path from 'path';
import {
  findCodexCliPath,
  getCodexAuthPath,
  systemPathExists,
  systemPathReadFile,
  secureFs,
} from '@dmaker/platform';
import { createLogger } from '@dmaker/utils';
import type {
  AppServerModelResponse,
  AppServerAccountResponse,
  AppServerRateLimitsResponse,
  AppServerModel,
  JsonRpcRequest,
} from '@dmaker/types';

// ============================================================================
// CodexAppServerService (from codex-app-server-service.ts)
// ============================================================================

const appServerLogger = createLogger('CodexAppServer');

/**
 * CodexAppServerService
 *
 * Centralized service for communicating with Codex CLI's app-server via JSON-RPC protocol.
 * Handles process spawning, JSON-RPC messaging, and cleanup.
 *
 * Connection strategy: Spawn on-demand (new process for each method call)
 */
export class CodexAppServerService {
  private cachedCliPath: string | null = null;

  /**
   * Check if Codex CLI is available on the system
   */
  async isAvailable(): Promise<boolean> {
    this.cachedCliPath = await findCodexCliPath();
    return Boolean(this.cachedCliPath);
  }

  /**
   * Fetch available models from app-server
   */
  async getModels(): Promise<AppServerModelResponse | null> {
    const result = await this.executeJsonRpc<AppServerModelResponse>((sendRequest) => {
      return sendRequest('model/list', {});
    });

    if (result) {
      appServerLogger.info(`[getModels] \u2713 Fetched ${result.data.length} models`);
    }

    return result;
  }

  /**
   * Fetch account information from app-server
   */
  async getAccount(): Promise<AppServerAccountResponse | null> {
    return this.executeJsonRpc<AppServerAccountResponse>((sendRequest) => {
      return sendRequest('account/read', { refreshToken: false });
    });
  }

  /**
   * Fetch rate limits from app-server
   */
  async getRateLimits(): Promise<AppServerRateLimitsResponse | null> {
    return this.executeJsonRpc<AppServerRateLimitsResponse>((sendRequest) => {
      return sendRequest('account/rateLimits/read', {});
    });
  }

  /**
   * Execute JSON-RPC requests via Codex app-server
   *
   * This method:
   * 1. Spawns a new `codex app-server` process
   * 2. Handles JSON-RPC initialization handshake
   * 3. Executes user-provided requests
   * 4. Cleans up the process
   *
   * @param requestFn - Function that receives sendRequest helper and returns a promise
   * @returns Result of the JSON-RPC request or null on failure
   */
  private async executeJsonRpc<T>(
    requestFn: (sendRequest: <R>(method: string, params?: unknown) => Promise<R>) => Promise<T>
  ): Promise<T | null> {
    let childProcess: ChildProcess | null = null;

    try {
      const cliPath = this.cachedCliPath || (await findCodexCliPath());

      if (!cliPath) {
        return null;
      }

      // On Windows, .cmd files must be run through shell
      const needsShell = process.platform === 'win32' && cliPath.toLowerCase().endsWith('.cmd');

      childProcess = spawn(cliPath, ['app-server'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TERM: 'dumb',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: needsShell,
      });

      if (!childProcess.stdin || !childProcess.stdout) {
        throw new Error('Failed to create stdio pipes');
      }

      // Setup readline for reading JSONL responses
      const rl = readline.createInterface({
        input: childProcess.stdout,
        crlfDelay: Infinity,
      });

      // Message ID counter for JSON-RPC
      let messageId = 0;
      const pendingRequests = new Map<
        number,
        {
          resolve: (value: unknown) => void;
          reject: (error: Error) => void;
          timeout: NodeJS.Timeout;
        }
      >();

      // Process incoming messages
      rl.on('line', (line) => {
        if (!line.trim()) return;

        try {
          const message = JSON.parse(line);

          // Handle response to our request
          if ('id' in message && message.id !== undefined) {
            const pending = pendingRequests.get(message.id);
            if (pending) {
              clearTimeout(pending.timeout);
              pendingRequests.delete(message.id);
              if (message.error) {
                pending.reject(new Error(message.error.message || 'Unknown error'));
              } else {
                pending.resolve(message.result);
              }
            }
          }
          // Ignore notifications (no id field)
        } catch {
          // Ignore parse errors for non-JSON lines
        }
      });

      // Helper to send JSON-RPC request and wait for response
      const sendRequest = <R>(method: string, params?: unknown): Promise<R> => {
        return new Promise((resolve, reject) => {
          const id = ++messageId;
          const request: JsonRpcRequest = {
            method,
            id,
            params: params ?? {},
          };

          // Set timeout for request (10 seconds)
          const timeout = setTimeout(() => {
            pendingRequests.delete(id);
            reject(new Error(`Request timeout: ${method}`));
          }, 10000);

          pendingRequests.set(id, {
            resolve: resolve as (value: unknown) => void,
            reject,
            timeout,
          });

          childProcess!.stdin!.write(JSON.stringify(request) + '\n');
        });
      };

      // Helper to send notification (no response expected)
      const sendNotification = (method: string, params?: unknown): void => {
        const notification = params ? { method, params } : { method };
        childProcess!.stdin!.write(JSON.stringify(notification) + '\n');
      };

      // 1. Initialize the app-server
      await sendRequest('initialize', {
        clientInfo: {
          name: 'dmaker',
          title: 'DMaker',
          version: '1.0.0',
        },
      });

      // 2. Send initialized notification
      sendNotification('initialized');

      // 3. Execute user-provided requests
      const result = await requestFn(sendRequest);

      // Clean up
      rl.close();
      childProcess.kill('SIGTERM');

      return result;
    } catch (error) {
      appServerLogger.error('[executeJsonRpc] Failed:', error);
      return null;
    } finally {
      // Ensure process is killed
      if (childProcess && !childProcess.killed) {
        childProcess.kill('SIGTERM');
      }
    }
  }
}

// ============================================================================
// CodexModelCacheService (from codex-model-cache-service.ts)
// ============================================================================

const modelCacheLogger = createLogger('CodexModelCache');

/**
 * Codex model with UI-compatible format
 */
export interface CodexModel {
  id: string;
  label: string;
  description: string;
  hasThinking: boolean;
  supportsVision: boolean;
  tier: 'premium' | 'standard' | 'basic';
  isDefault: boolean;
}

/**
 * Cache structure stored on disk
 */
interface CodexModelCache {
  models: CodexModel[];
  cachedAt: number;
  ttl: number;
}

/**
 * CodexModelCacheService
 *
 * Caches Codex models fetched from app-server with TTL-based invalidation and disk persistence.
 *
 * Features:
 * - 1-hour TTL (configurable)
 * - Atomic file writes (temp file + rename)
 * - Thread-safe (deduplicates concurrent refresh requests)
 * - Auto-bootstrap on service creation
 * - Graceful fallback (returns empty array on errors)
 */
export class CodexModelCacheService {
  private cacheFilePath: string;
  private ttl: number;
  private appServerService: CodexAppServerService;
  private inFlightRefresh: Promise<CodexModel[]> | null = null;

  constructor(
    dataDir: string,
    appServerService: CodexAppServerService,
    ttl: number = 3600000 // 1 hour default
  ) {
    this.cacheFilePath = path.join(dataDir, 'codex-models-cache.json');
    this.ttl = ttl;
    this.appServerService = appServerService;
  }

  /**
   * Get models from cache or fetch if stale
   *
   * @param forceRefresh - If true, bypass cache and fetch fresh data
   * @returns Array of Codex models (empty array if unavailable)
   */
  async getModels(forceRefresh = false): Promise<CodexModel[]> {
    // If force refresh, skip cache
    if (forceRefresh) {
      return this.refreshModels();
    }

    // Try to load from cache
    const cached = await this.loadFromCache();
    if (cached) {
      const age = Date.now() - cached.cachedAt;
      const isStale = age > cached.ttl;

      if (!isStale) {
        modelCacheLogger.info(
          `[getModels] \u2713 Using cached models (${cached.models.length} models, age: ${Math.round(age / 60000)}min)`
        );
        return cached.models;
      }
    }

    // Cache is stale or missing, refresh
    return this.refreshModels();
  }

  /**
   * Get models with cache metadata
   *
   * @param forceRefresh - If true, bypass cache and fetch fresh data
   * @returns Object containing models and cache timestamp
   */
  async getModelsWithMetadata(
    forceRefresh = false
  ): Promise<{ models: CodexModel[]; cachedAt: number }> {
    const models = await this.getModels(forceRefresh);

    // Try to get the actual cache timestamp
    const cached = await this.loadFromCache();
    const cachedAt = cached?.cachedAt ?? Date.now();

    return { models, cachedAt };
  }

  /**
   * Refresh models from app-server and update cache
   *
   * Thread-safe: Deduplicates concurrent refresh requests
   */
  async refreshModels(): Promise<CodexModel[]> {
    // Deduplicate concurrent refresh requests
    if (this.inFlightRefresh) {
      return this.inFlightRefresh;
    }

    // Start new refresh
    this.inFlightRefresh = this.doRefresh();

    try {
      const models = await this.inFlightRefresh;
      return models;
    } finally {
      this.inFlightRefresh = null;
    }
  }

  /**
   * Clear the cache file
   */
  async clearCache(): Promise<void> {
    modelCacheLogger.info('[clearCache] Clearing cache...');

    try {
      await secureFs.unlink(this.cacheFilePath);
      modelCacheLogger.info('[clearCache] Cache cleared');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        modelCacheLogger.error('[clearCache] Failed to clear cache:', error);
      }
    }
  }

  /**
   * Internal method to perform the actual refresh
   */
  private async doRefresh(): Promise<CodexModel[]> {
    try {
      // Check if app-server is available
      const isAvailable = await this.appServerService.isAvailable();
      if (!isAvailable) {
        return [];
      }

      // Fetch models from app-server
      const response = await this.appServerService.getModels();
      if (!response || !response.data) {
        return [];
      }

      // Transform models to UI format
      const models = response.data.map((model) => this.transformModel(model));

      // Save to cache
      await this.saveToCache(models);

      modelCacheLogger.info(
        `[refreshModels] \u2713 Fetched fresh models (${models.length} models)`
      );

      return models;
    } catch (error) {
      modelCacheLogger.error('[doRefresh] Refresh failed:', error);
      return [];
    }
  }

  /**
   * Transform app-server model to UI-compatible format
   */
  private transformModel(appServerModel: AppServerModel): CodexModel {
    return {
      id: `codex-${appServerModel.id}`, // Add 'codex-' prefix for compatibility
      label: appServerModel.displayName,
      description: appServerModel.description,
      hasThinking: appServerModel.supportedReasoningEfforts.length > 0,
      supportsVision: true, // All Codex models support vision
      tier: this.inferTier(appServerModel.id),
      isDefault: appServerModel.isDefault,
    };
  }

  /**
   * Infer tier from model ID
   */
  private inferTier(modelId: string): 'premium' | 'standard' | 'basic' {
    if (modelId.includes('max') || modelId.includes('gpt-5.2-codex')) {
      return 'premium';
    }
    if (modelId.includes('mini')) {
      return 'basic';
    }
    return 'standard';
  }

  /**
   * Load cache from disk
   */
  private async loadFromCache(): Promise<CodexModelCache | null> {
    try {
      const content = await secureFs.readFile(this.cacheFilePath, 'utf-8');
      const cache = JSON.parse(content.toString()) as CodexModelCache;

      // Validate cache structure
      if (!Array.isArray(cache.models) || typeof cache.cachedAt !== 'number') {
        modelCacheLogger.warn('[loadFromCache] Invalid cache structure, ignoring');
        return null;
      }

      return cache;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        modelCacheLogger.warn('[loadFromCache] Failed to read cache:', error);
      }
      return null;
    }
  }

  /**
   * Save cache to disk (atomic write)
   */
  private async saveToCache(models: CodexModel[]): Promise<void> {
    const cache: CodexModelCache = {
      models,
      cachedAt: Date.now(),
      ttl: this.ttl,
    };

    const tempPath = `${this.cacheFilePath}.tmp.${Date.now()}`;

    try {
      // Write to temp file
      const content = JSON.stringify(cache, null, 2);
      await secureFs.writeFile(tempPath, content, 'utf-8');

      // Atomic rename
      await secureFs.rename(tempPath, this.cacheFilePath);
    } catch (error) {
      modelCacheLogger.error('[saveToCache] Failed to save cache:', error);

      // Clean up temp file
      try {
        await secureFs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

// ============================================================================
// CodexUsageService (from codex-usage-service.ts)
// ============================================================================

const usageLogger = createLogger('CodexUsage');

export interface CodexRateLimitWindow {
  limit: number;
  used: number;
  remaining: number;
  usedPercent: number;
  windowDurationMins: number;
  resetsAt: number;
}

export type CodexPlanType = 'free' | 'plus' | 'pro' | 'team' | 'enterprise' | 'edu' | 'unknown';

export interface CodexUsageData {
  rateLimits: {
    primary?: CodexRateLimitWindow;
    secondary?: CodexRateLimitWindow;
    planType?: CodexPlanType;
  } | null;
  lastUpdated: string;
}

/**
 * Codex Usage Service
 *
 * Fetches usage data from Codex CLI using the app-server JSON-RPC API.
 * Falls back to auth file parsing if app-server is unavailable.
 */
export class CodexUsageService {
  private cachedCliPath: string | null = null;
  private appServerService: CodexAppServerService | null = null;
  private accountPlanTypeArray: CodexPlanType[] = [
    'free',
    'plus',
    'pro',
    'team',
    'enterprise',
    'edu',
  ];

  constructor(appServerService?: CodexAppServerService) {
    this.appServerService = appServerService || null;
  }

  /**
   * Check if Codex CLI is available on the system
   */
  async isAvailable(): Promise<boolean> {
    this.cachedCliPath = await findCodexCliPath();
    return Boolean(this.cachedCliPath);
  }

  /**
   * Attempt to fetch usage data
   *
   * Priority order:
   * 1. Codex app-server JSON-RPC API (most reliable, provides real-time data)
   * 2. Auth file JWT parsing (fallback for plan type)
   */
  async fetchUsageData(): Promise<CodexUsageData> {
    usageLogger.info('[fetchUsageData] Starting...');
    const cliPath = this.cachedCliPath || (await findCodexCliPath());

    if (!cliPath) {
      usageLogger.error('[fetchUsageData] Codex CLI not found');
      throw new Error('Codex CLI not found. Please install it with: npm install -g @openai/codex');
    }

    usageLogger.info(`[fetchUsageData] Using CLI path: ${cliPath}`);

    // Try to get usage from Codex app-server (most reliable method)
    const appServerUsage = await this.fetchFromAppServer();
    if (appServerUsage) {
      usageLogger.info('[fetchUsageData] \u2713 Fetched usage from app-server');
      return appServerUsage;
    }

    usageLogger.info('[fetchUsageData] App-server failed, trying auth file fallback...');

    // Fallback: try to parse usage from auth file
    const authUsage = await this.fetchFromAuthFile();
    if (authUsage) {
      usageLogger.info('[fetchUsageData] \u2713 Fetched usage from auth file');
      return authUsage;
    }

    usageLogger.info('[fetchUsageData] All methods failed, returning unknown');

    // If all else fails, return unknown
    return {
      rateLimits: {
        planType: 'unknown',
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Fetch usage data from Codex app-server using JSON-RPC API
   * This is the most reliable method as it gets real-time data from OpenAI
   */
  private async fetchFromAppServer(): Promise<CodexUsageData | null> {
    try {
      // Use CodexAppServerService if available
      if (!this.appServerService) {
        return null;
      }

      // Fetch account and rate limits in parallel
      const [accountResult, rateLimitsResult] = await Promise.all([
        this.appServerService.getAccount(),
        this.appServerService.getRateLimits(),
      ]);

      if (!accountResult) {
        return null;
      }

      // Build response
      // Prefer planType from rateLimits (more accurate/current) over account (can be stale)
      let planType: CodexPlanType = 'unknown';

      // First try rate limits planType (most accurate)
      const rateLimitsPlanType = rateLimitsResult?.rateLimits?.planType;
      if (rateLimitsPlanType) {
        const normalizedType = rateLimitsPlanType.toLowerCase() as CodexPlanType;
        if (this.accountPlanTypeArray.includes(normalizedType)) {
          planType = normalizedType;
        }
      }

      // Fall back to account planType if rate limits didn't have it
      if (planType === 'unknown' && accountResult.account?.planType) {
        const normalizedType = accountResult.account.planType.toLowerCase() as CodexPlanType;
        if (this.accountPlanTypeArray.includes(normalizedType)) {
          planType = normalizedType;
        }
      }

      const result: CodexUsageData = {
        rateLimits: {
          planType,
        },
        lastUpdated: new Date().toISOString(),
      };

      // Add rate limit info if available
      if (rateLimitsResult?.rateLimits?.primary) {
        const primary = rateLimitsResult.rateLimits.primary;
        result.rateLimits!.primary = {
          limit: -1, // Not provided by API
          used: -1, // Not provided by API
          remaining: -1, // Not provided by API
          usedPercent: primary.usedPercent,
          windowDurationMins: primary.windowDurationMins,
          resetsAt: primary.resetsAt,
        };
      }

      // Add secondary rate limit if available
      if (rateLimitsResult?.rateLimits?.secondary) {
        const secondary = rateLimitsResult.rateLimits.secondary;
        result.rateLimits!.secondary = {
          limit: -1, // Not provided by API
          used: -1, // Not provided by API
          remaining: -1, // Not provided by API
          usedPercent: secondary.usedPercent,
          windowDurationMins: secondary.windowDurationMins,
          resetsAt: secondary.resetsAt,
        };
      }

      usageLogger.info(
        `[fetchFromAppServer] \u2713 Plan: ${planType}, Primary: ${result.rateLimits?.primary?.usedPercent || 'N/A'}%, Secondary: ${result.rateLimits?.secondary?.usedPercent || 'N/A'}%`
      );
      return result;
    } catch (error) {
      usageLogger.error('[fetchFromAppServer] Failed:', error);
      return null;
    }
  }

  /**
   * Extract plan type from auth file JWT token
   * Returns the actual plan type or 'unknown' if not available
   */
  private async getPlanTypeFromAuthFile(): Promise<CodexPlanType> {
    try {
      const authFilePath = getCodexAuthPath();
      usageLogger.info(`[getPlanTypeFromAuthFile] Auth file path: ${authFilePath}`);
      const exists = systemPathExists(authFilePath);

      if (!exists) {
        usageLogger.warn('[getPlanTypeFromAuthFile] Auth file does not exist');
        return 'unknown';
      }

      const authContent = await systemPathReadFile(authFilePath);
      const authData = JSON.parse(authContent);

      if (!authData.tokens?.id_token) {
        usageLogger.info('[getPlanTypeFromAuthFile] No id_token in auth file');
        return 'unknown';
      }

      const claims = this.parseJwt(authData.tokens.id_token);
      if (!claims) {
        usageLogger.info('[getPlanTypeFromAuthFile] Failed to parse JWT');
        return 'unknown';
      }

      usageLogger.info('[getPlanTypeFromAuthFile] JWT claims keys:', Object.keys(claims));

      // Extract plan type from nested OpenAI auth object with type validation
      const openaiAuthClaim = claims['https://api.openai.com/auth'];
      usageLogger.info(
        '[getPlanTypeFromAuthFile] OpenAI auth claim:',
        JSON.stringify(openaiAuthClaim, null, 2)
      );

      let accountType: string | undefined;
      let isSubscriptionExpired = false;

      if (
        openaiAuthClaim &&
        typeof openaiAuthClaim === 'object' &&
        !Array.isArray(openaiAuthClaim)
      ) {
        const openaiAuth = openaiAuthClaim as Record<string, unknown>;

        if (typeof openaiAuth.chatgpt_plan_type === 'string') {
          accountType = openaiAuth.chatgpt_plan_type;
        }

        // Check if subscription has expired
        if (typeof openaiAuth.chatgpt_subscription_active_until === 'string') {
          const expiryDate = new Date(openaiAuth.chatgpt_subscription_active_until);
          if (!isNaN(expiryDate.getTime())) {
            isSubscriptionExpired = expiryDate < new Date();
          }
        }
      } else {
        // Fallback: try top-level claim names
        const possibleClaimNames = [
          'https://chatgpt.com/account_type',
          'account_type',
          'plan',
          'plan_type',
        ];

        for (const claimName of possibleClaimNames) {
          const claimValue = claims[claimName];
          if (claimValue && typeof claimValue === 'string') {
            accountType = claimValue;
            break;
          }
        }
      }

      // If subscription is expired, treat as free plan
      if (isSubscriptionExpired && accountType && accountType !== 'free') {
        usageLogger.info(`Subscription expired, using "free" instead of "${accountType}"`);
        accountType = 'free';
      }

      if (accountType) {
        const normalizedType = accountType.toLowerCase() as CodexPlanType;
        usageLogger.info(
          `[getPlanTypeFromAuthFile] Account type: "${accountType}", normalized: "${normalizedType}"`
        );
        if (this.accountPlanTypeArray.includes(normalizedType)) {
          usageLogger.info(`[getPlanTypeFromAuthFile] Returning plan type: ${normalizedType}`);
          return normalizedType;
        }
      } else {
        usageLogger.info('[getPlanTypeFromAuthFile] No account type found in claims');
      }
    } catch (error) {
      usageLogger.error('[getPlanTypeFromAuthFile] Failed to get plan type from auth file:', error);
    }

    usageLogger.info('[getPlanTypeFromAuthFile] Returning unknown');
    return 'unknown';
  }

  /**
   * Try to extract usage info from the Codex auth file
   * Reuses getPlanTypeFromAuthFile to avoid code duplication
   */
  private async fetchFromAuthFile(): Promise<CodexUsageData | null> {
    usageLogger.info('[fetchFromAuthFile] Starting...');
    try {
      const planType = await this.getPlanTypeFromAuthFile();
      usageLogger.info(`[fetchFromAuthFile] Got plan type: ${planType}`);

      if (planType === 'unknown') {
        usageLogger.info('[fetchFromAuthFile] Plan type unknown, returning null');
        return null;
      }

      const result: CodexUsageData = {
        rateLimits: {
          planType,
        },
        lastUpdated: new Date().toISOString(),
      };

      usageLogger.info('[fetchFromAuthFile] Returning result:', JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      usageLogger.error('[fetchFromAuthFile] Failed to parse auth file:', error);
    }

    return null;
  }

  /**
   * Parse JWT token to extract claims
   */
  private parseJwt(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split('.');

      if (parts.length !== 3) {
        return null;
      }

      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

      // Use Buffer for Node.js environment
      const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');

      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  }
}
