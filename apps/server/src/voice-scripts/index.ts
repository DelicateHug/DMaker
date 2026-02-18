/**
 * Voice Scripts Index - Script Registry and Command Dispatcher
 *
 * This module provides a centralized registry for all voice command scripts
 * and a dispatcher that routes commands to the appropriate script handler.
 *
 * The dispatcher is designed to be used by the voice command interpreter (T015)
 * which will parse natural language into structured commands and use this
 * dispatcher to execute them.
 *
 * Key concepts:
 * - VoiceScript: A function that handles a specific voice command
 * - ScriptRegistry: Maps command names to their handler functions
 * - CommandDispatcher: Routes commands to scripts and handles execution
 */

import type { VoiceCommandResult } from '@automaker/types';
import type { FeatureLoader } from '../services/feature-loader.js';
import { createLogger } from '@automaker/utils';

// ============================================================================
// Re-export types and scripts from individual modules
// ============================================================================

// Export all scripts from list-features module
export {
  listFeatures,
  getFeatureCount,
  getFeatureSummary,
  type ListFeaturesOptions,
  type VoiceScriptContext,
} from './list-features.js';

// Export all scripts from search-features module
export {
  searchFeatures,
  findFeaturesByKeywords,
  getFeatureByIdentifier,
  type SearchFeaturesOptions,
} from './search-features.js';

// Export all scripts from check-status module
export {
  checkFeatureStatus,
  getProjectStatus,
  getFeaturesByStatus,
  getInProgressFeatures,
  getFailedFeatures,
  getRecentActivity,
  type CheckStatusOptions,
} from './check-status.js';

// Export all scripts from run-tests module
export {
  runTests,
  runTestsForFeature,
  getTestStatus,
  runAllTests,
  runUnitTests,
  runE2ETests,
  runTestsWithPattern,
  type RunTestsOptions,
  type TestRunResult,
  type TestRunner,
} from './run-tests.js';

// Export all scripts from feature-management module
export {
  createFeature,
  updateFeature,
  updateFeatureStatus,
  toggleFeatureFavorite,
  deleteFeature,
  bulkUpdateStatus,
  moveFeatureToCategory,
  renameFeature,
  type CreateFeatureOptions,
  type UpdateFeatureOptions,
  type DeleteFeatureOptions,
  type BulkStatusUpdateOptions,
} from './feature-management.js';

// ============================================================================
// Types
// ============================================================================

const logger = createLogger('VoiceScripts:Dispatcher');

/**
 * Voice script handler function signature
 *
 * Scripts receive a context object and optional parameters,
 * and return a promise that resolves to a VoiceCommandResult
 */
export type VoiceScriptHandler = (
  context: VoiceScriptContextType,
  ...args: unknown[]
) => Promise<VoiceCommandResult>;

/**
 * Voice script context type (re-import from list-features for internal use)
 */
import type { VoiceScriptContext as VoiceScriptContextType } from './list-features.js';

/**
 * Script metadata for the registry
 */
export interface ScriptMetadata {
  /** Unique identifier for the command */
  name: string;
  /** Human-readable description */
  description: string;
  /** Example phrases that trigger this command */
  examples: string[];
  /** The handler function */
  handler: VoiceScriptHandler;
  /** Whether this command is destructive (requires confirmation) */
  destructive?: boolean;
  /** Parameter descriptions for help text */
  parameters?: {
    name: string;
    description: string;
    required: boolean;
    type: 'string' | 'number' | 'boolean' | 'array';
  }[];
  /** Aliases for this command */
  aliases?: string[];
  /** Category for grouping in help */
  category: 'features' | 'search' | 'status' | 'tests' | 'management' | 'system';
}

/**
 * Command dispatch request
 */
export interface DispatchRequest {
  /** Command name to execute */
  commandName: string;
  /** Context for the command */
  context: VoiceScriptContextType;
  /** Arguments to pass to the command handler */
  args?: unknown[];
}

/**
 * Command dispatch result
 */
export interface DispatchResult {
  /** Whether the command was found and executed */
  dispatched: boolean;
  /** The result from the command handler (if executed) */
  result?: VoiceCommandResult;
  /** Error message if dispatch failed */
  error?: string;
  /** The matched command name (may differ from input if alias was used) */
  matchedCommand?: string;
}

// ============================================================================
// Import handlers from modules
// ============================================================================

