/**
 * E2E sandbox routes — the entry point agents and the UI use to run a
 * project's app in a container and drive it with a real browser.
 *
 * Mounted at /api/e2e.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '@dmaker/utils';
import type { E2ESandboxConfig, E2EScenario, E2EStep } from '@dmaker/types';
import { getE2ESandboxService } from '../services/e2e-sandbox-service.js';
import type { SettingsService } from '../services/settings-service.js';

const logger = createLogger('E2ERoutes');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Repo root, for the Dockerfiles. From this file at
 * apps/server/src/routes/ (or dist/routes/ once built) that is three levels up.
 */
function getRepoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../../..');
}

/**
 * Validate a scenario coming off the wire.
 *
 * Agents author these, so the failure mode to design for is a plausible-looking
 * scenario with one malformed step. Rejecting it here with a specific message
 * beats a container starting and failing obscurely minutes later.
 */
export function parseScenario(input: unknown): { scenario: E2EScenario } | { error: string } {
  if (!input || typeof input !== 'object') return { error: 'scenario must be an object' };
  const candidate = input as Partial<E2EScenario>;

  if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
    return { error: 'scenario.name is required' };
  }
  if (!Array.isArray(candidate.steps) || candidate.steps.length === 0) {
    return { error: 'scenario.steps must be a non-empty array' };
  }

  const steps: E2EStep[] = [];
  for (const [index, raw] of candidate.steps.entries()) {
    if (!raw || typeof raw !== 'object') {
      return { error: `step ${index + 1} must be an object` };
    }
    const step = raw as E2EStep;
    if (typeof step.name !== 'string' || !step.name.trim()) {
      return { error: `step ${index + 1} needs a name` };
    }
    // A step that does nothing is almost always a mistake in the caller's
    // scenario rather than an intentional no-op, and it would silently pass.
    const acts =
      step.goto !== undefined ||
      step.click !== undefined ||
      step.fill !== undefined ||
      step.waitFor !== undefined ||
      step.expectText !== undefined;
    if (!acts) {
      return {
        error: `step "${step.name}" does nothing — give it goto, click, fill, waitFor or expectText`,
      };
    }
    if (step.fill && (!step.fill.selector || typeof step.fill.value !== 'string')) {
      return { error: `step "${step.name}" has a fill without a selector and value` };
    }
    steps.push(step);
  }

  return {
    scenario: {
      name: candidate.name,
      steps,
      ...(typeof candidate.featureId === 'string' ? { featureId: candidate.featureId } : {}),
    },
  };
}

export function createAvailabilityHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json({ success: true, ...(await getE2ESandboxService().checkAvailability()) });
    } catch (error) {
      logger.error('Availability check failed:', error);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createEnsureImagesHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const lines: string[] = [];
      await getE2ESandboxService().ensureImages(getRepoRoot(), (line) => lines.push(line));
      res.json({ success: true, log: lines.join('\n') });
    } catch (error) {
      logger.error('Image build failed:', error);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createRunHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, scenario: rawScenario } = req.body as {
        projectPath?: string;
        scenario?: unknown;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const parsed = parseScenario(rawScenario);
      if ('error' in parsed) {
        res.status(400).json({ success: false, error: parsed.error });
        return;
      }

      const projectSettings = await settingsService.getProjectSettings(projectPath);
      const config: E2ESandboxConfig | undefined = projectSettings.e2eSandbox;

      if (!config?.enabled) {
        // Not an error the caller can retry past, so it gets its own reply
        // rather than being dressed up as a failed run.
        res.status(409).json({
          success: false,
          error:
            'The browser sandbox is turned off for this project. Enable it in Project Settings → Testing.',
        });
        return;
      }

      const report = await getE2ESandboxService().runScenario({
        projectPath,
        scenario: parsed.scenario,
        config,
      });

      // A scenario that ran and failed is a successful request with a failing
      // result — the caller wants the report either way.
      res.json({ success: true, report });
    } catch (error) {
      logger.error('Scenario run failed:', error);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createE2ERoutes(settingsService: SettingsService): Router {
  const router = Router();

  router.post('/availability', createAvailabilityHandler());
  router.post('/ensure-images', createEnsureImagesHandler());
  router.post('/run', createRunHandler(settingsService));

  return router;
}
