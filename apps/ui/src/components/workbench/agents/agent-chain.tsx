import { useCallback, useMemo } from 'react';
import type { AgentNode, AgentNodeId, AgentTree } from '@dmaker/types';
import { indexAgents } from '@/lib/agent-tree';
import { cn } from '@/lib/utils';
import { AgentChainRow } from './agent-chain-row';

interface AgentChainProps {
  tree: AgentTree | null;
  /** `rows[k]` are the candidates at depth k, from `buildChainRows`. */
  rows: AgentNode[][];
  /** The selection, root first. `path[k]` is the choice made in `rows[k]`. */
  path: readonly AgentNodeId[];
  onSelect: (rowDepth: number, agentId: AgentNodeId) => void;
  className?: string;
}

/**
 * Miller columns over a run's agent tree.
 *
 * Row 0 is Master. Clicking an agent that has children appends a row holding
 * them, and clicking back up a row drops every row below it — so the chain is
 * always exactly as deep as the user has drilled, no more.
 */
export function AgentChain({ tree, rows, path, onSelect, className }: AgentChainProps) {
  const index = useMemo(() => indexAgents(tree), [tree]);

  // Stable across renders so the memo on each item survives a streamed event
  // that changed nothing about that item.
  const childCountOf = useCallback(
    (agentId: AgentNodeId) => index.childrenByParent[agentId]?.length ?? 0,
    [index]
  );

  if (rows.length === 0) {
    return (
      <div
        data-testid="agent-chain"
        className={cn('px-3 py-2 text-xs text-muted-foreground', className)}
      >
        No agents recorded for this run yet.
      </div>
    );
  }

  return (
    <div
      data-testid="agent-chain"
      className={cn('flex flex-col overflow-y-auto bg-muted/20', className)}
    >
      {rows.map((nodes, rowDepth) => (
        <AgentChainRow
          key={rowDepth === 0 ? 'root' : path[rowDepth - 1]}
          nodes={nodes}
          rowDepth={rowDepth}
          // Row k holds the children of the agent chosen in row k-1, which is
          // what makes the caption ("spawned by …") true by construction.
          parentNode={rowDepth === 0 ? null : (index.nodes[path[rowDepth - 1]] ?? null)}
          path={path}
          childCountOf={childCountOf}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
