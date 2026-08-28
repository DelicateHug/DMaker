/**
 * Workbench + sidebar status E2E
 *
 * Covers the three things a task row has to get right:
 *  - every status carries its OWN glyph, not a shared dot
 *  - a task with an agent running on it shows a spinner instead
 *  - opening a task gives working Agent / Diff / Files / Terminal / Browser panes
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  createTempDirPath,
  cleanupTempDir,
  createTestFeature,
  setupRealProject,
  waitForNetworkIdle,
  authenticateForTests,
  API_BASE_URL,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('workbench-status-test');

/** Backend under test — the same URL the app talks to. */
const SERVER_URL = API_BASE_URL;

/** One seeded task per status we render a glyph for. */
const SEEDED = [
  { id: 'feat-backlog', status: 'backlog', title: 'Backlog task' },
  { id: 'feat-planning', status: 'planning', title: 'Planning task' },
  { id: 'feat-building', status: 'building', title: 'Building task' },
  { id: 'feat-in-progress', status: 'in_progress', title: 'In progress task' },
  { id: 'feat-waiting', status: 'waiting_approval', title: 'Waiting task' },
  { id: 'feat-completed', status: 'completed', title: 'Completed task' },
] as const;

/**
 * Completed tasks are deliberately kept out of the sidebar (HIDDEN_STATUSES),
 * so only these get a row to assert against.
 */
const SEEDED_IN_SIDEBAR = SEEDED.filter((feature) => feature.status !== 'completed');

/** The row for a seeded task, addressed by the id we wrote to disk. */
function row(page: Page, featureId: string) {
  return page.locator(`[data-testid="sidebar-feature-row"][data-feature-id="${featureId}"]`);
}

/**
 * The sidebar narrows to the board's funnel filter, which starts on a single
 * status. Widen it to "All" so every seeded task has a row to assert against.
 */
async function showAllStatuses(page: Page) {
  await page.locator('[data-testid="board-status-dropdown-trigger"]').click();
  await expect(page.locator('[data-testid="board-status-dropdown-content"]')).toBeVisible({
    timeout: 5000,
  });
  await page.locator('[data-testid="board-status-dropdown-option-all"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="board-status-dropdown-content"]')).toBeHidden({
    timeout: 5000,
  });
}

