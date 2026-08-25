/**
 * Sidebar Navigation E2E Test
 *
 * Replaces top-nav-bar.spec.ts. The top navigation bar was removed — its
 * project dropdown, Tasks/GitHub/Tools dropdowns, Settings button and mobile
 * menu no longer exist anywhere in the app. The sidebar carries all of it now,
 * so this covers the same capability against where it actually lives.
 *
 * The old spec's dropdown tests were also self-cancelling: each guarded its
 * assertions behind `isVisible().catch(() => false)`, so once the bar was gone
 * they reported success while asserting nothing at all.
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  createTempDirPath,
  cleanupTempDir,
  setupRealProject,
  waitForNetworkIdle,
  authenticateForTests,
  handleLoginScreenIfPresent,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('sidebar-nav-test');

/** Open the board with the test project selected. */
async function openBoard(page: Page, projectPath: string, projectName: string): Promise<void> {
  await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
  await authenticateForTests(page);
  await page.goto('/board');
  await page.waitForLoadState('load');
  await handleLoginScreenIfPresent(page);
  await waitForNetworkIdle(page);
  await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });
}

test.describe('Sidebar Navigation', () => {
  let projectPath: string;
  const projectName = `test-project-${Date.now()}`;

  test.beforeAll(async () => {
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }

    projectPath = path.join(TEST_TEMP_DIR, projectName);
    fs.mkdirSync(projectPath, { recursive: true });

    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ name: projectName, version: '1.0.0' }, null, 2)
    );

    const dmakerDir = path.join(projectPath, '.dmaker');
    fs.mkdirSync(dmakerDir, { recursive: true });
    fs.mkdirSync(path.join(dmakerDir, 'features'), { recursive: true });
    fs.mkdirSync(path.join(dmakerDir, 'context'), { recursive: true });

    fs.writeFileSync(
      path.join(dmakerDir, 'categories.json'),
      JSON.stringify({ categories: [] }, null, 2)
    );

    fs.writeFileSync(
      path.join(dmakerDir, 'app_spec.txt'),
      `# ${projectName}\n\nA test project for e2e testing.`
    );
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('shows the sidebar with search, new feature and the status funnel', async ({ page }) => {
    await openBoard(page, projectPath, projectName);

    await expect(page.locator('[data-testid="sidebar-search-trigger"]')).toBeVisible();
    await expect(page.locator('[data-testid="sidebar-new-feature"]')).toBeVisible();
    await expect(page.locator('[data-testid="board-status-dropdown-trigger"]')).toBeVisible();
  });

  test('the status funnel opens and offers All Statuses', async ({ page }) => {
    await openBoard(page, projectPath, projectName);

    await page.locator('[data-testid="board-status-dropdown-trigger"]').click();
    const content = page.locator('[data-testid="board-status-dropdown-content"]');
    await expect(content).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="board-status-dropdown-option-all"]')).toBeVisible();
  });

  // Each launcher opens its own centre tab. Kept as one test per tool so a
  // single broken pane names itself instead of hiding behind the first failure.
  for (const tool of [
    'ideation',
    'spec',
    'memory',
    'terminal',
    'github-prs',
    'interview',
    'project-settings',
  ] as const) {
    test(`opens the ${tool} tool from the sidebar`, async ({ page }) => {
      await openBoard(page, projectPath, projectName);

      await page.locator(`[data-testid="sidebar-tool-${tool}"]`).click();
      await expect(page.locator(`[data-testid="tool-pane-${tool}"]`)).toBeVisible({
        timeout: 15000,
      });
    });
  }

  test('opens global settings and the scratchpad', async ({ page }) => {
    await openBoard(page, projectPath, projectName);

    await page.locator('[data-testid="sidebar-global-settings"]').click();
    await expect(page.locator('[data-testid="tool-pane-settings"]')).toBeVisible({
      timeout: 15000,
    });

    await page.locator('[data-testid="sidebar-tool-scratch"]').click();
    await expect(page.locator('[data-testid="tool-pane-scratch"]')).toBeVisible({ timeout: 15000 });
  });

  test('opens the project view from the sidebar', async ({ page }) => {
    await openBoard(page, projectPath, projectName);

    await page.locator('[data-testid="sidebar-project-view"]').first().click();
    await expect(page.locator('[data-testid="project-view"]')).toBeVisible({ timeout: 10000 });
  });

  test('collapses and restores the sidebar', async ({ page }) => {
    await openBoard(page, projectPath, projectName);

    const searchTrigger = page.locator('[data-testid="sidebar-search-trigger"]');
    await expect(searchTrigger).toBeVisible();

    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(searchTrigger).toBeHidden({ timeout: 5000 });

    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await expect(searchTrigger).toBeVisible({ timeout: 5000 });
  });
});
