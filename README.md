# DMaker

**Stop typing code. Start directing AI agents.**

DMaker is an autonomous AI development studio. Describe features on a Kanban board and watch AI agents implement them in isolated git worktrees. Built with React, Vite, Electron, and Express, powered by Claude Agent SDK.

## Quick Start

### Prerequisites

- **Node.js 22+** (required: >=22.0.0 <23.0.0)
- **npm** (comes with Node.js)
- **[Claude Code CLI](https://code.claude.com/docs/en/overview)** - Install and authenticate with your Anthropic subscription

### Setup

```bash
git clone https://github.com/DelicateHug/DMaker.git
cd DMaker
npm install
npm run dev
```

Choose between **Web Application** (browser at localhost:3007) or **Desktop Application** (Electron).

DMaker detects your authenticated Claude Code CLI credentials automatically.

## How It Works

1. **Add Features** - Describe what you want built (text, images, screenshots)
2. **Move to "In Progress"** - An AI agent is assigned automatically
3. **Watch It Build** - Real-time streaming as the agent writes code and runs tests
4. **Review & Verify** - Review changes via git diff, approve when ready
5. **Ship** - Commit and create PRs directly from the worktree

## Features

- **Kanban Board** - Drag-and-drop feature management across workflow stages
- **AI Agent Execution** - Claude-powered agents implement features autonomously
- **Git Worktree Isolation** - Each feature runs in its own worktree, protecting main
- **Real-time Streaming** - Live progress, tool usage, and task completion updates
- **Multi-Model Support** - Choose Claude Opus, Sonnet, or Haiku per feature
- **Extended Thinking** - Configurable thinking modes for complex problems
- **Planning Modes** - Skip, lite, spec, or full planning with optional approval
- **Multi-Agent Tasks** - Spec mode spawns dedicated agents per task
- **Project Analysis** - AI-powered codebase analysis and feature suggestions
- **Context Management** - Add docs and images that agents automatically reference
- **Dependency Graph** - Visualize and enforce feature execution order
- **GitHub Integration** - Import issues, validate feasibility, create PRs
- **Integrated Terminal** - Full terminal with tabs, splits, and persistent sessions
- **25+ Themes** - Dark, Light, Dracula, Nord, Catppuccin, and more
- **Cross-Platform** - Desktop (macOS, Windows, Linux) and web browser

## Running

```bash
npm run dev                    # Interactive launcher
npm run dev:web                # Web browser (localhost:3007)
npm run dev:electron           # Desktop app
npm run dev:electron:debug     # Desktop with DevTools
```

### TUI Launcher

```bash
./start-dmaker.sh              # Interactive menu
./start-dmaker.sh web          # Direct web launch
./start-dmaker.sh electron     # Direct desktop launch
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
docker-compose up -d           # Build and run
# UI: http://localhost:3007 | API: http://localhost:3008
```

Mount your Claude CLI config and project directories via `docker-compose.override.yml`:

```yaml
services:
  server:
    volumes:
      - /path/to/your/project:/projects/your-project
      - ~/.claude:/home/dmaker/.claude
      - ~/.config/gh:/home/dmaker/.config/gh
      - ~/.gitconfig:/home/dmaker/.gitconfig:ro
```

### Testing

```bash
npm run test                   # E2E tests (Playwright)
npm run test:server            # Server unit tests (Vitest)
npm run test:packages          # Shared package tests
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

### Tech Stack

**Frontend:** React 19, Vite 7, Electron 39, TanStack Router, Zustand 5, Tailwind CSS 4, Radix UI, xterm.js

**Backend:** Node.js, Express 5, Claude Agent SDK, WebSocket, node-pty

**Testing:** Playwright (E2E), Vitest (unit), ESLint 9, Prettier 3

### Data Storage

Per-project data lives in `.dmaker/` (features, context, settings). Global data lives in `DATA_DIR` (default `./data`).

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
