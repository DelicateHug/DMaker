/**
 * List Features Voice Script
 *
 * Handles voice commands related to listing and summarizing features.
 * This script is invoked by the voice command interpreter when the user
 * asks to "list all features", "show my features", "what features do I have", etc.
 *
 * Voice Script Pattern:
 * - Scripts receive a context object with projectPath, session info, and dependencies
 * - Scripts return a VoiceCommandResult with success status and response text
 * - Scripts should format responses for both text display and TTS readback
 */

import type { Feature, VoiceCommandResult } from '@automaker/types';
import type { FeatureLoader } from '../services/feature-loader.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('VoiceScript:ListFeatures');

/**
 * Context provided to voice scripts for execution
 */
export interface VoiceScriptContext {
  /** Path to the current project */
  projectPath: string;
  /** Session ID for the voice session */
  sessionId: string;
  /** Feature loader service for accessing features */
  featureLoader: FeatureLoader;
  /** Optional parameters extracted from the voice command */
  parameters?: Record<string, unknown>;
}

/**
 * Options for listing features
 */
export interface ListFeaturesOptions {
  /** Filter by status (e.g., 'pending', 'running', 'completed', 'failed') */
  status?: string;
  /** Filter by category */
  category?: string;
  /** Maximum number of features to list (default: all) */
  limit?: number;
  /** Include descriptions in the response */
  includeDescriptions?: boolean;
  /** Only list favorites */
  favoritesOnly?: boolean;
}

/**
 * Format a feature status for voice output
 */
function formatStatus(status?: string): string {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'running':
      return 'in progress';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'no status';
  }
}

/**
 * Format a single feature for display
 */
function formatFeatureForDisplay(feature: Feature, includeDescription: boolean): string {
  const title = feature.title || 'Untitled';
  const status = formatStatus(feature.status);
  const favorite = feature.isFavorite ? ' ⭐' : '';
  const category = feature.category !== 'Uncategorized' ? ` [${feature.category}]` : '';

  let line = `• ${title}${favorite}${category} - ${status}`;

  if (includeDescription && feature.description) {
    // Truncate description for display
    const desc =
      feature.description.length > 100
        ? feature.description.substring(0, 100) + '...'
        : feature.description;
    line += `\n  ${desc}`;
  }

  return line;
}

/**
 * Format features for TTS readback (more natural speech)
 */
function formatFeaturesForSpeech(features: Feature[], options: ListFeaturesOptions): string {
  if (features.length === 0) {
    if (options.status) {
      return `You have no ${options.status} features.`;
    }
    if (options.category) {
      return `You have no features in the ${options.category} category.`;
    }
    if (options.favoritesOnly) {
      return `You have no favorite features.`;
    }
    return `You don't have any features yet.`;
  }

  const count = features.length;
  const limitNote = options.limit && count === options.limit ? ` Here are the first ${count}` : '';

  // Build a natural language summary
  let prefix = '';
  if (options.status) {
    prefix = `You have ${count} ${options.status} feature${count === 1 ? '' : 's'}.${limitNote}`;
  } else if (options.category) {
    prefix = `You have ${count} feature${count === 1 ? '' : 's'} in ${options.category}.${limitNote}`;
  } else if (options.favoritesOnly) {
    prefix = `You have ${count} favorite feature${count === 1 ? '' : 's'}.${limitNote}`;
  } else {
    prefix = `You have ${count} feature${count === 1 ? '' : 's'}.${limitNote}`;
  }

  // For TTS, just list the titles
  if (count <= 5) {
    const titles = features.map((f) => f.title || 'Untitled').join(', ');
    return `${prefix} ${count === 1 ? 'It is' : 'They are'}: ${titles}.`;
  }

  // For longer lists, summarize
  const firstFive = features
    .slice(0, 5)
    .map((f) => f.title || 'Untitled')
    .join(', ');
  const remaining = count - 5;
  return `${prefix} The first five are: ${firstFive}, and ${remaining} more.`;
}

/**
 * Format features for text display (structured list)
 */
function formatFeaturesForDisplay(features: Feature[], options: ListFeaturesOptions): string {
  if (features.length === 0) {
    if (options.status) {
      return `No ${options.status} features found.`;
    }
    if (options.category) {
      return `No features found in category "${options.category}".`;
    }
    if (options.favoritesOnly) {
      return `No favorite features found.`;
    }
    return `No features found.`;
  }

  const count = features.length;
  let header = '';

  if (options.status) {
    header = `## ${options.status.charAt(0).toUpperCase() + options.status.slice(1)} Features (${count})`;
  } else if (options.category) {
    header = `## Features in "${options.category}" (${count})`;
  } else if (options.favoritesOnly) {
    header = `## Favorite Features (${count})`;
  } else {
    header = `## All Features (${count})`;
  }

  const featureLines = features.map((f) =>
    formatFeatureForDisplay(f, options.includeDescriptions ?? false)
  );

  return `${header}\n\n${featureLines.join('\n')}`;
}

/**
 * List Features Voice Script
 *
 * Lists features based on the provided options. Supports filtering by
 * status, category, favorites, and can include descriptions.
 *
 * @param context - Voice script context with project info and services
 * @param options - Options for filtering and formatting the list
 * @returns VoiceCommandResult with formatted feature list
 */
