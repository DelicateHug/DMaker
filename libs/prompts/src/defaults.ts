/**
 * Default Prompts Library
 *
 * Central repository for all default AI prompts used throughout the application.
 * These prompts can be overridden by user customization in settings.
 *
 * Extracted from:
 * - apps/server/src/services/auto-mode-service.ts (Auto Mode planning prompts)
 * - apps/server/src/services/agent-service.ts (Agent Runner system prompt)
 * - apps/server/src/routes/backlog-plan/generate-plan.ts (Backlog planning prompts)
 */

import type {
  ResolvedAutoModePrompts,
  ResolvedAgentPrompts,
  ResolvedBacklogPlanPrompts,
  ResolvedEnhancementPrompts,
} from '@automaker/types';

/**
 * ========================================================================
 * AUTO MODE PROMPTS
 * ========================================================================
 */

export const DEFAULT_AUTO_MODE_PLANNING_LITE = `## Planning Phase (Lite Mode)

IMPORTANT: Do NOT output exploration text, tool usage, or thinking before the plan. Start DIRECTLY with the planning outline format below.

Create a brief planning outline:

1. **Goal**: What are we accomplishing? (1 sentence)
2. **Approach**: How will we do it? (2-3 sentences)
3. **Files to Touch**: List files and what changes
4. **Tasks**: Numbered task list (3-7 items)
5. **Risks**: Any gotchas to watch for

After generating the outline, output:
"[PLAN_GENERATED] Planning outline complete."

Then proceed with implementation.
`;

export const DEFAULT_AUTO_MODE_PLANNING_LITE_WITH_APPROVAL = `## Planning Phase (Lite Mode with Approval)

IMPORTANT: Do NOT output exploration text, tool usage, or thinking before the plan. Start DIRECTLY with the planning outline format below.

Create a brief planning outline:

1. **Goal**: What are we accomplishing? (1 sentence)
2. **Approach**: How will we do it? (2-3 sentences)
3. **Files to Touch**: List files and what changes
4. **Tasks**: Numbered task list (3-7 items)
5. **Risks**: Any gotchas to watch for

After generating the outline, output:
"[SPEC_GENERATED] Please review the plan above. Reply with 'approved' to proceed or provide feedback for revisions."

DO NOT proceed with implementation until approval is received.
`;

export const DEFAULT_AUTO_MODE_PLANNING_SPEC = `## Specification Phase (Spec Mode)

Generate a specification with an actionable task breakdown. WAIT for approval before implementing.

### Specification Format

1. **Problem**: What problem are we solving? (user perspective)
2. **Solution**: Brief approach (1-2 sentences)
3. **Acceptance Criteria**: 3-5 items in GIVEN-WHEN-THEN format
4. **Files to Modify**:
   | File | Changes |
   |------|---------|
   | path/to/file | Brief description |

5. **Implementation Tasks**:
   \`\`\`tasks
   - [ ] T001: [Description] | File: [path/to/file]
   - [ ] T002: [Description] | File: [path/to/file]
   - [ ] T003: [Description] | File: [path/to/file]
   \`\`\`

6. **Verification**: How to confirm feature works

After generating the spec, output:
"[SPEC_GENERATED] Please review the specification above. Reply with 'approved' to proceed or provide feedback for revisions."

DO NOT proceed with implementation until approval is received.
`;

export const DEFAULT_AUTO_MODE_PLANNING_FULL = `## Software Design Document (Full Mode)

Generate a comprehensive specification with phased task breakdown. WAIT for approval before implementing.

### SDD Format

#### 1. Problem Statement
Brief description of the problem we're solving (user perspective)

#### 2. User Story
AS A [user type]
I WANT TO [action]
SO THAT [benefit]

#### 3. Acceptance Criteria
Multiple scenarios in GIVEN-WHEN-THEN format:
- **Scenario 1**: [Name]
  - GIVEN [context]
  - WHEN [action]
  - THEN [expected outcome]

#### 4. Technical Context
- **Existing Components**: What's already in place
- **Integration Points**: Where this feature connects
- **Constraints**: Technical or business limitations

#### 5. Non-Goals
What this feature explicitly does NOT include (to prevent scope creep)

#### 6. Implementation Plan

**Phase 1: Foundation**
\`\`\`tasks
- [ ] T001: [Description] | File: [path]
- [ ] T002: [Description] | File: [path]
\`\`\`

**Phase 2: Core Implementation**
\`\`\`tasks
- [ ] T003: [Description] | File: [path]
- [ ] T004: [Description] | File: [path]
\`\`\`

**Phase 3: Integration & Testing**
\`\`\`tasks
- [ ] T005: [Description] | File: [path]
- [ ] T006: [Description] | File: [path]
\`\`\`

#### 7. Success Metrics
How we'll measure if this feature is working correctly

#### 8. Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| [risk] | [H/M/L] | [approach] |

After generating the SDD, output:
"[SPEC_GENERATED] Please review the specification above. Reply with 'approved' to proceed or provide feedback for revisions."

DO NOT proceed with implementation until approval is received.
`;

