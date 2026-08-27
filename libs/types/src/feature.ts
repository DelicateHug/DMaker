/**
 * Feature types for DMaker feature management
 */

import type { ThinkingLevel } from './settings.js';
import type { ReasoningEffort } from './provider.js';
import type { SubagentSummary } from './agent-tree.js';

/**
 * Git user identity for feature ownership tracking
 */
export interface FeatureOwner {
  name: string;
  email: string;
}

/**
 * A single entry in the description history
 */
export interface DescriptionHistoryEntry {
  description: string;
  timestamp: string; // ISO date string
  source: 'initial' | 'enhance' | 'edit'; // What triggered this version
  enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer'; // Only for 'enhance' source
}

/**
 * A single entry in the summary history for tracking agent output summaries over time.
 *
 * Summary files are stored as individual markdown files in the summaries directory:
 *   {projectPath}/.dmaker/features/{featureId}/summaries/{timestamp}.md
 *
 * The timestamp in the filename is sanitized for filesystem safety (colons replaced with dashes).
 */
export interface SummaryHistoryEntry {
  /** The summary content (markdown) */
  summary: string;
  /** ISO timestamp when this summary was created */
  timestamp: string;
  /** The model used for this execution (e.g., 'claude-sonnet-4-20250514') */
  model?: string;
}

// ── Summary File API Types ──────────────────────────────────────────────────

/**
 * Request payload for listing all summary files for a feature.
 * Used by POST /api/features/summaries
 */
export interface ListSummariesRequest {
  /** Path to the project */
  projectPath: string;
  /** ID of the feature */
  featureId: string;
}

/**
 * Successful response from listing summary files.
 * Returns summary entries sorted by timestamp (newest first).
 */
export interface ListSummariesResponse {
  success: true;
  /** Array of summary entries sorted by timestamp (newest first) */
  summaries: SummaryHistoryEntry[];
}

/**
 * Request payload for getting a single summary file by timestamp.
 * Used by POST /api/features/summary
 */
export interface GetSummaryRequest {
  /** Path to the project */
  projectPath: string;
  /** ID of the feature */
  featureId: string;
  /** ISO timestamp of the summary to retrieve */
  timestamp: string;
}

/**
 * Successful response from getting a single summary file.
 */
export interface GetSummaryResponse {
  success: true;
  /** The requested summary entry */
  summary: SummaryHistoryEntry;
}

/**
 * Error response from summary file endpoints.
 */
export interface SummaryErrorResponse {
  success: false;
  /** Description of what went wrong */
  error: string;
}

/**
 * Request payload for saving a summary file.
 * Used internally by the auto-mode service when saving agent output summaries.
 */
export interface SaveSummaryRequest {
  /** Path to the project */
  projectPath: string;
  /** ID of the feature */
  featureId: string;
  /** The summary content (markdown) to save */
  summary: string;
  /** Optional ISO timestamp (defaults to current time if not provided) */
  timestamp?: string;
}

export interface FeatureImagePath {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  [key: string]: unknown;
}

export interface FeatureTextFilePath {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  content: string; // Text content of the file
  [key: string]: unknown;
}

export interface ExecutionMetrics {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  totalCostUSD: number;
  numTurns: number;
  durationMs: number;
  durationApiMs: number;
  modelUsage: Record<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
      costUSD: number;
    }
  >;
  skillsUsed: string[];
  subagentsSpawned: number;
  /**
   * Spawn-ordered roll-up of the run's sub-agents, so a completed feature can
   * show its tree shape without reading the logs/agent-tree.json sidecar.
   * Master is not included; `subagentsSpawned` remains the count of every Task
   * block at any depth and is what the board still renders.
   */
  subagents?: SubagentSummary[];
  skillsLoaded: string[];
  agentsLoaded: string[];
  updatedAt: string;
  /** Whether the execution used an API key or CLI subscription login */
  authMethod?: 'cli' | 'api_key' | 'unknown';
}

/**
 * One choice offered for an AgentQuestion, recorded verbatim at ask time so
 * the resolved question can still show what the alternatives were.
 */
export interface AgentQuestionOption {
  /** Stable within the question. The answer records ids, not labels. */
  id: string;
  /** Display text, 1-5 words. */
  label: string;
  /** What picking this option means or implies. */
  description?: string;
}

/**
 * A question an agent needs the user to answer before it can finish its job.
 *
 * Questions live on the feature itself so the task view can show them, track
 * which are still outstanding, and collect answers without a live agent
 * session being attached. The GitHub issue drafter is the first producer:
 * when a task description is too thin to write an issue from, it asks here
 * rather than guessing.
 */