import { listFeatures, getFeatureCount, getFeatureSummary } from './list-features.js';

import {
  searchFeatures,
  findFeaturesByKeywords,
  getFeatureByIdentifier,
} from './search-features.js';

import {
  checkFeatureStatus,
  getProjectStatus,
  getFeaturesByStatus,
  getInProgressFeatures,
  getFailedFeatures,
  getRecentActivity,
} from './check-status.js';

import {
  runTests,
  runTestsForFeature,
  getTestStatus,
  runAllTests,
  runUnitTests,
  runE2ETests,
  runTestsWithPattern,
} from './run-tests.js';

import {
  createFeature,
  updateFeature,
  updateFeatureStatus,
  toggleFeatureFavorite,
  deleteFeature,
  bulkUpdateStatus,
  moveFeatureToCategory,
  renameFeature,
} from './feature-management.js';

// ============================================================================
// Script Registry
// ============================================================================

/**
 * Registry of all available voice scripts
 *
 * Each entry maps a command name to its metadata and handler.
 * Commands can have aliases for more natural voice interaction.
 */
export const scriptRegistry: Map<string, ScriptMetadata> = new Map();

/**
 * Alias lookup table for quick command resolution
 */
const aliasRegistry: Map<string, string> = new Map();

/**
 * Register a script in the registry
 */
function registerScript(metadata: ScriptMetadata): void {
  scriptRegistry.set(metadata.name, metadata);

  // Register aliases
  if (metadata.aliases) {
    for (const alias of metadata.aliases) {
      aliasRegistry.set(alias, metadata.name);
    }
  }

  logger.debug(`Registered script: ${metadata.name}`);
}

// ============================================================================
// Register all scripts
// ============================================================================

// --- Features Category ---

registerScript({
  name: 'list-features',
  description: 'List all features in the project with optional filtering',
  examples: ['list all features', 'show my features', 'what features do I have'],
  handler: listFeatures as VoiceScriptHandler,
  category: 'features',
  parameters: [
    { name: 'status', description: 'Filter by status', required: false, type: 'string' },
    { name: 'category', description: 'Filter by category', required: false, type: 'string' },
    { name: 'limit', description: 'Maximum number to list', required: false, type: 'number' },
    { name: 'favoritesOnly', description: 'Only show favorites', required: false, type: 'boolean' },
  ],
  aliases: ['show-features', 'get-features'],
});

registerScript({
  name: 'get-feature-count',
  description: 'Get a count of features, optionally filtered by status',
  examples: [
    'how many features do I have',
    'count pending features',
    'how many features are completed',
  ],
  handler: getFeatureCount as VoiceScriptHandler,
  category: 'features',
  parameters: [
    { name: 'status', description: 'Filter by status', required: false, type: 'string' },
  ],
  aliases: ['count-features', 'feature-count'],
});

registerScript({
  name: 'get-feature-summary',
  description: 'Get a summary of all features grouped by status',
  examples: ['give me a summary', 'summarize my features', "what's the status of my features"],
  handler: getFeatureSummary as VoiceScriptHandler,
  category: 'features',
  aliases: ['feature-summary', 'summary'],
});

// --- Search Category ---

registerScript({
  name: 'search-features',
  description: 'Search features by title and/or description',
  examples: [
    'search for features about login',
    'find features with authentication',
    'look for user registration',
  ],
  handler: searchFeatures as VoiceScriptHandler,
  category: 'search',
  parameters: [
    { name: 'query', description: 'Search query', required: true, type: 'string' },
    { name: 'status', description: 'Filter by status', required: false, type: 'string' },
    { name: 'category', description: 'Filter by category', required: false, type: 'string' },
    { name: 'limit', description: 'Maximum results', required: false, type: 'number' },
  ],
  aliases: ['find-features', 'search'],
});

registerScript({
  name: 'find-features-by-keywords',
  description: 'Find features matching any or all of the provided keywords',
  examples: [
    'find features about authentication or login',
    'search for features with API and database',
  ],
  handler: findFeaturesByKeywords as VoiceScriptHandler,
  category: 'search',
  parameters: [
    { name: 'keywords', description: 'Keywords to search for', required: true, type: 'array' },
    {
      name: 'matchAll',
      description: 'Require all keywords to match',
      required: false,
      type: 'boolean',
    },
  ],
  aliases: ['keyword-search'],
});

