/**
 * Runner popover — what the task runner daemon is doing, and how hard to push it.
 *
 * The environment bar used to show the runner as a coloured dot with a tooltip
 * saying only "attached" or "not reachable". That answers whether work would
 * survive an Update Prod, but not the question actually being asked at a
 * glance: *what is it working on right now, and is it saturated?*
 *
 * Clicking the dot opens this. It reads `GET /api/running-agents`, which prod
 * proxies straight to the runner, so the list is the runner's own view of its
 * in-flight work rather than something inferred from feature files on disk.
 * Each row opens that task in the centre. The max-agents control writes the
 * same global setting as the board and Settings sliders.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, ExternalLink, Loader2 } from 'lucide-react';
import { MAX_CONCURRENT_AGENTS } from '@dmaker/types';
import { Input, Label, Slider } from '@/components/ui/forms';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays';
import { ScrollArea } from '@/components/ui/layout';
import { useAppStore } from '@/store/app-store';
import { openFeatureTab } from '@/store/center-store';
import { fetchRunnerAgents, type EnvironmentInfo, type RunnerAgent } from '@/lib/environment-api';

/** How often the agent list refreshes — only ever while the popover is open. */
const POLL_INTERVAL_MS = 5000;

/**
 * Max-agents control: a slider for coarse moves and a box for typing an exact
 * number. The box is a plain text input rather than `type="number"` so a
 * half-typed value ("1" on the way to "15") doesn't get clamped out from under
 * the cursor; it is parsed and clamped on blur.
 */
function MaxAgentsControl({ running }: { running: number }) {
  const agentMultiplier = useAppStore((state) => state.agentMultiplier);
  const setAgentMultiplier = useAppStore((state) => state.setAgentMultiplier);
  const [draft, setDraft] = useState(String(agentMultiplier));

  // Follow the store when it changes elsewhere (another slider, settings sync).
  useEffect(() => {
    setDraft(String(agentMultiplier));
  }, [agentMultiplier]);

  const commitDraft = useCallback(() => {
    const parsed = Number.parseInt(draft, 10);
    if (Number.isNaN(parsed)) {
      setDraft(String(agentMultiplier));
      return;
    }
    const clamped = Math.min(MAX_CONCURRENT_AGENTS, Math.max(1, parsed));
    setAgentMultiplier(clamped);
    setDraft(String(clamped));
  }, [draft, agentMultiplier, setAgentMultiplier]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Bot className="size-3.5 shrink-0 text-brand-500" />
        <Label className="text-xs font-medium">Max runners</Label>
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {running}/{agentMultiplier} busy
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Slider
          value={[Math.min(agentMultiplier, MAX_CONCURRENT_AGENTS)]}
          onValueChange={(value) => setAgentMultiplier(value[0])}
          min={1}
          max={MAX_CONCURRENT_AGENTS}
          step={1}
          className="flex-1"
          data-testid="runner-max-agents-slider"
        />
        <Input
          value={draft}
          inputMode="numeric"
          aria-label={`Max runners, 1 to ${MAX_CONCURRENT_AGENTS}`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          className="h-7 w-14 px-2 text-center text-xs tabular-nums"
          data-testid="runner-max-agents-input"
        />
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Concurrent agents across all projects, up to {MAX_CONCURRENT_AGENTS}. Runners take the tasks
        whose dependencies are all complete first, oldest before newest.
      </p>
    </div>
  );
}

/** One in-flight task. Clicking it opens the task in the centre. */
function AgentRow({ agent, onOpen }: { agent: RunnerAgent; onOpen: (a: RunnerAgent) => void }) {
  const hasProgress = agent.tasksTotal !== undefined && agent.tasksTotal > 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(agent)}
      className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60"
      data-testid="runner-agent-row"
    >
      <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin text-emerald-500" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate text-xs font-medium group-hover:underline">
            {agent.title || agent.featureId}
          </span>
          <ExternalLink className="size-2.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="truncate">{agent.projectName}</span>
          {hasProgress && (
            <span className="shrink-0 tabular-nums">
              {agent.tasksCompleted ?? 0}/{agent.tasksTotal}
            </span>
          )}
          {agent.isAutoMode && <span className="shrink-0">auto</span>}
        </span>
      </span>
    </button>
  );
}

export function RunnerPopover({ info }: { info: EnvironmentInfo }) {
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<RunnerAgent[] | null>(null);
  const projects = useAppStore((state) => state.projects);
  const setCurrentProject = useAppStore((state) => state.setCurrentProject);
  const setShowAllProjects = useAppStore((state) => state.setShowAllProjects);

  const connected = info.runner.connected;

  // Only poll while the popover is on screen — the dot itself already tracks
  // connection state from the bar's own environment poll.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = () => {
      void fetchRunnerAgents().then((next) => {
        if (!cancelled) setAgents(next);
      });
    };

    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open]);

  const runningCount = agents?.length ?? 0;

  const handleOpenAgent = useCallback(
    (agent: RunnerAgent) => {
      const project = projects.find((p) => p.path === agent.projectPath);
      if (project) {
        setShowAllProjects(false);
        setCurrentProject(project);
      }
      openFeatureTab(agent.featureId);
      setOpen(false);
    },
    [projects, setCurrentProject, setShowAllProjects]
  );

  const body = useMemo(() => {
    if (agents === null) {
      return (
        <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">
          {connected ? 'Loading…' : 'Runner is not reachable.'}
        </p>
      );
    }
    if (agents.length === 0) {
      return (
        <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">
          Nothing running — the runner is idle.
        </p>
      );
    }
    return (
      <ScrollArea className="max-h-56">
        <div className="space-y-0.5">
          {agents.map((agent) => (
            <AgentRow key={agent.featureId} agent={agent} onOpen={handleOpenAgent} />
          ))}
        </div>
      </ScrollArea>
    );
  }, [agents, connected, handleOpenAgent]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          data-testid="runner-status"
        >
          <span
            className={`size-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`}
          />
          runner
          {runningCount > 0 && <span className="tabular-nums">· {runningCount}</span>}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80" data-testid="runner-popover">
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium">Task runner</h4>
              <span
                className={`ml-auto text-[10px] font-semibold uppercase tracking-wide ${
                  connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                }`}
              >
                {connected ? 'attached' : 'offline'}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[10px] break-all text-muted-foreground">
              {info.runner.url}
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              {connected
                ? 'Tasks run in a separate process, so restarting this server does not stop them.'
                : 'Not reachable — tasks would run in this server instead, and an Update Prod would take them with it.'}
            </p>
          </div>

          <div className="rounded-md bg-secondary/50 p-2">
            <MaxAgentsControl running={runningCount} />
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-medium">Working on</span>
              {agents !== null && (
                <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                  {agents.length}
                </span>
              )}
            </div>
            {body}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
