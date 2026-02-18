/**
 * Search Features Voice Script
 *
 * Handles voice commands for searching features by title and/or description.
 * This script is invoked by the voice command interpreter when the user
 * asks to "search for features about X", "find features with Y", "look for Z", etc.
 *
 * Voice Script Pattern:
 * - Scripts receive a context object with projectPath, session info, and dependencies
 * - Scripts return a VoiceCommandResult with success status and response text
 * - Scripts should format responses for both text display and TTS readback
 */

import type { Feature, VoiceCommandResult } from '@automaker/types';
import type { VoiceScriptContext } from './list-features.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('VoiceScript:SearchFeatures');

/**
 * Options for searching features
 */
export interface SearchFeaturesOptions {
  /** Search query string */
  query: string;
  /** Search in titles (default: true) */
  searchTitle?: boolean;
  /** Search in descriptions (default: true) */
  searchDescription?: boolean;
  /** Filter by status (e.g., 'pending', 'running', 'completed', 'failed') */
  status?: string;
  /** Filter by category */
  category?: string;
  /** Maximum number of results to return (default: 10) */
  limit?: number;
  /** Case-sensitive search (default: false) */
  caseSensitive?: boolean;
}

/**
 * Result of a feature search with match details
 */
interface SearchMatch {
  feature: Feature;
  matchedIn: ('title' | 'description')[];
  relevanceScore: number;
}

/**
 * Normalize text for case-insensitive comparison
 */
function normalizeText(text: string, caseSensitive: boolean): string {
  return caseSensitive ? text : text.toLowerCase();
}

/**
 * Calculate relevance score for a search match
 * Higher scores indicate better matches
 */
function calculateRelevance(
  feature: Feature,
  query: string,
  matchedIn: ('title' | 'description')[]
): number {
  let score = 0;
  const normalizedQuery = query.toLowerCase();

  // Title matches are worth more
  if (matchedIn.includes('title') && feature.title) {
    const normalizedTitle = feature.title.toLowerCase();

    // Exact match is best
    if (normalizedTitle === normalizedQuery) {
      score += 100;
    }
    // Title starts with query
    else if (normalizedTitle.startsWith(normalizedQuery)) {
      score += 75;
    }
    // Query is a word in the title
    else if (normalizedTitle.split(/\s+/).includes(normalizedQuery)) {
      score += 50;
    }
    // Query appears in title
    else {
      score += 25;
    }
  }

  // Description matches
  if (matchedIn.includes('description') && feature.description) {
    const normalizedDesc = feature.description.toLowerCase();

    // Query appears multiple times
    const occurrences = normalizedDesc.split(normalizedQuery).length - 1;
    score += Math.min(occurrences * 5, 20);

    // Query at start of description
    if (normalizedDesc.startsWith(normalizedQuery)) {
      score += 10;
    } else {
      score += 5;
    }
  }

  // Boost for favorites
  if (feature.isFavorite) {
    score += 5;
  }

  // Boost for recent features (based on ID timestamp)
  const featureTimestamp = parseInt(feature.id?.split('-')[1] || '0');
  const recencyBonus = Math.min((Date.now() - featureTimestamp) / (1000 * 60 * 60 * 24 * 30), 1);
  score += (1 - recencyBonus) * 5;

  return score;
}

/**
 * Search features based on query and options
 */
