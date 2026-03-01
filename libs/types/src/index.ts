/**
 * @dmaker/types
 * Shared type definitions for DMaker
 */

// Provider types
export type {
  ProviderConfig,
  ConversationMessage,
  ExecuteOptions,
  ContentBlock,
  ProviderMessage,
  InstallationStatus,
  ValidationResult,
  ModelDefinition,
  McpServerConfig,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
  AgentDefinition,
  SystemPromptPreset,
  ReasoningEffort,
} from './provider.js';

// Provider constants and utilities
export {
  DEFAULT_TIMEOUT_MS,
  REASONING_TIMEOUT_MULTIPLIERS,
  calculateReasoningTimeout,
} from './provider.js';

// Codex types (consolidated from codex.ts + codex-models.ts + codex-app-server.ts)
export type {
  CodexSandboxMode,
  CodexApprovalPolicy,
  CodexEventType,
  CodexItemType,
  CodexEvent,
  CodexCliConfig,
  CodexAuthStatus,
  CodexModelConfig,
  AppServerModelResponse,
  AppServerModel,
  AppServerReasoningEffort,
  AppServerAccountResponse,
  AppServerAccount,
  AppServerRateLimitsResponse,
  AppServerRateLimits,
  AppServerRateLimitWindow,
  JsonRpcRequest,
  JsonRpcResponse,
} from './codex-types.js';
export {
  CODEX_MODEL_CONFIG_MAP,
  codexModelHasThinking,
  getCodexModelLabel,
  getAllCodexModelIds as getAllCodexModelConfigIds,
  codexModelSupportsVision,
} from './codex-types.js';

// Feature types
export type {
  ExecutionMetrics,
  Feature,
  FeatureOwner,
  FeatureImagePath,
  FeatureTextFilePath,
  FeatureStatus,
  ComplexityLevel,
  PlanningMode,
  DescriptionHistoryEntry,
  SummaryHistoryEntry,
  // Summary file API types
  ListSummariesRequest,
  ListSummariesResponse,
  GetSummaryRequest,
  GetSummaryResponse,
  SummaryErrorResponse,
  SaveSummaryRequest,
  // Feature list summary types
  FeatureListSummary,
  ListFeatureSummariesRequest,
  ListFeatureSummariesResponse,
} from './feature.js';

// Core types (consolidated from multiple small files)
export type {
  // Error types
  ErrorType,
  ErrorInfo,
  // Image types
  ImageData,
  ImageContentBlock,
  // Enhancement types
  EnhancementMode,
  EnhancementExample,
  // Session types
  AgentSession,
  SessionListItem,
  CreateSessionParams,
  UpdateSessionParams,
  // Spec types
  SpecOutput,
  // Notification types
  NotificationType,
  Notification,
  NotificationsFile,
  // Prompt customization types
  CustomPrompt,
  AutoModePrompts,
  AgentPrompts,
  BacklogPlanPrompts,
  EnhancementPrompts,
  CommitMessagePrompts,
  TitleGenerationPrompts,
  IssueValidationPrompts,
  IdeationPrompts,
  AppSpecPrompts,
  ContextDescriptionPrompts,
  SuggestionsPrompts,
  TaskExecutionPrompts,
  PromptCustomization,
  ResolvedAutoModePrompts,
  ResolvedAgentPrompts,
  ResolvedBacklogPlanPrompts,
  ResolvedEnhancementPrompts,
  ResolvedCommitMessagePrompts,
  ResolvedTitleGenerationPrompts,
  ResolvedIssueValidationPrompts,
  ResolvedIdeationPrompts,
  ResolvedAppSpecPrompts,
  ResolvedContextDescriptionPrompts,
  ResolvedSuggestionsPrompts,
  ResolvedTaskExecutionPrompts,
  // Backlog plan types
  BacklogChange,
  DependencyUpdate,
  BacklogPlanResult,
  BacklogPlanEvent,
  BacklogPlanRequest,
  BacklogPlanApplyResult,
  // Issue validation types
  IssueValidationVerdict,
  IssueValidationConfidence,
  IssueComplexity,
  PRRecommendation,
  PRAnalysis,
  LinkedPRInfo,
  IssueValidationInput,
  IssueValidationRequest,
  IssueValidationResult,
  IssueValidationResponse,
  IssueValidationErrorResponse,
  IssueValidationEvent,
  StoredValidation,
  GitHubCommentAuthor,
  GitHubComment,
  IssueCommentsResult,
} from './core-types.js';
export {
  // Port configuration
  STATIC_PORT,
  SERVER_PORT,
  RESERVED_PORTS,
  // Spec schema
  specOutputSchema,
  // Notification constants
  NOTIFICATIONS_VERSION,
  DEFAULT_NOTIFICATIONS_FILE,
  // Prompt defaults
  DEFAULT_PROMPT_CUSTOMIZATION,
} from './core-types.js';

