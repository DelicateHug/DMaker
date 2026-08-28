import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, GitBranch, RefreshCw, Terminal as TerminalIcon } from 'lucide-react';
import { MASTER_AGENT_NAME } from '@dmaker/types';
import { LogViewer } from '@/components/ui/log-viewer';
import { LoadingState } from '@/components/ui/loading-state';
import { Button } from '@/components/ui/button';
import { useAgentOutputStream } from '@/hooks/use-agent-output-stream';
import { useAgentChainSelection } from '@/hooks/use-agent-chain-selection';
import { collectSubtreeIds, sliceTranscriptForAgents } from '@/lib/agent-tree';
import { AgentChain } from '@/components/workbench/agents/agent-chain';
import {
  AgentStatusIcon,
  formatAgentDuration,
} from '@/components/workbench/agents/agent-status-meta';
import type { Feature } from '@/store/app-store';

interface AgentsPaneProps {
  feature: Feature;
  projectPath: string;
}

/**
 * The run seen as the tree of agents it actually was.
 *
 * Master on top, a row of sub-agents for each agent drilled into, and the
 * transcript of whatever is selected underneath. With Master selected and
 * sub-agents included — the state the pane opens in — the transcript is the
 * whole run's output byte for byte, so nothing that was visible before this
 * pane existed has been taken away.
 *
 * What a sub-agent can show is limited by what the SDK forwards, and the pane
 * says so rather than papering over it: a child's prose is never streamed, only
 * its tool calls and its final result, and a background Task never streams at
 * all.
 */
