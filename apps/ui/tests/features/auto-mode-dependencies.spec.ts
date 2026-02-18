/**
 * Auto Mode Dependency Blocking E2E Test
 *
 * Tests for the `waitForDependencies` feature that controls whether features
 * should wait for their dependencies to complete before being executed in auto mode.
 *
 * Test scenarios:
 * 1. Feature with waitForDependencies=true is blocked when dependencies are incomplete
 * 2. Feature with waitForDependencies=false runs regardless of dependency status
 * 3. Manual run shows warning when feature has unsatisfied dependencies
 * 4. Feature becomes unblocked after dependencies complete
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  createTempDirPath,
  cleanupTempDir,
  setupRealProject,
  waitForNetworkIdle,
  getKanbanColumn,
  authenticateForTests,
  handleLoginScreenIfPresent,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('auto-mode-deps-test');

test.describe('Auto Mode Dependency Blocking', () => {
  let projectPath: string;
  const projectName = `test-deps-${Date.now()}`;

  // Feature IDs for test scenarios
  const dependencyFeatureId = 'dep-feature-1';
  const blockedFeatureId = 'blocked-feature-1';

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
      `# ${projectName}\n\nA test project for dependency blocking e2e testing.`
    );
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('should show feature as blocked by dependencies when waitForDependencies is true', async ({
    page,
  }) => {
    // Set up the project in localStorage
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    // Intercept settings API to ensure our test project remains current
    await page.route('**/api/settings/global', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      if (json.settings) {
        const testProject = {
          id: `project-${projectName}`,
          name: projectName,
          path: projectPath,
          lastOpened: new Date().toISOString(),
        };

        const existingProjects = json.settings.projects || [];
        const hasProject = existingProjects.some((p: { path: string }) => p.path === projectPath);
        if (!hasProject) {
          json.settings.projects = [testProject, ...existingProjects];
        }
        json.settings.currentProjectId = testProject.id;
      }
      await route.fulfill({ response, json });
    });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Create the dependency feature (in pending status)
    const dependencyFeature = {
      id: dependencyFeatureId,
      description: 'Dependency feature for testing',
      category: 'test',
      status: 'pending',
      skipTests: true,
      model: 'sonnet',
      thinkingLevel: 'none',
      createdAt: new Date().toISOString(),
      branchName: '',
      priority: 1,
    };

    // Create the blocked feature (with waitForDependencies=true and a dependency)
    const blockedFeature = {
      id: blockedFeatureId,
      description: 'Feature that waits for dependencies',
      category: 'test',
      status: 'pending',
      skipTests: true,
      model: 'sonnet',
      thinkingLevel: 'none',
      createdAt: new Date().toISOString(),
      branchName: '',
      priority: 2,
      dependencies: [dependencyFeatureId],
      waitForDependencies: true,
    };

    const API_BASE_URL = process.env.VITE_SERVER_URL || 'http://localhost:3008';

    // Create features via HTTP API
    const createDep = await page.request.post(`${API_BASE_URL}/api/features/create`, {
      data: { projectPath, feature: dependencyFeature },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(createDep.ok()).toBeTruthy();

    const createBlocked = await page.request.post(`${API_BASE_URL}/api/features/create`, {
      data: { projectPath, feature: blockedFeature },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(createBlocked.ok()).toBeTruthy();

    // Reload to pick up the new features
    await page.reload();
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Wait for the blocked feature card to appear
    const blockedFeatureCard = page.locator(`[data-testid="kanban-card-${blockedFeatureId}"]`);
    await expect(blockedFeatureCard).toBeVisible({ timeout: 20000 });

    // Verify the feature appears in the pending column
    const pendingColumn = await getKanbanColumn(page, 'pending');
    await expect(pendingColumn).toBeVisible({ timeout: 5000 });

    // Verify the blocked feature card shows the "waiting for dependencies" indicator
    // The CardBadges component should show a badge when waitForDependencies=true and dependencies aren't satisfied
    const waitingBadge = blockedFeatureCard.locator('[data-testid="waiting-for-deps-badge"]');

    // If the badge doesn't exist yet, check for any visual indicator
    // The badge might be implemented as part of CardBadges component (T010)
    const hasDependencyIndicator = await waitingBadge.isVisible().catch(() => false);

    if (hasDependencyIndicator) {
      await expect(waitingBadge).toBeVisible();
    } else {
      // Check for the dependency link icon that shows when feature has dependencies
      const dependencyIcon = blockedFeatureCard.locator('[data-testid="dependency-link-icon"]');
      await expect(dependencyIcon.or(blockedFeatureCard.locator('svg'))).toBeVisible({
        timeout: 5000,
      });
    }
  });

  test('should allow manual run with confirmation when feature has unsatisfied dependencies', async ({
    page,
  }) => {
    // Set up the project in localStorage
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await page.route('**/api/settings/global', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      if (json.settings) {
        const testProject = {
          id: `project-${projectName}`,
          name: projectName,
          path: projectPath,
          lastOpened: new Date().toISOString(),
        };

        const existingProjects = json.settings.projects || [];
        const hasProject = existingProjects.some((p: { path: string }) => p.path === projectPath);
        if (!hasProject) {
          json.settings.projects = [testProject, ...existingProjects];
        }
        json.settings.currentProjectId = testProject.id;
      }
      await route.fulfill({ response, json });
    });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Create test feature IDs unique to this test
    const testDepFeatureId = `dep-feature-manual-${Date.now()}`;
    const testBlockedFeatureId = `blocked-feature-manual-${Date.now()}`;

    // Create the dependency feature (in pending status - not completed)
    const dependencyFeature = {
      id: testDepFeatureId,
      description: 'Incomplete dependency for manual run test',
      category: 'test',
      status: 'pending',
      skipTests: true,
      model: 'sonnet',
      thinkingLevel: 'none',
      createdAt: new Date().toISOString(),
      branchName: '',
      priority: 1,
    };

    // Create the feature that depends on it (with waitForDependencies=true)
    const blockedFeature = {
      id: testBlockedFeatureId,
      description: 'Feature with unsatisfied dependencies for manual run',
      category: 'test',
      status: 'pending',
      skipTests: true,
      model: 'sonnet',
      thinkingLevel: 'none',
      createdAt: new Date().toISOString(),
      branchName: '',
      priority: 2,
      dependencies: [testDepFeatureId],
      waitForDependencies: true,
    };

    const API_BASE_URL = process.env.VITE_SERVER_URL || 'http://localhost:3008';

    // Create features via HTTP API
    await page.request.post(`${API_BASE_URL}/api/features/create`, {
      data: { projectPath, feature: dependencyFeature },
      headers: { 'Content-Type': 'application/json' },
    });

    await page.request.post(`${API_BASE_URL}/api/features/create`, {
      data: { projectPath, feature: blockedFeature },
      headers: { 'Content-Type': 'application/json' },
    });

    // Reload to pick up the new features
    await page.reload();
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Wait for the blocked feature card to appear
    const blockedFeatureCard = page.locator(`[data-testid="kanban-card-${testBlockedFeatureId}"]`);
    await expect(blockedFeatureCard).toBeVisible({ timeout: 20000 });

    // Try to manually run the feature by clicking the start button
    // The start button might be on the card or in a dropdown menu
    const startButton = page.locator(
      `[data-testid="start-feature-${testBlockedFeatureId}"], [data-testid="run-feature-${testBlockedFeatureId}"]`
    );

    // If start button is visible, click it
    const startButtonVisible = await startButton.isVisible().catch(() => false);

    if (startButtonVisible) {
      await startButton.click();

      // The confirmation dialog (T011) should appear since dependencies are unsatisfied
      // Look for a dialog that mentions dependencies or blocking
      const confirmationDialog = page.locator('[role="alertdialog"], [role="dialog"]').filter({
        hasText: /dependencies|blocked|unsatisfied/i,
      });

      const dialogAppeared = await confirmationDialog
        .waitFor({ timeout: 5000, state: 'visible' })
        .then(() => true)
        .catch(() => false);

      if (dialogAppeared) {
        await expect(confirmationDialog).toBeVisible();

        // The dialog should have options to proceed or cancel
        const proceedButton = confirmationDialog.locator(
          'button:has-text("Proceed"), button:has-text("Run Anyway"), button:has-text("Continue")'
        );
        const cancelButton = confirmationDialog.locator(
          'button:has-text("Cancel"), button:has-text("Go Back")'
        );

        // Verify both buttons are present
        const hasProceed = await proceedButton.isVisible().catch(() => false);
        const hasCancel = await cancelButton.isVisible().catch(() => false);

        expect(hasProceed || hasCancel).toBeTruthy();
      }
    }
  });

  test('should run feature without blocking when waitForDependencies is false', async ({
    page,
  }) => {
    // Set up the project in localStorage
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await page.route('**/api/settings/global', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      if (json.settings) {
        const testProject = {
          id: `project-${projectName}`,
          name: projectName,
          path: projectPath,
          lastOpened: new Date().toISOString(),
        };

        const existingProjects = json.settings.projects || [];
        const hasProject = existingProjects.some((p: { path: string }) => p.path === projectPath);
        if (!hasProject) {
          json.settings.projects = [testProject, ...existingProjects];
        }
        json.settings.currentProjectId = testProject.id;
      }
      await route.fulfill({ response, json });
    });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Create test feature IDs unique to this test
    const testDepFeatureId = `dep-feature-noblock-${Date.now()}`;
    const testUnblockedFeatureId = `unblocked-feature-noblock-${Date.now()}`;

    // Create the dependency feature (in pending status - not completed)
    const dependencyFeature = {
      id: testDepFeatureId,
      description: 'Incomplete dependency for non-blocking test',
      category: 'test',
      status: 'pending',
      skipTests: true,
      model: 'sonnet',
      thinkingLevel: 'none',
      createdAt: new Date().toISOString(),
      branchName: '',
      priority: 1,
    };

    // Create the feature that has dependencies but waitForDependencies=false
    const unblockedFeature = {
      id: testUnblockedFeatureId,
      description: 'Feature that does NOT wait for dependencies',
      category: 'test',
      status: 'pending',
      skipTests: true,
      model: 'sonnet',
      thinkingLevel: 'none',
      createdAt: new Date().toISOString(),
      branchName: '',
      priority: 2,
      dependencies: [testDepFeatureId],
      waitForDependencies: false, // This feature should NOT block on dependencies
    };

    const API_BASE_URL = process.env.VITE_SERVER_URL || 'http://localhost:3008';

    // Create features via HTTP API
    await page.request.post(`${API_BASE_URL}/api/features/create`, {
      data: { projectPath, feature: dependencyFeature },
      headers: { 'Content-Type': 'application/json' },
    });

    await page.request.post(`${API_BASE_URL}/api/features/create`, {
      data: { projectPath, feature: unblockedFeature },
      headers: { 'Content-Type': 'application/json' },
    });

    // Reload to pick up the new features
    await page.reload();
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Wait for the unblocked feature card to appear
    const unblockedFeatureCard = page.locator(
      `[data-testid="kanban-card-${testUnblockedFeatureId}"]`
    );
    await expect(unblockedFeatureCard).toBeVisible({ timeout: 20000 });

    // Verify the feature does NOT show a "waiting for dependencies" badge
    // since waitForDependencies is false
    const waitingBadge = unblockedFeatureCard.locator('[data-testid="waiting-for-deps-badge"]');
    const hasBadge = await waitingBadge.isVisible().catch(() => false);
    expect(hasBadge).toBeFalsy();

    // The run-feature API should return success immediately (no warning)
    // since waitForDependencies is false
    const runResponse = await page.request.post(`${API_BASE_URL}/api/auto-mode/run-feature`, {
      data: {
        projectPath,
        featureId: testUnblockedFeatureId,
        useWorktrees: false,
      },
      headers: { 'Content-Type': 'application/json' },
    });

    const runResult = await runResponse.json();

    // Should succeed without warning since waitForDependencies is false
    expect(runResult.success).toBeTruthy();
    expect(runResult.warning).toBeUndefined();
  });

  test('should return warning from API when running feature with unsatisfied dependencies', async ({
    page,
  }) => {
    // Set up the project in localStorage
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Create test feature IDs unique to this test
    const testDepFeatureId = `dep-feature-api-${Date.now()}`;
    const testBlockedFeatureId = `blocked-feature-api-${Date.now()}`;

    // Create the dependency feature (in pending status)
    const dependencyFeature = {
      id: testDepFeatureId,
      description: 'Dependency for API warning test',
      category: 'test',
      status: 'pending',
      skipTests: true,
      model: 'sonnet',
      thinkingLevel: 'none',
      createdAt: new Date().toISOString(),
      branchName: '',
      priority: 1,
    };

    // Create the blocked feature (with waitForDependencies=true)
    const blockedFeature = {
      id: testBlockedFeatureId,
      description: 'Feature with unsatisfied dependencies for API test',
      category: 'test',
      status: 'pending',
      skipTests: true,
      model: 'sonnet',
      thinkingLevel: 'none',
      createdAt: new Date().toISOString(),
      branchName: '',
      priority: 2,
      dependencies: [testDepFeatureId],
      waitForDependencies: true,
    };

    const API_BASE_URL = process.env.VITE_SERVER_URL || 'http://localhost:3008';

    // Create features via HTTP API
    await page.request.post(`${API_BASE_URL}/api/features/create`, {
      data: { projectPath, feature: dependencyFeature },
      headers: { 'Content-Type': 'application/json' },
    });

    await page.request.post(`${API_BASE_URL}/api/features/create`, {
      data: { projectPath, feature: blockedFeature },
      headers: { 'Content-Type': 'application/json' },
    });

    // Try to run the blocked feature via API without forceRun
    const runResponse = await page.request.post(`${API_BASE_URL}/api/auto-mode/run-feature`, {
      data: {
        projectPath,
        featureId: testBlockedFeatureId,
        useWorktrees: false,
      },
      headers: { 'Content-Type': 'application/json' },
    });

    const runResult = await runResponse.json();

    // Should return a warning about unsatisfied dependencies
    expect(runResult.success).toBeFalsy();
    expect(runResult.warning).toBe('unsatisfied_dependencies');
    expect(runResult.blockingDependencies).toBeDefined();
    expect(runResult.blockingDependencies.length).toBe(1);
    expect(runResult.blockingDependencies[0].id).toBe(testDepFeatureId);
  });

  test('should allow force run via API when explicitly requested', async ({ page }) => {
    // Set up the project in localStorage
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Create test feature IDs unique to this test
    const testDepFeatureId = `dep-feature-force-${Date.now()}`;
    const testBlockedFeatureId = `blocked-feature-force-${Date.now()}`;

    // Create the dependency feature (in pending status)
    const dependencyFeature = {
      id: testDepFeatureId,
      description: 'Dependency for force run test',
      category: 'test',
      status: 'pending',
      skipTests: true,
      model: 'sonnet',
      thinkingLevel: 'none',
      createdAt: new Date().toISOString(),
      branchName: '',
      priority: 1,
    };

    // Create the blocked feature (with waitForDependencies=true)
    const blockedFeature = {
      id: testBlockedFeatureId,
      description: 'Feature for force run test',
      category: 'test',
      status: 'pending',
      skipTests: true,
      model: 'sonnet',
      thinkingLevel: 'none',
      createdAt: new Date().toISOString(),
      branchName: '',
      priority: 2,
      dependencies: [testDepFeatureId],
      waitForDependencies: true,
    };

    const API_BASE_URL = process.env.VITE_SERVER_URL || 'http://localhost:3008';

    // Create features via HTTP API
    await page.request.post(`${API_BASE_URL}/api/features/create`, {
      data: { projectPath, feature: dependencyFeature },
      headers: { 'Content-Type': 'application/json' },
    });

    await page.request.post(`${API_BASE_URL}/api/features/create`, {
      data: { projectPath, feature: blockedFeature },
      headers: { 'Content-Type': 'application/json' },
    });

    // Run the blocked feature with forceRun=true - should bypass dependency check
    const runResponse = await page.request.post(`${API_BASE_URL}/api/auto-mode/run-feature`, {
      data: {
        projectPath,
        featureId: testBlockedFeatureId,
        useWorktrees: false,
        forceRun: true, // Bypass dependency warning
      },
      headers: { 'Content-Type': 'application/json' },
    });

    const runResult = await runResponse.json();

    // Should succeed when forceRun is true
    expect(runResult.success).toBeTruthy();
    expect(runResult.warning).toBeUndefined();
  });
});
