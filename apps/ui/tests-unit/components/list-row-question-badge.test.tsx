import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ListRow,
  getPendingQuestionCount,
} from '@/components/views/board-view/components/list-view/list-row';
import type { Feature } from '@/store/app-store';

const FEATURE_ID = 'feature-1';

function makeFeature(overrides: Record<string, unknown> = {}): Feature {
  return {
    id: FEATURE_ID,
    title: 'Do the thing',
    description: 'Do the thing',
    category: 'Core',
    steps: [],
    status: 'in_progress',
    ...overrides,
  } as unknown as Feature;
}

function renderRow(feature: Feature) {
  // onEdit and onDelete are the two required members of RowActionHandlers.
  // Nothing here clicks them; they exist so the row can be rendered at all.
  return render(<ListRow feature={feature} handlers={{ onEdit: () => {}, onDelete: () => {} }} />);
}

describe('getPendingQuestionCount', () => {
  it('prefers the summary count from the fast Phase 1 load', () => {
    expect(getPendingQuestionCount(makeFeature({ pendingQuestionCount: 3 }))).toBe(3);
  });

  it('falls back to agentQuestions once the full feature arrives', () => {
    // Phase 2 replaces the summary-derived feature with the real one, which
    // carries the questions but not the server's precomputed count.
    const feature = makeFeature({
      agentQuestions: [
        { id: 'q1', question: 'Which one?', askedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'q2', question: 'And this?', askedAt: '2026-01-01T00:01:00.000Z' },
      ],
    });
    expect(getPendingQuestionCount(feature)).toBe(2);
  });

  it('treats answered, skipped and expired questions as resolved', () => {
    const feature = makeFeature({
      agentQuestions: [
        { id: 'q1', question: 'a', askedAt: 'x', answeredAt: 'y' },
        { id: 'q2', question: 'b', askedAt: 'x', skipped: true },
        // The run that asked has ended, so nobody can answer it any more.
        { id: 'q3', question: 'c', askedAt: 'x', expiredAt: 'z' },
        { id: 'q4', question: 'd', askedAt: 'x' },
      ],
    });
    expect(getPendingQuestionCount(feature)).toBe(1);
  });

  it('returns 0 when there is nothing to go on', () => {
    expect(getPendingQuestionCount(makeFeature())).toBe(0);
    expect(getPendingQuestionCount(makeFeature({ agentQuestions: [] }))).toBe(0);
  });

  it('does not mistake a non-array agentQuestions for questions', () => {
    expect(getPendingQuestionCount(makeFeature({ agentQuestions: null }))).toBe(0);
  });
});

describe('ListRow question badge', () => {
  it('shows the badge with the count during the Phase 1 render', () => {
    renderRow(makeFeature({ pendingQuestionCount: 2 }));
    const badge = screen.getByTestId(`list-row-questions-${FEATURE_ID}`);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('data-question-count', '2');
    expect(badge).toHaveTextContent('2');
  });

  it('shows the badge from agentQuestions after the full load', () => {
    renderRow(
      makeFeature({
        agentQuestions: [{ id: 'q1', question: 'Which one?', askedAt: '2026-01-01T00:00:00.000Z' }],
      })
    );
    expect(screen.getByTestId(`list-row-questions-${FEATURE_ID}`)).toHaveAttribute(
      'data-question-count',
      '1'
    );
  });

  it('renders no badge when nothing is outstanding', () => {
    renderRow(makeFeature({ pendingQuestionCount: 0 }));
    expect(screen.queryByTestId(`list-row-questions-${FEATURE_ID}`)).not.toBeInTheDocument();
  });

  it('renders no badge when the feature has no question data at all', () => {
    renderRow(makeFeature());
    expect(screen.queryByTestId(`list-row-questions-${FEATURE_ID}`)).not.toBeInTheDocument();
  });
});
