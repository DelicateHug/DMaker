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

# Start Menu / desktop launch (what the DMaker shortcut runs)
./scripts/Launch-DMaker.ps1  # start.ps1, plus: open the browser, refuse to double-start

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
├── agent-sessions/        # Conversation histories
└── research/              # Research projects (see below)
    ├── isolated/sessions/{sessionId}/   # One throwaway sandbox per chat
    └── {projectId}/                     # Shared by all of its chats
        ├── project.json
        ├── CLAUDE.md
        └── .claude/{skills,memory}/
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
  repos and the same tasks - two lists was the bug, not the feature. Every UI
  PUTs its whole in-memory `projects` array, so the shared registry
  (`projects`, `currentProjectId`, `projectHistory`, `projectHistoryIndex`,
  `recentFolders`, `lastProjectDir`) is protected two ways:
  - `settings.projectsRevision` is bumped by the server whenever the registry
    actually changes. A write touching the registry must carry the revision it
    was built from; an older or absent one has those fields dropped and comes
    back with `registryRejected: true`, which makes the client refetch. A
    deliberate deletion from an up-to-date tab still works.
  - The read-only half is barred from registry writes outright, and reads
    global settings through its cache rather than from it - that cache is only
    invalidated by the writing process, so dev's copy could only ever be
    behind. Dev keeps its own view state (panel sizes, collapse flags).
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

### Research Projects

The AI icon in the sidebar footer enters **research mode**, which replaces the
repository tree with local research projects — AI chats that belong to no repo.
There is no Scratchpad any more; **Isolated** is what it became.

Each project is a real directory under `DATA_DIR/research/`, and the difference
between them is what the agent can see:

- **Isolated** - every chat gets a sandbox of its own under
  `research/isolated/sessions/{sessionId}`, sees only global (`~/.claude`)
  skills, loads no CLAUDE.md, and takes its sandbox with it when deleted. It is
  synthesised rather than stored, so it is always offered and cannot be renamed
  or deleted.
- **Every other project** - all of its chats share the one project directory, so
  what one chat writes the next one reads. On top of the globals it gets its own
  `.claude/skills/` and `.claude/memory/`, via `settingSources: ['user',
'project']` with the cwd set to the project. A starter `CLAUDE.md` names both
  paths, because an agent that is not told it has a memory directory will not
  use one.

Chats are ordinary agent sessions carrying `researchProjectId`
(`services/research-service.ts`, `routes/research.ts`). Sessions predating this
carry `scratch: true` and are read as belonging to Isolated. Research chats skip
`loadContextFiles()` entirely — that loader expects the `.dmaker/` layout, and a
research project keeps its memory in `.claude/memory/` instead.

`/api/research` is proxied to the runner alongside `/api/sessions`: deleting a
project stops and deletes its chats, and only the process running them can stop
them.

### The Task Workbench

An open task is one workbench with six panes, reachable with `Ctrl/Cmd+1`–`6`.
`WORKBENCH_TABS` in `store/workbench-store.ts` is the single source of truth and
`WorkbenchTabId` is derived from it, so a pane cannot exist in the type while
being missing from the strip (which would leave it persistable yet unreachable).

- **Agents** - the run as the tree of agents it actually was: Master on top, a
  row of sub-agents for each agent drilled into, and the selected agent's
  transcript underneath. Master selected with descendants included is the whole
  run's output byte for byte, which is what makes the pane non-regressive.
- **Changes** - uncommitted work in the feature's worktree: the changed-file
  list on the left, the selected file's hunks on the right, "open in editor" as
  an action rather than the point of the tab. It is `git diff HEAD` plus
  synthetic diffs for untracked files, so it goes empty the moment auto-mode's
  `commit-feature` runs. Review-before-commit is the real use case.
- **Phases** - plan phases and their tasks, the pipeline's steps, and the
  agent's live TodoWrite list. An empty `planSpec.tasks` beside a non-empty
  `planSpec.content` is normal (the lite prompt's numbered-list format parses to
  zero tasks), not an error.
- **Questions** - outstanding and resolved questions, each resolved card showing
  every choice that was offered with the chosen one marked.
- **Chat** - a composer that talks to the task's agent. It posts
  `inject-message`, which steers the run in place when one is live and falls
  back to `follow-up-feature` when none is. The pane says which of the two
  happened, because they are not the same thing - see "Steering a Running
  Agent" below for the four limits that make the distinction matter.
