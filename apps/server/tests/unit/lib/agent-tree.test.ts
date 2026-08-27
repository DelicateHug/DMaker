import { describe, it, expect, afterEach, vi } from 'vitest';
import { MASTER_AGENT_ID, MASTER_AGENT_NAME } from '@dmaker/types';
import { AgentTreeTracker } from '@/lib/agent-tree.js';

/**
 * Message shapes here mirror the SDK exactly: `parent_tool_use_id` is `null` on
 * the root's messages, a `tool_use` block named `Task` carries the child's key
 * in its `id`, and the matching `tool_result` arrives on a `user` message owned
 * by the PARENT, not the child.
 */
function assistantMessage(
  content: Array<Record<string, unknown>>,
  parentToolUseId: string | null = null
) {
  return {
    type: 'assistant',
    parent_tool_use_id: parentToolUseId,
    message: { role: 'assistant', content },
  };
}

function userMessage(
  content: Array<Record<string, unknown>>,
  parentToolUseId: string | null = null
) {
  return {
    type: 'user',
    parent_tool_use_id: parentToolUseId,
    message: { role: 'user', content },
  };
}

function taskBlock(id: string, input: Record<string, unknown> = {}) {
  return { type: 'tool_use', id, name: 'Task', input };
}

function toolUseBlock(id: string, name: string, input: Record<string, unknown> = {}) {
  return { type: 'tool_use', id, name, input };
}

function toolResultBlock(toolUseId: string, content: unknown, isError?: boolean) {
  const block: Record<string, unknown> = {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content,
  };
  if (isError !== undefined) block.is_error = isError;
  return block;
}

