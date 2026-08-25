/**
 * Runtime environment — which half of the dev/prod pair this process is, what it
 * is allowed to do, and who its peers are.
 *
 * `start.ps1` brings up four long-lived processes plus one runner:
 *
 *   prod UI  3007 ──> prod server 3009 ─┐
 *                                       ├─> runner daemon 3029 (owns execution)
 *   dev  UI  3017 ──> dev  server 3019 ─┘   (read-only dev never reaches it)
 *
 * Everything here is driven by environment variables so a plain `npm run
 * dev:full` (no launcher) keeps the old single-process behaviour: no read-only
 * gate, no runner, no self-update.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import { STATIC_PORT, DEV_STATIC_PORT, RUNNER_PORT } from '@dmaker/types';

export type DMakerEnvName = 'dev' | 'prod';
export type DMakerRole = 'app' | 'runner';

/**
 * True when this process is running off TypeScript source (`tsx`) rather than
 * the compiled `dist/index.js`. Same test `index.ts` uses to pick its port.
 */
function runningFromSource(): boolean {
  return fileURLToPath(import.meta.url).endsWith('.ts');
}

function envFlag(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

/** `dev` or `prod`. Defaults to whichever the source/dist split implies. */
export function getEnvName(): DMakerEnvName {
  const raw = process.env.DMAKER_ENV?.toLowerCase();
  if (raw === 'dev' || raw === 'prod') return raw;
  return runningFromSource() ? 'dev' : 'prod';
}

/**
 * `runner` processes exist only to execute tasks: they serve no UI, are never
 * read-only, and never proxy anywhere. `app` processes serve a UI and may
 * delegate execution to a runner.
 */
export function getRole(): DMakerRole {
  return process.env.DMAKER_ROLE === 'runner' ? 'runner' : 'app';
}

export function isRunner(): boolean {
  return getRole() === 'runner';
}

/**
 * Read-only mode blocks *execution* only — starting agents, auto-mode,
 * pipelines, deploys, terminals. Browsing, editing features, and changing
 * settings all still work. A runner is never read-only regardless of the flag,
 * since executing is its entire job.
 */
export function isReadOnly(): boolean {
  if (isRunner()) return false;
  return envFlag('DMAKER_READ_ONLY', false);
}

/**
 * URL of the *other* environment's UI, for the switch-environment link.
 * Falls back to the conventional port pair when the launcher didn't set it.
 */
export function getPeerUrl(): string {
  const explicit = process.env.DMAKER_PEER_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const hostname = process.env.HOSTNAME || 'localhost';
  const peerPort = getEnvName() === 'dev' ? STATIC_PORT : DEV_STATIC_PORT;
  return `http://${hostname}:${peerPort}`;
}

/** URL of this environment's own UI, used for log lines and the env banner. */
export function getSelfUrl(): string {
  const explicit = process.env.DMAKER_SELF_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const hostname = process.env.HOSTNAME || 'localhost';
  const port = getEnvName() === 'dev' ? DEV_STATIC_PORT : STATIC_PORT;
  return `http://${hostname}:${port}`;
}

/**
 * Base URL of the task runner daemon, or `null` when execution should stay
 * in-process (plain `npm run dev:full`, tests, Electron).
 *
 * Set `DMAKER_RUNNER_URL=auto` to use the default runner port.
 */
export function getRunnerUrl(): string | null {
  if (isRunner()) return null;
  const raw = process.env.DMAKER_RUNNER_URL;
  if (!raw) return null;
  if (raw === 'auto' || raw === 'true' || raw === '1') {
    return `http://127.0.0.1:${RUNNER_PORT}`;
  }
  return raw.replace(/\/$/, '');
}

/**
 * Absolute path of the DMaker checkout this process was launched from, when the
 * launcher asked us to manage ourselves. Enables two things: auto-registering
 * DMaker as a project on boot, and the Update Prod flow.
 */
export function getSelfProjectPath(): string | null {
  const raw = process.env.DMAKER_SELF_PROJECT;
  if (!raw) return null;
  return path.resolve(raw);
}

/** True when this process was started by `start.ps1` rather than by hand. */
export function isLauncherManaged(): boolean {
  return envFlag('DMAKER_LAUNCHER_MANAGED', false);
}

/**
 * Update Prod is only offered on a prod app server that (a) knows where its own
 * checkout is and (b) is supervised by a launcher that will restart it after the
 * rebuild. Everywhere else the button is hidden and the route refuses.
 */
export function isSelfUpdateEnabled(): boolean {
  return (
    getRole() === 'app' &&
    getEnvName() === 'prod' &&
    !isReadOnly() &&
    getSelfProjectPath() !== null &&
    isLauncherManaged()
  );
}

export interface RuntimeInfo {
  env: DMakerEnvName;
  role: DMakerRole;
  readOnly: boolean;
  selfUrl: string;
  peerUrl: string;
  peerEnv: DMakerEnvName;
  runnerUrl: string | null;
  selfProjectPath: string | null;
  launcherManaged: boolean;
  selfUpdateEnabled: boolean;
}

export function getRuntimeInfo(): RuntimeInfo {
  const env = getEnvName();
  return {
    env,
    role: getRole(),
    readOnly: isReadOnly(),
    selfUrl: getSelfUrl(),
    peerUrl: getPeerUrl(),
    peerEnv: env === 'dev' ? 'prod' : 'dev',
    runnerUrl: getRunnerUrl(),
    selfProjectPath: getSelfProjectPath(),
    launcherManaged: isLauncherManaged(),
    selfUpdateEnabled: isSelfUpdateEnabled(),
  };
}

/**
 * Exit code the prod server uses to ask its supervisor for a restart after a
 * successful self-update. `start.ps1` relaunches on this code and only this
 * code; any other exit is treated as a real crash.
 */
export const RESTART_EXIT_CODE = 75;
