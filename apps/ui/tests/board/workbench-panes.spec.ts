/**
 * Workbench panes E2E — the six panes, with nothing to show.
 *
 * Two things this proves, both of which only an E2E can:
 *
 *  1. Every pane is reachable and renders a REAL state for a task that has
 *     never been run. Each pane was deliberately built to render an honest
 *     empty state rather than `null` — "Nothing planned yet.", "Nothing to
 *     answer.", "No sub-agents spawned" — precisely so this assertion can be
 *     made. A pane that returned `null` would still satisfy the tab-strip
 *     check in `workbench-status.spec.ts`; it cannot satisfy this one.
 *  2. A tab id persisted before the panes were reworked still lands on its
 *     successor. `activeTab` lives in localStorage, so everyone who last sat on
 *     Terminal has `'terminal'` stored; without the alias map they are silently
 *     teleported to the default pane.
 *
 * Nothing here runs an agent: the suite is hardcoded to `DMAKER_MOCK_AGENT`,
 * whose mock returns after three progress events, so seeded state is the only
 * state there is.
 */

import { test, expect, type Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  cleanupTempDir,
  createTempDirPath,
  createTestGitRepo,
  commitFile,
  openTaskWorkbench,
  openWorkbenchBoard,
  seedPersistedWorkbenchTab,
  seedWorkbenchFeatures,
  selectWorkbenchTab,
  workbenchPane,
  WORKBENCH_TAB_IDS,
  type WorkbenchPaneId,
  type WorkbenchProject,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('workbench-panes-test');

/** The one task these tests open. Never run, so every pane is at its floor. */
const FEATURE_ID = 'feat-untouched';

/**
 * What each pane must put on screen for a task with no data at all.
 *
 * Scoped to the pane's own host: panes stay mounted once visited and are hidden
 * with `visibility: hidden`, so a testid belonging to another pane is still in
 * the DOM and only a host-scoped `toBeVisible()` tells them apart.
 */
const PANE_EXPECTATIONS: Record<WorkbenchPaneId, (pane: Locator) => Promise<void>> = {
  agents: async (pane) => {
    await expect(pane.locator('[data-testid="agents-pane"]')).toBeVisible({ timeout: 15000 });
    // The synthesised one-node tree: every run recorded before the tracker
    // existed takes this path, so it is the common case, not an error case.
    await expect(pane.locator('[data-testid="agent-chain-item-master"]')).toBeVisible({
      timeout: 15000,
    });
    await expect(pane.locator('[data-testid="agent-spawn-notice"]')).toContainText(
      'No sub-agents spawned'
    );
    await expect(pane.locator('[data-testid="agents-empty"]')).toContainText('No agent output yet');
  },

  changes: async (pane) => {
    await expect(pane.locator('[data-testid="changes-pane"]')).toBeVisible({ timeout: 15000 });
    await expect(pane.locator('[data-testid="changes-file-count"]')).toContainText('0 files');
    // The repo is committed clean, so this is the honest empty state rather
    // than an error or a spinner that never resolves.
    await expect(pane.locator('[data-testid="changes-empty"]')).toContainText(
      'No uncommitted changes',
      { timeout: 15000 }
    );
  },

  phases: async (pane) => {
    await expect(pane.locator('[data-testid="phases-todos-panel"]')).toBeVisible({
      timeout: 15000,
    });
    await expect(pane.locator('[data-testid="phases-empty"]')).toBeVisible();
    await expect(pane.locator('[data-testid="phases-todos-panel"]')).toContainText(
      'Nothing planned yet.'
    );
  },

  questions: async (pane) => {
    await expect(pane.locator('[data-testid="agent-questions-panel"]')).toBeVisible({
      timeout: 15000,
    });
    await expect(pane.locator('[data-testid="agent-questions-panel"]')).toContainText(
      'Nothing to answer.'
    );
  },

  chat: async (pane) => {
    await expect(pane.locator('[data-testid="chat-composer"]')).toBeVisible({ timeout: 15000 });
    await expect(pane.locator('[data-testid="chat-send"]')).toBeVisible();
    // The hint is the pane explaining why the button is disabled — an empty
    // one would leave a dead button with no explanation.
    await expect(pane.locator('[data-testid="chat-status"]')).not.toBeEmpty();
  },

  browser: async (pane) => {
    await expect(pane).toContainText('No dev server running', { timeout: 15000 });
  },
};

test.describe('Workbench panes', () => {
  // The first test walks all six panes and waits for each to render real
  // content; the board boot in the hooks comes out of the same budget. The
  // default 30s clears it on a warm machine and not on a cold one.
  test.describe.configure({ timeout: 90_000 });

  let project: WorkbenchProject;

  test.beforeAll(async () => {
    // A real git repo with a clean tree: only then is "No uncommitted changes"
    // the Changes pane's true answer. A plain directory is not a git repo, and
    // the server then reports every file in it as new.
    const repo = await createTestGitRepo(TEST_TEMP_DIR);
    fs.mkdirSync(path.join(repo.path, '.dmaker', 'context'), { recursive: true });

    // `.dmaker/` is where these specs seed their state and `.worktrees/` is
    // where the app would put a worktree. Ignoring both keeps the tree clean.
    await commitFile(
      repo.path,
      '.gitignore',
      '.dmaker/\n.worktrees/\n',
      'chore: ignore local state'
    );
    await commitFile(
      repo.path,
      'package.json',
      `${JSON.stringify({ name: 'workbench-panes-fixture', version: '1.0.0' }, null, 2)}\n`,
      'chore: add a manifest'
    );

    project = {
      projectPath: repo.path,
      projectName: `workbench-panes-${Date.now()}`,
      projectId: `workbench-panes-project-${Date.now()}`,
    };
  });

  test.afterAll(async () => {
    if (process.env.KEEP_TEST_DIR === 'true') return;
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test.beforeEach(async () => {
    seedWorkbenchFeatures(project.projectPath, [
      {
        id: FEATURE_ID,
        status: 'backlog',
        title: 'A task nothing has touched',
      },
    ]);
  });

  test('every pane is reachable and renders an honest empty state', async ({ page }) => {
    await openWorkbenchBoard(page, project);
    await openTaskWorkbench(page, FEATURE_ID);

    for (const paneId of WORKBENCH_TAB_IDS) {
      await selectWorkbenchTab(page, paneId);
      await PANE_EXPECTATIONS[paneId](workbenchPane(page, paneId));
    }

    // Visited panes stay mounted — that is what preserves scroll positions,
    // file selections and an unsent chat draft across a tab switch. Browser is
    // the pane the loop left on, so it is the one that must go inactive
    // WITHOUT unmounting.
    await selectWorkbenchTab(page, 'agents');
    await expect(workbenchPane(page, 'browser')).toHaveAttribute('data-active', 'false');
    await expect(workbenchPane(page, 'browser')).toHaveCount(1);
  });

  test('a task last left on the retired Terminal tab opens on Chat', async ({ page }) => {
    // Must be registered before the app boots: workbench-store reads
    // localStorage once, at module scope.
    await seedPersistedWorkbenchTab(page, 'terminal');

    await openWorkbenchBoard(page, project);
    await openTaskWorkbench(page, FEATURE_ID);

    await expect(page.locator('[data-testid="workbench-tab-chat"]')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(workbenchPane(page, 'chat')).toHaveAttribute('data-active', 'true');
    await expect(workbenchPane(page, 'chat').locator('[data-testid="chat-composer"]')).toBeVisible({
      timeout: 15000,
    });

    // The proof that this is the alias and not the default: panes mount only
    // once visited, and the default pane is Agents. Had `'terminal'` failed
    // validation and fallen through, this is the pane that would exist.
    await expect(workbenchPane(page, 'agents')).toHaveCount(0);
  });

  test('a persisted tab id from no version of the app still lands on the default', async ({
    page,
  }) => {
    // The alias map must not become a validator: an unknown id has to resolve
    // to the default rather than to a blank workbench.
    await seedPersistedWorkbenchTab(page, 'not-a-real-pane');

    await openWorkbenchBoard(page, project);
    await openTaskWorkbench(page, FEATURE_ID);

    await expect(page.locator('[data-testid="workbench-tab-agents"]')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(workbenchPane(page, 'agents')).toHaveAttribute('data-active', 'true');
  });
});
