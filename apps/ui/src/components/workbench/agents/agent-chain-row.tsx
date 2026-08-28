import { CornerDownRight } from 'lucide-react';
import type { AgentNode, AgentNodeId } from '@dmaker/types';
import { AgentChainItem, type AgentChainItemState } from './agent-chain-item';

interface AgentChainRowProps {
  /** The candidates at this depth: the root alone at 0, a parent's children below. */
  nodes: AgentNode[];
  rowDepth: number;
  /** The agent whose children this row holds. Absent for row 0. */
  parentNode: AgentNode | null;
  /** The whole selection, root first. `path[rowDepth]` is this row's choice. */
  path: readonly AgentNodeId[];
  childCountOf: (agentId: AgentNodeId) => number;
  onSelect: (rowDepth: number, agentId: AgentNodeId) => void;
}

/**
 * One level of the chain: a horizontally scrolling strip of sibling agents.
 *
 * A plain `overflow-x-auto` div rather than `ScrollArea` — `layout.tsx`
 * hardcodes a vertical `<ScrollBar />` and never renders a horizontal one, so
 * a wide row inside one would be silently unreachable.
 */
export function AgentChainRow({
  nodes,
  rowDepth,
  parentNode,
  path,
  childCountOf,
  onSelect,
}: AgentChainRowProps) {
  const chosenId = path[rowDepth];
  // The deepest row that has a choice holds the selection; every choice above
  // it is an ancestor of that selection.
  const isDeepestChoice = rowDepth === path.length - 1;

  return (
    <div
      data-testid={`agent-chain-row-${rowDepth}`}
      className="flex items-center gap-2 border-b border-border/50 px-2 py-1.5 last:border-b-0"
    >
      {parentNode && (
        <span
          className="flex max-w-28 shrink-0 items-center gap-1 text-[10px] text-muted-foreground"
          title={`Spawned by ${parentNode.name}`}
        >
          <CornerDownRight className="size-3 shrink-0" />
          <span className="truncate">{parentNode.name}</span>
        </span>
      )}
      <div
        role="listbox"
        aria-label={parentNode ? `Sub-agents of ${parentNode.name}` : 'Agents'}
        aria-orientation="horizontal"
        className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5"
      >
        {nodes.map((node) => {
          const state: AgentChainItemState =
            node.id === chosenId ? (isDeepestChoice ? 'selected' : 'ancestor') : 'idle';
          return (
            <AgentChainItem
              key={node.id}
              node={node}
              state={state}
              rowDepth={rowDepth}
              childCount={childCountOf(node.id)}
              onSelect={onSelect}
            />
          );
        })}
      </div>
    </div>
  );
}
