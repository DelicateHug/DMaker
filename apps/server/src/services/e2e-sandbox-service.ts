/**
 * E2ESandboxService — runs a project's app in a Linux container and drives it
 * with a real, headed browser.
 *
 * This exists so verification cannot be faked. An agent claiming a feature
 * works has to produce screenshots of a genuinely rendered window, taken after
 * its own code started the app and its own steps drove it.
 *
 * The heavy lifting happens inside the container (see docker/e2e/driver.mjs).
 * This service's job is the outside: check Docker is usable, build the images
 * when they are missing, hand the scenario in, and read the report back out.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { createLogger } from '@dmaker/utils';
import { getExtendedPath } from '@dmaker/platform';
import type {
  E2ERunReport,
  E2ESandboxAvailability,
  E2ESandboxConfig,
  E2EScenario,
  E2EStepResult,
} from '@dmaker/types';

const execFileAsync = promisify(execFile);
const logger = createLogger('E2ESandbox');

const execEnv = { ...process.env, PATH: getExtendedPath() };

/**
 * Pinned to the repo's @playwright/test. A browser downloaded by one version
 * is not guaranteed to be driveable by another, so these move together.
 */
export const PLAYWRIGHT_VERSION = '1.57.0';
export const BASE_IMAGE = `dmaker/e2e-base:pw${PLAYWRIGHT_VERSION}`;
export const RUNNER_IMAGE = `dmaker/e2e-runner:pw${PLAYWRIGHT_VERSION}`;

/** Building a browser image is minutes of work, not seconds. */
const BUILD_TIMEOUT_MS = 20 * 60 * 1000;
/** A scenario that has not finished by now is hung, not slow. */
const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const DOCKER_INFO_TIMEOUT_MS = 15 * 1000;

/** Paths inside the container. Fixed, so a project layer can rely on them. */
const CONTAINER_PROJECT_DIR = '/project';
const CONTAINER_OUT_DIR = '/out';
const CONTAINER_DRIVER = '/opt/dmaker/driver.mjs';

export interface RunScenarioOptions {
  projectPath: string;
  scenario: E2EScenario;
  config: E2ESandboxConfig;
  /** Repo root, so the service can find the Dockerfiles when building. */
  repoRoot?: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Pull the useful line out of a failed docker invocation.
 *
 * child_process reports `Command failed: <the whole command>` and appends
 * stderr, so the actionable part is buried behind the echoed command.
 */
function describeDockerError(error: unknown): string {
  const raw = errorMessage(error);
  const { stderr, stdout } = (error ?? {}) as { stderr?: unknown; stdout?: unknown };
  return (
    (typeof stderr === 'string' && stderr.trim()) ||
    (typeof stdout === 'string' && stdout.trim()) ||
    raw
  );
}

export class E2ESandboxService {
  /**
   * Whether this machine can run a sandbox at all, and what is missing if not.
   *
   * Every failure here is actionable by the user, so each one is reported as
   * its own reason rather than a generic "unavailable".
   */
  async checkAvailability(): Promise<E2ESandboxAvailability> {
    let dockerVersion: string;
    try {
      const { stdout } = await execFileAsync('docker', ['info', '--format', '{{.ServerVersion}}'], {
        env: execEnv,
        timeout: DOCKER_INFO_TIMEOUT_MS,
      });
      dockerVersion = stdout.trim();
    } catch (error) {
      const detail = describeDockerError(error);
      const notInstalled = /is not recognized|command not found|ENOENT/i.test(detail);
      return {
        available: false,
        images: { base: false, runner: false },
        reason: notInstalled
          ? 'Docker is not installed or not on PATH. Install Docker Desktop to run sandbox tests.'
          : `The Docker daemon is not reachable. Start Docker Desktop and try again. (${detail})`,
      };
    }

    const [base, runner] = await Promise.all([
      this.imageExists(BASE_IMAGE),
      this.imageExists(RUNNER_IMAGE),
    ]);

    return {
      available: runner,
      dockerVersion,
      images: { base, runner },
      reason: runner ? undefined : 'The sandbox image has not been built yet.',
    };
  }

