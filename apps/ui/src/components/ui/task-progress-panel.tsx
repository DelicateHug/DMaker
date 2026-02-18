'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { cn } from '@/lib/utils';

const logger = createLogger('TaskProgressPanel');
import { Check, Loader2, Circle, ChevronDown, ChevronRight, FileCode } from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import type { AutoModeEvent } from '@/types/electron';
import { Badge } from '@/components/ui/badge';
import { parseAgentContext } from '@/lib/agent-context-parser';

interface TaskInfo {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  filePath?: string;
  phase?: string;
}

interface TaskProgressPanelProps {
  featureId: string;
  projectPath?: string;
  className?: string;
  /** Whether the panel starts expanded (default: true) */
  defaultExpanded?: boolean;
  /** Remove internal max-height constraint for full-page display */
  fullHeight?: boolean;
  /** Optional feature data from the store to display tasks immediately without waiting for API */
  initialFeature?: {
    planSpec?: {
      tasks?: Array<{
        id: string;
        description: string;
        filePath?: string;
        phase?: string;
        status: string;
      }>;
      tasksCompleted?: number;
      currentTaskId?: string;
    };
  };
}

/**
 * Converts planSpec data to TaskInfo array with proper status assignment.
 */
function planSpecToTasks(
  planSpec: NonNullable<TaskProgressPanelProps['initialFeature']>['planSpec']
): { tasks: TaskInfo[]; currentTaskId: string | null } {
  if (!planSpec?.tasks || planSpec.tasks.length === 0) {
    return { tasks: [], currentTaskId: null };
  }

  const currentId = planSpec.currentTaskId;
  const completedCount = planSpec.tasksCompleted || 0;

  const tasks: TaskInfo[] = planSpec.tasks.map((t, index) => ({
    id: t.id,
    description: t.description,
    filePath: t.filePath,
    phase: t.phase,
    status:
      index < completedCount
        ? ('completed' as const)
        : t.id === currentId
          ? ('in_progress' as const)
          : ('pending' as const),
  }));

  return { tasks, currentTaskId: currentId || null };
}