registerScript({
  name: 'get-feature-by-identifier',
  description: 'Get a feature by ID or exact title',
  examples: [
    'show me the login feature',
    'get feature 123',
    'what is the user authentication feature',
  ],
  handler: getFeatureByIdentifier as VoiceScriptHandler,
  category: 'search',
  parameters: [
    { name: 'identifier', description: 'Feature ID or title', required: true, type: 'string' },
  ],
  aliases: ['get-feature', 'show-feature'],
});

// --- Status Category ---

registerScript({
  name: 'check-feature-status',
  description: 'Check the status of a specific feature',
  examples: [
    "what's the status of the login feature",
    'check status of feature 123',
    'how is the authentication feature doing',
  ],
  handler: checkFeatureStatus as VoiceScriptHandler,
  category: 'status',
  parameters: [
    { name: 'identifier', description: 'Feature ID or title', required: true, type: 'string' },
  ],
  aliases: ['feature-status', 'status-of'],
});

registerScript({
  name: 'get-project-status',
  description: 'Get overall project status with feature counts by status',
  examples: ["what's the project status", 'how are my features doing', 'project overview'],
  handler: getProjectStatus as VoiceScriptHandler,
  category: 'status',
  aliases: ['project-status', 'overview'],
});

registerScript({
  name: 'get-features-by-status',
  description: 'List all features with a specific status',
  examples: ['show me completed features', 'what features are pending', 'list running features'],
  handler: getFeaturesByStatus as VoiceScriptHandler,
  category: 'status',
  parameters: [
    { name: 'status', description: 'Status to filter by', required: true, type: 'string' },
    { name: 'limit', description: 'Maximum results', required: false, type: 'number' },
  ],
  aliases: ['features-by-status'],
});

registerScript({
  name: 'get-in-progress-features',
  description: 'Get all features currently in progress',
  examples: ["what's currently running", 'show active features', 'in progress features'],
  handler: getInProgressFeatures as VoiceScriptHandler,
  category: 'status',
  aliases: ['running-features', 'active-features', 'in-progress'],
});

registerScript({
  name: 'get-failed-features',
  description: 'Get all features that have failed',
  examples: ['what failed', 'show me errors', 'failed features'],
  handler: getFailedFeatures as VoiceScriptHandler,
  category: 'status',
  aliases: ['failed', 'errors'],
});

registerScript({
  name: 'get-recent-activity',
  description: 'Get features that were recently started or updated',
  examples: ["what's been happening", 'show recent activity', 'recent features'],
  handler: getRecentActivity as VoiceScriptHandler,
  category: 'status',
  parameters: [
    { name: 'limit', description: 'Number of recent features', required: false, type: 'number' },
  ],
  aliases: ['recent', 'activity', 'recent-features'],
});

// --- Tests Category ---

registerScript({
  name: 'run-tests',
  description: 'Run tests with optional filtering and configuration',
  examples: ['run tests', 'run playwright tests', 'execute tests'],
  handler: runTests as VoiceScriptHandler,
  category: 'tests',
  parameters: [
    { name: 'testPattern', description: 'Test file pattern', required: false, type: 'string' },
    { name: 'runner', description: 'Test runner to use', required: false, type: 'string' },
    { name: 'headed', description: 'Run in headed mode', required: false, type: 'boolean' },
    { name: 'grep', description: 'Grep pattern', required: false, type: 'string' },
  ],
  aliases: ['test', 'execute-tests'],
});

registerScript({
  name: 'run-tests-for-feature',
  description: 'Run tests related to a specific feature',
  examples: ['run tests for the login feature', 'test feature 123', 'run login tests'],
  handler: runTestsForFeature as VoiceScriptHandler,
  category: 'tests',
  parameters: [
    { name: 'identifier', description: 'Feature ID or title', required: true, type: 'string' },
    { name: 'headed', description: 'Run in headed mode', required: false, type: 'boolean' },
  ],
  aliases: ['test-feature', 'feature-tests'],
});

registerScript({
  name: 'get-test-status',
  description: 'Check available tests without running them',
  examples: ["what's the test status", 'how many tests do I have', 'test count'],
  handler: getTestStatus as VoiceScriptHandler,
  category: 'tests',
  aliases: ['test-status', 'test-count'],
});