function searchFeaturesInMemory(
  features: Feature[],
  options: SearchFeaturesOptions
): SearchMatch[] {
  const { query, caseSensitive = false, searchTitle = true, searchDescription = true } = options;

  if (!query || !query.trim()) {
    return [];
  }

  const normalizedQuery = normalizeText(query.trim(), caseSensitive);
  const matches: SearchMatch[] = [];

  for (const feature of features) {
    const matchedIn: ('title' | 'description')[] = [];

    // Search in title
    if (searchTitle && feature.title) {
      const normalizedTitle = normalizeText(feature.title, caseSensitive);
      if (normalizedTitle.includes(normalizedQuery)) {
        matchedIn.push('title');
      }
    }

    // Search in description
    if (searchDescription && feature.description) {
      const normalizedDesc = normalizeText(feature.description, caseSensitive);
      if (normalizedDesc.includes(normalizedQuery)) {
        matchedIn.push('description');
      }
    }

    // If any match found, add to results
    if (matchedIn.length > 0) {
      matches.push({
        feature,
        matchedIn,
        relevanceScore: calculateRelevance(feature, query, matchedIn),
      });
    }
  }

  // Sort by relevance score (highest first)
  matches.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return matches;
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
 * Highlight the search query in text for display
 */
function highlightMatch(text: string, query: string): string {
  if (!text || !query) return text;

  // Case-insensitive replace with bold markers
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return text.replace(regex, '**$1**');
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Format a single search result for display
 */
function formatResultForDisplay(match: SearchMatch, query: string): string {
  const { feature, matchedIn } = match;
  const title = feature.title || 'Untitled';
  const status = formatStatus(feature.status);
  const favorite = feature.isFavorite ? ' ⭐' : '';
  const category = feature.category !== 'Uncategorized' ? ` [${feature.category}]` : '';

  // Highlight matches
  const displayTitle = matchedIn.includes('title') ? highlightMatch(title, query) : title;

  let line = `• ${displayTitle}${favorite}${category} - ${status}`;

  // Show description snippet if matched there
  if (matchedIn.includes('description') && feature.description) {
    const desc = feature.description;
    const queryLower = query.toLowerCase();
    const descLower = desc.toLowerCase();
    const matchIndex = descLower.indexOf(queryLower);

    if (matchIndex !== -1) {
      // Extract a snippet around the match
      const snippetStart = Math.max(0, matchIndex - 30);
      const snippetEnd = Math.min(desc.length, matchIndex + query.length + 30);
      let snippet = desc.substring(snippetStart, snippetEnd);

      // Add ellipsis if truncated
      if (snippetStart > 0) snippet = '...' + snippet;
      if (snippetEnd < desc.length) snippet = snippet + '...';

      line += `\n  "${highlightMatch(snippet, query)}"`;
    }
  }

  // Show where the match was found
  const matchLocations = matchedIn.map((loc) => (loc === 'title' ? 'title' : 'description'));
  line += `\n  _Matched in: ${matchLocations.join(', ')}_`;

  return line;
}

/**
 * Format search results for TTS readback
 */
function formatResultsForSpeech(matches: SearchMatch[], query: string): string {
  if (matches.length === 0) {
    return `I couldn't find any features matching "${query}".`;
  }

  const count = matches.length;

  if (count === 1) {
    const title = matches[0].feature.title || 'Untitled';
    return `I found one feature matching "${query}": ${title}.`;
  }

  if (count <= 5) {
    const titles = matches.map((m) => m.feature.title || 'Untitled').join(', ');
    return `I found ${count} features matching "${query}". They are: ${titles}.`;
  }

  // For longer lists, summarize
  const firstThree = matches
    .slice(0, 3)
    .map((m) => m.feature.title || 'Untitled')
    .join(', ');
  const remaining = count - 3;
  return `I found ${count} features matching "${query}". The top results are: ${firstThree}, and ${remaining} more.`;
}

/**
 * Format search results for text display
 */
function formatResultsForDisplay(
  matches: SearchMatch[],
  query: string,
  options: SearchFeaturesOptions
): string {
  if (matches.length === 0) {
    let msg = `No features found matching "${query}"`;
    if (options.status) {
      msg += ` with status "${options.status}"`;
    }
    if (options.category) {
      msg += ` in category "${options.category}"`;
    }
    msg += '.';
    return msg;
  }

  const count = matches.length;
  const limitNote =
    options.limit && matches.length === options.limit ? ' (showing top results)' : '';

  let header = `## Search Results for "${query}"${limitNote} (${count} found)`;

  if (options.status || options.category) {
    const filters: string[] = [];
    if (options.status) filters.push(`status: ${options.status}`);
    if (options.category) filters.push(`category: ${options.category}`);
    header += `\n_Filters: ${filters.join(', ')}_`;
  }

  const resultLines = matches.map((match) => formatResultForDisplay(match, query));

  return `${header}\n\n${resultLines.join('\n\n')}`;
}

/**
 * Search Features Voice Script
 *
 * Searches features by title and/or description with optional filters.
 * Returns results sorted by relevance with highlighted matches.
 *
 * @param context - Voice script context with project info and services
 * @param options - Search options including query and filters
 * @returns VoiceCommandResult with search results
 */
export async function searchFeatures(
  context: VoiceScriptContext,
  options: SearchFeaturesOptions
): Promise<VoiceCommandResult> {
  try {
    const { query } = options;

    if (!query || !query.trim()) {
      return {
        success: false,
        response: 'Please provide a search term.',
        commandName: 'search-features',
        error: 'Search query is required',
      };
    }

    logger.info(`Searching features for: "${query}"`, {
      projectPath: context.projectPath,
      options,
    });

    // Get all features from the project
    let features = await context.featureLoader.getAll(context.projectPath);

    // Apply status filter before search
    if (options.status) {
      const normalizedStatus = options.status.toLowerCase();
      features = features.filter((f) => f.status?.toLowerCase() === normalizedStatus);
    }

    // Apply category filter before search
    if (options.category) {
      const normalizedCategory = options.category.toLowerCase();
      features = features.filter((f) => f.category?.toLowerCase() === normalizedCategory);
    }

    // Perform the search
    let matches = searchFeaturesInMemory(features, options);

    // Apply limit
    const limit = options.limit ?? 10;
    if (limit > 0) {
      matches = matches.slice(0, limit);
    }

    // Generate both display text and speech text
    const displayText = formatResultsForDisplay(matches, query, options);
    const speechText = formatResultsForSpeech(matches, query);

    logger.info(`Found ${matches.length} features matching "${query}"`);

    return {
      success: true,
      response: displayText,
      commandName: 'search-features',
      data: {
        query,
        results: matches.map((m) => ({
          id: m.feature.id,
          title: m.feature.title,
          status: m.feature.status,
          category: m.feature.category,
          isFavorite: m.feature.isFavorite,
          matchedIn: m.matchedIn,
          relevanceScore: m.relevanceScore,
        })),
        count: matches.length,
        speechText,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to search features:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while searching your features.',
      commandName: 'search-features',
      error: errorMessage,
    };
  }
}

/**
 * Find Features by Keywords
 *
 * A simpler search that looks for any of the provided keywords.
 * Useful for voice queries like "find features about authentication or login"
 *
 * @param context - Voice script context
 * @param keywords - Array of keywords to search for
 * @param matchAll - If true, feature must match all keywords; if false, any keyword matches (default: false)
 * @returns VoiceCommandResult with matching features
 */
export async function findFeaturesByKeywords(
  context: VoiceScriptContext,
  keywords: string[],
  matchAll: boolean = false
): Promise<VoiceCommandResult> {
  try {
    if (!keywords || keywords.length === 0) {
      return {
        success: false,
        response: 'Please provide at least one keyword to search for.',
        commandName: 'find-features-by-keywords',
        error: 'Keywords are required',
      };
    }

    logger.info(`Finding features by keywords: ${keywords.join(', ')}`, {
      projectPath: context.projectPath,
      matchAll,
    });

    const features = await context.featureLoader.getAll(context.projectPath);
    const matchedFeatures: Feature[] = [];

    for (const feature of features) {
      const searchableText = `${feature.title || ''} ${feature.description || ''}`.toLowerCase();

      const keywordMatches = keywords.map((kw) => searchableText.includes(kw.toLowerCase()));

      if (matchAll) {
        // All keywords must match
        if (keywordMatches.every((m) => m)) {
          matchedFeatures.push(feature);
        }
      } else {
        // Any keyword matches
        if (keywordMatches.some((m) => m)) {
          matchedFeatures.push(feature);
        }
      }
    }

    const count = matchedFeatures.length;
    const keywordList = keywords.join(', ');
    const matchType = matchAll ? 'all of' : 'any of';

    let displayText: string;
    let speechText: string;

    if (count === 0) {
      displayText = `No features found matching ${matchType} the keywords: ${keywordList}`;
      speechText = `I couldn't find any features matching ${matchType} those keywords.`;
    } else {
      const featureLines = matchedFeatures
        .slice(0, 10)
        .map((f) => `• ${f.title || 'Untitled'} - ${formatStatus(f.status)}`);

      displayText = `## Features Matching "${keywordList}" (${count} found)\n\n${featureLines.join('\n')}`;

      if (count === 1) {
        speechText = `I found one feature matching ${matchType} those keywords: ${matchedFeatures[0].title || 'Untitled'}.`;
      } else if (count <= 5) {
        const titles = matchedFeatures.map((f) => f.title || 'Untitled').join(', ');
        speechText = `I found ${count} features. They are: ${titles}.`;
      } else {
        const firstThree = matchedFeatures
          .slice(0, 3)
          .map((f) => f.title || 'Untitled')
          .join(', ');
        speechText = `I found ${count} features. The first three are: ${firstThree}, and ${count - 3} more.`;
      }
    }

    return {
      success: true,
      response: displayText,
      commandName: 'find-features-by-keywords',
      data: {
        keywords,
        matchAll,
        results: matchedFeatures.slice(0, 10).map((f) => ({
          id: f.id,
          title: f.title,
          status: f.status,
          category: f.category,
        })),
        count,
        speechText,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to find features by keywords:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while searching your features.',
      commandName: 'find-features-by-keywords',
      error: errorMessage,
    };
  }
}

/**
 * Get Feature by Identifier
 *
 * Finds a feature by ID or exact title match.
 * Useful for voice queries like "show me the login feature" or "get feature 123"
 *
 * @param context - Voice script context
 * @param identifier - Feature ID or title to look up
 * @returns VoiceCommandResult with the feature details
 */
export async function getFeatureByIdentifier(
  context: VoiceScriptContext,
  identifier: string
): Promise<VoiceCommandResult> {
  try {
    if (!identifier || !identifier.trim()) {
      return {
        success: false,
        response: 'Please specify a feature ID or title.',
        commandName: 'get-feature-by-identifier',
        error: 'Identifier is required',
      };
    }

    logger.info(`Looking up feature: "${identifier}"`, { projectPath: context.projectPath });

    const trimmedId = identifier.trim();

    // First, try exact ID match
    let feature = await context.featureLoader.get(context.projectPath, trimmedId);

    // If not found by ID, try title match
    if (!feature) {
      feature = await context.featureLoader.findByTitle(context.projectPath, trimmedId);
    }

    // If still not found, do a fuzzy search and suggest
    if (!feature) {
      const allFeatures = await context.featureLoader.getAll(context.projectPath);
      const matches = searchFeaturesInMemory(allFeatures, {
        query: trimmedId,
        searchTitle: true,
        searchDescription: false,
        limit: 3,
      });

      if (matches.length > 0) {
        const suggestions = matches.map((m) => m.feature.title || 'Untitled').join(', ');
        return {
          success: false,
          response: `Feature "${trimmedId}" not found. Did you mean: ${suggestions}?`,
          commandName: 'get-feature-by-identifier',
          error: 'Feature not found',
          data: {
            suggestions: matches.map((m) => ({
              id: m.feature.id,
              title: m.feature.title,
            })),
            speechText: `I couldn't find a feature called "${trimmedId}". Did you mean ${matches[0].feature.title}?`,
          },
        };
      }

      return {
        success: false,
        response: `Feature "${trimmedId}" not found.`,
        commandName: 'get-feature-by-identifier',
        error: 'Feature not found',
        data: {
          speechText: `I couldn't find a feature called "${trimmedId}".`,
        },
      };
    }

    // Format feature details
    const title = feature.title || 'Untitled';
    const status = formatStatus(feature.status);
    const category = feature.category !== 'Uncategorized' ? feature.category : 'No category';
    const favorite = feature.isFavorite ? '⭐ Favorite' : '';
    const description = feature.description
      ? feature.description.length > 200
        ? feature.description.substring(0, 200) + '...'
        : feature.description
      : 'No description';

    const displayLines = [
      `## ${title}${favorite ? ' ' + favorite : ''}`,
      '',
      `**ID:** ${feature.id}`,
      `**Status:** ${status}`,
      `**Category:** ${category}`,
      '',
      '### Description',
      description,
    ];

    if (feature.summary) {
      displayLines.push('', '### Summary', feature.summary);
    }

    const speechText = `Found the feature "${title}". It's ${status} and ${feature.description ? 'has a description' : 'has no description yet'}.`;

    return {
      success: true,
      response: displayLines.join('\n'),
      commandName: 'get-feature-by-identifier',
      data: {
        feature: {
          id: feature.id,
          title: feature.title,
          description: feature.description,
          status: feature.status,
          category: feature.category,
          isFavorite: feature.isFavorite,
          summary: feature.summary,
        },
        speechText,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to get feature:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while looking up that feature.',
      commandName: 'get-feature-by-identifier',
      error: errorMessage,
    };
  }
}
