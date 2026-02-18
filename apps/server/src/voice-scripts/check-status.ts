/**
 * Check Status Voice Script
 *
 * Handles voice commands related to checking the status of specific features
 * or getting overall project status summaries. This script is invoked by the
 * voice command interpreter when the user asks "what's the status of X",
 * "check status of my features", "how is the login feature doing", etc.
 *
 * Voice Script Pattern:
 * - Scripts receive a context object with projectPath, session info, and dependencies
 * - Scripts return a VoiceCommandResult with success status and response text
 * - Scripts should format responses for both text display and TTS readback
 */

import type { Feature, VoiceCommandResult, FeatureStatus } from '@automaker/types';
import type { VoiceScriptContext } from './list-features.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('VoiceScript:CheckStatus');

/**
 * Options for checking feature status
 */
export interface CheckStatusOptions {
  /** Specific feature ID to check */
  featureId?: string;
  /** Specific feature title to check */
  featureTitle?: string;
  /** Filter by status to get counts */
  filterStatus?: FeatureStatus;
  /** Include detailed breakdown of statuses */
  includeBreakdown?: boolean;
}

/**
 * Status distribution for features
 */
interface StatusDistribution {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  noStatus: number;
  total: number;
}

/**
 * Format a feature status for voice output with natural language
 */
function formatStatusForSpeech(status?: string): string {
  switch (status) {
    case 'pending':
      return 'pending and waiting to start';
    case 'running':
      return 'currently in progress';
    case 'completed':
      return 'completed successfully';
    case 'failed':
      return 'failed with errors';
    default:
      return 'has no status set';
  }
}

/**
 * Format a feature status for display
 */
function formatStatusForDisplay(status?: string): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'running':
      return 'In Progress';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return 'No Status';
  }
}

/**
 * Get status icon for display
 */
function getStatusIcon(status?: string): string {
  switch (status) {
    case 'pending':
      return '\u23F3'; // Hourglass
    case 'running':
      return '\uD83D\uDD04'; // Rotating arrows
    case 'completed':
      return '\u2705'; // Check mark
    case 'failed':
      return '\u274C'; // Red X
    default:
      return '\uD83D\uDCCB'; // Clipboard
  }
}

/**
 * Calculate status distribution from features array
 */
function calculateStatusDistribution(features: Feature[]): StatusDistribution {
  const distribution: StatusDistribution = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    noStatus: 0,
    total: features.length,
  };

  for (const feature of features) {
    switch (feature.status) {
      case 'pending':
        distribution.pending++;
        break;
      case 'running':
        distribution.running++;
        break;
      case 'completed':
        distribution.completed++;
        break;
      case 'failed':
        distribution.failed++;
        break;
      default:
        distribution.noStatus++;
    }
  }

  return distribution;
}

/**
 * Format time elapsed since a given timestamp
 */
function formatTimeElapsed(startedAt?: string): string {
  if (!startedAt) return '';

  const started = new Date(startedAt);
  const now = new Date();
  const diffMs = now.getTime() - started.getTime();

  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}

/**
 * Format feature details for display
 */
