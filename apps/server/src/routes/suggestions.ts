/**
 * Suggestions routes - HTTP API for AI-powered feature suggestions
 *
 * Consolidated from suggestions/ directory into a single flat file.
 *
 * Model is configurable via phaseModels.suggestionsModel in settings
 * (AI Suggestions in the UI). Supports both Claude and Cursor models.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { EventEmitter } from '../lib/events.js';
import { createLogger } from '@dmaker/utils';
import { DEFAULT_PHASE_MODELS, isCursorModel, type ThinkingLevel } from '@dmaker/types';
import { resolvePhaseModel } from '@dmaker/model-resolver';
import { extractJsonWithArray } from '../lib/json-extractor.js';
import { streamingQuery } from '../providers/simple-query-service.js';
import { FeatureLoader } from '../services/feature-loader.js';
import { getAppSpecPath, secureFs } from '@dmaker/platform';
import type { SettingsService } from '../services/settings-service.js';
import { getAutoLoadClaudeMdSetting, getPromptCustomization } from '../lib/settings-helpers.js';
import { validatePathParams } from '../middleware.js';

// ---------------------------------------------------------------------------
// Logger & error helpers
// ---------------------------------------------------------------------------

const logger = createLogger('Suggestions');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`Suggestions ${context}:`, error);
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let isRunning = false;
let currentAbortController: AbortController | null = null;

/**
 * Get the current running state
 */
function getSuggestionsStatus(): {
  isRunning: boolean;
  currentAbortController: AbortController | null;
} {
  return { isRunning, currentAbortController };
}

/**
 * Set the running state and abort controller
 */
function setRunningState(running: boolean, controller: AbortController | null = null): void {
  isRunning = running;
  currentAbortController = controller;
}

// ---------------------------------------------------------------------------
// Generate suggestions business logic
// ---------------------------------------------------------------------------

/**
 * Extract implemented features from app_spec.txt XML content
 *
 * Note: This uses regex-based parsing which is sufficient for our controlled
 * XML structure. If more complex XML parsing is needed in the future, consider
 * using a library like 'fast-xml-parser' or 'xml2js'.
 */
function extractImplementedFeatures(specContent: string): string[] {
  const features: string[] = [];

  // Match <implemented_features>...</implemented_features> section
  const implementedMatch = specContent.match(
    /<implemented_features>([\s\S]*?)<\/implemented_features>/
  );

  if (implementedMatch) {
    const implementedSection = implementedMatch[1];

    // Extract feature names from <name>...</name> tags using matchAll
    const nameRegex = /<name>(.*?)<\/name>/g;
    const matches = implementedSection.matchAll(nameRegex);

    for (const match of matches) {
      features.push(match[1].trim());
    }
  }

  return features;
}

/**
 * Load existing context (app spec and backlog features) to avoid duplicates
 */
async function loadExistingContext(projectPath: string): Promise<string> {
  let context = '';

  // 1. Read app_spec.txt for implemented features
  try {
    const appSpecPath = getAppSpecPath(projectPath);
    const specContent = (await secureFs.readFile(appSpecPath, 'utf-8')) as string;

    if (specContent && specContent.trim().length > 0) {
      const implementedFeatures = extractImplementedFeatures(specContent);

      if (implementedFeatures.length > 0) {
        context += '\n\n=== ALREADY IMPLEMENTED FEATURES ===\n';
        context += 'These features are already implemented in the codebase:\n';
        context += implementedFeatures.map((feature) => `- ${feature}`).join('\n') + '\n';
      }
    }
  } catch (error) {
    // app_spec.txt doesn't exist or can't be read - that's okay
    logger.debug('No app_spec.txt found or error reading it:', error);
  }

  // 2. Load existing features from backlog
  try {
    const featureLoader = new FeatureLoader();
    const features = await featureLoader.getAll(projectPath);

    if (features.length > 0) {
      context += '\n\n=== EXISTING FEATURES IN BACKLOG ===\n';
      context += 'These features are already planned or in progress:\n';
      context +=
        features
          .map((feature) => {
            const status = feature.status || 'pending';
            const title = feature.title || feature.description?.substring(0, 50) || 'Untitled';
            return `- ${title} (${status})`;
          })
          .join('\n') + '\n';
    }
  } catch (error) {
    // Features directory doesn't exist or can't be read - that's okay
    logger.debug('No features found or error loading them:', error);
  }

  return context;
}

