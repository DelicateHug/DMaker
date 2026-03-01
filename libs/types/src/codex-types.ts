/**
 * Codex Types
 *
 * Consolidated types for Codex CLI integration including:
 * - Core Codex CLI types (sandbox modes, events, config)
 * - Codex model definitions and helpers
 * - Codex App-Server JSON-RPC types
 */

// =============================================================================
// Core Codex CLI Types
// =============================================================================

/** Sandbox modes for Codex CLI command execution */
export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

/** Approval policies for Codex CLI tool execution */
export type CodexApprovalPolicy = 'untrusted' | 'on-failure' | 'on-request' | 'never';

/** Codex event types emitted by CLI */
export type CodexEventType =
  | 'thread.started'
  | 'turn.started'
  | 'turn.completed'
  | 'turn.failed'
  | 'item.completed'
  | 'error';

/** Codex item types in CLI events */
export type CodexItemType =
  | 'agent_message'
  | 'reasoning'
  | 'command_execution'
  | 'file_change'
  | 'mcp_tool_call'
  | 'web_search'
  | 'plan_update';

/** Codex CLI event structure */
export interface CodexEvent {
  type: CodexEventType;
  thread_id?: string;
  item?: {
    type: CodexItemType;
    content?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Codex CLI configuration (stored in .dmaker/codex-config.json) */
export interface CodexCliConfig {
  /** Default model to use when not specified */
  defaultModel?: string;
  /** List of enabled models */
  models?: string[];
}

/** Codex authentication status */
export interface CodexAuthStatus {
  authenticated: boolean;
  method: 'oauth' | 'api_key' | 'none';
  hasCredentialsFile?: boolean;
  error?: string;
}

// =============================================================================
// Codex Model Definitions
// =============================================================================

/**
 * Codex CLI Model IDs
 * Based on OpenAI Codex CLI official models
 * Reference: https://developers.openai.com/codex/models/
 *
 * IMPORTANT: All Codex models use 'codex-' prefix to distinguish from Cursor CLI models
 */
export type CodexModelId =
  | 'codex-gpt-5.2-codex'
  | 'codex-gpt-5.1-codex-max'
  | 'codex-gpt-5.1-codex-mini'
  | 'codex-gpt-5.2'
  | 'codex-gpt-5.1';

/**
 * Codex model metadata
 */
export interface CodexModelConfig {
  id: CodexModelId;
  label: string;
  description: string;
  hasThinking: boolean;
  /** Whether the model supports vision/image inputs */
  supportsVision: boolean;
}

/**
 * Complete model map for Codex CLI
 * All keys use 'codex-' prefix to distinguish from Cursor CLI models
 */
export const CODEX_MODEL_CONFIG_MAP: Record<CodexModelId, CodexModelConfig> = {
  'codex-gpt-5.2-codex': {
    id: 'codex-gpt-5.2-codex',
    label: 'GPT-5.2-Codex',
    description: 'Most advanced agentic coding model for complex software engineering',
    hasThinking: true,
    supportsVision: true,
  },
  'codex-gpt-5.1-codex-max': {
    id: 'codex-gpt-5.1-codex-max',
    label: 'GPT-5.1-Codex-Max',
    description: 'Optimized for long-horizon, agentic coding tasks in Codex',
    hasThinking: true,
    supportsVision: true,
  },
  'codex-gpt-5.1-codex-mini': {
    id: 'codex-gpt-5.1-codex-mini',
    label: 'GPT-5.1-Codex-Mini',
    description: 'Smaller, more cost-effective version for faster workflows',
    hasThinking: false,
    supportsVision: true,
  },
  'codex-gpt-5.2': {
    id: 'codex-gpt-5.2',
    label: 'GPT-5.2 (Codex)',
    description: 'Best general agentic model for tasks across industries and domains via Codex',
    hasThinking: true,
    supportsVision: true,
  },
  'codex-gpt-5.1': {
    id: 'codex-gpt-5.1',
    label: 'GPT-5.1 (Codex)',
    description: 'Great for coding and agentic tasks across domains via Codex',
    hasThinking: true,
    supportsVision: true,
  },
};

/**
 * Helper: Check if model has thinking capability
 */
export function codexModelHasThinking(modelId: CodexModelId): boolean {
  return CODEX_MODEL_CONFIG_MAP[modelId]?.hasThinking ?? false;
}

/**
 * Helper: Get display name for model
 */
export function getCodexModelLabel(modelId: CodexModelId): string {
  return CODEX_MODEL_CONFIG_MAP[modelId]?.label ?? modelId;
}

/**
 * Helper: Get all Codex model IDs
 */
export function getAllCodexModelIds(): CodexModelId[] {
  return Object.keys(CODEX_MODEL_CONFIG_MAP) as CodexModelId[];
}

/**
 * Helper: Check if Codex model supports vision
 */
export function codexModelSupportsVision(modelId: CodexModelId): boolean {
  return CODEX_MODEL_CONFIG_MAP[modelId]?.supportsVision ?? true;
}

// =============================================================================
// Codex App-Server JSON-RPC Types
// =============================================================================

/**
 * Response from model/list JSON-RPC method
 * Returns list of available Codex models for the authenticated user
 */
export interface AppServerModelResponse {
  data: AppServerModel[];
  nextCursor: string | null;
}

export interface AppServerModel {
  id: string;
  model: string;
  displayName: string;
  description: string;
  supportedReasoningEfforts: AppServerReasoningEffort[];
  defaultReasoningEffort: string;
  isDefault: boolean;
}

export interface AppServerReasoningEffort {
  reasoningEffort: string;
  description: string;
}

/**
 * Response from account/read JSON-RPC method
 * Returns current authentication state and account information
 */
export interface AppServerAccountResponse {
  account: AppServerAccount | null;
  requiresOpenaiAuth: boolean;
}

export interface AppServerAccount {
  type: 'apiKey' | 'chatgpt';
  email?: string;
  planType?: string;
}

/**
 * Response from account/rateLimits/read JSON-RPC method
 * Returns rate limit information for the current user
 */
export interface AppServerRateLimitsResponse {
  rateLimits: AppServerRateLimits;
}

export interface AppServerRateLimits {
  primary: AppServerRateLimitWindow | null;
  secondary: AppServerRateLimitWindow | null;
  planType?: string;
}

export interface AppServerRateLimitWindow {
  usedPercent: number;
  windowDurationMins: number;
  resetsAt: number;
}

/**
 * Generic JSON-RPC request structure
 */
export interface JsonRpcRequest {
  method: string;
  id: number;
  params?: unknown;
}

/**
 * Generic JSON-RPC response structure
 */
export interface JsonRpcResponse<T = unknown> {
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}
