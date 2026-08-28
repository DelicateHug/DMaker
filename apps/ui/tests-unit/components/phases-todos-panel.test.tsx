import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { PipelineStep } from '@dmaker/types';
import { PhasesTodosPanel } from '@/components/views/board-view/components/phases-todos-panel';
import type { Feature } from '@/store/app-store';
import type { AutoModeEvent } from '@/types/electron';

/**
 * Hoisted because `vi.mock` factories run before the module body.
 *
 * `@/store/app-store` is stubbed down to `useAppStore` alone: the panel reads
 * one cached slice from it, and nothing else in this render tree imports the
 * store at runtime (`lib/utils.ts` takes types from it only).
 */
const mocks = vi.hoisted(() => ({
  storeState: {
    pipelineConfigByProject: {} as Record<string, { version: 1; steps: PipelineStep[] }>,
  },
  getAgentOutput: vi.fn(),
  onEvent: vi.fn(),
  eventHandlers: [] as Array<(event: AutoModeEvent) => void>,
}));

vi.mock('@/lib/electron', () => ({
  getElectronAPI: () => ({
    features: { getAgentOutput: mocks.getAgentOutput },
    autoMode: { onEvent: mocks.onEvent },
  }),
}));

vi.mock('@/store/app-store', () => ({
  useAppStore: (selector: (state: typeof mocks.storeState) => unknown) =>
    selector(mocks.storeState),
}));

const PROJECT_PATH = 'C:/repo/dmaker';
const FEATURE_ID = 'feature-1';

