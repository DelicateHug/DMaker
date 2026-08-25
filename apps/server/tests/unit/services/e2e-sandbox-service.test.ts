import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';

// Mock child_process so we can drive docker's outcomes. promisify() wraps
// these callback-style, so each mock must call back with { stdout, stderr }.
vi.mock('child_process', () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
}));

import { execFile } from 'child_process';
import {
  E2ESandboxService,
  RUNNER_IMAGE,
  BASE_IMAGE,
} from '../../../src/services/e2e-sandbox-service.js';

type Cb = (err: Error | null, result?: { stdout: string; stderr: string }) => void;
const execFileMock = execFile as unknown as ReturnType<typeof vi.fn>;

interface Call {
  file: string;
  args: string[];
  opts: { cwd?: string };
}

/** Drive execFile with a handler that decides each call from its argv. */
function stubExecFile(
  handler: (call: Call) => { stdout?: string; stderr?: string } | Error
): Call[] {
  const calls: Call[] = [];
  execFileMock.mockImplementation((file: string, args: string[], opts: unknown, cb: Cb) => {
    const call = { file, args, opts: (opts ?? {}) as { cwd?: string } };
    calls.push(call);
    const outcome = handler(call);
    if (outcome instanceof Error) cb(outcome);
    else cb(null, { stdout: outcome.stdout ?? '', stderr: outcome.stderr ?? '' });
    return undefined as never;
  });
  return calls;
}

/** A rejection shaped like child_process's, with docker's message on stderr. */
function dockerFailure(stderr: string): Error {
  const err = new Error(`Command failed: docker ...\n${stderr}`) as Error & { stderr: string };
  err.stderr = stderr;
  return err;
}

/** Docker is up and both images are present. */
function healthy(call: Call) {
  if (call.args[0] === 'info') return { stdout: '29.2.1\n' };
  if (call.args[0] === 'images') return { stdout: 'sha256:abc\n' };
  return { stdout: '' };
}

const CONFIG = {
  enabled: true,
  app: { startCommand: 'npm run dev', port: 3000 },
};

