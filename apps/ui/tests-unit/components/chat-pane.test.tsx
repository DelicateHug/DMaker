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
  injectMessage: vi.fn(),
  /** Flipped by the one test that asks what the pane does without the endpoint. */
  hasInjectMessage: true,
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
  getElectronAPI: () => ({
    autoMode: mocks.hasInjectMessage ? { injectMessage: mocks.injectMessage } : {},
  }),
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

/** What `/api/auto-mode/inject-message` answers when it steered a live run. */
const INJECTED = {
  success: true,
  mode: 'injected',
  status: 'delivered',
  interrupted: false,
  message: 'Sent to the running agent; it runs as the next turn.',
};

/** ...and when it found nothing running and started a follow-up instead. */
const FELL_BACK = {
  success: true,
  mode: 'follow-up',
  status: 'not_running',
  interrupted: false,
  message: 'Nothing was running, so this started a follow-up run instead.',
};

// The pane reads `feature.id` and nothing else off the feature.
const feature = { id: FEATURE_ID, description: 'Chat pane' } as unknown as Feature;

beforeEach(() => {
  // `mockReset: true` in vitest.config.ts strips implementations as well as
  // calls, so the happy path has to be re-established every test.
  mocks.injectMessage.mockResolvedValue(FELL_BACK);
  mocks.hasInjectMessage = true;
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

/** The title argument of the single toast a test provoked. */
function toastTitle(kind: 'success' | 'error') {
  return vi.mocked(toast[kind]).mock.calls[0]?.[0];
}

/** The description the pane put under that toast. */
function toastDescription(kind: 'success' | 'error') {
  const options = vi.mocked(toast[kind]).mock.calls[0]?.[1];
  return (options as { description?: string } | undefined)?.description;
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

  it('sends on Enter with the inject-message signature and no interrupt', async () => {
    const { user, composer } = renderPane();

    await user.type(composer, 'run the tests');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(mocks.injectMessage).toHaveBeenCalledTimes(1));
    // Compared as a whole array so a fourth argument fails here. Omitting the
    // options bag is a deliberate choice, not an oversight: `interrupt` ends
    // the agent's current turn and discards whatever it was part-way through,
    // which a plain composer must not do without asking first.
    expect(mocks.injectMessage.mock.calls[0]).toEqual([PROJECT_PATH, FEATURE_ID, 'run the tests']);
  });

  it('treats Shift+Enter as a newline, not a send', async () => {
    const { user, composer } = renderPane();

    await user.type(composer, 'first');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.keyboard('second');

    expect(mocks.injectMessage).not.toHaveBeenCalled();
    expect(composer).toHaveValue('first\nsecond');
  });

  it('clears the draft on a successful send, which is what closes the double-send window', async () => {
    // The endpoint answers before any run it started is registered, so
    // `isRunning` stays false for a beat afterwards. An empty draft is what
    // stops a second Enter in that beat starting a second follow-up that the
    // service then rejects in the background, where nothing surfaces it.
    const { user, composer } = renderPane();

    await user.type(composer, 'run the tests');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(composer).toHaveValue(''));
    expect(screen.getByTestId('chat-send')).toBeDisabled();
  });

  it('keeps the draft when the send fails, so the message is not lost', async () => {
    mocks.injectMessage.mockResolvedValue({
      success: false,
      mode: 'none',
      status: 'run_finished',
      interrupted: false,
      error: 'That run has already finished its last turn.',
    });
    const { user, composer } = renderPane();

    await user.type(composer, 'run the tests');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
    expect(composer).toHaveValue('run the tests');
    expect(screen.getByTestId('chat-send')).toBeEnabled();
  });

  it('sends while the agent runs, because steering a live run is the point', async () => {
    // This is the assertion that flipped when injection landed. The button used
    // to be disabled here, which switched the pane off in exactly the situation
    // it now exists to serve.
    mocks.runningFeatureIds.add(FEATURE_ID);
    mocks.injectMessage.mockResolvedValue(INJECTED);
    const { user, composer } = renderPane();

    await user.type(composer, 'and now do this next');

    expect(screen.getByTestId('chat-send')).toBeEnabled();
    expect(screen.getByTestId('chat-send')).toHaveTextContent('Send to agent');

    await user.keyboard('{Enter}');

    await waitFor(() => expect(mocks.injectMessage).toHaveBeenCalledTimes(1));
  });

  it('promises a next-turn pickup while running, never mid-sentence steering', async () => {
    // The copy is the honesty guarantee. The SDK reads a queued user message
    // only at a turn boundary; the pane must not suggest it lands sooner.
    mocks.runningFeatureIds.add(FEATURE_ID);
    renderPane();

    expect(screen.getByTestId('chat-status')).toHaveTextContent(/next turn boundary/);
    expect(screen.getByTestId('chat-status')).toHaveTextContent(/not mid-sentence/);
  });

  it('describes a follow-up as a new turn rather than as steering a live agent', () => {
    // The idle half of the same guarantee: with nothing running there is no
    // agent to reach, and this must not imply otherwise.
    renderPane();

    expect(screen.getByTestId('chat-status')).toHaveTextContent(/new agent turn/);
    expect(screen.getByTestId('chat-status')).toHaveTextContent(/does not reach an agent mid-run/);
    expect(screen.getByTestId('chat-send')).toHaveTextContent('Start follow-up');
  });

  it('reports an injection as having reached the running agent', async () => {
    mocks.runningFeatureIds.add(FEATURE_ID);
    mocks.injectMessage.mockResolvedValue(INJECTED);
    const { user, composer } = renderPane();

    await user.type(composer, 'use the other library');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalled());
    expect(toastTitle('success')).toBe('Sent to the running agent');
    // The server's own wording wins — it knows what it did.
    expect(toastDescription('success')).toBe(INJECTED.message);
  });

  it('says the turn was cut short only when the server says it was interrupted', async () => {
    // The server omits `message` here, so the pane falls back to its own copy —
    // and the two branches of that copy are materially different claims.
    mocks.runningFeatureIds.add(FEATURE_ID);
    mocks.injectMessage.mockResolvedValue({
      success: true,
      mode: 'injected',
      status: 'delivered',
      interrupted: true,
    });
    const { user, composer } = renderPane();

    await user.type(composer, 'stop and do this instead');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalled());
    expect(toastDescription('success')).toMatch(/cut short/);
  });

  it('reports a follow-up as a new turn, even when the pane thought a run was live', async () => {
    // `isRunning` is a WebSocket-fed cache and is routinely a beat behind the
    // server. The toast follows the server's `mode`, never the pane's guess,
    // because "queued for the running agent" and "started a new run" are
    // different things to have done.
    mocks.runningFeatureIds.add(FEATURE_ID);
    mocks.injectMessage.mockResolvedValue(FELL_BACK);
    const { user, composer } = renderPane();

    await user.type(composer, 'carry on');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalled());
    expect(toastTitle('success')).toBe('Follow-up queued');
    expect(toastDescription('success')).toBe(FELL_BACK.message);
  });

  it.each([
    [
      'unsupported_provider',
      'This run cannot take messages: only the main Claude agent can. Wait for it to finish, then send a follow-up.',
    ],
    [
      'run_finished',
      'That run has already finished its last turn. Wait for it to stop, then send a follow-up.',
    ],
  ])('surfaces the server reason when steering is impossible (%s)', async (status, error) => {
    // Running, but unreachable. Failing silently here is the one outcome worse
    // than refusing: the user would believe the agent had been told something
    // it never heard.
    mocks.runningFeatureIds.add(FEATURE_ID);
    mocks.injectMessage.mockResolvedValue({
      success: false,
      mode: 'none',
      status,
      interrupted: false,
      error,
    });
    const { user, composer } = renderPane();

    await user.type(composer, 'try something else');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
    expect(toastTitle('error')).toBe('Could not send the message');
    expect(toastDescription('error')).toBe(error);
    expect(composer).toHaveValue('try something else');
  });

  it('refuses by name when the build has no inject-message endpoint', async () => {
    // A renderer talking to a server older than it is. Better a named refusal
    // with the draft intact than a silent no-op that looks exactly like a send
    // that worked.
    mocks.hasInjectMessage = false;
    const { user, composer } = renderPane();

    await user.type(composer, 'anything');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
    expect(toastDescription('error')).toBe('Messaging an agent is not available in this build.');
    expect(mocks.injectMessage).not.toHaveBeenCalled();
    expect(composer).toHaveValue('anything');
  });
});
