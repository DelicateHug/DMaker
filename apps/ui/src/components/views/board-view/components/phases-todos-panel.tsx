/**
 * Where has this task actually got to?
 *
 * Three answers, in the order they go stale:
 *
 * 1. **Phases** — the plan's own tasks, grouped by the exact phase string the
 *    plan wrote. Status comes from `planSpecToTasks`, the one derivation of
 *    per-task status in the UI, because `planSpec.tasks[i].status` still reads
 *    'pending' for every feature written before the server began recording it.
 * 2. **Pipeline** — the project's custom steps. Real progress is read from
 *    `feature.pipelineProgress` when the run recorded it; older runs recorded
 *    nothing, so earlier steps are *deduced* from position and labelled as
 *    such rather than claimed as fact.
 * 3. **Live todos** — what the agent is telling itself to do, via TodoWrite.
 *    Read from the `auto_mode_tool` event rather than by polling the
 *    transcript: `getAgentOutput` returns megabytes for a long run and
 *    `parseAgentContext` walks the whole string. The transcript is read exactly
 *    once, to seed a task that is already finished or was opened mid-run.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Circle,
  FileCode,
  ListChecks,
  Loader2,
  RefreshCw,
  Workflow,
  XCircle,
} from 'lucide-react';
import type { PipelineStep, PipelineStepProgress } from '@dmaker/types';
import { Badge } from '@/components/ui/layout';
import { Button } from '@/components/ui/button';
import { getElectronAPI } from '@/lib/electron';
import { parseAgentContext, type AgentTaskInfo } from '@/lib/agent-context-parser';
import { groupTasksByPhase } from '@/lib/phase-grouping';
import { planSpecToTasks } from '@/components/ui/task-progress-panel';
import { useAppStore, type Feature } from '@/store/app-store';
import type { AutoModeEvent } from '@/types/electron';
import { cn } from '@/lib/utils';
import { createLogger } from '@dmaker/utils/logger';

const logger = createLogger('PhasesTodosPanel');

const PIPELINE_STATUS_PREFIX = 'pipeline_';

type LiveTodo = AgentTaskInfo['todos'][number];

export interface PhasesTodosPanelProps {
  projectPath: string;
  featureId: string;
  /** The feature as the board already has it; no fetch is made for it. */
  feature?: Feature | null;
  /**
   * Whether this surface is on screen. The workbench keeps every visited pane
   * mounted, so an ungated fetch would run for every hidden pane of every open
   * task. Defaults to true for callers that are always visible.
   */
  isActive?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Shared row glyph
// ---------------------------------------------------------------------------

type RowStatus = 'pending' | 'in_progress' | 'running' | 'completed' | 'failed';

function StatusGlyph({ status }: { status: RowStatus }) {
  if (status === 'completed') {
    return <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />;
  }
  if (status === 'failed') {
    return <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />;
  }
  if (status === 'in_progress' || status === 'running') {
    return <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-blue-500" />;
  }
  return <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />;
}

