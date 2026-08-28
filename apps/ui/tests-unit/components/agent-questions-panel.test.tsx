import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgentQuestion, Feature } from '@dmaker/types';
import { AgentQuestionsPanel } from '@/components/views/board-view/components/agent-questions-panel';
import type { FeatureQuestionEvent } from '@/lib/electron';

/**
 * Hoisted because `vi.mock` factories run before the module body. The panel
 * reaches the whole feature API through `getElectronAPI()`, so mocking that one
 * module covers the fetch, the answer and the push channel together.
 */
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  answerQuestion: vi.fn(),
  startIssueDraft: vi.fn(),
  onQuestionEvent: vi.fn(),
  questionHandlers: [] as Array<(event: FeatureQuestionEvent) => void>,
}));

vi.mock('@/lib/electron', () => ({
  getElectronAPI: () => ({
    features: {
      get: mocks.get,
      answerQuestion: mocks.answerQuestion,
      startIssueDraft: mocks.startIssueDraft,
      onQuestionEvent: mocks.onQuestionEvent,
    },
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PROJECT_PATH = 'C:/repo/dmaker';
const FEATURE_ID = 'feature-1';

function makeQuestion(overrides: Partial<AgentQuestion> = {}): AgentQuestion {
  return {
    id: 'q1',
    source: 'issue-draft',
    question: 'Which database should this use?',
    askedAt: '2026-01-01T09:00:00.000Z',
    ...overrides,
  };
}

function makeFeature(questions: AgentQuestion[]): Feature {
  return { id: FEATURE_ID, agentQuestions: questions } as unknown as Feature;
}

function renderPanel(questions: AgentQuestion[], isActive = true) {
  const user = userEvent.setup();
  const feature = makeFeature(questions);
  mocks.get.mockResolvedValue({ success: true, feature });
  render(
    <AgentQuestionsPanel
      projectPath={PROJECT_PATH}
      featureId={FEATURE_ID}
      initialFeature={feature}
      isActive={isActive}
    />
  );
  return { user };
}

function fireQuestionEvent(featureId: string) {
  act(() => {
    for (const handler of [...mocks.questionHandlers]) {
      handler({
        type: 'feature:question-asked',
        payload: {
          projectPath: PROJECT_PATH,
          featureId,
          question: makeQuestion({ id: 'q9' }),
        },
      });
    }
  });
}

beforeEach(() => {
  // `mockReset: true` in vitest.config.ts strips implementations as well as
  // calls, so every happy path has to be re-established here.
  mocks.questionHandlers.length = 0;
  mocks.get.mockResolvedValue({ success: true, feature: makeFeature([]) });
  mocks.answerQuestion.mockImplementation(async () => ({ success: true }));
  mocks.startIssueDraft.mockResolvedValue({ success: true });
  mocks.onQuestionEvent.mockImplementation((callback: (event: FeatureQuestionEvent) => void) => {
    mocks.questionHandlers.push(callback);
    return () => {
      const index = mocks.questionHandlers.indexOf(callback);
      if (index >= 0) mocks.questionHandlers.splice(index, 1);
    };
  });
});

describe('AgentQuestionsPanel numbering', () => {
  it('uses the number the server assigned, and falls back to askedAt order for older questions', () => {
    renderPanel([
      makeQuestion({ id: 'numbered', number: 7, askedAt: '2026-01-01T10:00:00.000Z' }),
      makeQuestion({ id: 'legacy', askedAt: '2026-01-01T09:00:00.000Z', header: 'Storage' }),
    ]);

    // The fallback is positional in askedAt order, not render order: the legacy
    // question was asked first even though it is listed second.
    expect(screen.getByTestId('agent-question-title-legacy')).toHaveTextContent('Question 1');
    expect(screen.getByTestId('agent-question-title-numbered')).toHaveTextContent('Question 7');
    expect(screen.getByText('Storage')).toBeInTheDocument();
  });
});

describe('AgentQuestionsPanel answering', () => {
  it('answers by option id, not by the label text, so the choice survives on the record', async () => {
    const { user } = renderPanel([
      makeQuestion({
        choices: [
          { id: 'c1', label: 'Postgres', description: 'Managed, already in the stack' },
          { id: 'c2', label: 'SQLite' },
        ],
      }),
    ]);

    expect(screen.getByText('Managed, already in the stack')).toBeInTheDocument();

    await user.click(screen.getByTestId('agent-question-choice-q1-c1'));
    await user.click(screen.getByTestId('agent-question-submit-q1'));

    await waitFor(() => expect(mocks.answerQuestion).toHaveBeenCalledTimes(1));
    // Sending the label instead would be recorded as answerSource 'custom' and
    // lose which choice was taken; the server derives the text from the ids.
    expect(mocks.answerQuestion.mock.calls[0]).toEqual([
      PROJECT_PATH,
      FEATURE_ID,
      'q1',
      '',
      undefined,
      ['c1'],
    ]);
  });

  it('does not submit the moment a choice is clicked', async () => {
    const { user } = renderPanel([makeQuestion({ choices: [{ id: 'c1', label: 'Postgres' }] })]);

    await user.click(screen.getByTestId('agent-question-choice-q1-c1'));

    expect(mocks.answerQuestion).not.toHaveBeenCalled();
    expect(screen.getByTestId('agent-question-choice-q1-c1')).toHaveAttribute(
      'data-selected',
      'true'
    );
  });

  it('keeps the free-text box behind an explicit Other', async () => {
    const { user } = renderPanel([makeQuestion({ choices: [{ id: 'c1', label: 'Postgres' }] })]);

    // An always-open box beside the options is exactly what the asking agent is
    // told the UI does not do, so the custom path has to be chosen.
    expect(screen.queryByTestId('agent-question-input-q1')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('agent-question-other-q1'));
    const input = screen.getByTestId('agent-question-input-q1');
    await user.type(input, 'Reuse the existing store');
    await user.click(screen.getByTestId('agent-question-submit-q1'));

    await waitFor(() => expect(mocks.answerQuestion).toHaveBeenCalledTimes(1));
    expect(mocks.answerQuestion.mock.calls[0]).toEqual([
      PROJECT_PATH,
      FEATURE_ID,
      'q1',
      'Reuse the existing store',
      undefined,
      undefined,
    ]);
  });

  it('shows the free-text box outright when nothing was offered to pick', () => {
    renderPanel([makeQuestion({})]);

    expect(screen.getByTestId('agent-question-input-q1')).toBeInTheDocument();
    // There is nothing for a custom answer to be other than.
    expect(screen.queryByTestId('agent-question-other-q1')).not.toBeInTheDocument();
  });

  it('makes a legacy string-options question answerable by choice, on the positional ids', async () => {
    const { user } = renderPanel([makeQuestion({ options: ['Yes', 'No'] })]);

    await user.click(screen.getByTestId('agent-question-choice-q1-opt-2'));
    await user.click(screen.getByTestId('agent-question-submit-q1'));

    await waitFor(() => expect(mocks.answerQuestion).toHaveBeenCalledTimes(1));
    // `opt-N` is the id the server synthesises for the same question; the two
    // derivations must agree or the answer comes back recorded as free text.
    expect(mocks.answerQuestion.mock.calls[0][5]).toEqual(['opt-2']);
  });
});

describe('AgentQuestionsPanel resolved cards', () => {
  it('lists every choice that was offered and marks the one that was taken', () => {
    renderPanel([
      makeQuestion({
        choices: [
          { id: 'c1', label: 'Postgres' },
          { id: 'c2', label: 'SQLite' },
          { id: 'c3', label: 'In memory' },
        ],
        answer: 'SQLite',
        answerSource: 'option',
        selectedOptionIds: ['c2'],
        answeredAt: '2026-01-01T09:05:00.000Z',
      }),
    ]);

    expect(screen.getByTestId('agent-question-resolved-choice-q1-c1')).toHaveAttribute(
      'data-chosen',
      'false'
    );
    expect(screen.getByTestId('agent-question-resolved-choice-q1-c2')).toHaveAttribute(
      'data-chosen',
      'true'
    );
    expect(screen.getByTestId('agent-question-resolved-choice-q1-c3')).toHaveAttribute(
      'data-chosen',
      'false'
    );
  });

  it('badges a free-text answer as Other and marks none of the choices', () => {
    renderPanel([
      makeQuestion({
        choices: [
          { id: 'c1', label: 'Postgres' },
          { id: 'c2', label: 'SQLite' },
        ],
        answer: 'Reuse the existing store',
        answerSource: 'custom',
        answeredAt: '2026-01-01T09:05:00.000Z',
      }),
    ]);

    expect(screen.getByTestId('agent-question-resolved-q1')).toHaveAttribute(
      'data-answer-source',
      'custom'
    );
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText('Reuse the existing store')).toBeInTheDocument();
    expect(screen.getByTestId('agent-question-resolved-choice-q1-c1')).toHaveAttribute(
      'data-chosen',
      'false'
    );
    expect(screen.getByTestId('agent-question-resolved-choice-q1-c2')).toHaveAttribute(
      'data-chosen',
      'false'
    );
  });

  it('marks a legacy answer that recorded only the label, and only on an exact match', () => {
    renderPanel([
      makeQuestion({
        choices: [
          { id: 'c1', label: 'Postgres' },
          { id: 'c2', label: 'SQLite' },
        ],
        answer: 'SQLite',
        answeredAt: '2026-01-01T09:05:00.000Z',
      }),
      makeQuestion({
        id: 'q2',
        askedAt: '2026-01-01T09:10:00.000Z',
        choices: [
          { id: 'c1', label: 'Postgres' },
          { id: 'c2', label: 'SQLite' },
        ],
        answer: 'sqlite, probably',
        answeredAt: '2026-01-01T09:15:00.000Z',
      }),
    ]);

    expect(screen.getByTestId('agent-question-resolved-choice-q1-c2')).toHaveAttribute(
      'data-chosen',
      'true'
    );
    // Anything looser than an exact match would put a tick beside a choice the
    // user may never have picked.
    expect(screen.getByTestId('agent-question-resolved-choice-q2-c2')).toHaveAttribute(
      'data-chosen',
      'false'
    );
  });

  it('files an expired question under answered rather than leaving it outstanding', () => {
    renderPanel([makeQuestion({ expiredAt: '2026-01-01T09:30:00.000Z' })]);

    expect(screen.getByTestId('agent-question-resolved-q1')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-question-q1')).not.toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.queryByText(/Needs your answer/)).not.toBeInTheDocument();
  });
});

describe('AgentQuestionsPanel plumbing', () => {
  it('renders an empty state rather than nothing when there is nothing to answer', () => {
    // The workbench E2E asserts every pane is visible, and CI seeds features
    // that have no questions at all.
    renderPanel([]);

    expect(screen.getByTestId('agent-questions-panel')).toBeInTheDocument();
    expect(screen.getByText('Nothing to answer.')).toBeInTheDocument();
  });

  it('re-reads the feature when the push channel fires for it, and ignores other features', async () => {
    renderPanel([]);
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));

    fireQuestionEvent('some-other-feature');
    expect(mocks.get).toHaveBeenCalledTimes(1);

    fireQuestionEvent(FEATURE_ID);
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  });

  it('reads nothing while the pane is hidden', () => {
    // Six panes stay mounted for every open task; an ungated poll would re-read
    // feature.json for all of them whether or not anyone is looking.
    renderPanel([makeQuestion({})], false);

    expect(mocks.get).not.toHaveBeenCalled();
    expect(screen.getByTestId('agent-question-q1')).toBeInTheDocument();
  });
});