- **Browser** - the dev server running in this feature's worktree.

Panes stay mounted once opened (hidden with CSS) so scroll position, selection
and unsent drafts survive a tab switch. That is also why every polling pane is
handed `isActive` rather than left to poll while hidden - six panes across three
open tasks is eighteen mounted panes.

The retired tab ids `agent`, `diff`, `files` and `terminal` map to their
successors through `LEGACY_TAB_ALIASES`. `activeTab` is persisted per user, so
without the map everyone parked on a retired tab fails `isWorkbenchTabId` and is
silently teleported to the default - no crash, just lost intent. Keep those
entries forever.

The **Terminal tool** is untouched by any of this. It is still its own sidebar
entry, route, quick-launcher item and `Ctrl` shortcut (`views/terminal-view.tsx`);
only the workbench's Terminal _pane_ was replaced.

### Agent Tree and Per-Agent Transcripts

A run is a tree, and **Master is always its root** (`MASTER_AGENT_ID = 'master'`
from `@dmaker/types`). A sub-agent is created from a `Task` `tool_use` block's
`id`; every message is then attributed to `msg.parent_tool_use_id ?? 'master'`.
The SDK has always populated `parent_tool_use_id` - nothing read it. That pairing
is what makes the tree correct at any depth without guessing: a child's id comes
from the block that spawned it, and its parent is the owner of the message that
contained that block. A `tool_result` matching a running node is the **only**
completion signal a sub-agent has (it has no `result` and no `system/init` of its
own), so `is_error` is how a failure is known.

`lib/agent-tree.ts` is a pure tracker (`observe` / `snapshot` / `finalize`) that
never throws and gives an unknown owner an `inferred: true` placeholder rather
than dropping a message. It rides inside the existing `auto-mode:event` envelope,
is resynced wholesale by `auto_mode_agent_tree` for a UI that joined mid-run, and
is persisted to `logs/agent-tree.json`. `POST /api/running-agents/tree` prefers
the in-memory copy and falls back to the sidecar.

Attribution inside the transcript is one line, written **only when the author
changes**:

```
[timestamp:<ISO>] [agent:<id>] ▶ <name>
```

The parser defaults to `master` until a marker says otherwise, so a file written
before this shipped parses exactly as it always did, and one row reading "Master"
over the whole transcript is correct behaviour rather than a bug. **Nothing was
migrated, and nothing needs to be.**

Three limits are structural. A future agent will try to fix them and cannot:

- **Sub-agent prose is not observable.** The SDK's Task progress emitter forwards
  a child message only when it carries `tool_use` or `tool_result` blocks, plus
  the child's opening prompt and its final answer. A child node is a tool
  timeline and a result, never narration.
- **Per-sub-agent cost is impossible.** `SDKResultMessage` carries no
  `parent_tool_use_id`, so cost and tokens cannot be attributed to a child. Wall
  clock and tool counts can be, and are. There is deliberately no cost column.
- **Depth-2 sub-agents have no observable activity** - the Task loop drops
  non-assistant/user inner items - and a `run_in_background` Task never gets an
  in-turn `tool_result`. Both are real nodes with nothing to show; render that
  honestly, never as idle or hung.

One hazard worth naming: `getThrottleKey` in `lib/events.ts` includes `agentId`,
and `auto_mode_progress` accumulates content. Drop the agent from that key and
Master's prose and a sub-agent's are concatenated into one payload stamped with
one `agentId` - wrong attribution, which is worse than none. `agentId` must stay
a **top-level** field of the event payload; nested or renamed, it silently falls
back to the feature-scoped key.

### Run Progress: Task Markers and Pipeline Steps

The prompts have always instructed the agent to emit `[TASK_START] T###`,
`[TASK_COMPLETE] T###` and `[PHASE_COMPLETE] Phase N`, and until this work
**nothing in the repo parsed them** - a repo-wide grep hit only
`libs/prompts/src/defaults.ts`. Lite/adaptive planning (the default path) writes
`tasksCompleted: 0` and then implements inline, and the loop that advanced the
counter only ran on `[SPEC_GENERATED]`, so every lite run read `0/N` for its
whole life. `parseProgressMarkers`, exported from `auto-mode-service.ts`, now
reads the markers and emits the **existing** `auto_mode_task_started` /
`auto_mode_task_complete` / `auto_mode_phase_complete` events, so the panels
light up with no new event types. The scan re-reads only the tail of the
accumulator plus whatever is new (scanning the whole growing string once per
streamed block is quadratic on a megabyte transcript), dedupes by marker key so a
marker split across chunks fires once, and seeds its seen-set from the starting
transcript so a follow-up run does not replay the previous session's tasks.

