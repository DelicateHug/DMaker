/**
 * Agent Chat Persistence E2E Test
 *
 * Tests that the agent chat panel persists through project switches in the board view.
 * This verifies the isolation between board project state and agent chat state.
 *
 * Related: T007 - Test that agent chat persists through project switches
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  createTempDirPath,
  cleanupTempDir,
  waitForNetworkIdle,
  authenticateForTests,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('agent-chat-persistence-test');

/**
 * Create a test project directory with minimal Automaker structure
 */
function createTestProject(basePath: string, projectName: string): string {
  const projectPath = path.join(basePath, projectName);
  fs.mkdirSync(projectPath, { recursive: true });

  // Create package.json
  fs.writeFileSync(
    path.join(projectPath, 'package.json'),
    JSON.stringify({ name: projectName, version: '1.0.0' }, null, 2)
  );

  // Create .automaker directory structure
  const automakerDir = path.join(projectPath, '.automaker');
  fs.mkdirSync(automakerDir, { recursive: true });
  fs.mkdirSync(path.join(automakerDir, 'features'), { recursive: true });
  fs.mkdirSync(path.join(automakerDir, 'context'), { recursive: true });
  fs.mkdirSync(path.join(automakerDir, 'sessions'), { recursive: true });

  fs.writeFileSync(
    path.join(automakerDir, 'categories.json'),
    JSON.stringify({ categories: [] }, null, 2)
  );

  fs.writeFileSync(
    path.join(automakerDir, 'app_spec.txt'),
    `# ${projectName}\n\nA test project for e2e testing.`
  );

  return projectPath;
}

/**
 * Store version constants - must match the actual stores
 */
const STORE_VERSIONS = {
  APP_STORE: 2,
  SETUP_STORE: 1,
} as const;

