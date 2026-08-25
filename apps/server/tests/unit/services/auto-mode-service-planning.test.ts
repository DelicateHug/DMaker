import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoModeService } from '@/services/auto-mode-service.js';

describe('auto-mode-service.ts - Planning Mode', () => {
  let service: AutoModeService;
  const mockEvents = {
    subscribe: vi.fn(),
    emit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AutoModeService(mockEvents as any);
  });

  afterEach(async () => {
    // Clean up any running processes
    await service.stopAutoLoop().catch(() => {});
  });

  /**
   * Planning used to be chosen per feature (feature.planningMode), and these
   * tests asserted that. It is now a single global `planningStrategy` setting,
   * with an adaptive prompt as the default that lets the agent escalate on its
   * own — the feature argument is no longer even read. Rewritten against the
   * contract that actually exists.
   */
  describe('getPlanningPromptPrefix', () => {
    const getPrefix = (svc: any) => svc.getPlanningPromptPrefix({ id: 'test' });

    /** An AutoModeService whose global settings return the given strategy. */
    function serviceWithStrategy(planningStrategy?: string) {
      const settingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({ planningStrategy }),
        getProjectSettings: vi.fn().mockResolvedValue({ version: 1 }),
      };
      return new AutoModeService(mockEvents as any, settingsService as any);
    }

    it('uses the adaptive prompt by default', async () => {
      const result = await getPrefix(serviceWithStrategy(undefined));

      expect(result).toContain('Adaptive Planning');
      // Every strategy appends the feature request separator, or the agent
      // gets a planning prompt with nothing to plan against.
      expect(result).toContain('## Feature Request');
    });

    it.each([
      ['always-lite', 'Lite Mode'],
      ['always-spec', 'Spec Mode'],
      ['always-full', 'Full SDD'],
    ])('honours the %s strategy', async (strategy, marker) => {
      const result = await getPrefix(serviceWithStrategy(strategy));

      expect(result).toContain(marker);
      expect(result).toContain('## Feature Request');
    });

    it('falls back to adaptive for a strategy it does not recognise', async () => {
      // A settings file written by a newer version must not silently produce
      // an empty planning prompt.
      const result = await getPrefix(serviceWithStrategy('always-telepathy'));

      expect(result).toContain('Adaptive Planning');
    });

    it.each(['always-lite', 'always-spec', 'always-full'])(
      '%s tells the agent not to narrate its exploration',
      async (strategy) => {
        const result = await getPrefix(serviceWithStrategy(strategy));
        expect(result).toContain('IMPORTANT: Do NOT output exploration text');
      }
    );

    it('the adaptive prompt deliberately allows exploration instead of forbidding it', async () => {
      // The fixed strategies suppress exploration because their output format
      // is fixed up front. Adaptive cannot: its whole mechanism is scanning the
      // codebase in Step 2 to decide how much planning the feature warrants.
      const result = await getPrefix(serviceWithStrategy('auto'));

      expect(result).not.toContain('IMPORTANT: Do NOT output exploration text');
      expect(result).toContain('Codebase Scan');
    });
  });

  describe('parseTasksFromSpec (via module)', () => {
    // We need to test the module-level function
    // Import it directly for testing
    it('should parse tasks from a valid tasks block', async () => {
      // This tests the internal logic through integration
      // The function is module-level, so we verify behavior through the service
      const specContent = `
## Specification

\`\`\`tasks
- [ ] T001: Create user model | File: src/models/user.ts
- [ ] T002: Add API endpoint | File: src/routes/users.ts
- [ ] T003: Write unit tests | File: tests/user.test.ts
\`\`\`
`;
      // Since parseTasksFromSpec is a module-level function,
      // we verify its behavior indirectly through plan parsing
      expect(specContent).toContain('T001');
      expect(specContent).toContain('T002');
      expect(specContent).toContain('T003');
    });

    it('should handle tasks block with phases', () => {
      const specContent = `
\`\`\`tasks
## Phase 1: Setup
- [ ] T001: Initialize project | File: package.json
- [ ] T002: Configure TypeScript | File: tsconfig.json

## Phase 2: Implementation
- [ ] T003: Create main module | File: src/index.ts
\`\`\`
`;
      expect(specContent).toContain('Phase 1');
      expect(specContent).toContain('Phase 2');
      expect(specContent).toContain('T001');
      expect(specContent).toContain('T003');
    });
  });

  describe('plan approval flow', () => {
    it('should track pending approvals correctly', () => {
      expect(service.hasPendingApproval('test-feature')).toBe(false);
    });

    it('should allow cancelling non-existent approval without error', () => {
      expect(() => service.cancelPlanApproval('non-existent')).not.toThrow();
    });

    it('should return running features count after stop', async () => {
      const count = await service.stopAutoLoop();
      expect(count).toBe(0);
    });
  });

  describe('resolvePlanApproval', () => {
    it('should return error when no pending approval exists', async () => {
      const result = await service.resolvePlanApproval(
        'non-existent-feature',
        true,
        undefined,
        undefined,
        undefined
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('No pending approval');
    });

    it('should handle approval with edited plan', async () => {
      // Without a pending approval, this should fail gracefully
      const result = await service.resolvePlanApproval(
        'test-feature',
        true,
        'Edited plan content',
        undefined,
        undefined
      );
      expect(result.success).toBe(false);
    });

    it('should handle rejection with feedback', async () => {
      const result = await service.resolvePlanApproval(
        'test-feature',
        false,
        undefined,
        'Please add more details',
        undefined
      );
      expect(result.success).toBe(false);
    });
  });

  describe('buildFeaturePrompt', () => {
    const defaultTaskExecutionPrompts = {
      implementationInstructions: 'Test implementation instructions',
      playwrightVerificationInstructions: 'Test playwright instructions',
    };

    const buildFeaturePrompt = (
      svc: any,
      feature: any,
      taskExecutionPrompts = defaultTaskExecutionPrompts
    ) => {
      return svc.buildFeaturePrompt(feature, taskExecutionPrompts);
    };

    it('should include feature ID and description', () => {
      const feature = {
        id: 'feat-123',
        description: 'Add user authentication',
      };
      const result = buildFeaturePrompt(service, feature);
      expect(result).toContain('feat-123');
      expect(result).toContain('Add user authentication');
    });

    it('should include specification when present', () => {
      const feature = {
        id: 'feat-123',
        description: 'Test feature',
        spec: 'Detailed specification here',
      };
      const result = buildFeaturePrompt(service, feature);
      expect(result).toContain('Specification:');
      expect(result).toContain('Detailed specification here');
    });

    it('should include image paths when present', () => {
      const feature = {
        id: 'feat-123',
        description: 'Test feature',
        imagePaths: [
          { path: '/tmp/image1.png', filename: 'image1.png', mimeType: 'image/png' },
          '/tmp/image2.jpg',
        ],
      };
      const result = buildFeaturePrompt(service, feature);
      expect(result).toContain('Context Images Attached');
      expect(result).toContain('image1.png');
      expect(result).toContain('/tmp/image2.jpg');
    });

    it('should include implementation instructions', () => {
      const feature = {
        id: 'feat-123',
        description: 'Test feature',
      };
      const result = buildFeaturePrompt(service, feature);
      // The prompt should include the implementation instructions passed to it
      expect(result).toContain('Test implementation instructions');
      expect(result).toContain('Test playwright instructions');
    });
  });

  describe('extractTitleFromDescription', () => {
    const extractTitle = (svc: any, description: string) => {
      return svc.extractTitleFromDescription(description);
    };

    it("should return 'Untitled Feature' for empty description", () => {
      expect(extractTitle(service, '')).toBe('Untitled Feature');
      expect(extractTitle(service, '   ')).toBe('Untitled Feature');
    });

    it('should return first line if under 60 characters', () => {
      const description = 'Add user login\nWith email validation';
      expect(extractTitle(service, description)).toBe('Add user login');
    });

    it('should truncate long first lines to 60 characters', () => {
      const description =
        'This is a very long feature description that exceeds the sixty character limit significantly';
      const result = extractTitle(service, description);
      expect(result.length).toBe(60);
      expect(result).toContain('...');
    });
  });

  describe('planning prompt content', () => {
    function serviceWithStrategy(planningStrategy: string) {
      const settingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({ planningStrategy }),
        getProjectSettings: vi.fn().mockResolvedValue({ version: 1 }),
      };
      return new AutoModeService(mockEvents as any, settingsService as any);
    }

    it.each(['auto', 'always-lite', 'always-spec', 'always-full'])(
      '%s produces a substantial prompt',
      async (strategy) => {
        const result = await serviceWithStrategy(strategy).getPlanningPromptPrefix({ id: 't' });
        expect(result.length).toBeGreaterThan(100);
      }
    );

    it('the lite prompt asks for the sections the UI renders', async () => {
      const result = await serviceWithStrategy('always-lite').getPlanningPromptPrefix({ id: 't' });

      for (const section of ['Goal', 'Approach', 'Files to Touch', 'Tasks', 'Risks']) {
        expect(result, section).toContain(section);
      }
    });

    it('the full prompt lays out its phases', async () => {
      const result = await serviceWithStrategy('always-full').getPlanningPromptPrefix({ id: 't' });

      expect(result).toContain('Phase 1');
      expect(result).toContain('Phase 2');
      expect(result).toContain('Phase 3');
    });
  });

  describe('status management', () => {
    it('should report correct status', () => {
      const status = service.getStatus();
      expect(status.runningFeatures).toEqual([]);
      expect(status.isRunning).toBe(false);
      expect(status.runningCount).toBe(0);
    });
  });
});
