/**
 * Feature types for AutoMaker feature management
 */

import type { PlanningMode, ThinkingLevel } from './settings.js';
import type { ReasoningEffort } from './provider.js';

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
 *   {projectPath}/.automaker/features/{featureId}/summaries/{timestamp}.md
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
  thinkingLevel?: ThinkingLevel;
  reasoningEffort?: ReasoningEffort;
  planningMode?: PlanningMode;
  requirePlanApproval?: boolean;
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
    }>;
  };
  error?: string;
  summary?: string;
  summaryHistory?: SummaryHistoryEntry[]; // History of summaries with timestamps for dropdown display
  startedAt?: string;
  completedAt?: string; // ISO timestamp when the feature was completed/archived
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
  [key: string]: unknown; // Keep catch-all for extensibility
}

export type FeatureStatus = 'pending' | 'running' | 'completed' | 'failed';

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
  error?: string;
  startedAt?: string;
  /** Number of images attached to the feature (count only, not full paths) */
  imagePathsCount: number;
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