`Feature.pipelineProgress` is now written for real at both pipeline step
boundaries by `recordPipelineStepProgress` (step start and step completion), and
re-seeded whenever the pipeline's shape changes so an edited pipeline never
leaves entries pointing at steps that no longer exist. The older "an earlier
`step.order` therefore completed" inference is only true within one uninterrupted
sequential run, so the UI now applies it **only** to features whose runs predate
this field.

### Steering a Running Agent

`POST /api/auto-mode/inject-message` puts text into a live Claude session.
`AutoModeService.injectMessage` returns `delivered` / `not_running` /
`unsupported_provider` / `run_finished`, and the route falls back to
`follow-up-feature` when nothing is running, reporting which of the two happened
(`mode: 'injected' | 'follow-up'`) because they do different things. Four limits
are the whole story:

- **It lands at the next turn boundary, not mid-sentence.** The SDK queues an
  incoming user message and only picks it up when the current turn ends;
  `interrupt: true` shortens the wait by ending that turn. Nothing in the SDK
  offers mid-turn delivery, so do not go looking for it.
- **Only the main stream loop has a channel.** Nested runs (plan revision,
  per-task, continuation) and every pipeline step open **separate** CLI
  processes, so a message sent during those phases would queue against an idle
  one. Only `ClaudeProvider` has the streaming-input mode this needs; every other
  provider keeps the plain string prompt. Both cases answer
  `unsupported_provider` rather than pretending.
- **`DMAKER_MOCK_AGENT=true` returns before any provider call**, so no channel is
  ever opened and injection always reports `unsupported_provider` there. No E2E
  can exercise the delivered path.
- Opening a channel switches the SDK out of single-turn mode, which **removes its
  own "close stdin on the first result" safety net**. The channel then owns the
  child process's lifetime and must be closed at every exit - the result handler,
  the `break streamLoop`, and the first statement of the `finally` - or an ~11MB
  CLI process leaks. `DMAKER_DISABLE_MESSAGE_INJECTION=true` puts every run back
  on the plain string prompt without a rebuild.

The endpoint is in `READ_ONLY_BLOCKED`: dev and prod share one runner, and an
ungated endpoint would let the read-only half steer prod's live agents.

### Agent Questions

`services/agent-question-service.ts` is the single process-global owner of the
question lifecycle. Four of its rules are load-bearing:

- **`number` is assigned inside the same `FeatureLoader.update()` call that
  appends the question.** `update()` is an unlocked read-modify-write, so a
  counter read separately races and produces two "Question 3"s.
- **The choices offered are recorded alongside the answer.** A question carries
  `choices` (id, label, description) and the answer carries `selectedOptionIds`,
  so a resolved card can show everything that was on screen with the picked one
  marked. A legacy question holding only `options: string[]` is given the same
  positional ids (`opt-1`, …) by `questionChoices()`, or the entire existing
  corpus could only ever be answered as free text.
- **`answerSource` is derived server-side and never taken from the request.**
  Skipped → `'skipped'`; `selectedOptionIds` present → `'option'`, with the
  answer text synthesised from the matching labels; otherwise `'custom'`. A test
  pins that a client-sent `answerSource` is ignored.
- **A blocking ask has a 30-minute ceiling.** A wait that ends unanswered stamps
  `expiredAt`, and a question counts as outstanding only when it has no `answer`,
  no `skipped` and no `expiredAt` - otherwise one dead question wedges a drafter
  or sits on the board for ever.

### Asking the User

A running implementation agent can park on a decision it cannot make from the
repository. `apps/server/src/lib/ask-user-tool.ts` builds an **in-process MCP
server** (`createSdkMcpServer` + `tool()`) exposing `mcp__dmaker_ask__ask_user`,
whose input mirrors the SDK's own `AskUserQuestion` shape field for field -
that is the shape the model is trained on. The model must never offer an
"Other" option: the panel always renders its own free-text path, so an invented
one is a visible duplicate (`normaliseAskQuestion` strips it anyway).

