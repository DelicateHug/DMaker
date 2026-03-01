# DMaker

**Stop typing code. Start directing AI agents.**

DMaker is an autonomous AI development studio. You describe features, and AI agents build them — each in an isolated git worktree, with adaptive planning that scales to the complexity of the task. Built with React, Vite, Electron, and Express, powered by Claude Agent SDK.

## What Makes DMaker Different

### Adaptive Planning

Most AI coding tools give you one planning mode. DMaker's agents **assess complexity in real-time and escalate automatically**:

- **Trivial change** (1 file, obvious fix) — the agent skips planning and implements immediately
- **Simple feature** (1-3 files, clear requirements) — brief outline, auto-approved, implementation continues in the same stream
- **Multi-file feature** (new components, API + UI) — structured spec with task breakdown, waits for your approval
- **Complex system** (cross-cutting, phased work) — comprehensive design document with phases, acceptance criteria, risk analysis

The agent starts light and only escalates when it discovers the work requires it. No unnecessary planning overhead for simple changes, no under-planning for complex ones. You can also force a specific depth (`always-lite`, `always-spec`, `always-full`) if you prefer consistency.

### Concurrent Multi-Feature Orchestration

DMaker doesn't just run one agent at a time. Auto-mode manages a **pipeline of features** executing in parallel:

- Configurable concurrency — run as many features simultaneously as your API limits allow
- Dependency-aware scheduling — features wait for their dependencies to complete before starting
- Failure resilience with rate-limit detection and automatic pausing
- Execution state recovery across restarts

### Multi-Agent Task Decomposition

For complex features, spec mode generates a structured task breakdown. Each task gets its own agent with focused context, rather than one agent trying to hold everything in memory.

### Context-Aware Memory

Agents don't start from scratch. DMaker loads relevant context files, project memory, and learnings from previous executions — selected based on the current task. After execution, insights are extracted and recorded for future runs.

## Quick Start

### Prerequisites

- **Node.js 22+** (>=22.0.0 <23.0.0)
- **[Claude Code CLI](https://code.claude.com/docs/en/overview)** — installed and authenticated

### Setup

```bash
git clone https://github.com/DelicateHug/DMaker.git
cd DMaker
npm install
npm run dev
```

Choose **Web** (browser at localhost:3007) or **Desktop** (Electron).

DMaker detects your Claude Code CLI credentials automatically.

## How It Works

1. **Add Features** — describe what you want built (text, images, screenshots)
2. **Start Auto-Mode** — DMaker assigns agents, resolves dependencies, manages the queue
3. **Adaptive Planning** — each agent assesses complexity and plans accordingly
4. **Isolated Execution** — every feature builds in its own git worktree
5. **Review & Ship** — review diffs, approve changes, create PRs directly

## Core Features

**Orchestration**

- Kanban board with drag-and-drop workflow management
- Auto-mode with concurrent feature execution and dependency resolution
- Real-time streaming of agent progress, tool usage, and task completion
- GitHub issue import with claim/unclaim and assignee sync

**Planning & Intelligence**

- Adaptive planning that scales to task complexity (lite → spec → full)
- Extended thinking modes (none, medium, deep, ultra) per feature
- Multi-agent task decomposition for complex features
- Per-feature model selection (Opus, Sonnet, Haiku)

**Safety & Isolation**

- Every feature executes in an isolated git worktree
- Plan approval workflow — review specs before implementation begins
- Path sandboxing with configurable root directory restrictions
- Docker deployment for full filesystem isolation

**Developer Experience**

- Integrated terminal with tabs, splits, and persistent sessions
- Context file management — markdown, images, docs that agents reference automatically
- Interactive dependency graph visualization
- 25+ themes, customizable keyboard shortcuts
- Cross-platform: macOS, Windows, Linux (desktop and web)

**Multi-Provider Support**

- Claude (primary, via Agent SDK)
- GCP Vertex AI (Gemini models)
- Cursor, Codex, and OpenCode providers

## Running

```bash
npm run dev                    # Interactive launcher
npm run dev:web                # Web browser (localhost:3007)
npm run dev:electron           # Desktop app
npm run dev:electron:debug     # Desktop with DevTools
```

### Building

```bash
npm run build                  # Web build
npm run build:electron         # Desktop build (current platform)
npm run build:electron:mac     # macOS (DMG + ZIP)
npm run build:electron:win     # Windows (NSIS installer)
npm run build:electron:linux   # Linux (AppImage + DEB + RPM)
```

### Docker

```bash
docker-compose up -d
# UI: http://localhost:3007 | API: http://localhost:3008
```

### Testing

```bash
npm run test                   # E2E tests (Playwright)
npm run test:server            # Server unit tests (Vitest)
npm run test:all               # All tests
```

## Architecture

```
DMaker/
├── apps/
│   ├── ui/                    # React + Vite + Electron frontend
│   └── server/                # Express + WebSocket backend
└── libs/
    ├── types/                 # Core TypeScript definitions
    ├── utils/                 # Logging, errors, utilities
    ├── prompts/               # AI prompt templates
    ├── platform/              # Path management, security
    ├── model-resolver/        # Claude model aliasing
    ├── dependency-resolver/   # Feature dependency ordering
    └── git-utils/             # Git operations & worktree management
```

**Frontend:** React 19, Vite 7, Electron 39, TanStack Router, Zustand 5, Tailwind CSS 4

**Backend:** Node.js, Express 5, Claude Agent SDK, WebSocket, node-pty

**Testing:** Playwright (E2E), Vitest (unit), ESLint 9, Prettier 3

## Environment Variables

| Variable                 | Default   | Description                 |
| ------------------------ | --------- | --------------------------- |
| `PORT`                   | `3008`    | Server port                 |
| `DATA_DIR`               | `./data`  | Data storage directory      |
| `ALLOWED_ROOT_DIRECTORY` | -         | Restrict file operations    |
| `DMAKER_API_KEY`         | -         | Optional API authentication |
| `CORS_ORIGIN`            | localhost | CORS allowed origins        |

## Security

> **This software uses AI-powered tooling with access to your operating system. Use at your own risk.**
>
> AI agents can read, modify, and delete files. We recommend running DMaker in Docker or a virtual machine rather than directly on your local machine.
>
> **[Read the full disclaimer](./DISCLAIMER.md)**

## Community

Join the **Agentic Jumpstart** Discord: [discord.gg/jjem7aEDKU](https://discord.gg/jjem7aEDKU)

## License

Licensed under the **DMaker License Agreement**. See [LICENSE](LICENSE) for full terms.

**Allowed:** Use DMaker to build anything (commercial or free), internal use, modify for your organization.

**Restricted:** No reselling DMaker itself, no hosting as SaaS, no distributing modified versions for money.
