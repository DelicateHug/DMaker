/**
 * Project Creation E2E Test
 *
 * Happy path: Create a new blank project from welcome view
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  createTempDirPath,
  cleanupTempDir,
  setupWelcomeView,
  authenticateForTests,
  handleLoginScreenIfPresent,
  waitForNetworkIdle,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('project-creation-test');

test.describe('Project Creation', () => {
  test.beforeAll(async () => {
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('should create a new blank project from the board empty state', async ({ page }) => {
    const projectName = `test-project-${Date.now()}`;

    await setupWelcomeView(page, { workspaceDir: TEST_TEMP_DIR });

    // Intercept settings API BEFORE authenticateForTests (which navigates to the page)
    // This prevents settings hydration from restoring a project and disables auto-open
    await page.route('**/api/settings/global', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      // Remove currentProjectId and clear projects to prevent auto-open
      if (json.settings) {
        json.settings.currentProjectId = null;
        json.settings.projects = [];
      }
      await route.fulfill({ response, json });
    });

    await authenticateForTests(page);

    // The board is the only home now; with no project open it renders the
    // project picker as its empty state.
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);

    await expect(page.locator('[data-testid="board-view-no-project"]')).toBeVisible({
      timeout: 15000,
    });

    await page.locator('[data-testid="create-new-project"]').click();
    await page.locator('[data-testid="quick-setup-option"]').click();

    await expect(page.locator('[data-testid="new-project-modal"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="project-name-input"]').fill(projectName);
    await expect(page.getByText('Will be created at:')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="confirm-create-project"]').click();

    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 15000 });

    // The top nav's project dropdown is gone. The current project names itself
    // on the project view's centre tab, so open it and read the tab.
    await page.locator('[data-testid="sidebar-project-view"]').first().click();
    await expect(page.locator('[data-testid="project-view"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="center-tab-project"]')).toContainText(projectName, {
      timeout: 15000,
    });

    // Project was created successfully if we're on board view with project name visible
    // Note: The actual project directory is created in the server's default workspace,
    // not necessarily TEST_TEMP_DIR. This is expected behavior.
  });
});
