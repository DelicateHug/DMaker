import { describe, it, expect } from 'vitest';
import { parseProgressMarkers } from '@/services/auto-mode-service.js';

/**
 * The [TASK_START] / [TASK_COMPLETE] / [PHASE_COMPLETE] markers have been in
 * every planning prompt since planning existed, and until now nothing in the
 * repo read them. In lite/adaptive mode — the default — the agent implements
 * inline in the first stream, so the per-task loop that advances the counter
 * never runs and the board sat at 0/N for the whole run.
 *
 * The scanner is pure; the caller dedupes by `key` because it re-reads the tail
 * of a growing accumulator on every streamed text block.
 */
describe('parseProgressMarkers', () => {
  it('reads the exact format the prompts ask for', () => {
    const markers = parseProgressMarkers(
      [
        '[TASK_START] T001: Create the user model',
        'doing the work',
        '[TASK_COMPLETE] T001: Added src/models/user.ts',
        '[PHASE_COMPLETE] Phase 1 complete',
      ].join('\n')
    );

    expect(markers).toEqual([
      {
        kind: 'task_start',
        ref: 'T001',
        text: 'Create the user model',
        key: 'task_start:T001',
      },
      {
        kind: 'task_complete',
        ref: 'T001',
        text: 'Added src/models/user.ts',
        key: 'task_complete:T001',
      },
      {
        kind: 'phase_complete',
        ref: 'Phase 1',
        text: 'Phase 1 complete',
        key: 'phase_complete:Phase 1',
      },
    ]);
  });

  it('keeps start and complete for one task apart', () => {
    const keys = parseProgressMarkers('[TASK_START] T007: x\n[TASK_COMPLETE] T007: y').map(
      (m) => m.key
    );

    // Both must survive the caller's dedupe, or a task that starts can never
    // be recorded as finished.
    expect(keys).toEqual(['task_start:T007', 'task_complete:T007']);
  });

  it('reads several tasks in the order the agent printed them', () => {
    const markers = parseProgressMarkers(
      '[TASK_START] T001: a\n[TASK_COMPLETE] T001: a done\n[TASK_START] T002: b'
    );
    expect(markers.map((m) => m.key)).toEqual([
      'task_start:T001',
      'task_complete:T001',
      'task_start:T002',
    ]);
  });

  it('does not match a half-streamed marker, and matches it once it completes', () => {
    // A chunk boundary can land anywhere. The id is what makes a marker a
    // marker, so a partial one is simply not one yet.
    expect(parseProgressMarkers('...[TASK_START] T0')).toEqual([]);
    expect(parseProgressMarkers('...[TASK_START] T001: Create the model')).toHaveLength(1);
  });

  it('yields a stable key across the chunk boundary so the caller fires once', () => {
    const first = parseProgressMarkers('[TASK_START] T001: Create the');
    const whole = parseProgressMarkers('[TASK_START] T001: Create the model');

    expect(first[0].key).toBe(whole[0].key);
    expect(new Set([first[0].key, whole[0].key]).size).toBe(1);
  });

  it('tolerates a task marker with no description', () => {
    expect(parseProgressMarkers('[TASK_START] T012')).toEqual([
      { kind: 'task_start', ref: 'T012', text: '', key: 'task_start:T012' },
    ]);
  });

  it('keys a phase on its label, because a phase can be named rather than numbered', () => {
    const [marker] = parseProgressMarkers('[PHASE_COMPLETE] Foundation complete');
    expect(marker).toEqual({
      kind: 'phase_complete',
      ref: 'Foundation',
      text: 'Foundation complete',
      key: 'phase_complete:Foundation',
    });
  });

  it('ignores a bare [PHASE_COMPLETE] with nothing to identify it', () => {
    expect(parseProgressMarkers('[PHASE_COMPLETE]\n')).toEqual([]);
  });

  it('ignores prose that merely mentions the markers', () => {
    expect(parseProgressMarkers('I will print TASK_START when I begin.')).toEqual([]);
    // T12 is not a task id — the prompts specify T###.
    expect(parseProgressMarkers('[TASK_START] T12: too short')).toEqual([]);
  });

  it('is not left holding state between calls', () => {
    // The pattern is a module-level /g regex; a leaked lastIndex would make the
    // second call skip the marker entirely.
    const text = '[TASK_COMPLETE] T003: done';
    expect(parseProgressMarkers(text)).toHaveLength(1);
    expect(parseProgressMarkers(text)).toHaveLength(1);
  });
});
