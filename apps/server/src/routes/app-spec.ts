/**
 * Spec Regeneration routes - HTTP API for AI-powered spec generation
 *
 * Consolidated from app-spec/ directory into a single module.
 */

import path from 'path';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { secureFs, ensureDmakerDir, getAppSpecPath, getFeaturesDir } from '@dmaker/platform';
import type { EventEmitter } from '../lib/events.js';
import { specOutputSchema, specToXml, type SpecOutput } from '../lib/app-spec-format.js';
import { createLogger, atomicWriteJson, DEFAULT_BACKUP_COUNT } from '@dmaker/utils';
import { DEFAULT_PHASE_MODELS, isCursorModel } from '@dmaker/types';
import { resolvePhaseModel } from '@dmaker/model-resolver';
import { extractJson } from '../lib/json-extractor.js';
import { extractJsonWithArray } from '../lib/json-extractor.js';
import { streamingQuery } from '../providers/simple-query-service.js';
import type { SettingsService } from '../services/settings-service.js';
import { getAutoLoadClaudeMdSetting, getPromptCustomization } from '../lib/settings-helpers.js';
import { FeatureLoader } from '../services/feature-loader.js';
import {
  extractImplementedFeatures,
  extractTechnologyStack,
  extractRoadmapPhases,
  updateImplementedFeaturesSection,
  updateTechnologyStack,
  updateRoadmapPhaseStatus,
  type ImplementedFeature,
  type RoadmapPhase,
} from '../lib/xml-extractor.js';
import { getNotificationService } from '../services/notification-service.js';

// ─── Logger & Helpers ────────────────────────────────────────────────────────

const logger = createLogger('SpecRegeneration');
const syncLogger = createLogger('SpecSync');

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`❌ ${context}:`);
  logger.error('Error name:', (error as any)?.name);
  logger.error('Error message:', (error as Error)?.message);
  logger.error('Error stack:', (error as Error)?.stack);
  logger.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
}

// ─── Common State Management ─────────────────────────────────────────────────

export type GenerationType = 'spec_regeneration' | 'feature_generation' | 'sync';

interface RunningGeneration {
  isRunning: boolean;
  type: GenerationType;
  startedAt: string;
}

const runningProjects = new Map<string, RunningGeneration>();
const abortControllers = new Map<string, AbortController>();

export function getSpecRegenerationStatus(projectPath?: string): {
  isRunning: boolean;
  currentAbortController: AbortController | null;
  projectPath?: string;
  type?: GenerationType;
  startedAt?: string;
} {
  if (projectPath) {
    const generation = runningProjects.get(projectPath);
    return {
      isRunning: generation?.isRunning || false,
      currentAbortController: abortControllers.get(projectPath) || null,
      projectPath,
      type: generation?.type,
      startedAt: generation?.startedAt,
    };
  }
  const isAnyRunning = Array.from(runningProjects.values()).some((g) => g.isRunning);
  return { isRunning: isAnyRunning, currentAbortController: null };
}

export function getRunningProjectPath(): string | null {
  for (const [path, running] of runningProjects.entries()) {
    if (running) return path;
  }
  return null;
}

export function setRunningState(
  projectPath: string,
  running: boolean,
  controller: AbortController | null = null,
  type: GenerationType = 'spec_regeneration'
): void {
  if (running) {
    runningProjects.set(projectPath, {
      isRunning: true,
      type,
      startedAt: new Date().toISOString(),
    });
    if (controller) {
      abortControllers.set(projectPath, controller);
    }
  } else {
    runningProjects.delete(projectPath);
    abortControllers.delete(projectPath);
  }
}

export function getAllRunningGenerations(): Array<{
  projectPath: string;
  type: GenerationType;
  startedAt: string;
}> {
  const results: Array<{
    projectPath: string;
    type: GenerationType;
    startedAt: string;
  }> = [];

  for (const [projectPath, generation] of runningProjects.entries()) {
    if (generation.isRunning) {
      results.push({
        projectPath,
        type: generation.type,
        startedAt: generation.startedAt,
      });
    }
  }

  return results;
}

function logAuthStatus(context: string): void {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  logger.info(`${context} - Auth Status:`);
  logger.info(
    `  ANTHROPIC_API_KEY: ${
      hasApiKey ? 'SET (' + process.env.ANTHROPIC_API_KEY?.substring(0, 20) + '...)' : 'NOT SET'
    }`
  );

  if (!hasApiKey) {
    logger.warn('⚠️  WARNING: No authentication configured! SDK will fail.');
  }
}

// ─── Parse and Create Features ───────────────────────────────────────────────

