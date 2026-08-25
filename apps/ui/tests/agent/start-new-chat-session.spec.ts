/**
 * Start New Chat Session E2E Test
 *
 * Happy path: start a new agent chat session.
 *
 * The standalone /agent route and its full-screen AgentView are gone — chat is
 * a pane inside the project view now. The session selector it reuses is the
 * same component, so this covers the same flow where it actually lives.
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

const TEST_TEMP_DIR = createTempDirPath('agent-session-test');

test.describe('Agent Chat Session', () => {
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
    fs.mkdirSync(path.join(dmakerDir, 'sessions'), { recursive: true });

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

  test('should start a new agent chat session', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Chat lives in the project view's Chat pane
    await page.locator('[data-testid="sidebar-project-view"]').first().click();
    await expect(page.locator('[data-testid="project-view"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="project-tab-chat"]').click();
    await expect(page.locator('[data-testid="agent-chat-panel"]')).toBeVisible({ timeout: 10000 });

    // Start a new chat from the session selector
    await page.locator('[data-testid="session-selector-trigger"]').click();
    await expect(page.locator('[data-testid="session-selector-content"]')).toBeVisible({
      timeout: 5000,
    });
    await page.locator('[data-testid="new-session-button"]').click();

    // A fresh session is selected: its transcript and input are on screen
    await expect(page.locator('[data-testid="message-list"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="agent-input"]')).toBeVisible({ timeout: 5000 });

    // …and it is listed as a session
    await page.locator('[data-testid="session-selector-trigger"]').click();
    await expect(page.locator('[data-testid="session-selector-content"]')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('[data-testid^="session-item-"]').first()).toBeVisible({
      timeout: 10000,
    });
  });
});