export async function listFeatures(
  context: VoiceScriptContext,
  options: ListFeaturesOptions = {}
): Promise<VoiceCommandResult> {
  try {
    logger.info(`Listing features for project: ${context.projectPath}`, { options });

    // Get all features from the project
    let features = await context.featureLoader.getAll(context.projectPath);

    // Apply filters
    if (options.status) {
      const normalizedStatus = options.status.toLowerCase();
      features = features.filter((f) => f.status?.toLowerCase() === normalizedStatus);
    }

    if (options.category) {
      const normalizedCategory = options.category.toLowerCase();
      features = features.filter((f) => f.category?.toLowerCase() === normalizedCategory);
    }

    if (options.favoritesOnly) {
      features = features.filter((f) => f.isFavorite === true);
    }

    // Apply limit
    if (options.limit && options.limit > 0) {
      features = features.slice(0, options.limit);
    }

    // Generate both display text and speech text
    const displayText = formatFeaturesForDisplay(features, options);
    const speechText = formatFeaturesForSpeech(features, options);

    logger.info(`Listed ${features.length} features`);

    return {
      success: true,
      response: displayText,
      commandName: 'list-features',
      data: {
        features: features.map((f) => ({
          id: f.id,
          title: f.title,
          status: f.status,
          category: f.category,
          isFavorite: f.isFavorite,
        })),
        count: features.length,
        speechText, // Used by TTS for more natural readback
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to list features:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while listing your features.',
      commandName: 'list-features',
      error: errorMessage,
    };
  }
}

/**
 * Get Feature Count
 *
 * Returns a count of features, optionally filtered by status.
 * Useful for quick status checks like "how many features are pending?"
 *
 * @param context - Voice script context
 * @param status - Optional status filter
 * @returns VoiceCommandResult with count information
 */
export async function getFeatureCount(
  context: VoiceScriptContext,
  status?: string
): Promise<VoiceCommandResult> {
  try {
    let features = await context.featureLoader.getAll(context.projectPath);

    if (status) {
      const normalizedStatus = status.toLowerCase();
      features = features.filter((f) => f.status?.toLowerCase() === normalizedStatus);
    }

    const count = features.length;
    let response: string;
    let speechText: string;

    if (status) {
      response = `${count} ${status} feature${count === 1 ? '' : 's'}`;
      speechText = `You have ${count} ${status} feature${count === 1 ? '' : 's'}.`;
    } else {
      response = `${count} total feature${count === 1 ? '' : 's'}`;
      speechText = `You have ${count} feature${count === 1 ? '' : 's'} in total.`;
    }

    // Add summary by status if listing all
    if (!status && features.length > 0) {
      const pending = features.filter((f) => f.status === 'pending').length;
      const running = features.filter((f) => f.status === 'running').length;
      const completed = features.filter((f) => f.status === 'completed').length;
      const failed = features.filter((f) => f.status === 'failed').length;

      const parts: string[] = [];
      if (pending > 0) parts.push(`${pending} pending`);
      if (running > 0) parts.push(`${running} in progress`);
      if (completed > 0) parts.push(`${completed} completed`);
      if (failed > 0) parts.push(`${failed} failed`);

      if (parts.length > 0) {
        response += ` (${parts.join(', ')})`;
        speechText = `You have ${count} feature${count === 1 ? '' : 's'}. ${parts.join(', ')}.`;
      }
    }

    return {
      success: true,
      response,
      commandName: 'get-feature-count',
      data: {
        count,
        status: status || 'all',
        speechText,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to get feature count:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error counting your features.',
      commandName: 'get-feature-count',
      error: errorMessage,
    };
  }
}

/**
 * Get Feature Summary
 *
 * Returns a summary of all features grouped by status.
 * Responds to queries like "give me a summary" or "what's the status of my features?"
 *
 * @param context - Voice script context
 * @returns VoiceCommandResult with summary information
 */
export async function getFeatureSummary(context: VoiceScriptContext): Promise<VoiceCommandResult> {
  try {
    const features = await context.featureLoader.getAll(context.projectPath);

    if (features.length === 0) {
      return {
        success: true,
        response: "You don't have any features yet.",
        commandName: 'get-feature-summary',
        data: {
          total: 0,
          speechText: "You don't have any features yet.",
        },
      };
    }

    // Group by status
    const pending = features.filter((f) => f.status === 'pending');
    const running = features.filter((f) => f.status === 'running');
    const completed = features.filter((f) => f.status === 'completed');
    const failed = features.filter((f) => f.status === 'failed');
    const noStatus = features.filter((f) => !f.status);

    // Build display text
    const lines: string[] = [`## Feature Summary (${features.length} total)`];
    lines.push('');

    if (completed.length > 0) {
      lines.push(`✅ **Completed:** ${completed.length}`);
    }
    if (running.length > 0) {
      lines.push(`🔄 **In Progress:** ${running.length}`);
    }
    if (pending.length > 0) {
      lines.push(`⏳ **Pending:** ${pending.length}`);
    }
    if (failed.length > 0) {
      lines.push(`❌ **Failed:** ${failed.length}`);
    }
    if (noStatus.length > 0) {
      lines.push(`📋 **No Status:** ${noStatus.length}`);
    }

    // Build speech text
    const speechParts: string[] = [];
    if (completed.length > 0) {
      speechParts.push(`${completed.length} completed`);
    }
    if (running.length > 0) {
      speechParts.push(`${running.length} in progress`);
    }
    if (pending.length > 0) {
      speechParts.push(`${pending.length} pending`);
    }
    if (failed.length > 0) {
      speechParts.push(`${failed.length} failed`);
    }

    const speechText = `You have ${features.length} features. ${speechParts.join(', ')}.`;

    return {
      success: true,
      response: lines.join('\n'),
      commandName: 'get-feature-summary',
      data: {
        total: features.length,
        completed: completed.length,
        running: running.length,
        pending: pending.length,
        failed: failed.length,
        noStatus: noStatus.length,
        speechText,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to get feature summary:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error getting the feature summary.',
      commandName: 'get-feature-summary',
      error: errorMessage,
    };
  }
}
