/**
 * Core Types
 *
 * Consolidated core type definitions including:
 * - Error classification
 * - Image data
 * - Port configuration
 * - Enhancement modes
 * - Session management
 * - App specification
 * - Notifications
 * - Prompt customization
 * - Backlog planning
 * - Issue validation
 */

import type { Feature } from './feature.js';
import type { ModelId } from './model.js';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error type classification
 */
export type ErrorType =
  | 'authentication'
  | 'cancellation'
  | 'abort'
  | 'execution'
  | 'rate_limit'
  | 'quota_exhausted'
  | 'unknown';

/**
 * Classified error information
 */
export interface ErrorInfo {
  type: ErrorType;
  message: string;
  isAbort: boolean;
  isAuth: boolean;
  isCancellation: boolean;
  isRateLimit: boolean;
  isQuotaExhausted: boolean; // Session/weekly usage limit reached
  retryAfter?: number; // Seconds to wait before retrying (for rate limit errors)
  originalError: unknown;
}

// =============================================================================
// Image Types
// =============================================================================

/**
 * Image data with base64 encoding and metadata
 */
export interface ImageData {
  base64: string;
  mimeType: string;
  filename: string;
  originalPath: string;
}

/**
 * Content block for image (Claude SDK format)
 */
export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

// =============================================================================
// Port Configuration
// =============================================================================

/**
 * Centralized port configuration for DMaker
 *
 * These ports are reserved for the DMaker application and should never be
 * killed or terminated by AI agents during feature implementation.
 */

/** Port for the static/UI server (Vite dev server) */
export const STATIC_PORT = 3007;

/** Port for the backend API server (Express + WebSocket) */
export const SERVER_PORT = 3008;

/** Array of all reserved DMaker ports */
export const RESERVED_PORTS = [STATIC_PORT, SERVER_PORT] as const;

// =============================================================================
// Enhancement Types
// =============================================================================

/**
 * Available enhancement modes for transforming task descriptions
 */
export type EnhancementMode = 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer';

/**
 * Example input/output pair for few-shot learning
 */
export interface EnhancementExample {
  input: string;
  output: string;
}

// =============================================================================
// Session Types
// =============================================================================

export interface AgentSession {
  id: string;
  name: string;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  isArchived: boolean;
  isDirty?: boolean; // Indicates session has completed work that needs review
  tags?: string[];
}

export interface SessionListItem extends AgentSession {
  preview?: string; // Last message preview
}

export interface CreateSessionParams {
  name: string;
  projectPath: string;
  workingDirectory?: string;
}

export interface UpdateSessionParams {
  id: string;
  name?: string;
  tags?: string[];
}

// =============================================================================
// App Specification Types
// =============================================================================

/**
 * TypeScript interface for structured spec output
 */
export interface SpecOutput {
  project_name: string;
  overview: string;
  technology_stack: string[];
  core_capabilities: string[];
  implemented_features: Array<{
    name: string;
    description: string;
    file_locations?: string[];
  }>;
  additional_requirements?: string[];
  development_guidelines?: string[];
  implementation_roadmap?: Array<{
    phase: string;
    status: 'completed' | 'in_progress' | 'pending';
    description: string;
  }>;
}

/**
 * JSON Schema for structured spec output
 * Used with Claude's structured output feature for reliable parsing
 */