/**
 * JSON Schema for suggestions output
 */
const suggestionsSchema = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          category: { type: 'string' },
          description: { type: 'string' },
          priority: {
            type: 'number',
            minimum: 1,
            maximum: 3,
          },
          reasoning: { type: 'string' },
        },
        required: ['category', 'description', 'priority', 'reasoning'],
      },
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
};

async function generateSuggestions(
  projectPath: string,
  suggestionType: string,
  events: EventEmitter,
  abortController: AbortController,
  settingsService?: SettingsService,
  modelOverride?: string,
  thinkingLevelOverride?: ThinkingLevel
): Promise<void> {
  // Get customized prompts from settings
  const prompts = await getPromptCustomization(settingsService, '[Suggestions]');

  // Map suggestion types to their prompts
  const typePrompts: Record<string, string> = {
    features: prompts.suggestions.featuresPrompt,
    refactoring: prompts.suggestions.refactoringPrompt,
    security: prompts.suggestions.securityPrompt,
    performance: prompts.suggestions.performancePrompt,
  };

  // Load existing context to avoid duplicates
  const existingContext = await loadExistingContext(projectPath);

  const prompt = `${typePrompts[suggestionType] || typePrompts.features}
${existingContext}

${existingContext ? '\nIMPORTANT: Do NOT suggest features that are already implemented or already in the backlog above. Focus on NEW ideas that complement what already exists.\n' : ''}
${prompts.suggestions.baseTemplate}`;

  // Don't send initial message - let the agent output speak for itself
  // The first agent message will be captured as an info entry

  // Load autoLoadClaudeMd setting
  const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
    projectPath,
    settingsService,
    '[Suggestions]'
  );

  // Get model from phase settings (AI Suggestions = suggestionsModel)
  // Use override if provided, otherwise fall back to settings
  const settings = await settingsService?.getGlobalSettings();
  let model: string;
  let thinkingLevel: ThinkingLevel | undefined;

  if (modelOverride) {
    // Use explicit override - resolve the model string
    const resolved = resolvePhaseModel({
      model: modelOverride,
      thinkingLevel: thinkingLevelOverride,
    });
    model = resolved.model;
    thinkingLevel = resolved.thinkingLevel;
  } else {
    // Use settings-based model
    const phaseModelEntry =
      settings?.phaseModels?.suggestionsModel || DEFAULT_PHASE_MODELS.suggestionsModel;
    const resolved = resolvePhaseModel(phaseModelEntry);
    model = resolved.model;
    thinkingLevel = resolved.thinkingLevel;
  }

  logger.info('[Suggestions] Using model:', model);

  let responseText = '';

  // Determine if we should use structured output (Claude supports it, Cursor doesn't)
  const useStructuredOutput = !isCursorModel(model);

  // Build the final prompt - for Cursor, include JSON schema instructions
  let finalPrompt = prompt;
  if (!useStructuredOutput) {
    finalPrompt = `${prompt}

CRITICAL INSTRUCTIONS:
1. DO NOT write any files. Return the JSON in your response only.
2. After analyzing the project, respond with ONLY a JSON object - no explanations, no markdown, just raw JSON.
3. The JSON must match this exact schema:

${JSON.stringify(suggestionsSchema, null, 2)}

Your entire response should be valid JSON starting with { and ending with }. No text before or after.`;
  }

  // Use streamingQuery with event callbacks
  const result = await streamingQuery({
    prompt: finalPrompt,
    model,
    cwd: projectPath,
    maxTurns: 250,
    allowedTools: ['Read', 'Glob', 'Grep'],
    abortController,
    thinkingLevel,
    readOnly: true, // Suggestions only reads code, doesn't write
    settingSources: autoLoadClaudeMd ? ['user', 'project', 'local'] : undefined,
    outputFormat: useStructuredOutput
      ? {
          type: 'json_schema',
          schema: suggestionsSchema,
        }
      : undefined,
    onText: (text) => {
      responseText += text;
      events.emit('suggestions:event', {
        type: 'suggestions_progress',
        content: text,
      });
    },
    onToolUse: (tool, input) => {
      events.emit('suggestions:event', {
        type: 'suggestions_tool',
        tool,
        input,
      });
    },
  });

  // Use structured output if available, otherwise fall back to parsing text
  try {
    let structuredOutput: { suggestions: Array<Record<string, unknown>> } | null = null;

    if (result.structured_output) {
      structuredOutput = result.structured_output as {
        suggestions: Array<Record<string, unknown>>;
      };
      logger.debug('Received structured output:', structuredOutput);
    } else if (responseText) {
      // Fallback: try to parse from text using shared extraction utility
      logger.warn('No structured output received, attempting to parse from text');
      structuredOutput = extractJsonWithArray<{ suggestions: Array<Record<string, unknown>> }>(
        responseText,
        'suggestions',
        { logger }
      );
    }

    if (structuredOutput && structuredOutput.suggestions) {
      // Use structured output directly
      events.emit('suggestions:event', {
        type: 'suggestions_complete',
        suggestions: structuredOutput.suggestions.map((s: Record<string, unknown>, i: number) => ({
          ...s,
          id: s.id || `suggestion-${Date.now()}-${i}`,
        })),
      });
    } else {
      throw new Error('No valid JSON found in response');
    }
  } catch (error) {
    // Log the parsing error for debugging
    logger.error('Failed to parse suggestions JSON from AI response:', error);
    // Return generic suggestions if parsing fails
    events.emit('suggestions:event', {
      type: 'suggestions_complete',
      suggestions: [
        {
          id: `suggestion-${Date.now()}-0`,
          category: 'Analysis',
          description: 'Review the AI analysis output for insights',
          priority: 1,
          reasoning: 'The AI provided analysis but suggestions need manual review',
        },
      ],
    });
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function createGenerateHandler(events: EventEmitter, settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        suggestionType = 'features',
        model,
        thinkingLevel,
      } = req.body as {
        projectPath: string;
        suggestionType?: string;
        model?: string;
        thinkingLevel?: ThinkingLevel;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      const { isRunning } = getSuggestionsStatus();
      if (isRunning) {
        res.json({
          success: false,
          error: 'Suggestions generation is already running',
        });
        return;
      }

      setRunningState(true);
      const abortController = new AbortController();
      setRunningState(true, abortController);

      // Start generation in background
      generateSuggestions(
        projectPath,
        suggestionType,
        events,
        abortController,
        settingsService,
        model,
        thinkingLevel
      )
        .catch((error) => {
          logError(error, 'Generate suggestions failed (background)');
          events.emit('suggestions:event', {
            type: 'suggestions_error',
            error: getErrorMessage(error),
          });
        })
        .finally(() => {
          setRunningState(false, null);
        });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Generate suggestions failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createStatusHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const { isRunning } = getSuggestionsStatus();
      res.json({ success: true, isRunning });
    } catch (error) {
      logError(error, 'Get status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createStopHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const { currentAbortController } = getSuggestionsStatus();
      if (currentAbortController) {
        currentAbortController.abort();
      }
      setRunningState(false, null);
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Stop suggestions failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createSuggestionsRoutes(
  events: EventEmitter,
  settingsService?: SettingsService
): Router {
  const router = Router();

  router.post(
    '/generate',
    validatePathParams('projectPath'),
    createGenerateHandler(events, settingsService)
  );
  router.post('/stop', createStopHandler());
  router.get('/status', createStatusHandler());

  return router;
}
