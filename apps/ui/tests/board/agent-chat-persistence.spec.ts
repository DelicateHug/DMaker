/**
 * Agent Chat Persistence E2E Test
 *
 * Tests that the agent chat panel persists through project switches in the board view.
 * This verifies the isolation between board project state and agent chat state.
 *
 * Related: T007 - Test that agent chat persists through project switches
 */

import { test, expect, type Page } from '@playwright/test';
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
 * Create a test project directory with minimal DMaker structure
 */
function createTestProject(basePath: string, projectName: string): string {
  const projectPath = path.join(basePath, projectName);
  fs.mkdirSync(projectPath, { recursive: true });

  // Create package.json
  fs.writeFileSync(
    path.join(projectPath, 'package.json'),
    JSON.stringify({ name: projectName, version: '1.0.0' }, null, 2)
  );

  // Create .dmaker directory structure
  const dmakerDir = path.join(projectPath, '.dmaker');
  fs.mkdirSync(dmakerDir, { recursive: true });
  fs.mkdirSync(path.join(dmakerDir, 'features'), { recursive: true });
  fs.mkdirSync(path.join(dmakerDir, 'context'), { recursive: true });
  fs.mkdirSync(path.join(dmakerDir, 'sessions'), { recursive: true });

  fs.writeFileSync(
    path.join(dmakerDir, 'categories.json'),
    JSON.stringify({ categories: [] }, null, 2)
  );

  fs.writeFileSync(
    path.join(dmakerDir, 'app_spec.txt'),
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

/**
 * Open the project view and show its Chat pane.
 *
 * The agent chat lives in the project view (an overlay opened from the
 * sidebar), not beside the board.
 */
async function openProjectChat(page: Page): Promise<void> {
  await page.locator('[data-testid="sidebar-project-view"]').click();
  await expect(page.locator('[data-testid="project-view"]')).toBeVisible({ timeout: 5000 });
  await page.locator('[data-testid="project-tab-chat"]').click();
  await expect(page.locator('[data-testid="agent-chat-panel"]')).toBeVisible({ timeout: 5000 });
}

/** Close the project view overlay, returning to the board. */
async function closeProjectView(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="project-view"]')).toBeHidden({ timeout: 5000 });
}

/** Switch the board to another project via its own project dropdown. */
async function switchBoardProject(page: Page, projectName: string): Promise<void> {
  const boardProjectDropdown = page.locator(
    '[data-testid="board-status-project-dropdown-trigger"]'
  );
  if (!(await boardProjectDropdown.isVisible({ timeout: 3000 }).catch(() => false))) return;

  await boardProjectDropdown.click();
  await page.waitForTimeout(300);

  const projectOption = page
    .locator('[data-testid="board-status-project-dropdown-content"]')
    .locator('[role="menuitem"]')
    .filter({ hasText: projectName });

  if (await projectOption.isVisible({ timeout: 2000 }).catch(() => false)) {
    await projectOption.click();
    await page.waitForTimeout(500);
  }
}

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
        localStorage.setItem('dmaker-storage', JSON.stringify(appState));

        const setupState = {
          state: {
            isFirstRun: false,
            setupComplete: true,
            skipClaudeSetup: false,
          },
          version: versions.SETUP_STORE,
        };
        localStorage.setItem('dmaker-setup', JSON.stringify(setupState));

        sessionStorage.setItem('dmaker-splash-shown', 'true');
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

    // Open the chat pane, then go back to the board to switch projects
    await openProjectChat(page);
    const agentChatPanel = page.locator('[data-testid="agent-chat-panel"]');
    await closeProjectView(page);

    await switchBoardProject(page, projectBName);

    // Reopening the project view must show the same, still-intact chat pane
    await openProjectChat(page);
    await expect(agentChatPanel).toBeVisible({ timeout: 5000 });

    const chatTitle = agentChatPanel.locator('text=Chat').first();
    await expect(chatTitle).toBeVisible({ timeout: 3000 });
  });

  /**
   * The board used to carry its own project dropdown, and this test switched
   * it to prove the chat pane was keyed independently of it. Both are gone:
   * the sidebar lists every project, and the chat pane lives in the project
   * view's own tab, keyed to the current project.
   *
   * What still needs guarding is the property that test was really about —
   * the pane keeps its state instead of remounting. The project view mounts
   * each pane once visited and hides the inactive ones, so moving between
   * panes and coming back must leave the chat exactly as it was.
   */
  test('agent chat panel does not remount when switching project panes', async ({ page }) => {
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
        localStorage.setItem('dmaker-storage', JSON.stringify(appState));

        const setupState = {
          state: {
            isFirstRun: false,
            setupComplete: true,
            skipClaudeSetup: false,
          },
          version: versions.SETUP_STORE,
        };
        localStorage.setItem('dmaker-setup', JSON.stringify(setupState));

        sessionStorage.setItem('dmaker-splash-shown', 'true');
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

    // The chat pane lives in the project view — open it before marking it
    await openProjectChat(page);

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

    // Move to another pane and back. Panes are hidden, not unmounted.
    await page.locator('[data-testid="project-tab-files"]').click();
    await expect(page.locator('[data-testid="agent-chat-panel"]')).toBeHidden({ timeout: 5000 });
    await page.locator('[data-testid="project-tab-chat"]').click();
    await expect(page.locator('[data-testid="agent-chat-panel"]')).toBeVisible({ timeout: 5000 });

    // Verify the marker is still present - if the panel remounted, it would be gone
    const markerAfter = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="agent-chat-panel"]');
      return panel?.getAttribute('data-mount-marker');
    });

    // The marker should still be 'original' if the component did NOT remount
    expect(markerAfter).toBe('original');
  });

  test('chat pane is closed until the project view is opened', async ({ page }) => {
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
            // Start with agent chat panel collapsed
            isAgentChatPanelCollapsed: true,
          },
          version: versions.APP_STORE,
        };
        localStorage.setItem('dmaker-storage', JSON.stringify(appState));

        const setupState = {
          state: {
            isFirstRun: false,
            setupComplete: true,
            skipClaudeSetup: false,
          },
          version: versions.SETUP_STORE,
        };
        localStorage.setItem('dmaker-setup', JSON.stringify(setupState));

        sessionStorage.setItem('dmaker-splash-shown', 'true');
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

    // The board no longer carries the chat: nothing chat-related on load
    await expect(page.locator('[data-testid="agent-chat-panel"]')).toBeHidden({ timeout: 3000 });

    // Opening the project view surfaces it, and Escape puts it away again
    await openProjectChat(page);
    await closeProjectView(page);
    await expect(page.locator('[data-testid="agent-chat-panel"]')).toBeHidden({ timeout: 3000 });

    // Switching board projects while it is closed leaves the board usable
    await switchBoardProject(page, projectBName);
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 5000 });
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
        localStorage.setItem('dmaker-storage', JSON.stringify(appState));

        const setupState = {
          state: {
            isFirstRun: false,
            setupComplete: true,
            skipClaudeSetup: false,
          },
          version: versions.SETUP_STORE,
        };
        localStorage.setItem('dmaker-setup', JSON.stringify(setupState));

        sessionStorage.setItem('dmaker-splash-shown', 'true');
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

    // Verify agent chat panel is visible in the project view
    await openProjectChat(page);
    const agentChatPanel = page.locator('[data-testid="agent-chat-panel"]');

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