export const DEFAULT_AUTO_MODE_FEATURE_PROMPT_TEMPLATE = `## Feature Implementation Task

**Feature ID:** {{featureId}}
**Title:** {{title}}
**Description:** {{description}}

{{#if spec}}
**Specification:**
{{spec}}
{{/if}}

{{#if imagePaths}}
**Context Images:**
{{#each imagePaths}}
- {{this}}
{{/each}}
{{/if}}

{{#if dependencies}}
**Dependencies:**
This feature depends on: {{dependencies}}
{{/if}}

{{#if verificationInstructions}}
**Verification:**
{{verificationInstructions}}
{{/if}}
`;

export const DEFAULT_AUTO_MODE_FOLLOW_UP_PROMPT_TEMPLATE = `## Follow-up on Feature Implementation

{{featurePrompt}}

## Previous Agent Work
{{previousContext}}

## Follow-up Instructions
{{followUpInstructions}}

## Task
Address the follow-up instructions above.
`;

export const DEFAULT_AUTO_MODE_CONTINUATION_PROMPT_TEMPLATE = `## Continuing Feature Implementation

{{featurePrompt}}

## Previous Context
{{previousContext}}

## Instructions
Review the previous work and continue the implementation.
`;

export const DEFAULT_AUTO_MODE_PIPELINE_STEP_PROMPT_TEMPLATE = `## Pipeline Step: {{stepName}}

### Feature Context
{{featurePrompt}}

### Previous Work
{{previousContext}}

### Pipeline Step Instructions
{{stepInstructions}}
`;

/**
 * Default Auto Mode prompts (from auto-mode-service.ts)
 */
export const DEFAULT_AUTO_MODE_PROMPTS: ResolvedAutoModePrompts = {
  planningLite: DEFAULT_AUTO_MODE_PLANNING_LITE,
  planningLiteWithApproval: DEFAULT_AUTO_MODE_PLANNING_LITE_WITH_APPROVAL,
  planningSpec: DEFAULT_AUTO_MODE_PLANNING_SPEC,
  planningFull: DEFAULT_AUTO_MODE_PLANNING_FULL,
  featurePromptTemplate: DEFAULT_AUTO_MODE_FEATURE_PROMPT_TEMPLATE,
  followUpPromptTemplate: DEFAULT_AUTO_MODE_FOLLOW_UP_PROMPT_TEMPLATE,
  continuationPromptTemplate: DEFAULT_AUTO_MODE_CONTINUATION_PROMPT_TEMPLATE,
  pipelineStepPromptTemplate: DEFAULT_AUTO_MODE_PIPELINE_STEP_PROMPT_TEMPLATE,
};

/**
 * ========================================================================
 * AGENT RUNNER PROMPTS
 * ========================================================================
 */

export const DEFAULT_AGENT_SYSTEM_PROMPT = `You are an AI assistant helping users build software. You are part of the Automaker application,
which is designed to help developers plan, design, and implement software projects autonomously.

**Feature Storage:**
Features are stored in .automaker/features/{id}/feature.json - each feature has its own folder.
Use the UpdateFeatureStatus tool to manage features, not direct file edits.

Your role is to:
- Help users define their project requirements and specifications
- Ask clarifying questions to better understand their needs
- Suggest technical approaches and architectures
- Guide them through the development process
- Be conversational and helpful
- Write, edit, and modify code files as requested
- Execute commands and tests
- Search and analyze the codebase

**Tools Available:**
You have access to several tools:
- UpdateFeatureStatus: Update feature status (NOT file edits)
- Read/Write/Edit: File operations
- Bash: Execute commands
- Glob/Grep: Search codebase
- WebSearch/WebFetch: Research online

**Important Guidelines:**
1. When users want to add or modify features, help them create clear feature definitions
2. Use UpdateFeatureStatus tool to manage features in the backlog
3. Be proactive in suggesting improvements and best practices
4. Ask questions when requirements are unclear
5. Guide users toward good software design principles

Remember: You're a collaborative partner in the development process. Be helpful, clear, and thorough.`;

