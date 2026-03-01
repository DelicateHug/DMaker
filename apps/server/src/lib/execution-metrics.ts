/**
 * Execution metrics accumulator for tracking token usage, cost, and
 * skills/subagents across multiple SDK calls within a single feature execution.
 */
import type { ExecutionMetrics } from '@dmaker/types';

/**
 * Detect the current authentication method based on environment.
 * - 'api_key': ANTHROPIC_API_KEY environment variable is set
 * - 'cli': No API key, using Claude CLI subscription login
 */
export function detectAuthMethod(): 'cli' | 'api_key' | 'unknown' {
  if (process.env.ANTHROPIC_API_KEY) return 'api_key';
  return 'cli';
}

export function createMetricsAccumulator(
  authMethod?: 'cli' | 'api_key' | 'unknown'
): ExecutionMetrics {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    totalCostUSD: 0,
    numTurns: 0,
    durationMs: 0,
    durationApiMs: 0,
    modelUsage: {},
    skillsUsed: [],
    subagentsSpawned: 0,
    skillsLoaded: [],
    agentsLoaded: [],
    updatedAt: new Date().toISOString(),
    authMethod: authMethod ?? 'unknown',
  };
}

/**
 * Process a stream message and accumulate relevant metrics.
 * Call this for every message yielded by the SDK stream.
 *
 * The SDK yields messages with these relevant types:
 * - 'assistant' with tool_use blocks (track Skill/Task usage)
 * - 'result' with usage/cost data (SDKResultMessage)
 * - 'system' with subtype 'init' (loaded skills/agents)
 */
export function accumulateFromMessage(
  metrics: ExecutionMetrics,
  msg: Record<string, unknown>
): void {
  // Track Skill and Task tool usage from assistant messages
  if (msg.type === 'assistant' && msg.message) {
    const message = msg.message as { content?: Array<Record<string, unknown>> };
    if (message.content) {
      for (const block of message.content) {
        if (block.type === 'tool_use') {
          if (block.name === 'Skill' && block.input) {
            const input = block.input as Record<string, unknown>;
            const skillName = (input.skill as string) || 'unknown';
            if (!metrics.skillsUsed.includes(skillName)) {
              metrics.skillsUsed.push(skillName);
            }
          }
          if (block.name === 'Task') {
            metrics.subagentsSpawned++;
          }
        }
      }
    }
  }

  // Extract usage data from result messages (SDKResultMessage)
  if (msg.type === 'result') {
    if (typeof msg.total_cost_usd === 'number') {
      metrics.totalCostUSD += msg.total_cost_usd;
    }
    if (typeof msg.num_turns === 'number') {
      metrics.numTurns += msg.num_turns;
    }
    if (typeof msg.duration_ms === 'number') {
      metrics.durationMs += msg.duration_ms;
    }
    if (typeof msg.duration_api_ms === 'number') {
      metrics.durationApiMs += msg.duration_api_ms;
    }

    const usage = msg.usage as
      | {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        }
      | undefined;
    if (usage) {
      metrics.inputTokens += usage.input_tokens || 0;
      metrics.outputTokens += usage.output_tokens || 0;
      metrics.cacheReadInputTokens += usage.cache_read_input_tokens || 0;
      metrics.cacheCreationInputTokens += usage.cache_creation_input_tokens || 0;
    }

    const modelUsage = msg.modelUsage as
      | Record<
          string,
          {
            inputTokens?: number;
            outputTokens?: number;
            cacheReadInputTokens?: number;
            cacheCreationInputTokens?: number;
            webSearchRequests?: number;
            costUSD?: number;
          }
        >
      | undefined;
    if (modelUsage) {
      for (const [modelName, mu] of Object.entries(modelUsage)) {
        if (!metrics.modelUsage[modelName]) {
          metrics.modelUsage[modelName] = {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            costUSD: 0,
          };
        }
        metrics.modelUsage[modelName].inputTokens += mu.inputTokens || 0;
        metrics.modelUsage[modelName].outputTokens += mu.outputTokens || 0;
        metrics.modelUsage[modelName].cacheReadInputTokens += mu.cacheReadInputTokens || 0;
        metrics.modelUsage[modelName].cacheCreationInputTokens += mu.cacheCreationInputTokens || 0;
        metrics.modelUsage[modelName].costUSD += mu.costUSD || 0;
      }
    }
  }

  // Track skills/agents loaded from system init message
  if (msg.type === 'system' && msg.subtype === 'init') {
    const skills = msg.skills as string[] | undefined;
    const agents = msg.agents as string[] | undefined;
    if (skills) {
      metrics.skillsLoaded = [...new Set([...metrics.skillsLoaded, ...skills])];
    }
    if (agents) {
      metrics.agentsLoaded = [...new Set([...metrics.agentsLoaded, ...agents])];
    }
  }

  metrics.updatedAt = new Date().toISOString();
}