async function parseAndCreateFeatures(
  projectPath: string,
  content: string,
  events: EventEmitter
): Promise<void> {
  logger.info('========== parseAndCreateFeatures() started ==========');
  logger.info(`Content length: ${content.length} chars`);
  logger.info('========== CONTENT RECEIVED FOR PARSING ==========');
  logger.info(content);
  logger.info('========== END CONTENT ==========');

  try {
    logger.info('Extracting JSON from response using extractJsonWithArray...');

    interface FeaturesResponse {
      features: Array<{
        id: string;
        category?: string;
        title: string;
        description: string;
        priority?: number;
        complexity?: string;
        dependencies?: string[];
      }>;
    }

    const parsed = extractJsonWithArray<FeaturesResponse>(content, 'features', { logger });

    if (!parsed || !parsed.features) {
      logger.error('❌ No valid JSON with "features" array found in response');
      logger.error('Full content received:');
      logger.error(content);
      throw new Error('No valid JSON found in response');
    }

    logger.info(`Parsed ${parsed.features?.length || 0} features`);
    logger.info('Parsed features:', JSON.stringify(parsed.features, null, 2));

    const featuresDir = getFeaturesDir(projectPath);
    await secureFs.mkdir(featuresDir, { recursive: true });

    const createdFeatures: Array<{ id: string; title: string }> = [];

    for (const feature of parsed.features) {
      logger.debug('Creating feature:', feature.id);
      const featureDir = path.join(featuresDir, feature.id);
      await secureFs.mkdir(featureDir, { recursive: true });

      const featureData = {
        id: feature.id,
        category: feature.category || 'Uncategorized',
        title: feature.title,
        description: feature.description,
        status: 'backlog',
        priority: feature.priority || 2,
        complexity: feature.complexity || 'moderate',
        dependencies: feature.dependencies || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await atomicWriteJson(path.join(featureDir, 'feature.json'), featureData, {
        backupCount: DEFAULT_BACKUP_COUNT,
      });

      createdFeatures.push({ id: feature.id, title: feature.title });
    }

    logger.info(`✓ Created ${createdFeatures.length} features successfully`);

    events.emit('spec-regeneration:event', {
      type: 'spec_regeneration_complete',
      message: `Spec regeneration complete! Created ${createdFeatures.length} features.`,
      projectPath: projectPath,
    });

    const notificationService = getNotificationService();
    await notificationService.createNotification({
      type: 'spec_regeneration_complete',
      title: 'Spec Generation Complete',
      message: `Created ${createdFeatures.length} features from the project specification.`,
      projectPath: projectPath,
    });
  } catch (error) {
    logger.error('❌ parseAndCreateFeatures() failed:');
    logger.error('Error:', error);
    events.emit('spec-regeneration:event', {
      type: 'spec_regeneration_error',
      error: (error as Error).message,
      projectPath: projectPath,
    });
  }

  logger.debug('========== parseAndCreateFeatures() completed ==========');
}

// ─── Generate Features from Spec ─────────────────────────────────────────────

const DEFAULT_MAX_FEATURES = 50;

async function generateFeaturesFromSpec(
  projectPath: string,
  events: EventEmitter,
  abortController: AbortController,
  maxFeatures?: number,
  settingsService?: SettingsService
): Promise<void> {
  const featureCount = maxFeatures ?? DEFAULT_MAX_FEATURES;
  logger.debug('========== generateFeaturesFromSpec() started ==========');
  logger.debug('projectPath:', projectPath);
  logger.debug('maxFeatures:', featureCount);

  const specPath = getAppSpecPath(projectPath);
  let spec: string;

  logger.debug('Reading spec from:', specPath);

  try {
    spec = (await secureFs.readFile(specPath, 'utf-8')) as string;
    logger.info(`Spec loaded successfully (${spec.length} chars)`);
    logger.info(`Spec preview (first 500 chars): ${spec.substring(0, 500)}`);
    logger.info(`Spec preview (last 500 chars): ${spec.substring(spec.length - 500)}`);
  } catch (readError) {
    logger.error('❌ Failed to read spec file:', readError);
    events.emit('spec-regeneration:event', {
      type: 'spec_regeneration_error',
      error: 'No project spec found. Generate spec first.',
      projectPath: projectPath,
    });
    return;
  }

  const prompts = await getPromptCustomization(settingsService, '[FeatureGeneration]');

  const featureLoader = new FeatureLoader();
  const existingFeatures = await featureLoader.getAll(projectPath);

  logger.info(`Found ${existingFeatures.length} existing features to exclude from generation`);

  let existingFeaturesContext = '';
  if (existingFeatures.length > 0) {
    const featuresList = existingFeatures
      .map(
        (f) =>
          `- "${f.title}" (ID: ${f.id}): ${f.description?.substring(0, 100) || 'No description'}`
      )
      .join('\n');
    existingFeaturesContext = `

## EXISTING FEATURES (DO NOT REGENERATE THESE)

The following ${existingFeatures.length} features already exist in the project. You MUST NOT generate features that duplicate or overlap with these:

${featuresList}

CRITICAL INSTRUCTIONS:
- DO NOT generate any features with the same or similar titles as the existing features listed above
- DO NOT generate features that cover the same functionality as existing features
- ONLY generate NEW features that are not yet in the system
- If a feature from the roadmap already exists, skip it entirely
- Generate unique feature IDs that do not conflict with existing IDs: ${existingFeatures.map((f) => f.id).join(', ')}
`;
  }

  const prompt = `Based on this project specification:

${spec}
${existingFeaturesContext}
${prompts.appSpec.generateFeaturesFromSpecPrompt}

Generate ${featureCount} NEW features that build on each other logically. Remember: ONLY generate features that DO NOT already exist.`;

  logger.info('========== PROMPT BEING SENT ==========');
  logger.info(`Prompt length: ${prompt.length} chars`);
  logger.info(`Prompt preview (first 1000 chars):\n${prompt.substring(0, 1000)}`);
  logger.info('========== END PROMPT PREVIEW ==========');

  events.emit('spec-regeneration:event', {
    type: 'spec_regeneration_progress',
    content: 'Analyzing spec and generating features...\n',
    projectPath: projectPath,
  });

  const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
    projectPath,
    settingsService,
    '[FeatureGeneration]'
  );

  const settings = await settingsService?.getGlobalSettings();
  const phaseModelEntry =
    settings?.phaseModels?.featureGenerationModel || DEFAULT_PHASE_MODELS.featureGenerationModel;
  const { model, thinkingLevel } = resolvePhaseModel(phaseModelEntry);

  logger.info('Using model:', model);

  const result = await streamingQuery({
    prompt,
    model,
    cwd: projectPath,
    maxTurns: 250,
    allowedTools: ['Read', 'Glob', 'Grep'],
    abortController,
    thinkingLevel,
    readOnly: true,
    settingSources: autoLoadClaudeMd ? ['user', 'project', 'local'] : undefined,
    onText: (text) => {
      logger.debug(`Feature text block received (${text.length} chars)`);
      events.emit('spec-regeneration:event', {
        type: 'spec_regeneration_progress',
        content: text,
        projectPath: projectPath,
      });
    },
  });

  const responseText = result.text;

  logger.info(`Feature stream complete.`);
  logger.info(`Feature response length: ${responseText.length} chars`);
  logger.info('========== FULL RESPONSE TEXT ==========');
  logger.info(responseText);
  logger.info('========== END RESPONSE TEXT ==========');

  await parseAndCreateFeatures(projectPath, responseText, events);

  logger.debug('========== generateFeaturesFromSpec() completed ==========');
}

