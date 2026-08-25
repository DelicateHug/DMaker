/**
 * Environment API — which half of the dev/prod pair this UI is talking to.
 *
 * Deliberately standalone rather than part of the `ElectronAPI` surface: this
 * only means anything when DMaker was started by `start.ps1`, and folding it
 * into the shared interface would push it through the Electron preload bridge
 * for no benefit.
 */

import { createLogger } from '@dmaker/utils/logger';
import { getServerUrlSync } from './http-api-client';

const logger = createLogger('EnvironmentApi');

export type DMakerEnvName = 'dev' | 'prod';

export interface EnvironmentInfo {
  env: DMakerEnvName;
  role: 'app' | 'runner';
  readOnly: boolean;
  selfUrl: string;
  /** URL of the other environment's UI — the target of the switch link. */
  peerUrl: string;
  peerEnv: DMakerEnvName;
  selfProjectPath: string | null;
  launcherManaged: boolean;
  selfUpdateEnabled: boolean;
  version: string;
  runner: {
    configured: boolean;
    connected: boolean;
    url: string | null;
  };
}

export type SelfUpdatePhase =
  | 'preflight'
  | 'stash'
  | 'pull'
  | 'unstash'
  | 'install'
  | 'build'
  | 'restart'
  | 'done'
  | 'failed';

export interface SelfUpdateEvent {
  type: 'self-update';
  phase: SelfUpdatePhase;
  status: 'running' | 'ok' | 'error';
  message: string;
  output?: string;
  conflicts?: string[];
}

export interface SelfUpdateResult {
  success: boolean;
  phase: SelfUpdatePhase;
  message: string;
  conflicts?: string[];
  fromCommit?: string;
  toCommit?: string;
  restarting?: boolean;
}

/**
 * Read this server's environment. Resolves to `null` when the endpoint isn't
 * there — an older server, or the Electron build — so callers can simply not
 * render the environment chrome.
 */
export async function fetchEnvironmentInfo(): Promise<EnvironmentInfo | null> {
  try {
    const res = await fetch(`${getServerUrlSync()}/api/environment`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as EnvironmentInfo & { success?: boolean };
    if (!data || typeof data.env !== 'string') return null;
    return data;
  } catch (error) {
    logger.warn('Could not read environment info:', error);
    return null;
  }
}

export async function fetchSelfUpdateStatus(): Promise<{
  enabled: boolean;
  running: boolean;
  projectPath: string | null;
  lastResult: SelfUpdateResult | null;
} | null> {
  try {
    const res = await fetch(`${getServerUrlSync()}/api/self-update/status`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Start Update Prod.
 *
 * The request stays open for the whole pull-and-build, which is minutes rather
 * than seconds — progress arrives separately over {@link subscribeSelfUpdate}.
 * On success the server exits to be restarted, so the response may never
 * arrive; treat a network failure after a `restart` event as expected.
 */
export async function startSelfUpdate(): Promise<SelfUpdateResult> {
  const res = await fetch(`${getServerUrlSync()}/api/self-update/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({}),
  });
  return (await res.json()) as SelfUpdateResult;
}

/**
 * Subscribe to self-update progress on a short-lived WebSocket.
 *
 * Opened only while the update dialog is showing, and closed with it — the
 * main app socket is shared by the whole UI and this traffic is bursty.
 */
export function subscribeSelfUpdate(onEvent: (event: SelfUpdateEvent) => void): () => void {
  let socket: WebSocket | null = null;
  let closed = false;

  try {
    const wsUrl = `${getServerUrlSync().replace(/^http/, 'ws')}/api/events`;
    socket = new WebSocket(wsUrl);
    socket.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data as string) as { type?: string; payload?: unknown };
        if (parsed?.type === 'self-update:event' && parsed.payload) {
          onEvent(parsed.payload as SelfUpdateEvent);
        }
      } catch {
        // A malformed frame is not worth surfacing to the user mid-update.
      }
    };
    socket.onerror = () => {
      logger.warn('Self-update event socket errored');
    };
  } catch (error) {
    logger.warn('Could not open the self-update event socket:', error);
  }

  return () => {
    if (closed) return;
    closed = true;
    try {
      socket?.close();
    } catch {
      // Already gone.
    }
  };
}

/**
 * Poll the server's health endpoint until it answers again.
 *
 * Used after Update Prod exits the process: the launcher relaunches it, and the
 * UI reloads as soon as the new build is listening.
 */
export async function waitForServerBack(timeoutMs = 180_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const url = `${getServerUrlSync()}/api/health`;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return true;
    } catch {
      // Still down — expected while the server restarts.
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}
