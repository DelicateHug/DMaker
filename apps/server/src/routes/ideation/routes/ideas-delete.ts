/**
 * POST /ideas/delete - Delete an idea
 */

import type { Request, Response } from 'express';
import type { IdeationService } from '../../../services/ideation-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createIdeasDeleteHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, ideaId } = req.body as {
        projectPath: string;
        ideaId: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!ideaId) {
        res.status(400).json({ success: false, error: 'ideaId is required' });
        return;
      }

      await ideationService.deleteIdea(projectPath, ideaId);
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Delete idea failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
