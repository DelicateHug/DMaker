/**
 * Skill CRUD routes - HTTP API for managing Claude skills
 *
 * A skill is a directory holding a SKILL.md file:
 *
 *   .claude/skills/<skill-name>/SKILL.md
 *
 * Claude only discovers skills exactly one level below the skills root, so
 * DMaker-created skills are namespaced by NAME (`dmaker-<name>`) rather than
 * by folder — they stay discoverable while still being obviously ours.
 *
 * Mounted at /api/skills in the main server.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { createLogger } from '@dmaker/utils';

const logger = createLogger('Skills');

/** Prefix marking a skill as created by DMaker. */
export const DMAKER_SKILL_PREFIX = 'dmaker-';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export interface SkillSummary {
  /** Directory name, which is also the skill's invocable name */
  name: string;
  description: string;
  /** Body of SKILL.md with the frontmatter stripped */
  body: string;
  source: 'user' | 'project';
  filePath: string;
  /** True when the skill lives in DMaker's namespace */
  isDmaker: boolean;
}

/** Resolve the skills root for a scope. */
function getSkillsRoot(scope: 'user' | 'project', projectPath?: string): string {
  return scope === 'user'
    ? path.join(os.homedir(), '.claude', 'skills')
    : path.join(projectPath!, '.claude', 'skills');
}

/** Turn a display name into a safe directory segment. */
function toSafeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Split a SKILL.md into its frontmatter description and body.
 * Frontmatter is optional; a file without it is all body.
 */
function parseSkillMd(content: string): { description: string; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { description: '', body: content };

  const [, frontmatter, body] = match;
  const descriptionLine = frontmatter
    .split(/\r?\n/)
    .find((line) => line.trim().toLowerCase().startsWith('description:'));
  const description = descriptionLine
    ? descriptionLine.slice(descriptionLine.indexOf(':') + 1).trim()
    : '';

  return { description, body: body ?? '' };
}

/** Build SKILL.md content from fields. */
function buildSkillMd(name: string, description: string, body: string): string {
  return ['---', `name: ${name}`, `description: ${description}`, '---', '', body.trim(), ''].join(
    '\n'
  );
}

/** Read every skill directly under one skills root. */
async function scanSkillsRoot(root: string, source: 'user' | 'project'): Promise<SkillSummary[]> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: SkillSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(root, entry.name, 'SKILL.md');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const { description, body } = parseSkillMd(content);
      skills.push({
        name: entry.name,
        description,
        body,
        source,
        filePath,
        isDmaker: entry.name.startsWith(DMAKER_SKILL_PREFIX),
      });
    } catch {
      // Directory without a SKILL.md — not a skill.
    }
  }
  return skills;
}

// --- List ---

interface ListSkillsRequestBody {
  projectPath?: string;
  sources?: Array<'user' | 'project'>;
}

function createListSkillsHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, sources = ['user', 'project'] } = req.body as ListSkillsRequestBody;

      const skills: SkillSummary[] = [];
      if (sources.includes('user')) {
        skills.push(...(await scanSkillsRoot(getSkillsRoot('user'), 'user')));
      }
      if (sources.includes('project') && projectPath) {
        skills.push(...(await scanSkillsRoot(getSkillsRoot('project', projectPath), 'project')));
      }

      skills.sort((a, b) => a.name.localeCompare(b.name));
      res.json({ success: true, skills });
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error('Failed to list skills:', message);
      res.status(500).json({ success: false, error: message });
    }
  };
}

// --- Save ---

interface SaveSkillRequestBody {
  name: string;
  description: string;
  body: string;
  scope: 'user' | 'project';
  projectPath?: string;
  /** Set when editing — the skill keeps its existing directory */
  originalFilePath?: string;
}

function createSaveSkillHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as SaveSkillRequestBody;

      if (!body.name || typeof body.name !== 'string') {
        res.status(400).json({ success: false, error: 'name is required' });
        return;
      }
      if (!body.description || typeof body.description !== 'string') {
        res.status(400).json({ success: false, error: 'description is required' });
        return;
      }
      if (!body.body || typeof body.body !== 'string') {
        res.status(400).json({ success: false, error: 'body is required' });
        return;
      }
      if (!body.scope || !['user', 'project'].includes(body.scope)) {
        res.status(400).json({ success: false, error: 'scope must be "user" or "project"' });
        return;
      }
      if (body.scope === 'project' && !body.projectPath) {
        res
          .status(400)
          .json({ success: false, error: 'projectPath is required for project scope' });
        return;
      }

      const safeName = toSafeName(body.name);
      if (!safeName) {
        res.status(400).json({ success: false, error: 'Invalid skill name' });
        return;
      }

      // New skills get the DMaker prefix; edits keep the directory they have.
      const dirName = safeName.startsWith(DMAKER_SKILL_PREFIX)
        ? safeName
        : `${DMAKER_SKILL_PREFIX}${safeName}`;
      const skillDir = body.originalFilePath
        ? path.dirname(body.originalFilePath)
        : path.join(getSkillsRoot(body.scope, body.projectPath), dirName);

      const targetPath = path.join(skillDir, 'SKILL.md');
      const finalName = path.basename(skillDir);

      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(targetPath, buildSkillMd(finalName, body.description, body.body), 'utf-8');
      logger.info(`Saved skill: ${finalName} at ${targetPath}`);

      res.json({ success: true, filePath: targetPath, name: finalName });
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error('Failed to save skill:', message);
      res.status(500).json({ success: false, error: message });
    }
  };
}

// --- Delete ---

interface DeleteSkillRequestBody {
  filePath: string;
}

function createDeleteSkillHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as DeleteSkillRequestBody;

      if (!filePath || typeof filePath !== 'string') {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      // Only ever remove <skills-root>/<skill>/SKILL.md and its directory.
      const normalized = path.normalize(filePath);
      const skillDir = path.dirname(normalized);
      const parent = path.dirname(skillDir);
      const isSkillFile = path.basename(normalized) === 'SKILL.md';
      const isUnderSkillsRoot =
        path.basename(parent) === 'skills' && path.basename(path.dirname(parent)) === '.claude';

      if (!isSkillFile || !isUnderSkillsRoot) {
        res.status(400).json({
          success: false,
          error: 'Can only delete a SKILL.md inside a .claude/skills directory',
        });
        return;
      }

      await fs.rm(skillDir, { recursive: true, force: true });
      logger.info(`Deleted skill directory: ${skillDir}`);

      res.json({ success: true });
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error('Failed to delete skill:', message);
      res.status(500).json({ success: false, error: message });
    }
  };
}

/**
 * Create skills router.
 *
 * Endpoints:
 * - POST /list   - List skills from user and/or project scopes
 * - POST /save   - Create or update a skill's SKILL.md
 * - POST /delete - Delete a skill directory
 */
export function createSkillsRoutes(): Router {
  const router = Router();
  router.post('/list', createListSkillsHandler());
  router.post('/save', createSaveSkillHandler());
  router.post('/delete', createDeleteSkillHandler());
  return router;
}
