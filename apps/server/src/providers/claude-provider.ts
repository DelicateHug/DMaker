/**
 * Claude Provider - Executes queries using Claude Agent SDK
 *
 * Wraps the @anthropic-ai/claude-agent-sdk for seamless integration
 * with the provider architecture.
 */

import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { BaseProvider } from './base-provider.js';
import { classifyError, getUserFriendlyErrorMessage, createLogger } from '@dmaker/utils';

const logger = createLogger('ClaudeProvider');
import { getThinkingTokenBudget, validateBareModelId } from '@dmaker/types';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from '@dmaker/types';

// Explicit allowlist of environment variables to pass to the SDK.
// Only these vars are passed - nothing else from process.env leaks through.
const ALLOWED_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'PATH',
  'HOME',
  'SHELL',
  'TERM',
  'USER',
  'LANG',
  'LC_ALL',
];

/**
 * Build environment for the SDK with only explicitly allowed variables
 */
function buildEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const key of ALLOWED_ENV_VARS) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }
  return env;
}

/**
 * Wrap prompt content in the `SDKUserMessage` envelope streaming-input mode
 * requires. `content` is a plain string or a block array; the SDK accepts both
 * as an Anthropic user-message body.
 */
function toUserMessage(content: unknown): {
  type: 'user';
  session_id: string;
  message: { role: 'user'; content: any };
  parent_tool_use_id: null;
} {
  return {
    type: 'user' as const,
    session_id: '',
    message: {
      role: 'user' as const,
      content: content as any,
    },
    parent_tool_use_id: null,
  };
}

export class ClaudeProvider extends BaseProvider {
  getName(): string {
    return 'claude';
  }