describe('AgentTreeTracker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('the master node', () => {
    it('starts with a lone running master and no sub-agents', () => {
      const tracker = new AgentTreeTracker('feat-1', '2026-01-01T00:00:00.000Z');

      const tree = tracker.snapshot();
      expect(tree.featureId).toBe('feat-1');
      expect(tree.order).toEqual([MASTER_AGENT_ID]);
      expect(tree.nodes[MASTER_AGENT_ID]).toMatchObject({
        id: MASTER_AGENT_ID,
        parentId: null,
        depth: 0,
        name: MASTER_AGENT_NAME,
        status: 'running',
        startedAt: '2026-01-01T00:00:00.000Z',
        toolCallCount: 0,
        index: 0,
      });
      expect(tracker.toSummaries()).toEqual([]);
    });

    it('reports no change for a message that spawns nothing, and counts its tool calls', () => {
      const tracker = new AgentTreeTracker('feat-1');

      const changes = tracker.observe(
        assistantMessage([{ type: 'text', text: 'thinking' }, toolUseBlock('tu-1', 'Read')])
      );

      expect(changes).toEqual([]);
      expect(tracker.snapshot().nodes[MASTER_AGENT_ID].toolCallCount).toBe(1);
    });

    it('takes the resolved model id from system/init, which only the root gets', () => {
      const tracker = new AgentTreeTracker('feat-1');

      tracker.observe({ type: 'system', subtype: 'init', model: 'claude-opus-4-6' });

      expect(tracker.snapshot().nodes[MASTER_AGENT_ID].model).toBe('claude-opus-4-6');
    });
  });

  describe('agentIdFor', () => {
    it('maps a null, absent or non-string parent_tool_use_id to master', () => {
      const tracker = new AgentTreeTracker('feat-1');

      expect(tracker.agentIdFor({ type: 'assistant', parent_tool_use_id: null })).toBe(
        MASTER_AGENT_ID
      );
      expect(tracker.agentIdFor({ type: 'assistant' })).toBe(MASTER_AGENT_ID);
      expect(tracker.agentIdFor({ parent_tool_use_id: 42 })).toBe(MASTER_AGENT_ID);
      expect(tracker.agentIdFor(undefined)).toBe(MASTER_AGENT_ID);
    });

    it('maps a populated parent_tool_use_id to that agent', () => {
      const tracker = new AgentTreeTracker('feat-1');

      expect(tracker.agentIdFor({ type: 'assistant', parent_tool_use_id: 'toolu_a' })).toBe(
        'toolu_a'
      );
    });
  });

  describe('spawning', () => {
    it('links a depth-1 child to master and carries the Task input onto the node', () => {
      const tracker = new AgentTreeTracker('feat-1');

      const changes = tracker.observe(
        assistantMessage([
          taskBlock('toolu_a', {
            subagent_type: 'code-reviewer',
            description: 'Review the diff',
            prompt: 'Review everything under apps/server.',
            model: 'haiku',
            run_in_background: true,
          }),
        ])
      );

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({ kind: 'spawned' });
      const node = tracker.snapshot().nodes.toolu_a;
      expect(node).toMatchObject({
        id: 'toolu_a',
        parentId: MASTER_AGENT_ID,
        depth: 1,
        name: 'code-reviewer',
        description: 'Review the diff',
        prompt: 'Review everything under apps/server.',
        model: 'haiku',
        background: true,
        status: 'running',
        index: 1,
        toolCallCount: 0,
      });
      expect(node.inferred).toBeUndefined();
      // The Task block is a tool call of the PARENT, not of the child it spawns.
      expect(tracker.snapshot().nodes[MASTER_AGENT_ID].toolCallCount).toBe(1);
      expect(tracker.nameOf('toolu_a')).toBe('code-reviewer');
    });

    it('parents a depth-2 child to the owner of the message containing its Task block', () => {
      const tracker = new AgentTreeTracker('feat-1');

      tracker.observe(assistantMessage([taskBlock('toolu_a', { subagent_type: 'planner' })]));
      // Emitted BY toolu_a, so the Task block inside it spawns toolu_a's child.
      const changes = tracker.observe(
        assistantMessage([taskBlock('toolu_b', { subagent_type: 'writer' })], 'toolu_a')
      );

      expect(changes).toHaveLength(1);
      expect(tracker.snapshot().nodes.toolu_b).toMatchObject({
        parentId: 'toolu_a',
        depth: 2,
        name: 'writer',
        index: 2,
      });
      expect(tracker.snapshot().nodes.toolu_a.toolCallCount).toBe(1);
    });

    it('does not spawn a second node when the same Task block is observed twice', () => {
      const tracker = new AgentTreeTracker('feat-1');
      const message = assistantMessage([taskBlock('toolu_a', { subagent_type: 'planner' })]);

      tracker.observe(message);
      const changes = tracker.observe(message);

      expect(changes).toEqual([]);
      expect(tracker.snapshot().order).toEqual([MASTER_AGENT_ID, 'toolu_a']);
      // Counting by block id is what keeps a replayed message from inflating this.
      expect(tracker.snapshot().nodes[MASTER_AGENT_ID].toolCallCount).toBe(1);
    });
  });

  describe('completion', () => {
    it('completes a running node on its tool_result and reports the duration', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const tracker = new AgentTreeTracker('feat-1');
      tracker.observe(assistantMessage([taskBlock('toolu_a', { subagent_type: 'planner' })]));

      vi.setSystemTime(new Date('2026-01-01T00:00:12.500Z'));
      const changes = tracker.observe(
        userMessage([toolResultBlock('toolu_a', [{ type: 'text', text: 'All done.' }])])
      );

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({ kind: 'finished', durationMs: 12500 });
      expect(tracker.snapshot().nodes.toolu_a).toMatchObject({
        status: 'completed',
        endedAt: '2026-01-01T00:00:12.500Z',
        result: 'All done.',
      });
      expect(tracker.snapshot().nodes.toolu_a.isError).toBeUndefined();
    });

    it('marks the node failed when the tool_result carries is_error', () => {
      const tracker = new AgentTreeTracker('feat-1');
      tracker.observe(assistantMessage([taskBlock('toolu_a', { subagent_type: 'planner' })]));

      const changes = tracker.observe(
        userMessage([toolResultBlock('toolu_a', 'Agent exceeded its turn limit', true)])
      );

      expect(changes[0]).toMatchObject({ kind: 'finished' });
      expect(tracker.snapshot().nodes.toolu_a).toMatchObject({
        status: 'failed',
        isError: true,
        result: 'Agent exceeded its turn limit',
      });
    });

    it('ignores a tool_result for an ordinary tool and for an already-finished node', () => {
      const tracker = new AgentTreeTracker('feat-1');
      tracker.observe(assistantMessage([taskBlock('toolu_a', { subagent_type: 'planner' })]));
      tracker.observe(userMessage([toolResultBlock('toolu_a', 'first')]));

      const ordinary = tracker.observe(userMessage([toolResultBlock('tu-read', 'file contents')]));
      const repeat = tracker.observe(userMessage([toolResultBlock('toolu_a', 'second')]));

      expect(ordinary).toEqual([]);
      expect(repeat).toEqual([]);
      expect(tracker.snapshot().nodes.toolu_a.result).toBe('first');
    });

    it('flattens a mixed content array into the text a human would read', () => {
      const tracker = new AgentTreeTracker('feat-1');
      tracker.observe(assistantMessage([taskBlock('toolu_a', { subagent_type: 'planner' })]));

      tracker.observe(
        userMessage([
          toolResultBlock('toolu_a', [
            'a bare string part',
            { type: 'text', text: 'a text block' },
            { type: 'image', source: {} },
          ]),
        ])
      );

      expect(tracker.snapshot().nodes.toolu_a.result).toBe('a bare string part\na text block');
    });

    it('caps a stored result at 4000 characters', () => {
      const tracker = new AgentTreeTracker('feat-1');
      tracker.observe(assistantMessage([taskBlock('toolu_a', { subagent_type: 'planner' })]));

      tracker.observe(userMessage([toolResultBlock('toolu_a', 'x'.repeat(10_000))]));

      expect(tracker.snapshot().nodes.toolu_a.result).toHaveLength(4000);
    });
  });

  describe('inferred owners', () => {
    it('creates a placeholder for an unknown owner rather than dropping the message', () => {
      const tracker = new AgentTreeTracker('feat-1');

      const changes = tracker.observe(
        assistantMessage([toolUseBlock('tu-1', 'Grep')], 'toolu_ghost')
      );

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({ kind: 'spawned' });
      expect(tracker.snapshot().nodes.toolu_ghost).toMatchObject({
        id: 'toolu_ghost',
        parentId: MASTER_AGENT_ID,
        depth: 1,
        status: 'running',
        inferred: true,
        // The message was still attributed - that is the whole point.
        toolCallCount: 1,
      });
    });

    it('backfills the placeholder from a later Task block without duplicating it', () => {
      const tracker = new AgentTreeTracker('feat-1');
      // Seen mid-flight first: a resumed session starts inside a sub-agent.
      tracker.observe(assistantMessage([toolUseBlock('tu-1', 'Grep')], 'toolu_b'));
      tracker.observe(assistantMessage([taskBlock('toolu_a', { subagent_type: 'planner' })]));

      const changes = tracker.observe(
        assistantMessage(
          [taskBlock('toolu_b', { subagent_type: 'writer', description: 'Write the docs' })],
          'toolu_a'
        )
      );

      expect(changes).toHaveLength(1);
      const tree = tracker.snapshot();
      expect(tree.order).toEqual([MASTER_AGENT_ID, 'toolu_b', 'toolu_a']);
      expect(tree.nodes.toolu_b).toMatchObject({
        name: 'writer',
        description: 'Write the docs',
        parentId: 'toolu_a',
        // Re-derived: the placeholder was parented to master and so sat at 1.
        depth: 2,
        toolCallCount: 1,
      });
      expect(tree.nodes.toolu_b.inferred).toBeUndefined();
    });

    it('re-derives the depth of a backfilled node’s own children', () => {
      const tracker = new AgentTreeTracker('feat-1');
      // A grandchild arrives before anything that explains it.
      tracker.observe(
        assistantMessage([taskBlock('toolu_c', { subagent_type: 'tester' })], 'toolu_b')
      );
      tracker.observe(assistantMessage([taskBlock('toolu_a', { subagent_type: 'planner' })]));

      tracker.observe(
        assistantMessage([taskBlock('toolu_b', { subagent_type: 'writer' })], 'toolu_a')
      );

      const nodes = tracker.snapshot().nodes;
      expect(nodes.toolu_a.depth).toBe(1);
      expect(nodes.toolu_b.depth).toBe(2);
      expect(nodes.toolu_c.depth).toBe(3);
    });
  });

  describe('finalize', () => {
    it('closes master and every still-running sub-agent, reporting only the sub-agents', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const tracker = new AgentTreeTracker('feat-1');
      tracker.observe(assistantMessage([taskBlock('toolu_a', { subagent_type: 'planner' })]));
      tracker.observe(assistantMessage([taskBlock('toolu_b', { subagent_type: 'writer' })]));
      tracker.observe(userMessage([toolResultBlock('toolu_a', 'done')]));

      vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'));
      const changes = tracker.finalize('aborted');

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({ kind: 'finished', durationMs: 5000 });
      expect((changes[0] as { node: { id: string } }).node.id).toBe('toolu_b');
      const nodes = tracker.snapshot().nodes;
      expect(nodes[MASTER_AGENT_ID].status).toBe('aborted');
      expect(nodes.toolu_b).toMatchObject({
        status: 'aborted',
        endedAt: '2026-01-01T00:00:05.000Z',
      });
      // An already-completed node keeps its own outcome.
      expect(nodes.toolu_a.status).toBe('completed');
    });

    it('reports nothing on a second call', () => {
      const tracker = new AgentTreeTracker('feat-1');
      tracker.observe(assistantMessage([taskBlock('toolu_a', { subagent_type: 'planner' })]));
      tracker.finalize('completed');

      expect(tracker.finalize('aborted')).toEqual([]);
      expect(tracker.snapshot().nodes.toolu_a.status).toBe('completed');
    });
  });

  describe('toSummaries', () => {
    it('excludes master and preserves spawn order across depths', () => {
      const tracker = new AgentTreeTracker('feat-1');
      tracker.observe(
        assistantMessage([taskBlock('toolu_a', { subagent_type: 'planner', description: 'Plan' })])
      );
      tracker.observe(assistantMessage([taskBlock('toolu_b', { subagent_type: 'writer' })]));
      tracker.observe(
        assistantMessage([taskBlock('toolu_c', { subagent_type: 'tester' })], 'toolu_a')
      );
      tracker.observe(userMessage([toolResultBlock('toolu_a', 'done')]));

      const summaries = tracker.toSummaries();

      expect(summaries.map((s) => s.agentId)).toEqual(['toolu_a', 'toolu_b', 'toolu_c']);
      expect(summaries[0]).toMatchObject({
        agentId: 'toolu_a',
        parentAgentId: MASTER_AGENT_ID,
        depth: 1,
        name: 'planner',
        description: 'Plan',
        status: 'completed',
        toolCallCount: 1,
      });
      expect(summaries[0].endedAt).toBeDefined();
      expect(summaries[1]).toMatchObject({ status: 'running', parentAgentId: MASTER_AGENT_ID });
      expect(summaries[1].endedAt).toBeUndefined();
      expect(summaries[2]).toMatchObject({ parentAgentId: 'toolu_a', depth: 2 });
    });
  });

  describe('snapshot', () => {
    it('is a copy, so a payload already emitted cannot be mutated by later messages', () => {
      const tracker = new AgentTreeTracker('feat-1');
      tracker.observe(assistantMessage([taskBlock('toolu_a', { subagent_type: 'planner' })]));

      const before = tracker.snapshot();
      tracker.observe(assistantMessage([taskBlock('toolu_b', { subagent_type: 'writer' })]));
      tracker.observe(userMessage([toolResultBlock('toolu_a', 'done')]));

      expect(before.order).toEqual([MASTER_AGENT_ID, 'toolu_a']);
      expect(before.nodes.toolu_a.status).toBe('running');
      expect(tracker.snapshot().nodes.toolu_a.status).toBe('completed');
    });
  });

  describe('malformed input', () => {
    it('never throws, whatever the stream yields', () => {
      const tracker = new AgentTreeTracker('feat-1');
      const junk: unknown[] = [
        undefined,
        null,
        'a string',
        7,
        { type: 'assistant' },
        { type: 'assistant', message: null },
        { type: 'assistant', message: { content: 'not an array' } },
        { type: 'assistant', message: { content: [null, 'text', 42] } },
        { type: 'assistant', message: { content: [{ type: 'tool_use' }] } },
        { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Task' }] } },
        { type: 'user', message: { content: [{ type: 'tool_result' }] } },
      ];

      for (const msg of junk) {
        expect(() => tracker.observe(msg)).not.toThrow();
      }
      // A Task block with no id cannot key a node, so nothing was spawned.
      expect(tracker.snapshot().order).toEqual([MASTER_AGENT_ID]);
    });

    it('swallows a message that throws while being read', () => {
      const tracker = new AgentTreeTracker('feat-1');
      const hostile = {
        type: 'assistant',
        get parent_tool_use_id(): string {
          throw new Error('exploding getter');
        },
      };

      expect(() => tracker.observe(hostile)).not.toThrow();
      expect(tracker.observe(hostile)).toEqual([]);
      expect(tracker.snapshot().order).toEqual([MASTER_AGENT_ID]);
    });

    it('names an agent it has never seen without inventing master', () => {
      const tracker = new AgentTreeTracker('feat-1');

      expect(tracker.nameOf(MASTER_AGENT_ID)).toBe(MASTER_AGENT_NAME);
      expect(tracker.nameOf('toolu_never_seen')).toBe('Sub-agent');
    });
  });
});
