/**
 * Feature Backlog E2E Test
 *
 * Happy path: Add a feature to the backlog
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  createTempDirPath,
  cleanupTempDir,
  setupRealProject,
  waitForNetworkIdle,
  clickAddFeature,
  fillAddFeatureDialog,
  confirmAddFeature,
  authenticateForTests,
  handleLoginScreenIfPresent,
  showAllStatuses,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('feature-backlog-test');

test.describe('Feature Backlog', () => {
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

  test('should add a new feature to the backlog', async ({ page }) => {
    const featureDescription = `Test feature ${Date.now()}`;

    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    // Authenticate before navigating
    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // The funnel starts on a single status, so widen it before looking
    // for a status group that is not the default one.
    await showAllStatuses(page);
    // The backlog group does not exist yet: the list renders only groups that
    // contain something, unlike the kanban columns it replaced, which were
    // always on screen. It appears once the feature below is added.

    await clickAddFeature(page);
    await fillAddFeatureDialog(page, featureDescription);
    await confirmAddFeature(page);

    // Wait for the feature to appear in the backlog
    await expect(async () => {
      const backlogGroup = page.locator(
        '[data-testid^="sidebar-section-status:"][data-testid$=":backlog"]'
      );
      const featureCard = backlogGroup.locator('[data-testid="sidebar-feature-row"]').filter({
        hasText: featureDescription,
      });
      expect(await featureCard.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 10000 });
  });

  test('should add a feature using Alt+Enter keyboard shortcut', async ({ page }) => {
    const featureDescription = `Test feature Alt+Enter ${Date.now()}`;

    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    // Authenticate before navigating
    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // The funnel starts on a single status, so widen it before looking
    // for a status group that is not the default one.
    await showAllStatuses(page);
    // The backlog group does not exist yet: the list renders only groups that
    // contain something, unlike the kanban columns it replaced, which were
    // always on screen. It appears once the feature below is added.

    await clickAddFeature(page);

    // Fill only the description
    const descriptionInput = page.locator('[data-testid="add-feature-dialog"] textarea').first();
    await descriptionInput.fill(featureDescription);

    // Press Alt+Enter to submit the form
    await descriptionInput.press('Alt+Enter');

    // Wait for the feature to appear in the backlog
    await expect(async () => {
      const backlogGroup = page.locator(
        '[data-testid^="sidebar-section-status:"][data-testid$=":backlog"]'
      );
      const featureCard = backlogGroup.locator('[data-testid="sidebar-feature-row"]').filter({
        hasText: featureDescription,
      });
      expect(await featureCard.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 10000 });
  });
});
