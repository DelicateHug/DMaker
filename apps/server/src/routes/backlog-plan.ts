/**
 * Backlog Plan routes - HTTP API for AI-assisted backlog modification
 *
 * Consolidated from backlog-plan/ directory into a single flat file.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { EventEmitter } from '../lib/events.js';
import type {
  Feature,
  BacklogPlanResult,
  BacklogChange,
  DependencyUpdate,
  ThinkingLevel,
} from '@dmaker/types';
import { DEFAULT_PHASE_MODELS, isCursorModel, stripProviderPrefix } from '@dmaker/types';
import { createLogger } from '@dmaker/utils';
import { ensureDmakerDir, getDmakerDir, secureFs } from '@dmaker/platform';
import { resolvePhaseModel } from '@dmaker/model-resolver';
import { validatePathParams } from '../middleware.js';
import { FeatureLoader } from '../services/feature-loader.js';
import { ProviderFactory } from '../providers/provider-factory.js';
import { extractJsonWithArray } from '../lib/json-extractor.js';
import type { SettingsService } from '../services/settings-service.js';
import { getAutoLoadClaudeMdSetting, getPromptCustomization } from '../lib/settings-helpers.js';
import path from 'path';

// ---------------------------------------------------------------------------
// Logger & error helpers
// ---------------------------------------------------------------------------

const logger = createLogger('BacklogPlan');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`[BacklogPlan] ${context}:`, getErrorMessage(error));
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let isRunning = false;
let currentAbortController: AbortController | null = null;
let runningDetails: {
  projectPath: string;
  prompt: string;
  model?: string;
  startedAt: string;
} | null = null;

const BACKLOG_PLAN_FILENAME = 'backlog-plan.json';

export interface StoredBacklogPlan {
  savedAt: string;
  prompt: string;
  model?: string;
  result: BacklogPlanResult;
}

export function getBacklogPlanStatus(): { isRunning: boolean } {
  return { isRunning };
}

export function setRunningState(running: boolean, abortController?: AbortController | null): void {
  isRunning = running;
  if (!running) {
    runningDetails = null;
  }
  if (abortController !== undefined) {
    currentAbortController = abortController;
  }
}

export function setRunningDetails(
  details: {
    projectPath: string;
    prompt: string;
    model?: string;
    startedAt: string;
  } | null
): void {
  runningDetails = details;
}

export function getRunningDetails(): {
  projectPath: string;
  prompt: string;
  model?: string;
  startedAt: string;
} | null {
  return runningDetails;
}

function getBacklogPlanPath(projectPath: string): string {
  return path.join(getDmakerDir(projectPath), BACKLOG_PLAN_FILENAME);
}

async function saveBacklogPlan(projectPath: string, plan: StoredBacklogPlan): Promise<void> {
  await ensureDmakerDir(projectPath);
  const filePath = getBacklogPlanPath(projectPath);
  await secureFs.writeFile(filePath, JSON.stringify(plan, null, 2), 'utf-8');
}

async function loadBacklogPlan(projectPath: string): Promise<StoredBacklogPlan | null> {
  try {
    const filePath = getBacklogPlanPath(projectPath);
    const raw = await secureFs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw as string) as StoredBacklogPlan;
    if (!Array.isArray(parsed?.result?.changes)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function clearBacklogPlan(projectPath: string): Promise<void> {
  try {
    const filePath = getBacklogPlanPath(projectPath);
    await secureFs.unlink(filePath);
  } catch {
    // ignore missing file
  }
}

function getAbortController(): AbortController | null {
  return currentAbortController;
}

// ---------------------------------------------------------------------------
// Generate plan business logic
// ---------------------------------------------------------------------------

const featureLoader = new FeatureLoader();

/**
 * Format features for the AI prompt
 */
function formatFeaturesForPrompt(features: Feature[]): string {
  if (features.length === 0) {
    return 'No features in backlog yet.';
  }

  return features
    .map((f) => {
      const deps = f.dependencies?.length ? `Dependencies: [${f.dependencies.join(', ')}]` : '';
      const priority = f.priority !== undefined ? `Priority: ${f.priority}` : '';
      return `- ID: ${f.id}
  Title: ${f.title || 'Untitled'}
  Description: ${f.description}
  Category: ${f.category}
  Status: ${f.status || 'backlog'}
  ${priority}
  ${deps}`.trim();
    })
    .join('\n\n');
}

