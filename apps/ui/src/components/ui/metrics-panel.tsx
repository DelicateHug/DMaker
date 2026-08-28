import type { AgentNodeStatus, ExecutionMetrics, SubagentSummary } from '@dmaker/types';

interface MetricsPanelProps {
  metrics: ExecutionMetrics | null;
  isRunning?: boolean;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function formatCost(n: number): string {
  return `$${n.toFixed(4)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

const SUBAGENT_STATUS_CLASS: Record<AgentNodeStatus, string> = {
  running: 'bg-[var(--status-info)]/15 text-[var(--status-info)]',
  completed: 'bg-[var(--status-success)]/15 text-[var(--status-success)]',
  failed: 'bg-[var(--status-error)]/15 text-[var(--status-error)]',
  aborted: 'bg-[var(--status-warning)]/15 text-[var(--status-warning)]',
};

/**
 * Wall-clock duration of one sub-agent.
 *
 * `SubagentSummary` records `startedAt`/`endedAt`, not a duration, because the
 * roll-up is written from the same node the live tree uses. A node with no
 * `endedAt` never got its `tool_result` — a background Task, or a run that was
 * stopped mid-flight — so there is genuinely no duration to show.
 */
function subagentDuration(sub: SubagentSummary): string {
  if (!sub.endedAt) return '—';
  const ms = new Date(sub.endedAt).getTime() - new Date(sub.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  return formatDuration(ms);
}

/**
 * Per-sub-agent roll-up, rendered beneath the Subagents Spawned count.
 *
 * Two facts drive the shape of this, and both are SDK limits rather than
 * choices:
 *
 * 1. **There is deliberately no per-agent cost or token column.**
 *    `SDKResultMessage` carries no `parent_tool_use_id`, so all usage is
 *    whole-run and cannot be attributed to a child. Duration and tool-call
 *    counts are computable; cost is not. Do not add one.
 * 2. **`metrics.subagents` is written on the success path only.** A run that
 *    errored or was stopped saves its metrics without ever reaching the
 *    teardown that calls `toSummaries()`. So `undefined` means "no roll-up was
 *    recorded", NOT "no sub-agents ran" — say so rather than implying a
 *    single-agent run, which would be a lie on exactly the runs a user is most
 *    likely to be investigating.
 */
function SubagentRollup({ metrics }: { metrics: ExecutionMetrics }) {
  const subagents = metrics.subagents;

  if (subagents === undefined) {
    // Nothing was recorded. Only worth a line when we know something ran —
    // `subagentsSpawned` counts every Task block at any depth, so a zero there
    // really is a single-agent run and needs no explanation.
    if (metrics.subagentsSpawned <= 0) return null;
    return (
      <p className="text-xs text-muted-foreground mt-2" data-testid="metrics-subagents-unavailable">
        Per-agent breakdown not recorded for this run — it is saved when a run finishes, so a run
        that errored or was stopped has none.
      </p>
    );
  }

  if (subagents.length === 0) return null;

  return (
    <div className="space-y-1.5 mt-2" data-testid="metrics-subagents">
      {subagents.map((sub) => (
        <div
          key={sub.agentId}
          className="flex items-center justify-between gap-3 text-sm p-2.5 rounded-lg bg-muted/30 border border-border/30"
          data-testid="metrics-subagent-row"
          data-agent-id={sub.agentId}
          data-agent-status={sub.status}
        >
          {/* Depth 1 is a direct child of Master; deeper nodes are indented one
              em per level so the chain shape reads without drawing a tree here
              — the Agents pane owns that view. */}
          <div
            className="min-w-0 flex items-center gap-2"
            style={{ paddingLeft: `${Math.max(0, sub.depth - 1)}em` }}
          >
            <span className="font-mono text-xs truncate">{sub.name}</span>
            {sub.description && (
              <span className="text-xs text-muted-foreground truncate">{sub.description}</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs shrink-0">
            <span className="text-muted-foreground">
              {sub.toolCallCount} {sub.toolCallCount === 1 ? 'tool call' : 'tool calls'}
            </span>
            <span className="text-muted-foreground tabular-nums">{subagentDuration(sub)}</span>
            <span className={`px-2 py-0.5 rounded-full ${SUBAGENT_STATUS_CLASS[sub.status]}`}>
              {sub.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="p-3 rounded-lg bg-muted/50 border border-border/40">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${highlight ? 'text-primary' : ''}`}>
        {value}
      </div>
    </div>
  );
}

