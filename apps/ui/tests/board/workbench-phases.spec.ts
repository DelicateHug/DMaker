/**
 * Phases pane E2E — a task that actually has a plan and a pipeline.
 *
 * `workbench-panes.spec.ts` covers the floor ("Nothing planned yet."). This
 * covers the two sections that only appear once there is something to show,
 * and both of them are DERIVATIONS rather than stored facts, which is exactly
 * why they need an end-to-end test:
 *
 *  - **Per-task status.** `planSpec.tasks[i].status` on disk reads `'pending'`
 *    for every task of every feature written before the server began recording
 *    it, so the panel ignores it and derives status in `planSpecToTasks` from
 *    `tasksCompleted` (a prefix count over the flat list) and `currentTaskId`.
 *    Asserting the raw field would pass against a panel that renders nothing
 *    but grey circles.
 *  - **Pipeline completion.** Steps with no recorded outcome are *deduced* from
 *    their position and labelled `inferred`, and a recorded `'pending'` on the
 *    step the feature is parked on loses to the feature's own status. Both
 *    rules are invisible unless a run's records are deliberately incomplete.
 *
 * All of it is SEEDED. The suite runs with `DMAKER_MOCK_AGENT=true`, whose mock
 * returns after three progress events without ever writing a plan or entering
 * a pipeline step, so no amount of running produces this state.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  cleanupTempDir,
  createTempDirPath,
  fetchStoredFeature,
  openTaskWorkbench,
  openWorkbenchBoard,
  seedWorkbenchFeatures,
  selectWorkbenchTab,
  workbenchPane,
  type SeededFeature,
  type WorkbenchProject,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('workbench-phases-test');

// ---------------------------------------------------------------------------
// The plan
//
// Two named phases, deliberately NOT in alphabetical order and deliberately
// interleaved: "Cutover" sits between two "Foundation" tasks. That pins two
// separate rules at once — groups render in first-seen order rather than
// sorted, and a task's status comes from its index in the flat plan rather
// than from its position inside its group.
// ---------------------------------------------------------------------------

const FOUNDATION = 'Foundation';
const CUTOVER = 'Cutover';

const PLAN_TASKS = [
  { id: 'task-schema', description: 'Define the plan schema', phase: FOUNDATION },
  { id: 'task-loader', description: 'Teach the loader to read it', phase: FOUNDATION },
  { id: 'task-swap', description: 'Swap the board over', phase: CUTOVER },
  {
    id: 'task-backfill',
    description: 'Backfill the plans already on disk',
    phase: FOUNDATION,
    filePath: 'src/plan/backfill.ts',
  },
  { id: 'task-notes', description: 'Write the migration note', phase: CUTOVER },
] as const;

/** Three tasks done and the fourth in flight — the derivation's whole input. */
const TASKS_COMPLETED = 3;
const CURRENT_TASK_ID = 'task-backfill';

/**
 * What the panel must render, derived by `planSpecToTasks`.
 *
 * Note `task-swap`: index 2, so the prefix count makes it complete even though
 * it belongs to the SECOND group and the group above it still has work in it.
 * That is what the derivation says, and pinning it here is the point.
 */
const EXPECTED_TASK_STATUS: Record<string, string> = {
  'task-schema': 'completed',
  'task-loader': 'completed',
  'task-swap': 'completed',
  'task-backfill': 'in_progress',
  'task-notes': 'pending',
};

const PLANNED_FEATURE: SeededFeature = {
  id: 'feat-planned',
  status: 'in_progress',
  title: 'A task working through a plan',
  planSpec: {
    status: 'approved',
    version: 1,
    reviewedByUser: true,
    content: '# Plan\n\nTwo phases.\n',
    tasksTotal: PLAN_TASKS.length,
    tasksCompleted: TASKS_COMPLETED,
    currentTaskId: CURRENT_TASK_ID,
    // Every task is written with the status it has on disk in the real world:
    // 'pending', forever. The panel must never read it.
    tasks: PLAN_TASKS.map((task) => ({ ...task, status: 'pending' })),
  },
};

// ---------------------------------------------------------------------------
// The pipeline
//
// Four steps, and a run that recorded only some of them. `scope` ran but was
// never written down; `draft` was; `review` carries a stale 'pending' record
// from before the run reached it; `ship` has not happened.
// ---------------------------------------------------------------------------

const PIPELINE_STEPS = [
  { id: 'scope', name: 'Scope the work', order: 0 },
  { id: 'draft', name: 'Draft the change', order: 1 },
  { id: 'review', name: 'Review the change', order: 2 },
  { id: 'ship', name: 'Ship it', order: 3 },
] as const;

