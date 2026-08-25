import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createMockExpressContext } from '../../utils/mocks.js';

// The handlers reach the sandbox through this singleton, so it is the seam.
const sandbox = {
  checkAvailability: vi.fn(),
  ensureImages: vi.fn(),
  runScenario: vi.fn(),
};

vi.mock('@/services/e2e-sandbox-service.js', () => ({
  getE2ESandboxService: () => sandbox,
}));

import {
  parseScenario,
  createAvailabilityHandler,
  createEnsureImagesHandler,
  createRunHandler,
} from '@/routes/e2e.js';
import type { SettingsService } from '@/services/settings-service.js';

/** A settings service that returns exactly the project settings given. */
function settingsReturning(e2eSandbox: unknown): SettingsService {
  return {
    getProjectSettings: vi.fn().mockResolvedValue({ version: 1, e2eSandbox }),
  } as unknown as SettingsService;
}

const VALID_SANDBOX = {
  enabled: true,
  app: { startCommand: 'npm run dev', port: 3000 },
};

describe('e2e routes', () => {
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();
    const context = createMockExpressContext();
    req = context.req;
    res = context.res;
  });

  describe('parseScenario', () => {
    it('accepts a well-formed scenario and keeps the feature link', () => {
      const result = parseScenario({
        name: 'login',
        featureId: 'feat-1',
        steps: [{ name: 'home', goto: '/' }],
      });

      expect(result).toEqual({
        scenario: { name: 'login', featureId: 'feat-1', steps: [{ name: 'home', goto: '/' }] },
      });
    });

    it.each([
      [undefined, 'scenario must be an object'],
      [{}, 'scenario.name is required'],
      [{ name: '  ' }, 'scenario.name is required'],
      [{ name: 'x', steps: [] }, 'scenario.steps must be a non-empty array'],
      [{ name: 'x', steps: 'nope' }, 'scenario.steps must be a non-empty array'],
      [{ name: 'x', steps: [null] }, 'step 1 must be an object'],
      [{ name: 'x', steps: [{ goto: '/' }] }, 'step 1 needs a name'],
    ])('rejects %j', (input, expected) => {
      expect(parseScenario(input)).toEqual({ error: expected });
    });

    it('rejects a step that does nothing, because it would silently pass', () => {
      const result = parseScenario({ name: 'x', steps: [{ name: 'idle' }] });

      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('does nothing');
    });

    it('rejects a fill missing its selector or value', () => {
      expect(parseScenario({ name: 'x', steps: [{ name: 'type', fill: { value: 'a' } }] })).toEqual(
        { error: 'step "type" has a fill without a selector and value' }
      );
    });

    it('drops unknown top-level fields rather than passing them to the container', () => {
      const result = parseScenario({
        name: 'x',
        steps: [{ name: 'home', goto: '/' }],
        somethingElse: 'ignored',
      });

      expect(Object.keys((result as { scenario: object }).scenario).sort()).toEqual([
        'name',
        'steps',
      ]);
    });
  });

  describe('POST /availability', () => {
    it('passes the availability report through', async () => {
      sandbox.checkAvailability.mockResolvedValue({
        available: true,
        dockerVersion: '29.2.1',
        images: { base: true, runner: true },
      });

      await createAvailabilityHandler()(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        available: true,
        dockerVersion: '29.2.1',
        images: { base: true, runner: true },
      });
    });

    it('reports unavailability as a successful check, not a 500', async () => {
      sandbox.checkAvailability.mockResolvedValue({
        available: false,
        images: { base: false, runner: false },
        reason: 'Docker is not installed',
      });

      await createAvailabilityHandler()(req, res);

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, available: false })
      );
    });

    it('500s when the check itself throws', async () => {
      sandbox.checkAvailability.mockRejectedValue(new Error('docker exploded'));

      await createAvailabilityHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'docker exploded' });
    });
  });

  describe('POST /ensure-images', () => {
    it('builds the images and returns the build log', async () => {
      sandbox.ensureImages.mockImplementation(
        async (_root: string, onProgress?: (line: string) => void) => {
          onProgress?.('Building dmaker/e2e-base:pw1.57.0');
          onProgress?.('done');
        }
      );

      await createEnsureImagesHandler()(req, res);

      expect(sandbox.ensureImages).toHaveBeenCalledTimes(1);
      // The repo root it builds from has to be a real absolute path, or the
      // Dockerfiles are not found and the build fails minutes in.
      const [repoRoot] = sandbox.ensureImages.mock.calls[0];
      expect(typeof repoRoot).toBe('string');
      expect(repoRoot.length).toBeGreaterThan(0);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        log: 'Building dmaker/e2e-base:pw1.57.0\ndone',
      });
    });

    it('surfaces a build failure with its reason', async () => {
      sandbox.ensureImages.mockRejectedValue(new Error('no space left on device'));

      await createEnsureImagesHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'no space left on device',
      });
    });
  });

  describe('POST /run', () => {
    const scenario = { name: 'demo', steps: [{ name: 'home', goto: '/' }] };

    it('requires a projectPath', async () => {
      req.body = { scenario };

      await createRunHandler(settingsReturning(VALID_SANDBOX))(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(sandbox.runScenario).not.toHaveBeenCalled();
    });

    it('rejects a malformed scenario before starting anything', async () => {
      req.body = { projectPath: '/proj', scenario: { name: 'x', steps: [{ name: 'idle' }] } };

      await createRunHandler(settingsReturning(VALID_SANDBOX))(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(sandbox.runScenario).not.toHaveBeenCalled();
    });

    it('refuses with 409 when the sandbox is off for the project', async () => {
      req.body = { projectPath: '/proj', scenario };

      await createRunHandler(settingsReturning({ enabled: false }))(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('turned off') })
      );
      expect(sandbox.runScenario).not.toHaveBeenCalled();
    });

    it('refuses with 409 when the project has no sandbox config at all', async () => {
      req.body = { projectPath: '/proj', scenario };

      await createRunHandler(settingsReturning(undefined))(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(sandbox.runScenario).not.toHaveBeenCalled();
    });

    it('runs the scenario and returns the report', async () => {
      req.body = { projectPath: '/proj', scenario };
      const report = { scenario: 'demo', status: 'passed', steps: [] };
      sandbox.runScenario.mockResolvedValue(report);

      await createRunHandler(settingsReturning(VALID_SANDBOX))(req, res);

      expect(sandbox.runScenario).toHaveBeenCalledWith({
        projectPath: '/proj',
        scenario: { name: 'demo', steps: [{ name: 'home', goto: '/' }] },
        config: VALID_SANDBOX,
      });
      expect(res.json).toHaveBeenCalledWith({ success: true, report });
    });

    it('returns a failing scenario as a successful request', async () => {
      // The caller wants the report either way; a failed assertion is a
      // finding, not a transport error.
      req.body = { projectPath: '/proj', scenario };
      sandbox.runScenario.mockResolvedValue({
        scenario: 'demo',
        status: 'failed',
        steps: [{ name: 'home', status: 'failed', error: 'boom', durationMs: 1 }],
      });

      await createRunHandler(settingsReturning(VALID_SANDBOX))(req, res);

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          report: expect.objectContaining({ status: 'failed' }),
        })
      );
    });

    it('500s when the run throws outright', async () => {
      req.body = { projectPath: '/proj', scenario };
      sandbox.runScenario.mockRejectedValue(new Error('container vanished'));

      await createRunHandler(settingsReturning(VALID_SANDBOX))(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'container vanished' });
    });
  });
});