export const specOutputSchema = {
  type: 'object',
  properties: {
    project_name: {
      type: 'string',
      description: 'The name of the project',
    },
    overview: {
      type: 'string',
      description:
        'A comprehensive description of what the project does, its purpose, and key goals',
    },
    technology_stack: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of all technologies, frameworks, libraries, and tools used',
    },
    core_capabilities: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of main features and capabilities the project provides',
    },
    implemented_features: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the implemented feature',
          },
          description: {
            type: 'string',
            description: 'Description of what the feature does',
          },
          file_locations: {
            type: 'array',
            items: { type: 'string' },
            description: 'File paths where this feature is implemented',
          },
        },
        required: ['name', 'description'],
      },
      description: 'Features that have been implemented based on code analysis',
    },
    additional_requirements: {
      type: 'array',
      items: { type: 'string' },
      description: 'Any additional requirements or constraints',
    },
    development_guidelines: {
      type: 'array',
      items: { type: 'string' },
      description: 'Development standards and practices',
    },
    implementation_roadmap: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          phase: {
            type: 'string',
            description: 'Name of the implementation phase',
          },
          status: {
            type: 'string',
            enum: ['completed', 'in_progress', 'pending'],
            description: 'Current status of this phase',
          },
          description: {
            type: 'string',
            description: 'Description of what this phase involves',
          },
        },
        required: ['phase', 'status', 'description'],
      },
      description: 'Phases or roadmap items for implementation',
    },
  },
  required: [
    'project_name',
    'overview',
    'technology_stack',
    'core_capabilities',
    'implemented_features',
  ],
  additionalProperties: false,
};

// =============================================================================
// Notification Types
// =============================================================================

/**
 * NotificationType - Types of notifications that can be created
 */
export type NotificationType =
  | 'feature_waiting_approval'
  | 'feature_verified'
  | 'spec_regeneration_complete'
  | 'agent_complete';

/**
 * Notification - A single notification entry
 */
export interface Notification {
  /** Unique identifier for the notification */
  id: string;
  /** Type of notification */
  type: NotificationType;
  /** Short title for display */
  title: string;
  /** Longer descriptive message */
  message: string;
  /** ISO timestamp when notification was created */
  createdAt: string;
  /** Whether the notification has been read */
  read: boolean;
  /** Whether the notification has been dismissed */
  dismissed: boolean;
  /** Associated feature ID if applicable */
  featureId?: string;
  /** Project path this notification belongs to */
  projectPath: string;
}

/**
 * NotificationsFile - Structure of the notifications.json file
 */
export interface NotificationsFile {
  /** Version for future migrations */
  version: number;
  /** List of notifications */
  notifications: Notification[];
}

/** Current version of the notifications file schema */
export const NOTIFICATIONS_VERSION = 1;

/** Default notifications file structure */
export const DEFAULT_NOTIFICATIONS_FILE: NotificationsFile = {
  version: NOTIFICATIONS_VERSION,
  notifications: [],
};

// =============================================================================
// Prompt Customization Types
// =============================================================================

/**
 * CustomPrompt - A custom prompt with its value and enabled state
 *
 * The value is always preserved even when disabled, so users don't lose their work.
 */
export interface CustomPrompt {
  /** The custom prompt text */
  value: string;

  /** Whether this custom prompt should be used (when false, default is used instead) */
  enabled: boolean;
}

/**
 * AutoModePrompts - Customizable prompts for Auto Mode feature implementation
 *
 * Controls how the AI plans and implements features in autonomous mode.
 */
export interface AutoModePrompts {
  /** Planning mode: Quick outline without approval (lite mode) */
  planningLite?: CustomPrompt;

  /** Planning mode: Quick outline with approval required (lite with approval) */
  planningLiteWithApproval?: CustomPrompt;

  /** Planning mode: Detailed specification with task breakdown (spec mode) */
  planningSpec?: CustomPrompt;

  /** Planning mode: Comprehensive Software Design Document (full SDD mode) */
  planningFull?: CustomPrompt;

  /** Planning mode: Adaptive — starts lite, escalates to spec/full if needed */
  planningAdaptive?: CustomPrompt;

  /** Template for building feature implementation prompts */
  featurePromptTemplate?: CustomPrompt;

  /** Template for follow-up prompts when resuming work */
  followUpPromptTemplate?: CustomPrompt;

  /** Template for continuation prompts */
  continuationPromptTemplate?: CustomPrompt;

  /** Template for pipeline step execution prompts */
  pipelineStepPromptTemplate?: CustomPrompt;
}

/**
 * AgentPrompts - Customizable prompts for Agent Runner (chat mode)
 *
 * Controls the AI's behavior in interactive chat sessions.
 */
export interface AgentPrompts {
  /** System prompt defining the agent's role and behavior in chat */
  systemPrompt?: CustomPrompt;
}