/** What each step must render as, and whether the panel had to guess. */
const EXPECTED_PIPELINE: Array<{ id: string; status: string; inferred: string }> = [
  { id: 'scope', status: 'completed', inferred: 'true' },
  { id: 'draft', status: 'completed', inferred: 'false' },
  { id: 'review', status: 'running', inferred: 'false' },
  { id: 'ship', status: 'pending', inferred: 'false' },
];

const PIPELINE_FEATURE: SeededFeature = {
  id: 'feat-pipelined',
  // The status is what names the current step: `pipeline_` + the step id.
  status: 'pipeline_review',
  title: 'A task parked mid-pipeline',
  pipelineProgress: [
    {
      stepId: 'draft',
      stepName: 'Draft the change',
      status: 'completed',
      startedAt: '2026-08-01T09:00:00.000Z',
      completedAt: '2026-08-01T09:20:00.000Z',
    },
    // Written when the pipeline was planned, never updated when the run got
    // here. The feature's own status is the fresher fact and must win.
    { stepId: 'review', stepName: 'Review the change', status: 'pending' },
  ],
};

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

function phasesPane(page: Page): Locator {
  return workbenchPane(page, 'phases');
}

/**
 * A phase's group.
 *
 * The key is `phase:<the exact string the plan wrote>` — never a number parsed
 * out of it, and never a task id, so it survives a plan revision that replaces
 * every task id.
 */
function phaseGroup(page: Page, phase: string): Locator {
  return phasesPane(page).locator(`[data-testid="phase-group-phase:${phase}"]`);
}

function phaseTask(page: Page, taskId: string): Locator {
  return phasesPane(page).locator(`[data-testid="phase-task-${taskId}"]`);
}

function pipelineStep(page: Page, stepId: string): Locator {
  return phasesPane(page).locator(`[data-testid="pipeline-step-${stepId}"]`);
}

// ---------------------------------------------------------------------------
// Reading the plan back off disk
// ---------------------------------------------------------------------------

/**
 * The plan as the server has it.
 *
 * `StoredFeature` carries `planSpec` through its index signature, so it arrives
 * as `unknown` and has to be named somewhere. Only the fields these assertions
 * touch are declared — the point is the stored `status`, which never moves.
 */
interface StoredPlanSpec {
  tasksCompleted?: number;
  currentTaskId?: string;
  tasks?: Array<{ id: string; status?: string }>;
}

async function fetchStoredPlan(
  page: Page,
  projectPath: string,
  featureId: string
): Promise<StoredPlanSpec | null> {
  const feature = await fetchStoredFeature(page, projectPath, featureId);
  return (feature?.planSpec as StoredPlanSpec | undefined) ?? null;
}