export function AgentsPane({ feature, projectPath }: AgentsPaneProps) {
  const { output, byAgent, tree, isLoading, error, refresh } = useAgentOutputStream(
    projectPath,
    feature.id
  );
  const { rows, path, selectedId, selectedNode, select } = useAgentChainSelection(tree);
  const [includeDescendants, setIncludeDescendants] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);

  // `reconcilePath` always seats the root at index 0, so this needs no lookup.
  const rootId = path[0] ?? null;
  const isRootSelected = selectedId !== null && selectedId === rootId;

  // buildChainRows appends a row per selected agent that has children, so the
  // row past the end of the path is exactly the selected agent's own children.
  const selectedChildren = rows[path.length] ?? [];
  const subagentCount = tree ? Math.max(0, Object.keys(tree.nodes).length - 1) : 0;

  const subtreeIds = useMemo(
    () => (selectedId ? collectSubtreeIds(tree, selectedId) : []),
    [tree, selectedId]
  );

  const transcript = useMemo(() => {
    if (!selectedId) return output;
    // The non-regression path: everything, untouched, with no scan at all.
    if (isRootSelected && includeDescendants) return output;
    if (!includeDescendants) return byAgent[selectedId] ?? '';
    return sliceTranscriptForAgents(output, subtreeIds);
  }, [output, byAgent, selectedId, isRootSelected, includeDescendants, subtreeIds]);

  // Track whether the user is pinned to the bottom; only auto-scroll if so.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const handleScroll = () => {
      const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
      shouldFollowRef.current = distanceFromBottom < 80;
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !shouldFollowRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [transcript]);

  // A different agent is a different document. Without this the new transcript
  // opens at the previous one's scrollTop — usually somewhere arbitrary in the
  // middle — and stays there, because the follow flag was left off by whatever
  // reading the user was doing before they clicked.
  useEffect(() => {
    shouldFollowRef.current = true;
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [selectedId, includeDescendants]);

  const selectChild = useCallback(
    (agentId: string) => select(path.length, agentId),
    [select, path.length]
  );

  if (isLoading && !output) {
    return <LoadingState message="Loading agent output..." />;
  }

  const selectedName = selectedNode?.name ?? MASTER_AGENT_NAME;
  const selectedDuration = selectedNode ? formatAgentDuration(selectedNode) : null;

  return (
    <div className="flex h-full flex-col" data-testid="agents-pane">
      <AgentChain
        tree={tree}
        rows={rows}
        path={path}
        onSelect={select}
        className="max-h-[40%] shrink-0 border-b"
      />

      {/* The spawn notice: what this run branched into, and a way straight in. */}
      <div
        data-testid="agent-spawn-notice"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-1.5 text-xs"
      >
        <span className="text-muted-foreground">
          {subagentCount === 0
            ? 'No sub-agents spawned — this run was a single agent.'
            : `Spawned ${subagentCount} sub-agent${subagentCount === 1 ? '' : 's'}.`}
        </span>

        {selectedChildren.length > 0 && (
          <span className="text-muted-foreground">From {selectedName}:</span>
        )}
        {selectedChildren.map((child) => (
          <button
            key={child.id}
            type="button"
            data-testid={`agent-spawn-chip-${child.id}`}
            onClick={() => selectChild(child.id)}
            className="flex max-w-52 items-center gap-1 rounded-full border bg-card/60 px-2 py-0.5 text-[11px] transition-colors hover:bg-accent"
            title={child.description ?? child.name}
          >
            <AgentStatusIcon node={child} className="size-3" />
            <span className="truncate">{child.description ?? child.name}</span>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant={includeDescendants ? 'secondary' : 'outline'}
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            aria-pressed={includeDescendants}
            data-testid="agents-include-descendants"
            onClick={() => setIncludeDescendants((previous) => !previous)}
          >
            <GitBranch className="size-3" />
            {includeDescendants ? 'Including sub-agents' : 'This agent only'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            data-testid="agents-refresh"
            onClick={refresh}
          >
            <RefreshCw className="size-3" />
            Refresh
          </Button>
        </div>
      </div>

      {selectedNode?.prompt && !isRootSelected && (
        <div className="max-h-24 shrink-0 overflow-y-auto border-b bg-muted/20 px-3 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Prompt {selectedDuration ? `· ran ${selectedDuration}` : ''}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-muted-foreground">
            {selectedNode.prompt}
          </p>
        </div>
      )}

      {error && output && (
        <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-1 text-[11px] text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {transcript ? (
          <LogViewer output={transcript} scrollContainerRef={scrollRef} />
        ) : (
          <EmptyTranscript
            isRootSelected={isRootSelected}
            isBackground={selectedNode?.background === true}
            error={error}
            onRefresh={refresh}
          />
        )}
      </div>

      {/* A sub-agent's tool_result is the only thing it ever "says", so it gets
          its own place rather than being lost at the tail of the timeline. */}
      {selectedNode?.result && !isRootSelected && (
        <div
          data-testid="agent-result"
          className="max-h-32 shrink-0 overflow-y-auto border-t bg-muted/20 px-3 py-1.5"
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {selectedNode.isError ? 'Returned an error' : 'Final answer'}
          </p>
          <p
            className={`mt-0.5 whitespace-pre-wrap text-[11px] ${
              selectedNode.isError ? 'text-destructive' : ''
            }`}
          >
            {selectedNode.result}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The honest empty state.
 *
 * A sub-agent with nothing to show is the normal case, not a fault: the Task
 * progress emitter forwards a child message only when it carries `tool_use` or
 * `tool_result` blocks, so a child that only reasoned is invisible, a depth-2
 * agent is invisible to us entirely, and a background Task returns immediately
 * and never streams. Saying "idle" or showing a spinner here would be a guess;
 * saying what is and is not observable is not.
 */
function EmptyTranscript({
  isRootSelected,
  isBackground,
  error,
  onRefresh,
}: {
  isRootSelected: boolean;
  isBackground: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
      data-testid="agents-empty"
    >
      <TerminalIcon className="size-8 text-muted-foreground/40" />
      <div className="max-w-md">
        <p className="text-sm font-medium">
          {isRootSelected ? 'No agent output yet' : 'No observable activity'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isRootSelected
            ? (error ?? 'Output appears here once an agent starts working on this feature.')
            : isBackground
              ? 'This sub-agent was launched in the background. It returns immediately and never streams, so nothing of its work reaches this transcript.'
              : 'Only a sub-agent’s tool calls and final result are ever forwarded — never its prose — so an agent that reasoned without calling a tool leaves nothing behind.'}
        </p>
      </div>
      {isRootSelected && (
        <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1.5">
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      )}
    </div>
  );
}