export function TaskProgressPanel({
  featureId,
  projectPath,
  className,
  defaultExpanded = true,
  fullHeight = false,
  initialFeature,
}: TaskProgressPanelProps) {
  // Seed tasks from initialFeature prop if available (instant display from store data)
  const initialData = initialFeature?.planSpec?.tasks?.length
    ? planSpecToTasks(initialFeature.planSpec)
    : { tasks: [], currentTaskId: null };

  const [tasks, setTasks] = useState<TaskInfo[]>(initialData.tasks);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isLoading, setIsLoading] = useState(initialData.tasks.length === 0);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(initialData.currentTaskId);
  // Track whether we have tasks to avoid showing loading spinner when we already have data
  const hasTasksRef = useRef(initialData.tasks.length > 0);

  // Update tasks if initialFeature prop changes (e.g. store data updates)
  useEffect(() => {
    if (initialFeature?.planSpec?.tasks?.length) {
      const data = planSpecToTasks(initialFeature.planSpec);
      if (!hasTasksRef.current) {
        setTasks(data.tasks);
        setCurrentTaskId(data.currentTaskId);
        setIsLoading(false);
        hasTasksRef.current = true;
      }
    }
  }, [
    initialFeature?.planSpec?.tasks,
    initialFeature?.planSpec?.tasksCompleted,
    initialFeature?.planSpec?.currentTaskId,
  ]);

  // Load initial tasks from feature's planSpec, with fallback to agent-output.md todos
  const loadInitialTasks = useCallback(async () => {
    if (!projectPath) {
      // If we already have tasks from initialFeature, keep showing them
      // Otherwise show the "no plan" message
      if (!hasTasksRef.current) {
        setIsLoading(false);
      }
      return;
    }

    // Only show loading indicator if we don't already have tasks to display
    if (!hasTasksRef.current) {
      setIsLoading(true);
    }

    try {
      const api = getElectronAPI();
      if (!api?.features) {
        setIsLoading(false);
        return;
      }

      const result = await api.features.get(projectPath, featureId);
      const feature: any = (result as any).feature;
      if (result.success && feature?.planSpec?.tasks && feature.planSpec.tasks.length > 0) {
        const data = planSpecToTasks(feature.planSpec);
        setTasks(data.tasks);
        setCurrentTaskId(data.currentTaskId);
        hasTasksRef.current = true;
      } else {
        // Fallback: parse todos from agent-output.md (same approach as AgentInfoPanel)
        try {
          const outputResult = await api.features.getAgentOutput(projectPath, featureId);
          if (outputResult.success && outputResult.content) {
            const agentInfo = parseAgentContext(outputResult.content);
            if (agentInfo.todos && agentInfo.todos.length > 0) {
              const fallbackTasks: TaskInfo[] = agentInfo.todos.map((todo, index) => ({
                id: `todo-${index}`,
                description: todo.content,
                status: todo.status,
              }));
              setTasks(fallbackTasks);
              hasTasksRef.current = true;
            }
          }
        } catch {
          logger.debug('No agent output available for fallback tasks');
        }
      }
    } catch (error) {
      logger.error('Failed to load initial tasks:', error);
    } finally {
      setIsLoading(false);
    }
  }, [featureId, projectPath]);

  // Load initial state on mount
  useEffect(() => {
    loadInitialTasks();
  }, [loadInitialTasks]);

  // Listen to task events for real-time updates
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.autoMode) return;

    const unsubscribe = api.autoMode.onEvent((event: AutoModeEvent) => {
      // Only handle events for this feature
      if (!('featureId' in event) || event.featureId !== featureId) return;

      switch (event.type) {
        case 'auto_mode_task_started':
          if ('taskId' in event && 'taskDescription' in event) {
            const taskEvent = event as Extract<AutoModeEvent, { type: 'auto_mode_task_started' }>;
            setCurrentTaskId(taskEvent.taskId);

            setTasks((prev) => {
              // Check if task already exists
              const existingIndex = prev.findIndex((t) => t.id === taskEvent.taskId);

              if (existingIndex !== -1) {
                // Update status to in_progress and mark previous as completed
                return prev.map((t, idx) => {
                  if (t.id === taskEvent.taskId) {
                    return { ...t, status: 'in_progress' as const };
                  }
                  // If we are moving to a task that is further down the list, assume previous ones are completed
                  // This is a heuristic, but usually correct for sequential execution
                  if (idx < existingIndex && t.status !== 'completed') {
                    return { ...t, status: 'completed' as const };
                  }
                  return t;
                });
              }

              // Add new task if it doesn't exist (fallback)
              return [
                ...prev,
                {
                  id: taskEvent.taskId,
                  description: taskEvent.taskDescription,
                  status: 'in_progress' as const,
                },
              ];
            });
          }
          break;

        case 'auto_mode_task_complete':
          if ('taskId' in event) {
            const taskEvent = event as Extract<AutoModeEvent, { type: 'auto_mode_task_complete' }>;
            setTasks((prev) =>
              prev.map((t) =>
                t.id === taskEvent.taskId ? { ...t, status: 'completed' as const } : t
              )
            );
            setCurrentTaskId(null);
          }
          break;
      }
    });

    return unsubscribe;
  }, [featureId]);

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const totalCount = tasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (isLoading || tasks.length === 0) {
    if (fullHeight) {
      return (
        <div
          className={cn(
            'flex items-center justify-center h-32 text-muted-foreground text-sm',
            className
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading execution plan...
            </>
          ) : (
            'No execution plan available yet.'
          )}
        </div>
      );
    }
    return null;
  }

  return (
    <div
      className={cn(
        'group rounded-lg border bg-card/50 shadow-sm overflow-hidden transition-all duration-200',
        className
      )}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/10 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg border shadow-sm transition-colors',
              isExpanded ? 'bg-background border-border' : 'bg-muted border-transparent'
            )}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-foreground/70" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-col items-start gap-0.5">
            <h3 className="font-semibold text-sm tracking-tight">Execution Plan</h3>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              {completedCount} of {totalCount} tasks completed
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Circular Progress (Mini) */}
          <div className="relative h-8 w-8 flex items-center justify-center">
            <svg className="h-full w-full -rotate-90 text-muted/20" viewBox="0 0 24 24">
              <circle
                className="text-muted/20"
                cx="12"
                cy="12"
                r="10"
                strokeWidth="3"
                fill="none"
                stroke="currentColor"
              />
              <circle
                className="text-primary transition-all duration-500 ease-in-out"
                cx="12"
                cy="12"
                r="10"
                strokeWidth="3"
                fill="none"
                stroke="currentColor"
                strokeDasharray={63}
                strokeDashoffset={63 - (63 * progressPercent) / 100}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-[9px] font-bold">{progressPercent}%</span>
          </div>
        </div>
      </button>

      <div
        className={cn(
          'grid transition-all duration-300 ease-in-out',
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              'p-4 pt-2 relative overflow-y-auto scrollbar-visible',
              !fullHeight && 'max-h-[200px]'
            )}
          >
            {/* Vertical Connector Line */}
            <div className="absolute left-[2.35rem] top-4 bottom-8 w-px bg-linear-to-b from-border/80 via-border/40 to-transparent" />

            <div className="space-y-5">
              {tasks.map((task, index) => {
                const isActive = task.status === 'in_progress';
                const isCompleted = task.status === 'completed';
                const isPending = task.status === 'pending';

                return (
                  <div
                    key={task.id}
                    className={cn(
                      'relative flex gap-4 group/item transition-all duration-300',
                      isPending && 'opacity-60 hover:opacity-100'
                    )}
                  >
                    {/* Icon Status */}
                    <div
                      className={cn(
                        'relative z-10 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm transition-all duration-300',
                        isCompleted &&
                          'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400',
                        isActive &&
                          'bg-primary border-primary text-primary-foreground ring-4 ring-primary/10 scale-110',
                        isPending && 'bg-muted border-border text-muted-foreground'
                      )}
                    >
                      {isCompleted && <Check className="h-3.5 w-3.5" />}
                      {isActive && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {isPending && <Circle className="h-2 w-2 fill-current opacity-50" />}
                    </div>

                    {/* Task Content */}
                    <div
                      className={cn(
                        'flex-1 pt-1 min-w-0 transition-all',
                        isActive && 'translate-x-1'
                      )}
                    >
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-4">
                          <p
                            className={cn(
                              'text-sm font-medium leading-none truncate pr-4',
                              isCompleted &&
                                'text-muted-foreground line-through decoration-border/60',
                              isActive && 'text-primary font-semibold'
                            )}
                          >
                            {task.description}
                          </p>
                          {isActive && (
                            <Badge
                              variant="outline"
                              className="h-5 px-1.5 text-[10px] bg-primary/5 text-primary border-primary/20 animate-pulse"
                            >
                              Active
                            </Badge>
                          )}
                        </div>

                        {(task.filePath || isActive) && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                            {task.filePath ? (
                              <>
                                <FileCode className="h-3 w-3 opacity-70" />
                                <span className="truncate opacity-80 hover:opacity-100 transition-opacity">
                                  {task.filePath}
                                </span>
                              </>
                            ) : (
                              <span className="h-3 block" /> /* Spacer */
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