/**
 * BacklogPlanPrompts - Customizable prompts for Kanban board planning
 *
 * Controls how the AI modifies the feature backlog via the Plan button.
 */
export interface BacklogPlanPrompts {
  /** System prompt for backlog plan generation (defines output format and rules) */
  systemPrompt?: CustomPrompt;

  /** Template for user prompt (includes current features and user request) */
  userPromptTemplate?: CustomPrompt;
}

/**
 * EnhancementPrompts - Customizable prompts for feature description enhancement
 *
 * Controls how the AI enhances feature titles and descriptions.
 */
export interface EnhancementPrompts {
  /** System prompt for "improve" mode (vague -> clear) */
  improveSystemPrompt?: CustomPrompt;

  /** System prompt for "technical" mode (add technical details) */
  technicalSystemPrompt?: CustomPrompt;

  /** System prompt for "simplify" mode (verbose -> concise) */
  simplifySystemPrompt?: CustomPrompt;

  /** System prompt for "acceptance" mode (add acceptance criteria) */
  acceptanceSystemPrompt?: CustomPrompt;

  /** System prompt for "ux-reviewer" mode (UX and design perspective) */
  uxReviewerSystemPrompt?: CustomPrompt;
}

/**
 * CommitMessagePrompts - Customizable prompts for AI commit message generation
 *
 * Controls how the AI generates git commit messages from diffs.
 */
export interface CommitMessagePrompts {
  /** System prompt for generating commit messages */
  systemPrompt?: CustomPrompt;
}

/**
 * TitleGenerationPrompts - Customizable prompts for AI feature title generation
 *
 * Controls how the AI generates short, descriptive titles for features.
 */
export interface TitleGenerationPrompts {
  /** System prompt for generating feature titles from descriptions */
  systemPrompt?: CustomPrompt;
}

/**
 * IssueValidationPrompts - Customizable prompts for GitHub issue validation
 *
 * Controls how the AI validates GitHub issues against the codebase,
 * determining if issues are valid, invalid, or need clarification.
 */
export interface IssueValidationPrompts {
  /** System prompt for validating GitHub issues against codebase */
  systemPrompt?: CustomPrompt;
}

/**
 * IdeationPrompts - Customizable prompts for AI-powered ideation and brainstorming
 *
 * Controls how the AI generates feature ideas and suggestions for the project.
 */
export interface IdeationPrompts {
  /** System prompt for ideation chat conversations */
  ideationSystemPrompt?: CustomPrompt;

  /** System prompt for generating feature suggestions */
  suggestionsSystemPrompt?: CustomPrompt;
}

/**
 * AppSpecPrompts - Customizable prompts for project specification generation
 *
 * Controls how the AI generates project specifications and features from specs.
 */
export interface AppSpecPrompts {
  /** System prompt for generating project specifications */
  generateSpecSystemPrompt?: CustomPrompt;

  /** Instructions for structured specification output format */
  structuredSpecInstructions?: CustomPrompt;

  /** System prompt for generating features from a specification */
  generateFeaturesFromSpecPrompt?: CustomPrompt;
}

/**
 * ContextDescriptionPrompts - Customizable prompts for context file/image descriptions
 *
 * Controls how the AI describes context files and images.
 */
export interface ContextDescriptionPrompts {
  /** System prompt for describing text files added as context */
  describeFilePrompt?: CustomPrompt;

  /** System prompt for describing images added as context */
  describeImagePrompt?: CustomPrompt;
}

/**
 * SuggestionsPrompts - Customizable prompts for generating various suggestions
 *
 * Controls how the AI generates feature, refactoring, security, and performance suggestions.
 */
export interface SuggestionsPrompts {
  /** Prompt for generating new feature suggestions */
  featuresPrompt?: CustomPrompt;

  /** Prompt for generating refactoring suggestions */
  refactoringPrompt?: CustomPrompt;

  /** Prompt for generating security suggestions */
  securityPrompt?: CustomPrompt;

  /** Prompt for generating performance suggestions */
  performancePrompt?: CustomPrompt;

