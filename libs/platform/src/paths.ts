/**
 * Automaker Paths - Utilities for managing automaker data storage
 *
 * Provides functions to construct paths for:
 * - Project-level data stored in {projectPath}/.automaker/
 * - Global user data stored in app userData directory
 *
 * All returned paths are absolute and ready to use with fs module.
 * Directory creation is handled separately by ensure* functions.
 */

import * as secureFs from './secure-fs.js';
import path from 'path';

/**
 * Month names indexed 0-11 for mapping numeric months to lowercase strings.
 */
const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

/**
 * Regex matching the new feature-ID format: dd-MM-YYYY-<slug>
 *
 * Captures:
 *   [1] MM   - two-digit month (01-12)
 *   [2] YYYY - four-digit year
 */
const NEW_ID_RE = /^\d{2}-(\d{2})-(\d{4})-.+$/;

/**
 * Valid status directory names for the status-based folder layout.
 * Features are organized under features/{status}/{featureId}/.
 */
const STATUS_DIR_NAMES = new Set([
  'backlog',
  'in_progress',
  'waiting_approval',
  'completed',
  'verified',
]);

/**
 * Check whether a directory name is a valid status directory for the
 * status-based feature layout.
 *
 * @param dirName - Directory name to check (e.g. "backlog", "in_progress")
 * @returns true if the name is a recognised feature status
 */
export function isStatusDir(dirName: string): boolean {
  // Accept exact matches or pipeline_* prefixed names
  return STATUS_DIR_NAMES.has(dirName) || dirName.startsWith('pipeline_');
}

/**
 * Regex matching month-based directory names produced by getFeatureMonthDir().
 * Format: {YYYY}-{lowercase_month_name} (e.g. "2026-february", "2025-december")
 */
const MONTH_DIR_RE =
  /^\d{4}-(january|february|march|april|may|june|july|august|september|october|november|december)$/;

/**
 * Get the lowercase English month name for a 1-based month number.
 *
 * @param month - Month number, 1-based (1 = January, 12 = December)
 * @returns Lowercase month name (e.g. "january", "february")
 * @throws RangeError if month is outside 1-12
 *
 * @example
 * getMonthName(1)  // => "january"
 * getMonthName(12) // => "december"
 */
export function getMonthName(month: number): string {
  if (month < 1 || month > 12) {
    throw new RangeError(`month must be between 1 and 12, got ${month}`);
  }
  return MONTH_NAMES[month - 1];
}

/**
 * Check whether a directory name is a month-based feature subdirectory.
 *
 * Useful when scanning the features directory to distinguish month
 * subdirectories (which contain feature directories) from legacy flat
 * feature directories.
 *
 * @param dirName - Directory name to check (e.g. "2026-february")
 * @returns true if the name matches the {YYYY}-{monthname} pattern
 *
 * @example
 * isMonthDir('2026-february') // => true
 * isMonthDir('auth-feature')  // => false
 */
export function isMonthDir(dirName: string): boolean {
  return MONTH_DIR_RE.test(dirName);
}

/**
 * Get the automaker data directory root for a project
 *
 * All project-specific automaker data is stored under {projectPath}/.automaker/
 * This directory is created when needed via ensureAutomakerDir().
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker
 */
export function getAutomakerDir(projectPath: string): string {
  return path.join(projectPath, '.automaker');
}

/**
 * Get the features directory for a project
 *
 * Contains month-based subdirectories (e.g. "2026-february") for new-format
 * feature IDs, as well as flat feature directories for legacy IDs.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/features
 */
export function getFeaturesDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'features');
}

/**
 * Get the month-based subdirectory for a feature inside the features directory.
 *
 * For new-format IDs (dd-MM-YYYY-slug), returns the month subdirectory:
 *   {projectPath}/.automaker/features/{YYYY}-{monthname}
 *
 * For old-format IDs or IDs that don't match the new pattern, returns null
 * (meaning the feature lives directly inside the features directory).
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @returns Absolute path to the month directory, or null for legacy/flat IDs
 *
 * @example
 * // New-format ID -> month directory
 * getFeatureMonthDir('/proj', '17-02-2026-add_dark_mode')
 * // => "/proj/.automaker/features/2026-february"
 *
 * // Old-format ID -> null (flat layout)
 * getFeatureMonthDir('/proj', 'auth-feature')
 * // => null
 */
