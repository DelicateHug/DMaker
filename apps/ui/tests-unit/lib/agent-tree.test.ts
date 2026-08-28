import { describe, it, expect } from 'vitest';
import { MASTER_AGENT_ID, type AgentNode, type AgentTree } from '@dmaker/types';
import {
  buildChainRows,
  childrenOf,
  collectSubtreeIds,
  indexAgents,
  reconcilePath,
  sliceTranscriptForAgents,
} from '@/lib/agent-tree';

function node(id: string, parentId: string | null, startedAt: string): AgentNode {
  return {
    id,
    parentId,
    depth: parentId === null ? 0 : 1,
    name: id,
    status: 'completed',
    startedAt,
    toolCallCount: 0,
    index: 0,
  };
}

function treeOf(nodes: AgentNode[]): AgentTree {
  return {
    featureId: 'feature-1',
    nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
    order: nodes.map((entry) => entry.id),
    updatedAt: '2026-01-01T00:00:10.000Z',
  };
}

const ids = (nodes: AgentNode[]) => nodes.map((entry) => entry.id);

/** master ─┬─ a ─┬─ a1 ── a1x     (depth 2 under a1) */
/**         │     └─ a2                              */
/**         └─ b                                     */
const DEEP_TREE = treeOf([
  node(MASTER_AGENT_ID, null, '2026-01-01T00:00:00.000Z'),
  node('a', MASTER_AGENT_ID, '2026-01-01T00:00:01.000Z'),
  node('b', MASTER_AGENT_ID, '2026-01-01T00:00:02.000Z'),
  node('a1', 'a', '2026-01-01T00:00:03.000Z'),
  node('a2', 'a', '2026-01-01T00:00:04.000Z'),
  node('a1x', 'a1', '2026-01-01T00:00:05.000Z'),
]);

describe('indexAgents', () => {
  it('returns an empty index for a missing tree', () => {
    expect(indexAgents(null).root).toBeNull();
    expect(indexAgents(undefined).childrenByParent).toEqual({});
  });

  it('groups children by parent in spawn order', () => {
    const index = indexAgents(DEEP_TREE);
    expect(index.root?.id).toBe(MASTER_AGENT_ID);
    expect(ids(index.childrenByParent[MASTER_AGENT_ID])).toEqual(['a', 'b']);
    expect(ids(index.childrenByParent.a)).toEqual(['a1', 'a2']);
  });

  it('re-parents an orphan onto the root rather than dropping it', () => {
    const orphaned = treeOf([
      node(MASTER_AGENT_ID, null, '2026-01-01T00:00:00.000Z'),
      node('lost', 'never-seen', '2026-01-01T00:00:01.000Z'),
    ]);
    expect(ids(indexAgents(orphaned).childrenByParent[MASTER_AGENT_ID])).toEqual(['lost']);
  });
});

describe('childrenOf', () => {
  it('answers with the direct children, and with nothing for a leaf', () => {
    expect(ids(childrenOf(DEEP_TREE, 'a'))).toEqual(['a1', 'a2']);
    expect(childrenOf(DEEP_TREE, 'b')).toEqual([]);
    expect(childrenOf(null, MASTER_AGENT_ID)).toEqual([]);
  });
});

describe('buildChainRows', () => {
  it('shows the root alone at depth 0', () => {
    expect(buildChainRows(DEEP_TREE, []).map(ids)).toEqual([[MASTER_AGENT_ID]]);
  });

  it('appends a row of children for the selected agent at depth 1', () => {
    expect(buildChainRows(DEEP_TREE, [MASTER_AGENT_ID]).map(ids)).toEqual([
      [MASTER_AGENT_ID],
      ['a', 'b'],
    ]);
  });

  it('appends another row as the selection goes deeper', () => {
    expect(buildChainRows(DEEP_TREE, [MASTER_AGENT_ID, 'a']).map(ids)).toEqual([
      [MASTER_AGENT_ID],
      ['a', 'b'],
      ['a1', 'a2'],
    ]);
    expect(buildChainRows(DEEP_TREE, [MASTER_AGENT_ID, 'a', 'a1']).map(ids)).toEqual([
      [MASTER_AGENT_ID],
      ['a', 'b'],
      ['a1', 'a2'],
      ['a1x'],
    ]);
  });

  it('stops at an agent with no children', () => {
    expect(buildChainRows(DEEP_TREE, [MASTER_AGENT_ID, 'a', 'a2']).map(ids)).toEqual([
      [MASTER_AGENT_ID],
      ['a', 'b'],
      ['a1', 'a2'],
    ]);
  });

  it('returns no rows at all when there is no tree', () => {
    expect(buildChainRows(null, [MASTER_AGENT_ID])).toEqual([]);
  });
});