// ─── Generate Spec ───────────────────────────────────────────────────────────

async function generateSpec(
  projectPath: string,
  projectOverview: string,
  events: EventEmitter,
  abortController: AbortController,
  generateFeatures?: boolean,
  analyzeProject?: boolean,
  maxFeatures?: number,
  settingsService?: SettingsService
): Promise<void> {
  logger.info('========== generateSpec() started ==========');
  logger.info('projectPath:', projectPath);
  logger.info('projectOverview length:', `${projectOverview.length} chars`);
  logger.info('projectOverview preview:', projectOverview.substring(0, 300));
  logger.info('generateFeatures:', generateFeatures);
  logger.info('analyzeProject:', analyzeProject);
  logger.info('maxFeatures:', maxFeatures);

  const prompts = await getPromptCustomization(settingsService, '[SpecRegeneration]');

  let analysisInstructions = '';
  let techStackDefaults = '';

  if (analyzeProject !== false) {
    analysisInstructions = `Based on this overview, analyze the project directory (if it exists) using the Read, Glob, and Grep tools to understand:
- Existing technologies and frameworks
- Project structure and architecture
- Current features and capabilities
- Code patterns and conventions`;
  } else {
    techStackDefaults = `Default Technology Stack:
- Framework: TanStack Start (React-based full-stack framework)
- Database: PostgreSQL with Drizzle ORM
- UI Components: shadcn/ui
- Styling: Tailwind CSS
- Frontend: React

Use these technologies as the foundation for the specification.`;
  }

  const prompt = `${prompts.appSpec.generateSpecSystemPrompt}

Project Overview:
${projectOverview}

${techStackDefaults}

${analysisInstructions}

${prompts.appSpec.structuredSpecInstructions}`;

  logger.info('========== PROMPT BEING SENT ==========');
  logger.info(`Prompt length: ${prompt.length} chars`);
  logger.info(`Prompt preview (first 500 chars):\n${prompt.substring(0, 500)}`);
  logger.info('========== END PROMPT PREVIEW ==========');

  events.emit('spec-regeneration:event', {
    type: 'spec_progress',
    content: 'Starting spec generation...\n',
  });

  const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
    projectPath,
    settingsService,
    '[SpecRegeneration]'
  );

  const settings = await settingsService?.getGlobalSettings();
  const phaseModelEntry =
    settings?.phaseModels?.specGenerationModel || DEFAULT_PHASE_MODELS.specGenerationModel;
  const { model, thinkingLevel } = resolvePhaseModel(phaseModelEntry);

  logger.info('Using model:', model);

  let responseText = '';
  let structuredOutput: SpecOutput | null = null;

  const useStructuredOutput = !isCursorModel(model);

  let finalPrompt = prompt;
  if (!useStructuredOutput) {
    finalPrompt = `${prompt}

CRITICAL INSTRUCTIONS:
1. DO NOT write any files. DO NOT create any files like "project_specification.json".
2. After analyzing the project, respond with ONLY a JSON object - no explanations, no markdown, just raw JSON.
3. The JSON must match this exact schema:

${JSON.stringify(specOutputSchema, null, 2)}

Your entire response should be valid JSON starting with { and ending with }. No text before or after.`;
  }

  const result = await streamingQuery({
    prompt: finalPrompt,
    model,
    cwd: projectPath,
    maxTurns: 250,
    allowedTools: ['Read', 'Glob', 'Grep'],
    abortController,
    thinkingLevel,
    readOnly: true,
    settingSources: autoLoadClaudeMd ? ['user', 'project', 'local'] : undefined,
    outputFormat: useStructuredOutput
      ? {
          type: 'json_schema',
          schema: specOutputSchema,
        }
      : undefined,
    onText: (text) => {
      responseText += text;
      logger.info(
        `Text block received (${text.length} chars), total now: ${responseText.length} chars`
      );
      events.emit('spec-regeneration:event', {
        type: 'spec_regeneration_progress',
        content: text,
        projectPath: projectPath,
      });
    },
    onToolUse: (tool, input) => {
      logger.info('Tool use:', tool);
      events.emit('spec-regeneration:event', {
        type: 'spec_tool',
        tool,
        input,
      });
    },
  });

  if (result.structured_output) {
    structuredOutput = result.structured_output as unknown as SpecOutput;
    logger.info('✅ Received structured output');
    logger.debug('Structured output:', JSON.stringify(structuredOutput, null, 2));
  } else if (!useStructuredOutput && responseText) {
    structuredOutput = extractJson<SpecOutput>(responseText, { logger });
  }

  logger.info(`Stream iteration complete.`);
  logger.info(`Response text length: ${responseText.length} chars`);

  let xmlContent: string;

  if (structuredOutput) {
    logger.info('✅ Using structured output for XML generation');
    xmlContent = specToXml(structuredOutput);
    logger.info(`Generated XML from structured output: ${xmlContent.length} chars`);
  } else {
    logger.warn('⚠️ No structured output, falling back to text parsing');
    logger.info('========== FINAL RESPONSE TEXT ==========');
    logger.info(responseText || '(empty)');
    logger.info('========== END RESPONSE TEXT ==========');

    if (!responseText || responseText.trim().length === 0) {
      throw new Error('No response text and no structured output - cannot generate spec');
    }

    const xmlStart = responseText.indexOf('<project_specification>');
    const xmlEnd = responseText.lastIndexOf('</project_specification>');

    if (xmlStart !== -1 && xmlEnd !== -1) {
      xmlContent = responseText.substring(xmlStart, xmlEnd + '</project_specification>'.length);
      logger.info(`Extracted XML content: ${xmlContent.length} chars (from position ${xmlStart})`);
    } else {
      logger.warn('⚠️ No XML tags found, attempting JSON extraction...');
      const extractedJson = extractJson<SpecOutput>(responseText, { logger });

      if (
        extractedJson &&
        typeof extractedJson.project_name === 'string' &&
        typeof extractedJson.overview === 'string' &&
        Array.isArray(extractedJson.technology_stack) &&
        Array.isArray(extractedJson.core_capabilities) &&
        Array.isArray(extractedJson.implemented_features)
      ) {
        logger.info('✅ Successfully extracted JSON from response text');
        xmlContent = specToXml(extractedJson);
        logger.info(`✅ Converted extracted JSON to XML: ${xmlContent.length} chars`);
      } else {
        logger.error('❌ Response does not contain valid XML or JSON structure');
        logger.error(
          'This typically happens when structured output failed and the agent produced conversational text instead of structured output'
        );
        throw new Error(
          'Failed to generate spec: No valid XML or JSON structure found in response. ' +
            'The response contained conversational text but no <project_specification> tags or valid JSON. ' +
            'Please try again.'
        );
      }
    }
  }

  await ensureDmakerDir(projectPath);
  const specPath = getAppSpecPath(projectPath);

  logger.info('Saving spec to:', specPath);
  logger.info(`Content to save (${xmlContent.length} chars)`);

  await secureFs.writeFile(specPath, xmlContent);

  const savedContent = await secureFs.readFile(specPath, 'utf-8');
  logger.info(`Verified saved file: ${savedContent.length} chars`);
  if (savedContent.length === 0) {
    logger.error('❌ File was saved but is empty!');
  }

  logger.info('Spec saved successfully');

  if (generateFeatures) {
    events.emit('spec-regeneration:event', {
      type: 'spec_regeneration_progress',
      content: '[Phase: spec_complete] Spec created! Generating features...\n',
      projectPath: projectPath,
    });
  } else {
    events.emit('spec-regeneration:event', {
      type: 'spec_regeneration_complete',
      message: 'Spec regeneration complete!',
      projectPath: projectPath,
    });
  }

  if (generateFeatures) {
    logger.info('Starting feature generation from spec...');
    const featureAbortController = new AbortController();
    try {
      await generateFeaturesFromSpec(
        projectPath,
        events,
        featureAbortController,
        maxFeatures,
        settingsService
      );
    } catch (featureError) {
      logger.error('Feature generation failed:', featureError);
      events.emit('spec-regeneration:event', {
        type: 'spec_regeneration_error',
        error: (featureError as Error).message || 'Feature generation failed',
        projectPath: projectPath,
      });
    }
  }

  logger.debug('========== generateSpec() completed ==========');
}

