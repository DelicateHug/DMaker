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

/**
 * Last cumulative figure seen for one accumulator, keyed by session and field.
 *
 * WHY THIS EXISTS. Every number on a `result` message is CUMULATIVE FOR THE
 * WHOLE SESSION, not for the turn that just ended — verified in the bundled
 * CLI: `duration_ms` is `Date.now() - sessionStart`, `num_turns` is the length
 * of the session's message array, `total_cost_usd` and `modelUsage` are session
 * getters, and `usage` is folded together across every `message_stop`. One
 * result per session made "add them up" correct by accident. Mid-flight message
 * injection produces N results in one session, and adding those up reports the
 * cost of the first turn N times.
 *
 * So: additive ACROSS sessions (one feature run really does make several SDK
 * calls — plan revision, per-task and continuation each open their own), and
 * last-write-wins WITHIN a session. Held off to the side in a WeakMap because
 * `ExecutionMetrics` is persisted into `feature.json` and must not grow
 * bookkeeping fields; it also drops with the accumulator it belongs to.
 */
const cumulativeBaselines = new WeakMap<ExecutionMetrics, Map<string, number>>();

/**
 * How much of `value` is new, given what this session had already reported.
 *
 * A figure that went DOWN cannot be one session's counter still climbing: it is
 * a fresh CLI process reusing the session id (what `resume` does), whose
 * counters restarted at zero. Its whole value is new, which is exactly the
 * additive behaviour that case had before.
 */
function newPortionOf(
  metrics: ExecutionMetrics,
  sessionId: string,
  field: string,
  value: number
): number {
  let baselines = cumulativeBaselines.get(metrics);
  if (!baselines) {
    baselines = new Map<string, number>();
    cumulativeBaselines.set(metrics, baselines);
  }
  const key = `${sessionId}\u0000${field}`;
  const previous = baselines.get(key) ?? 0;
  baselines.set(key, value);
  return value >= previous ? value - previous : value;
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
    // Every figure below is session-cumulative, so only the part that is new
    // since this session's last result counts. See `newPortionOf`.
    const sessionId = typeof msg.session_id === 'string' ? msg.session_id : '';

    if (typeof msg.total_cost_usd === 'number') {
      metrics.totalCostUSD += newPortionOf(
        metrics,
        sessionId,
        'total_cost_usd',
        msg.total_cost_usd
      );
    }
    if (typeof msg.num_turns === 'number') {
      metrics.numTurns += newPortionOf(metrics, sessionId, 'num_turns', msg.num_turns);
    }
    if (typeof msg.duration_ms === 'number') {
      metrics.durationMs += newPortionOf(metrics, sessionId, 'duration_ms', msg.duration_ms);
    }
    if (typeof msg.duration_api_ms === 'number') {
      metrics.durationApiMs += newPortionOf(
        metrics,
        sessionId,
        'duration_api_ms',
        msg.duration_api_ms
      );
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
      metrics.inputTokens += newPortionOf(
        metrics,
        sessionId,
        'usage.input_tokens',
        usage.input_tokens || 0
      );
      metrics.outputTokens += newPortionOf(
        metrics,
        sessionId,
        'usage.output_tokens',
        usage.output_tokens || 0
      );
      metrics.cacheReadInputTokens += newPortionOf(
        metrics,
        sessionId,
        'usage.cache_read_input_tokens',
        usage.cache_read_input_tokens || 0
      );
      metrics.cacheCreationInputTokens += newPortionOf(
        metrics,
        sessionId,
        'usage.cache_creation_input_tokens',
        usage.cache_creation_input_tokens || 0
      );
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
        // Session-cumulative per model, exactly like the totals above.
        const perModel = (field: string, value: number): number =>
          newPortionOf(metrics, sessionId, `modelUsage.${modelName}.${field}`, value);

        metrics.modelUsage[modelName].inputTokens += perModel('inputTokens', mu.inputTokens || 0);
        metrics.modelUsage[modelName].outputTokens += perModel(
          'outputTokens',
          mu.outputTokens || 0
        );
        metrics.modelUsage[modelName].cacheReadInputTokens += perModel(
          'cacheReadInputTokens',
          mu.cacheReadInputTokens || 0
        );
        metrics.modelUsage[modelName].cacheCreationInputTokens += perModel(
          'cacheCreationInputTokens',
          mu.cacheCreationInputTokens || 0
        );
        metrics.modelUsage[modelName].costUSD += perModel('costUSD', mu.costUSD || 0);
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