Four things about it are load-bearing:

- **It is not `canUseTool`.** Intercepting the SDK's built-in AskUserQuestion
  works, but `canUseTool` is per-run and global - taking it would make DMaker
  the permission handler for every tool call, against the bypassPermissions
  stance. The MCP channel copies the shape instead of hijacking the tool.
- **The call blocks, with a 30-minute ceiling.** It reuses
  `AutoModeService.waitForQuestionAnswer` (the plan-approval waiter) and
  `AgentQuestionService`, so numbering, choices, `answerSource` and the
  `feature:question-*` events are the same lifecycle the panel already drives.
  Unbounded would hold a worktree, a concurrency slot and a subprocess, and
  under `maxConcurrency` it deadlocks the queue behind whoever went to lunch.
  A wait that ends unanswered stamps `expiredAt`, or the question sits
  outstanding on the board for ever.
- **It survives a read-only run.** `createAutoModeOptions` drops every MCP
  server when `readOnly` is set; the ask server is exempted explicitly, because
  it writes a question and blocks and so cannot touch the tree. Dropping it
  would remove the tool on exactly the unowned tasks most likely to need a
  human.
- **It is Claude-only and budgeted.** Only `ClaudeProvider` has an in-process
  MCP transport (`ExecuteOptions.inProcessMcpServers`), and a run may call it
  at most three times. `DEFAULT_ASK_USER_INSTRUCTIONS` in `libs/prompts` ships
  with the server or not at all - without the prompt text the tool is simply
  never called - and a unit test pins the two together.

### Three Live Bugs This Work Fixed

All three were silent, all three are easy to reintroduce:

- **`/api/features/answer-question` was not proxied to the runner.** Under
  `start.ps1` the blocked agent's resolver promise lives in the runner daemon
  while the answer POST was served by the app server, so the answer was
  discarded and the agent waited out its timeout. It works perfectly under
  `npm run dev:full`, which is why it was never caught locally. The path now
  sits in `RUNNER_PROXY_PATHS` and is deliberately **not** in
  `READ_ONLY_BLOCKED` - blocking it would stop the dev half answering a question
  about work the runner is doing.
- **The worktree diff handlers resolved `.worktrees/<featureId>`** while
  worktrees are actually created at `.worktrees/<branch-name-slug>`. The
  `access` threw ENOENT and the handler silently fell back to
  `getGitRepositoryDiffs(projectPath)`, returning `success: true` with the
  **main checkout's** changes - so the diff view had never once shown a
  feature's worktree. Those handlers now take an optional `branchName` and
  prefer `findExistingWorktreeForBranch`, and the Changes pane says on screen
  when it is showing the main checkout instead.
- **`[TASK_START]` / `[TASK_COMPLETE]` were emitted by the prompts and parsed by
  nothing**, which left lite planning - the default path - reporting `0/N` for
  the entire run. See "Run Progress" above.

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
- `DMAKER_DISABLE_ASK_USER=true` - Kill switch for the `ask_user` channel. Agents
  stop being able to block on a human decision (see "Asking the User" above)
- `DMAKER_DISABLE_MESSAGE_INJECTION=true` - Kill switch for mid-flight steering.
  Puts every run back on the plain string prompt, where the SDK closes stdin
  itself (see "Steering a Running Agent" above)
- `VITE_HOSTNAME` - Hostname for frontend API URLs (default: localhost)

### Dev/prod pair (set by `start.ps1`)

- `DMAKER_ENV` - `dev` or `prod`; defaults to whether the process runs from source or `dist`
- `DMAKER_ROLE` - `app` (serves a UI) or `runner` (executes tasks only)
- `DMAKER_READ_ONLY=true` - Refuse execution requests; never applies to a runner
- `DMAKER_RUNNER_URL` - Forward execution to a runner daemon (`auto` = `http://127.0.0.1:3029`)
- `DMAKER_PEER_URL` / `DMAKER_SELF_URL` - The two UIs, for the switch-environment link
- `DMAKER_SELF_PROJECT` - Path to this checkout; registers DMaker as one of its own projects
- `DMAKER_LAUNCHER_MANAGED=true` - A supervisor will restart this process, which is what enables Update Prod
