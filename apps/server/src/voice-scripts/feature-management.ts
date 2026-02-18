/**
 * Feature Management Voice Script
 *
 * Handles voice commands for creating, updating, and deleting features.
 * This script is invoked by the voice command interpreter when the user
 * asks to "create a new feature", "update the login feature", "delete feature X", etc.
 *
 * Voice Script Pattern:
 * - Scripts receive a context object with projectPath, session info, and dependencies
 * - Scripts return a VoiceCommandResult with success status and response text
 * - Scripts should format responses for both text display and TTS readback
 * - Destructive operations (delete, bulk updates) require confirmation per voice settings
 */

import type { Feature, VoiceCommandResult, FeatureStatus } from '@automaker/types';
import type { VoiceScriptContext } from './list-features.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('VoiceScript:FeatureManagement');

// ============================================================================
// Types for Feature Management Operations
// ============================================================================

/**
 * Options for creating a new feature
 */
export interface CreateFeatureOptions {
  /** Title of the new feature (required) */
  title: string;
  /** Description of the feature */
  description?: string;
  /** Category to assign the feature to */
  category?: string;
  /** Initial status (default: 'pending') */
  status?: FeatureStatus;
  /** Priority level (1-5) */
  priority?: number;
  /** Mark as favorite */
  isFavorite?: boolean;
}

/**
 * Options for updating an existing feature
 */
export interface UpdateFeatureOptions {
  /** Feature ID or title to identify the feature */
  identifier: string;
  /** Updates to apply */
  updates: Partial<{
    title: string;
    description: string;
    category: string;
    status: FeatureStatus;
    priority: number;
    isFavorite: boolean;
  }>;
}

/**
 * Options for deleting a feature
 */
export interface DeleteFeatureOptions {
  /** Feature ID or title to identify the feature */
  identifier: string;
  /** Whether the user has confirmed the deletion */
  confirmed?: boolean;
}

/**
 * Options for bulk status updates
 */