/**
 * Parse the AI response into a BacklogPlanResult
 */
function parsePlanResponse(response: string): BacklogPlanResult {
  // Use shared JSON extraction utility for robust parsing
  // extractJsonWithArray validates that 'changes' exists AND is an array
  const parsed = extractJsonWithArray<BacklogPlanResult>(response, 'changes', {
    logger,
  });

  if (parsed) {
    return parsed;
  }

  // If parsing fails, log details and return an empty result
  logger.warn('[BacklogPlan] Failed to parse AI response as JSON');
  logger.warn('[BacklogPlan] Response text length:', response.length);
  logger.warn('[BacklogPlan] Response preview:', response.slice(0, 500));
  if (response.length === 0) {
    logger.error('[BacklogPlan] Response text is EMPTY! No content was extracted from stream.');
  }
  return {
    changes: [],
    summary: 'Failed to parse AI response',
    dependencyUpdates: [],
  };
}

/**
 * Generate a backlog modification plan based on user prompt
 */
async function generateBacklogPlan(
  projectPath: string,
  prompt: string,
  events: EventEmitter,
  abortController: AbortController,
  settingsService?: SettingsService,
  model?: string
): Promise<BacklogPlanResult> {
  try {
    // Load current features
    const features = await featureLoader.getAll(projectPath);

    events.emit('backlog-plan:event', {
      type: 'backlog_plan_progress',
      content: `Loaded ${features.length} features from backlog`,
    });

    // Load prompts from settings
    const prompts = await getPromptCustomization(settingsService, '[BacklogPlan]');

    // Build the system prompt
    const systemPrompt = prompts.backlogPlan.systemPrompt;

    // Build the user prompt from template
    const currentFeatures = formatFeaturesForPrompt(features);
    const userPrompt = prompts.backlogPlan.userPromptTemplate
      .replace('{{currentFeatures}}', currentFeatures)
      .replace('{{userRequest}}', prompt);

    events.emit('backlog-plan:event', {
      type: 'backlog_plan_progress',
      content: 'Generating plan with AI...',
    });

    // Get the model to use from settings or provided override
    let effectiveModel = model;
    let thinkingLevel: ThinkingLevel | undefined;
    if (!effectiveModel) {
      const settings = await settingsService?.getGlobalSettings();
      const phaseModelEntry =
        settings?.phaseModels?.backlogPlanningModel || DEFAULT_PHASE_MODELS.backlogPlanningModel;
      const resolved = resolvePhaseModel(phaseModelEntry);
      effectiveModel = resolved.model;
      thinkingLevel = resolved.thinkingLevel;
    }
    logger.info('[BacklogPlan] Using model:', effectiveModel);

    const provider = ProviderFactory.getProviderForModel(effectiveModel);
    // Strip provider prefix - providers expect bare model IDs
    const bareModel = stripProviderPrefix(effectiveModel);

    // Get autoLoadClaudeMd setting
    const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
      projectPath,
      settingsService,
      '[BacklogPlan]'
    );

    // For Cursor models, we need to combine prompts with explicit instructions
    // because Cursor doesn't support systemPrompt separation like Claude SDK
    let finalPrompt = userPrompt;
    let finalSystemPrompt: string | undefined = systemPrompt;

    if (isCursorModel(effectiveModel)) {
      logger.info('[BacklogPlan] Using Cursor model - adding explicit no-file-write instructions');
      finalPrompt = `${systemPrompt}

CRITICAL INSTRUCTIONS:
1. DO NOT write any files. Return the JSON in your response only.
2. DO NOT use Write, Edit, or any file modification tools.
3. Respond with ONLY a JSON object - no explanations, no markdown, just raw JSON.
4. Your entire response should be valid JSON starting with { and ending with }.
5. No text before or after the JSON object.

${userPrompt}`;
      finalSystemPrompt = undefined; // System prompt is now embedded in the user prompt
    }

    // Execute the query
    const stream = provider.executeQuery({
      prompt: finalPrompt,
      model: bareModel,
      cwd: projectPath,
      systemPrompt: finalSystemPrompt,
      maxTurns: 1,
      allowedTools: [], // No tools needed for this
      abortController,
      settingSources: autoLoadClaudeMd ? ['user', 'project'] : undefined,
      readOnly: true, // Plan generation only generates text, doesn't write files
      thinkingLevel, // Pass thinking level for extended thinking
    });

    let responseText = '';

    for await (const msg of stream) {
      if (abortController.signal.aborted) {
        throw new Error('Generation aborted');
      }

      if (msg.type === 'assistant') {
        if (msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              responseText += block.text;
            }
          }
        }
      } else if (msg.type === 'result' && msg.subtype === 'success' && msg.result) {
        // Use result if it's a final accumulated message (from Cursor provider)
        logger.info('[BacklogPlan] Received result from Cursor, length:', msg.result.length);
        logger.info('[BacklogPlan] Previous responseText length:', responseText.length);
        if (msg.result.length > responseText.length) {
          logger.info('[BacklogPlan] Using Cursor result (longer than accumulated text)');
          responseText = msg.result;
        } else {
          logger.info('[BacklogPlan] Keeping accumulated text (longer than Cursor result)');
        }
      }
    }

    // Parse the response
    const result = parsePlanResponse(responseText);

    await saveBacklogPlan(projectPath, {
      savedAt: new Date().toISOString(),
      prompt,
      model: effectiveModel,
      result,
    });

    events.emit('backlog-plan:event', {
      type: 'backlog_plan_complete',
      result,
    });

    return result;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error('[BacklogPlan] Generation failed:', errorMessage);

    events.emit('backlog-plan:event', {
      type: 'backlog_plan_error',
      error: errorMessage,
    });

    throw error;
  } finally {
    setRunningState(false, null);
    setRunningDetails(null);
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function createGenerateHandler(events: EventEmitter, settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, prompt, model } = req.body as {
        projectPath: string;
        prompt: string;
        model?: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      if (!prompt) {
        res.status(400).json({ success: false, error: 'prompt required' });
        return;
      }

      const { isRunning } = getBacklogPlanStatus();
      if (isRunning) {
        res.json({
          success: false,
          error: 'Backlog plan generation is already running',
        });
        return;
      }

      setRunningState(true);
      setRunningDetails({
        projectPath,
        prompt,
        model,
        startedAt: new Date().toISOString(),
      });
      const abortController = new AbortController();
      setRunningState(true, abortController);

      // Start generation in background
      generateBacklogPlan(projectPath, prompt, events, abortController, settingsService, model)
        .catch((error) => {
          logError(error, 'Generate backlog plan failed (background)');
          events.emit('backlog-plan:event', {
            type: 'backlog_plan_error',
            error: getErrorMessage(error),
          });
        })
        .finally(() => {
          setRunningState(false, null);
          setRunningDetails(null);
        });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Generate backlog plan failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createStatusHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const status = getBacklogPlanStatus();
      const projectPath = typeof req.query.projectPath === 'string' ? req.query.projectPath : '';
      const savedPlan = projectPath ? await loadBacklogPlan(projectPath) : null;
      res.json({ success: true, ...status, savedPlan });
    } catch (error) {
      logError(error, 'Get backlog plan status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createStopHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const abortController = getAbortController();
      if (abortController) {
        abortController.abort();
        setRunningState(false, null);
        setRunningDetails(null);
      }
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Stop backlog plan failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

const applyFeatureLoader = new FeatureLoader();

function createApplyHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        plan,
        branchName: rawBranchName,
      } = req.body as {
        projectPath: string;
        plan: BacklogPlanResult;
        branchName?: string;
      };

      // Validate branchName: must be undefined or a non-empty trimmed string
      const branchName =
        typeof rawBranchName === 'string' && rawBranchName.trim().length > 0
          ? rawBranchName.trim()
          : undefined;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      if (!plan || !plan.changes) {
        res.status(400).json({ success: false, error: 'plan with changes required' });
        return;
      }

      const appliedChanges: string[] = [];

      // Load current features for dependency validation
      const allFeatures = await applyFeatureLoader.getAll(projectPath);
      const featureMap = new Map(allFeatures.map((f) => [f.id, f]));

      // Process changes in order: deletes first, then adds, then updates
      // This ensures we can remove dependencies before they cause issues

      // 1. First pass: Handle deletes
      const deletions = plan.changes.filter((c) => c.type === 'delete');
      for (const change of deletions) {
        if (!change.featureId) continue;

        try {
          // Before deleting, update any features that depend on this one
          for (const feature of allFeatures) {
            if (feature.dependencies?.includes(change.featureId)) {
              const newDeps = feature.dependencies.filter((d) => d !== change.featureId);
              await applyFeatureLoader.update(projectPath, feature.id, { dependencies: newDeps });
              logger.info(
                `[BacklogPlan] Removed dependency ${change.featureId} from ${feature.id}`
              );
            }
          }

          // Now delete the feature
          const deleted = await applyFeatureLoader.delete(projectPath, change.featureId);
          if (deleted) {
            appliedChanges.push(`deleted:${change.featureId}`);
            featureMap.delete(change.featureId);
            logger.info(`[BacklogPlan] Deleted feature ${change.featureId}`);
          }
        } catch (error) {
          logger.error(
            `[BacklogPlan] Failed to delete ${change.featureId}:`,
            getErrorMessage(error)
          );
        }
      }

      // 2. Second pass: Handle adds
      const additions = plan.changes.filter((c) => c.type === 'add');
      for (const change of additions) {
        if (!change.feature) continue;

        try {
          // Create the new feature
          const newFeature = await applyFeatureLoader.create(projectPath, {
            title: change.feature.title,
            description: change.feature.description || '',
            category: change.feature.category || 'Uncategorized',
            dependencies: change.feature.dependencies,
            priority: change.feature.priority,
            status: 'backlog',
            branchName,
          });

          appliedChanges.push(`added:${newFeature.id}`);
          featureMap.set(newFeature.id, newFeature);
          logger.info(`[BacklogPlan] Created feature ${newFeature.id}: ${newFeature.title}`);
        } catch (error) {
          logger.error(`[BacklogPlan] Failed to add feature:`, getErrorMessage(error));
        }
      }

      // 3. Third pass: Handle updates
      const updates = plan.changes.filter((c) => c.type === 'update');
      for (const change of updates) {
        if (!change.featureId || !change.feature) continue;

        try {
          const updated = await applyFeatureLoader.update(
            projectPath,
            change.featureId,
            change.feature
          );
          appliedChanges.push(`updated:${change.featureId}`);
          featureMap.set(change.featureId, updated);
          logger.info(`[BacklogPlan] Updated feature ${change.featureId}`);
        } catch (error) {
          logger.error(
            `[BacklogPlan] Failed to update ${change.featureId}:`,
            getErrorMessage(error)
          );
        }
      }

      // 4. Apply dependency updates from the plan
      if (plan.dependencyUpdates) {
        for (const depUpdate of plan.dependencyUpdates) {
          try {
            const feature = featureMap.get(depUpdate.featureId);
            if (feature) {
              const currentDeps = feature.dependencies || [];
              const newDeps = currentDeps
                .filter((d) => !depUpdate.removedDependencies.includes(d))
                .concat(depUpdate.addedDependencies.filter((d) => !currentDeps.includes(d)));

              await applyFeatureLoader.update(projectPath, depUpdate.featureId, {
                dependencies: newDeps,
              });
              logger.info(`[BacklogPlan] Updated dependencies for ${depUpdate.featureId}`);
            }
          } catch (error) {
            logger.error(
              `[BacklogPlan] Failed to update dependencies for ${depUpdate.featureId}:`,
              getErrorMessage(error)
            );
          }
        }
      }

      // Clear the plan before responding
      try {
        await clearBacklogPlan(projectPath);
      } catch (error) {
        logger.warn(
          `[BacklogPlan] Failed to clear backlog plan after apply:`,
          getErrorMessage(error)
        );
        // Don't throw - operation succeeded, just cleanup failed
      }

      res.json({
        success: true,
        appliedChanges,
      });
    } catch (error) {
      logError(error, 'Apply backlog plan failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createClearHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      await clearBacklogPlan(projectPath);
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Clear backlog plan failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createBacklogPlanRoutes(
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
  router.get('/status', validatePathParams('projectPath'), createStatusHandler());
  router.post('/apply', validatePathParams('projectPath'), createApplyHandler());
  router.post('/clear', validatePathParams('projectPath'), createClearHandler());

  return router;
}