test.describe('Workbench and sidebar status', () => {
  let projectPath: string;
  const projectName = `workbench-status-${Date.now()}`;
  const projectId = `workbench-status-project-${Date.now()}`;

  /**
   * Re-seed every task at its intended status. Running an agent moves a feature
   * between status directories, so tests would otherwise inherit whatever the
   * previous one left behind.
   */
  function seedFeatures() {
    fs.rmSync(path.join(projectPath, '.dmaker', 'features'), { recursive: true, force: true });
    fs.mkdirSync(path.join(projectPath, '.dmaker', 'features'), { recursive: true });

    for (const feature of SEEDED) {
      createTestFeature(projectPath, feature.id, {
        id: feature.id,
        category: 'Uncategorized',
        title: feature.title,
        description: `${feature.title} description`,
        status: feature.status,
        createdAt: new Date().toISOString(),
      });
    }
  }

  test.beforeAll(async () => {
    fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    projectPath = path.join(TEST_TEMP_DIR, projectName);
    fs.mkdirSync(path.join(projectPath, '.dmaker', 'context'), { recursive: true });

    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ name: projectName, version: '1.0.0' }, null, 2)
    );
    fs.writeFileSync(
      path.join(projectPath, '.dmaker', 'categories.json'),
      JSON.stringify({ categories: [] }, null, 2)
    );
  });

  test.afterAll(async () => {
    if (process.env.KEEP_TEST_DIR === 'true') return;
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test.beforeEach(async ({ page, request }) => {
    seedFeatures();

    // The app reads its project list from the server's global settings, so
    // seeding localStorage alone leaves it pointing at whatever was there
    // before. Register the project first, then mirror it into localStorage.
    const current = await request.get(`${SERVER_URL}/api/settings/global`);
    const settings = (await current.json())?.settings ?? {};
    await request.put(`${SERVER_URL}/api/settings/global`, {
      data: {
        ...settings,
        projects: [
          {
            id: projectId,
            name: projectName,
            path: projectPath,
            lastOpened: new Date().toISOString(),
          },
        ],
        currentProjectId: projectId,
      },
    });

    await setupRealProject(page, projectPath, projectName);
    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await waitForNetworkIdle(page);
    await showAllStatuses(page);
  });

  test('every status renders its own glyph rather than a shared dot', async ({ page }) => {
    const seen = new Map<string, string>();

    for (const feature of SEEDED_IN_SIDEBAR) {
      const icon = row(page, feature.id).locator('[data-testid="sidebar-feature-status-icon"]');
      await expect(icon, `${feature.status} row should show a status glyph`).toBeVisible({
        timeout: 10000,
      });
      await expect(icon).toHaveAttribute('data-status', feature.status);

      // lucide stamps the icon name onto the element, so the rendered class is
      // proof of WHICH glyph came out — not just that something did.
      const className = await icon.getAttribute('class');
      const glyph = (className ?? '').split(/\s+/).find((c) => c.startsWith('lucide-'));
      expect(glyph, `${feature.status} should render a lucide glyph`).toBeTruthy();
      seen.set(feature.status, glyph as string);
    }

    // The whole point: no two statuses share a symbol.
    const glyphs = [...seen.values()];
    expect(new Set(glyphs).size, `statuses reused a glyph: ${JSON.stringify([...seen])}`).toBe(
      glyphs.length
    );
  });

  test('a task with no agent running shows its glyph, never a spinner', async ({ page }) => {
    await expect(row(page, 'feat-backlog')).toBeVisible({ timeout: 10000 });

    // in_progress used to spin purely because of its stored status, which lied
    // whenever the agent had already stopped.
    await expect(
      row(page, 'feat-in-progress').locator('[data-testid="sidebar-feature-spinner"]')
    ).toHaveCount(0);
    await expect(
      row(page, 'feat-in-progress').locator('[data-testid="sidebar-feature-status-icon"]')
    ).toBeVisible();
  });

  test('an agent running on a task spins that row, and only that row', async ({ page }) => {
    const target = 'feat-backlog';
    await expect(row(page, target)).toBeVisible({ timeout: 10000 });

    // Start a real run against the mock agent. The spinner then has to survive
    // the whole path — server event, websocket, store, row — rather than a
    // state we poked in from the test.
    const response = await page.request.post(`${SERVER_URL}/api/auto-mode/run-feature`, {
      data: { projectPath, featureId: target, forceRun: true },
    });
    expect(response.ok(), `run-feature failed: ${await response.text()}`).toBeTruthy();

    await expect(row(page, target).locator('[data-testid="sidebar-feature-spinner"]')).toBeVisible({
      timeout: 15000,
    });

    // Every other row keeps its own glyph — the spinner is per task.
    await expect(
      row(page, 'feat-waiting').locator('[data-testid="sidebar-feature-status-icon"]')
    ).toBeVisible();
    await expect(
      row(page, 'feat-waiting').locator('[data-testid="sidebar-feature-spinner"]')
    ).toHaveCount(0);
  });

  test('opening a task gives working Agents, Changes, Phases, Questions, Chat and Browser panes', async ({
    page,
  }) => {
    await expect(row(page, 'feat-backlog')).toBeVisible({ timeout: 10000 });
    await row(page, 'feat-backlog').click();

    await expect(page.locator('[data-testid="workbench"]')).toBeVisible({ timeout: 10000 });

    // The header identifies the task by its own status glyph too.
    await expect(page.locator('[data-testid="workbench-status-icon"]')).toHaveAttribute(
      'data-status',
      'backlog'
    );

    for (const pane of ['agents', 'changes', 'phases', 'questions', 'chat', 'browser'] as const) {
      const tab = page.locator(`[data-testid="workbench-tab-${pane}"]`);
      await expect(tab, `${pane} tab should exist`).toBeVisible();

      await tab.click();
      await expect(tab, `${pane} tab should select`).toHaveAttribute('aria-selected', 'true');

      // The pane must actually mount and be the visible one, not just selected.
      const host = page.locator(`[data-testid="workbench-pane-${pane}"]`);
      await expect(host, `${pane} pane should mount`).toHaveAttribute('data-active', 'true', {
        timeout: 10000,
      });
      await expect(host, `${pane} pane should be on screen`).toBeVisible();
    }

    // Panes stay mounted once visited, so switching back is instant and keeps
    // scroll positions, selections and unsent chat drafts alive. Browser is
    // the pane the loop left on, so it is the one that must go inactive
    // without unmounting.
    await page.locator('[data-testid="workbench-tab-agents"]').click();
    await expect(page.locator('[data-testid="workbench-pane-browser"]')).toHaveAttribute(
      'data-active',
      'false'
    );
    await expect(page.locator('[data-testid="workbench-pane-agents"]')).toHaveAttribute(
      'data-active',
      'true'
    );
  });
});