  /** Whether a tag is present locally. */
  async imageExists(image: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('docker', ['images', '-q', image], {
        env: execEnv,
        timeout: DOCKER_INFO_TIMEOUT_MS,
      });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Build whichever images are missing.
   *
   * The base is skipped when it already exists — it holds the browser and
   * takes minutes, whereas the runner on top of it takes seconds. `onProgress`
   * receives docker's own output so a caller can stream a long build.
   */
  async ensureImages(repoRoot: string, onProgress?: (line: string) => void): Promise<void> {
    const layers: Array<{ image: string; dockerfile: string }> = [
      { image: BASE_IMAGE, dockerfile: 'docker/e2e/base.Dockerfile' },
      { image: RUNNER_IMAGE, dockerfile: 'docker/e2e/runner.Dockerfile' },
    ];

    for (const layer of layers) {
      if (await this.imageExists(layer.image)) {
        onProgress?.(`${layer.image} already built, skipping`);
        continue;
      }
      onProgress?.(`Building ${layer.image} — this can take several minutes`);
      logger.info(`Building ${layer.image} from ${layer.dockerfile}`);
      try {
        const { stdout, stderr } = await execFileAsync(
          'docker',
          ['build', '-f', layer.dockerfile, '-t', layer.image, '.'],
          { cwd: repoRoot, env: execEnv, timeout: BUILD_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 }
        );
        // docker build writes its progress to stderr, not stdout.
        onProgress?.(stderr || stdout);
      } catch (error) {
        throw new Error(`Failed to build ${layer.image}: ${describeDockerError(error)}`);
      }
    }
  }

  /**
   * Build (or reuse) the project's own image layer, and return its tag.
   *
   * The tag carries a hash of the base image and the layer's contents, so an
   * unchanged layer is reused for free and an edited one rebuilds under a new
   * tag automatically. That is what keeps this cheap to iterate on: change a
   * line, get a new image in seconds on top of the cached browser layer,
   * without a stale tag silently serving the old contents.
   *
   * The build context is the project itself, so a layer can `COPY` the
   * project's own files (a lockfile, for instance) to install against.
   */
  async ensureProjectImage(
    projectPath: string,
    imageLayer: string,
    baseImage: string = RUNNER_IMAGE,
    onProgress?: (line: string) => void
  ): Promise<string> {
    const digest = crypto
      .createHash('sha256')
      .update(`${baseImage}\n${imageLayer}`)
      .digest('hex')
      .slice(0, 12);
    const image = `dmaker/e2e-project:${digest}`;

    if (await this.imageExists(image)) return image;

    // Written inside the project so the build context can see it, and so a
    // user can read exactly what was built rather than guessing.
    const dockerfileDir = path.join(projectPath, '.dmaker', 'e2e');
    const dockerfilePath = path.join(dockerfileDir, 'project.Dockerfile');
    await fs.mkdir(dockerfileDir, { recursive: true });
    await fs.writeFile(
      dockerfilePath,
      [
        "# Generated by DMaker from the project's e2eSandbox.imageLayer setting.",
        '# Edits here are overwritten — change the setting instead.',
        `FROM ${baseImage}`,
        '',
        imageLayer.trim(),
        '',
      ].join('\n')
    );

    onProgress?.(`Building project image ${image}`);
    logger.info(`Building project image ${image} for ${projectPath}`);
    try {
      const { stdout, stderr } = await execFileAsync(
        'docker',
        ['build', '-f', dockerfilePath, '-t', image, '.'],
        { cwd: projectPath, env: execEnv, timeout: BUILD_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 }
      );
      onProgress?.(stderr || stdout);
    } catch (error) {
      throw new Error(`Failed to build the project image: ${describeDockerError(error)}`);
    }

    return image;
  }

  /**
   * Run one scenario and return its report.
   *
   * A run that never reached the browser is reported as `error` with a
   * `setupError`, distinct from a scenario that ran and failed — the two need
   * different fixes, and collapsing them sends people looking in the wrong
   * place.
   */
  async runScenario(options: RunScenarioOptions): Promise<E2ERunReport> {
    const { projectPath, scenario, config } = options;
    const startedAt = new Date();
    const started = Date.now();

    const runId = `${startedAt.toISOString().replace(/[:.]/g, '-')}-${scenario.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)}`;
    const outputDir = path.join(projectPath, '.dmaker', 'e2e', runId);

    const failSetup = (setupError: string, appLog?: string): E2ERunReport => ({
      scenario: scenario.name,
      status: 'error',
      steps: [],
      outputDir,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - started,
      setupError,
      ...(appLog ? { appLog } : {}),
    });

    if (!config.app?.startCommand) {
      return failSetup(
        'This project has no start command configured, so there is nothing for the browser to open. Set one in Project Settings → Testing.'
      );
    }

    const availability = await this.checkAvailability();
    if (!availability.available) {
      return failSetup(availability.reason ?? 'The sandbox is not available on this machine.');
    }

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      path.join(outputDir, 'scenario.json'),
      JSON.stringify(
        {
          scenario,
          app: config.app,
          viewport: config.viewport ?? { width: 1280, height: 720 },
        },
        null,
        2
      )
    );

    // An explicit image wins; otherwise a project layer is built on the runner
    // when one is configured, and the plain runner is the fallback.
    let image = config.image || RUNNER_IMAGE;
    if (!config.image && config.imageLayer?.trim()) {
      try {
        image = await this.ensureProjectImage(projectPath, config.imageLayer);
      } catch (error) {
        return failSetup(errorMessage(error));
      }
    }

    const args = [
      'run',
      '--rm',
      // The browser renders whatever the app serves. Nothing here should be
      // able to reach the user's network or filesystem beyond the project.
      '--network',
      'bridge',
      // Chromium's shared memory default (64MB) is too small and it crashes
      // mid-render on real pages.
      '--shm-size',
      '1g',
      '-v',
      `${projectPath}:${CONTAINER_PROJECT_DIR}`,
      '-v',
      `${outputDir}:${CONTAINER_OUT_DIR}`,
      '-e',
      `DMAKER_WORK_DIR=${CONTAINER_PROJECT_DIR}`,
      '-e',
      `DMAKER_OUT_DIR=${CONTAINER_OUT_DIR}`,
      image,
      'node',
      CONTAINER_DRIVER,
    ];

    try {
      await execFileAsync('docker', args, {
        env: execEnv,
        timeout: RUN_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch (error) {
      // A non-zero exit is how the driver reports a failed scenario, so this
      // is not necessarily a problem — the report it wrote is authoritative.
      // Only treat it as a setup failure when no report came out at all.
      const report = await this.readReport(outputDir);
      if (report) return this.withHostPaths(report, outputDir, startedAt, started);
      return failSetup(`The sandbox container failed to run: ${describeDockerError(error)}`);
    }

    const report = await this.readReport(outputDir);
    if (!report) {
      return failSetup('The sandbox finished but produced no report, which should not happen.');
    }
    return this.withHostPaths(report, outputDir, startedAt, started);
  }

  /** The driver's report, or null when it never wrote one. */
  private async readReport(outputDir: string): Promise<E2ERunReport | null> {
    try {
      const raw = await fs.readFile(path.join(outputDir, 'report.json'), 'utf8');
      return JSON.parse(raw) as E2ERunReport;
    } catch {
      return null;
    }
  }

  /**
   * The driver only knows container paths. Callers need host paths to open the
   * screenshots, and the wall-clock duration including container startup.
   */
  private withHostPaths(
    report: E2ERunReport,
    outputDir: string,
    startedAt: Date,
    started: number
  ): E2ERunReport {
    return {
      ...report,
      outputDir,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - started,
      steps: report.steps.map(
        (step): E2EStepResult => ({
          ...step,
          ...(step.screenshot ? { screenshot: step.screenshot } : {}),
        })
      ),
    };
  }
}

let instance: E2ESandboxService | null = null;

export function getE2ESandboxService(): E2ESandboxService {
  if (!instance) instance = new E2ESandboxService();
  return instance;
}