// ─── Sync Spec ───────────────────────────────────────────────────────────────

export interface SyncResult {
  techStackUpdates: {
    added: string[];
    removed: string[];
  };
  implementedFeaturesUpdates: {
    addedFromFeatures: string[];
    removed: string[];
  };
  roadmapUpdates: Array<{ phaseName: string; newStatus: string }>;
  summary: string;
}

async function syncSpec(
  projectPath: string,
  events: EventEmitter,
  abortController: AbortController,
  settingsService?: SettingsService
): Promise<SyncResult> {
  syncLogger.info('========== syncSpec() started ==========');
  syncLogger.info('projectPath:', projectPath);

  const result: SyncResult = {
    techStackUpdates: { added: [], removed: [] },
    implementedFeaturesUpdates: { addedFromFeatures: [], removed: [] },
    roadmapUpdates: [],
    summary: '',
  };

  const specPath = getAppSpecPath(projectPath);
  let specContent: string;

  try {
    specContent = (await secureFs.readFile(specPath, 'utf-8')) as string;
    syncLogger.info(`Spec loaded successfully (${specContent.length} chars)`);
  } catch (readError) {
    syncLogger.error('Failed to read spec file:', readError);
    events.emit('spec-regeneration:event', {
      type: 'spec_regeneration_error',
      error: 'No project spec found. Create or regenerate spec first.',
      projectPath,
    });
    throw new Error('No project spec found');
  }

  events.emit('spec-regeneration:event', {
    type: 'spec_regeneration_progress',
    content: '[Phase: sync] Starting spec sync...\n',
    projectPath,
  });

  const currentImplementedFeatures = extractImplementedFeatures(specContent);
  const currentTechStack = extractTechnologyStack(specContent);
  const currentRoadmapPhases = extractRoadmapPhases(specContent);

  syncLogger.info(`Current spec has ${currentImplementedFeatures.length} implemented features`);
  syncLogger.info(`Current spec has ${currentTechStack.length} technologies`);
  syncLogger.info(`Current spec has ${currentRoadmapPhases.length} roadmap phases`);

  const featureLoader = new FeatureLoader();
  const allFeatures = await featureLoader.getAll(projectPath);
  const completedFeatures = allFeatures.filter(
    (f) => f.status === 'completed' || f.status === 'verified'
  );

  syncLogger.info(`Found ${completedFeatures.length} completed/verified features in DMaker`);

  events.emit('spec-regeneration:event', {
    type: 'spec_regeneration_progress',
    content: `Found ${completedFeatures.length} completed features to sync...\n`,
    projectPath,
  });

  const newImplementedFeatures: ImplementedFeature[] = [];
  const existingNames = new Set(currentImplementedFeatures.map((f) => f.name.toLowerCase()));

  for (const feature of completedFeatures) {
    const name = feature.title || `Feature: ${feature.id}`;
    if (!existingNames.has(name.toLowerCase())) {
      newImplementedFeatures.push({
        name,
        description: feature.description || '',
      });
      result.implementedFeaturesUpdates.addedFromFeatures.push(name);
    }
  }

  const mergedFeatures = [...currentImplementedFeatures, ...newImplementedFeatures];

  if (result.implementedFeaturesUpdates.addedFromFeatures.length > 0) {
    specContent = updateImplementedFeaturesSection(specContent, mergedFeatures);
    syncLogger.info(
      `Added ${result.implementedFeaturesUpdates.addedFromFeatures.length} features to spec`
    );
  }

  events.emit('spec-regeneration:event', {
    type: 'spec_regeneration_progress',
    content: 'Analyzing codebase for technology updates...\n',
    projectPath,
  });

  const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
    projectPath,
    settingsService,
    '[SpecSync]'
  );

  const settings = await settingsService?.getGlobalSettings();
  const phaseModelEntry =
    settings?.phaseModels?.specGenerationModel || DEFAULT_PHASE_MODELS.specGenerationModel;
  const { model, thinkingLevel } = resolvePhaseModel(phaseModelEntry);

  const techAnalysisPrompt = `Analyze this project and return ONLY a JSON object with the current technology stack.

Current known technologies: ${currentTechStack.join(', ')}

Look at package.json, config files, and source code to identify:
- Frameworks (React, Vue, Express, etc.)
- Languages (TypeScript, JavaScript, Python, etc.)
- Build tools (Vite, Webpack, etc.)
- Databases (PostgreSQL, MongoDB, etc.)
- Key libraries and tools

Return ONLY this JSON format, no other text:
{
  "technologies": ["Technology 1", "Technology 2", ...]
}`;

  try {
    const techResult = await streamingQuery({
      prompt: techAnalysisPrompt,
      model,
      cwd: projectPath,
      maxTurns: 10,
      allowedTools: ['Read', 'Glob', 'Grep'],
      abortController,
      thinkingLevel,
      readOnly: true,
      settingSources: autoLoadClaudeMd ? ['user', 'project', 'local'] : undefined,
      onText: (text) => {
        syncLogger.debug(`Tech analysis text: ${text.substring(0, 100)}`);
      },
    });

    const jsonMatch = techResult.text.match(/\{[\s\S]*"technologies"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.technologies)) {
        const newTechStack = parsed.technologies as string[];

        const currentSet = new Set(currentTechStack.map((t) => t.toLowerCase()));
        const newSet = new Set(newTechStack.map((t) => t.toLowerCase()));

        for (const tech of newTechStack) {
          if (!currentSet.has(tech.toLowerCase())) {
            result.techStackUpdates.added.push(tech);
          }
        }

        for (const tech of currentTechStack) {
          if (!newSet.has(tech.toLowerCase())) {
            result.techStackUpdates.removed.push(tech);
          }
        }

        if (
          result.techStackUpdates.added.length > 0 ||
          result.techStackUpdates.removed.length > 0
        ) {
          specContent = updateTechnologyStack(specContent, newTechStack);
          syncLogger.info(
            `Updated tech stack: +${result.techStackUpdates.added.length}, -${result.techStackUpdates.removed.length}`
          );
        }
      }
    }
  } catch (error) {
    syncLogger.warn('Failed to analyze tech stack:', error);
  }

  events.emit('spec-regeneration:event', {
    type: 'spec_regeneration_progress',
    content: 'Checking roadmap phase statuses...\n',
    projectPath,
  });

  for (const phase of currentRoadmapPhases) {
    if (phase.status === 'completed') continue;

    const phaseNameLower = phase.name.toLowerCase();
    const relatedCompletedFeatures = completedFeatures.filter(
      (f) =>
        f.title?.toLowerCase().includes(phaseNameLower) ||
        f.description?.toLowerCase().includes(phaseNameLower) ||
        f.category?.toLowerCase().includes(phaseNameLower)
    );

    if (relatedCompletedFeatures.length > 0 && phase.status !== 'completed') {
      const newStatus = 'in_progress';
      specContent = updateRoadmapPhaseStatus(specContent, phase.name, newStatus);
      result.roadmapUpdates.push({ phaseName: phase.name, newStatus });
      syncLogger.info(`Updated phase "${phase.name}" to ${newStatus}`);
    }
  }

  await secureFs.writeFile(specPath, specContent, 'utf-8');
  syncLogger.info('Spec saved successfully');

  const summaryParts: string[] = [];
  if (result.implementedFeaturesUpdates.addedFromFeatures.length > 0) {
    summaryParts.push(
      `Added ${result.implementedFeaturesUpdates.addedFromFeatures.length} implemented features`
    );
  }
  if (result.techStackUpdates.added.length > 0) {
    summaryParts.push(`Added ${result.techStackUpdates.added.length} technologies`);
  }
  if (result.techStackUpdates.removed.length > 0) {
    summaryParts.push(`Removed ${result.techStackUpdates.removed.length} technologies`);
  }
  if (result.roadmapUpdates.length > 0) {
    summaryParts.push(`Updated ${result.roadmapUpdates.length} roadmap phases`);
  }

  result.summary = summaryParts.length > 0 ? summaryParts.join(', ') : 'Spec is already up to date';

  const notificationService = getNotificationService();
  await notificationService.createNotification({
    type: 'spec_regeneration_complete',
    title: 'Spec Sync Complete',
    message: result.summary,
    projectPath,
  });

  events.emit('spec-regeneration:event', {
    type: 'spec_regeneration_complete',
    message: `Spec sync complete! ${result.summary}`,
    projectPath,
  });

  syncLogger.info('========== syncSpec() completed ==========');
  syncLogger.info('Summary:', result.summary);

  return result;
}

