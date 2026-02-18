/**
 * @automaker/types
 * Shared type definitions for AutoMaker
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

// Codex CLI types
export type {
  CodexSandboxMode,
  CodexApprovalPolicy,
  CodexEventType,
  CodexItemType,
  CodexEvent,
  CodexCliConfig,
  CodexAuthStatus,
} from './codex.js';
export * from './codex-models.js';

// Codex App-Server JSON-RPC types
export type {
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
} from './codex-app-server.js';

// Feature types
export type {
  Feature,
  FeatureOwner,
  FeatureImagePath,
  FeatureTextFilePath,
  FeatureStatus,
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

// Session types
export type {
  AgentSession,
  SessionListItem,
  CreateSessionParams,
  UpdateSessionParams,
} from './session.js';

// Error types
export type { ErrorType, ErrorInfo } from './error.js';

// Image types
export type { ImageData, ImageContentBlock } from './image.js';

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

// Spec types
export type { SpecOutput } from './spec.js';
export { specOutputSchema } from './spec.js';

// Enhancement types
export type { EnhancementMode, EnhancementExample } from './enhancement.js';

// Prompt customization types
export type {
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
} from './prompts.js';
export { DEFAULT_PROMPT_CUSTOMIZATION } from './prompts.js';

// Settings types and constants
export type {
  ThemeMode,
  SyntaxTheme,
  PlanningMode,
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
  // Event hook types
  EventHookTrigger,
  EventHookHttpMethod,
  EventHookShellAction,
  EventHookHttpAction,
  EventHookAction,
  EventHook,
  // Claude account types
  ClaudeAccountRef,
  // Deploy script types
  DeployScriptType,
  DeployFolderScript,
  DeployRunStatus,
  DeployRun,
} from './settings.js';
export {
  DEFAULT_KEYBOARD_SHORTCUTS,
  DEFAULT_PHASE_MODELS,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_CREDENTIALS,
  DEFAULT_PROJECT_SETTINGS,
  SETTINGS_VERSION,
  CREDENTIALS_VERSION,
  PROJECT_SETTINGS_VERSION,
  THINKING_TOKEN_BUDGET,
  getThinkingTokenBudget,
  // Event hook constants
  EVENT_HOOK_TRIGGER_LABELS,
} from './settings.js';

// Model display constants
export type { ModelOption, ThinkingLevelOption, ReasoningEffortOption } from './model-display.js';
export {
  CLAUDE_MODELS,
  CODEX_MODELS,
  THINKING_LEVELS,
  THINKING_LEVEL_LABELS,
  REASONING_EFFORT_LEVELS,
  REASONING_EFFORT_LABELS,
  getModelDisplayName,
} from './model-display.js';

// Issue validation types
export type {
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
} from './issue-validation.js';

// Backlog plan types
export type {
  BacklogChange,
  DependencyUpdate,
  BacklogPlanResult,
  BacklogPlanEvent,
  BacklogPlanRequest,
  BacklogPlanApplyResult,
} from './backlog-plan.js';

// Cursor types
export * from './cursor-models.js';
export * from './cursor-cli.js';

// OpenCode types
export * from './opencode-models.js';

// Provider utilities
export {
  PROVIDER_PREFIXES,
  isCursorModel,
  isClaudeModel,
  isCodexModel,
  isOpencodeModel,
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

// Port configuration
export { STATIC_PORT, SERVER_PORT, RESERVED_PORTS } from './ports.js';

// Editor types
export type { EditorInfo } from './editor.js';

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

// Notification types
export type { NotificationType, Notification, NotificationsFile } from './notification.js';
export { NOTIFICATIONS_VERSION, DEFAULT_NOTIFICATIONS_FILE } from './notification.js';

// Event history types
export type {
  StoredEvent,
  StoredEventIndex,
  StoredEventSummary,
  EventHistoryFilter,
  EventReplayResult,
  EventReplayHookResult,
} from './event-history.js';
export { EVENT_HISTORY_VERSION, DEFAULT_EVENT_HISTORY_INDEX } from './event-history.js';

// Voice types
export type {
  VoiceInputMode,
  VoiceOutputMode,
  VoiceSettings,
  VoiceSessionStatus,
  VoiceMessage,
  VoiceSession,
  CreateVoiceSessionParams,
  VoiceCommandResult,
  VoiceEventType,
  VoiceSessionEvent,
  VoiceRecordingEvent,
  VoiceTranscriptionEvent,
  VoiceCommandEvent,
  VoiceResponseEvent,
  VoiceSpeakingEvent,
  VoiceErrorEvent,
  VoiceErrorCode,
  VoiceEvent,
  ProcessVoiceCommandRequest,
  ProcessVoiceCommandResponse,
  VoiceSessionStatusResponse,
} from './voice.js';
export { DEFAULT_VOICE_SETTINGS } from './voice.js';

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
