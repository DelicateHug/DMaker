import { describe, it, expect } from 'vitest';
import { groupTasksByPhase, UNGROUPED_PHASE_LABEL } from '@/lib/phase-grouping';

/**
 * These cases exist because the obvious implementations are the wrong ones:
 * sorting the phases, or deriving a phase's identity from a number inside its
 * name. The server already demonstrates the second failure — its per-task
 * phase-completion event is gated on `/Phase\s*(\d+)/i`, so a plan with named
 * phases emits nothing at all.
 */

interface Task {
  id: string;
  description: string;
  phase?: string;
}

const task = (id: string, phase?: string): Task => ({
  id,
  description: `do ${id}`,
  ...(phase === undefined ? {} : { phase }),
});

describe('groupTasksByPhase', () => {
  it('returns no groups for empty, null or undefined input', () => {
    expect(groupTasksByPhase([])).toEqual([]);
    expect(groupTasksByPhase(null)).toEqual([]);
    expect(groupTasksByPhase(undefined)).toEqual([]);
  });

  it('collects every task without a phase into one Ungrouped bucket', () => {
    const groups = groupTasksByPhase([task('T001'), task('T002'), task('T003')]);

    expect(groups).toHaveLength(1);
    expect(groups[0].phase).toBeUndefined();
    expect(groups[0].label).toBe(UNGROUPED_PHASE_LABEL);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['T001', 'T002', 'T003']);
  });

  it('treats a blank or whitespace-only phase as no phase', () => {
    const groups = groupTasksByPhase([task('T001', ''), task('T002', '   '), task('T003')]);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe(UNGROUPED_PHASE_LABEL);
    expect(groups[0].tasks).toHaveLength(3);
  });

  it('groups duplicate phase names together, even when they are not adjacent', () => {
    const groups = groupTasksByPhase([
      task('T001', 'Phase 1: Foundation'),
      task('T002', 'Phase 2: Wiring'),
      task('T003', 'Phase 1: Foundation'),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].phase).toBe('Phase 1: Foundation');
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['T001', 'T003']);
    expect(groups[1].tasks.map((t) => t.id)).toEqual(['T002']);
  });

  it('orders groups by first appearance, not alphabetically or numerically', () => {
    const groups = groupTasksByPhase([
      task('T001', 'Phase 3: Cleanup'),
      task('T002', 'Phase 1: Foundation'),
      task('T003', 'Alpha'),
    ]);

    expect(groups.map((g) => g.phase)).toEqual([
      'Phase 3: Cleanup',
      'Phase 1: Foundation',
      'Alpha',
    ]);
  });

  it('keeps the ungrouped bucket in its first-seen position among named phases', () => {
    const groups = groupTasksByPhase([
      task('T001', 'Foundation'),
      task('T002'),
      task('T003', 'Wiring'),
      task('T004'),
    ]);

    expect(groups.map((g) => g.label)).toEqual(['Foundation', UNGROUPED_PHASE_LABEL, 'Wiring']);
    expect(groups[1].tasks.map((t) => t.id)).toEqual(['T002', 'T004']);
  });

  it('never parses a number out of the phase: named phases group, and "1" is not "01"', () => {
    const named = groupTasksByPhase([task('T001', 'Foundation'), task('T002', 'Foundation')]);
    expect(named).toHaveLength(1);
    expect(named[0].tasks).toHaveLength(2);

    // Numerically equal, textually different: two phases, never merged.
    const numbered = groupTasksByPhase([task('T001', 'Phase 1'), task('T002', 'Phase 01')]);
    expect(numbered.map((g) => g.phase)).toEqual(['Phase 1', 'Phase 01']);
  });

  it('keeps a phase literally named "Ungrouped" separate from the no-phase bucket', () => {
    const groups = groupTasksByPhase([task('T001', UNGROUPED_PHASE_LABEL), task('T002')]);

    expect(groups).toHaveLength(2);
    expect(groups[0].phase).toBe(UNGROUPED_PHASE_LABEL);
    expect(groups[1].phase).toBeUndefined();
    expect(groups[0].key).not.toBe(groups[1].key);
  });

  it('keys groups on the phase, not on a task id, so a plan revision does not remount them', () => {
    // A plan revision (planSpec.version bump) re-parses the spec and hands out
    // an entirely new set of task ids for the same phases.
    const v1 = groupTasksByPhase([task('T001', 'Foundation'), task('T002', 'Wiring')]);
    const v2 = groupTasksByPhase([
      task('T101', 'Foundation'),
      task('T102', 'Foundation'),
      task('T103', 'Wiring'),
    ]);

    expect(v2.map((g) => g.key)).toEqual(v1.map((g) => g.key));
    for (const key of v2.map((g) => g.key)) {
      expect(key).not.toMatch(/T\d/);
    }
  });

  it('accepts rows carrying extra fields, such as derived task status', () => {
    const groups = groupTasksByPhase([
      { id: 'T001', description: 'first', phase: 'Foundation', status: 'completed' as const },
      { id: 'T002', description: 'second', phase: 'Foundation', status: 'pending' as const },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].tasks.map((t) => t.status)).toEqual(['completed', 'pending']);
  });
});