describe('E2ESandboxService', () => {
  let service: E2ESandboxService;
  let projectPath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new E2ESandboxService();
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-sandbox-test-'));
  });

  afterEach(() => {
    fsSync.rmSync(projectPath, { recursive: true, force: true });
  });

  describe('checkAvailability', () => {
    it('tells the user to install Docker when the binary is missing', async () => {
      stubExecFile(() => dockerFailure('docker: command not found'));

      const result = await service.checkAvailability();

      expect(result.available).toBe(false);
      expect(result.reason).toContain('not installed');
    });

    it('distinguishes a stopped daemon from a missing install', async () => {
      stubExecFile(() =>
        dockerFailure('error during connect: open //./pipe/dockerDesktopLinuxEngine: not found')
      );

      const result = await service.checkAvailability();

      expect(result.available).toBe(false);
      expect(result.reason).toContain('Start Docker Desktop');
    });

    it('reports unavailable when the runner image has not been built', async () => {
      stubExecFile((call) => {
        if (call.args[0] === 'info') return { stdout: '29.2.1\n' };
        return { stdout: '' }; // no image ids
      });

      const result = await service.checkAvailability();

      expect(result).toMatchObject({
        available: false,
        dockerVersion: '29.2.1',
        images: { base: false, runner: false },
      });
      expect(result.reason).toContain('not been built');
    });

    it('is available once Docker is up and the runner exists', async () => {
      stubExecFile(healthy);

      const result = await service.checkAvailability();

      expect(result).toMatchObject({ available: true, images: { base: true, runner: true } });
      expect(result.reason).toBeUndefined();
    });
  });

  describe('ensureImages', () => {
    it('skips the browser layer when it is already built', async () => {
      const calls = stubExecFile((call) => {
        if (call.args[0] === 'images') {
          return { stdout: call.args[2] === BASE_IMAGE ? 'sha256:abc\n' : '' };
        }
        return { stdout: '' };
      });

      await service.ensureImages('/repo');

      const builds = calls.filter((c) => c.args[0] === 'build');
      expect(builds).toHaveLength(1);
      expect(builds[0].args).toContain(RUNNER_IMAGE);
      expect(builds[0].opts.cwd).toBe('/repo');
    });

    it('surfaces the build error rather than the echoed command', async () => {
      stubExecFile((call) => {
        if (call.args[0] === 'images') return { stdout: '' };
        if (call.args[0] === 'build') return dockerFailure('no space left on device');
        return { stdout: '' };
      });

      await expect(service.ensureImages('/repo')).rejects.toThrow('no space left on device');
    });
  });

  describe('ensureProjectImage', () => {
    const LAYER = 'RUN apt-get update && apt-get install -y jq';

    it('tags by content so an unchanged layer is reused and an edited one is not', async () => {
      stubExecFile((call) => (call.args[0] === 'images' ? { stdout: '' } : { stdout: '' }));

      const first = await service.ensureProjectImage(projectPath, LAYER);
      const same = await service.ensureProjectImage(projectPath, LAYER);
      const edited = await service.ensureProjectImage(projectPath, `${LAYER} curl`);

      expect(first).toMatch(/^dmaker\/e2e-project:[0-9a-f]{12}$/);
      expect(same).toBe(first);
      // A changed layer must not keep serving the old image under the old tag.
      expect(edited).not.toBe(first);
    });

    it('skips the build entirely when that exact image already exists', async () => {
      const calls = stubExecFile((call) =>
        call.args[0] === 'images' ? { stdout: 'sha256:abc\n' } : { stdout: '' }
      );

      await service.ensureProjectImage(projectPath, LAYER);

      expect(calls.some((c) => c.args[0] === 'build')).toBe(false);
    });

    it("builds from the project so the layer can COPY the project's own files", async () => {
      const calls = stubExecFile((call) =>
        call.args[0] === 'images' ? { stdout: '' } : { stdout: '' }
      );

      await service.ensureProjectImage(projectPath, LAYER);

      const build = calls.find((c) => c.args[0] === 'build')!;
      expect(build.opts.cwd).toBe(projectPath);
      expect(build.args).toContain('.');

      // The generated Dockerfile has to be readable by the user, and has to
      // actually stack on the runner rather than starting from scratch.
      const dockerfile = fsSync.readFileSync(
        path.join(projectPath, '.dmaker', 'e2e', 'project.Dockerfile'),
        'utf8'
      );
      expect(dockerfile).toContain(`FROM ${RUNNER_IMAGE}`);
      expect(dockerfile).toContain(LAYER);
      expect(dockerfile).toContain('overwritten');
    });

    it('surfaces why the layer failed to build', async () => {
      stubExecFile((call) => {
        if (call.args[0] === 'images') return { stdout: '' };
        if (call.args[0] === 'build') return dockerFailure('E: Unable to locate package jq');
        return { stdout: '' };
      });

      await expect(service.ensureProjectImage(projectPath, LAYER)).rejects.toThrow(
        'Unable to locate package jq'
      );
    });
  });

  describe('runScenario', () => {
    const scenario = { name: 'demo run', steps: [{ name: 'home', goto: '/' }] };

    it('refuses without a start command, and says where to set one', async () => {
      stubExecFile(healthy);

      const report = await service.runScenario({
        projectPath,
        scenario,
        config: { enabled: true },
      });

      expect(report.status).toBe('error');
      expect(report.setupError).toContain('no start command');
      // Nothing should have been launched.
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('reports a stopped daemon as a setup error, not a failed scenario', async () => {
      stubExecFile(() => dockerFailure('cannot connect to the Docker daemon'));

      const report = await service.runScenario({ projectPath, scenario, config: CONFIG });

      expect(report.status).toBe('error');
      expect(report.setupError).toContain('Start Docker Desktop');
      expect(report.steps).toEqual([]);
    });

    it('hands the scenario to the container and reads its report back', async () => {
      const calls = stubExecFile((call) => {
        if (call.args[0] === 'run') {
          // Stand in for the driver: write the report it would have written.
          const outFlag = call.args.indexOf('-v');
          expect(outFlag).toBeGreaterThan(-1);
          const outMount = call.args.find((a) => a.endsWith(':/out'));
          const hostOut = outMount!.slice(0, -'/out'.length - 1);
          fsSync.writeFileSync(
            path.join(hostOut, 'report.json'),
            JSON.stringify({
              scenario: 'demo run',
              status: 'passed',
              steps: [
                { name: 'home', status: 'passed', durationMs: 12, screenshot: '01-home.png' },
              ],
              outputDir: '/out',
              startedAt: '2020-01-01T00:00:00.000Z',
              durationMs: 12,
            })
          );
          return { stdout: '{"status":"passed"}' };
        }
        return healthy(call);
      });

      const report = await service.runScenario({ projectPath, scenario, config: CONFIG });

      expect(report.status).toBe('passed');
      expect(report.steps[0].screenshot).toBe('01-home.png');
      // The container's own /out path must not leak out to callers.
      expect(report.outputDir).not.toBe('/out');
      expect(report.outputDir.startsWith(projectPath)).toBe(true);

      const runCall = calls.find((c) => c.args[0] === 'run')!;
      expect(runCall.args).toContain('--rm');
      // Chromium crashes mid-render on Docker's 64MB default.
      expect(runCall.args).toContain('--shm-size');
      expect(runCall.args).toContain(RUNNER_IMAGE);

      // The scenario has to reach the container as a file, not as argv.
      const scenarioFile = path.join(report.outputDir, 'scenario.json');
      expect(JSON.parse(fsSync.readFileSync(scenarioFile, 'utf8'))).toMatchObject({
        scenario: { name: 'demo run' },
        app: { startCommand: 'npm run dev', port: 3000 },
      });
    });

    it('keeps the report when the container exits non-zero, because that is how a failed scenario ends', async () => {
      stubExecFile((call) => {
        if (call.args[0] === 'run') {
          const outMount = call.args.find((a) => a.endsWith(':/out'))!;
          const hostOut = outMount.slice(0, -'/out'.length - 1);
          fsSync.writeFileSync(
            path.join(hostOut, 'report.json'),
            JSON.stringify({
              scenario: 'demo run',
              status: 'failed',
              steps: [{ name: 'home', status: 'failed', error: 'boom', durationMs: 5 }],
              outputDir: '/out',
              startedAt: '2020-01-01T00:00:00.000Z',
              durationMs: 5,
            })
          );
          return dockerFailure('exit status 1');
        }
        return healthy(call);
      });

      const report = await service.runScenario({ projectPath, scenario, config: CONFIG });

      // A failed scenario is a result, not a broken sandbox.
      expect(report.status).toBe('failed');
      expect(report.setupError).toBeUndefined();
      expect(report.steps[0].error).toBe('boom');
    });

    it('falls back to a setup error when the container dies without a report', async () => {
      stubExecFile((call) => {
        if (call.args[0] === 'run') return dockerFailure('OCI runtime create failed');
        return healthy(call);
      });

      const report = await service.runScenario({ projectPath, scenario, config: CONFIG });

      expect(report.status).toBe('error');
      expect(report.setupError).toContain('OCI runtime create failed');
    });

    it('builds and uses the project layer when one is configured', async () => {
      const calls = stubExecFile((call) => {
        if (call.args[0] === 'run') {
          const outMount = call.args.find((a) => a.endsWith(':/out'))!;
          const hostOut = outMount.slice(0, -'/out'.length - 1);
          fsSync.writeFileSync(
            path.join(hostOut, 'report.json'),
            JSON.stringify({
              scenario: 'demo run',
              status: 'passed',
              steps: [],
              outputDir: '/out',
              startedAt: '2020-01-01T00:00:00.000Z',
              durationMs: 1,
            })
          );
          return { stdout: '' };
        }
        if (call.args[0] === 'images') {
          // Docker is healthy and DMaker's own images exist, but the project
          // layer does not yet.
          const wanted = call.args[2] ?? '';
          return { stdout: wanted.startsWith('dmaker/e2e-project') ? '' : 'sha256:abc\n' };
        }
        return healthy(call);
      });

      const report = await service.runScenario({
        projectPath,
        scenario,
        config: { ...CONFIG, imageLayer: 'RUN echo hello' },
      });

      expect(report.status).toBe('passed');
      const runCall = calls.find((c) => c.args[0] === 'run')!;
      const usedImage = runCall.args.find((a) => a.startsWith('dmaker/e2e-project:'));
      expect(usedImage, 'the run should use the project layer, not the bare runner').toBeTruthy();
      expect(runCall.args).not.toContain(RUNNER_IMAGE);
    });

    it('reports a failed project layer build as a setup error', async () => {
      stubExecFile((call) => {
        if (call.args[0] === 'images') {
          const wanted = call.args[2] ?? '';
          return { stdout: wanted.startsWith('dmaker/e2e-project') ? '' : 'sha256:abc\n' };
        }
        if (call.args[0] === 'build') return dockerFailure('E: Unable to locate package nope');
        return healthy(call);
      });

      const report = await service.runScenario({
        projectPath,
        scenario,
        config: { ...CONFIG, imageLayer: 'RUN apt-get install -y nope' },
      });

      expect(report.status).toBe('error');
      expect(report.setupError).toContain('Unable to locate package nope');
    });

    it('honours a project image override', async () => {
      const calls = stubExecFile((call) => {
        if (call.args[0] === 'run') {
          const outMount = call.args.find((a) => a.endsWith(':/out'))!;
          const hostOut = outMount.slice(0, -'/out'.length - 1);
          fsSync.writeFileSync(
            path.join(hostOut, 'report.json'),
            JSON.stringify({
              scenario: 'demo run',
              status: 'passed',
              steps: [],
              outputDir: '/out',
              startedAt: '2020-01-01T00:00:00.000Z',
              durationMs: 1,
            })
          );
          return { stdout: '' };
        }
        return healthy(call);
      });

      await service.runScenario({
        projectPath,
        scenario,
        config: { ...CONFIG, image: 'my-project/e2e:latest' },
      });

      const runCall = calls.find((c) => c.args[0] === 'run')!;
      expect(runCall.args).toContain('my-project/e2e:latest');
      expect(runCall.args).not.toContain(RUNNER_IMAGE);
    });
  });
});
