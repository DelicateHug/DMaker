/**
 * Agents pane E2E — the sub-agent chain.
 *
 * The core requirement of the whole workbench overhaul: a run is a TREE of
 * agents, and the pane has to let you walk it. Master sits on row 0; clicking an
 * agent that spawned others appends a row holding them and dims the agents above
 * it into ancestors; clicking back up drops every row below.
 *
 * The tree is SEEDED as `logs/agent-tree.json`, because it cannot be generated:
 * the suite runs with `DMAKER_MOCK_AGENT=true` and the mock returns after three
 * progress events without ever issuing a Task call. The sidecar is the same file
 * `AutoModeService` writes at teardown and `POST /api/running-agents/tree` falls
 * back to, so the pane cannot tell the difference.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  agentChainItem,
  agentChainRow,
  agentTranscriptMarker,
  buildSeededAgentTree,
  cleanupTempDir,
  createTempDirPath,
  fetchAgentTree,
  openTaskWorkbench,
  openWorkbenchBoard,
  seedAgentTranscript,
  seedAgentTree,
  seedWorkbenchFeatures,
  selectWorkbenchTab,
  workbenchPane,
  type SeededFeature,
  type WorkbenchProject,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('agents-chain-test');

/** A run that spawned nothing — the shape of every pre-tracker run on disk. */
const SOLO_FEATURE: SeededFeature = {
  id: 'feat-solo-run',
  status: 'backlog',
  title: 'A single-agent run',
};

/** A run with two sub-agents, one of which went two levels deeper. */
const TREE_FEATURE: SeededFeature = {
  id: 'feat-agent-tree',
  status: 'in_progress',
  title: 'A run that branched',
};

const MASTER = 'master';
const CHILD_A = 'toolu_child_a';
const CHILD_B = 'toolu_child_b';
const GRANDCHILD = 'toolu_grandchild';
const GREAT_GRANDCHILD = 'toolu_great_grandchild';

/**
 * Master, two children, a grandchild under the first child, and one level
 * below that.
 *
 * Five nodes rather than four on purpose: with only a grandchild, "clicking the
 * grandchild appends another row" cannot hold — a leaf has no children and the
 * chain correctly stops. The fifth node is what lets the append rule be
 * asserted at depth 2 as well as depth 1, while child B stays a leaf so the
 * truncation rule is asserted too.
 */
const AGENT_TREE = buildSeededAgentTree(TREE_FEATURE.id, [
  {
    id: MASTER,
    parentId: null,
    depth: 0,
    name: 'Master',
    model: 'claude-opus-4-6',
    status: 'completed',
    startedAt: '2026-08-01T09:00:00.000Z',
    endedAt: '2026-08-01T09:12:00.000Z',
    toolCallCount: 9,
    index: 0,
  },
  {
    id: CHILD_A,
    parentId: MASTER,
    depth: 1,
    name: 'code-reviewer',
    description: 'Review the diff',
    prompt: 'Review the parser change for correctness.',
    status: 'completed',
    startedAt: '2026-08-01T09:02:00.000Z',
    endedAt: '2026-08-01T09:05:00.000Z',
    toolCallCount: 4,
    index: 1,
    result: 'Found one off-by-one in the hunk header.',
  },
  {
    id: CHILD_B,
    parentId: MASTER,
    depth: 1,
    name: 'test-runner',
    description: 'Run the tests',
    prompt: 'Run the unit suite and report failures.',
    status: 'failed',
    startedAt: '2026-08-01T09:06:00.000Z',
    endedAt: '2026-08-01T09:07:30.000Z',
    toolCallCount: 2,
    index: 2,
    isError: true,
    result: 'Two tests failed in the diff parser suite.',
  },
  {
    id: GRANDCHILD,
    parentId: CHILD_A,
    depth: 2,
    name: 'doc-writer',
    description: 'Write the notes',
    status: 'completed',
    startedAt: '2026-08-01T09:03:00.000Z',
    endedAt: '2026-08-01T09:04:00.000Z',
    toolCallCount: 1,
    index: 3,
  },
  {
    id: GREAT_GRANDCHILD,
    parentId: GRANDCHILD,
    depth: 3,
    name: 'link-checker',
    description: 'Check the links',
    status: 'completed',
    startedAt: '2026-08-01T09:03:30.000Z',
    endedAt: '2026-08-01T09:03:50.000Z',
    toolCallCount: 1,
    index: 4,
  },
]);