export interface AgentQuestion {
  id: string;
  /** Which agent asked. Used to route the answer back. */
  source: 'issue-draft' | 'planning' | 'implementation' | string;
  /**
   * 1-based, monotonic per feature and never reused, so the UI can say
   * "Question 3" and mean it.
   *
   * Optional because every question already on disk predates it; the UI falls
   * back to the askedAt-ordered index + 1.
   */
  number?: number;
  question: string;
  /** Very short chip label, max 12 chars. Mirrors the SDK's AskUserQuestion `header`. */
  header?: string;
  /**
   * Legacy plain-string suggestions. Kept because feature.json files on disk
   * carry it; read it as `choices` when `choices` is absent.
   */
  options?: string[];
  /** The choices actually offered, recorded at ask time. Supersedes `options`. */
  choices?: AgentQuestionOption[];
  /**
   * Whether an "Other…" free-text path was offered. Defaults to true — the user
   * always gets one, which is why the asking agent must never invent its own.
   */
  allowCustomAnswer?: boolean;
  /** Whether more than one choice could be picked. */
  multiSelect?: boolean;
  /** ISO timestamp when the question was raised */
  askedAt: string;
  /** The user's answer. Absent while the question is still outstanding. */
  answer?: string;
  /**
   * How the answer was given. Derived server-side from what was submitted —
   * never taken from the client.
   */
  answerSource?: 'option' | 'custom' | 'skipped';
  /** Populated only when `answerSource === 'option'`. */
  selectedOptionIds?: string[];
  /** ISO timestamp when the user answered */
  answeredAt?: string;
  /** Set when the question was dismissed instead of answered */
  skipped?: boolean;
  /**
   * Stamped when the run that asked ended without an answer, so a question
   * nobody can act on any more stops counting as outstanding.
   */
  expiredAt?: string;
}

/** Lifecycle of the background "file a GitHub issue for this task" job. */
export type GitHubIssueDraftStatus =
  | 'pending'
  | 'drafting'
  | 'awaiting_clarification'
  | 'creating'
  | 'created'
  | 'skipped'
  | 'failed';

/**
 * State of the background GitHub issue creation kicked off when a task is added.
 *
 * The task is free to plan and create its branch while this runs; only the
 * commit waits on it (see AutoModeService.commitFeature).
 */
export interface GitHubIssueDraft {
  status: GitHubIssueDraftStatus;
  /** ISO timestamp when the draft job started */
  startedAt?: string;
  /** ISO timestamp when the job reached a terminal state */
  finishedAt?: string;
  /** Failure reason when status is 'failed' */
  error?: string;
  /** Why the job was skipped (e.g. no GitHub remote) */
  skipReason?: string;
  /** How many times the drafter has asked for clarification */
  clarificationRounds?: number;
}

/** Recorded outcome of one pipeline step for one feature. */
export interface PipelineStepProgress {
  stepId: string;
  stepName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
}

