/**
 * Client for the standalone task runner daemon.
 *
 * The runner is an ordinary DMaker server started with `DMAKER_ROLE=runner`. It
 * serves no UI; it exists purely to own long-running work. App servers (dev and
 * prod) forward the execution surface to it over HTTP and replay its event
 * stream to their own WebSocket clients.
 *
 * The point of the split is restartability: `Update Prod` rebuilds and restarts
 * the prod server while features are mid-run, and the runner — a different PID
 * that nothing in the update touches — carries them through. When the prod
 * server comes back it reconnects here and the UI resumes streaming.
 *
 * If the runner is unreachable the proxy simply falls through to the local
 * in-process services, which is exactly how DMaker behaved before this existed.
 * That keeps `npm run dev:full`, the Electron build and the test suite working
 * with no runner in sight.
 */

import type { Request, Response, NextFunction } from 'express';
import { WebSocket } from 'ws';
import { createLogger } from '@dmaker/utils';
import type { EventType } from '@dmaker/types';
import type { EventEmitter } from './events.js';
import { shouldProxyToRunner } from './execution-routes.js';

const logger = createLogger('Runner');

/** Reconnect backoff, in ms, walked from the front and held at the last entry. */
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 5000, 10_000];

/** How long a proxied request may take before we give up and answer locally. */
const PROXY_TIMEOUT_MS = 120_000;

/** Headers that must not be copied verbatim onto the upstream request. */
const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'accept-encoding',
]);

export class RunnerClient {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private connected = false;

  constructor(
    private readonly baseUrl: string,
    private readonly events: EventEmitter
  ) {}

  /** Whether the event stream is currently attached. */
  isConnected(): boolean {
    return this.connected;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Attach to the runner's event stream, retrying forever. Called once at
   * startup — the runner may well not be up yet, and that is fine.
   */
  start(): void {
    this.closed = false;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  private connect(): void {
    if (this.closed) return;

    const wsUrl = `${this.baseUrl.replace(/^http/, 'ws')}/api/events`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (error) {
      this.scheduleReconnect(error);
      return;
    }
    this.ws = ws;

    ws.on('open', () => {
      this.connected = true;
      this.reconnectAttempt = 0;
      logger.info(`✓ Attached to runner event stream at ${this.baseUrl}`);
      // Tell the UI the runner is back so it can re-sync anything it missed
      // while we were detached (a restart, a runner crash, a cold start).
      this.events.emit('runner:status', { connected: true, url: this.baseUrl });
    });

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as { type?: string; payload?: unknown };
        if (!parsed?.type) return;
        // Re-emit into the local bus; every local WebSocket client is already
        // subscribed to it, so runner events reach the UI unchanged.
        this.events.emit(parsed.type as EventType, parsed.payload);
      } catch (error) {
        logger.warn('Dropped malformed runner event:', error);
      }
    });

    ws.on('close', () => {
      if (this.connected) {
        logger.warn('Runner event stream closed');
        this.events.emit('runner:status', { connected: false, url: this.baseUrl });
      }
      this.connected = false;
      this.scheduleReconnect();
    });

    ws.on('error', (error) => {
      // 'close' always follows, so reconnecting is handled there. Only log the
      // first failure of a streak to keep a down runner from flooding the log.
      if (this.reconnectAttempt === 0) {
        logger.warn(`Runner not reachable at ${this.baseUrl}: ${(error as Error).message}`);
      }
    });
  }

  private scheduleReconnect(error?: unknown): void {
    if (this.closed || this.reconnectTimer) return;
    if (error && this.reconnectAttempt === 0) {
      logger.warn('Runner connection failed:', error);
    }
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /**
   * Express middleware that forwards the execution surface to the runner.
   *
   * Mount it *before* the local routers. Anything the runner can't answer —
   * because it is down, or the request timed out — falls through to the local
   * implementation via `next()`, so behaviour degrades to in-process execution
   * rather than to an error page.
   */
  createProxyMiddleware() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!shouldProxyToRunner(req.originalUrl)) {
        next();
        return;
      }

      const target = `${this.baseUrl}${req.originalUrl}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

      try {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (HOP_BY_HOP.has(key.toLowerCase())) continue;
          if (typeof value === 'string') headers[key] = value;
        }

        const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
        const body = hasBody && req.body !== undefined ? JSON.stringify(req.body) : undefined;
        if (body !== undefined) headers['content-type'] = 'application/json';

        const upstream = await fetch(target, {
          method: req.method,
          headers,
          body,
          signal: controller.signal,
        });

        res.status(upstream.status);
        const contentType = upstream.headers.get('content-type');
        if (contentType) res.setHeader('Content-Type', contentType);

        // Server-sent events (deploy output, e2e output) must not be buffered.
        if (contentType?.includes('text/event-stream')) {
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.flushHeaders?.();
          if (upstream.body) {
            const reader = upstream.body.getReader();
            req.on('close', () => void reader.cancel().catch(() => {}));
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(Buffer.from(value));
            }
          }
          res.end();
          return;
        }

        const text = await upstream.text();
        res.send(text);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
          `Runner proxy failed for ${req.method} ${req.originalUrl} (${message}) — handling locally`
        );
        if (!res.headersSent) {
          next();
        } else {
          res.end();
        }
      } finally {
        clearTimeout(timeout);
      }
    };
  }
}

/** Ask a runner whether it is alive, without attaching to its event stream. */
export async function pingRunner(baseUrl: string, timeoutMs = 2000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