/** Master prose, then child A's, then master again — the real interleaving. */
const MASTER_LINE = 'Master picked the parser apart first.';
const CHILD_A_LINE = 'Child A walked every hunk header.';
const MASTER_TAIL_LINE = 'Master applied the fix the reviewer asked for.';

const TREE_TRANSCRIPT = [
  agentTranscriptMarker(MASTER, 'Master', '2026-08-01T09:00:00.000Z'),
  MASTER_LINE,
  '',
  agentTranscriptMarker(CHILD_A, 'code-reviewer', '2026-08-01T09:02:00.000Z'),
  CHILD_A_LINE,
  '',
  agentTranscriptMarker(MASTER, 'Master', '2026-08-01T09:08:00.000Z'),
  MASTER_TAIL_LINE,
  '',
].join('\n');

test.describe('Agents pane chain', () => {
  // Hooks share the test's budget, and every test here pays for a board boot
  // plus the sidecar gate below before it asserts anything. The default 30s is
  // enough on a warm machine and not enough on a cold one — which is a flake,
  // not a signal.
  test.describe.configure({ timeout: 90_000 });

  let project: WorkbenchProject;

  test.beforeAll(async () => {
    fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    const projectName = `agents-chain-${Date.now()}`;
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

    project = {
      projectPath,
      projectName,
      projectId: `agents-chain-project-${Date.now()}`,
    };
  });

  test.afterAll(async () => {
    if (process.env.KEEP_TEST_DIR === 'true') return;
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test.beforeEach(async ({ page }) => {
    // Re-seed every time: the sidecar and the transcript live inside the
    // feature's directory, and seeding wipes `.dmaker/features` first.
    seedWorkbenchFeatures(project.projectPath, [SOLO_FEATURE, TREE_FEATURE]);
    seedAgentTree(project.projectPath, TREE_FEATURE, AGENT_TREE);
    seedAgentTranscript(project.projectPath, TREE_FEATURE, TREE_TRANSCRIPT);

    await openWorkbenchBoard(page, project);

    // Gate every test on the server actually serving the sidecar, not just on
    // the file existing. `FeatureLoader` resolves a feature's directory through
    // a cache keyed by feature id that only a feature read populates, so an
    // unwarmed lookup reads the wrong path, gets ENOENT and answers `null` —
    // which the pane faithfully renders as a one-node tree. Failing here names
    // the endpoint instead of leaving a mystery empty chain in every test.
    await expect(async () => {
      const tree = await fetchAgentTree(page, project.projectPath, TREE_FEATURE.id);
      expect(tree?.order ?? []).toHaveLength(5);
    }).toPass({ timeout: 20000 });
  });

  test('a run with no tree renders Master alone, and says so', async ({ page }) => {
    await openTaskWorkbench(page, SOLO_FEATURE.id);
    await selectWorkbenchTab(page, 'agents');

    const pane = workbenchPane(page, 'agents');

    // The synthesised fallback: no sidecar is the normal answer for every run
    // recorded before the tree was tracked, and for every non-Claude provider.
    await expect(agentChainItem(page, MASTER)).toBeVisible({ timeout: 15000 });
    await expect(agentChainRow(page, 0)).toBeVisible();
    await expect(agentChainRow(page, 1)).toHaveCount(0);
    await expect(pane.locator('[data-testid="agent-spawn-notice"]')).toContainText(
      'No sub-agents spawned — this run was a single agent.'
    );
  });

  test('clicking an agent appends a row of its children and dims its ancestors', async ({
    page,
  }) => {
    await openTaskWorkbench(page, TREE_FEATURE.id);
    await selectWorkbenchTab(page, 'agents');

    const pane = workbenchPane(page, 'agents');

    // Master is selected on open, so its own children are already a row: the
    // chain is as deep as the selection, never deeper.
    await expect(agentChainItem(page, MASTER)).toHaveAttribute('data-state', 'selected', {
      timeout: 15000,
    });
    await expect(agentChainRow(page, 1)).toBeVisible();
    await expect(agentChainItem(page, CHILD_A)).toHaveAttribute('data-state', 'idle');
    await expect(agentChainItem(page, CHILD_B)).toHaveAttribute('data-state', 'idle');
    await expect(agentChainRow(page, 2)).toHaveCount(0);
    await expect(pane.locator('[data-testid="agent-spawn-notice"]')).toContainText(
      'Spawned 4 sub-agents.'
    );

    // Depth 1 → a new row of that agent's children, and Master becomes context.
    await agentChainItem(page, CHILD_A).click();
    await expect(agentChainRow(page, 2)).toBeVisible();
    await expect(
      agentChainRow(page, 2).locator(`[data-testid="agent-chain-item-${GRANDCHILD}"]`)
    ).toBeVisible();
    await expect(agentChainItem(page, CHILD_A)).toHaveAttribute('data-state', 'selected');
    await expect(agentChainItem(page, MASTER)).toHaveAttribute('data-state', 'ancestor');
    await expect(agentChainRow(page, 3)).toHaveCount(0);

    // Depth 2 → another row. Every agent above the selection is an ancestor.
    await agentChainItem(page, GRANDCHILD).click();
    await expect(agentChainRow(page, 3)).toBeVisible();
    await expect(
      agentChainRow(page, 3).locator(`[data-testid="agent-chain-item-${GREAT_GRANDCHILD}"]`)
    ).toBeVisible();
    await expect(agentChainItem(page, GRANDCHILD)).toHaveAttribute('data-state', 'selected');
    await expect(agentChainItem(page, CHILD_A)).toHaveAttribute('data-state', 'ancestor');
    await expect(agentChainItem(page, MASTER)).toHaveAttribute('data-state', 'ancestor');

    // Back up to a sibling that spawned nothing: every row below it goes.
    await agentChainItem(page, CHILD_B).click();
    await expect(agentChainItem(page, CHILD_B)).toHaveAttribute('data-state', 'selected');
    await expect(agentChainItem(page, MASTER)).toHaveAttribute('data-state', 'ancestor');
    await expect(agentChainRow(page, 2)).toHaveCount(0);
    await expect(agentChainRow(page, 3)).toHaveCount(0);
  });

  test('the spawn notice offers the selected agent’s children as a shortcut', async ({ page }) => {
    await openTaskWorkbench(page, TREE_FEATURE.id);
    await selectWorkbenchTab(page, 'agents');

    const pane = workbenchPane(page, 'agents');
    const chip = pane.locator(`[data-testid="agent-spawn-chip-${CHILD_B}"]`);

    await expect(chip).toBeVisible({ timeout: 15000 });
    await chip.click();

    await expect(agentChainItem(page, CHILD_B)).toHaveAttribute('data-state', 'selected');
    await expect(agentChainItem(page, MASTER)).toHaveAttribute('data-state', 'ancestor');
  });

  test('the transcript follows the selected agent', async ({ page }) => {
    await openTaskWorkbench(page, TREE_FEATURE.id);
    await selectWorkbenchTab(page, 'agents');

    const pane = workbenchPane(page, 'agents');

    // Master selected with sub-agents included is the state the pane opens in,
    // and it must be the whole run byte for byte — that is what makes this pane
    // non-regressive against the flat transcript it replaced.
    await expect(pane).toContainText(MASTER_LINE, { timeout: 15000 });
    await expect(pane).toContainText(CHILD_A_LINE);
    await expect(pane).toContainText(MASTER_TAIL_LINE);

    // "This agent only" narrows to lines the `[agent:…]` markers attribute to
    // whoever is selected.
    await pane.locator('[data-testid="agents-include-descendants"]').click();
    await expect(pane.locator('[data-testid="agents-include-descendants"]')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await expect(pane).toContainText(MASTER_LINE);
    await expect(pane).not.toContainText(CHILD_A_LINE);

    await agentChainItem(page, CHILD_A).click();
    await expect(pane).toContainText(CHILD_A_LINE);
    await expect(pane).not.toContainText(MASTER_LINE);
  });

  test('a sub-agent’s final answer gets its own place, error and all', async ({ page }) => {
    await openTaskWorkbench(page, TREE_FEATURE.id);
    await selectWorkbenchTab(page, 'agents');

    const pane = workbenchPane(page, 'agents');

    await expect(agentChainItem(page, CHILD_B)).toBeVisible({ timeout: 15000 });
    await expect(agentChainItem(page, CHILD_B)).toHaveAttribute('data-agent-status', 'failed');
    await agentChainItem(page, CHILD_B).click();

    // The tool_result is the only thing a sub-agent ever "says", so it is
    // surfaced rather than left at the tail of a timeline it has no lines in.
    const result = pane.locator('[data-testid="agent-result"]');
    await expect(result).toBeVisible();
    await expect(result).toContainText('Returned an error');
    await expect(result).toContainText('Two tests failed in the diff parser suite.');

    // Master has no result block of its own — it is not a Task call.
    await agentChainItem(page, MASTER).click();
    await expect(pane.locator('[data-testid="agent-result"]')).toHaveCount(0);
  });
});
