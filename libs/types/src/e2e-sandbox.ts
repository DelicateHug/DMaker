/**
 * E2E sandbox — running a project's app in a Linux container and driving it
 * with a real, headed browser.
 *
 * The point is verification an agent cannot fake: it starts the app, drives it
 * the way a person would, and comes back with screenshots of a genuinely
 * rendered window. Nothing is shown on the user's desktop — the display exists
 * only inside the container.
 */

/** How a project's app is started so the browser has something to point at. */
export interface E2ESandboxAppConfig {
  /**
   * Shell command that starts the app, run inside the container at the project
   * root (e.g. `npm run dev`). The run is aborted if the port never opens.
   */
  startCommand: string;
  /** Port the app listens on once started. */
  port: number;
  /**
   * Path checked to decide the app is up, appended to the origin. Defaults to
   * `/`. Use a cheap endpoint — it may be polled many times.
   */
  readyPath?: string;
  /** How long to wait for the port before giving up. Defaults to 120s. */
  readyTimeoutMs?: number;
  /**
   * Command run once before `startCommand`, for installing dependencies.
   * Skipped when the project layer already has them.
   */
  installCommand?: string;
  /** Extra environment for both commands. */
  env?: Record<string, string>;
}

/** Per-project sandbox settings, stored in the project's settings.json. */
export interface E2ESandboxConfig {
  /** Off by default — a sandbox run costs a container and a browser. */
  enabled: boolean;
  /** Image the runs happen in. Defaults to DMaker's own runner image. */
  image?: string;
  /** How the app under test is started. Absent means runs cannot start. */
  app?: E2ESandboxAppConfig;
  /** Browser window size. Defaults to 1280x720. */
  viewport?: { width: number; height: number };
  /**
   * Extra Dockerfile lines stacked on top of the runner image to make the
   * project's own layer — where a project installs what its app needs.
   */
  imageLayer?: string;
}

/** One thing to do to the page. Exactly one action per step. */
export interface E2EStep {
  /** Shown in the report and used to name the screenshot. */
  name: string;
  /** Navigate, relative to the app's origin (e.g. `/settings`). */
  goto?: string;
  /** Click the first element matching this selector. */
  click?: string;
  /** Type into the first element matching `selector`. */
  fill?: { selector: string; value: string };
  /** Wait for a selector to be visible before continuing. */
  waitFor?: string;
  /** Fail the step unless this text appears on the page. */
  expectText?: string;
  /** Capture the window after the action. Defaults to true. */
  screenshot?: boolean;
}

/** A scenario handed to the sandbox. */
export interface E2EScenario {
  /** Named in the report so a run is identifiable after the fact. */
  name: string;
  /** Feature this run is verifying, when there is one. */
  featureId?: string;
  steps: E2EStep[];
}

/** What happened to one step. */
export interface E2EStepResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  /** File name of the screenshot, relative to the run's output directory. */
  screenshot?: string;
  /** Why it failed — the assertion, or the browser's own error. */
  error?: string;
  durationMs: number;
  /** Console errors the page emitted during this step. */
  consoleErrors?: string[];
}

/** The result of a whole scenario. */
export interface E2ERunReport {
  scenario: string;
  status: 'passed' | 'failed' | 'error';
  steps: E2EStepResult[];
  /** Absolute path on the host holding the screenshots and this report. */
  outputDir: string;
  startedAt: string;
  durationMs: number;
  /**
   * Set when the run never got as far as the browser — no Docker, image
   * missing, app failed to start. Distinct from a scenario that ran and
   * failed, because the fix is different.
   */
  setupError?: string;
  /** Tail of the app's own output, for when it refused to start. */
  appLog?: string;
}

/** Whether this machine can run a sandbox at all. */
export interface E2ESandboxAvailability {
  available: boolean;
  /** Docker server version when reachable. */
  dockerVersion?: string;
  /** Which of DMaker's images are already built. */
  images: { base: boolean; runner: boolean };
  /** What to fix, when unavailable. */
  reason?: string;
}