  /** Base template for all suggestion types */
  baseTemplate?: CustomPrompt;
}

/**
 * TaskExecutionPrompts - Customizable prompts for Auto Mode task execution
 *
 * Controls how the AI executes tasks, extracts learnings, and handles continuations.
 */
export interface TaskExecutionPrompts {
  /** Template for building task execution prompts */
  taskPromptTemplate?: CustomPrompt;

  /** Instructions appended to feature implementation prompts */
  implementationInstructions?: CustomPrompt;

  /** Instructions for Playwright verification (when enabled) */
  playwrightVerificationInstructions?: CustomPrompt;

  /** System prompt for extracting learnings/ADRs from implementation */
  learningExtractionSystemPrompt?: CustomPrompt;

  /** User prompt template for learning extraction */
  learningExtractionUserPromptTemplate?: CustomPrompt;

  /** Template for prompting plan revisions */
  planRevisionTemplate?: CustomPrompt;

  /** Template for continuation after plan approval */
  continuationAfterApprovalTemplate?: CustomPrompt;

  /** Template for resuming interrupted features */
  resumeFeatureTemplate?: CustomPrompt;

  /** Template for project analysis */
  projectAnalysisPrompt?: CustomPrompt;
}

/**
 * PromptCustomization - Complete set of customizable prompts
 *
 * All fields are optional. Undefined values fall back to built-in defaults.
 * Stored in GlobalSettings to allow user customization.
 */
export interface PromptCustomization {
  /** Auto Mode prompts (feature implementation) */
  autoMode?: AutoModePrompts;

  /** Agent Runner prompts (interactive chat) */
  agent?: AgentPrompts;

  /** Backlog planning prompts (Plan button) */
  backlogPlan?: BacklogPlanPrompts;

  /** Enhancement prompts (feature description improvement) */
  enhancement?: EnhancementPrompts;

  /** Commit message prompts (AI-generated commit messages) */
  commitMessage?: CommitMessagePrompts;

  /** Title generation prompts (AI-generated feature titles) */
  titleGeneration?: TitleGenerationPrompts;

  /** Issue validation prompts (GitHub issue validation) */
  issueValidation?: IssueValidationPrompts;

  /** Ideation prompts (AI-powered brainstorming and suggestions) */
  ideation?: IdeationPrompts;

  /** App specification prompts (project spec generation) */
  appSpec?: AppSpecPrompts;

  /** Context description prompts (file/image descriptions) */
  contextDescription?: ContextDescriptionPrompts;

  /** Suggestions prompts (features, refactoring, security, performance) */
  suggestions?: SuggestionsPrompts;

  /** Task execution prompts (Auto Mode task execution, learning extraction) */
  taskExecution?: TaskExecutionPrompts;
}

/**
 * Default empty prompt customization (all undefined -> use built-in defaults)
 */
export const DEFAULT_PROMPT_CUSTOMIZATION: PromptCustomization = {
  autoMode: {},
  agent: {},
  backlogPlan: {},
  enhancement: {},
  commitMessage: {},
  titleGeneration: {},
  issueValidation: {},
  ideation: {},
  appSpec: {},
  contextDescription: {},
  suggestions: {},
  taskExecution: {},
};

/**
 * Resolved prompt types - all fields are required strings (ready to use)
 * Used for default prompts and merged prompts after resolving custom values
 */
export interface ResolvedAutoModePrompts {
  planningLite: string;
  planningLiteWithApproval: string;
  planningSpec: string;
  planningFull: string;
  planningAdaptive: string;
  featurePromptTemplate: string;
  followUpPromptTemplate: string;
  continuationPromptTemplate: string;
  pipelineStepPromptTemplate: string;
}

export interface ResolvedAgentPrompts {
  systemPrompt: string;
}

export interface ResolvedBacklogPlanPrompts {
  systemPrompt: string;
  userPromptTemplate: string;
}

export interface ResolvedEnhancementPrompts {
  improveSystemPrompt: string;
  technicalSystemPrompt: string;
  simplifySystemPrompt: string;
  acceptanceSystemPrompt: string;
  uxReviewerSystemPrompt: string;
}