test.describe('Phases pane', () => {
  // Hooks share the test's budget, and every test here pays for a board boot
  // plus the feature gate below before it asserts anything. The default 30s is
  // enough on a warm machine and not enough on a cold one — which is a flake,
  // not a signal.
  test.describe.configure({ timeout: 90_000 });

  let project: WorkbenchProject;

  test.beforeAll(async () => {
    fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    const projectName = `workbench-phases-${Date.now()}`;
    const projectPath = path.join(TEST_TEMP_DIR, projectName);

    fs.mkdirSync(path.join(projectPath, '.dmaker', 'context'), { recursive: true });
    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ name: projectName, version: '1.0.0' }, null, 2)
    );
    fs.writeFileSync(
      path.join(projectPath, '.dmaker', 'categories.json'),
      JSON.stringify({ categories: [] }, null, 2)
    );

    // The pipeline section reads the project's steps out of the app store,
    // which the board fills from `POST /api/pipeline/config` — served straight
    // from this file. There is no per-feature copy of the step list.
    fs.writeFileSync(
      path.join(projectPath, '.dmaker', 'pipeline.json'),
      JSON.stringify(
        {
          version: 1,
          steps: PIPELINE_STEPS.map((step) => ({
            ...step,
            instructions: `Do the ${step.name.toLowerCase()} work.`,
            colorClass: 'bg-blue-500',
            createdAt: '2026-08-01T08:00:00.000Z',
            updatedAt: '2026-08-01T08:00:00.000Z',
          })),
        },
        null,
        2
      )
    );

    project = {
      projectPath,
      projectName,
      projectId: `workbench-phases-project-${Date.now()}`,
    };
  });

  test.afterAll(async () => {
    if (process.env.KEEP_TEST_DIR === 'true') return;
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test.beforeEach(async ({ page }) => {
    // Re-seed every time: seeding wipes `.dmaker/features`, and features move
    // between status directories, so a spec that inherits the previous one's
    // leftovers reads as a mysterious extra row in the sidebar.
    seedWorkbenchFeatures(project.projectPath, [PLANNED_FEATURE, PIPELINE_FEATURE]);

    await openWorkbenchBoard(page, project);

    // Gate every test on the server serving the seeded plan, not on the file
    // existing. The board loads titles first and full feature data second, and
    // `planSpec` only arrives with the second pass — an ungated test races it
    // and fails inside the panel with nothing pointing at the cause.
    await expect(async () => {
      const plan = await fetchStoredPlan(page, project.projectPath, PLANNED_FEATURE.id);
      expect(plan?.tasks ?? []).toHaveLength(PLAN_TASKS.length);
    }).toPass({ timeout: 20000 });
  });

  test('groups the plan by phase, in the order the plan named them', async ({ page }) => {
    await openTaskWorkbench(page, PLANNED_FEATURE.id);
    await selectWorkbenchTab(page, 'phases');

    const pane = phasesPane(page);
    await expect(pane.locator('[data-testid="phases-section"]')).toBeVisible({ timeout: 20000 });

    // First-seen order, not sorted: "Cutover" precedes "Foundation"
    // alphabetically and comes second here because the plan named it second.
    const groups = pane.locator('[data-testid^="phase-group-"]');
    await expect(groups).toHaveCount(2);
    await expect(groups.nth(0)).toContainText(FOUNDATION);
    await expect(groups.nth(1)).toContainText(CUTOVER);

    // Tasks keep their plan order within a phase, and a phase collects its
    // tasks even when another phase's task was written between them.
    await expect(phaseGroup(page, FOUNDATION).locator('[data-testid^="phase-task-"]')).toHaveCount(
      3
    );
    await expect(phaseGroup(page, CUTOVER).locator('[data-testid^="phase-task-"]')).toHaveCount(2);
    await expect(phaseGroup(page, FOUNDATION)).toContainText('Backfill the plans already on disk');
    await expect(phaseGroup(page, CUTOVER)).toContainText('Write the migration note');

    // The file a task names is worth showing — it is how a reviewer finds the
    // change the task is about.
    await expect(phaseTask(page, 'task-backfill')).toContainText('src/plan/backfill.ts');
  });

  test('renders each task at its derived status, not the one stored on disk', async ({ page }) => {
    await openTaskWorkbench(page, PLANNED_FEATURE.id);
    await selectWorkbenchTab(page, 'phases');

    const pane = phasesPane(page);
    await expect(pane.locator('[data-testid="phases-section"]')).toBeVisible({ timeout: 20000 });

    for (const [taskId, status] of Object.entries(EXPECTED_TASK_STATUS)) {
      await expect(phaseTask(page, taskId), `${taskId} should render as ${status}`).toHaveAttribute(
        'data-status',
        status
      );
    }

    // The count is the same derivation, rolled up.
    await expect(pane.locator('[data-testid="phases-section"]')).toContainText(
      `${TASKS_COMPLETED}/${PLAN_TASKS.length}`
    );

    // And the fact that makes all of the above load-bearing: on disk every one
    // of those tasks still says 'pending'. A panel that read the stored field
    // would show five grey circles and pass no assertion above.
    const plan = await fetchStoredPlan(page, project.projectPath, PLANNED_FEATURE.id);
    expect(plan?.tasks?.map((task) => task.status)).toEqual(PLAN_TASKS.map(() => 'pending'));
  });

  test('marks a pipeline step it had to guess about, and lets the run overrule a stale record', async ({
    page,
  }) => {
    await openTaskWorkbench(page, PIPELINE_FEATURE.id);
    await selectWorkbenchTab(page, 'phases');

    const pane = phasesPane(page);
    await expect(pane.locator('[data-testid="pipeline-section"]')).toBeVisible({ timeout: 20000 });

    for (const step of EXPECTED_PIPELINE) {
      const row = pipelineStep(page, step.id);
      await expect(row, `${step.id} should render as ${step.status}`).toHaveAttribute(
        'data-status',
        step.status
      );
      await expect(row, `${step.id} inferred=${step.inferred}`).toHaveAttribute(
        'data-inferred',
        step.inferred
      );
    }

    // The badge and the sentence are the honesty: "Scope the work" is shown as
    // done because it comes earlier, and nothing recorded it finishing.
    await expect(pipelineStep(page, 'scope')).toContainText('inferred');
    await expect(pane.locator('[data-testid="pipeline-section"]')).toContainText(
      'not because anything recorded them finishing'
    );

    // This feature has no plan at all, so the Phases section stays away rather
    // than showing an empty heading.
    await expect(pane.locator('[data-testid="phases-section"]')).toHaveCount(0);
  });
});
