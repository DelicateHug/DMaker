# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DMaker is an autonomous AI development studio built as an npm workspace monorepo. It provides a Kanban-based workflow where AI agents (powered by Claude Agent SDK) implement features in isolated git worktrees.

## Common Commands

```bash
# Development
npm run dev                 # Interactive launcher (choose web or electron)
npm run dev:web             # Web browser mode (localhost:3017, backend on 3019)
npm run dev:electron        # Desktop app mode
npm run dev:electron:debug  # Desktop with DevTools open
npm run dev:full            # Server + web UI together (dev pair only)

# Dev/prod pair (Windows, PowerShell)
./start.ps1                 # Bring up prod, dev and the task runner together
./start.ps1 -SkipBuild      # Same, but serve the last prod build as-is
./stop.ps1                  # Stop the whole set by exact PID/port

# Building
npm run build               # Build web application
npm run build:packages      # Build all shared packages (required before other builds)
npm run build:electron      # Build desktop app for current platform
npm run build:server        # Build server only

# Testing
npm run test                # E2E tests (Playwright, headless)
npm run test:headed         # E2E tests with browser visible
npm run test:server         # Server unit tests (Vitest)
npm run test:packages       # All shared package tests
npm run test:all            # All tests (packages + server)

# Single test file
npm run test:server -- tests/unit/specific.test.ts

# Linting and formatting
npm run lint                # ESLint
npm run format              # Prettier write
npm run format:check        # Prettier check
```

## Architecture

### Monorepo Structure

```
dmaker/
├── apps/
│   ├── ui/           # React + Vite + Electron frontend (3017 dev / 3007 built)
│   └── server/       # Express + WebSocket backend (3019 dev / 3009 built)
└── libs/             # Shared packages (@dmaker/*)
    ├── types/        # Core TypeScript definitions (no dependencies)
    ├── utils/        # Logging, errors, image processing, context loading
    ├── prompts/      # AI prompt templates
    ├── platform/     # Path management, security, process spawning
    ├── model-resolver/    # Claude model alias resolution
    ├── dependency-resolver/  # Feature dependency ordering
    └── git-utils/    # Git operations & worktree management
```

### Package Dependency Chain

Packages can only depend on packages above them:

```
@dmaker/types (no dependencies)
    ↓
@dmaker/utils, @dmaker/prompts, @dmaker/platform, @dmaker/model-resolver, @dmaker/dependency-resolver
    ↓
@dmaker/git-utils
    ↓
@dmaker/server, @dmaker/ui
```

### Key Technologies

- **Frontend**: React 19, Vite 7, Electron 39, TanStack Router, Zustand 5, Tailwind CSS 4
- **Backend**: Express 5, WebSocket (ws), Claude Agent SDK, node-pty
- **Testing**: Playwright (E2E), Vitest (unit)

### Server Architecture

The server (`apps/server/src/`) follows a modular pattern:

- `routes/` - Express route handlers organized by feature (agent, features, auto-mode, worktree, etc.)
- `services/` - Business logic (AgentService, AutoModeService, FeatureLoader, TerminalService)
- `providers/` - AI provider abstraction (currently Claude via Claude Agent SDK)
- `lib/` - Utilities (events, worktree metadata)

### Frontend Architecture

The UI (`apps/ui/src/`) uses:

- `routes/` - TanStack Router file-based routing
- `components/views/` - Main view components (board, settings, terminal, etc.)
- `store/` - Zustand stores with persistence (app-store.ts, setup-store.ts)
- `hooks/` - Custom React hooks
- `lib/` - Utilities and API client

## Data Storage

### Per-Project Data (`.dmaker/`)

```
.dmaker/
├── features/              # Feature JSON files and images
│   └── {featureId}/
│       ├── feature.json
│       ├── agent-output.md
│       └── images/
├── context/               # Context files for AI agents (CLAUDE.md, etc.)
├── settings.json          # Project-specific settings
├── spec.md               # Project specification
└── analysis.json         # Project structure analysis
```

### Global Data (`DATA_DIR`, default `./data`)

```
data/
├── settings.json          # Global settings, profiles, shortcuts
├── credentials.json       # API keys
├── sessions-metadata.json # Chat session metadata
└── agent-sessions/        # Conversation histories
```

## Import Conventions

Always import from shared packages, never from old paths:

```typescript
// ✅ Correct
import type { Feature, ExecuteOptions } from '@dmaker/types';
import { createLogger, classifyError } from '@dmaker/utils';
import { getEnhancementPrompt } from '@dmaker/prompts';
import { getFeatureDir, ensureDmakerDir } from '@dmaker/platform';
import { resolveModelString } from '@dmaker/model-resolver';
import { resolveDependencies } from '@dmaker/dependency-resolver';
import { getGitRepositoryDiffs } from '@dmaker/git-utils';

// ❌ Never import from old paths
import { Feature } from '../services/feature-loader'; // Wrong
import { createLogger } from '../lib/logger'; // Wrong
```

## Key Patterns

### Event-Driven Architecture

