import { describe, expect, it, vi } from 'vitest';
import type { FeatureListSummary } from '@dmaker/types';

/**
 * `use-board-features` pulls in the whole app store and the HTTP client at
 * module scope. Only `summaryToFeature` is under test here — a pure mapper —
 * so both are stubbed down to nothing rather than instantiated.
 */
vi.mock('@/store/app-store', () => ({
  useAppStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector({}),
    { getState: () => ({}) }
  ),
}));

vi.mock('@/lib/electron', () => ({
  getElectronAPI: () => ({}),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { summaryToFeature } = await import('@/components/views/board-view/hooks/use-board-features');

function makeSummary(overrides: Partial<FeatureListSummary> = {}): FeatureListSummary {
  return {
    id: 'feature-1',
    title: 'Do the thing',
    imagePathsCount: 0,
    ...overrides,
  } as FeatureListSummary;
}

describe('summaryToFeature', () => {
  it('carries pendingQuestionCount through the Phase 1 render', () => {
    const feature = summaryToFeature(makeSummary({ pendingQuestionCount: 2 }));
    expect(feature.pendingQuestionCount).toBe(2);
  });

  it('carries a zero count rather than dropping it', () => {
    // 0 and undefined mean different things to the badge: "asked and answered"
    // versus "the summary did not say". Both must survive the mapping.
    const feature = summaryToFeature(makeSummary({ pendingQuestionCount: 0 }));
    expect(feature.pendingQuestionCount).toBe(0);
  });

  it('leaves the count undefined when the server did not send one', () => {
    const feature = summaryToFeature(makeSummary());
    expect(feature.pendingQuestionCount).toBeUndefined();
  });

  it('still maps the fields the board already relied on', () => {
    const feature = summaryToFeature(
      makeSummary({ status: 'in_progress', branchName: 'feat-x', category: 'Core' }),
      'C:/repo/dmaker',
      'DMaker'
    );
    expect(feature.id).toBe('feature-1');
    expect(feature.status).toBe('in_progress');
    expect(feature.branchName).toBe('feat-x');
    expect(feature.category).toBe('Core');
    expect(feature.projectPath).toBe('C:/repo/dmaker');
    expect(feature.projectName).toBe('DMaker');
  });
});
