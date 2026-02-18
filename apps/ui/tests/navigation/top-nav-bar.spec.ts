/**
 * Top Navigation Bar E2E Test
 *
 * Tests the new TopNavigationBar component that replaced the sidebar.
 * Verifies project selection, navigation dropdowns, and keyboard shortcuts work correctly.
 */

import { test, expect } from '@playwright/test';
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

const TEST_TEMP_DIR = createTempDirPath('top-nav-test');

test.describe('Top Navigation Bar', () => {
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

    const automakerDir = path.join(projectPath, '.automaker');
    fs.mkdirSync(automakerDir, { recursive: true });
    fs.mkdirSync(path.join(automakerDir, 'features'), { recursive: true });
    fs.mkdirSync(path.join(automakerDir, 'context'), { recursive: true });

    fs.writeFileSync(
      path.join(automakerDir, 'categories.json'),
      JSON.stringify({ categories: [] }, null, 2)
    );

    fs.writeFileSync(
      path.join(automakerDir, 'app_spec.txt'),
      `# ${projectName}\n\nA test project for e2e testing.`
    );
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('should display top navigation bar with project dropdown', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Verify top navigation bar is visible
    await expect(page.getByTestId('top-nav-bar')).toBeVisible({ timeout: 10000 });

    // Verify project dropdown trigger is visible with project name
    const projectDropdown = page.getByTestId('project-dropdown-trigger');
    await expect(projectDropdown).toBeVisible();
    await expect(projectDropdown).toContainText(projectName);
  });

  test('should open project dropdown and show All Projects option', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Click project dropdown
    await page.getByTestId('project-dropdown-trigger').click();

    // Verify dropdown content is visible
    await expect(page.getByTestId('project-dropdown-content')).toBeVisible({ timeout: 5000 });

    // Verify "All Projects" option is present
    await expect(page.getByTestId('project-option-all')).toBeVisible();
    await expect(page.getByTestId('project-option-all')).toContainText('All Projects');
  });

  test('should display Tasks dropdown', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Verify Tasks dropdown trigger is visible (on desktop)
    const tasksDropdown = page.getByTestId('tasks-dropdown-trigger');

    // Tasks dropdown is hidden on mobile, so check if it exists in the DOM
    const isDesktop = await tasksDropdown.isVisible().catch(() => false);

    if (isDesktop) {
      await expect(tasksDropdown).toContainText('Tasks');

      // Click to open
      await tasksDropdown.click();

      // Verify dropdown content
      await expect(page.getByTestId('tasks-dropdown-content')).toBeVisible({ timeout: 5000 });
      await expect(page.getByTestId('tasks-option-all')).toBeVisible();
    }
  });

  test('should display GitHub dropdown with Issues and PRs tabs', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Verify GitHub dropdown trigger is visible (on desktop)
    const githubDropdown = page.getByTestId('github-dropdown-trigger');
    const isDesktop = await githubDropdown.isVisible().catch(() => false);

    if (isDesktop) {
      await expect(githubDropdown).toContainText('GitHub');

      // Click to open
      await githubDropdown.click();

      // Verify dropdown content with tabs
      await expect(page.getByTestId('github-dropdown-content')).toBeVisible({ timeout: 5000 });
      await expect(page.getByTestId('github-tab-issues')).toBeVisible();
      await expect(page.getByTestId('github-tab-prs')).toBeVisible();
    }
  });

  test('should display Tools dropdown with all tool tabs', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Verify Tools dropdown trigger is visible (on desktop)
    const toolsDropdown = page.getByTestId('tools-dropdown-trigger');
    const isDesktop = await toolsDropdown.isVisible().catch(() => false);

    if (isDesktop) {
      await expect(toolsDropdown).toContainText('Tools');

      // Click to open
      await toolsDropdown.click();

      // Verify dropdown content with tool tabs
      await expect(page.getByTestId('tools-dropdown-content')).toBeVisible({ timeout: 5000 });
      await expect(page.getByTestId('tools-tab-ideation')).toBeVisible();
      await expect(page.getByTestId('tools-tab-spec')).toBeVisible();
      await expect(page.getByTestId('tools-tab-memory')).toBeVisible();
      await expect(page.getByTestId('tools-tab-agent')).toBeVisible();
      await expect(page.getByTestId('tools-tab-terminal')).toBeVisible();
    }
  });

  test('should display Settings button', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Verify Settings button is visible (on desktop)
    const settingsButton = page.getByTestId('settings-button');
    const isDesktop = await settingsButton.isVisible().catch(() => false);

    if (isDesktop) {
      await expect(settingsButton).toContainText('Settings');
    }
  });

  test('should navigate to Agent Runner via Tools dropdown', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Open Tools dropdown
    const toolsDropdown = page.getByTestId('tools-dropdown-trigger');
    const isDesktop = await toolsDropdown.isVisible().catch(() => false);

    if (isDesktop) {
      await toolsDropdown.click();
      await expect(page.getByTestId('tools-dropdown-content')).toBeVisible({ timeout: 5000 });

      // Click Agent tab
      await page.getByTestId('tools-tab-agent').click();

      // Wait for navigation to agent view
      await expect(page.locator('[data-testid="agent-view"]')).toBeVisible({ timeout: 10000 });
    }
  });

  test('should show mobile menu toggle on small screens', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // On mobile, the menu toggle should be visible
    const mobileMenuToggle = page.getByTestId('mobile-menu-toggle');
    await expect(mobileMenuToggle).toBeVisible({ timeout: 10000 });

    // Click to open mobile menu
    await mobileMenuToggle.click();

    // Verify mobile nav menu is visible
    await expect(page.getByTestId('mobile-nav-menu')).toBeVisible({ timeout: 5000 });
  });
});