export interface Feature {
  id: string;
  title?: string;
  titleGenerating?: boolean;
  category: string;
  description: string;
  passes?: boolean;
  priority?: number;
  status?: string;
  dependencies?: string[];
  waitForDependencies?: boolean; // If true, this feature won't start until all dependencies are completed/verified
  spec?: string;
  model?: string;
  imagePaths?: Array<string | FeatureImagePath | { path: string; [key: string]: unknown }>;
  textFilePaths?: FeatureTextFilePath[];
  // Branch info - worktree path is derived at runtime from branchName
  branchName?: string; // Name of the feature branch (undefined = use current worktree)
  skipTests?: boolean;
  // Build verification
  buildRequired?: boolean; // When true, run build commands after agent finishes
  buildRetryCount?: number; // Current build retry count
  maxBuildRetries?: number; // Per-feature max retries override
  buildError?: string; // Last build failure message
  thinkingLevel?: ThinkingLevel;
  reasoningEffort?: ReasoningEffort;
  enableSubagents?: boolean;
  selectedAgents?: string[]; // Specific agent names to load (when empty + enableSubagents, loads all)
  selectedContextFiles?: string[]; // Specific context file names to load (when empty, loads all enabled)
  enableSkills?: boolean;
  requireApproval?: boolean; // If true, pause after planning and wait for user to approve the plan before implementation
  executionMetrics?: ExecutionMetrics;
  planSpec?: {
    status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
    content?: string;
    version: number;
    generatedAt?: string;
    approvedAt?: string;
    reviewedByUser: boolean;
    tasksCompleted?: number;
    tasksTotal?: number;
    currentTaskId?: string;
    tasks?: Array<{
      id: string;
      description: string;
      filePath?: string;
      phase?: string;
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      startedAt?: string;
      completedAt?: string;
    }>;
  };
  /**
   * Per-step record of a pipeline run.
   *
   * Without this, completion is inferred from `step.order < currentStep.order`,
   * which is only true within one uninterrupted sequential run — anything that
   * resumes or reorders reports steps as done that never executed.
   */
  pipelineProgress?: PipelineStepProgress[];
  error?: string;
  summary?: string;
  summaryHistory?: SummaryHistoryEntry[]; // History of summaries with timestamps for dropdown display
  startedAt?: string;
  completedAt?: string; // ISO timestamp when the feature was completed/archived
  updatedAt?: string; // ISO timestamp when the feature was last updated
  owner?: FeatureOwner; // Git user identity who started/owns this feature
  remoteModified?: boolean; // True if this feature was modified by another team member
  remoteModifiedBy?: FeatureOwner; // The team member who last modified this feature remotely
  remoteModifiedAt?: string; // ISO timestamp when the feature was last modified remotely
  descriptionHistory?: DescriptionHistoryEntry[]; // History of description changes
  // Favorites
  isFavorite?: boolean; // Whether this feature is marked as a favorite for quick access
  // Deploy settings
  autoDeploy?: boolean; // Whether to auto-deploy when feature completes
  // GitHub Issue collaboration
  githubIssue?: {
    number: number;
    url: string;
    assignees: string[]; // GitHub usernames currently assigned
    labels: string[];
    state: 'open' | 'closed';
    syncedAt?: string; // ISO timestamp of last sync from GitHub
  };
  claimedBy?: string; // GitHub username of the person who claimed this feature
  claimedAt?: string; // ISO timestamp when the feature was claimed
  /** Background "file an issue for this task" job state. Gates commits. */
  githubIssueDraft?: GitHubIssueDraft;
  /** Outstanding and answered agent questions, shown in the task view */
  agentQuestions?: AgentQuestion[];
  // Archiving — deleting a task archives it instead of removing it from disk
  archivedAt?: string; // ISO timestamp when the feature was archived
  archivedFrom?: string; // The status the feature held before it was archived
  // Adaptive planning
  complexity?: ComplexityLevel; // Assessed complexity level (auto-detected or manual override)
  planningMode?: PlanningMode; // Which planning mode was used/is active (can escalate mid-execution)
  [key: string]: unknown; // Keep catch-all for extensibility
}

export type FeatureStatus = 'pending' | 'running' | 'completed' | 'failed';

/** Feature complexity level — determines planning depth */
export type ComplexityLevel = 'trivial' | 'simple' | 'moderate' | 'complex';

/** Planning mode — which planning prompt depth is in use */
export type PlanningMode = 'lite' | 'liteWithApproval' | 'spec' | 'full';

// ── Feature List Summary Types ──────────────────────────────────────────────

/**
 * Lightweight feature summary for list views.
 * Contains only the fields needed for displaying features in a list,
 * omitting heavy fields like description, spec, descriptionHistory, etc.
 */
export interface FeatureListSummary {
  id: string;
  title?: string;
  titleGenerating?: boolean;
  category: string;
  status?: string;
  priority?: number;
  isFavorite?: boolean;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  branchName?: string;
  buildRequired?: boolean;
  error?: string;
  startedAt?: string;
  updatedAt?: string;
  /** Number of images attached to the feature (count only, not full paths) */
  imagePathsCount: number;
  /**
   * How many agent questions are still unanswered.
   *
   * Carried in the summary so the board can flag a blocked task during the
   * fast list load, before the full features arrive.
   */
  pendingQuestionCount?: number;
  /** GitHub issue claim state for collaboration */
  githubIssue?: {
    number: number;
    url: string;
    assignees: string[];
    labels: string[];
    state: 'open' | 'closed';
    syncedAt?: string;
  };
  claimedBy?: string;
  claimedAt?: string;
}

/**
 * Request payload for listing feature summaries.
 * Used by POST /api/features/list-summaries
 */
export interface ListFeatureSummariesRequest {
  /** Path to the project */
  projectPath: string;
}

/**
 * Successful response from listing feature summaries.
 * Returns lightweight feature data sorted by creation order.
 */
export interface ListFeatureSummariesResponse {
  success: true;
  /** Array of lightweight feature summaries sorted by creation order */
  features: FeatureListSummary[];
}