function makeStep(id: string, name: string, order: number): PipelineStep {
  return {
    id,
    name,
    order,
    instructions: '',
    colorClass: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return { id: FEATURE_ID, status: 'in_progress', ...overrides } as unknown as Feature;
}

function emit(event: AutoModeEvent) {
  act(() => {
    for (const handler of [...mocks.eventHandlers]) handler(event);
  });
}

async function renderPanel(feature: Feature, isActive = true) {
  render(
    <PhasesTodosPanel
      projectPath={PROJECT_PATH}
      featureId={FEATURE_ID}
      feature={feature}
      isActive={isActive}
    />
  );
  // The one transcript read settles on a microtask. Flushing it here keeps
  // every assertion below out of React's "not wrapped in act(...)" path.
  await act(async () => {});
}

beforeEach(() => {
  // `mockReset: true` in vitest.config.ts strips implementations as well as
  // calls, so the happy path has to be re-established every test.
  mocks.storeState.pipelineConfigByProject = {};
  mocks.eventHandlers.length = 0;
  mocks.getAgentOutput.mockResolvedValue({ success: true, content: '' });
  mocks.onEvent.mockImplementation((callback: (event: AutoModeEvent) => void) => {
    mocks.eventHandlers.push(callback);
    return () => {
      const index = mocks.eventHandlers.indexOf(callback);
      if (index >= 0) mocks.eventHandlers.splice(index, 1);
    };
  });
});

describe('PhasesTodosPanel phases', () => {
  it('renders an empty state rather than nothing for a task with no plan and no pipeline', async () => {
    // The workbench E2E asserts every pane is visible and CI's seeded features
    // have neither.
    await renderPanel(makeFeature());

    expect(screen.getByTestId('phases-todos-panel')).toBeInTheDocument();
    expect(screen.getByText('Nothing planned yet.')).toBeInTheDocument();
    // The in-flight transcript read must not raise a "Live todos" section that
    // is then taken away again the moment it comes back empty.
    expect(screen.queryByTestId('live-todos-section')).not.toBeInTheDocument();
    expect(await screen.findByText('Check again')).toBeInTheDocument();
  });

  it('groups tasks by the exact phase string and derives status rather than trusting the file', async () => {
    await renderPanel(
      makeFeature({
        planSpec: {
          content: '```tasks\n```',
          tasksCompleted: 1,
          currentTaskId: 'T002',
          tasks: [
            // Every task on disk reads 'pending' forever: nothing rewrites it
            // after the initial parse, so a panel that trusted it would show a
            // finished plan as untouched.
            { id: 'T001', description: 'Add the table', phase: 'Foundation', status: 'pending' },
            { id: 'T002', description: 'Wire the route', phase: 'Foundation', status: 'pending' },
            { id: 'T003', description: 'Ship it', phase: 'Rollout', status: 'pending' },
          ],
        },
      } as Partial<Feature>)
    );

    expect(screen.getByTestId('phase-group-phase:Foundation')).toBeInTheDocument();
    expect(screen.getByTestId('phase-group-phase:Rollout')).toBeInTheDocument();
    expect(screen.getByTestId('phase-task-T001')).toHaveAttribute('data-status', 'completed');
    expect(screen.getByTestId('phase-task-T002')).toHaveAttribute('data-status', 'in_progress');
    expect(screen.getByTestId('phase-task-T003')).toHaveAttribute('data-status', 'pending');
  });

  it('treats a plan with content but no parsed tasks as normal, not as an error', async () => {
    // Lite planning writes a numbered list rather than a task fence, so zero
    // parsed tasks is the expected outcome for a perfectly good plan.
    await renderPanel(
      makeFeature({
        planSpec: { content: '1. Add the table\n2. Wire the route', tasks: [] },
      } as Partial<Feature>)
    );

    expect(screen.getByTestId('phases-section')).toBeInTheDocument();
    expect(screen.getByText(/no machine-readable task list/)).toBeInTheDocument();
  });
});

describe('PhasesTodosPanel pipeline', () => {
  it('labels a step deduced from its position as inferred, and a recorded one as fact', async () => {
    mocks.storeState.pipelineConfigByProject[PROJECT_PATH] = {
      version: 1,
      steps: [
        makeStep('design', 'Design', 1),
        makeStep('build', 'Build', 2),
        makeStep('review', 'Review', 3),
        makeStep('ship', 'Ship', 4),
      ],
    };

    await renderPanel(
      makeFeature({
        status: 'pipeline_review',
        pipelineProgress: [{ stepId: 'design', stepName: 'Design', status: 'completed' }],
      } as Partial<Feature>)
    );

    expect(screen.getByTestId('pipeline-step-design')).toHaveAttribute('data-inferred', 'false');
    // Nothing recorded Build finishing; all that is known is that it comes
    // before the step the feature is parked on.
    expect(screen.getByTestId('pipeline-step-build')).toHaveAttribute('data-status', 'completed');
    expect(screen.getByTestId('pipeline-step-build')).toHaveAttribute('data-inferred', 'true');
    expect(screen.getByTestId('pipeline-step-review')).toHaveAttribute('data-status', 'running');
    expect(screen.getByTestId('pipeline-step-ship')).toHaveAttribute('data-status', 'pending');
    expect(screen.getByText(/not because anything recorded them finishing/)).toBeInTheDocument();
  });

  it('lets a recorded pending on the current step lose to the fresher status', async () => {
    mocks.storeState.pipelineConfigByProject[PROJECT_PATH] = {
      version: 1,
      steps: [makeStep('design', 'Design', 1), makeStep('build', 'Build', 2)],
    };

    await renderPanel(
      makeFeature({
        status: 'pipeline_build',
        pipelineProgress: [{ stepId: 'build', stepName: 'Build', status: 'pending' }],
      } as Partial<Feature>)
    );

    expect(screen.getByTestId('pipeline-step-build')).toHaveAttribute('data-status', 'running');
  });
});

describe('PhasesTodosPanel live todos', () => {
  it('takes the list from the TodoWrite event rather than waiting on the transcript', async () => {
    await renderPanel(makeFeature());
    await waitFor(() => expect(mocks.getAgentOutput).toHaveBeenCalledTimes(1));

    emit({
      type: 'auto_mode_tool',
      featureId: FEATURE_ID,
      tool: 'TodoWrite',
      input: {
        todos: [
          { content: 'Read the config', status: 'completed' },
          { content: 'Write the route', status: 'in_progress', activeForm: 'Writing the route' },
        ],
      },
    } as AutoModeEvent);

    expect(screen.getByTestId('live-todo-0')).toHaveAttribute('data-status', 'completed');
    // `activeForm` is what the agent is doing right now; it reads better than
    // the imperative while the todo is in flight.
    expect(screen.getByTestId('live-todo-1')).toHaveTextContent('Writing the route');
  });

  it('ignores TodoWrite from another feature and tool calls that are not TodoWrite', async () => {
    await renderPanel(makeFeature());
    await waitFor(() => expect(mocks.getAgentOutput).toHaveBeenCalledTimes(1));

    emit({
      type: 'auto_mode_tool',
      featureId: 'another-feature',
      tool: 'TodoWrite',
      input: { todos: [{ content: 'Someone else', status: 'pending' }] },
    } as AutoModeEvent);
    emit({
      type: 'auto_mode_tool',
      featureId: FEATURE_ID,
      tool: 'Read',
      input: { file_path: '/repo/src/index.ts' },
    } as AutoModeEvent);

    expect(screen.queryByTestId('live-todo-0')).not.toBeInTheDocument();
  });

  it('does not read the transcript while the pane is hidden', async () => {
    // getAgentOutput returns megabytes for a long run; six panes stay mounted
    // for every open task, so a hidden pane must not ask for it.
    await renderPanel(makeFeature(), false);

    await Promise.resolve();
    expect(mocks.getAgentOutput).not.toHaveBeenCalled();
  });

  it('still takes a live TodoWrite while hidden, since the event is the only copy', async () => {
    await renderPanel(makeFeature(), false);

    emit({
      type: 'auto_mode_tool',
      featureId: FEATURE_ID,
      tool: 'TodoWrite',
      input: { todos: [{ content: 'Read the config', status: 'pending' }] },
    } as AutoModeEvent);

    expect(screen.getByTestId('live-todo-0')).toBeInTheDocument();
    expect(mocks.getAgentOutput).not.toHaveBeenCalled();
  });
});
