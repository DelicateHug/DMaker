import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createTreeHandler } from '@/routes/running-agents.js';
import type { AutoModeService } from '@/services/auto-mode-service.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import type { AgentTree } from '@dmaker/types';
import { MASTER_AGENT_ID, MASTER_AGENT_NAME } from '@dmaker/types';
import { createMockExpressContext } from '../../utils/mocks.js';

function makeTree(featureId: string, updatedAt: string): AgentTree {
  return {
    featureId,
    nodes: {
      [MASTER_AGENT_ID]: {
        id: MASTER_AGENT_ID,
        parentId: null,
        depth: 0,
        name: MASTER_AGENT_NAME,
        status: 'running',
        startedAt: '2024-01-01T00:00:00.000Z',
        toolCallCount: 0,
        index: 0,
      },
    },
    order: [MASTER_AGENT_ID],
    updatedAt,
  };
}

describe('running-agents tree route', () => {
  let mockAutoModeService: Partial<AutoModeService>;
  let mockFeatureLoader: Partial<FeatureLoader>;
  let req: Request;
  let res: Response;

  const handler = () =>
    createTreeHandler(mockAutoModeService as AutoModeService, mockFeatureLoader as FeatureLoader);

  beforeEach(() => {
    vi.clearAllMocks();

    mockAutoModeService = {
      getInMemoryAgentTree: vi.fn().mockReturnValue(null),
    };

    mockFeatureLoader = {
      getAgentTree: vi.fn().mockResolvedValue(null),
    };

    const context = createMockExpressContext();
    req = context.req;
    res = context.res;
  });

  describe('validation', () => {
    it('should return 400 if projectPath is missing', async () => {
      req.body = { featureId: 'feature-123' };

      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'projectPath and featureId are required',
      });
      expect(mockAutoModeService.getInMemoryAgentTree).not.toHaveBeenCalled();
      expect(mockFeatureLoader.getAgentTree).not.toHaveBeenCalled();
    });

    it('should return 400 if featureId is missing', async () => {
      req.body = { projectPath: '/test/project' };

      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'projectPath and featureId are required',
      });
      expect(mockAutoModeService.getInMemoryAgentTree).not.toHaveBeenCalled();
      expect(mockFeatureLoader.getAgentTree).not.toHaveBeenCalled();
    });

    it('should return 400 if both are empty strings', async () => {
      req.body = { projectPath: '', featureId: '' };

      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockFeatureLoader.getAgentTree).not.toHaveBeenCalled();
    });
  });

  describe('source preference', () => {
    it('should prefer the in-memory tree over the sidecar', async () => {
      const live = makeTree('feature-123', '2024-01-01T00:00:10.000Z');
      const stale = makeTree('feature-123', '2024-01-01T00:00:00.000Z');

      vi.mocked(mockAutoModeService.getInMemoryAgentTree!).mockReturnValue(live);
      vi.mocked(mockFeatureLoader.getAgentTree!).mockResolvedValue(stale);

      req.body = { projectPath: '/test/project', featureId: 'feature-123' };

      await handler()(req, res);

      expect(mockAutoModeService.getInMemoryAgentTree).toHaveBeenCalledWith('feature-123');
      expect(res.json).toHaveBeenCalledWith({ success: true, tree: live });
      // The sidecar is up to 10s stale mid-run, so reading it at all when the
      // tracker is live would hand the UI a tree missing the newest sub-agent.
      expect(mockFeatureLoader.getAgentTree).not.toHaveBeenCalled();
    });

    it('should fall back to the sidecar when no run is in memory', async () => {
      const persisted = makeTree('feature-123', '2024-01-01T00:00:00.000Z');

      vi.mocked(mockAutoModeService.getInMemoryAgentTree!).mockReturnValue(null);
      vi.mocked(mockFeatureLoader.getAgentTree!).mockResolvedValue(persisted);

      req.body = { projectPath: '/test/project', featureId: 'feature-123' };

      await handler()(req, res);

      expect(mockFeatureLoader.getAgentTree).toHaveBeenCalledWith('/test/project', 'feature-123');
      expect(res.json).toHaveBeenCalledWith({ success: true, tree: persisted });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return tree: null when neither source has one', async () => {
      req.body = { projectPath: '/test/project', featureId: 'legacy-feature' };

      await handler()(req, res);

      expect(mockAutoModeService.getInMemoryAgentTree).toHaveBeenCalledWith('legacy-feature');
      expect(mockFeatureLoader.getAgentTree).toHaveBeenCalledWith(
        '/test/project',
        'legacy-feature'
      );
      // A run that predates agent-tree tracking has no sidecar. That is a
      // successful answer, not a 404 - the client synthesises a one-node tree
      // over the flat transcript for it.
      expect(res.json).toHaveBeenCalledWith({ success: true, tree: null });
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return 500 when the sidecar read throws', async () => {
      vi.mocked(mockFeatureLoader.getAgentTree!).mockRejectedValue(new Error('EACCES'));

      req.body = { projectPath: '/test/project', featureId: 'feature-123' };

      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'EACCES' });
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(mockAutoModeService.getInMemoryAgentTree!).mockImplementation(() => {
        throw 'String error';
      });

      req.body = { projectPath: '/test/project', featureId: 'feature-123' };

      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: expect.any(String),
      });
    });
  });
});
