/**
 * Research projects — local, self-contained workspaces for AI chats that belong
 * to no repository.
 *
 * Each project is a real directory under `DATA_DIR/research/` carrying its own
 * `.claude/`, which is what gives it skills and memory of its own on top of the
 * global `~/.claude` every chat already sees. Chats in a project all run in that
 * one directory, so what the agent writes to `.claude/memory/` on Monday is
 * still there on Friday.
 *
 * One project is different: **Isolated**. Its chats get a throwaway sandbox
 * each, see only global skills, and take their sandbox with them when deleted.
 * That is the old Scratchpad, kept as the project you use when you want the
 * chat to leave nothing behind.
 */

import path from 'path';
import { secureFs } from '@dmaker/platform';
import { createLogger } from '@dmaker/utils';

/** The sandboxed project. Fixed id — the UI and the agent both key off it. */
export const ISOLATED_PROJECT_ID = 'isolated';

/** Directory name under DATA_DIR holding every research project. */
const RESEARCH_DIR = 'research';

/** Per-project descriptor, written beside the project's `.claude/`. */
const PROJECT_FILE = 'project.json';

export interface ResearchProject {
  id: string;
  name: string;
  /** Absolute path of the project directory — the cwd its chats run in */
  path: string;
  /**
   * Isolated: chats are sandboxed one directory each and see global skills
   * only. Every other project shares one directory and adds its own `.claude`.
   */
  isolated: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProjectFile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Seed `CLAUDE.md` for a new project.
 *
 * A research project is empty by definition, so without this the agent has no
 * way to know it *has* a memory directory, and the feature is a folder nobody
 * writes to. Naming the paths is the whole mechanism.
 */
function starterClaudeMd(name: string): string {
  return `# ${name}

A local research project. This directory is yours: it is not a git repository
and nothing here is deployed anywhere.

## Memory

\`.claude/memory/\` persists between chats in this project. Write down what a
future chat would have to rediscover — findings, decisions, sources, dead ends —
one topic per file, and read what is already there before starting fresh work.

## Skills

\`.claude/skills/\` holds skills scoped to this project, on top of the global
skills in \`~/.claude/skills/\`. Add one when a procedure here is worth repeating.
`;
}

/** `My Research!` -> `my-research`. Empty or symbol-only names fall back. */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'project';
}

/** Reject anything that could climb out of the research root. */
function isSafeId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(id) && id.length <= 64;
}

export class ResearchService {
  private root: string;
  private logger = createLogger('ResearchService');

  constructor(dataDir: string) {
    this.root = path.resolve(dataDir, RESEARCH_DIR);
  }

  /** Absolute path of a project directory. Does not check that it exists. */
  getProjectDir(projectId: string): string {
    return path.join(this.root, projectId);
  }

  /**
   * Working directory for one chat.
   *
   * Isolated hands every chat a sandbox of its own; every other project shares
   * the project directory, which is what lets its memory accumulate.
   */
  getChatWorkspace(projectId: string, sessionId: string): string {
    return projectId === ISOLATED_PROJECT_ID
      ? path.join(this.root, ISOLATED_PROJECT_ID, 'sessions', sessionId)
      : this.getProjectDir(projectId);
  }

  /** True when this project's chats are sandboxed and skill-restricted. */
  isIsolated(projectId: string): boolean {
    return projectId === ISOLATED_PROJECT_ID;
  }

  /** Create a chat's working directory, so the agent starts somewhere real. */
  async ensureChatWorkspace(projectId: string, sessionId: string): Promise<string> {
    const workspace = this.getChatWorkspace(projectId, sessionId);
    await secureFs.mkdir(workspace, { recursive: true });
    return workspace;
  }

  /** Remove an isolated chat's sandbox. A shared project directory stays put. */
  async removeChatWorkspace(projectId: string, sessionId: string): Promise<void> {
    if (!this.isIsolated(projectId)) return;
    try {
      await secureFs.rm(this.getChatWorkspace(projectId, sessionId), {
        recursive: true,
        force: true,
      });
    } catch (error) {
      this.logger.warn(`Failed to remove isolated sandbox for ${sessionId}:`, error);
    }
  }

  /**
   * Every project, Isolated first.
   *
   * Isolated is synthesised rather than stored: it has no settings to keep, and
   * a user who deleted its directory should still get the sandbox they asked
   * for on the next chat.
   */
  async list(): Promise<ResearchProject[]> {
    await secureFs.mkdir(this.root, { recursive: true });

    const entries = await secureFs
      .readdir(this.root, { withFileTypes: true })
      .catch(() => [] as Awaited<ReturnType<typeof secureFs.readdir>>);

    const projects: ResearchProject[] = [];
    for (const entry of entries) {
      if (typeof entry === 'string' || !entry.isDirectory()) continue;
      if (entry.name === ISOLATED_PROJECT_ID) continue;

      const file = await this.readProjectFile(entry.name);
      if (!file) continue;
      projects.push({
        id: file.id,
        name: file.name,
        path: this.getProjectDir(file.id),
        isolated: false,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      });
    }

    projects.sort((a, b) => a.name.localeCompare(b.name));
    return [this.isolatedProject(), ...projects];
  }

