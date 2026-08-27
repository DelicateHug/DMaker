/**
 * Research routes — CRUD for the local research projects the AI sidebar lists.
 *
 * Chats inside a project are ordinary sessions (`/api/sessions`), so nothing
 * here starts anything: this router only owns the project directories.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '@dmaker/utils';
import type { AgentService } from '../services/agent-service.js';
import type { ResearchService } from '../services/research-service.js';

const logger = createLogger('Research');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function createResearchRoutes(
  researchService: ResearchService,
  agentService: AgentService
): Router {
  const router = Router();

  // GET / — every project, Isolated first
  router.get('/', async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json({ success: true, projects: await researchService.list() });
    } catch (error) {
      logger.error('❌ List research projects failed:', error);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // POST / — create a project and scaffold its `.claude/`
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const { name } = req.body as { name?: string };
      if (!name?.trim()) {
        res.status(400).json({ success: false, error: 'name is required' });
        return;
      }

      res.json({ success: true, project: await researchService.create(name) });
    } catch (error) {
      logger.error('❌ Create research project failed:', error);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // PUT /:projectId — rename
  router.put('/:projectId', async (req: Request, res: Response): Promise<void> => {
    try {
      const { name } = req.body as { name?: string };
      if (!name?.trim()) {
        res.status(400).json({ success: false, error: 'name is required' });
        return;
      }

      const project = await researchService.rename(req.params.projectId, name);
      if (!project) {
        res.status(404).json({ success: false, error: 'Research project not found' });
        return;
      }

      res.json({ success: true, project });
    } catch (error) {
      logger.error('❌ Rename research project failed:', error);
      res.status(400).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // DELETE /:projectId — the directory and every chat that ran in it
  router.delete('/:projectId', async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params;

      // The chats go first: a session left behind would point at a directory
      // that no longer exists and fail the moment it was opened. Anything still
      // running is stopped before the directory is pulled out from under it.
      const sessions = await agentService.listSessions(true);
      for (const session of sessions) {
        if (session.researchProjectId !== projectId) continue;
        await agentService.stopExecution(session.id);
        await agentService.deleteSession(session.id);
      }

      const removed = await researchService.remove(projectId);
      if (!removed) {
        res.status(404).json({ success: false, error: 'Research project not found' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('❌ Delete research project failed:', error);
      res.status(400).json({ success: false, error: getErrorMessage(error) });
    }
  });

  return router;
}