describe('reconcilePath', () => {
  it('turns an empty path into the root', () => {
    expect(reconcilePath(DEEP_TREE, [])).toEqual([MASTER_AGENT_ID]);
  });

  it('returns the very same array when nothing moved', () => {
    // Identity, not equality: the hook compares by reference to decide whether
    // to set state, so an equal-but-new array would re-render the chain and
    // remount the transcript on every streamed event.
    const path = [MASTER_AGENT_ID, 'a', 'a1'];
    expect(reconcilePath(DEEP_TREE, path)).toBe(path);
  });

  it('truncates at an id that has vanished from the tree', () => {
    expect(reconcilePath(DEEP_TREE, [MASTER_AGENT_ID, 'a', 'gone'])).toEqual([
      MASTER_AGENT_ID,
      'a',
    ]);
  });

  it('truncates where the parent link no longer holds', () => {
    // a1 is a child of a, not of b, so the chain cannot pass through b to it.
    expect(reconcilePath(DEEP_TREE, [MASTER_AGENT_ID, 'b', 'a1'])).toEqual([MASTER_AGENT_ID, 'b']);
  });

  it('reseats a path that does not start at the root', () => {
    expect(reconcilePath(DEEP_TREE, ['a'])).toEqual([MASTER_AGENT_ID]);
  });

  it('empties a path when the tree has gone', () => {
    expect(reconcilePath(null, [MASTER_AGENT_ID])).toEqual([]);
    const empty: string[] = [];
    expect(reconcilePath(null, empty)).toBe(empty);
  });
});

describe('collectSubtreeIds', () => {
  it('walks depth-first in spawn order', () => {
    // Depth-first because that is the order the work happened in: a1's own
    // child ran inside a1's turn, before a2 was ever spawned.
    expect(collectSubtreeIds(DEEP_TREE, MASTER_AGENT_ID)).toEqual([
      MASTER_AGENT_ID,
      'a',
      'a1',
      'a1x',
      'a2',
      'b',
    ]);
    expect(collectSubtreeIds(DEEP_TREE, 'a')).toEqual(['a', 'a1', 'a1x', 'a2']);
  });

  it('answers with nothing for an unknown agent', () => {
    expect(collectSubtreeIds(DEEP_TREE, 'nobody')).toEqual([]);
  });

  it('terminates on a malformed tree with a parent cycle', () => {
    const cyclic = treeOf([
      node(MASTER_AGENT_ID, null, '2026-01-01T00:00:00.000Z'),
      node('a', 'c', '2026-01-01T00:00:01.000Z'),
      node('b', 'a', '2026-01-01T00:00:02.000Z'),
      node('c', 'b', '2026-01-01T00:00:03.000Z'),
    ]);
    expect(collectSubtreeIds(cyclic, 'a')).toEqual(['a', 'b', 'c']);
  });
});

describe('sliceTranscriptForAgents', () => {
  const TRANSCRIPT = [
    'work started',
    '[timestamp:2026-01-01T00:00:01Z] [agent:a] ▶ code-reviewer',
    'child tool call',
    '[timestamp:2026-01-01T00:00:02Z] [agent:master] ▶ Master',
    'back on the main thread',
  ].join('\n');

  it('returns the transcript byte for byte when every agent is included', () => {
    // This is what makes the pane non-regressive: Master selected with
    // sub-agents included is exactly the transcript that shipped before it.
    expect(sliceTranscriptForAgents(TRANSCRIPT, [MASTER_AGENT_ID, 'a'])).toBe(TRANSCRIPT);
  });

  it('keeps a marker line with the agent it introduces', () => {
    expect(sliceTranscriptForAgents(TRANSCRIPT, ['a'])).toBe(
      '[timestamp:2026-01-01T00:00:01Z] [agent:a] ▶ code-reviewer\nchild tool call'
    );
  });

  it('files everything before the first marker under master', () => {
    expect(sliceTranscriptForAgents(TRANSCRIPT, [MASTER_AGENT_ID])).toBe(
      'work started\n[timestamp:2026-01-01T00:00:02Z] [agent:master] ▶ Master\nback on the main thread'
    );
  });

  it('answers with an empty string for an empty selection or transcript', () => {
    expect(sliceTranscriptForAgents(TRANSCRIPT, [])).toBe('');
    expect(sliceTranscriptForAgents('', [MASTER_AGENT_ID])).toBe('');
  });
});