// Model types and constants
export {
  CLAUDE_MODEL_MAP,
  CODEX_MODEL_MAP,
  CODEX_MODEL_IDS,
  REASONING_CAPABLE_MODELS,
  supportsReasoningEffort,
  getAllCodexModelIds,
  DEFAULT_MODELS,
  type ModelAlias,
  type CodexModelId,
  type AgentModel,
  type ModelId,
  type DynamicModelId,
  type PrefixedCursorModelId,
  type PrefixedOpencodeModelId,
} from './model.js';

// Event types
export type { EventType, EventCallback } from './event.js';

// Settings types and constants
export type {
  ThemeMode,
  SyntaxTheme,
  ThinkingLevel,
  ServerLogLevel,
  ModelProvider,
  PhaseModelEntry,
  PhaseModelConfig,
  PhaseModelKey,
  WindowBounds,
  KeyboardShortcuts,
  MCPToolInfo,
  MCPServerConfig,
  ProjectRef,
  TrashedProjectRef,
  ChatSessionRef,
  GlobalSettings,
  Credentials,
  BoardBackgroundSettings,
  WorktreeInfo,
  ProjectSettings,
  // Claude account types
  ClaudeAccountRef,
  // Deploy script types
  DeployScriptType,
  DeployFolderScript,
  DeployRunStatus,
  DeployRun,
  // Build verification types
  BuildCommand,
} from './settings.js';
export {
  DEFAULT_KEYBOARD_SHORTCUTS,
  DEFAULT_PHASE_MODELS,
  DEFAULT_BUILD_COMMANDS,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_CREDENTIALS,
  DEFAULT_PROJECT_SETTINGS,
  SETTINGS_VERSION,
  CREDENTIALS_VERSION,
  PROJECT_SETTINGS_VERSION,
  THINKING_TOKEN_BUDGET,
  getThinkingTokenBudget,
} from './settings.js';

// Model display constants
export type { ModelOption, ThinkingLevelOption, ReasoningEffortOption } from './model-display.js';
export {
  CLAUDE_MODELS,
  CODEX_MODELS,
  GCP_MODELS,
  THINKING_LEVELS,
  THINKING_LEVEL_LABELS,
  REASONING_EFFORT_LEVELS,
  REASONING_EFFORT_LABELS,
  getModelDisplayName,
} from './model-display.js';

// Cursor types
export * from './cursor-models.js';
export * from './tool-types.js';

// OpenCode types
export * from './opencode-models.js';

// Provider utilities
export {
  PROVIDER_PREFIXES,
  isCursorModel,
  isClaudeModel,
  isCodexModel,
  isOpencodeModel,
  isGcpModel,
  getModelProvider,
  stripProviderPrefix,
  addProviderPrefix,
  getBareModelId,
  normalizeModelString,
  validateBareModelId,
} from './provider-utils.js';

// Pipeline types
export type {
  PipelineStep,
  PipelineConfig,
  PipelineStatus,
  FeatureStatusWithPipeline,
} from './pipeline.js';

// Ideation types
export type {
  IdeaCategory,
  IdeaStatus,
  ImpactLevel,
  EffortLevel,
  IdeaAttachment,
  Idea,
  IdeationSessionStatus,
  IdeationSession,
  IdeationMessage,
  IdeationSessionWithMessages,
  PromptCategory,
  IdeationPrompt,
  AnalysisFileInfo,
  AnalysisSuggestion,
  ProjectAnalysisResult,
  StartSessionOptions,
  SendMessageOptions,
  CreateIdeaInput,
  UpdateIdeaInput,
  ConvertToFeatureOptions,
  IdeationEventType,
  IdeationStreamEvent,
  IdeationAnalysisEvent,
} from './ideation.js';

// Cache types and constants
export type { EndpointCategory, CacheOptions } from './cache.js';
export {
  HEALTH_CACHE_TTL_MS,
  MODELS_CACHE_TTL_MS,
  SETTINGS_CACHE_TTL_MS,
  FEATURES_CACHE_TTL_MS,
  USAGE_CACHE_TTL_MS,
  DEFAULT_CACHE_OPTIONS,
} from './cache.js';