export function MetricsPanel({ metrics, isRunning }: MetricsPanelProps) {
  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No metrics available{isRunning ? ' yet' : ''}
      </div>
    );
  }

  const modelEntries = Object.entries(metrics.modelUsage);

  return (
    <div className="space-y-4 p-4 overflow-y-auto">
      {/* Token Usage */}
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
          Token Usage
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <MetricCard label="Input" value={formatTokens(metrics.inputTokens)} />
          <MetricCard label="Output" value={formatTokens(metrics.outputTokens)} />
          <MetricCard label="Cache Read" value={formatTokens(metrics.cacheReadInputTokens)} />
          <MetricCard label="Cache Write" value={formatTokens(metrics.cacheCreationInputTokens)} />
        </div>
      </div>

      {/* Cost & Performance */}
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
          Cost & Performance
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <MetricCard label="Total Cost" value={formatCost(metrics.totalCostUSD)} highlight />
          <MetricCard label="Turns" value={metrics.numTurns.toString()} />
          <MetricCard label="Duration" value={formatDuration(metrics.durationMs)} />
          <MetricCard label="API Time" value={formatDuration(metrics.durationApiMs)} />
          {metrics.authMethod && metrics.authMethod !== 'unknown' && (
            <MetricCard
              label="Account"
              value={metrics.authMethod === 'api_key' ? 'API Key' : 'Subscription'}
            />
          )}
        </div>
      </div>

      {/* Skills & Subagents */}
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
          Skills & Subagents
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-lg bg-muted/50 border border-border/40">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
              Skills Used
            </div>
            {metrics.skillsUsed.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {metrics.skillsUsed.map((s) => (
                  <span
                    key={s}
                    className="px-2 py-0.5 text-xs rounded-full bg-primary/15 text-primary font-medium"
                  >
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground mt-0.5 block">None</span>
            )}
          </div>
          <div className="p-3 rounded-lg bg-muted/50 border border-border/40">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
              Subagents Spawned
            </div>
            <div className="text-lg font-semibold mt-0.5">{metrics.subagentsSpawned}</div>
          </div>
        </div>
        <SubagentRollup metrics={metrics} />
      </div>

      {/* Skills & Agents Loaded */}
      {(metrics.skillsLoaded.length > 0 || metrics.agentsLoaded.length > 0) && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
            Available Resources
          </div>
          <div className="grid grid-cols-2 gap-2">
            {metrics.skillsLoaded.length > 0 && (
              <div className="p-3 rounded-lg bg-muted/50 border border-border/40">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">
                  Skills Loaded
                </div>
                <div className="flex flex-wrap gap-1">
                  {metrics.skillsLoaded.map((s) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {metrics.agentsLoaded.length > 0 && (
              <div className="p-3 rounded-lg bg-muted/50 border border-border/40">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">
                  Agents Loaded
                </div>
                <div className="flex flex-wrap gap-1">
                  {metrics.agentsLoaded.map((a) => (
                    <span
                      key={a}
                      className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Per-model breakdown */}
      {modelEntries.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
            Model Breakdown
          </div>
          <div className="space-y-1.5">
            {modelEntries.map(([model, usage]) => (
              <div
                key={model}
                className="flex items-center justify-between text-sm p-2.5 rounded-lg bg-muted/30 border border-border/30"
              >
                <span className="font-mono text-xs text-muted-foreground">{model}</span>
                <div className="flex gap-3 text-xs">
                  <span>
                    {formatTokens(usage.inputTokens + usage.outputTokens)}{' '}
                    <span className="text-muted-foreground">tokens</span>
                  </span>
                  <span className="text-primary font-medium">{formatCost(usage.costUSD)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