export function getFeatureMonthDir(projectPath: string, featureId: string): string | null {
  const match = NEW_ID_RE.exec(featureId);
  if (match) {
    const monthNum = parseInt(match[1], 10);
    const year = match[2];
    // Only use month-based path when the month value is valid (01-12)
    if (monthNum >= 1 && monthNum <= 12) {
      const monthDir = `${year}-${getMonthName(monthNum)}`;
      return path.join(getFeaturesDir(projectPath), monthDir);
    }
  }
  return null;
}

/**
 * Get the directory for a specific feature
 *
 * For new-format IDs (dd-MM-YYYY-slug), features are organized into
 * month-based subdirectories:
 *   {projectPath}/.automaker/features/{YYYY}-{monthname}/{featureId}
 *
 * For old-format IDs or IDs that don't match the new pattern, falls back
 * to the flat structure for backward compatibility:
 *   {projectPath}/.automaker/features/{featureId}
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @returns Absolute path to the feature directory
 *
 * @example
 * // New-format ID -> month-based directory
 * getFeatureDir('/proj', '17-02-2026-add_dark_mode')
 * // => "/proj/.automaker/features/2026-february/17-02-2026-add_dark_mode"
 *
 * // Old-format ID -> flat fallback
 * getFeatureDir('/proj', 'auth-feature')
 * // => "/proj/.automaker/features/auth-feature"
 */
export function getFeatureDir(projectPath: string, featureId: string): string {
  const monthDir = getFeatureMonthDir(projectPath, featureId);
  if (monthDir) {
    return path.join(monthDir, featureId);
  }
  // Fallback: flat structure for old IDs or invalid month values
  return path.join(getFeaturesDir(projectPath), featureId);
}

/**
 * Get the status-based subdirectory for a feature.
 *
 * Returns the path: {projectPath}/.automaker/features/{status}/{featureId}
 *
 * @param projectPath - Absolute path to project directory
 * @param status - Feature status (e.g. "backlog", "in_progress", "completed")
 * @param featureId - Feature identifier
 * @returns Absolute path to the feature directory inside its status folder
 */
export function getFeatureStatusDir(
  projectPath: string,
  status: string,
  featureId: string
): string {
  return path.join(getFeaturesDir(projectPath), status, featureId);
}

/**
 * Get the images directory for a feature
 *
 * Stores screenshots, diagrams, or other images related to the feature.
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @returns Absolute path to {projectPath}/.automaker/features/{featureId}/images
 */
export function getFeatureImagesDir(projectPath: string, featureId: string): string {
  return path.join(getFeatureDir(projectPath, featureId), 'images');
}

/**
 * Get the summaries directory for a feature
 *
 * Stores individual summary markdown files with timestamps for tracking
 * agent output summaries over time.
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @returns Absolute path to {projectPath}/.automaker/features/{featureId}/summaries
 */
export function getFeatureSummariesDir(projectPath: string, featureId: string): string {
  return path.join(getFeatureDir(projectPath, featureId), 'summaries');
}

/**
 * Get the logs directory for a feature
 *
 * Stores agent output logs such as agent-output.md and raw-output.jsonl.
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @returns Absolute path to {featureDir}/logs
 */
export function getFeatureLogsDir(projectPath: string, featureId: string): string {
  return path.join(getFeatureDir(projectPath, featureId), 'logs');
}

/**
 * Get the backups directory for a feature
 *
 * Stores backup copies of feature data (e.g. feature.json backups).
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @returns Absolute path to {featureDir}/backups
 */
export function getFeatureBackupsDir(projectPath: string, featureId: string): string {
  return path.join(getFeatureDir(projectPath, featureId), 'backups');
}

/**
 * Get the board directory for a project
 *
 * Contains board-related data like background images and customization files.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/board
 */
export function getBoardDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'board');
}

/**
 * Get the general images directory for a project
 *
 * Stores project-level images like background images or shared assets.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/images
 */
export function getImagesDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'images');
}

/**
 * Get the context files directory for a project
 *
 * Stores user-uploaded context files for reference during generation.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/context
 */
export function getContextDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'context');
}

/**
 * Get the worktrees metadata directory for a project
 *
 * Stores information about git worktrees associated with the project.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/worktrees
 */
export function getWorktreesDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'worktrees');
}

/**
 * Get the validations directory for a project
 *
 * Stores GitHub issue validation results, organized by issue number.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/validations
 */
export function getValidationsDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'validations');
}

