/**
 * Ideation routes - HTTP API for brainstorming and idea management
 *
 * Consolidated from ideation/ directory into a single module.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { EventEmitter } from '../lib/events.js';
import { validatePathParams } from '../middleware.js';
import type { IdeationService } from '../services/ideation-service.js';
import type { FeatureLoader } from '../services/feature-loader.js';
import type {
  StartSessionOptions,
  SendMessageOptions,
  CreateIdeaInput,
  UpdateIdeaInput,
  ConvertToFeatureOptions,
  AnalysisSuggestion,
  IdeaCategory,
} from '@dmaker/types';
import { createLogger } from '@dmaker/utils';

// ─── Logger & Helpers ────────────────────────────────────────────────────────

const logger = createLogger('Ideation');
const suggestionsLogger = createLogger('ideation:suggestions-generate');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`❌ ${context}:`, error);
}

// ─── Route Handlers ──────────────────────────────────────────────────────────

function createSessionStartHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, options } = req.body as {
        projectPath: string;
        options?: StartSessionOptions;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const session = await ideationService.startSession(projectPath, options);
      res.json({ success: true, session });
    } catch (error) {
      logError(error, 'Start session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createSessionMessageHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, message, options } = req.body as {
        sessionId: string;
        message: string;
        options?: SendMessageOptions;
      };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      if (!message) {
        res.status(400).json({ success: false, error: 'message is required' });
        return;
      }

      // This is async but we don't await - responses come via WebSocket
      ideationService.sendMessage(sessionId, message, options).catch((error) => {
        logError(error, 'Send message failed (async)');
      });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Send message failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createSessionStopHandler(events: EventEmitter, ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, projectPath } = req.body as {
        sessionId: string;
        projectPath?: string;
      };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      await ideationService.stopSession(sessionId);

      events.emit('ideation:session-ended', {
        sessionId,
        projectPath,
      });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Stop session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createSessionGetHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, sessionId } = req.body as {
        projectPath: string;
        sessionId: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      const session = await ideationService.getSession(projectPath, sessionId);
      if (!session) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      const isRunning = ideationService.isSessionRunning(sessionId);

      res.json({
        success: true,
        session: { ...session, isRunning },
        messages: session.messages,
      });
    } catch (error) {
      logError(error, 'Get session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createIdeasListHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const ideas = await ideationService.getIdeas(projectPath);
      res.json({ success: true, ideas });
    } catch (error) {
      logError(error, 'List ideas failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createIdeasCreateHandler(events: EventEmitter, ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, idea } = req.body as {
        projectPath: string;
        idea: CreateIdeaInput;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!idea) {
        res.status(400).json({ success: false, error: 'idea is required' });
        return;
      }

      if (!idea.title || !idea.description || !idea.category) {
        res.status(400).json({
          success: false,
          error: 'idea must have title, description, and category',
        });
        return;
      }

      const created = await ideationService.createIdea(projectPath, idea);

      events.emit('ideation:idea-created', {
        projectPath,
        idea: created,
      });

      res.json({ success: true, idea: created });
    } catch (error) {
      logError(error, 'Create idea failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createIdeasGetHandler(ideationService: IdeationService) {
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

      const idea = await ideationService.getIdea(projectPath, ideaId);
      if (!idea) {
        res.status(404).json({ success: false, error: 'Idea not found' });
        return;
      }

      res.json({ success: true, idea });
    } catch (error) {
      logError(error, 'Get idea failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createIdeasUpdateHandler(events: EventEmitter, ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, ideaId, updates } = req.body as {
        projectPath: string;
        ideaId: string;
        updates: UpdateIdeaInput;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!ideaId) {
        res.status(400).json({ success: false, error: 'ideaId is required' });
        return;
      }

      if (!updates) {
        res.status(400).json({ success: false, error: 'updates is required' });
        return;
      }

      const idea = await ideationService.updateIdea(projectPath, ideaId, updates);
      if (!idea) {
        res.status(404).json({ success: false, error: 'Idea not found' });
        return;
      }

      events.emit('ideation:idea-updated', {
        projectPath,
        ideaId,
        idea,
      });

      res.json({ success: true, idea });
    } catch (error) {
      logError(error, 'Update idea failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createIdeasDeleteHandler(events: EventEmitter, ideationService: IdeationService) {
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

      events.emit('ideation:idea-deleted', {
        projectPath,
        ideaId,
      });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Delete idea failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createAnalyzeHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // Start analysis - results come via WebSocket events
      ideationService.analyzeProject(projectPath).catch((error) => {
        logError(error, 'Analyze project failed (async)');
      });

      res.json({ success: true, message: 'Analysis started' });
    } catch (error) {
      logError(error, 'Analyze project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createGetAnalysisHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const result = await ideationService.getCachedAnalysis(projectPath);
      res.json({ success: true, result });
    } catch (error) {
      logError(error, 'Get analysis failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createConvertHandler(
  events: EventEmitter,
  ideationService: IdeationService,
  featureLoader: FeatureLoader
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, ideaId, keepIdea, column, dependencies, tags } = req.body as {
        projectPath: string;
        ideaId: string;
      } & ConvertToFeatureOptions;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!ideaId) {
        res.status(400).json({ success: false, error: 'ideaId is required' });
        return;
      }

      // Convert idea to feature structure
      const featureData = await ideationService.convertToFeature(projectPath, ideaId);

      // Apply any options from the request
      if (column) {
        featureData.status = column;
      }
      if (dependencies && dependencies.length > 0) {
        featureData.dependencies = dependencies;
      }
      if (tags && tags.length > 0) {
        featureData.tags = tags;
      }

      // Create the feature using FeatureLoader
      const feature = await featureLoader.create(projectPath, featureData);

      // Delete the idea unless keepIdea is explicitly true
      if (!keepIdea) {
        await ideationService.deleteIdea(projectPath, ideaId);

        events.emit('ideation:idea-deleted', {
          projectPath,
          ideaId,
        });
      }

      // Emit idea converted event to notify frontend
      events.emit('ideation:idea-converted', {
        projectPath,
        ideaId,
        featureId: feature.id,
        keepIdea: !!keepIdea,
      });

      // Return featureId as expected by the frontend API interface
      res.json({ success: true, featureId: feature.id });
    } catch (error) {
      logError(error, 'Convert to feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createAddSuggestionHandler(
  ideationService: IdeationService,
  featureLoader: FeatureLoader
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, suggestion } = req.body as {
        projectPath: string;
        suggestion: AnalysisSuggestion;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!suggestion) {
        res.status(400).json({ success: false, error: 'suggestion is required' });
        return;
      }

      if (!suggestion.title) {
        res.status(400).json({ success: false, error: 'suggestion.title is required' });
        return;
      }

      if (!suggestion.category) {
        res.status(400).json({ success: false, error: 'suggestion.category is required' });
        return;
      }

      // Build description with rationale if provided
      const description = suggestion.rationale
        ? `${suggestion.description}\n\n**Rationale:** ${suggestion.rationale}`
        : suggestion.description;

      // Use the service's category mapping for consistency
      const featureCategory = ideationService.mapSuggestionCategoryToFeatureCategory(
        suggestion.category
      );

      // Create the feature
      const feature = await featureLoader.create(projectPath, {
        title: suggestion.title,
        description,
        category: featureCategory,
        status: 'backlog',
      });

      res.json({ success: true, featureId: feature.id });
    } catch (error) {
      logError(error, 'Add suggestion to board failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createPromptsHandler(ideationService: IdeationService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const prompts = ideationService.getAllPrompts();
      const categories = ideationService.getPromptCategories();
      res.json({ success: true, prompts, categories });
    } catch (error) {
      logError(error, 'Get prompts failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createPromptsByCategoryHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { category } = req.params as { category: string };

      const validCategories = ideationService.getPromptCategories().map((c) => c.id);
      if (!validCategories.includes(category as IdeaCategory)) {
        res.status(400).json({ success: false, error: 'Invalid category' });
        return;
      }

      const prompts = ideationService.getPromptsByCategory(category as IdeaCategory);
      res.json({ success: true, prompts });
    } catch (error) {
      logError(error, 'Get prompts by category failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createSuggestionsGenerateHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, promptId, category, count } = req.body;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!promptId) {
        res.status(400).json({ success: false, error: 'promptId is required' });
        return;
      }

      if (!category) {
        res.status(400).json({ success: false, error: 'category is required' });
        return;
      }

      // Default to 10 suggestions, allow 1-20
      const suggestionCount = Math.min(Math.max(count || 10, 1), 20);

      suggestionsLogger.info(`Generating ${suggestionCount} suggestions for prompt: ${promptId}`);

      const suggestions = await ideationService.generateSuggestions(
        projectPath,
        promptId,
        category,
        suggestionCount
      );

      res.json({
        success: true,
        suggestions,
      });
    } catch (error) {
      logError(error, 'Failed to generate suggestions');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

// ─── Router Factory ──────────────────────────────────────────────────────────

export function createIdeationRoutes(
  events: EventEmitter,
  ideationService: IdeationService,
  featureLoader: FeatureLoader
): Router {
  const router = Router();

  // Session management
  router.post(
    '/session/start',
    validatePathParams('projectPath'),
    createSessionStartHandler(ideationService)
  );
  router.post('/session/message', createSessionMessageHandler(ideationService));
  router.post('/session/stop', createSessionStopHandler(events, ideationService));
  router.post(
    '/session/get',
    validatePathParams('projectPath'),
    createSessionGetHandler(ideationService)
  );

  // Ideas CRUD
  router.post(
    '/ideas/list',
    validatePathParams('projectPath'),
    createIdeasListHandler(ideationService)
  );
  router.post(
    '/ideas/create',
    validatePathParams('projectPath'),
    createIdeasCreateHandler(events, ideationService)
  );
  router.post(
    '/ideas/get',
    validatePathParams('projectPath'),
    createIdeasGetHandler(ideationService)
  );
  router.post(
    '/ideas/update',
    validatePathParams('projectPath'),
    createIdeasUpdateHandler(events, ideationService)
  );
  router.post(
    '/ideas/delete',
    validatePathParams('projectPath'),
    createIdeasDeleteHandler(events, ideationService)
  );

  // Project analysis
  router.post('/analyze', validatePathParams('projectPath'), createAnalyzeHandler(ideationService));
  router.post(
    '/analysis',
    validatePathParams('projectPath'),
    createGetAnalysisHandler(ideationService)
  );

  // Convert to feature
  router.post(
    '/convert',
    validatePathParams('projectPath'),
    createConvertHandler(events, ideationService, featureLoader)
  );

  // Add suggestion to board as a feature
  router.post(
    '/add-suggestion',
    validatePathParams('projectPath'),
    createAddSuggestionHandler(ideationService, featureLoader)
  );

  // Guided prompts (no validation needed - static data)
  router.get('/prompts', createPromptsHandler(ideationService));
  router.get('/prompts/:category', createPromptsByCategoryHandler(ideationService));

  // Generate suggestions (structured output)
  router.post(
    '/suggestions/generate',
    validatePathParams('projectPath'),
    createSuggestionsGenerateHandler(ideationService)
  );

  return router;
}
