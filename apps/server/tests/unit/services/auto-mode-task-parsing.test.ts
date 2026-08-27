import { describe, it, expect } from 'vitest';
import { parseTaskLine, parseTasksFromSpec } from '@/services/auto-mode-service.js';

/**
 * These tests used to carry their own copy of parseTaskLine/parseTasksFromSpec
 * and assert against that, which meant the suite stayed green no matter what
 * the service did. They run against the real exports now.
 */
describe('Task Parsing', () => {
  describe('parseTaskLine', () => {
    it('should parse task with file path', () => {
      const line = '- [ ] T001: Create user model | File: src/models/user.ts';
      const result = parseTaskLine(line);
      expect(result).toEqual({
        id: 'T001',
        description: 'Create user model',
        filePath: 'src/models/user.ts',
        phase: undefined,
        status: 'pending',
      });
    });

    it('should parse task without file path', () => {
      const line = '- [ ] T002: Setup database connection';
      const result = parseTaskLine(line);
      expect(result).toEqual({
        id: 'T002',
        description: 'Setup database connection',
        phase: undefined,
        status: 'pending',
      });
    });

    it('should include phase when provided', () => {
      const line = '- [ ] T003: Write tests | File: tests/user.test.ts';
      const result = parseTaskLine(line, 'Phase 1: Foundation');
      expect(result?.phase).toBe('Phase 1: Foundation');
    });

    it('should return null for invalid line', () => {
      expect(parseTaskLine('- [ ] Invalid format')).toBeNull();
      expect(parseTaskLine('Not a task line')).toBeNull();
      expect(parseTaskLine('')).toBeNull();
    });

    it('should handle multi-word descriptions', () => {
      const line = '- [ ] T004: Implement user authentication with JWT tokens | File: src/auth.ts';
      const result = parseTaskLine(line);
      expect(result?.description).toBe('Implement user authentication with JWT tokens');
    });

    it('should trim whitespace from description and file path', () => {
      const line = '- [ ] T005:   Create API endpoint   | File:   src/routes/api.ts  ';
      const result = parseTaskLine(line);
      expect(result?.description).toBe('Create API endpoint');
      expect(result?.filePath).toBe('src/routes/api.ts');
    });

    it('parses a task as pending with no timestamps — the run fills those in', () => {
      const result = parseTaskLine('- [ ] T006: Something');
      expect(result?.status).toBe('pending');
      expect(result?.startedAt).toBeUndefined();
      expect(result?.completedAt).toBeUndefined();
    });
  });

  describe('parseTasksFromSpec', () => {
    it('should parse tasks from a tasks code block', () => {
      const specContent = `
## Specification

Some description here.

\`\`\`tasks
- [ ] T001: Create user model | File: src/models/user.ts
- [ ] T002: Add API endpoint | File: src/routes/users.ts
- [ ] T003: Write unit tests | File: tests/user.test.ts
\`\`\`

## Notes
Some notes here.
`;
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks).toHaveLength(3);
      expect(tasks[0].id).toBe('T001');
      expect(tasks[1].id).toBe('T002');
      expect(tasks[2].id).toBe('T003');
    });

    it('should parse tasks with phases', () => {
      const specContent = `
\`\`\`tasks
## Phase 1: Foundation
- [ ] T001: Initialize project | File: package.json
- [ ] T002: Configure TypeScript | File: tsconfig.json

## Phase 2: Implementation
- [ ] T003: Create main module | File: src/index.ts
- [ ] T004: Add utility functions | File: src/utils.ts

## Phase 3: Testing
- [ ] T005: Write tests | File: tests/index.test.ts
\`\`\`
`;
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks).toHaveLength(5);
      expect(tasks[0].phase).toBe('Phase 1: Foundation');
      expect(tasks[1].phase).toBe('Phase 1: Foundation');
      expect(tasks[2].phase).toBe('Phase 2: Implementation');
      expect(tasks[3].phase).toBe('Phase 2: Implementation');
      expect(tasks[4].phase).toBe('Phase 3: Testing');
    });

    it('should return empty array for content without tasks', () => {
      const specContent = 'Just some text without any tasks';
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks).toEqual([]);
    });

    it('should fallback to finding task lines outside code block', () => {
      const specContent = `
## Implementation Plan

- [ ] T001: First task | File: src/first.ts
- [ ] T002: Second task | File: src/second.ts
`;
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe('T001');
      expect(tasks[1].id).toBe('T002');
    });

    it('should handle empty tasks block', () => {
      const specContent = `
\`\`\`tasks
\`\`\`
`;
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks).toEqual([]);
    });

    it('should handle mixed valid and invalid lines', () => {
      const specContent = `
\`\`\`tasks
- [ ] T001: Valid task | File: src/valid.ts
- Invalid line
Some other text
- [ ] T002: Another valid task
\`\`\`
`;
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks).toHaveLength(2);
    });

    it('should preserve task order', () => {
      const specContent = `
\`\`\`tasks
- [ ] T003: Third
- [ ] T001: First
- [ ] T002: Second
\`\`\`
`;
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks[0].id).toBe('T003');
      expect(tasks[1].id).toBe('T001');
      expect(tasks[2].id).toBe('T002');
    });

    it('should handle task IDs with different numbers', () => {
      const specContent = `
\`\`\`tasks
- [ ] T001: First
- [ ] T010: Tenth
- [ ] T100: Hundredth
\`\`\`
`;
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks).toHaveLength(3);
      expect(tasks[0].id).toBe('T001');
      expect(tasks[1].id).toBe('T010');
      expect(tasks[2].id).toBe('T100');
    });
  });

  /**
   * The output the planning prompts actually ask for, parsed by the real
   * function. These used to assert that a string literal contained a substring
   * it obviously contained.
   */
  describe('the planning prompts’ own output formats', () => {
    it('a lite plan carries no ```tasks fence and parses to no tasks', () => {
      const liteModeOutput = `
1. **Goal**: Implement user registration
2. **Approach**: Create form component, add validation, connect to API
3. **Files to Touch**: src/components/Register.tsx, src/api/auth.ts
4. **Tasks**:
   1. Create registration form
   2. Add form validation
   3. Connect to backend API
5. **Risks**: Form state management complexity

[PLAN_GENERATED] Planning outline complete.
`;
      // Not a defect: a lite plan is prose, and the run's progress then comes
      // from the [TASK_*] markers rather than from a parsed task list.
      expect(parseTasksFromSpec(liteModeOutput)).toEqual([]);
    });

    it('a spec-mode plan parses its fenced tasks', () => {
      const specModeOutput = `
5. **Implementation Tasks**:
\`\`\`tasks
- [ ] T001: Create registration component | File: src/Register.tsx
- [ ] T002: Add form validation | File: src/Register.tsx
\`\`\`

[SPEC_GENERATED] Please review the specification above.
`;
      const tasks = parseTasksFromSpec(specModeOutput);
      expect(tasks.map((t) => t.id)).toEqual(['T001', 'T002']);
      expect(tasks[0].filePath).toBe('src/Register.tsx');
    });

    it('a full-mode plan keeps each task under its phase heading', () => {
      const fullModeOutput = `
6. **Implementation Tasks**:
\`\`\`tasks
## Phase 1: Foundation
- [ ] T001: Setup component structure | File: src/Register.tsx

## Phase 2: Core Implementation
- [ ] T002: Add form logic | File: src/Register.tsx

## Phase 3: Integration & Testing
- [ ] T003: Connect to API | File: src/api/auth.ts
\`\`\`

[SPEC_GENERATED] Please review the comprehensive specification above.
`;
      const tasks = parseTasksFromSpec(fullModeOutput);
      expect(tasks.map((t) => t.phase)).toEqual([
        'Phase 1: Foundation',
        'Phase 2: Core Implementation',
        'Phase 3: Integration & Testing',
      ]);
    });
  });
});