registerScript({
  name: 'run-all-tests',
  description: 'Run all tests with default settings',
  examples: ['run all tests', 'run the tests', 'test everything'],
  handler: runAllTests as VoiceScriptHandler,
  category: 'tests',
  aliases: ['all-tests'],
});

registerScript({
  name: 'run-unit-tests',
  description: 'Run unit tests using Vitest',
  examples: ['run unit tests', 'run vitest', 'unit tests'],
  handler: runUnitTests as VoiceScriptHandler,
  category: 'tests',
  aliases: ['unit-tests', 'vitest'],
});

registerScript({
  name: 'run-e2e-tests',
  description: 'Run end-to-end tests using Playwright',
  examples: ['run e2e tests', 'run end to end tests', 'e2e tests'],
  handler: runE2ETests as VoiceScriptHandler,
  category: 'tests',
  parameters: [
    { name: 'headed', description: 'Run in headed mode', required: false, type: 'boolean' },
  ],
  aliases: ['e2e-tests', 'e2e', 'end-to-end'],
});

registerScript({
  name: 'run-tests-with-pattern',
  description: 'Run tests matching a specific pattern',
  examples: ['run tests matching login', 'run authentication tests', 'test pattern user'],
  handler: runTestsWithPattern as VoiceScriptHandler,
  category: 'tests',
  parameters: [
    { name: 'pattern', description: 'Test pattern to match', required: true, type: 'string' },
  ],
  aliases: ['pattern-tests'],
});

// --- Management Category ---

registerScript({
  name: 'create-feature',
  description: 'Create a new feature with the specified title and details',
  examples: [
    'create a new feature called user authentication',
    'add a feature for login page',
    'new feature user registration',
  ],
  handler: createFeature as VoiceScriptHandler,
  category: 'management',
  parameters: [
    { name: 'title', description: 'Feature title', required: true, type: 'string' },
    { name: 'description', description: 'Feature description', required: false, type: 'string' },
    { name: 'category', description: 'Feature category', required: false, type: 'string' },
    { name: 'status', description: 'Initial status', required: false, type: 'string' },
  ],
  aliases: ['new-feature', 'add-feature'],
});

registerScript({
  name: 'update-feature',
  description: 'Update an existing feature with new values',
  examples: [
    'update the login feature description',
    'change the status of feature 123',
    'modify user authentication',
  ],
  handler: updateFeature as VoiceScriptHandler,
  category: 'management',
  parameters: [
    { name: 'identifier', description: 'Feature ID or title', required: true, type: 'string' },
    { name: 'updates', description: 'Updates to apply', required: true, type: 'string' },
  ],
  aliases: ['modify-feature', 'change-feature'],
});

registerScript({
  name: 'update-feature-status',
  description: 'Update just the status of a feature',
  examples: [
    'mark login feature as completed',
    'set feature 123 to running',
    'change status to pending',
  ],
  handler: updateFeatureStatus as VoiceScriptHandler,
  category: 'management',
  parameters: [
    { name: 'identifier', description: 'Feature ID or title', required: true, type: 'string' },
    { name: 'status', description: 'New status', required: true, type: 'string' },
  ],
  aliases: ['set-status', 'mark-status'],
});

registerScript({
  name: 'toggle-feature-favorite',
  description: 'Toggle the favorite status of a feature',
  examples: ['favorite the login feature', 'unfavorite feature 123', 'star user authentication'],
  handler: toggleFeatureFavorite as VoiceScriptHandler,
  category: 'management',
  parameters: [
    { name: 'identifier', description: 'Feature ID or title', required: true, type: 'string' },
    {
      name: 'setFavorite',
      description: 'Explicit favorite value',
      required: false,
      type: 'boolean',
    },
  ],
  aliases: ['favorite', 'star', 'unfavorite', 'unstar'],
});

registerScript({
  name: 'delete-feature',
  description: 'Delete a feature (requires confirmation)',
  examples: ['delete feature 123', 'remove the login feature', 'delete user authentication'],
  handler: deleteFeature as VoiceScriptHandler,
  category: 'management',
  destructive: true,
  parameters: [
    { name: 'identifier', description: 'Feature ID or title', required: true, type: 'string' },
    {
      name: 'confirmed',
      description: 'Whether deletion is confirmed',
      required: false,
      type: 'boolean',
    },
  ],
  aliases: ['remove-feature'],
});

