/**
 * The execution surface of the API — the endpoints that start, control or
 * report on work that outlives a single request.
 *
 * Two features read from this one table so they can never drift apart:
 *
 *  - the read-only gate (dev), which refuses the *starting* endpoints;
 *  - the runner proxy (prod), which forwards the whole surface to the runner
 *    daemon so a server rebuild doesn't take running work with it.
 *
 * Paths are matched against `req.originalUrl` without its query string, so they
 * include the `/api` mount prefix.
 */

/**
 * Prefixes forwarded wholesale to the runner daemon when one is configured.
 *
 * These are proxied as complete routers rather than individual endpoints
 * because their control and status endpoints read in-memory state that lives
 * wherever the work is actually running. Splitting them would leave the UI
 * asking the wrong process "is this still going?".
 *
 * Deliberately NOT proxied:
 *  - `/api/terminal` — a pty is bound to its own process and its WebSocket;
 *    terminals are per-environment and die with their server by design.
 *  - `/api/features` (except `/running`) — plain disk reads, cheaper locally.
 *  - `/api/settings`, `/api/git`, `/api/worktree` — synchronous, no long tail.
 */
export const RUNNER_PROXY_PREFIXES = [
  '/api/agent',
  '/api/sessions',
  '/api/auto-mode',
  '/api/running-agents',
  '/api/suggestions',
  '/api/backlog-plan',
  '/api/ideation',
  '/api/spec-regeneration',
  '/api/deploy',
  '/api/e2e',
] as const;

/**
 * Individual endpoints proxied to the runner even though the rest of their
 * router stays local.
 */
export const RUNNER_PROXY_PATHS = ['/api/features/running'] as const;

/** Endpoints that stay local despite matching a proxied prefix. */
export const RUNNER_PROXY_EXCLUDE_PATHS = [
  // Script CRUD is filesystem editing, not a run — the local server owns it so
  // editing a deploy script still works when the runner is down.
  '/api/deploy/script',
  '/api/deploy/folder-scripts',
] as const;

export interface ReadOnlyRule {
  /** HTTP methods this rule covers. */
  methods: string[];
  /** Exact path (with `/api` prefix) or a prefix when `prefix` is true. */
  path: string;
  prefix?: boolean;
  /** Shown to the user when the request is refused. */
  what: string;
}

/**
 * Endpoints refused in read-only (dev) mode.
 *
 * The rule is "block execution, allow everything else": dev can browse, create,
 * edit and delete features, edit settings, specs and context files. What it
 * cannot do is *make something happen* — run an agent, run a feature, run a
 * pipeline step, run a deploy, or open a terminal.
 */
export const READ_ONLY_BLOCKED: ReadOnlyRule[] = [
  // --- agent chat -----------------------------------------------------------
  { methods: ['POST'], path: '/api/agent/start', what: 'Running an agent' },

  // --- feature / auto-mode execution ---------------------------------------
  { methods: ['POST'], path: '/api/auto-mode/run-feature', what: 'Running a feature' },
  { methods: ['POST'], path: '/api/auto-mode/resume-feature', what: 'Resuming a feature' },
  { methods: ['POST'], path: '/api/auto-mode/follow-up-feature', what: 'Running a follow-up' },
  { methods: ['POST'], path: '/api/auto-mode/verify-feature', what: 'Verifying a feature' },
  { methods: ['POST'], path: '/api/auto-mode/commit-feature', what: 'Committing a feature' },
  { methods: ['POST'], path: '/api/auto-mode/approve-plan', what: 'Approving a plan' },
  {
    methods: ['POST'],
    path: '/api/auto-mode/resume-interrupted',
    what: 'Resuming interrupted features',
  },
  { methods: ['POST'], path: '/api/auto-mode/analyze-project', what: 'Analyzing the project' },

  // --- agent-backed generation ---------------------------------------------
  { methods: ['POST'], path: '/api/suggestions/generate', what: 'Generating suggestions' },
  { methods: ['POST'], path: '/api/backlog-plan/generate', what: 'Generating a backlog plan' },
  { methods: ['POST'], path: '/api/backlog-plan/apply', what: 'Applying a backlog plan' },
  { methods: ['POST'], path: '/api/ideation/session/message', what: 'Running an ideation session' },
  { methods: ['POST'], path: '/api/ideation/analyze', what: 'Analyzing for ideas' },
  { methods: ['POST'], path: '/api/spec-regeneration/generate', what: 'Generating the spec' },
  { methods: ['POST'], path: '/api/spec-regeneration/create', what: 'Creating the spec' },
  {
    methods: ['POST'],
    path: '/api/spec-regeneration/generate-features',
    what: 'Generating features from the spec',
  },
  { methods: ['POST'], path: '/api/spec-regeneration/sync', what: 'Syncing the spec' },
  { methods: ['POST'], path: '/api/enhance-prompt', what: 'Enhancing a prompt' },
  { methods: ['POST'], path: '/api/features/generate-title', what: 'Generating a title' },
  { methods: ['POST'], path: '/api/github/validations', what: 'Validating an issue' },

  // --- deploys & e2e --------------------------------------------------------
  { methods: ['POST'], path: '/api/deploy/run', what: 'Running a deploy script' },
  { methods: ['POST'], path: '/api/e2e/run', what: 'Running E2E tests' },
  { methods: ['POST'], path: '/api/e2e/ensure-images', what: 'Building E2E images' },

  // --- terminals ------------------------------------------------------------
  { methods: ['POST'], path: '/api/terminal/sessions', what: 'Opening a terminal' },

  // --- self-update ----------------------------------------------------------
  { methods: ['POST'], path: '/api/self-update', prefix: true, what: 'Updating prod' },
];

/** Strip the query string so rules only ever match against the path. */
export function normalizePath(originalUrl: string): string {
  const q = originalUrl.indexOf('?');
  return q === -1 ? originalUrl : originalUrl.slice(0, q);
}

/** The rule blocking this request in read-only mode, or `null` if allowed. */
export function findReadOnlyRule(method: string, originalUrl: string): ReadOnlyRule | null {
  const path = normalizePath(originalUrl);
  const upperMethod = method.toUpperCase();

  for (const rule of READ_ONLY_BLOCKED) {
    if (!rule.methods.includes(upperMethod)) continue;
    if (rule.prefix) {
      if (path === rule.path || path.startsWith(`${rule.path}/`)) return rule;
    } else if (path === rule.path) {
      return rule;
    }
  }
  return null;
}

/** True when this request should be forwarded to the runner daemon. */
export function shouldProxyToRunner(originalUrl: string): boolean {
  const path = normalizePath(originalUrl);

  for (const excluded of RUNNER_PROXY_EXCLUDE_PATHS) {
    if (path === excluded) return false;
  }
  for (const exact of RUNNER_PROXY_PATHS) {
    if (path === exact) return true;
  }
  for (const prefix of RUNNER_PROXY_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }
  return false;
}
