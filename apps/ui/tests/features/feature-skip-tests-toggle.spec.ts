/**
 * Feature Skip Tests Toggle E2E Test
 *
 * Happy path: Create a feature with default settings (skipTests=true) and verify the badge appears
 *
 * Note: The app defaults to skipTests=true (manual verification required), so we don't need to
 * toggle anything. We just verify the badge appears by default.
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
  API_BASE_URL,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('skip-tests-toggle-test');

test.describe('Feature Skip Tests Badge', () => {
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

  test('a new feature inherits the skip-tests default', async ({ page, request }) => {
    const featureDescription = `Skip tests feature ${Date.now()}`;

    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // The funnel starts on a single status, so widen it before looking
    // for a status group that is not the default one.
    await showAllStatuses(page);
    // The group appears only once it holds something, so it is asserted
    // after the feature below is created rather than before.

    // Open the add feature dialog and add feature with default settings
    // Default is skipTests=true (manual verification required)
    await clickAddFeature(page);
    await fillAddFeatureDialog(page, featureDescription, { source: 'local' });
    await confirmAddFeature(page);

    // Wait for the feature to appear in the backlog
    await expect(async () => {
      const backlogColumn = page.locator(
        '[data-testid^="sidebar-section-status:"][data-testid$=":local"]'
      );
      const featureCard = backlogColumn.locator('[data-testid="sidebar-feature-row"]').filter({
        hasText: featureDescription,
      });
      expect(await featureCard.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 10000 });

    // Get the feature ID from the card
    const featureCard = page
      .locator('[data-testid^="sidebar-section-status:"][data-testid$=":local"]')
      .locator('[data-testid="sidebar-feature-row"]')
      .filter({ hasText: featureDescription })
      .first();
    // Sidebar rows all share one test id and carry the feature id in an
    // attribute, rather than encoding it into the test id as the cards did.
    const featureId = await featureCard.getAttribute('data-feature-id');

    expect(featureId).toBeTruthy();

    // The badge this used to look for lived on the kanban card and went with
    // it; the sidebar row deliberately carries only status, sync and PR
    // markers. Assert the thing that actually matters — that the feature was
    // created with the default applied — by reading it back from the server.
    await expect(async () => {
      const response = await request.post(`${API_BASE_URL}/api/features/get`, {
        data: { projectPath, featureId },
      });
      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(body.feature?.skipTests).toBe(true);
    }).toPass({ timeout: 10000 });
  });
});