  /** One project by id, or null when it does not exist. */
  async get(projectId: string): Promise<ResearchProject | null> {
    if (this.isIsolated(projectId)) return this.isolatedProject();
    if (!isSafeId(projectId)) return null;

    const file = await this.readProjectFile(projectId);
    if (!file) return null;
    return {
      id: file.id,
      name: file.name,
      path: this.getProjectDir(file.id),
      isolated: false,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  /**
   * Create a project: its directory, its descriptor and the `.claude/` scaffold
   * that gives it skills and memory of its own.
   */
  async create(name: string): Promise<ResearchProject> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('A research project needs a name');

    await secureFs.mkdir(this.root, { recursive: true });
    const id = await this.freeId(slugify(trimmed));
    const dir = this.getProjectDir(id);

    await secureFs.mkdir(path.join(dir, '.claude', 'skills'), { recursive: true });
    await secureFs.mkdir(path.join(dir, '.claude', 'memory'), { recursive: true });

    const now = new Date().toISOString();
    const file: ProjectFile = { id, name: trimmed, createdAt: now, updatedAt: now };
    await secureFs.writeFile(path.join(dir, PROJECT_FILE), JSON.stringify(file, null, 2), 'utf-8');
    await secureFs.writeFile(path.join(dir, 'CLAUDE.md'), starterClaudeMd(trimmed), 'utf-8');

    this.logger.info(`Created research project "${trimmed}" at ${dir}`);
    return { id, name: trimmed, path: dir, isolated: false, createdAt: now, updatedAt: now };
  }

  /** Rename a project. Its id and directory stay put, so its chats keep working. */
  async rename(projectId: string, name: string): Promise<ResearchProject | null> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('A research project needs a name');
    if (this.isIsolated(projectId)) throw new Error('The Isolated project cannot be renamed');

    const file = await this.readProjectFile(projectId);
    if (!file) return null;

    const updated: ProjectFile = { ...file, name: trimmed, updatedAt: new Date().toISOString() };
    await secureFs.writeFile(
      path.join(this.getProjectDir(projectId), PROJECT_FILE),
      JSON.stringify(updated, null, 2),
      'utf-8'
    );

    return {
      id: updated.id,
      name: updated.name,
      path: this.getProjectDir(updated.id),
      isolated: false,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Delete a project and everything in it — its `.claude/`, its memory, its
   * skills and any files its chats wrote. The chats themselves are sessions and
   * are deleted by the caller; this is only the directory.
   */
  async remove(projectId: string): Promise<boolean> {
    if (this.isIsolated(projectId)) throw new Error('The Isolated project cannot be deleted');
    if (!isSafeId(projectId)) return false;
    if (!(await this.readProjectFile(projectId))) return false;

    await secureFs.rm(this.getProjectDir(projectId), { recursive: true, force: true });
    this.logger.info(`Deleted research project ${projectId}`);
    return true;
  }

  private isolatedProject(): ResearchProject {
    const epoch = new Date(0).toISOString();
    return {
      id: ISOLATED_PROJECT_ID,
      name: 'Isolated',
      path: this.getProjectDir(ISOLATED_PROJECT_ID),
      isolated: true,
      createdAt: epoch,
      updatedAt: epoch,
    };
  }

  private async readProjectFile(projectId: string): Promise<ProjectFile | null> {
    if (!isSafeId(projectId)) return null;
    try {
      const raw = await secureFs.readFile(
        path.join(this.getProjectDir(projectId), PROJECT_FILE),
        'utf-8'
      );
      const parsed = JSON.parse(String(raw)) as Partial<ProjectFile>;
      if (!parsed || typeof parsed.name !== 'string') return null;
      const now = new Date().toISOString();
      return {
        // The directory name is the truth: a descriptor that disagrees with
        // where it sits would point every chat at a project that isn't there.
        id: projectId,
        name: parsed.name,
        createdAt: parsed.createdAt ?? now,
        updatedAt: parsed.updatedAt ?? now,
      };
    } catch {
      return null;
    }
  }

  /** `notes`, then `notes-2`, `notes-3`… — never reuse a live directory. */
  private async freeId(base: string): Promise<string> {
    for (let suffix = 1; ; suffix += 1) {
      const candidate = suffix === 1 ? base : `${base}-${suffix}`;
      if (candidate === ISOLATED_PROJECT_ID) continue;
      try {
        await secureFs.access(this.getProjectDir(candidate));
      } catch {
        return candidate;
      }
    }
  }
}