/**
 * Default Agent Runner prompts (from agent-service.ts)
 */
export const DEFAULT_AGENT_PROMPTS: ResolvedAgentPrompts = {
  systemPrompt: DEFAULT_AGENT_SYSTEM_PROMPT,
};

/**
 * ========================================================================
 * BACKLOG PLAN PROMPTS
 * ========================================================================
 */

export const DEFAULT_BACKLOG_PLAN_SYSTEM_PROMPT = `You are an AI assistant helping to modify a software project's feature backlog.
You will be given the current list of features and a user request to modify the backlog.

IMPORTANT CONTEXT (automatically injected):
- Remember to update the dependency graph if deleting existing features
- Remember to define dependencies on new features hooked into relevant existing ones
- Maintain dependency graph integrity (no orphaned dependencies)
- When deleting a feature, identify which other features depend on it

Your task is to analyze the request and produce a structured JSON plan with:
1. Features to ADD (include title, description, category, and dependencies)
2. Features to UPDATE (specify featureId and the updates)
3. Features to DELETE (specify featureId)
4. A summary of the changes
5. Any dependency updates needed (removed dependencies due to deletions, new dependencies for new features)

Respond with ONLY a JSON object in this exact format:
{
  "plan": {
    "add": [
      {
        "title": "string",
        "description": "string",
        "category": "feature" | "bug" | "enhancement" | "refactor",
        "dependencies": ["featureId1", "featureId2"]
      }
    ],
    "update": [
      {
        "featureId": "string",
        "updates": {
          "title"?: "string",
          "description"?: "string",
          "category"?: "feature" | "bug" | "enhancement" | "refactor",
          "priority"?: number,
          "dependencies"?: ["featureId1"]
        }
      }
    ],
    "delete": ["featureId1", "featureId2"],
    "summary": "Brief summary of all changes",
    "dependencyUpdates": [
      {
        "featureId": "string",
        "action": "remove_dependency" | "add_dependency",
        "dependencyId": "string",
        "reason": "string"
      }
    ]
  }
}

Important rules:
- Only include fields that need to change in updates
- Ensure dependency references are valid (don't reference deleted features)
- Provide clear, actionable descriptions
- Maintain category consistency (feature, bug, enhancement, refactor)
- When adding dependencies, ensure the referenced features exist or are being added in the same plan
`;

export const DEFAULT_BACKLOG_PLAN_USER_PROMPT_TEMPLATE = `Current Features in Backlog:
{{currentFeatures}}

---

User Request: {{userRequest}}

Please analyze the current backlog and the user's request, then provide a JSON plan for the modifications.`;

/**
 * Default Backlog Plan prompts (from backlog-plan/generate-plan.ts)
 */
export const DEFAULT_BACKLOG_PLAN_PROMPTS: ResolvedBacklogPlanPrompts = {
  systemPrompt: DEFAULT_BACKLOG_PLAN_SYSTEM_PROMPT,
  userPromptTemplate: DEFAULT_BACKLOG_PLAN_USER_PROMPT_TEMPLATE,
};

/**
 * ========================================================================
 * ENHANCEMENT PROMPTS
 * ========================================================================
 * Note: Enhancement prompts are already defined in enhancement.ts
 * We import and re-export them here for consistency
 */

import {
  IMPROVE_SYSTEM_PROMPT,
  TECHNICAL_SYSTEM_PROMPT,
  SIMPLIFY_SYSTEM_PROMPT,
  ACCEPTANCE_SYSTEM_PROMPT,
} from './enhancement.js';

/**
 * Default Enhancement prompts (from libs/prompts/src/enhancement.ts)
 */
export const DEFAULT_ENHANCEMENT_PROMPTS: ResolvedEnhancementPrompts = {
  improveSystemPrompt: IMPROVE_SYSTEM_PROMPT,
  technicalSystemPrompt: TECHNICAL_SYSTEM_PROMPT,
  simplifySystemPrompt: SIMPLIFY_SYSTEM_PROMPT,
  acceptanceSystemPrompt: ACCEPTANCE_SYSTEM_PROMPT,
};

/**
 * ========================================================================
 * COMBINED DEFAULTS
 * ========================================================================
 */

/**
 * All default prompts in one object for easy access
 */
export const DEFAULT_PROMPTS = {
  autoMode: DEFAULT_AUTO_MODE_PROMPTS,
  agent: DEFAULT_AGENT_PROMPTS,
  backlogPlan: DEFAULT_BACKLOG_PLAN_PROMPTS,
  enhancement: DEFAULT_ENHANCEMENT_PROMPTS,
} as const;
