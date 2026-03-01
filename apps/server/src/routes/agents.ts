/**
 * Agent CRUD routes - HTTP API for managing agent definitions
 *
 * Consolidated from agents/ directory into a single flat file.
 *
 * Provides endpoints for:
 * - Saving/updating agent AGENT.md files
 * - Deleting agent files
 * - AI-generating new agent definitions
 * - AI-evaluating existing agent definitions
 *
 * Mounted at /api/agents in the main server.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { createLogger } from '@dmaker/utils';
import { resolveModelString } from '@dmaker/model-resolver';
import { CLAUDE_MODEL_MAP } from '@dmaker/types';
import { simpleQuery } from '../providers/simple-query-service.js';

// ---------------------------------------------------------------------------
// Logger & error helpers
// ---------------------------------------------------------------------------

const logger = createLogger('Agents');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

// ---------------------------------------------------------------------------
// AI Prompt Templates for Agent Generation and Evaluation
// ---------------------------------------------------------------------------

/**
 * Build the prompt for AI agent generation
 */
function buildAgentGenerationPrompt(description: string, projectContext?: string): string {
  let prompt = `You are an expert at creating Claude Code custom agent definitions (AGENT.md files).

The user wants to create a new agent with the following purpose:
"${description}"

Generate a complete agent definition. Return your response in EXACTLY this format (no extra text before or after):

NAME: <agent-name-in-kebab-case>
DESCRIPTION: <one-line description of when to use this agent>
MODEL: <sonnet|opus|haiku|inherit>
TOOLS: <comma-separated list of tools, or "all" for unrestricted>
---PROMPT---
<the full system prompt for this agent>
---END---

Guidelines for the system prompt:
- Be specific and detailed about the agent's role and capabilities
- Include clear instructions on what the agent should and shouldn't do
- Mention any output format requirements
- Keep it focused on the agent's specific purpose
- Use markdown formatting where helpful

Guidelines for model selection:
- Use "sonnet" for most general-purpose agents (good balance of speed and quality)
- Use "opus" for complex reasoning, architecture decisions, or code review
- Use "haiku" for simple, fast tasks like formatting or basic checks
- Use "inherit" to use whatever model the parent conversation uses

Guidelines for tools:
- Common tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
- Use "all" if the agent needs unrestricted access
- Be restrictive when possible for safety`;

  if (projectContext) {
    prompt += `\n\nProject context (use this to tailor the agent to the project):\n${projectContext}`;
  }

  return prompt;
}

/**
 * Build the prompt for AI agent evaluation
 */
function buildAgentEvaluationPrompt(
  agent: { name: string; description: string; prompt: string; tools?: string[]; model?: string },
  projectContext?: string
): string {
  let prompt = `You are an expert at evaluating and improving Claude Code custom agent definitions.

Evaluate the following agent definition and provide detailed feedback.

Agent Name: ${agent.name}
Description: ${agent.description}
Model: ${agent.model || 'not specified'}
Tools: ${agent.tools?.join(', ') || 'all (unrestricted)'}

System Prompt:
${agent.prompt}

Return your evaluation in EXACTLY this format:

SCORE: <number 1-10>
STRENGTHS:
- <strength 1>
- <strength 2>
- <strength 3>
WEAKNESSES:
- <weakness 1>
- <weakness 2>
SUGGESTIONS:
- <suggestion 1>
- <suggestion 2>
- <suggestion 3>
---IMPROVED_PROMPT---
<the improved system prompt incorporating your suggestions>
---END---

Evaluation criteria:
1. Clarity: Is the system prompt clear and unambiguous?
2. Specificity: Does it give the agent enough guidance for its role?
3. Scope: Are the tools and model appropriate for the task?
4. Safety: Are there appropriate guardrails?
5. Completeness: Does it cover edge cases and output format?
6. Efficiency: Is the prompt concise without being vague?`;

  if (projectContext) {
    prompt += `\n\nProject context (consider this when evaluating relevance):\n${projectContext}`;
  }

  return prompt;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

// --- Save Agent ---

interface SaveAgentRequestBody {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  model?: string;
  scope: 'user' | 'project';
  projectPath?: string;
  originalFilePath?: string;
}

/**
 * Build AGENT.md file content from fields
 */
function buildAgentMdContent(data: SaveAgentRequestBody): string {
  const lines: string[] = ['---'];
  lines.push(`description: ${data.description}`);
  if (data.tools && data.tools.length > 0) {
    lines.push(`tools: ${data.tools.join(', ')}`);
  }
  if (data.model && data.model !== 'inherit') {
    lines.push(`model: ${data.model}`);
  }
  lines.push('---');
  lines.push(data.prompt);
  return lines.join('\n');
}

function createSaveAgentHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as SaveAgentRequestBody;

      if (!body.name || typeof body.name !== 'string') {
        res.status(400).json({ success: false, error: 'name is required' });
        return;
      }
      if (!body.description || typeof body.description !== 'string') {
        res.status(400).json({ success: false, error: 'description is required' });
        return;
      }
      if (!body.prompt || typeof body.prompt !== 'string') {
        res.status(400).json({ success: false, error: 'prompt is required' });
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

      // Sanitize name for filename
      const safeName = body.name
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      if (!safeName) {
        res.status(400).json({ success: false, error: 'Invalid agent name' });
        return;
      }

      // Determine target directory and file path
      const baseDir =
        body.scope === 'user'
          ? path.join(os.homedir(), '.claude', 'agents')
          : path.join(body.projectPath!, '.claude', 'agents');

      const targetPath = path.join(baseDir, `${safeName}.md`);

      // Build content
      const content = buildAgentMdContent(body);

      // Ensure directory exists
      await fs.mkdir(baseDir, { recursive: true });

      // If renaming (originalFilePath differs from target), delete the old file
      if (body.originalFilePath && body.originalFilePath !== targetPath) {
        try {
          await fs.unlink(body.originalFilePath);
          logger.info(`Deleted old agent file: ${body.originalFilePath}`);
        } catch {
          // Old file may not exist, that's fine
          logger.debug(`Could not delete old file (may not exist): ${body.originalFilePath}`);
        }
      }

      // Write the file
      await fs.writeFile(targetPath, content, 'utf-8');
      logger.info(`Saved agent: ${safeName} at ${targetPath}`);

      res.json({ success: true, filePath: targetPath, name: safeName });
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error('Failed to save agent:', message);
      res.status(500).json({ success: false, error: message });
    }
  };
}