/**
 * Get the directory for a specific issue validation
 *
 * Contains validation result and metadata for a GitHub issue.
 *
 * @param projectPath - Absolute path to project directory
 * @param issueNumber - GitHub issue number
 * @returns Absolute path to {projectPath}/.automaker/validations/{issueNumber}
 */
export function getValidationDir(projectPath: string, issueNumber: number): string {
  return path.join(getValidationsDir(projectPath), String(issueNumber));
}

/**
 * Get the validation result file path for a GitHub issue
 *
 * Stores the JSON validation result including verdict, analysis, and metadata.
 *
 * @param projectPath - Absolute path to project directory
 * @param issueNumber - GitHub issue number
 * @returns Absolute path to {projectPath}/.automaker/validations/{issueNumber}/validation.json
 */
export function getValidationPath(projectPath: string, issueNumber: number): string {
  return path.join(getValidationDir(projectPath, issueNumber), 'validation.json');
}

/**
 * Get the app spec file path for a project
 *
 * Stores the application specification document used for generation.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/app_spec.txt
 */
export function getAppSpecPath(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'app_spec.txt');
}

/**
 * Get the notifications file path for a project
 *
 * Stores project-level notifications for feature status changes and operation completions.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/notifications.json
 */
export function getNotificationsPath(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'notifications.json');
}

/**
 * Get the branch tracking file path for a project
 *
 * Stores JSON metadata about active git branches and worktrees.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/active-branches.json
 */
export function getBranchTrackingPath(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'active-branches.json');
}

/**
 * Get the execution state file path for a project
 *
 * Stores JSON metadata about auto-mode execution state for recovery on restart.
 * Tracks which features were running and auto-loop configuration.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/execution-state.json
 */
export function getExecutionStatePath(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'execution-state.json');
}

/**
 * Create the automaker directory structure for a project if it doesn't exist
 *
 * Creates {projectPath}/.automaker with all subdirectories recursively.
 * Safe to call multiple times - uses recursive: true.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Promise resolving to the created automaker directory path
 */
export async function ensureAutomakerDir(projectPath: string): Promise<string> {
  const automakerDir = getAutomakerDir(projectPath);
  await secureFs.mkdir(automakerDir, { recursive: true });
  return automakerDir;
}

// ============================================================================
// Ideation Paths
// ============================================================================

/**
 * Get the ideation directory for a project
 *
 * Contains ideas, sessions, and drafts for brainstorming.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/ideation
 */
export function getIdeationDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'ideation');
}

/**
 * Get the ideas directory for a project
 *
 * Contains subdirectories for each idea, keyed by ideaId.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/ideation/ideas
 */
export function getIdeasDir(projectPath: string): string {
  return path.join(getIdeationDir(projectPath), 'ideas');
}

/**
 * Get the directory for a specific idea
 *
 * Contains idea metadata and attachments.
 *
 * @param projectPath - Absolute path to project directory
 * @param ideaId - Idea identifier
 * @returns Absolute path to {projectPath}/.automaker/ideation/ideas/{ideaId}
 */
export function getIdeaDir(projectPath: string, ideaId: string): string {
  return path.join(getIdeasDir(projectPath), ideaId);
}

/**
 * Get the idea metadata file path
 *
 * Stores the idea JSON data.
 *
 * @param projectPath - Absolute path to project directory
 * @param ideaId - Idea identifier
 * @returns Absolute path to {projectPath}/.automaker/ideation/ideas/{ideaId}/idea.json
 */
export function getIdeaPath(projectPath: string, ideaId: string): string {
  return path.join(getIdeaDir(projectPath, ideaId), 'idea.json');
}

/**
 * Get the idea attachments directory
 *
 * Stores images and other attachments for an idea.
 *
 * @param projectPath - Absolute path to project directory
 * @param ideaId - Idea identifier
 * @returns Absolute path to {projectPath}/.automaker/ideation/ideas/{ideaId}/attachments
 */
export function getIdeaAttachmentsDir(projectPath: string, ideaId: string): string {
  return path.join(getIdeaDir(projectPath, ideaId), 'attachments');
}

/**
 * Get the ideation sessions directory for a project
 *
 * Contains conversation history for ideation sessions.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/ideation/sessions
 */
export function getIdeationSessionsDir(projectPath: string): string {
  return path.join(getIdeationDir(projectPath), 'sessions');
}

/**
 * Get the session file path for an ideation session
 *
 * Stores the session messages and metadata.
 *
 * @param projectPath - Absolute path to project directory
 * @param sessionId - Session identifier
 * @returns Absolute path to {projectPath}/.automaker/ideation/sessions/{sessionId}.json
 */