function SectionHeading({
  icon: Icon,
  title,
  count,
  action,
}: {
  icon: React.ElementType;
  title: string;
  count?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {count && <span className="text-xs tabular-nums text-muted-foreground/80">{count}</span>}
      <div className="ml-auto">{action}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline rows
// ---------------------------------------------------------------------------

interface PipelineRow {
  step: PipelineStep;
  status: Exclude<RowStatus, 'in_progress'>;
  /**
   * True when nothing recorded this outcome and it was deduced from the step's
   * position relative to the one the feature is parked on. Only ever true for
   * a 'completed' row.
   */
  inferred: boolean;
}

/**
 * Merges the recorded per-step progress with what the feature's own status
 * implies.
 *
 * The recorded entries win where they exist — they are written at both step
 * boundaries by the runner. Where they do not (any run predating that, and any
 * step of a pipeline that has since been edited) the only signal left is
 * `step.order < currentStep.order`, which holds solely for one uninterrupted
 * sequential run. That deduction is kept, and marked.
 */
function buildPipelineRows(
  steps: PipelineStep[],
  currentStepId: string | null,
  recorded: PipelineStepProgress[] | undefined
): PipelineRow[] {
  const recordedById = new Map<string, PipelineStepProgress>();
  for (const entry of recorded ?? []) {
    if (entry?.stepId) recordedById.set(entry.stepId, entry);
  }

  const currentIndex = currentStepId ? steps.findIndex((step) => step.id === currentStepId) : -1;

  return steps.map((step, index) => {
    const isCurrent = index >= 0 && index === currentIndex;
    const entry = recordedById.get(step.id);

    // A recorded 'pending' on the step the feature is parked on means the
    // record predates this run reaching it; the status is the fresher fact.
    if (entry && !(entry.status === 'pending' && isCurrent)) {
      return { step, status: entry.status, inferred: false };
    }
    if (isCurrent) return { step, status: 'running', inferred: false };
    if (currentIndex >= 0 && index < currentIndex) {
      return { step, status: 'completed', inferred: true };
    }
    return { step, status: 'pending', inferred: false };
  });
}

// ---------------------------------------------------------------------------
// TodoWrite payload
// ---------------------------------------------------------------------------

const TODO_STATUSES = new Set<LiveTodo['status']>(['pending', 'in_progress', 'completed']);

/**
 * Reads a TodoWrite call's `todos` array off an `auto_mode_tool` event.
 *
 * TodoWrite always sends the whole list, so a successful read replaces what is
 * on screen rather than merging into it — including an empty list, which is the
 * agent clearing its todos. Anything that is not a todo list returns null and
 * changes nothing.
 */
function readTodoWriteInput(input: unknown): LiveTodo[] | null {
  if (!input || typeof input !== 'object') return null;
  const todos = (input as { todos?: unknown }).todos;
  if (!Array.isArray(todos)) return null;

  const rows: LiveTodo[] = [];
  for (const item of todos) {
    if (!item || typeof item !== 'object') continue;
    const { content, status, activeForm } = item as {
      content?: unknown;
      status?: unknown;
      activeForm?: unknown;
    };
    if (typeof content !== 'string' || typeof status !== 'string') continue;
    rows.push({
      content,
      status: TODO_STATUSES.has(status as LiveTodo['status'])
        ? (status as LiveTodo['status'])
        : 'pending',
      activeForm: typeof activeForm === 'string' ? activeForm : undefined,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function PhasesTodosPanel({
  projectPath,
  featureId,
  feature,
  isActive = true,
  className,
}: PhasesTodosPanelProps) {
  const planSpec = feature?.planSpec;

  const { tasks: planTasks, currentTaskId } = useMemo(() => planSpecToTasks(planSpec), [planSpec]);
  const phaseGroups = useMemo(() => groupTasksByPhase(planTasks), [planTasks]);
  const completedTaskCount = planTasks.filter((task) => task.status === 'completed').length;

  const pipelineSteps = useAppStore((state) => state.pipelineConfigByProject[projectPath]?.steps);
  const sortedSteps = useMemo(
    () => [...(pipelineSteps ?? [])].sort((a, b) => a.order - b.order),
    [pipelineSteps]
  );

  const featureStatus = typeof feature?.status === 'string' ? feature.status : '';
  const currentStepId = featureStatus.startsWith(PIPELINE_STATUS_PREFIX)
    ? featureStatus.slice(PIPELINE_STATUS_PREFIX.length)
    : null;

  const pipelineRows = useMemo(
    () => buildPipelineRows(sortedSteps, currentStepId, feature?.pipelineProgress),
    [sortedSteps, currentStepId, feature?.pipelineProgress]
  );
  const hasInferredStep = pipelineRows.some((row) => row.inferred);

  const [todos, setTodos] = useState<LiveTodo[]>([]);
  const [isLoadingTodos, setIsLoadingTodos] = useState(false);
  /** Key of the transcript already read, so becoming visible again is free. */
  const loadedKeyRef = useRef<string | null>(null);
  /** A live TodoWrite has landed; a late transcript read must not overwrite it. */
  const hasLiveTodosRef = useRef(false);

  const planTaskCount = planTasks.length;

  const loadTodos = useCallback(
    async (force = false) => {
      if (!projectPath || !featureId) return;
      const key = `${projectPath}::${featureId}`;
      if (!force && loadedKeyRef.current === key) return;
      loadedKeyRef.current = key;

      setIsLoadingTodos(true);
      try {
        const api = getElectronAPI();
        const result = await api.features?.getAgentOutput(projectPath, featureId);
        const content = result?.success ? (result.content ?? '') : '';
        // The markdown scrape reads every `- [ ]` in the transcript, the plan's
        // own task fence included, so it is suppressed whenever the Phases
        // section above is already showing that list.
        const parsed = content
          ? parseAgentContext(content, { suppressMarkdownTodoFallback: planTaskCount > 0 })
          : null;
        setTodos((previous) => (hasLiveTodosRef.current ? previous : (parsed?.todos ?? [])));
      } catch (error) {
        logger.error('Failed to read todos from the transcript:', error);
      } finally {
        setIsLoadingTodos(false);
      }
    },
    [projectPath, featureId, planTaskCount]
  );

  useEffect(() => {
    loadedKeyRef.current = null;
    hasLiveTodosRef.current = false;
    setTodos([]);
  }, [projectPath, featureId]);

  useEffect(() => {
    if (!isActive) return;
    void loadTodos();
  }, [isActive, loadTodos]);

  // Live TodoWrite calls. Deliberately not gated on `isActive`: the event is
  // the only place this data exists, and a pane that ignored it while hidden
  // would show a stale list the moment it was opened.
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.autoMode) return;

    return api.autoMode.onEvent((event: AutoModeEvent) => {
      if (!('featureId' in event) || event.featureId !== featureId) return;
      if (event.type !== 'auto_mode_tool' || event.tool !== 'TodoWrite') return;

      const next = readTodoWriteInput(event.input);
      if (!next) return;
      hasLiveTodosRef.current = true;
      setTodos(next);
    });
  }, [featureId]);

  const showPhases = !!planSpec;
  const showPipeline = sortedSteps.length > 0;
  // Gated on content alone, not on the in-flight read. Counting the read would
  // put a "Live todos" heading and a spinner on screen for a task that has
  // none, then take the whole section away again once it resolved empty.
  const showTodos = todos.length > 0;

  if (!showPhases && !showPipeline && !showTodos) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center py-12 text-center text-muted-foreground',
          className
        )}
        data-testid="phases-todos-panel"
      >
        <ListChecks className="mb-3 size-10 opacity-40" data-testid="phases-empty" />
        <p className="text-sm">Nothing planned yet.</p>
        <p className="mt-1 text-xs opacity-80">
          Phases appear once a plan is generated. Pipeline steps and the agent&apos;s own todos fill
          in while it works.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 h-7 gap-1.5 text-xs"
          disabled={isLoadingTodos}
          onClick={() => void loadTodos(true)}
          data-testid="live-todos-refresh"
        >
          <RefreshCw className={cn('size-3', isLoadingTodos && 'animate-spin')} />
          {isLoadingTodos ? 'Reading the transcript…' : 'Check again'}
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('space-y-5', className)} data-testid="phases-todos-panel">
      {showPhases && (
        <section className="space-y-2" data-testid="phases-section">
          <SectionHeading
            icon={ListChecks}
            title="Phases"
            count={planTasks.length > 0 ? `${completedTaskCount}/${planTasks.length}` : undefined}
          />

          {planTasks.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {planSpec?.content?.trim()
                ? 'This plan carries no machine-readable task list — lite planning writes a numbered list rather than a task fence, and the agent implements it inline. Its progress shows up under Live todos.'
                : 'The plan has not been generated yet.'}
            </p>
          ) : (
            <div className="space-y-3">
              {phaseGroups.map((group) => (
                <div key={group.key} className="space-y-1" data-testid={`phase-group-${group.key}`}>
                  <p className="text-xs font-medium text-foreground/80">{group.label}</p>
                  <ul className="space-y-1">
                    {group.tasks.map((task) => (
                      <li
                        key={task.id}
                        className={cn(
                          'flex items-start gap-2 rounded-md px-2 py-1 text-xs',
                          task.id === currentTaskId && 'bg-blue-500/5'
                        )}
                        data-testid={`phase-task-${task.id}`}
                        data-status={task.status}
                      >
                        <StatusGlyph status={task.status} />
                        <div className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'leading-relaxed',
                              task.status === 'completed' && 'text-muted-foreground'
                            )}
                          >
                            {task.description}
                          </span>
                          {task.filePath && (
                            <span className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                              <FileCode className="size-3 shrink-0" />
                              <span className="truncate">{task.filePath}</span>
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {showPipeline && (
        <section className="space-y-2" data-testid="pipeline-section">
          <SectionHeading icon={Workflow} title="Pipeline" />
          <ul className="space-y-1">
            {pipelineRows.map((row) => (
              <li
                key={row.step.id}
                className="flex items-start gap-2 rounded-md px-2 py-1 text-xs"
                data-testid={`pipeline-step-${row.step.id}`}
                data-status={row.status}
                data-inferred={row.inferred ? 'true' : 'false'}
              >
                <StatusGlyph status={row.status} />
                <span
                  className={cn(
                    'min-w-0 flex-1 leading-relaxed',
                    row.status === 'completed' && 'text-muted-foreground'
                  )}
                >
                  {row.step.name}
                </span>
                {row.inferred && (
                  <Badge
                    variant="outline"
                    className="h-4 shrink-0 px-1 text-[10px] font-normal text-muted-foreground"
                    title="Deduced from this step's position — this run recorded no completion for it."
                  >
                    inferred
                  </Badge>
                )}
              </li>
            ))}
          </ul>
          {hasInferredStep && (
            <p className="text-[10px] leading-relaxed text-muted-foreground/80">
              Steps before the current one are shown as done because they come earlier, not because
              anything recorded them finishing.
            </p>
          )}
        </section>
      )}

      {showTodos && (
        <section className="space-y-2" data-testid="live-todos-section">
          <SectionHeading
            icon={ListChecks}
            title="Live todos"
            count={`${todos.filter((todo) => todo.status === 'completed').length}/${todos.length}`}
            action={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px] text-muted-foreground"
                disabled={isLoadingTodos}
                onClick={() => void loadTodos(true)}
                title="Re-read the transcript"
                data-testid="live-todos-refresh"
              >
                <RefreshCw className={cn('size-3', isLoadingTodos && 'animate-spin')} />
              </Button>
            }
          />
          <ul className="space-y-1">
            {todos.map((todo, index) => (
              <li
                key={`${index}-${todo.content}`}
                className="flex items-start gap-2 rounded-md px-2 py-1 text-xs"
                data-testid={`live-todo-${index}`}
                data-status={todo.status}
              >
                <StatusGlyph status={todo.status} />
                <span
                  className={cn(
                    'min-w-0 flex-1 leading-relaxed',
                    todo.status === 'completed' && 'text-muted-foreground'
                  )}
                >
                  {todo.status === 'in_progress' ? (todo.activeForm ?? todo.content) : todo.content}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