export interface ResolvedCommitMessagePrompts {
  systemPrompt: string;
}

export interface ResolvedTitleGenerationPrompts {
  systemPrompt: string;
}

export interface ResolvedIssueValidationPrompts {
  systemPrompt: string;
}

export interface ResolvedIdeationPrompts {
  ideationSystemPrompt: string;
  suggestionsSystemPrompt: string;
}

export interface ResolvedAppSpecPrompts {
  generateSpecSystemPrompt: string;
  structuredSpecInstructions: string;
  generateFeaturesFromSpecPrompt: string;
}

export interface ResolvedContextDescriptionPrompts {
  describeFilePrompt: string;
  describeImagePrompt: string;
}

export interface ResolvedSuggestionsPrompts {
  featuresPrompt: string;
  refactoringPrompt: string;
  securityPrompt: string;
  performancePrompt: string;
  baseTemplate: string;
}

export interface ResolvedTaskExecutionPrompts {
  taskPromptTemplate: string;
  implementationInstructions: string;
  playwrightVerificationInstructions: string;
  learningExtractionSystemPrompt: string;
  learningExtractionUserPromptTemplate: string;
  planRevisionTemplate: string;
  continuationAfterApprovalTemplate: string;
  resumeFeatureTemplate: string;
  projectAnalysisPrompt: string;
}

// =============================================================================
// Backlog Plan Types
// =============================================================================

/**
 * A single proposed change to the backlog
 */
export interface BacklogChange {
  type: 'add' | 'update' | 'delete';
  featureId?: string; // For update/delete operations
  feature?: Partial<Feature>; // For add/update (includes title, description, category, dependencies, priority)
  reason: string; // AI explanation of why this change is proposed
}

/**
 * Dependency updates that need to happen as a result of the plan
 */
export interface DependencyUpdate {
  featureId: string;
  removedDependencies: string[]; // Dependencies removed due to deleted features
  addedDependencies: string[]; // New dependencies based on AI analysis
}

/**
 * Result from the AI when generating a backlog plan
 */
export interface BacklogPlanResult {
  changes: BacklogChange[];
  summary: string; // Overview of proposed changes
  dependencyUpdates: DependencyUpdate[];
}

/**
 * Events emitted during backlog plan generation
 */
export interface BacklogPlanEvent {
  type:
    | 'backlog_plan_progress'
    | 'backlog_plan_tool'
    | 'backlog_plan_complete'
    | 'backlog_plan_error';
  content?: string;
  tool?: string;
  input?: unknown;
  result?: BacklogPlanResult;
  error?: string;
}

/**
 * Request to generate a backlog plan
 */
export interface BacklogPlanRequest {
  projectPath: string;
  prompt: string;
  model?: string;
}

/**
 * Response from apply operation
 */
export interface BacklogPlanApplyResult {
  success: boolean;
  appliedChanges: string[]; // IDs of features affected
  error?: string;
}

// =============================================================================
// Issue Validation Types
// =============================================================================

/**
 * Verdict from issue validation
 */
export type IssueValidationVerdict = 'valid' | 'invalid' | 'needs_clarification';

/**
 * Confidence level of the validation
 */
export type IssueValidationConfidence = 'high' | 'medium' | 'low';

/**
 * Complexity estimation for valid issues
 */
export type IssueComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'very_complex';

/**
 * Recommendation for PR-related action
 */
export type PRRecommendation = 'wait_for_merge' | 'pr_needs_work' | 'no_pr';

/**
 * Analysis of a linked pull request
 */
export interface PRAnalysis {
  /** Whether there is an open PR linked to this issue */
  hasOpenPR: boolean;
  /** Whether the PR appears to fix the issue based on the diff */
  prFixesIssue?: boolean;
  /** The PR number that was analyzed */
  prNumber?: number;
  /** Brief summary of what the PR changes */
  prSummary?: string;
  /** Recommendation: wait for PR to merge, PR needs more work, or no relevant PR */
  recommendation: PRRecommendation;
}

