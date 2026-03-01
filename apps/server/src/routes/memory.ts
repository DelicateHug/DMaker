/**
 * Memory routes - HTTP API for memory tier operations
 *
 * Consolidated from memory/ directory into a single module.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { secureFs } from '@dmaker/platform';
import { DEFAULT_PHASE_MODELS } from '@dmaker/types';
import {
  consolidateMemoryToMaster,
  memoryTiersNeedRegeneration,
  writeMemoryTiers,
  type MemoryFsModule,
} from '@dmaker/utils';
import { resolvePhaseModel } from '@dmaker/model-resolver';
import { simpleQuery } from '../providers/simple-query-service.js';
import type { SettingsService } from '../services/settings-service.js';
import { createLogger } from '@dmaker/utils';

const logger = createLogger('MemoryRoutes');

const MEMORY_SUMMARIZATION_SYSTEM_PROMPT = `You are a memory consolidation assistant for an AI development studio. Your job is to create concise, actionable summaries of project learnings, decisions, and patterns.

Rules:
- Preserve ALL decisions, gotchas, and critical patterns — these prevent repeat mistakes
- Group related learnings together
- Use bullet points and headers for scanability
- Prioritize information that prevents errors over merely informational content
- Keep the most recent and most frequently referenced learnings prominent
- Output markdown only, no code fences around the entire response
- Do NOT include frontmatter — just the content`;

// ─── Router Factory ──────────────────────────────────────────────────────────

export function createMemoryRoutes(settingsService?: SettingsService): Router {
  const router = Router();

  router.post('/regenerate-tiers', async (req: Request, res: Response) => {
    const { projectPath } = req.body;

    if (!projectPath || typeof projectPath !== 'string') {
      res.status(400).json({ success: false, error: 'projectPath is required' });
      return;
    }

    try {
      // 1. Consolidate
      const {
        content: masterContent,
        categoryCount,
        categoryFiles,
      } = await consolidateMemoryToMaster(projectPath, secureFs as MemoryFsModule);

      if (masterContent.length < 500) {
        res.json({ success: true, skipped: true, reason: 'Memory too small for tier generation' });
        return;
      }

      // 2. Check if needed
      const needsRegeneration = await memoryTiersNeedRegeneration(
        projectPath,
        masterContent,
        secureFs as MemoryFsModule
      );

      if (!needsRegeneration) {
        res.json({ success: true, skipped: true, reason: 'Memory tiers are already up to date' });
        return;
      }

      // 3. Get model
      const settings = await settingsService?.getGlobalSettings();
      const phaseModelEntry =
        settings?.phaseModels?.memorySummarizationModel ||
        DEFAULT_PHASE_MODELS.memorySummarizationModel;
      const { model } = resolvePhaseModel(phaseModelEntry);

      logger.info(`Regenerating memory tiers using model: ${model}`);

      // Truncate if extremely large
      const maxSourceChars = 200_000;
      const sourceContent =
        masterContent.length > maxSourceChars
          ? masterContent.slice(0, maxSourceChars) + '\n\n[...truncated due to size]'
          : masterContent;

      // 4. Generate tiers in parallel
      const [smallResult, mediumResult, highResult] = await Promise.all([
        simpleQuery({
          prompt: `Create a VERY COMPACT summary of these project learnings.\n\nTarget: approximately 500 words / ~2000 tokens.\n\nFocus ONLY on:\n1. Critical gotchas and things that WILL break if ignored (top priority)\n2. Key architectural decisions that affect every feature\n3. Essential patterns that must be followed\n\nOmit: detailed reasoning, trade-offs, alternatives considered, minor patterns.\nFormat: Short bullet list grouped by theme. One line per learning.\n\nSOURCE MATERIAL:\n${sourceContent}`,
          model,
          cwd: projectPath,
          maxTurns: 1,
          allowedTools: [],
          systemPrompt: MEMORY_SUMMARIZATION_SYSTEM_PROMPT,
        }),
        simpleQuery({
          prompt: `Create a MODERATE DETAIL summary of these project learnings.\n\nTarget: approximately 2000 words / ~8000 tokens.\n\nInclude:\n1. All gotchas with brief root cause\n2. Architectural decisions with brief "why"\n3. Important patterns with when to use them\n4. Key trade-offs that inform future decisions\n\nOmit: full historical context, rejected alternatives details, minor learnings.\nFormat: Headers per category, bullet points with 1-2 sentences each.\n\nSOURCE MATERIAL:\n${sourceContent}`,
          model,
          cwd: projectPath,
          maxTurns: 1,
          allowedTools: [],
          systemPrompt: MEMORY_SUMMARIZATION_SYSTEM_PROMPT,
        }),
        simpleQuery({
          prompt: `Create a COMPREHENSIVE summary of these project learnings.\n\nTarget: approximately 10000 words / ~40000 tokens (or less if source material is shorter).\n\nInclude EVERYTHING meaningful:\n1. All decisions with full reasoning and alternatives considered\n2. All gotchas with root cause, how to avoid, and related context\n3. All patterns with problem solved, trade-offs, and when to use\n4. All learnings with historical context\n\nPreserve the ADR-style structure where present.\nFormat: Headers per category, detailed bullet points.\n\nSOURCE MATERIAL:\n${sourceContent}`,
          model,
          cwd: projectPath,
          maxTurns: 1,
          allowedTools: [],
          systemPrompt: MEMORY_SUMMARIZATION_SYSTEM_PROMPT,
        }),
      ]);

      // 5. Write tiers
      await writeMemoryTiers(
        projectPath,
        {
          small: smallResult.text || '',
          medium: mediumResult.text || '',
          high: highResult.text || '',
          masterContent,
          categoryCount,
          categoryFiles,
          model,
        },
        secureFs as MemoryFsModule
      );

      res.json({
        success: true,
        tiers: {
          small: Math.ceil((smallResult.text || '').length / 4),
          medium: Math.ceil((mediumResult.text || '').length / 4),
          high: Math.ceil((highResult.text || '').length / 4),
        },
      });
    } catch (error) {
      logger.error('Failed to regenerate memory tiers:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