registerScript({
  name: 'bulk-update-status',
  description: 'Update the status of multiple features (requires confirmation)',
  examples: [
    'mark all pending features as running',
    'set all features in category X to completed',
    'update all failed to pending',
  ],
  handler: bulkUpdateStatus as VoiceScriptHandler,
  category: 'management',
  destructive: true,
  parameters: [
    { name: 'targetStatus', description: 'Status to set', required: true, type: 'string' },
    {
      name: 'currentStatus',
      description: 'Filter by current status',
      required: false,
      type: 'string',
    },
    { name: 'category', description: 'Filter by category', required: false, type: 'string' },
    {
      name: 'confirmed',
      description: 'Whether update is confirmed',
      required: false,
      type: 'boolean',
    },
  ],
  aliases: ['batch-update', 'bulk-status'],
});

registerScript({
  name: 'move-feature-to-category',
  description: 'Move a feature to a different category',
  examples: [
    'move login feature to authentication category',
    'put feature 123 in UI',
    'change category of user registration',
  ],
  handler: moveFeatureToCategory as VoiceScriptHandler,
  category: 'management',
  parameters: [
    { name: 'identifier', description: 'Feature ID or title', required: true, type: 'string' },
    { name: 'category', description: 'Target category', required: true, type: 'string' },
  ],
  aliases: ['move-to-category', 'change-category'],
});

registerScript({
  name: 'rename-feature',
  description: 'Rename a feature to a new title',
  examples: [
    'rename feature 123 to user login',
    'change the title of login feature',
    'rename authentication to user auth',
  ],
  handler: renameFeature as VoiceScriptHandler,
  category: 'management',
  parameters: [
    {
      name: 'identifier',
      description: 'Feature ID or current title',
      required: true,
      type: 'string',
    },
    { name: 'newTitle', description: 'New title', required: true, type: 'string' },
  ],
  aliases: ['change-title'],
});

// ============================================================================
// Command Dispatcher
// ============================================================================

/**
 * Resolve a command name to its canonical form
 *
 * Handles aliases by looking them up in the alias registry
 */
export function resolveCommandName(commandName: string): string | null {
  const normalizedName = commandName.toLowerCase().trim();

  // Check direct match
  if (scriptRegistry.has(normalizedName)) {
    return normalizedName;
  }

  // Check alias
  const aliasedName = aliasRegistry.get(normalizedName);
  if (aliasedName && scriptRegistry.has(aliasedName)) {
    return aliasedName;
  }

  return null;
}

/**
 * Get metadata for a command by name or alias
 */
export function getCommandMetadata(commandName: string): ScriptMetadata | null {
  const resolved = resolveCommandName(commandName);
  return resolved ? scriptRegistry.get(resolved) || null : null;
}

/**
 * Check if a command exists in the registry
 */
export function hasCommand(commandName: string): boolean {
  return resolveCommandName(commandName) !== null;
}

/**
 * Get all registered commands
 */
export function getAllCommands(): ScriptMetadata[] {
  return Array.from(scriptRegistry.values());
}

/**
 * Get commands by category
 */
export function getCommandsByCategory(category: ScriptMetadata['category']): ScriptMetadata[] {
  return Array.from(scriptRegistry.values()).filter((meta) => meta.category === category);
}

/**
 * Get all destructive commands (those requiring confirmation)
 */
export function getDestructiveCommands(): ScriptMetadata[] {
  return Array.from(scriptRegistry.values()).filter((meta) => meta.destructive === true);
}

/**
 * Dispatch a voice command to its handler
 *
 * This is the main entry point for executing voice commands.
 * It resolves the command name, validates it exists, and calls the handler.
 *
 * @param request - The dispatch request containing command name, context, and args
 * @returns A dispatch result indicating success/failure and the command result
 */