// ─── Route Handlers ──────────────────────────────────────────────────────────

function createCreateHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    logger.info('========== /create endpoint called ==========');
    logger.debug('Request body:', JSON.stringify(req.body, null, 2));

    try {
      const {
        projectPath,
        projectOverview,
        generateFeatures: genFeatures,
        analyzeProject,
        maxFeatures,
      } = req.body as {
        projectPath: string;
        projectOverview: string;
        generateFeatures?: boolean;
        analyzeProject?: boolean;
        maxFeatures?: number;
      };

      logger.debug('Parsed params:');
      logger.debug('  projectPath:', projectPath);
      logger.debug('  projectOverview length:', `${projectOverview?.length || 0} chars`);
      logger.debug('  generateFeatures:', genFeatures);
      logger.debug('  analyzeProject:', analyzeProject);
      logger.debug('  maxFeatures:', maxFeatures);

      if (!projectPath || !projectOverview) {
        logger.error('Missing required parameters');
        res.status(400).json({
          success: false,
          error: 'projectPath and projectOverview required',
        });
        return;
      }

      const { isRunning } = getSpecRegenerationStatus(projectPath);
      if (isRunning) {
        logger.warn('Generation already running for project:', projectPath);
        res.json({ success: false, error: 'Spec generation already running for this project' });
        return;
      }

      logAuthStatus('Before starting generation');

      const abortController = new AbortController();
      setRunningState(projectPath, true, abortController);
      logger.info('Starting background generation task...');

      generateSpec(
        projectPath,
        projectOverview,
        events,
        abortController,
        genFeatures,
        analyzeProject,
        maxFeatures
      )
        .catch((error) => {
          logError(error, 'Generation failed with error');
          events.emit('spec-regeneration:event', {
            type: 'spec_regeneration_error',
            error: getErrorMessage(error),
            projectPath: projectPath,
          });
        })
        .finally(() => {
          logger.info('Generation task finished (success or error)');
          setRunningState(projectPath, false, null);
        });

      logger.info('Returning success response (generation running in background)');
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Create spec route handler failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createGenerateHandler(events: EventEmitter, settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    logger.info('========== /generate endpoint called ==========');
    logger.debug('Request body:', JSON.stringify(req.body, null, 2));

    try {
      const {
        projectPath,
        projectDefinition,
        generateFeatures: genFeatures,
        analyzeProject,
        maxFeatures,
      } = req.body as {
        projectPath: string;
        projectDefinition: string;
        generateFeatures?: boolean;
        analyzeProject?: boolean;
        maxFeatures?: number;
      };

      logger.debug('Parsed params:');
      logger.debug('  projectPath:', projectPath);
      logger.debug('  projectDefinition length:', `${projectDefinition?.length || 0} chars`);
      logger.debug('  generateFeatures:', genFeatures);
      logger.debug('  analyzeProject:', analyzeProject);
      logger.debug('  maxFeatures:', maxFeatures);

      if (!projectPath || !projectDefinition) {
        logger.error('Missing required parameters');
        res.status(400).json({
          success: false,
          error: 'projectPath and projectDefinition required',
        });
        return;
      }

      const { isRunning } = getSpecRegenerationStatus(projectPath);
      if (isRunning) {
        logger.warn('Generation already running for project:', projectPath);
        res.json({ success: false, error: 'Spec generation already running for this project' });
        return;
      }

      logAuthStatus('Before starting generation');

      const abortController = new AbortController();
      setRunningState(projectPath, true, abortController);
      logger.info('Starting background generation task...');

      generateSpec(
        projectPath,
        projectDefinition,
        events,
        abortController,
        genFeatures,
        analyzeProject,
        maxFeatures,
        settingsService
      )
        .catch((error) => {
          logError(error, 'Generation failed with error');
          events.emit('spec-regeneration:event', {
            type: 'spec_regeneration_error',
            error: getErrorMessage(error),
            projectPath: projectPath,
          });
        })
        .finally(() => {
          logger.info('Generation task finished (success or error)');
          setRunningState(projectPath, false, null);
        });

      logger.info('Returning success response (generation running in background)');
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Generate spec route handler failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createGenerateFeaturesHandler(events: EventEmitter, settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    logger.info('========== /generate-features endpoint called ==========');
    logger.debug('Request body:', JSON.stringify(req.body, null, 2));

    try {
      const { projectPath, maxFeatures } = req.body as {
        projectPath: string;
        maxFeatures?: number;
      };

      logger.debug('projectPath:', projectPath);
      logger.debug('maxFeatures:', maxFeatures);

      if (!projectPath) {
        logger.error('Missing projectPath parameter');
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      const { isRunning } = getSpecRegenerationStatus(projectPath);
      if (isRunning) {
        logger.warn('Generation already running for project:', projectPath);
        res.json({ success: false, error: 'Generation already running for this project' });
        return;
      }

      logAuthStatus('Before starting feature generation');

      const abortController = new AbortController();
      setRunningState(projectPath, true, abortController, 'feature_generation');
      logger.info('Starting background feature generation task...');

      generateFeaturesFromSpec(projectPath, events, abortController, maxFeatures, settingsService)
        .catch((error) => {
          logError(error, 'Feature generation failed with error');
          events.emit('spec-regeneration:event', {
            type: 'features_error',
            error: getErrorMessage(error),
          });
        })
        .finally(() => {
          logger.info('Feature generation task finished (success or error)');
          setRunningState(projectPath, false, null);
        });

      logger.info('Returning success response (generation running in background)');
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Generate features route handler failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createStatusHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = req.query.projectPath as string | undefined;
      const { isRunning } = getSpecRegenerationStatus(projectPath);
      res.json({ success: true, isRunning, projectPath });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createStopHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath?: string };
      const { currentAbortController } = getSpecRegenerationStatus(projectPath);
      if (currentAbortController) {
        currentAbortController.abort();
      }
      if (projectPath) {
        setRunningState(projectPath, false, null);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createSyncHandler(events: EventEmitter, settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    syncLogger.info('========== /sync endpoint called ==========');
    syncLogger.debug('Request body:', JSON.stringify(req.body, null, 2));

    try {
      const { projectPath } = req.body as {
        projectPath: string;
      };

      syncLogger.debug('projectPath:', projectPath);

      if (!projectPath) {
        syncLogger.error('Missing projectPath parameter');
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      const { isRunning } = getSpecRegenerationStatus(projectPath);
      if (isRunning) {
        syncLogger.warn('Generation/sync already running for project:', projectPath);
        res.json({ success: false, error: 'Operation already running for this project' });
        return;
      }

      logAuthStatus('Before starting spec sync');

      const abortController = new AbortController();
      setRunningState(projectPath, true, abortController, 'sync');
      syncLogger.info('Starting background spec sync task...');

      syncSpec(projectPath, events, abortController, settingsService)
        .then((syncResult) => {
          syncLogger.info('Spec sync completed successfully');
          syncLogger.info('Result:', JSON.stringify(syncResult, null, 2));
        })
        .catch((error) => {
          logError(error, 'Spec sync failed with error');
          events.emit('spec-regeneration:event', {
            type: 'spec_regeneration_error',
            error: getErrorMessage(error),
            projectPath,
          });
        })
        .finally(() => {
          syncLogger.info('Spec sync task finished (success or error)');
          setRunningState(projectPath, false, null);
        });

      syncLogger.info('Returning success response (sync running in background)');
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Sync route handler failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ─── Router Factory ──────────────────────────────────────────────────────────

export function createSpecRegenerationRoutes(
  events: EventEmitter,
  settingsService?: SettingsService
): Router {
  const router = Router();

  router.post('/create', createCreateHandler(events));
  router.post('/generate', createGenerateHandler(events, settingsService));
  router.post('/generate-features', createGenerateFeaturesHandler(events, settingsService));
  router.post('/sync', createSyncHandler(events, settingsService));
  router.post('/stop', createStopHandler());
  router.get('/status', createStatusHandler());

  return router;
}
