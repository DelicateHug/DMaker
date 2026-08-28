import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ChatPane } from '@/components/workbench/panes/chat-pane';
import type { Feature } from '@/store/app-store';

/**
 * Hoisted because `vi.mock` factories run before the module body. Everything
 * here is mutated per test rather than re-mocked, so a test only has to say
 * what makes it different.
 */
const mocks = vi.hoisted(() => ({
  followUpFeature: vi.fn(),
  runningFeatureIds: new Set<string>(),
  stream: {
    output: '',
    byAgent: {} as Record<string, string>,
    tree: null,
    isLoading: false,
    error: null as string | null,
    refresh: vi.fn(),
  },
}));

vi.mock('@/lib/electron', () => ({
  getElectronAPI: () => ({ autoMode: { followUpFeature: mocks.followUpFeature } }),
}));

vi.mock('@/hooks/use-agent-output-stream', () => ({
  useAgentOutputStream: () => mocks.stream,
}));

vi.mock('@/hooks/use-running-feature-ids', () => ({
  useRunningFeatureIds: () => mocks.runningFeatureIds,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PROJECT_PATH = 'C:/repo/dmaker';
const FEATURE_ID = 'feature-1';

// The pane reads `feature.id` and nothing else off the feature.
const feature = { id: FEATURE_ID, description: 'Chat pane' } as unknown as Feature;

beforeEach(() => {
  // `mockReset: true` in vitest.config.ts strips implementations as well as
  // calls, so the happy path has to be re-established every test.
  mocks.followUpFeature.mockResolvedValue({ success: true });
  mocks.runningFeatureIds.clear();
  mocks.stream.output = '';
  mocks.stream.isLoading = false;
  mocks.stream.error = null;
});

function renderPane() {
  const user = userEvent.setup();
  render(<ChatPane feature={feature} projectPath={PROJECT_PATH} />);
  return { user, composer: screen.getByTestId('chat-composer') };
}

describe('ChatPane', () => {
  it('renders a composer and an empty-transcript state for a feature that has never run', () => {
    // The seeded features in CI have no agent output at all, and the E2E
    // asserts every pane is visible — an empty transcript must not blank the
    // pane or hide the composer.
    renderPane();

    expect(screen.getByTestId('chat-composer')).toBeInTheDocument();
    expect(screen.getByTestId('chat-send')).toBeInTheDocument();
    expect(screen.getByText('Nothing from the agent yet')).toBeInTheDocument();
  });

  it('keeps the composer on screen once there is a transcript', async () => {
    mocks.stream.output = 'Read the config and started work.';

    renderPane();

    expect(await screen.findByTestId('log-entries-container')).toBeInTheDocument();
    expect(screen.getByTestId('chat-composer')).toBeInTheDocument();
    expect(screen.getByTestId('chat-send')).toBeInTheDocument();
  });

  it('will not send an empty draft', () => {
    renderPane();

    expect(screen.getByTestId('chat-send')).toBeDisabled();
  });

  it('sends on Enter with the four-parameter follow-up signature', async () => {
    const { user, composer } = renderPane();

    await user.type(composer, 'run the tests');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(mocks.followUpFeature).toHaveBeenCalledTimes(1));
    // Compared as a whole array so a stray fifth argument fails here — the
    // board's follow-up dialog passes one and it goes nowhere, hidden by that
    // file's `// @ts-nocheck`. The server reads exactly these four.
    expect(mocks.followUpFeature.mock.calls[0]).toEqual([
      PROJECT_PATH,
      FEATURE_ID,
      'run the tests',
      [],
    ]);
  });

  it('treats Shift+Enter as a newline, not a send', async () => {
    const { user, composer } = renderPane();

    await user.type(composer, 'first');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.keyboard('second');

    expect(mocks.followUpFeature).not.toHaveBeenCalled();
    expect(composer).toHaveValue('first\nsecond');
  });

  it('clears the draft on a successful send, which is what closes the double-send window', async () => {
    // The endpoint answers before the run is registered, so `isRunning` stays
    // false for a beat afterwards. An empty draft is what stops a second Enter
    // in that beat being silently rejected as "already running".
    const { user, composer } = renderPane();

    await user.type(composer, 'run the tests');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(composer).toHaveValue(''));
    expect(screen.getByTestId('chat-send')).toBeDisabled();
  });

  it('keeps the draft when the send fails, so the message is not lost', async () => {
    mocks.followUpFeature.mockResolvedValue({ success: false, error: 'already running' });
    const { user, composer } = renderPane();

    await user.type(composer, 'run the tests');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
    expect(composer).toHaveValue('run the tests');
    expect(screen.getByTestId('chat-send')).toBeEnabled();
  });

  it('disables sending while the agent runs and says why, without blocking composing', async () => {
    mocks.runningFeatureIds.add(FEATURE_ID);
    const { user, composer } = renderPane();

    await user.type(composer, 'and now do this next');

    expect(composer).toHaveValue('and now do this next');
    expect(screen.getByTestId('chat-send')).toBeDisabled();
    expect(screen.getByTestId('chat-status')).toHaveTextContent(
      /only start once this one finishes/
    );
  });

  it('describes a follow-up as a new turn rather than as steering a live agent', () => {
    // The copy is the honesty guarantee: this does not reach a model
    // mid-sentence, and the pane must not imply that it does.
    renderPane();

    expect(screen.getByTestId('chat-status')).toHaveTextContent(/new agent turn/);
    expect(screen.getByTestId('chat-status')).toHaveTextContent(/does not reach an agent mid-run/);
  });
});