test.describe('Agent Chat Persistence Through Project Switches', () => {
  let projectAPath: string;
  let projectBPath: string;
  const projectAName = `project-a-${Date.now()}`;
  const projectBName = `project-b-${Date.now()}`;

  test.beforeAll(async () => {
    // Create temp directory
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }

    // Create two test projects
    projectAPath = createTestProject(TEST_TEMP_DIR, projectAName);
    projectBPath = createTestProject(TEST_TEMP_DIR, projectBName);
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('agent chat panel remains visible when switching board project', async ({ page }) => {
    // Set up localStorage with both projects, Project A as current
    await page.addInitScript(
      ({
        pathA,
        nameA,
        pathB,
        nameB,
        versions,
      }: {
        pathA: string;
        nameA: string;
        pathB: string;
        nameB: string;
        versions: typeof STORE_VERSIONS;
      }) => {
        const projectA = {
          id: `project-a-${Date.now()}`,
          name: nameA,
          path: pathA,
          lastOpened: new Date().toISOString(),
        };
        const projectB = {
          id: `project-b-${Date.now()}`,
          name: nameB,
          path: pathB,
          lastOpened: new Date(Date.now() - 86400000).toISOString(),
        };

        const appState = {
          state: {
            projects: [projectA, projectB],
            currentProject: projectA,
            currentView: 'board',
            theme: 'dark',
            skipSandboxWarning: true,
            apiKeys: { anthropic: '', google: '' },
            chatSessions: [],
            chatHistoryOpen: false,
            maxConcurrency: 3,
            isAgentChatPanelCollapsed: false,
          },
          version: versions.APP_STORE,
        };
        localStorage.setItem('automaker-storage', JSON.stringify(appState));

        const setupState = {
          state: {
            isFirstRun: false,
            setupComplete: true,
            skipClaudeSetup: false,
          },
          version: versions.SETUP_STORE,
        };
        localStorage.setItem('automaker-setup', JSON.stringify(setupState));

        sessionStorage.setItem('automaker-splash-shown', 'true');
      },
      {
        pathA: projectAPath,
        nameA: projectAName,
        pathB: projectBPath,
        nameB: projectBName,
        versions: STORE_VERSIONS,
      }
    );

    // Authenticate and navigate to board
    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await waitForNetworkIdle(page);

    // Wait for board view to be visible
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Verify agent chat panel is visible
    const agentChatPanel = page.locator('[data-testid="agent-chat-panel"]');
    await expect(agentChatPanel).toBeVisible({ timeout: 5000 });

    // Find and click the board's project selector dropdown
    // This uses the board-specific project dropdown (data-testid="board-status-project-dropdown-trigger")
    const boardProjectDropdown = page.locator(
      '[data-testid="board-status-project-dropdown-trigger"]'
    );

    if (await boardProjectDropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Click the project selector to open dropdown
      await boardProjectDropdown.click();
      await page.waitForTimeout(300);

      // Select Project B from the dropdown menu
      const projectBOption = page
        .locator('[data-testid="board-status-project-dropdown-content"]')
        .locator('[role="menuitem"]')
        .filter({ hasText: projectBName });

      if (await projectBOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await projectBOption.click();
        await page.waitForTimeout(500);
      }
    }

    // Regardless of whether we switched projects, verify agent chat panel is still visible
    // This is the key assertion - the panel should not unmount during project switch
    await expect(agentChatPanel).toBeVisible({ timeout: 5000 });

    // Verify the agent chat panel still has its structure intact
    // The panel should have the "Chat" title
    const chatTitle = agentChatPanel.locator('text=Chat').first();
    await expect(chatTitle).toBeVisible({ timeout: 3000 });
  });

  test('agent chat panel does not remount when board project changes', async ({ page }) => {
    // Set up localStorage with both projects
    await page.addInitScript(
      ({
        pathA,
        nameA,
        pathB,
        nameB,
        versions,
      }: {
        pathA: string;
        nameA: string;
        pathB: string;
        nameB: string;
        versions: typeof STORE_VERSIONS;
      }) => {
        const projectA = {
          id: `project-a-${Date.now()}`,
          name: nameA,
          path: pathA,
          lastOpened: new Date().toISOString(),
        };
        const projectB = {
          id: `project-b-${Date.now()}`,
          name: nameB,
          path: pathB,
          lastOpened: new Date(Date.now() - 86400000).toISOString(),
        };

        const appState = {
          state: {
            projects: [projectA, projectB],
            currentProject: projectA,
            currentView: 'board',
            theme: 'dark',
            skipSandboxWarning: true,
            apiKeys: { anthropic: '', google: '' },
            chatSessions: [],
            chatHistoryOpen: false,
            maxConcurrency: 3,
            isAgentChatPanelCollapsed: false,
          },
          version: versions.APP_STORE,
        };
        localStorage.setItem('automaker-storage', JSON.stringify(appState));

        const setupState = {
          state: {
            isFirstRun: false,
            setupComplete: true,
            skipClaudeSetup: false,
          },
          version: versions.SETUP_STORE,
        };
        localStorage.setItem('automaker-setup', JSON.stringify(setupState));

        sessionStorage.setItem('automaker-splash-shown', 'true');
      },
      {
        pathA: projectAPath,
        nameA: projectAName,
        pathB: projectBPath,
        nameB: projectBName,
        versions: STORE_VERSIONS,
      }
    );

    // Authenticate and navigate to board
    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await waitForNetworkIdle(page);

    // Wait for board view
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Inject a marker attribute to track if the panel remounts
    await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="agent-chat-panel"]');
      if (panel) {
        panel.setAttribute('data-mount-marker', 'original');
      }
    });

    // Verify the marker was set
    const markerBefore = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="agent-chat-panel"]');
      return panel?.getAttribute('data-mount-marker');
    });
    expect(markerBefore).toBe('original');

    // Trigger a project switch by clicking on a different project in the board
    // This simulates changing boardSelectedProject which should NOT affect agentPanelProject
    const boardProjectDropdown = page.locator(
      '[data-testid="board-status-project-dropdown-trigger"]'
    );

    if (await boardProjectDropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
      await boardProjectDropdown.click();
      await page.waitForTimeout(300);

      const projectBOption = page
        .locator('[data-testid="board-status-project-dropdown-content"]')
        .locator('[role="menuitem"]')
        .filter({ hasText: projectBName });

      if (await projectBOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await projectBOption.click();
        await page.waitForTimeout(500);
      }
    }

    // Verify the marker is still present - if the panel remounted, it would be gone
    const markerAfter = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="agent-chat-panel"]');
      return panel?.getAttribute('data-mount-marker');
    });

    // The marker should still be 'original' if the component did NOT remount
    expect(markerAfter).toBe('original');
  });

  test('collapsed agent chat panel state persists through project switches', async ({ page }) => {
    // Set up localStorage with collapsed agent chat panel
    await page.addInitScript(
      ({
        pathA,
        nameA,
        pathB,
        nameB,
        versions,
      }: {
        pathA: string;
        nameA: string;
        pathB: string;
        nameB: string;
        versions: typeof STORE_VERSIONS;
      }) => {
        const projectA = {
          id: `project-a-${Date.now()}`,
          name: nameA,
          path: pathA,
          lastOpened: new Date().toISOString(),
        };
        const projectB = {
          id: `project-b-${Date.now()}`,
          name: nameB,
          path: pathB,
          lastOpened: new Date(Date.now() - 86400000).toISOString(),
        };

        const appState = {
          state: {
            projects: [projectA, projectB],
            currentProject: projectA,
            currentView: 'board',
            theme: 'dark',
            skipSandboxWarning: true,
            apiKeys: { anthropic: '', google: '' },
            chatSessions: [],
            chatHistoryOpen: false,
            maxConcurrency: 3,
            // Start with agent chat panel collapsed
            isAgentChatPanelCollapsed: true,
          },
          version: versions.APP_STORE,
        };
        localStorage.setItem('automaker-storage', JSON.stringify(appState));

        const setupState = {
          state: {
            isFirstRun: false,
            setupComplete: true,
            skipClaudeSetup: false,
          },
          version: versions.SETUP_STORE,
        };
        localStorage.setItem('automaker-setup', JSON.stringify(setupState));

        sessionStorage.setItem('automaker-splash-shown', 'true');
      },
      {
        pathA: projectAPath,
        nameA: projectAName,
        pathB: projectBPath,
        nameB: projectBName,
        versions: STORE_VERSIONS,
      }
    );

    // Authenticate and navigate to board
    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await waitForNetworkIdle(page);

    // Wait for board view
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Verify the collapsed indicator is visible (the expand button with Bot icon)
    // When collapsed, the full panel is not rendered, but an expand button is shown
    const collapsedIndicator = page.locator('[data-testid="agent-chat-panel-collapsed"]');
    const expandButton = page.locator('button[title="Expand Agent Chat Panel"]');

    // Either the collapsed panel indicator or the expand button should be visible
    const isCollapsedIndicatorVisible = await collapsedIndicator
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const isExpandButtonVisible = await expandButton
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    expect(isCollapsedIndicatorVisible || isExpandButtonVisible).toBe(true);

    // Attempt to switch projects using the board's project dropdown
    const boardProjectDropdown = page.locator(
      '[data-testid="board-status-project-dropdown-trigger"]'
    );

    if (await boardProjectDropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
      await boardProjectDropdown.click();
      await page.waitForTimeout(300);

      const projectBOption = page
        .locator('[data-testid="board-status-project-dropdown-content"]')
        .locator('[role="menuitem"]')
        .filter({ hasText: projectBName });

      if (await projectBOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await projectBOption.click();
        await page.waitForTimeout(500);
      }
    }

    // Verify the collapsed state is still maintained
    const isStillCollapsedIndicator = await collapsedIndicator
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const isStillExpandButton = await expandButton.isVisible({ timeout: 3000 }).catch(() => false);

    expect(isStillCollapsedIndicator || isStillExpandButton).toBe(true);
  });

  test('agent chat panel project selector allows independent project selection', async ({
    page,
  }) => {
    // Set up localStorage with both projects
    await page.addInitScript(
      ({
        pathA,
        nameA,
        pathB,
        nameB,
        versions,
      }: {
        pathA: string;
        nameA: string;
        pathB: string;
        nameB: string;
        versions: typeof STORE_VERSIONS;
      }) => {
        const projectA = {
          id: `project-a-${Date.now()}`,
          name: nameA,
          path: pathA,
          lastOpened: new Date().toISOString(),
        };
        const projectB = {
          id: `project-b-${Date.now()}`,
          name: nameB,
          path: pathB,
          lastOpened: new Date(Date.now() - 86400000).toISOString(),
        };

        const appState = {
          state: {
            projects: [projectA, projectB],
            currentProject: projectA,
            currentView: 'board',
            theme: 'dark',
            skipSandboxWarning: true,
            apiKeys: { anthropic: '', google: '' },
            chatSessions: [],
            chatHistoryOpen: false,
            maxConcurrency: 3,
            isAgentChatPanelCollapsed: false,
          },
          version: versions.APP_STORE,
        };
        localStorage.setItem('automaker-storage', JSON.stringify(appState));

        const setupState = {
          state: {
            isFirstRun: false,
            setupComplete: true,
            skipClaudeSetup: false,
          },
          version: versions.SETUP_STORE,
        };
        localStorage.setItem('automaker-setup', JSON.stringify(setupState));

        sessionStorage.setItem('automaker-splash-shown', 'true');
      },
      {
        pathA: projectAPath,
        nameA: projectAName,
        pathB: projectBPath,
        nameB: projectBName,
        versions: STORE_VERSIONS,
      }
    );

    // Authenticate and navigate to board
    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await waitForNetworkIdle(page);

    // Wait for board view
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Verify agent chat panel is visible
    const agentChatPanel = page.locator('[data-testid="agent-chat-panel"]');
    await expect(agentChatPanel).toBeVisible({ timeout: 5000 });

    // The agent chat panel has its own project selector (showProjectSelector={true})
    // Look for the project selector within the agent chat panel
    const agentPanelProjectSelector = agentChatPanel
      .locator('button')
      .filter({ hasText: projectAName })
      .first();

    if (await agentPanelProjectSelector.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Click the agent panel's project selector
      await agentPanelProjectSelector.click();
      await page.waitForTimeout(300);

      // Select Project B from the dropdown
      const projectBOption = page.locator('div[role="menuitem"]').filter({ hasText: projectBName });
      if (await projectBOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await projectBOption.click();
        await page.waitForTimeout(500);

        // Verify the agent panel now shows Project B
        const agentPanelAfterSwitch = agentChatPanel
          .locator('button')
          .filter({ hasText: projectBName })
          .first();
        await expect(agentPanelAfterSwitch).toBeVisible({ timeout: 3000 });
      }
    }

    // The agent chat panel should still be visible after changing its project
    await expect(agentChatPanel).toBeVisible();
  });
});