/**
 * Linked PR info for validation
 */
export interface LinkedPRInfo {
  number: number;
  title: string;
  state: string;
}

/**
 * Issue data for validation (without projectPath)
 * Used by UI when calling the validation API
 */
export interface IssueValidationInput {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  issueLabels?: string[];
  /** Comments to include in validation analysis */
  comments?: GitHubComment[];
  /** Linked pull requests for this issue */
  linkedPRs?: LinkedPRInfo[];
}

/**
 * Full request payload for issue validation endpoint
 * Includes projectPath for server-side handling
 */
export interface IssueValidationRequest extends IssueValidationInput {
  projectPath: string;
}

/**
 * Result from Claude's issue validation analysis
 */
export interface IssueValidationResult {
  /** Whether the issue is valid, invalid, or needs clarification */
  verdict: IssueValidationVerdict;
  /** How confident the AI is in its assessment */
  confidence: IssueValidationConfidence;
  /** Detailed explanation of the verdict */
  reasoning: string;
  /** For bug reports: whether the bug was confirmed in the codebase */
  bugConfirmed?: boolean;
  /** Files related to the issue found during analysis */
  relatedFiles?: string[];
  /** Suggested approach to fix or implement */
  suggestedFix?: string;
  /** Information that's missing and needed for validation (when verdict = needs_clarification) */
  missingInfo?: string[];
  /** Estimated effort to address the issue */
  estimatedComplexity?: IssueComplexity;
  /** Analysis of linked pull requests (if any) */
  prAnalysis?: PRAnalysis;
}

/**
 * Successful response from validate-issue endpoint
 */
export interface IssueValidationResponse {
  success: true;
  issueNumber: number;
  validation: IssueValidationResult;
}

/**
 * Error response from validate-issue endpoint
 */
export interface IssueValidationErrorResponse {
  success: false;
  error: string;
}

/**
 * Events emitted during async issue validation
 */
export type IssueValidationEvent =
  | {
      type: 'issue_validation_start';
      issueNumber: number;
      issueTitle: string;
      projectPath: string;
    }
  | {
      type: 'issue_validation_progress';
      issueNumber: number;
      content: string;
      projectPath: string;
    }
  | {
      type: 'issue_validation_complete';
      issueNumber: number;
      issueTitle: string;
      result: IssueValidationResult;
      projectPath: string;
      /** Model used for validation */
      model: ModelId;
    }
  | {
      type: 'issue_validation_error';
      issueNumber: number;
      error: string;
      projectPath: string;
    }
  | {
      type: 'issue_validation_viewed';
      issueNumber: number;
      projectPath: string;
    };

/**
 * Stored validation data with metadata for cache
 */
export interface StoredValidation {
  /** GitHub issue number */
  issueNumber: number;
  /** Issue title at time of validation */
  issueTitle: string;
  /** ISO timestamp when validation was performed */
  validatedAt: string;
  /** Model used for validation */
  model: ModelId;
  /** The validation result */
  result: IssueValidationResult;
  /** ISO timestamp when user viewed this validation (undefined = not yet viewed) */
  viewedAt?: string;
}

/**
 * Author of a GitHub comment
 */
export interface GitHubCommentAuthor {
  login: string;
  avatarUrl?: string;
}

/**
 * A comment on a GitHub issue
 */
export interface GitHubComment {
  /** Unique comment ID */
  id: string;
  /** Author of the comment */
  author: GitHubCommentAuthor;
  /** Comment body (markdown) */
  body: string;
  /** ISO timestamp when comment was created */
  createdAt: string;
  /** ISO timestamp when comment was last updated */
  updatedAt?: string;
}

/**
 * Result from fetching issue comments
 */
export interface IssueCommentsResult {
  /** List of comments */
  comments: GitHubComment[];
  /** Total number of comments on the issue */
  totalCount: number;
  /** Whether there are more comments to fetch */
  hasNextPage: boolean;
  /** Cursor for pagination (pass to next request) */
  endCursor?: string;
}
