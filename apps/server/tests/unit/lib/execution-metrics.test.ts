import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createMetricsAccumulator,
  accumulateFromMessage,
  detectAuthMethod,
} from '@/lib/execution-metrics.js';

/**
 * The accumulator is fed every message of every stream loop, and each field it
 * touches is rendered somewhere in the UI (`metrics-panel.tsx`, `list-row.tsx`).
 * These cases pin the arithmetic - additive ACROSS SDK sessions, last-write-wins
 * WITHIN one (every figure on a `result` is already session-cumulative) - and
 * the exact block shapes it keys on.
 */
function assistantWithBlocks(content: Array<Record<string, unknown>>) {
  return { type: 'assistant', message: { role: 'assistant', content } };
}

function resultMessage(fields: Record<string, unknown>) {
  return { type: 'result', subtype: 'success', ...fields };
}

describe('execution-metrics.ts', () => {
  describe('detectAuthMethod', () => {
    const original = process.env.ANTHROPIC_API_KEY;

    beforeEach(() => {
      delete process.env.ANTHROPIC_API_KEY;
    });

    afterEach(() => {
      if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = original;
    });

    it('reports api_key when the key is in the environment', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      expect(detectAuthMethod()).toBe('api_key');
    });

    it('falls back to the CLI subscription login', () => {
      expect(detectAuthMethod()).toBe('cli');
    });
  });

  describe('createMetricsAccumulator', () => {
    it('starts every counter at zero and every list empty', () => {
      const metrics = createMetricsAccumulator('cli');

      expect(metrics).toMatchObject({
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
        authMethod: 'cli',
      });
      expect(Date.parse(metrics.updatedAt)).not.toBeNaN();
    });

    it('records an unknown auth method when none is supplied', () => {
      expect(createMetricsAccumulator().authMethod).toBe('unknown');
    });
  });

  describe('tool usage from assistant messages', () => {
    it('counts one subagent per Task block, at any depth', () => {
      const metrics = createMetricsAccumulator();

      accumulateFromMessage(
        metrics,
        assistantWithBlocks([
          { type: 'tool_use', id: 'toolu_a', name: 'Task', input: { subagent_type: 'planner' } },
          { type: 'tool_use', id: 'toolu_b', name: 'Task', input: { subagent_type: 'writer' } },
        ])
      );
      // A sub-agent's own Task block arrives on a message of its own; it counts too.
      accumulateFromMessage(metrics, {
        ...assistantWithBlocks([{ type: 'tool_use', id: 'toolu_c', name: 'Task', input: {} }]),
        parent_tool_use_id: 'toolu_a',
      });

      expect(metrics.subagentsSpawned).toBe(3);
    });

    it('counts nothing for other tools, text blocks or a message with no content', () => {
      const metrics = createMetricsAccumulator();

      accumulateFromMessage(
        metrics,
        assistantWithBlocks([
          { type: 'text', text: 'about to delegate' },
          { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/tmp/x' } },
          { type: 'tool_use', id: 'tu-2', name: 'TodoWrite', input: {} },
        ])
      );
      accumulateFromMessage(metrics, { type: 'assistant' });
      accumulateFromMessage(metrics, { type: 'assistant', message: {} });

      expect(metrics.subagentsSpawned).toBe(0);
      expect(metrics.skillsUsed).toEqual([]);
    });

    it('records each Skill by name, once', () => {
      const metrics = createMetricsAccumulator();

      accumulateFromMessage(
        metrics,
        assistantWithBlocks([
          { type: 'tool_use', id: 'tu-1', name: 'Skill', input: { skill: 'beep' } },
          { type: 'tool_use', id: 'tu-2', name: 'Skill', input: { skill: 'ovzur' } },
        ])
      );
      accumulateFromMessage(
        metrics,
        assistantWithBlocks([
          { type: 'tool_use', id: 'tu-3', name: 'Skill', input: { skill: 'beep' } },
        ])
      );

      expect(metrics.skillsUsed).toEqual(['beep', 'ovzur']);
    });

    it('falls back to "unknown" when a Skill block names no skill', () => {
      const metrics = createMetricsAccumulator();

      accumulateFromMessage(
        metrics,
        assistantWithBlocks([{ type: 'tool_use', id: 'tu-1', name: 'Skill', input: {} }])
      );

      expect(metrics.skillsUsed).toEqual(['unknown']);
    });
  });

  describe('usage from result messages', () => {
    it('sums cost, turns and durations across several SDK calls', () => {
      const metrics = createMetricsAccumulator();

      // One feature run makes several SDK calls (plan revision, per-task,
      // continuation), and each is its own session. Those really do add up.
      accumulateFromMessage(
        metrics,
        resultMessage({
          session_id: 'session-a',
          total_cost_usd: 0.25,
          num_turns: 4,
          duration_ms: 1000,
          duration_api_ms: 800,
        })
      );
      accumulateFromMessage(
        metrics,
        resultMessage({
          session_id: 'session-b',
          total_cost_usd: 0.5,
          num_turns: 3,
          duration_ms: 2000,
          duration_api_ms: 1500,
        })
      );

      expect(metrics.totalCostUSD).toBeCloseTo(0.75, 10);
      expect(metrics.numTurns).toBe(7);
      expect(metrics.durationMs).toBe(3000);
      expect(metrics.durationApiMs).toBe(2300);
    });

    it('takes the last figure within one session instead of adding it twice', () => {
      const metrics = createMetricsAccumulator();

      // Mid-flight message injection produces N results in ONE session, and
      // every number the CLI puts on a result is already cumulative for that
      // whole session. Adding them would bill the first turn twice.
      accumulateFromMessage(
        metrics,
        resultMessage({
          session_id: 'session-a',
          total_cost_usd: 0.25,
          num_turns: 4,
          duration_ms: 1000,
          duration_api_ms: 800,
          usage: { input_tokens: 100, output_tokens: 20 },
          modelUsage: { 'claude-opus-4-6': { inputTokens: 100, costUSD: 0.25 } },
        })
      );
      accumulateFromMessage(
        metrics,
        resultMessage({
          session_id: 'session-a',
          total_cost_usd: 0.4,
          num_turns: 9,
          duration_ms: 2500,
          duration_api_ms: 1900,
          usage: { input_tokens: 260, output_tokens: 55 },
          modelUsage: { 'claude-opus-4-6': { inputTokens: 260, costUSD: 0.4 } },
        })
      );

      expect(metrics.totalCostUSD).toBeCloseTo(0.4, 10);
      expect(metrics.numTurns).toBe(9);
      expect(metrics.durationMs).toBe(2500);
      expect(metrics.durationApiMs).toBe(1900);
      expect(metrics.inputTokens).toBe(260);
      expect(metrics.outputTokens).toBe(55);
      expect(metrics.modelUsage['claude-opus-4-6'].inputTokens).toBe(260);
      expect(metrics.modelUsage['claude-opus-4-6'].costUSD).toBeCloseTo(0.4, 10);
    });

    it('treats a session whose counters restarted as a fresh contribution', () => {
      const metrics = createMetricsAccumulator();

      // `resume` gives a new CLI process the same session id, and its counters
      // start again at zero. Subtracting the old baseline would drive the
      // totals backwards, so a figure that went DOWN is added in full.
      accumulateFromMessage(
        metrics,
        resultMessage({ session_id: 'session-a', total_cost_usd: 0.6, duration_ms: 5000 })
      );
      accumulateFromMessage(
        metrics,
        resultMessage({ session_id: 'session-a', total_cost_usd: 0.1, duration_ms: 900 })
      );

      expect(metrics.totalCostUSD).toBeCloseTo(0.7, 10);
      expect(metrics.durationMs).toBe(5900);
    });

    it('keeps two accumulators independent', () => {
      const first = createMetricsAccumulator();
      const second = createMetricsAccumulator();

      accumulateFromMessage(
        first,
        resultMessage({ session_id: 'session-a', total_cost_usd: 0.25 })
      );
      accumulateFromMessage(
        second,
        resultMessage({ session_id: 'session-a', total_cost_usd: 0.25 })
      );

      // The per-session baseline is keyed by accumulator, so one run's figures
      // can never be netted off against another run that shares a session id.
      expect(first.totalCostUSD).toBeCloseTo(0.25, 10);
      expect(second.totalCostUSD).toBeCloseTo(0.25, 10);
    });

    it('sums the four token counts, treating a missing one as zero', () => {
      const metrics = createMetricsAccumulator();

      accumulateFromMessage(
        metrics,
        resultMessage({
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_read_input_tokens: 5000,
            cache_creation_input_tokens: 300,
          },
        })
      );
      accumulateFromMessage(metrics, resultMessage({ usage: { input_tokens: 50 } }));

      expect(metrics).toMatchObject({
        inputTokens: 150,
        outputTokens: 20,
        cacheReadInputTokens: 5000,
        cacheCreationInputTokens: 300,
      });
    });

    it('ignores a result message with no usage or cost fields', () => {
      const metrics = createMetricsAccumulator();

      accumulateFromMessage(metrics, resultMessage({ subtype: 'error_during_execution' }));

      expect(metrics).toMatchObject({ totalCostUSD: 0, numTurns: 0, inputTokens: 0 });
      expect(metrics.modelUsage).toEqual({});
    });

    it('merges modelUsage per model instead of replacing it', () => {
      const metrics = createMetricsAccumulator();

      accumulateFromMessage(
        metrics,
        resultMessage({
          modelUsage: {
            'claude-opus-4-6': {
              inputTokens: 100,
              outputTokens: 40,
              cacheReadInputTokens: 10,
              cacheCreationInputTokens: 5,
              costUSD: 0.2,
            },
          },
        })
      );
      accumulateFromMessage(
        metrics,
        resultMessage({
          modelUsage: {
            'claude-opus-4-6': { inputTokens: 50, costUSD: 0.1 },
            'claude-haiku-4-5': { inputTokens: 7, outputTokens: 3 },
          },
        })
      );

      expect(metrics.modelUsage['claude-opus-4-6']).toMatchObject({
        inputTokens: 150,
        outputTokens: 40,
        cacheReadInputTokens: 10,
        cacheCreationInputTokens: 5,
      });
      expect(metrics.modelUsage['claude-opus-4-6'].costUSD).toBeCloseTo(0.3, 10);
      expect(metrics.modelUsage['claude-haiku-4-5']).toEqual({
        inputTokens: 7,
        outputTokens: 3,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUSD: 0,
      });
    });
  });

  describe('system init', () => {
    it('unions skills and agents across repeated init messages', () => {
      const metrics = createMetricsAccumulator();

      accumulateFromMessage(metrics, {
        type: 'system',
        subtype: 'init',
        skills: ['beep', 'release'],
        agents: ['code-reviewer'],
      });
      accumulateFromMessage(metrics, {
        type: 'system',
        subtype: 'init',
        skills: ['beep', 'thorough'],
        agents: ['code-reviewer', 'test-writer'],
      });

      expect(metrics.skillsLoaded).toEqual(['beep', 'release', 'thorough']);
      expect(metrics.agentsLoaded).toEqual(['code-reviewer', 'test-writer']);
    });

    it('ignores a system message that is not an init', () => {
      const metrics = createMetricsAccumulator();

      accumulateFromMessage(metrics, {
        type: 'system',
        subtype: 'compact_boundary',
        skills: ['beep'],
      });

      expect(metrics.skillsLoaded).toEqual([]);
    });
  });

  it('restamps updatedAt on every message, including one it takes nothing from', () => {
    const metrics = createMetricsAccumulator();
    metrics.updatedAt = '2020-01-01T00:00:00.000Z';

    accumulateFromMessage(metrics, { type: 'stream_event' });

    expect(metrics.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });
});