All server operations emit events that stream to the frontend via WebSocket. Events are created using `createEventEmitter()` from `lib/events.ts`.

### Dev/Prod Pair and the Task Runner

`start.ps1` runs two DMaker environments against one checkout plus a third
process that owns execution:

```
prod UI 3007 -> prod server 3009 --                                    >-- runner daemon 3029 (executes everything)
dev  UI 3017 -> dev  server 3019 --/   (dev never reaches it — it is read-only)
```

- **Dev is read-only.** It can browse and edit features, settings and specs, but
  every endpoint that _starts_ something (agents, features, pipelines, deploys,
  terminals) returns 403. The rules live in `apps/server/src/lib/execution-routes.ts`
  and drive both the read-only gate and the runner proxy, so the two can't drift.
- **Prod executes**, but delegates to the runner over HTTP and replays the
  runner's event stream to its own WebSocket clients (`lib/runner-client.ts`).
  Because the runner is a separate PID, "Update Prod" can rebuild and restart the
  prod server without stopping work already in flight.
- **One shared data directory.** Both halves use `data/`, so they show the same
  repos and the same tasks - two lists was the bug, not the feature. Both UIs
  PUT their whole in-memory `projects` array, so the read-only half is barred
  from writing the shared registry (`projects`, `currentProjectId`,
  `projectHistory`, `projectHistoryIndex`, `recentFolders`, `lastProjectDir`)
  and reads global settings through its cache rather than from it. Dev keeps its
  own view state - panel sizes, collapse flags - and nothing else.
- **Update Prod** (`services/self-update-service.ts`) stashes local changes,
  pulls `origin` with a rebase, pops the stash, rebuilds, then exits with code 75
  to ask `start.ps1` for a restart. Any conflict rolls the repo back to exactly
  where it started and rebuilds nothing.
- Without these environment variables nothing changes: `npm run dev:full`, the
  Electron build and the tests all still execute in process.

### Git Worktree Isolation

Each feature executes in an isolated git worktree, created via `@dmaker/git-utils`. This protects the main branch during AI agent execution.

### Setup Detection, Not a Setup Wizard

There is no first-run gate. On boot the UI asks `GET /api/setup/readiness`,
which reports one verdict built from the same Claude and `gh` probes the
settings page uses:

- **Both detected** - `setupComplete` is set silently and nothing is shown.
  Theme selection is skipped too; the default theme applies and Settings can
  change it.
- **Claude missing** - `blocking: true`. `SetupGate` raises a modal naming what
  is missing with the command to fix it. Without a Claude credential no agent
  can run, so this one waits.
- **Only GitHub missing** - reported as optional. Local worktrees work fine
  without `gh`; only PR and issue features need it.
- **Already complete, something regressed** - a toast, not a wall.

The wizard itself still lives at `/setup` and can be visited deliberately.
This matters most for the dev/prod pair: two data directories on one machine
used to mean two identical wizards for one set of credentials.

### Context Files

Project-specific rules are stored in `.dmaker/context/` and automatically loaded into agent prompts via `loadContextFiles()` from `@dmaker/utils`.

### Model Resolution

Use `resolveModelString()` from `@dmaker/model-resolver` to convert model aliases:

- `haiku` → `claude-haiku-4-5`
- `sonnet` → `claude-sonnet-4-20250514`
- `opus` → `claude-opus-4-6`

## Environment Variables

- `ANTHROPIC_API_KEY` - Anthropic API key (or use Claude Code CLI auth)
- `HOST` - Host to bind server to (default: 0.0.0.0)
- `HOSTNAME` - Hostname for user-facing URLs (default: localhost)
- `PORT` - Server port (default: 3019 from source via `tsx`, 3009 from built `dist`)
- `DATA_DIR` - Data storage directory (default: `./data`, **relative to the
  working directory**). `npm run dev:full` from the repo root and a server
  started from `apps/server/` therefore read two different project lists.
  `start.ps1` always passes an absolute path; the resolved directory is
  printed in the boot log.
- `ALLOWED_ROOT_DIRECTORY` - Restrict file operations to specific directory
- `DMAKER_MOCK_AGENT=true` - Enable mock agent mode for CI testing
- `VITE_HOSTNAME` - Hostname for frontend API URLs (default: localhost)

### Dev/prod pair (set by `start.ps1`)

- `DMAKER_ENV` - `dev` or `prod`; defaults to whether the process runs from source or `dist`
- `DMAKER_ROLE` - `app` (serves a UI) or `runner` (executes tasks only)
- `DMAKER_READ_ONLY=true` - Refuse execution requests; never applies to a runner
- `DMAKER_RUNNER_URL` - Forward execution to a runner daemon (`auto` = `http://127.0.0.1:3029`)
- `DMAKER_PEER_URL` / `DMAKER_SELF_URL` - The two UIs, for the switch-environment link
- `DMAKER_SELF_PROJECT` - Path to this checkout; registers DMaker as one of its own projects
- `DMAKER_LAUNCHER_MANAGED=true` - A supervisor will restart this process, which is what enables Update Prod