export function getIdeationSessionPath(projectPath: string, sessionId: string): string {
  return path.join(getIdeationSessionsDir(projectPath), `${sessionId}.json`);
}

/**
 * Get the ideation drafts directory for a project
 *
 * Stores unsaved conversation drafts.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/ideation/drafts
 */
export function getIdeationDraftsDir(projectPath: string): string {
  return path.join(getIdeationDir(projectPath), 'drafts');
}

/**
 * Get the project analysis result file path
 *
 * Stores the cached project analysis result.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/ideation/analysis.json
 */
export function getIdeationAnalysisPath(projectPath: string): string {
  return path.join(getIdeationDir(projectPath), 'analysis.json');
}

/**
 * Create the ideation directory structure for a project if it doesn't exist
 *
 * Creates {projectPath}/.automaker/ideation with all subdirectories.
 * Safe to call multiple times - uses recursive: true.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Promise resolving to the created ideation directory path
 */
export async function ensureIdeationDir(projectPath: string): Promise<string> {
  const ideationDir = getIdeationDir(projectPath);
  await secureFs.mkdir(ideationDir, { recursive: true });
  await secureFs.mkdir(getIdeasDir(projectPath), { recursive: true });
  await secureFs.mkdir(getIdeationSessionsDir(projectPath), { recursive: true });
  await secureFs.mkdir(getIdeationDraftsDir(projectPath), { recursive: true });
  return ideationDir;
}

// ============================================================================
// Event History Paths
// ============================================================================

/**
 * Get the event history directory for a project
 *
 * Contains stored event records for debugging and replay.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/events
 */
export function getEventHistoryDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'events');
}

/**
 * Get the event history index file path
 *
 * Stores an index of all events for quick listing without scanning directory.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/events/index.json
 */
export function getEventHistoryIndexPath(projectPath: string): string {
  return path.join(getEventHistoryDir(projectPath), 'index.json');
}

/**
 * Get the file path for a specific event
 *
 * @param projectPath - Absolute path to project directory
 * @param eventId - Event identifier
 * @returns Absolute path to {projectPath}/.automaker/events/{eventId}.json
 */
export function getEventPath(projectPath: string, eventId: string): string {
  return path.join(getEventHistoryDir(projectPath), `${eventId}.json`);
}

/**
 * Create the event history directory for a project if it doesn't exist
 *
 * @param projectPath - Absolute path to project directory
 * @returns Promise resolving to the created events directory path
 */
export async function ensureEventHistoryDir(projectPath: string): Promise<string> {
  const eventsDir = getEventHistoryDir(projectPath);
  await secureFs.mkdir(eventsDir, { recursive: true });
  return eventsDir;
}

// ============================================================================
// Global Settings Paths (stored in DATA_DIR from app.getPath('userData'))
// ============================================================================

/**
 * Get the global settings file path
 *
 * Stores user preferences, keyboard shortcuts, AI profiles, and project history.
 * Located in the platform-specific userData directory.
 *
 * Default locations:
 * - macOS: ~/Library/Application Support/automaker
 * - Windows: %APPDATA%\automaker
 * - Linux: ~/.config/automaker
 *
 * @param dataDir - User data directory (from app.getPath('userData'))
 * @returns Absolute path to {dataDir}/settings.json
 */
export function getGlobalSettingsPath(dataDir: string): string {
  return path.join(dataDir, 'settings.json');
}

/**
 * Get the credentials file path
 *
 * Stores sensitive API keys separately from other settings for security.
 * Located in the platform-specific userData directory.
 *
 * @param dataDir - User data directory (from app.getPath('userData'))
 * @returns Absolute path to {dataDir}/credentials.json
 */
export function getCredentialsPath(dataDir: string): string {
  return path.join(dataDir, 'credentials.json');
}

/**
 * Get the project settings file path
 *
 * Stores project-specific settings that override global settings.
 * Located within the project's .automaker directory.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/settings.json
 */
export function getProjectSettingsPath(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'settings.json');
}

/**
 * Create the global data directory if it doesn't exist
 *
 * Creates the userData directory for storing global settings and credentials.
 * Safe to call multiple times - uses recursive: true.
 *
 * @param dataDir - User data directory path to create
 * @returns Promise resolving to the created data directory path
 */
export async function ensureDataDir(dataDir: string): Promise<string> {
  await secureFs.mkdir(dataDir, { recursive: true });
  return dataDir;
}
