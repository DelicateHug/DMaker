import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentNode, AgentNodeId, AgentTree } from '@dmaker/types';
import { buildChainRows, reconcilePath } from '@/lib/agent-tree';

export interface AgentChainSelection {
  /** Root first, one id per row that has a selection; the last is the selected agent. */
  path: AgentNodeId[];
  /** `rows[k]` are the candidates at depth k; `path[k]` is the one chosen there. */
  rows: AgentNode[][];
  selectedId: AgentNodeId | null;
  selectedNode: AgentNode | null;
  /** Choose `agentId` in row `rowDepth`, dropping every selection below it. */
  select: (rowDepth: number, agentId: AgentNodeId) => void;
}

/**
 * Miller-column selection over a live agent tree.
 *
 * The tree object is replaced on every streamed event, so everything here is
 * built to survive that: the path is reconciled during render (returning the
 * same array when nothing moved) rather than pushed through state on each
 * event, and `select` holds no dependency on the tree at all.
 */
export function useAgentChainSelection(tree: AgentTree | null | undefined): AgentChainSelection {
  const [path, setPath] = useState<AgentNodeId[]>([]);

  const resolvedPath = useMemo(() => reconcilePath(tree, path), [tree, path]);

  // Only fires when the tree genuinely invalidated the selection — reconcilePath
  // returns `path` itself otherwise, so a token arriving does not set state.
  useEffect(() => {
    if (resolvedPath !== path) setPath(resolvedPath);
  }, [resolvedPath, path]);

  const rows = useMemo(() => buildChainRows(tree, resolvedPath), [tree, resolvedPath]);

  const select = useCallback((rowDepth: number, agentId: AgentNodeId) => {
    // The whole selection rule. Index-based, so clicking row 0 resets the chain
    // and clicking row k keeps every ancestor above it — no ancestor walk and
    // nothing to keep in sync. `previous` is always the reconciled path: React
    // flushes the effect above before it dispatches a click.
    setPath((previous) => [...previous.slice(0, rowDepth), agentId]);
  }, []);

  const selectedId = resolvedPath.length > 0 ? resolvedPath[resolvedPath.length - 1] : null;
  const selectedNode = selectedId ? (tree?.nodes[selectedId] ?? null) : null;

  return { path: resolvedPath, rows, selectedId, selectedNode, select };
}