  /**
   * Execute a query using Claude Agent SDK
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    // Validate that model doesn't have a provider prefix
    // AgentService should strip prefixes before passing to providers
    validateBareModelId(options.model, 'ClaudeProvider');

    const {
      prompt,
      model,
      cwd,
      systemPrompt,
      maxTurns = 20,
      allowedTools,
      abortController,
      conversationHistory,
      sdkSessionId,
      thinkingLevel,
    } = options;

    // Convert thinking level to token budget
    const maxThinkingTokens = getThinkingTokenBudget(thinkingLevel);

    // The SDK is the only consumer that can take both kinds of MCP server, so
    // this is the one place they are merged.
    //
    // `inProcessMcpServers` carries live `McpSdkServerConfigWithInstance`
    // values (today: the ask_user channel). They cannot travel in `mcpServers`
    // because the Codex and Cursor providers write that same field into on-disk
    // config files, and an object holding a server instance does not survive
    // being serialised. In-process entries win a name collision — a live
    // instance is not something a settings-file entry should be able to shadow.
    const mergedMcpServers: Options['mcpServers'] | undefined =
      options.mcpServers || options.inProcessMcpServers
        ? {
            ...(options.mcpServers ?? {}),
            ...((options.inProcessMcpServers ?? {}) as NonNullable<Options['mcpServers']>),
          }
        : undefined;

    // Build Claude SDK options
    const sdkOptions: Options = {
      model,
      systemPrompt,
      maxTurns,
      cwd,
      // Pass only explicitly allowed environment variables to SDK
      env: buildEnv(),
      // Pass through allowedTools if provided by caller (decided by sdk-options.ts)
      ...(allowedTools && { allowedTools }),
      // AUTONOMOUS MODE: Always bypass permissions for fully autonomous operation
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      abortController,
      // Resume existing SDK session if we have a session ID
      ...(sdkSessionId && conversationHistory && conversationHistory.length > 0
        ? { resume: sdkSessionId }
        : {}),
      // Forward settingSources for CLAUDE.md file loading
      ...(options.settingSources && { settingSources: options.settingSources }),
      // Forward MCP servers configuration (subprocess/URL plus in-process)
      ...(mergedMcpServers && { mcpServers: mergedMcpServers }),
      // Extended thinking configuration
      ...(maxThinkingTokens && { maxThinkingTokens }),
      // Subagents configuration for specialized task delegation
      ...(options.agents && { agents: options.agents }),
      // Pass through outputFormat for structured JSON outputs
      ...(options.outputFormat && { outputFormat: options.outputFormat }),
    };

    // Build prompt payload
    let promptPayload: string | AsyncIterable<any>;

    const followUpInput = options.followUpInput;

    if (followUpInput) {
      // STREAMING-INPUT MODE. The only mode the SDK accepts extra user turns in
      // (and the only one where interrupt/setModel work) — but also the mode
      // where `isSingleUserTurn` is false, so the SDK no longer closes the
      // child's stdin on the first result. The caller's channel owns the
      // process lifetime from here; if it never completes, an ~11MB CLI process
      // leaks. Never take this branch on the caller's behalf.
      promptPayload = (async function* () {
        yield toUserMessage(prompt);
        for await (const message of followUpInput) {
          yield toUserMessage(message.content);
        }
      })();
    } else if (Array.isArray(prompt)) {
      // Multi-part prompt (with images)
      promptPayload = (async function* () {
        const multiPartPrompt = {
          type: 'user' as const,
          session_id: '',
          message: {
            role: 'user' as const,
            content: prompt,
          },
          parent_tool_use_id: null,
        };
        yield multiPartPrompt;
      })();
    } else {
      // Simple text prompt. Left exactly as it was: a plain string keeps
      // `isSingleUserTurn` true, so the SDK auto-closes stdin on the first
      // result and no run without `followUpInput` changes behaviour.
      promptPayload = prompt;
    }

    // Execute via Claude Agent SDK
    try {
      const stream = query({ prompt: promptPayload, options: sdkOptions });

      // Hand the caller the session's live controls. Feature-detected on
      // purpose: these methods only exist in streaming-input mode, and the unit
      // tests mock `query()` with a bare async generator that has none of them —
      // an unguarded reference breaks every one of them.
      if (options.onSessionControl) {
        const controls = stream as Partial<typeof stream>;
        if (typeof controls.interrupt === 'function') {
          options.onSessionControl({
            interrupt: () => stream.interrupt(),
            ...(typeof controls.setModel === 'function'
              ? { setModel: (nextModel?: string) => stream.setModel(nextModel) }
              : {}),
          });
        }
      }

      // Stream messages directly - they're already in the correct format
      for await (const msg of stream) {
        yield msg as ProviderMessage;
      }
    } catch (error) {
      // Enhance error with user-friendly message and classification
      const errorInfo = classifyError(error);
      const userMessage = getUserFriendlyErrorMessage(error);

      logger.error('executeQuery() error during execution:', {
        type: errorInfo.type,
        message: errorInfo.message,
        isRateLimit: errorInfo.isRateLimit,
        retryAfter: errorInfo.retryAfter,
        stack: (error as Error).stack,
      });

      // Build enhanced error message with additional guidance for rate limits
      const message = errorInfo.isRateLimit
        ? `${userMessage}\n\nTip: If you're running multiple features in auto-mode, consider reducing concurrency (maxConcurrency setting) to avoid hitting rate limits.`
        : userMessage;

      const enhancedError = new Error(message);
      (enhancedError as any).originalError = error;
      (enhancedError as any).type = errorInfo.type;

      if (errorInfo.isRateLimit) {
        (enhancedError as any).retryAfter = errorInfo.retryAfter;
      }

      throw enhancedError;
    }
  }

  /**
   * Detect Claude SDK installation (always available via npm)
   */
  async detectInstallation(): Promise<InstallationStatus> {
    // Claude SDK is always available since it's a dependency
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

    const status: InstallationStatus = {
      installed: true,
      method: 'sdk',
      hasApiKey,
      authenticated: hasApiKey,
    };

    return status;
  }

  /**
   * Get available Claude models
   */
  getAvailableModels(): ModelDefinition[] {
    const models = [
      {
        id: 'claude-opus-4-6',
        name: 'Claude Opus 4.6',
        modelString: 'claude-opus-4-6',
        provider: 'anthropic',
        description: 'Most capable Claude model',
        contextWindow: 1000000,
        maxOutputTokens: 128000,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium' as const,
        default: true,
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        modelString: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        description: 'Balanced performance and cost',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        modelString: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        description: 'Fast and capable',
        contextWindow: 200000,
        maxOutputTokens: 8000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        modelString: 'claude-haiku-4-5-20251001',
        provider: 'anthropic',
        description: 'Fastest Claude model',
        contextWindow: 200000,
        maxOutputTokens: 8000,
        supportsVision: true,
        supportsTools: true,
        tier: 'basic' as const,
      },
    ] satisfies ModelDefinition[];
    return models;
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text', 'vision', 'thinking'];
    return supportedFeatures.includes(feature);
  }
}