// --- Delete Agent ---

interface DeleteAgentRequestBody {
  filePath: string;
}

function createDeleteAgentHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as DeleteAgentRequestBody;

      if (!filePath || typeof filePath !== 'string') {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      // Basic safety: only allow deleting .md files in agents directories
      if (!filePath.endsWith('.md') || !filePath.includes('agents')) {
        res
          .status(400)
          .json({ success: false, error: 'Can only delete .md files in agents directories' });
        return;
      }

      await fs.unlink(filePath);
      logger.info(`Deleted agent file: ${filePath}`);

      res.json({ success: true });
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error('Failed to delete agent:', message);
      res.status(500).json({ success: false, error: message });
    }
  };
}

// --- Generate Agent ---

interface GenerateAgentRequestBody {
  description: string;
  projectPath?: string;
  model?: string;
}

/**
 * Parse the AI response into structured agent data
 */
function parseGenerationResponse(text: string): {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  model?: string;
} | null {
  const nameMatch = text.match(/NAME:\s*(.+)/);
  const descMatch = text.match(/DESCRIPTION:\s*(.+)/);
  const modelMatch = text.match(/MODEL:\s*(\w+)/);
  const toolsMatch = text.match(/TOOLS:\s*(.+)/);
  const promptMatch = text.match(/---PROMPT---\n([\s\S]*?)---END---/);

  if (!nameMatch || !descMatch || !promptMatch) {
    return null;
  }

  const toolsStr = toolsMatch?.[1]?.trim();
  const tools =
    toolsStr && toolsStr.toLowerCase() !== 'all'
      ? toolsStr
          .split(/[,\s]+/)
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;

  return {
    name: nameMatch[1].trim(),
    description: descMatch[1].trim(),
    prompt: promptMatch[1].trim(),
    tools,
    model: modelMatch?.[1]?.trim(),
  };
}

function createGenerateAgentHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { description, projectPath, model } = req.body as GenerateAgentRequestBody;

      if (!description || typeof description !== 'string') {
        res.status(400).json({ success: false, error: 'description is required' });
        return;
      }

      logger.info(`Generating agent from description: "${description.slice(0, 100)}..."`);

      // Try to load project context
      let projectContext: string | undefined;
      if (projectPath) {
        try {
          const specPath = path.join(projectPath, '.dmaker', 'spec.md');
          projectContext = await fs.readFile(specPath, 'utf-8');
          if (projectContext.length > 4000) {
            projectContext = projectContext.slice(0, 4000) + '\n... (truncated)';
          }
        } catch {
          // No spec file, that's fine
        }
      }

      const prompt = buildAgentGenerationPrompt(description, projectContext);
      const resolvedModel = resolveModelString(model, CLAUDE_MODEL_MAP.sonnet);

      const result = await simpleQuery({
        prompt,
        model: resolvedModel,
        cwd: projectPath || process.cwd(),
        maxTurns: 1,
        allowedTools: [],
        readOnly: true,
      });

      const parsed = parseGenerationResponse(result.text);

      if (!parsed) {
        logger.warn('Failed to parse AI generation response');
        res.status(500).json({
          success: false,
          error: 'Failed to parse AI response. Please try again.',
          rawResponse: result.text,
        });
        return;
      }

      logger.info(`Generated agent: ${parsed.name}`);
      res.json({ success: true, agent: parsed });
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error('Agent generation failed:', message);
      res.status(500).json({ success: false, error: message });
    }
  };
}

// --- Evaluate Agent ---

interface EvaluateAgentRequestBody {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  model?: string;
  projectPath?: string;
  evaluationModel?: string;
}

interface EvaluationResult {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  improvedPrompt: string;
}

/**
 * Parse the AI evaluation response
 */
function parseEvaluationResponse(text: string): EvaluationResult | null {
  const scoreMatch = text.match(/SCORE:\s*(\d+)/);
  const strengthsMatch = text.match(/STRENGTHS:\n([\s\S]*?)(?=WEAKNESSES:)/);
  const weaknessesMatch = text.match(/WEAKNESSES:\n([\s\S]*?)(?=SUGGESTIONS:)/);
  const suggestionsMatch = text.match(/SUGGESTIONS:\n([\s\S]*?)(?=---IMPROVED_PROMPT---)/);
  const improvedPromptMatch = text.match(/---IMPROVED_PROMPT---\n([\s\S]*?)---END---/);

  if (!scoreMatch || !improvedPromptMatch) {
    return null;
  }

  const parseList = (block: string | undefined): string[] => {
    if (!block) return [];
    return block
      .split('\n')
      .map((line) => line.replace(/^-\s*/, '').trim())
      .filter(Boolean);
  };

  return {
    score: parseInt(scoreMatch[1], 10),
    strengths: parseList(strengthsMatch?.[1]),
    weaknesses: parseList(weaknessesMatch?.[1]),
    suggestions: parseList(suggestionsMatch?.[1]),
    improvedPrompt: improvedPromptMatch[1].trim(),
  };
}

function createEvaluateAgentHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as EvaluateAgentRequestBody;

      if (!body.name || !body.description || !body.prompt) {
        res
          .status(400)
          .json({ success: false, error: 'name, description, and prompt are required' });
        return;
      }

      logger.info(`Evaluating agent: ${body.name}`);

      // Try to load project context
      let projectContext: string | undefined;
      if (body.projectPath) {
        try {
          const specPath = path.join(body.projectPath, '.dmaker', 'spec.md');
          projectContext = await fs.readFile(specPath, 'utf-8');
          if (projectContext.length > 4000) {
            projectContext = projectContext.slice(0, 4000) + '\n... (truncated)';
          }
        } catch {
          // No spec file, that's fine
        }
      }

      const prompt = buildAgentEvaluationPrompt(
        {
          name: body.name,
          description: body.description,
          prompt: body.prompt,
          tools: body.tools,
          model: body.model,
        },
        projectContext
      );

      const resolvedModel = resolveModelString(body.evaluationModel, CLAUDE_MODEL_MAP.sonnet);

      const result = await simpleQuery({
        prompt,
        model: resolvedModel,
        cwd: body.projectPath || process.cwd(),
        maxTurns: 1,
        allowedTools: [],
        readOnly: true,
      });

      const evaluation = parseEvaluationResponse(result.text);

      if (!evaluation) {
        logger.warn('Failed to parse AI evaluation response');
        res.status(500).json({
          success: false,
          error: 'Failed to parse evaluation response. Please try again.',
          rawResponse: result.text,
        });
        return;
      }

      logger.info(`Evaluation complete for ${body.name}: score ${evaluation.score}/10`);
      res.json({ success: true, evaluation });
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error('Agent evaluation failed:', message);
      res.status(500).json({ success: false, error: message });
    }
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create agent CRUD router
 */
export function createAgentCrudRoutes(): Router {
  const router = Router();

  router.post('/save', createSaveAgentHandler());
  router.post('/delete', createDeleteAgentHandler());
  router.post('/generate', createGenerateAgentHandler());
  router.post('/evaluate', createEvaluateAgentHandler());

  return router;
}
