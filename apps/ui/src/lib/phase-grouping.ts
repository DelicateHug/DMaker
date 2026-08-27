/**
 * Phase grouping for plan tasks.
 *
 * Groups by the exact phase string the plan wrote, in first-seen order, and
 * never parses a number out of it. The server shows why: the per-task phase
 * path in auto-mode-service.ts gates its completion event on
 * `/Phase\s*(\d+)/i`, so a plan whose phases are named ("Foundation") rather
 * than numbered emits no phase-completion event at all. A UI that re-derives a
 * phase's identity from a digit reproduces that bug on screen.
 */

/** Heading for tasks that carry no phase at all. */
export const UNGROUPED_PHASE_LABEL = 'Ungrouped';

/** Key of the bucket holding tasks with no phase. */
const UNGROUPED_PHASE_KEY = 'ungrouped';

export interface PhaseGroup<T> {
  /** The phase string exactly as the plan wrote it; undefined for the ungrouped bucket. */
  phase?: string;
  /** What to render as the heading: `phase`, or UNGROUPED_PHASE_LABEL. */
  label: string;
  /**
   * Stable list key. Derived from the phase alone, never from a task id — a
   * plan revision bumps `planSpec.version` and replaces every task id, and a
   * key that moved with them would remount every group across the bump. The
   * prefix keeps a phase literally named "Ungrouped" distinct from the bucket
   * for tasks that have no phase.
   */
  key: string;
  tasks: T[];
}

/**
 * Buckets tasks by phase, preserving both the order phases were first seen in
 * and the order of tasks within each phase.
 *
 * Generic over the task shape so it works on the raw `planSpec.tasks` and on
 * the status-bearing rows that `planSpecToTasks` derives from them.
 */
export function groupTasksByPhase<T extends { phase?: string }>(
  tasks: readonly T[] | null | undefined
): PhaseGroup<T>[] {
  const groups: PhaseGroup<T>[] = [];
  const byKey = new Map<string, PhaseGroup<T>>();

  for (const task of tasks ?? []) {
    const raw = task?.phase;
    // A blank phase is no phase. Anything else is used verbatim.
    const phase = typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined;
    const key = phase === undefined ? UNGROUPED_PHASE_KEY : `phase:${phase}`;

    let group = byKey.get(key);
    if (!group) {
      group = { phase, label: phase ?? UNGROUPED_PHASE_LABEL, key, tasks: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.tasks.push(task);
  }

  return groups;
}