function formatFeatureDetailsForDisplay(feature: Feature): string {
  const title = feature.title || 'Untitled';
  const status = formatStatusForDisplay(feature.status);
  const icon = getStatusIcon(feature.status);
  const favorite = feature.isFavorite ? ' \u2B50' : '';
  const category = feature.category !== 'Uncategorized' ? ` [${feature.category}]` : '';

  const lines: string[] = [];
  lines.push(`## ${icon} ${title}${favorite}`);
  lines.push('');
  lines.push(`**Status:** ${status}${category}`);
  lines.push(`**ID:** ${feature.id}`);

  if (feature.startedAt) {
    lines.push(`**Started:** ${formatTimeElapsed(feature.startedAt)}`);
  }

  if (feature.error) {
    lines.push('');
    lines.push('### Error');
    lines.push(`\`\`\`\n${feature.error}\n\`\`\``);
  }

  if (feature.summary) {
    lines.push('');
    lines.push('### Latest Summary');
    const summary =
      feature.summary.length > 300 ? feature.summary.substring(0, 300) + '...' : feature.summary;
    lines.push(summary);
  }

  if (feature.planSpec) {
    lines.push('');
    lines.push('### Plan Status');
    lines.push(`- Plan: ${feature.planSpec.status}`);
    if (feature.planSpec.tasksTotal) {
      lines.push(
        `- Progress: ${feature.planSpec.tasksCompleted || 0}/${feature.planSpec.tasksTotal} tasks`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Format feature details for speech
 */
function formatFeatureDetailsForSpeech(feature: Feature): string {
  const title = feature.title || 'Untitled';
  const statusSpeech = formatStatusForSpeech(feature.status);

  let speech = `The feature "${title}" is ${statusSpeech}.`;

  if (feature.startedAt && feature.status === 'running') {
    speech += ` It started ${formatTimeElapsed(feature.startedAt)}.`;
  }

  if (feature.error && feature.status === 'failed') {
    speech += ' There was an error during execution.';
  }

  if (feature.planSpec?.tasksTotal && feature.status === 'running') {
    const completed = feature.planSpec.tasksCompleted || 0;
    const total = feature.planSpec.tasksTotal;
    const percentage = Math.round((completed / total) * 100);
    speech += ` Progress is at ${percentage} percent, with ${completed} of ${total} tasks completed.`;
  }

  return speech;
}

/**
 * Format status distribution for display
 */
function formatDistributionForDisplay(dist: StatusDistribution): string {
  const lines: string[] = [];
  lines.push(`## Project Status Overview (${dist.total} features)`);
  lines.push('');

  if (dist.completed > 0) {
    lines.push(`${getStatusIcon('completed')} **Completed:** ${dist.completed}`);
  }
  if (dist.running > 0) {
    lines.push(`${getStatusIcon('running')} **In Progress:** ${dist.running}`);
  }
  if (dist.pending > 0) {
    lines.push(`${getStatusIcon('pending')} **Pending:** ${dist.pending}`);
  }
  if (dist.failed > 0) {
    lines.push(`${getStatusIcon('failed')} **Failed:** ${dist.failed}`);
  }
  if (dist.noStatus > 0) {
    lines.push(`${getStatusIcon(undefined)} **No Status:** ${dist.noStatus}`);
  }

  return lines.join('\n');
}

/**
 * Format status distribution for speech
 */
function formatDistributionForSpeech(dist: StatusDistribution): string {
  if (dist.total === 0) {
    return "You don't have any features in this project yet.";
  }

  const parts: string[] = [];

  if (dist.completed > 0) {
    parts.push(`${dist.completed} completed`);
  }
  if (dist.running > 0) {
    parts.push(`${dist.running} in progress`);
  }
  if (dist.pending > 0) {
    parts.push(`${dist.pending} pending`);
  }
  if (dist.failed > 0) {
    parts.push(`${dist.failed} failed`);
  }

  if (parts.length === 0) {
    return `You have ${dist.total} feature${dist.total === 1 ? '' : 's'} with no status set.`;
  }

  // Combine parts with natural language
  let speech = `You have ${dist.total} feature${dist.total === 1 ? '' : 's'}: `;

  if (parts.length === 1) {
    speech += parts[0];
  } else if (parts.length === 2) {
    speech += `${parts[0]} and ${parts[1]}`;
  } else {
    const lastPart = parts.pop();
    speech += `${parts.join(', ')}, and ${lastPart}`;
  }

  return speech + '.';
}

/**
 * Check Feature Status
 *
 * Gets the status of a specific feature by ID or title.
 * Returns detailed information about the feature's current state.
 *
 * @param context - Voice script context with project info and services
 * @param identifier - Feature ID or title to check
 * @returns VoiceCommandResult with feature status details
 */
export async function checkFeatureStatus(
  context: VoiceScriptContext,
  identifier: string
): Promise<VoiceCommandResult> {
  try {
    if (!identifier || !identifier.trim()) {
      return {
        success: false,
        response: 'Please specify a feature ID or title to check.',
        commandName: 'check-feature-status',
        error: 'Feature identifier is required',
      };
    }

    logger.info(`Checking status for feature: "${identifier}"`, {
      projectPath: context.projectPath,
    });

    const trimmedId = identifier.trim();

    // First, try exact ID match
    let feature = await context.featureLoader.get(context.projectPath, trimmedId);

    // If not found by ID, try title match
    if (!feature) {
      feature = await context.featureLoader.findByTitle(context.projectPath, trimmedId);
    }

    // If still not found, try a partial match search
    if (!feature) {
      const allFeatures = await context.featureLoader.getAll(context.projectPath);
      const normalizedQuery = trimmedId.toLowerCase();

      // Find features with matching titles
      const matches = allFeatures.filter(
        (f) => f.title && f.title.toLowerCase().includes(normalizedQuery)
      );

      if (matches.length === 1) {
        // Single match - use it
        feature = matches[0];
      } else if (matches.length > 1) {
        // Multiple matches - ask for clarification
        const matchTitles = matches
          .slice(0, 5)
          .map((f) => f.title || 'Untitled')
          .join(', ');
        return {
          success: false,
          response: `Found ${matches.length} features matching "${trimmedId}". Which one did you mean: ${matchTitles}?`,
          commandName: 'check-feature-status',
          error: 'Multiple matches found',
          data: {
            matches: matches.slice(0, 5).map((f) => ({
              id: f.id,
              title: f.title,
              status: f.status,
            })),
            speechText: `I found ${matches.length} features matching that name. Could you be more specific? The options are: ${matchTitles}.`,
          },
        };
      } else {
        // No matches at all
        return {
          success: false,
          response: `Could not find a feature matching "${trimmedId}".`,
          commandName: 'check-feature-status',
          error: 'Feature not found',
          data: {
            speechText: `I couldn't find a feature called "${trimmedId}". Please check the name and try again.`,
          },
        };
      }
    }

    // Format the response
    const displayText = formatFeatureDetailsForDisplay(feature);
    const speechText = formatFeatureDetailsForSpeech(feature);

    logger.info(`Status check complete for: ${feature.title || feature.id}`);

    return {
      success: true,
      response: displayText,
      commandName: 'check-feature-status',
      data: {
        feature: {
          id: feature.id,
          title: feature.title,
          status: feature.status,
          category: feature.category,
          isFavorite: feature.isFavorite,
          startedAt: feature.startedAt,
          error: feature.error,
          planSpec: feature.planSpec,
        },
        speechText,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to check feature status:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while checking the feature status.',
      commandName: 'check-feature-status',
      error: errorMessage,
    };
  }
}

/**
 * Get Overall Project Status
 *
 * Gets a summary of all features in the project grouped by status.
 * Responds to queries like "what's the project status" or "how are my features doing"
 *
 * @param context - Voice script context
 * @returns VoiceCommandResult with project status overview
 */
export async function getProjectStatus(context: VoiceScriptContext): Promise<VoiceCommandResult> {
  try {
    logger.info(`Getting project status for: ${context.projectPath}`);

    const features = await context.featureLoader.getAll(context.projectPath);
    const distribution = calculateStatusDistribution(features);

    const displayText = formatDistributionForDisplay(distribution);
    const speechText = formatDistributionForSpeech(distribution);

    logger.info(`Project status: ${distribution.total} total features`);

    return {
      success: true,
      response: displayText,
      commandName: 'get-project-status',
      data: {
        distribution,
        speechText,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to get project status:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while getting the project status.',
      commandName: 'get-project-status',
      error: errorMessage,
    };
  }
}

/**
 * Get Features by Status
 *
 * Lists all features with a specific status.
 * Responds to queries like "show me failed features" or "what's pending"
 *
 * @param context - Voice script context
 * @param status - The status to filter by
 * @param limit - Maximum number of features to return (default: 10)
 * @returns VoiceCommandResult with filtered features list
 */
export async function getFeaturesByStatus(
  context: VoiceScriptContext,
  status: FeatureStatus,
  limit: number = 10
): Promise<VoiceCommandResult> {
  try {
    logger.info(`Getting features with status: ${status}`, { projectPath: context.projectPath });

    const allFeatures = await context.featureLoader.getAll(context.projectPath);
    const filteredFeatures = allFeatures.filter((f) => f.status === status);
    const limitedFeatures = filteredFeatures.slice(0, limit);

    const statusDisplay = formatStatusForDisplay(status);
    const icon = getStatusIcon(status);

    let displayText: string;
    let speechText: string;

    if (filteredFeatures.length === 0) {
      displayText = `No ${statusDisplay.toLowerCase()} features found.`;
      speechText = `You don't have any ${statusDisplay.toLowerCase()} features.`;
    } else {
      const featureLines = limitedFeatures.map(
        (f) =>
          `${icon} **${f.title || 'Untitled'}** - ${f.category !== 'Uncategorized' ? f.category : 'No category'}`
      );

      const moreNote =
        filteredFeatures.length > limit
          ? `\n\n_Showing ${limit} of ${filteredFeatures.length} features_`
          : '';

      displayText = `## ${statusDisplay} Features (${filteredFeatures.length})\n\n${featureLines.join('\n')}${moreNote}`;

      if (filteredFeatures.length === 1) {
        speechText = `You have one ${statusDisplay.toLowerCase()} feature: ${limitedFeatures[0].title || 'Untitled'}.`;
      } else if (filteredFeatures.length <= 5) {
        const titles = limitedFeatures.map((f) => f.title || 'Untitled').join(', ');
        speechText = `You have ${filteredFeatures.length} ${statusDisplay.toLowerCase()} features: ${titles}.`;
      } else {
        const firstThree = limitedFeatures
          .slice(0, 3)
          .map((f) => f.title || 'Untitled')
          .join(', ');
        speechText = `You have ${filteredFeatures.length} ${statusDisplay.toLowerCase()} features. The first three are: ${firstThree}.`;
      }
    }

    return {
      success: true,
      response: displayText,
      commandName: 'get-features-by-status',
      data: {
        status,
        features: limitedFeatures.map((f) => ({
          id: f.id,
          title: f.title,
          category: f.category,
        })),
        count: filteredFeatures.length,
        speechText,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to get features by status:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while getting features.',
      commandName: 'get-features-by-status',
      error: errorMessage,
    };
  }
}

/**
 * Get In-Progress Features
 *
 * Shortcut to get all running/in-progress features with detailed status.
 * Responds to "what's currently running" or "show active features"
 *
 * @param context - Voice script context
 * @returns VoiceCommandResult with running features and their progress
 */
export async function getInProgressFeatures(
  context: VoiceScriptContext
): Promise<VoiceCommandResult> {
  try {
    logger.info(`Getting in-progress features for: ${context.projectPath}`);

    const allFeatures = await context.featureLoader.getAll(context.projectPath);
    const runningFeatures = allFeatures.filter((f) => f.status === 'running');

    if (runningFeatures.length === 0) {
      return {
        success: true,
        response: 'No features are currently running.',
        commandName: 'get-in-progress-features',
        data: {
          features: [],
          count: 0,
          speechText: 'There are no features currently in progress.',
        },
      };
    }

    const featureDetails = runningFeatures.map((f) => {
      const title = f.title || 'Untitled';
      const startedInfo = f.startedAt ? `Started ${formatTimeElapsed(f.startedAt)}` : '';
      let progressInfo = '';

      if (f.planSpec?.tasksTotal) {
        const completed = f.planSpec.tasksCompleted || 0;
        const total = f.planSpec.tasksTotal;
        const percentage = Math.round((completed / total) * 100);
        progressInfo = `(${percentage}% - ${completed}/${total} tasks)`;
      }

      return `${getStatusIcon('running')} **${title}** ${progressInfo}\n   _${startedInfo}_`;
    });

    const displayText = `## Features In Progress (${runningFeatures.length})\n\n${featureDetails.join('\n\n')}`;

    let speechText: string;
    if (runningFeatures.length === 1) {
      const f = runningFeatures[0];
      speechText = `One feature is currently running: ${f.title || 'Untitled'}.`;
      if (f.planSpec?.tasksTotal) {
        const percentage = Math.round(
          ((f.planSpec.tasksCompleted || 0) / f.planSpec.tasksTotal) * 100
        );
        speechText += ` It's ${percentage}% complete.`;
      }
    } else {
      const titles = runningFeatures
        .slice(0, 3)
        .map((f) => f.title || 'Untitled')
        .join(', ');
      speechText = `${runningFeatures.length} features are currently running: ${titles}${runningFeatures.length > 3 ? `, and ${runningFeatures.length - 3} more` : ''}.`;
    }

    return {
      success: true,
      response: displayText,
      commandName: 'get-in-progress-features',
      data: {
        features: runningFeatures.map((f) => ({
          id: f.id,
          title: f.title,
          startedAt: f.startedAt,
          progress: f.planSpec
            ? {
                completed: f.planSpec.tasksCompleted || 0,
                total: f.planSpec.tasksTotal || 0,
              }
            : null,
        })),
        count: runningFeatures.length,
        speechText,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to get in-progress features:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while getting in-progress features.',
      commandName: 'get-in-progress-features',
      error: errorMessage,
    };
  }
}

/**
 * Get Failed Features
 *
 * Shortcut to get all failed features with error details.
 * Responds to "what failed" or "show me errors"
 *
 * @param context - Voice script context
 * @returns VoiceCommandResult with failed features and their errors
 */
export async function getFailedFeatures(context: VoiceScriptContext): Promise<VoiceCommandResult> {
  try {
    logger.info(`Getting failed features for: ${context.projectPath}`);

    const allFeatures = await context.featureLoader.getAll(context.projectPath);
    const failedFeatures = allFeatures.filter((f) => f.status === 'failed');

    if (failedFeatures.length === 0) {
      return {
        success: true,
        response: 'No failed features found. All is well!',
        commandName: 'get-failed-features',
        data: {
          features: [],
          count: 0,
          speechText: 'Great news! You have no failed features.',
        },
      };
    }

    const featureDetails = failedFeatures.map((f) => {
      const title = f.title || 'Untitled';
      const errorPreview = f.error
        ? f.error.length > 100
          ? f.error.substring(0, 100) + '...'
          : f.error
        : 'No error message';

      return `${getStatusIcon('failed')} **${title}**\n   Error: _${errorPreview}_`;
    });

    const displayText = `## Failed Features (${failedFeatures.length})\n\n${featureDetails.join('\n\n')}`;

    let speechText: string;
    if (failedFeatures.length === 1) {
      speechText = `One feature has failed: ${failedFeatures[0].title || 'Untitled'}. Would you like me to show you the error details?`;
    } else {
      const titles = failedFeatures
        .slice(0, 3)
        .map((f) => f.title || 'Untitled')
        .join(', ');
      speechText = `${failedFeatures.length} features have failed: ${titles}${failedFeatures.length > 3 ? `, and ${failedFeatures.length - 3} more` : ''}.`;
    }

    return {
      success: true,
      response: displayText,
      commandName: 'get-failed-features',
      data: {
        features: failedFeatures.map((f) => ({
          id: f.id,
          title: f.title,
          error: f.error,
        })),
        count: failedFeatures.length,
        speechText,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to get failed features:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while getting failed features.',
      commandName: 'get-failed-features',
      error: errorMessage,
    };
  }
}

/**
 * Get Recent Activity
 *
 * Gets features that were recently started or updated.
 * Responds to "what's been happening" or "show recent activity"
 *
 * @param context - Voice script context
 * @param limit - Maximum number of features to return (default: 5)
 * @returns VoiceCommandResult with recent features
 */
export async function getRecentActivity(
  context: VoiceScriptContext,
  limit: number = 5
): Promise<VoiceCommandResult> {
  try {
    logger.info(`Getting recent activity for: ${context.projectPath}`);

    const allFeatures = await context.featureLoader.getAll(context.projectPath);

    // Filter to features with startedAt and sort by most recent
    const recentFeatures = allFeatures
      .filter((f) => f.startedAt)
      .sort((a, b) => {
        const dateA = new Date(a.startedAt!).getTime();
        const dateB = new Date(b.startedAt!).getTime();
        return dateB - dateA;
      })
      .slice(0, limit);

    if (recentFeatures.length === 0) {
      return {
        success: true,
        response: 'No recent activity found.',
        commandName: 'get-recent-activity',
        data: {
          features: [],
          count: 0,
          speechText: 'There has been no recent activity on your features.',
        },
      };
    }

    const featureLines = recentFeatures.map((f) => {
      const icon = getStatusIcon(f.status);
      const title = f.title || 'Untitled';
      const status = formatStatusForDisplay(f.status);
      const timeAgo = formatTimeElapsed(f.startedAt);

      return `${icon} **${title}** - ${status}\n   _Started ${timeAgo}_`;
    });

    const displayText = `## Recent Activity\n\n${featureLines.join('\n\n')}`;

    const recentTitles = recentFeatures
      .slice(0, 3)
      .map((f) => f.title || 'Untitled')
      .join(', ');
    const speechText =
      recentFeatures.length === 1
        ? `The most recent feature is "${recentFeatures[0].title || 'Untitled'}", started ${formatTimeElapsed(recentFeatures[0].startedAt)}.`
        : `Your most recent features are: ${recentTitles}.`;

    return {
      success: true,
      response: displayText,
      commandName: 'get-recent-activity',
      data: {
        features: recentFeatures.map((f) => ({
          id: f.id,
          title: f.title,
          status: f.status,
          startedAt: f.startedAt,
        })),
        count: recentFeatures.length,
        speechText,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to get recent activity:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while getting recent activity.',
      commandName: 'get-recent-activity',
      error: errorMessage,
    };
  }
}