export async function dispatchCommand(request: DispatchRequest): Promise<DispatchResult> {
  const { commandName, context, args = [] } = request;

  // Resolve command name (handles aliases)
  const resolvedName = resolveCommandName(commandName);

  if (!resolvedName) {
    logger.warn(`Unknown command: ${commandName}`);
    return {
      dispatched: false,
      error: `Unknown command: "${commandName}". Use 'help' to see available commands.`,
    };
  }

  const metadata = scriptRegistry.get(resolvedName);
  if (!metadata) {
    logger.error(`Command resolved but metadata not found: ${resolvedName}`);
    return {
      dispatched: false,
      error: `Internal error: command metadata not found for "${resolvedName}"`,
    };
  }

  logger.info(`Dispatching command: ${resolvedName}`, { args });

  try {
    // Execute the handler
    const result = await metadata.handler(context, ...args);

    logger.info(`Command completed: ${resolvedName}`, { success: result.success });

    return {
      dispatched: true,
      result,
      matchedCommand: resolvedName,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error(`Command execution failed: ${resolvedName}`, error);

    return {
      dispatched: true,
      matchedCommand: resolvedName,
      result: {
        success: false,
        response: `Command "${resolvedName}" failed: ${errorMessage}`,
        commandName: resolvedName,
        error: errorMessage,
      },
    };
  }
}

/**
 * Get help text for a specific command or all commands
 *
 * @param commandName - Optional command name to get help for
 * @returns Formatted help text
 */
export function getHelpText(commandName?: string): string {
  if (commandName) {
    const metadata = getCommandMetadata(commandName);
    if (!metadata) {
      return `Unknown command: "${commandName}". Use 'help' without arguments to see all commands.`;
    }

    const lines: string[] = [
      `## ${metadata.name}`,
      '',
      metadata.description,
      '',
      '### Examples',
      ...metadata.examples.map((ex) => `- "${ex}"`),
    ];

    if (metadata.parameters && metadata.parameters.length > 0) {
      lines.push('', '### Parameters');
      for (const param of metadata.parameters) {
        const required = param.required ? '(required)' : '(optional)';
        lines.push(`- **${param.name}** ${required}: ${param.description}`);
      }
    }

    if (metadata.aliases && metadata.aliases.length > 0) {
      lines.push('', `### Aliases: ${metadata.aliases.join(', ')}`);
    }

    if (metadata.destructive) {
      lines.push('', '*This command requires confirmation.*');
    }

    return lines.join('\n');
  }

  // Generate help for all commands grouped by category
  const categories: Record<ScriptMetadata['category'], ScriptMetadata[]> = {
    features: [],
    search: [],
    status: [],
    tests: [],
    management: [],
    system: [],
  };

  for (const metadata of scriptRegistry.values()) {
    categories[metadata.category].push(metadata);
  }

  const lines: string[] = ['# Available Voice Commands', ''];

  const categoryNames: Record<ScriptMetadata['category'], string> = {
    features: 'Feature Listing',
    search: 'Search',
    status: 'Status Checks',
    tests: 'Testing',
    management: 'Feature Management',
    system: 'System',
  };

  for (const [category, commands] of Object.entries(categories)) {
    if (commands.length === 0) continue;

    lines.push(`## ${categoryNames[category as ScriptMetadata['category']]}`);
    lines.push('');

    for (const cmd of commands) {
      const destructiveNote = cmd.destructive ? ' *' : '';
      lines.push(`- **${cmd.name}**${destructiveNote}: ${cmd.description}`);
    }

    lines.push('');
  }

  lines.push('---');
  lines.push('_* Requires confirmation_');

  return lines.join('\n');
}

/**
 * Create a context object for voice script execution
 *
 * Utility function to create a properly typed VoiceScriptContext
 *
 * @param projectPath - Path to the project
 * @param sessionId - Voice session ID
 * @param featureLoader - Feature loader service instance
 * @param parameters - Optional additional parameters
 * @returns A VoiceScriptContext object
 */
export function createScriptContext(
  projectPath: string,
  sessionId: string,
  featureLoader: FeatureLoader,
  parameters?: Record<string, unknown>
): VoiceScriptContextType {
  return {
    projectPath,
    sessionId,
    featureLoader,
    parameters,
  };
}

// ============================================================================
// Registry Statistics
// ============================================================================

/**
 * Get statistics about the registered scripts
 */
export function getRegistryStats(): {
  totalCommands: number;
  totalAliases: number;
  destructiveCommands: number;
  commandsByCategory: Record<string, number>;
} {
  const commandsByCategory: Record<string, number> = {};

  for (const metadata of scriptRegistry.values()) {
    commandsByCategory[metadata.category] = (commandsByCategory[metadata.category] || 0) + 1;
  }

  return {
    totalCommands: scriptRegistry.size,
    totalAliases: aliasRegistry.size,
    destructiveCommands: getDestructiveCommands().length,
    commandsByCategory,
  };
}

logger.info(
  `Voice script registry initialized with ${scriptRegistry.size} commands and ${aliasRegistry.size} aliases`
);
