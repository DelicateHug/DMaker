import { memo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AgentNode } from '@dmaker/types';
import { cn } from '@/lib/utils';
import {
  AgentStatusIcon,
  agentSubtitle,
  formatAgentDuration,
  formatAgentToolCount,
  getAgentStatusMeta,
} from './agent-status-meta';

/** Which of the three chain states this item is in. Drives `data-state`. */
export type AgentChainItemState = 'selected' | 'ancestor' | 'idle';

interface AgentChainItemProps {
  node: AgentNode;
  state: AgentChainItemState;
  /** Which chain row this item sits in — passed straight back to `onSelect`. */
  rowDepth: number;
  /** Direct sub-agents, shown as the "opens another row" affordance. */
  childCount: number;
  /**
   * Takes `rowDepth` rather than closing over it so the row can hand down the
   * selection hook's own stable callback. A per-item arrow function here would
   * change identity every render and make the memo below do nothing.
   */
  onSelect: (rowDepth: number, agentId: string) => void;
}

const STATE_CLASSES: Record<AgentChainItemState, string> = {
  // The ring rather than a fill, so the selected card still reads as the same
  // object it was before it was clicked.
  selected: 'border-primary/60 bg-primary/10 ring-1 ring-primary/50',
  // Dimmer: an ancestor is context for the selection, not the selection.
  ancestor: 'border-primary/30 bg-primary/5 text-muted-foreground',
  idle: 'border-border bg-card/60 hover:bg-accent/50',
};

/**
 * One agent in the chain.
 *
 * `agent-chain-item-{id}` is a new testid namespace on purpose:
 * `agent-item-{featureId}` already belongs to `running-agents-panel.tsx` and
 * `running-agents-indicator.tsx`, and those are keyed by feature, not agent.
 *
 * Memoised because the tree object is replaced on every streamed event while
 * the individual nodes usually are not — an untouched agent's card should not
 * repaint for someone else's token.
 *
 * There is deliberately no cost figure here. `SDKResultMessage` carries no
 * `parent_tool_use_id`, so all usage is whole-run and a per-agent cost would
 * have to be invented. Duration and tool counts are real; cost is not.
 */
export const AgentChainItem = memo(function AgentChainItem({
  node,
  state,
  rowDepth,
  childCount,
  onSelect,
}: AgentChainItemProps) {
  const status = getAgentStatusMeta(node);
  const subtitle = agentSubtitle(node);
  const duration = formatAgentDuration(node);
  const tools = formatAgentToolCount(node);

  return (
    <button
      type="button"
      role="option"
      aria-selected={state === 'selected'}
      data-testid={`agent-chain-item-${node.id}`}
      data-state={state}
      data-agent-status={node.status}
      onClick={() => onSelect(rowDepth, node.id)}
      title={node.prompt ?? subtitle ?? node.name}
      className={cn(
        'flex w-48 shrink-0 flex-col gap-1 rounded-md border px-2.5 py-1.5 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        STATE_CLASSES[state]
      )}
    >
      <div className="flex items-center gap-1.5">
        <AgentStatusIcon node={node} />
        <span className="truncate text-xs font-medium">{node.name}</span>
        {childCount > 0 && (
          <span
            className="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground"
            title={`${childCount} sub-agent${childCount === 1 ? '' : 's'}`}
          >
            {childCount}
            <ChevronRight className="size-3" />
          </span>
        )}
      </div>

      {subtitle && <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>}

      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>{status.label}</span>
        {duration && <span>· {duration}</span>}
        {tools && <span>· {tools}</span>}
        {/* Named, not hidden: an inferred node's parent and name are guesses the
            tracker made from a child message whose Task block it never saw. */}
        {node.inferred && <span className="italic">· inferred</span>}
      </div>
    </button>
  );
});
