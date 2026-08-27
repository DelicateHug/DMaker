/**
 * Edit Feature E2E Test
 *
 * Happy path: Edit an existing feature's description and verify changes persist
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
  clickElement,
  authenticateForTests,
  handleLoginScreenIfPresent,
  showAllStatuses,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('edit-feature-test');

test.describe('Edit Feature', () => {
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

  test('should edit an existing feature description', async ({ page }) => {
    const originalDescription = `Original feature ${Date.now()}`;
    const updatedDescription = `Updated feature ${Date.now()}`;

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

    // Create a feature first
    await clickAddFeature(page);
    await fillAddFeatureDialog(page, originalDescription);
    await confirmAddFeature(page);

    // Wait for the feature to appear in the backlog
    await expect(async () => {
      const backlogColumn = page.locator(
        '[data-testid^="sidebar-section-status:"][data-testid$=":backlog"]'
      );
      const featureCard = backlogColumn.locator('[data-testid="sidebar-feature-row"]').filter({
        hasText: originalDescription,
      });
      expect(await featureCard.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 10000 });

    // Get the feature ID from the card
    const featureCard = page
      .locator('[data-testid^="sidebar-section-status:"][data-testid$=":backlog"]')
      .locator('[data-testid="sidebar-feature-row"]')
      .filter({ hasText: originalDescription })
      .first();
    // Sidebar rows all share one test id and carry the feature id in an
    // attribute, rather than encoding it into the test id as the cards did.
    const featureId = await featureCard.getAttribute('data-feature-id');

    // Editing is reached from the row's right-click menu now that the task
    // list is the sidebar; the per-card edit button went with the kanban.
    await featureCard.click({ button: 'right' });
    const editItem = page.locator('[data-testid="context-menu-edit-feature"]');
    await expect(editItem).toBeVisible({ timeout: 5000 });
    await editItem.click();

    // Wait for edit dialog to appear
    await expect(page.locator('[data-testid="edit-feature-dialog"]')).toBeVisible({
      timeout: 10000,
    });

    // Update the description - the input is inside the DescriptionImageDropZone
    const descriptionInput = page
      .locator('[data-testid="edit-feature-dialog"]')
      .getByPlaceholder('Describe the feature...');
    await expect(descriptionInput).toBeVisible({ timeout: 5000 });
    await descriptionInput.fill(updatedDescription);

    // Save changes
    await clickElement(page, 'confirm-edit-feature');

    // Wait for dialog to close
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="edit-feature-dialog"]'),
      { timeout: 5000 }
    );

    // Verify the updated description appears in the card
    await expect(async () => {
      const backlogColumn = page.locator(
        '[data-testid^="sidebar-section-status:"][data-testid$=":backlog"]'
      );
      const updatedCard = backlogColumn.locator('[data-testid="sidebar-feature-row"]').filter({
        hasText: updatedDescription,
      });
      expect(await updatedCard.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 10000 });
  });
});
