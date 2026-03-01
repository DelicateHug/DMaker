# DMaker

**Stop typing code. Start directing AI agents.**

DMaker is an autonomous AI development studio. Describe features, and AI agents build them — with adaptive planning, adaptive memory, concurrent execution, and full git isolation.

## What Makes DMaker Different

**Adaptive Planning** — Fully automatic by default. DMaker assesses complexity in real-time and selects the right planning depth on its own — from skipping straight to implementation for trivial fixes, to generating full phased design documents for complex systems. You can override and manually select a planning mode if you want, but you don't have to. It just works.

**Adaptive Memory** — DMaker auto-generates memory at different tiers and sizes, selected based on the current task context. Like planning, memory is fully automatic and adaptive. Agents learn from previous executions and carry relevant knowledge forward without manual configuration.

**Context** — Human-authored context files (markdown, images, docs) that you control. Agents reference these automatically during execution. You decide what your agents should know.

**Agent Chat** — Talk 1-on-1 with AI agents about features, architecture, or anything. Supports multiple concurrent chat sessions with full history.

**Dynamic Agents** — Agents can be assigned manually, auto-assigned, or referenced by name or folder path. DMaker discovers available agents automatically from user-level and project-level directories.

**GitHub Integration** — Full collaboration workflow. Import issues as features, detect and manage claims, modify issues from the client, sync assignees, and manage your backlog without leaving DMaker.

**Concurrent Execution** — Run as many features simultaneously as your API limits allow. Dependency-aware scheduling, rate-limit detection, failure resilience, and state recovery across restarts.

**Metrics & Observability** — Stats, logs, summaries, and progress tracking at every stage of execution. Know exactly what your agents are doing and how they're performing.

**File System & Editor** — Full syntax-highlighted file browser with markdown support for reviewing and managing project files.

**Git Worktree Isolation** — Every feature builds in its own isolated worktree. Your main branch is always protected.

**Multi-Provider** — Claude (primary), GCP Vertex AI, Cursor, Codex, and OpenCode.

## Quick Start

```bash
git clone https://github.com/DelicateHug/DMaker.git
cd DMaker
npm install
npm run dev
```

Requires **Node.js 22+** and **[Claude Code CLI](https://code.claude.com/docs/en/overview)** (authenticated). DMaker detects your CLI credentials automatically.

Choose **Web** (localhost:3007) or **Desktop** (Electron).

## Running

```bash
npm run dev                    # Interactive launcher
npm run dev:web                # Web browser
npm run dev:electron           # Desktop app
npm run build:electron         # Build desktop (macOS/Windows/Linux)
docker-compose up -d           # Docker deployment
```

## Security

> **This software uses AI-powered tooling with access to your operating system. Use at your own risk.**
>
> We recommend running DMaker in Docker or a VM. **[Full disclaimer](./DISCLAIMER.md)**

## Community

[Agentic Jumpstart Discord](https://discord.gg/jjem7aEDKU)

## License

[DMaker License Agreement](LICENSE) — Use DMaker to build anything. No reselling the tool itself, no hosting as SaaS.