export interface BulkStatusUpdateOptions {
  /** Target status to set */
  targetStatus: FeatureStatus;
  /** Filter by current status */
  currentStatus?: FeatureStatus;
  /** Filter by category */
  category?: string;
  /** Whether the user has confirmed the bulk operation */
  confirmed?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

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
 * Format a feature status for speech
 */
function formatStatusForSpeech(status?: string): string {
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
      return 'with no status';
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
 * Find a feature by ID or title
 * Returns the feature if found, or search results if multiple matches
 */
async function findFeature(
  context: VoiceScriptContext,
  identifier: string
): Promise<
  | { found: true; feature: Feature }
  | { found: false; error: string; matches?: Feature[]; speechText: string }
> {
  const trimmedId = identifier.trim();

  // First, try exact ID match
  let feature = await context.featureLoader.get(context.projectPath, trimmedId);

  // If not found by ID, try title match
  if (!feature) {
    feature = await context.featureLoader.findByTitle(context.projectPath, trimmedId);
  }

  // If found, return success
  if (feature) {
    return { found: true, feature };
  }

  // Try a partial match search
  const allFeatures = await context.featureLoader.getAll(context.projectPath);
  const normalizedQuery = trimmedId.toLowerCase();

  const matches = allFeatures.filter(
    (f) => f.title && f.title.toLowerCase().includes(normalizedQuery)
  );

  if (matches.length === 1) {
    // Single match - use it
    return { found: true, feature: matches[0] };
  } else if (matches.length > 1) {
    // Multiple matches - ask for clarification
    const matchTitles = matches
      .slice(0, 5)
      .map((f) => f.title || 'Untitled')
      .join(', ');
    return {
      found: false,
      error: `Found ${matches.length} features matching "${trimmedId}". Which one did you mean: ${matchTitles}?`,
      matches: matches.slice(0, 5),
      speechText: `I found ${matches.length} features matching that name. Could you be more specific? The options are: ${matchTitles}.`,
    };
  }

  // No matches at all
  return {
    found: false,
    error: `Could not find a feature matching "${trimmedId}".`,
    speechText: `I couldn't find a feature called "${trimmedId}". Please check the name and try again.`,
  };
}

// ============================================================================
// Create Feature
// ============================================================================

/**
 * Create Feature Voice Script
 *
 * Creates a new feature with the specified title and optional details.
 * Responds to queries like "create a new feature called X" or "add a feature for Y"
 *
 * @param context - Voice script context with project info and services
 * @param options - Options for the new feature
 * @returns VoiceCommandResult with creation result
 */
export async function createFeature(
  context: VoiceScriptContext,
  options: CreateFeatureOptions
): Promise<VoiceCommandResult> {
  try {
    const { title, description, category, status, priority, isFavorite } = options;

    // Validate title
    if (!title || !title.trim()) {
      return {
        success: false,
        response: 'Please provide a title for the new feature.',
        commandName: 'create-feature',
        error: 'Feature title is required',
        data: {
          speechText: 'I need a title for the new feature. What would you like to call it?',
        },
      };
    }

    const trimmedTitle = title.trim();

    logger.info(`Creating feature: "${trimmedTitle}"`, {
      projectPath: context.projectPath,
      options,
    });

    // Check for duplicate title
    const duplicate = await context.featureLoader.findDuplicateTitle(
      context.projectPath,
      trimmedTitle
    );

    if (duplicate) {
      return {
        success: false,
        response: `A feature with title "${trimmedTitle}" already exists.`,
        commandName: 'create-feature',
        error: 'Duplicate title',
        data: {
          duplicateFeatureId: duplicate.id,
          speechText: `A feature called "${trimmedTitle}" already exists. Would you like to update it instead, or choose a different name?`,
        },
      };
    }

    // Build feature data
    const featureData: Partial<Feature> = {
      title: trimmedTitle,
      description: description?.trim() || '',
      category: category?.trim() || 'Uncategorized',
      status: status || 'pending',
      priority: priority,
      isFavorite: isFavorite || false,
    };

    // Create the feature
    const created = await context.featureLoader.create(context.projectPath, featureData);

    // Format response
    const icon = getStatusIcon(created.status);
    const statusDisplay = formatStatusForDisplay(created.status);
    const categoryDisplay = created.category !== 'Uncategorized' ? ` in ${created.category}` : '';
    const favoriteNote = created.isFavorite ? ' (marked as favorite)' : '';

    const displayText = [
      `## ${icon} Feature Created Successfully`,
      '',
      `**Title:** ${created.title}`,
      `**ID:** ${created.id}`,
      `**Status:** ${statusDisplay}${categoryDisplay}${favoriteNote}`,
      '',
      created.description
        ? `**Description:**\n${created.description}`
        : '_No description provided_',
    ].join('\n');

    const speechText = `I've created a new feature called "${created.title}"${categoryDisplay}. It's currently ${formatStatusForSpeech(created.status)}.`;

    logger.info(`Created feature: ${created.id} - ${created.title}`);

    return {
      success: true,
      response: displayText,
      commandName: 'create-feature',
      data: {
        feature: {
          id: created.id,
          title: created.title,
          description: created.description,
          category: created.category,
          status: created.status,
          priority: created.priority,
          isFavorite: created.isFavorite,
        },
        speechText,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to create feature:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while creating the feature.',
      commandName: 'create-feature',
      error: errorMessage,
      data: {
        speechText: 'Sorry, something went wrong while creating the feature. Please try again.',
      },
    };
  }
}

// ============================================================================
// Update Feature
// ============================================================================

/**
 * Update Feature Voice Script
 *
 * Updates an existing feature with the specified changes.
 * Responds to queries like "update the login feature status to completed" or
 * "change the description of feature X"
 *
 * @param context - Voice script context with project info and services
 * @param options - Options including identifier and updates
 * @returns VoiceCommandResult with update result
 */
export async function updateFeature(
  context: VoiceScriptContext,
  options: UpdateFeatureOptions
): Promise<VoiceCommandResult> {
  try {
    const { identifier, updates } = options;

    // Validate identifier
    if (!identifier || !identifier.trim()) {
      return {
        success: false,
        response: 'Please specify which feature to update by name or ID.',
        commandName: 'update-feature',
        error: 'Feature identifier is required',
        data: {
          speechText: 'Which feature would you like to update?',
        },
      };
    }

    // Validate updates
    if (!updates || Object.keys(updates).length === 0) {
      return {
        success: false,
        response: 'Please specify what you want to update.',
        commandName: 'update-feature',
        error: 'No updates provided',
        data: {
          speechText: 'What would you like to change about this feature?',
        },
      };
    }

    logger.info(`Updating feature: "${identifier}"`, {
      projectPath: context.projectPath,
      updates,
    });

    // Find the feature
    const findResult = await findFeature(context, identifier);

    if (findResult.found === false) {
      return {
        success: false,
        response: findResult.error,
        commandName: 'update-feature',
        error: 'Feature not found',
        data: {
          matches: findResult.matches?.map((f) => ({
            id: f.id,
            title: f.title,
          })),
          speechText: findResult.speechText,
        },
      };
    }

    const feature = findResult.feature;
    const previousTitle = feature.title;
    const previousStatus = feature.status;

    // Check for duplicate title if title is being updated
    if (updates.title && updates.title.trim()) {
      const duplicate = await context.featureLoader.findDuplicateTitle(
        context.projectPath,
        updates.title,
        feature.id
      );

      if (duplicate) {
        return {
          success: false,
          response: `Cannot rename to "${updates.title}" - a feature with that title already exists.`,
          commandName: 'update-feature',
          error: 'Duplicate title',
          data: {
            duplicateFeatureId: duplicate.id,
            speechText: `Sorry, there's already a feature called "${updates.title}". Please choose a different name.`,
          },
        };
      }
    }

    // Apply updates
    const updated = await context.featureLoader.update(context.projectPath, feature.id, updates);

    // Build change summary
    const changes: string[] = [];
    const speechChanges: string[] = [];

    if (updates.title && updates.title !== previousTitle) {
      changes.push(`**Title:** ${previousTitle} → ${updates.title}`);
      speechChanges.push(`renamed to "${updates.title}"`);
    }

    if (updates.status && updates.status !== previousStatus) {
      changes.push(
        `**Status:** ${formatStatusForDisplay(previousStatus)} → ${formatStatusForDisplay(updates.status)}`
      );
      speechChanges.push(`status changed to ${formatStatusForSpeech(updates.status)}`);
    }

    if (updates.description !== undefined) {
      changes.push(`**Description:** Updated`);
      speechChanges.push('description updated');
    }

    if (updates.category !== undefined) {
      changes.push(`**Category:** ${feature.category} → ${updates.category}`);
      speechChanges.push(`moved to ${updates.category} category`);
    }

    if (updates.priority !== undefined) {
      changes.push(`**Priority:** ${updates.priority}`);
      speechChanges.push(`priority set to ${updates.priority}`);
    }

    if (updates.isFavorite !== undefined) {
      changes.push(`**Favorite:** ${updates.isFavorite ? 'Yes' : 'No'}`);
      speechChanges.push(updates.isFavorite ? 'marked as favorite' : 'removed from favorites');
    }

    const icon = getStatusIcon(updated.status);
    const displayText = [
      `## ${icon} Feature Updated`,
      '',
      `**Feature:** ${updated.title || 'Untitled'}`,
      `**ID:** ${updated.id}`,
      '',
      '### Changes',
      ...changes.map((c) => `- ${c}`),
    ].join('\n');

    const speechText =
      speechChanges.length === 1
        ? `The feature "${updated.title}" has been ${speechChanges[0]}.`
        : `The feature "${updated.title}" has been updated: ${speechChanges.join(', ')}.`;

    logger.info(`Updated feature: ${updated.id}`);

    return {
      success: true,
      response: displayText,
      commandName: 'update-feature',
      data: {
        feature: {
          id: updated.id,
          title: updated.title,
          description: updated.description,
          category: updated.category,
          status: updated.status,
          priority: updated.priority,
          isFavorite: updated.isFavorite,
        },
        changes: speechChanges,
        speechText,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to update feature:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while updating the feature.',
      commandName: 'update-feature',
      error: errorMessage,
      data: {
        speechText: 'Sorry, something went wrong while updating the feature. Please try again.',
      },
    };
  }
}

/**
 * Update Feature Status Voice Script
 *
 * Shortcut for updating just the status of a feature.
 * Responds to "mark feature X as completed" or "set login feature to running"
 *
 * @param context - Voice script context
 * @param identifier - Feature ID or title
 * @param newStatus - New status to set
 * @returns VoiceCommandResult with update result
 */
export async function updateFeatureStatus(
  context: VoiceScriptContext,
  identifier: string,
  newStatus: FeatureStatus
): Promise<VoiceCommandResult> {
  return updateFeature(context, {
    identifier,
    updates: { status: newStatus },
  });
}

/**
 * Toggle Feature Favorite Voice Script
 *
 * Toggles the favorite status of a feature.
 * Responds to "favorite the login feature" or "unfavorite feature X"
 *
 * @param context - Voice script context
 * @param identifier - Feature ID or title
 * @param setFavorite - Optional explicit value (if undefined, toggles current)
 * @returns VoiceCommandResult with update result
 */
export async function toggleFeatureFavorite(
  context: VoiceScriptContext,
  identifier: string,
  setFavorite?: boolean
): Promise<VoiceCommandResult> {
  try {
    // Find the feature first to get current favorite status
    const findResult = await findFeature(context, identifier);

    if (findResult.found === false) {
      return {
        success: false,
        response: findResult.error,
        commandName: 'toggle-feature-favorite',
        error: 'Feature not found',
        data: {
          matches: findResult.matches?.map((f) => ({
            id: f.id,
            title: f.title,
          })),
          speechText: findResult.speechText,
        },
      };
    }

    const feature = findResult.feature;
    const newFavoriteStatus = setFavorite ?? !feature.isFavorite;

    return updateFeature(context, {
      identifier: feature.id,
      updates: { isFavorite: newFavoriteStatus },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to toggle feature favorite:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while updating the favorite status.',
      commandName: 'toggle-feature-favorite',
      error: errorMessage,
    };
  }
}

// ============================================================================
// Delete Feature
// ============================================================================

/**
 * Delete Feature Voice Script
 *
 * Deletes a feature from the project. This is a destructive operation
 * and requires confirmation unless explicitly confirmed in options.
 *
 * Responds to "delete feature X" or "remove the login feature"
 *
 * @param context - Voice script context with project info and services
 * @param options - Options including identifier and confirmation status
 * @returns VoiceCommandResult with deletion result or confirmation request
 */
export async function deleteFeature(
  context: VoiceScriptContext,
  options: DeleteFeatureOptions
): Promise<VoiceCommandResult> {
  try {
    const { identifier, confirmed } = options;

    // Validate identifier
    if (!identifier || !identifier.trim()) {
      return {
        success: false,
        response: 'Please specify which feature to delete by name or ID.',
        commandName: 'delete-feature',
        error: 'Feature identifier is required',
        data: {
          speechText: 'Which feature would you like to delete?',
        },
      };
    }

    logger.info(`Delete feature request: "${identifier}"`, {
      projectPath: context.projectPath,
      confirmed,
    });

    // Find the feature
    const findResult = await findFeature(context, identifier);

    if (findResult.found === false) {
      return {
        success: false,
        response: findResult.error,
        commandName: 'delete-feature',
        error: 'Feature not found',
        data: {
          matches: findResult.matches?.map((f) => ({
            id: f.id,
            title: f.title,
          })),
          speechText: findResult.speechText,
        },
      };
    }

    const feature = findResult.feature;
    const featureTitle = feature.title || 'Untitled';

    // If not confirmed, request confirmation
    if (!confirmed) {
      const icon = getStatusIcon(feature.status);
      const displayText = [
        `## \u26A0\uFE0F Confirm Deletion`,
        '',
        `Are you sure you want to delete this feature?`,
        '',
        `${icon} **${featureTitle}**`,
        `- ID: ${feature.id}`,
        `- Status: ${formatStatusForDisplay(feature.status)}`,
        `- Category: ${feature.category}`,
        '',
        '_This action cannot be undone._',
        '',
        'Say "yes, delete it" or "confirm delete" to proceed.',
      ].join('\n');

      return {
        success: false,
        response: displayText,
        commandName: 'delete-feature',
        error: 'Confirmation required',
        data: {
          feature: {
            id: feature.id,
            title: feature.title,
            status: feature.status,
            category: feature.category,
          },
          requiresConfirmation: true,
          speechText: `Are you sure you want to delete the feature "${featureTitle}"? This cannot be undone. Say "yes, delete it" to confirm.`,
        },
      };
    }

    // User has confirmed - proceed with deletion
    const success = await context.featureLoader.delete(context.projectPath, feature.id);

    if (!success) {
      return {
        success: false,
        response: `Failed to delete feature "${featureTitle}".`,
        commandName: 'delete-feature',
        error: 'Deletion failed',
        data: {
          speechText: `Sorry, I couldn't delete the feature "${featureTitle}". Please try again.`,
        },
      };
    }

    const displayText = [
      `## \u2705 Feature Deleted`,
      '',
      `Successfully deleted: **${featureTitle}**`,
      `- ID: ${feature.id}`,
    ].join('\n');

    logger.info(`Deleted feature: ${feature.id} - ${featureTitle}`);

    return {
      success: true,
      response: displayText,
      commandName: 'delete-feature',
      data: {
        deletedFeature: {
          id: feature.id,
          title: feature.title,
          status: feature.status,
          category: feature.category,
        },
        speechText: `The feature "${featureTitle}" has been deleted.`,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to delete feature:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while deleting the feature.',
      commandName: 'delete-feature',
      error: errorMessage,
      data: {
        speechText: 'Sorry, something went wrong while deleting the feature. Please try again.',
      },
    };
  }
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Bulk Update Status Voice Script
 *
 * Updates the status of multiple features at once based on filters.
 * This is a destructive operation and requires confirmation.
 *
 * Responds to "mark all pending features as running" or
 * "set all features in category X to completed"
 *
 * @param context - Voice script context
 * @param options - Bulk update options including target status and filters
 * @returns VoiceCommandResult with bulk update result or confirmation request
 */
export async function bulkUpdateStatus(
  context: VoiceScriptContext,
  options: BulkStatusUpdateOptions
): Promise<VoiceCommandResult> {
  try {
    const { targetStatus, currentStatus, category, confirmed } = options;

    logger.info(`Bulk status update request`, {
      projectPath: context.projectPath,
      options,
    });

    // Get all features
    let features = await context.featureLoader.getAll(context.projectPath);

    // Apply filters
    if (currentStatus) {
      features = features.filter((f) => f.status === currentStatus);
    }

    if (category) {
      const normalizedCategory = category.toLowerCase();
      features = features.filter((f) => f.category?.toLowerCase() === normalizedCategory);
    }

    // Filter out features that already have the target status
    features = features.filter((f) => f.status !== targetStatus);

    if (features.length === 0) {
      let message = 'No features found that need to be updated.';
      if (currentStatus) {
        message = `No ${currentStatus} features found that can be updated to ${targetStatus}.`;
      }

      return {
        success: true,
        response: message,
        commandName: 'bulk-update-status',
        data: {
          count: 0,
          speechText: message,
        },
      };
    }

    // If not confirmed, request confirmation
    if (!confirmed) {
      const featureList = features
        .slice(0, 5)
        .map((f) => `- ${f.title || 'Untitled'} (${formatStatusForDisplay(f.status)})`)
        .join('\n');

      const moreNote = features.length > 5 ? `\n_... and ${features.length - 5} more_` : '';

      let filterDesc = '';
      if (currentStatus) filterDesc += ` with status "${currentStatus}"`;
      if (category) filterDesc += ` in category "${category}"`;

      const displayText = [
        `## \u26A0\uFE0F Confirm Bulk Status Update`,
        '',
        `This will change ${features.length} feature${features.length === 1 ? '' : 's'}${filterDesc} to **${formatStatusForDisplay(targetStatus)}**.`,
        '',
        '### Features to update:',
        featureList,
        moreNote,
        '',
        'Say "yes, update them" or "confirm" to proceed.',
      ].join('\n');

      return {
        success: false,
        response: displayText,
        commandName: 'bulk-update-status',
        error: 'Confirmation required',
        data: {
          count: features.length,
          features: features.map((f) => ({
            id: f.id,
            title: f.title,
            currentStatus: f.status,
          })),
          targetStatus,
          requiresConfirmation: true,
          speechText: `This will update ${features.length} feature${features.length === 1 ? '' : 's'} to ${formatStatusForSpeech(targetStatus)}. Say "yes, update them" to confirm.`,
        },
      };
    }

    // User has confirmed - proceed with bulk update
    let successCount = 0;
    const errors: string[] = [];

    for (const feature of features) {
      try {
        await context.featureLoader.update(context.projectPath, feature.id, {
          status: targetStatus,
        });
        successCount++;
      } catch (error) {
        errors.push(feature.title || feature.id);
        logger.error(`Failed to update feature ${feature.id}:`, error);
      }
    }

    const allSuccess = errors.length === 0;
    const icon = allSuccess ? '\u2705' : '\u26A0\uFE0F';

    let displayText: string;
    let speechText: string;

    if (allSuccess) {
      displayText = [
        `## ${icon} Bulk Update Complete`,
        '',
        `Successfully updated ${successCount} feature${successCount === 1 ? '' : 's'} to **${formatStatusForDisplay(targetStatus)}**.`,
      ].join('\n');
      speechText = `Done! I've updated ${successCount} feature${successCount === 1 ? '' : 's'} to ${formatStatusForSpeech(targetStatus)}.`;
    } else {
      displayText = [
        `## ${icon} Bulk Update Partially Complete`,
        '',
        `Updated ${successCount} of ${features.length} features to **${formatStatusForDisplay(targetStatus)}**.`,
        '',
        `### Failed updates:`,
        ...errors.map((e) => `- ${e}`),
      ].join('\n');
      speechText = `I updated ${successCount} feature${successCount === 1 ? '' : 's'}, but ${errors.length} failed.`;
    }

    logger.info(`Bulk update complete: ${successCount}/${features.length} features updated`);

    return {
      success: allSuccess,
      response: displayText,
      commandName: 'bulk-update-status',
      data: {
        successCount,
        errorCount: errors.length,
        totalCount: features.length,
        targetStatus,
        errors: errors.length > 0 ? errors : undefined,
        speechText,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to perform bulk status update:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while updating features.',
      commandName: 'bulk-update-status',
      error: errorMessage,
      data: {
        speechText: 'Sorry, something went wrong during the bulk update. Please try again.',
      },
    };
  }
}

/**
 * Move Feature to Category Voice Script
 *
 * Moves a feature to a different category.
 * Responds to "move feature X to category Y" or "put login feature in authentication"
 *
 * @param context - Voice script context
 * @param identifier - Feature ID or title
 * @param newCategory - Category to move the feature to
 * @returns VoiceCommandResult with update result
 */
export async function moveFeatureToCategory(
  context: VoiceScriptContext,
  identifier: string,
  newCategory: string
): Promise<VoiceCommandResult> {
  if (!newCategory || !newCategory.trim()) {
    return {
      success: false,
      response: 'Please specify which category to move the feature to.',
      commandName: 'move-feature-to-category',
      error: 'Category is required',
      data: {
        speechText: 'Which category should I move this feature to?',
      },
    };
  }

  return updateFeature(context, {
    identifier,
    updates: { category: newCategory.trim() },
  });
}

/**
 * Rename Feature Voice Script
 *
 * Renames a feature to a new title.
 * Responds to "rename feature X to Y" or "change the title of login feature"
 *
 * @param context - Voice script context
 * @param identifier - Feature ID or current title
 * @param newTitle - New title for the feature
 * @returns VoiceCommandResult with update result
 */
export async function renameFeature(
  context: VoiceScriptContext,
  identifier: string,
  newTitle: string
): Promise<VoiceCommandResult> {
  if (!newTitle || !newTitle.trim()) {
    return {
      success: false,
      response: 'Please specify the new title for the feature.',
      commandName: 'rename-feature',
      error: 'New title is required',
      data: {
        speechText: 'What would you like to rename this feature to?',
      },
    };
  }

  return updateFeature(context, {
    identifier,
    updates: { title: newTitle.trim() },
  });
}
