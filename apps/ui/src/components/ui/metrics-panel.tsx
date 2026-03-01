import type { ExecutionMetrics } from '@dmaker/types';

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
