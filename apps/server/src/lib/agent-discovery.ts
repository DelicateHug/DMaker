/**
 * Agent Discovery - Scans filesystem for AGENT.md files
 *
 * Discovers agents from:
 * - ~/.claude/agents/ (user-level, global)
 * - .claude/agents/ (project-level)
 *
 * Similar to Skills, but for custom subagents defined in AGENT.md files.
 */

import path from 'path';
import os from 'os';
import { createLogger } from '@dmaker/utils';
import { secureFs, systemPaths } from '@dmaker/platform';
import type { AgentDefinition } from '@dmaker/types';

const logger = createLogger('AgentDiscovery');

export interface FilesystemAgent {
  name: string; // Directory name (e.g., 'code-reviewer')
  definition: AgentDefinition;
  source: 'user' | 'project';
  filePath: string; // Full path to AGENT.md
  folder: string; // Relative folder from agents root ("", "testing", "testing/backend")
  projectName?: string; // Project name for project-scoped agents
}

/**
 * Parse agent content string into AgentDefinition
 * Format:
 * ---
 * name: agent-name  # Optional
 * description: When to use this agent
 * tools: tool1, tool2, tool3  # Optional (comma or space separated list)
 * model: sonnet  # Optional: sonnet, opus, haiku
 * ---
 * System prompt content here...
 */
function parseAgentContent(content: string, filePath: string): AgentDefinition {
  // Extract frontmatter (optional — agents are always discovered even without it)
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    // No frontmatter — treat entire content as the prompt with placeholder metadata
    const agentName = path
      .basename(filePath, '.md')
      .replace(/^AGENT$/, path.basename(path.dirname(filePath)));
    logger.debug(`Agent file has no frontmatter, using placeholder metadata: ${filePath}`);
    return {
      description: `Custom agent: ${agentName}`,
      prompt: content.trim(),
    };
  }

  const [, frontmatter, prompt] = frontmatterMatch;

  // Parse description (optional — use placeholder if missing)
  const description = frontmatter.match(/description:\s*(.+)/)?.[1]?.trim();
  if (!description) {
    const agentName = path
      .basename(filePath, '.md')
      .replace(/^AGENT$/, path.basename(path.dirname(filePath)));
    logger.debug(`Missing description in agent file, using placeholder: ${filePath}`);
    return {
      description: `Custom agent: ${agentName}`,
      prompt: prompt.trim(),
    };
  }

  // Parse tools (optional) - supports both comma-separated and space-separated
  const toolsMatch = frontmatter.match(/tools:\s*(.+)/);
  const tools = toolsMatch
    ? toolsMatch[1]
        .split(/[,\s]+/) // Split by comma or whitespace
        .map((t) => t.trim())
        .filter((t) => t && t !== '')
    : undefined;

  // Parse model (optional) - validate against allowed values
  const modelMatch = frontmatter.match(/model:\s*(\w+)/);
  const modelValue = modelMatch?.[1]?.trim();
  const validModels = ['sonnet', 'opus', 'haiku', 'inherit'] as const;
  const model =
    modelValue && validModels.includes(modelValue as (typeof validModels)[number])
      ? (modelValue as 'sonnet' | 'opus' | 'haiku' | 'inherit')
      : undefined;

  if (modelValue && !model) {
    logger.warn(
      `Invalid model "${modelValue}" in agent file: ${filePath}. Expected one of: ${validModels.join(', ')}`
    );
  }

  return {
    description,
    prompt: prompt.trim(),
    tools,
    model,
  };
}

/**
 * Directory entry with type information
 */
interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

/**
 * Filesystem adapter interface for abstracting systemPaths vs secureFs
 */
interface FsAdapter {
  exists: (filePath: string) => Promise<boolean>;
  readdir: (dirPath: string) => Promise<DirEntry[]>;
  readFile: (filePath: string) => Promise<string>;
}

/**
 * Create a filesystem adapter for system paths (user directory)
 */
function createSystemPathAdapter(): FsAdapter {
  return {
    exists: (filePath) => Promise.resolve(systemPaths.systemPathExists(filePath)),
    readdir: async (dirPath) => {
      const entryNames = await systemPaths.systemPathReaddir(dirPath);
      const entries: DirEntry[] = [];
      for (const name of entryNames) {
        const stat = await systemPaths.systemPathStat(path.join(dirPath, name));
        entries.push({
          name,
          isFile: stat.isFile(),
          isDirectory: stat.isDirectory(),
        });
      }
      return entries;
    },
    readFile: (filePath) => systemPaths.systemPathReadFile(filePath, 'utf-8') as Promise<string>,
  };
}

/**
 * Create a filesystem adapter for project paths (secureFs)
 */
function createSecureFsAdapter(): FsAdapter {
  return {
    exists: (filePath) =>
      secureFs
        .access(filePath)
        .then(() => true)
        .catch(() => false),
    readdir: async (dirPath) => {
      const entries = await secureFs.readdir(dirPath, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
      }));
    },
    readFile: (filePath) => secureFs.readFile(filePath, 'utf-8') as Promise<string>,
  };
}

/**
 * Parse agent file using the provided filesystem adapter
 */
async function parseAgentFileWithAdapter(
  filePath: string,
  fsAdapter: FsAdapter
): Promise<AgentDefinition | null> {
  try {
    const content = await fsAdapter.readFile(filePath);
    if (!content || !content.trim()) {
      // Empty file — still discover it with placeholder metadata
      const agentName = path
        .basename(filePath, '.md')
        .replace(/^AGENT$/, path.basename(path.dirname(filePath)));
      return {
        description: `Custom agent: ${agentName}`,
        prompt: '',
      };
    }
    return parseAgentContent(content, filePath);
  } catch (error) {
    logger.error(`Failed to read agent file: ${filePath}`, error);
    return null;
  }
}

/**
 * Recursively scan a directory for agent .md files
 * Agents can be in two formats:
 * 1. Flat: agent-name.md (file directly in a directory)
 * 2. Subdirectory: agent-name/AGENT.md (folder + file, similar to Skills)
 *
 * Directories without AGENT.md are treated as category folders and recursed into.
 */
async function scanAgentsDirectoryRecursive(
  baseDir: string,
  currentDir: string,
  source: 'user' | 'project',
  fsAdapter: FsAdapter,
  agents: FilesystemAgent[]
): Promise<void> {
  const folder = path.relative(baseDir, currentDir).replace(/\\/g, '/') || '';

  let entries: DirEntry[];
  try {
    entries = await fsAdapter.readdir(currentDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    // Check for flat .md file format (agent-name.md)
    if (entry.isFile && entry.name.endsWith('.md')) {
      const agentName = entry.name.slice(0, -3); // Remove .md extension
      const agentFilePath = path.join(currentDir, entry.name);
      const definition = await parseAgentFileWithAdapter(agentFilePath, fsAdapter);
      if (definition) {
        agents.push({ name: agentName, definition, source, filePath: agentFilePath, folder });
        logger.debug(
          `Discovered ${source} agent (flat): ${agentName}${folder ? ` in ${folder}` : ''}`
        );
      }
    }
    // Check for subdirectory format (agent-name/AGENT.md) or category folder
    else if (entry.isDirectory) {
      const agentFilePath = path.join(currentDir, entry.name, 'AGENT.md');
      const agentFileExists = await fsAdapter.exists(agentFilePath);

      if (agentFileExists) {
        // It's an agent directory (has AGENT.md)
        const definition = await parseAgentFileWithAdapter(agentFilePath, fsAdapter);
        if (definition) {
          agents.push({ name: entry.name, definition, source, filePath: agentFilePath, folder });
          logger.debug(
            `Discovered ${source} agent (subdirectory): ${entry.name}${folder ? ` in ${folder}` : ''}`
          );
        }
      } else {
        // It's a category folder — recurse into it
        await scanAgentsDirectoryRecursive(
          baseDir,
          path.join(currentDir, entry.name),
          source,
          fsAdapter,
          agents
        );
      }
    }
  }
}

/**
 * Scan a directory for agent .md files (entry point)
 */
async function scanAgentsDirectory(
  baseDir: string,
  source: 'user' | 'project'
): Promise<FilesystemAgent[]> {
  const agents: FilesystemAgent[] = [];
  const fsAdapter = source === 'user' ? createSystemPathAdapter() : createSecureFsAdapter();

  try {
    const exists = await fsAdapter.exists(baseDir);
    if (!exists) {
      logger.debug(`Directory does not exist: ${baseDir}`);
      return agents;
    }

    await scanAgentsDirectoryRecursive(baseDir, baseDir, source, fsAdapter, agents);
  } catch (error) {
    logger.error(`Failed to scan agents directory: ${baseDir}`, error);
  }

  return agents;
}

/**
 * Discover all filesystem-based agents from user and project sources
 */
export async function discoverFilesystemAgents(
  projectPath?: string,
  sources: Array<'user' | 'project'> = ['user', 'project'],
  projects?: Array<{ name: string; path: string }>
): Promise<FilesystemAgent[]> {
  const agents: FilesystemAgent[] = [];

  // Discover user-level agents from ~/.claude/agents/
  if (sources.includes('user')) {
    const userAgentsDir = path.join(os.homedir(), '.claude', 'agents');
    const userAgents = await scanAgentsDirectory(userAgentsDir, 'user');
    agents.push(...userAgents);
    logger.info(`Discovered ${userAgents.length} user-level agents from ${userAgentsDir}`);
  }

  // Discover project-level agents from all projects
  if (sources.includes('project')) {
    const projectPaths = new Set<string>();

    if (projects?.length) {
      // Scan all provided projects
      for (const project of projects) {
        if (projectPaths.has(project.path)) continue;
        projectPaths.add(project.path);
        const projectAgentsDir = path.join(project.path, '.claude', 'agents');
        const projectAgents = await scanAgentsDirectory(projectAgentsDir, 'project');
        // Tag each agent with the project name
        for (const agent of projectAgents) {
          agent.projectName = project.name;
        }
        agents.push(...projectAgents);
        if (projectAgents.length > 0) {
          logger.info(
            `Discovered ${projectAgents.length} project-level agents from ${project.name}`
          );
        }
      }
    } else if (projectPath) {
      // Fallback: single project path (backwards compat)
      const projectAgentsDir = path.join(projectPath, '.claude', 'agents');
      const projectAgents = await scanAgentsDirectory(projectAgentsDir, 'project');
      agents.push(...projectAgents);
      logger.info(
        `Discovered ${projectAgents.length} project-level agents from ${projectAgentsDir}`
      );
    }
  }

  return agents;
}

/**
 * Resolve agent dependencies by scanning prompts for references to other agents.
 * Dynamically loads agents that are referenced by already-selected agents.
 *
 * Resolution strategy (applied per agent prompt):
 * 1. Exact name match: check if any discovered agent's full name appears in the prompt
 * 2. Grep fallback: extract words adjacent to "agent" keyword, then search by
 *    partial agent name match or agent description match
 *
 * Transitive: if agent A references B and B references C, all three are loaded.
 */
export function resolveAgentDependencies(
  selectedAgents: Record<string, AgentDefinition>,
  allDiscoveredAgents: Record<string, AgentDefinition>
): { resolved: Record<string, AgentDefinition>; dynamicallyLoaded: string[] } {
  const resolved = { ...selectedAgents };
  const dynamicallyLoaded: string[] = [];
  const checked = new Set<string>();
  const MAX_DEPTH = 10;
  let depth = 0;

  let agentsToCheck = Object.keys(selectedAgents);

  while (agentsToCheck.length > 0 && depth < MAX_DEPTH) {
    depth++;
    const newlyFound: string[] = [];

    for (const agentName of agentsToCheck) {
      if (checked.has(agentName)) continue;
      checked.add(agentName);

      const agent = resolved[agentName];
      const prompt = (agent?.prompt || '').toLowerCase();
      if (!prompt) continue;

      // Strategy 1: Exact name match against all discovered agents
      for (const [candidateName, candidateDef] of Object.entries(allDiscoveredAgents)) {
        if (candidateName in resolved) continue;
        if (prompt.includes(candidateName.toLowerCase())) {
          resolved[candidateName] = candidateDef;
          dynamicallyLoaded.push(candidateName);
          newlyFound.push(candidateName);
          logger.info(
            `[AgentDeps] Dynamically loaded "${candidateName}" (exact name match in "${agentName}")`
          );
        }
      }

      // Strategy 2: Grep fallback — extract references near "agent" keyword
      // and search by partial name or description match
      const SKIP_WORDS = new Set([
        'the',
        'an',
        'a',
        'this',
        'that',
        'my',
        'your',
        'our',
        'each',
        'every',
        'custom',
        'other',
        'another',
        'new',
        'all',
        'any',
        'no',
        'one',
        'some',
        'per',
        'sub',
        'main',
      ]);
      const agentRefPattern = /(\b[\w-]+)\s+agent\b|\bagent\s+([\w-]+)\b/gi;
      let match;
      while ((match = agentRefPattern.exec(prompt)) !== null) {
        const ref = (match[1] || match[2]).toLowerCase();
        if (SKIP_WORDS.has(ref)) continue;

        // Partial name match (either direction)
        for (const [candidateName, candidateDef] of Object.entries(allDiscoveredAgents)) {
          if (candidateName in resolved) continue;
          const candidateLower = candidateName.toLowerCase();
          if (candidateLower.includes(ref) || ref.includes(candidateLower)) {
            resolved[candidateName] = candidateDef;
            dynamicallyLoaded.push(candidateName);
            newlyFound.push(candidateName);
            logger.info(
              `[AgentDeps] Dynamically loaded "${candidateName}" (grep name: "${ref}" in "${agentName}")`
            );
          }
        }

        // Description match
        for (const [candidateName, candidateDef] of Object.entries(allDiscoveredAgents)) {
          if (candidateName in resolved) continue;
          if (candidateDef.description?.toLowerCase().includes(ref)) {
            resolved[candidateName] = candidateDef;
            dynamicallyLoaded.push(candidateName);
            newlyFound.push(candidateName);
            logger.info(
              `[AgentDeps] Dynamically loaded "${candidateName}" (grep description: "${ref}" in "${agentName}")`
            );
          }
        }
      }
    }

    agentsToCheck = newlyFound;
  }

  if (depth >= MAX_DEPTH) {
    logger.warn(`[AgentDeps] Hit max depth (${MAX_DEPTH}) resolving agent dependencies`);
  }

  return { resolved, dynamicallyLoaded };
}
