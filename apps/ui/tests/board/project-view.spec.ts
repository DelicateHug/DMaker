/**
 * Project View E2E Test
 *
 * The project view is one of the three occupants of the centre of the screen
 * (board / task / project). Opened from the sidebar, it holds the panes that
 * used to flank the board: files, chat, agents (with skills), scripts
 * (authoring and running deploy scripts), memory and MCP.
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
  API_BASE_URL,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('project-view-test');

/** Backend under test — the same URL the app talks to. */
const SERVER_URL = API_BASE_URL;

test.describe('Project View', () => {
  let projectPath: string;
  const projectName = `project-view-${Date.now()}`;

  test.beforeAll(async () => {
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }

    projectPath = path.join(TEST_TEMP_DIR, projectName);
    fs.mkdirSync(path.join(projectPath, '.dmaker', 'features'), { recursive: true });
    fs.mkdirSync(path.join(projectPath, '.dmaker', 'context'), { recursive: true });

    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ name: projectName, version: '1.0.0' }, null, 2)
    );
    fs.writeFileSync(
      path.join(projectPath, '.dmaker', 'categories.json'),
      JSON.stringify({ categories: [] }, null, 2)
    );
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test.beforeEach(async ({ page }) => {
    await setupRealProject(page, projectPath, projectName);
    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await waitForNetworkIdle(page);
  });

  test('the settings pane carries the project settings, GitHub included', async ({ page }) => {
    await page.locator('[data-testid="sidebar-project-view"]').click();
    await page.locator('[data-testid="project-tab-settings"]').click();

    await expect(page.locator('[data-testid="project-settings-content"]')).toBeVisible({
      timeout: 5000,
    });

    // GitHub sits alongside the other project settings sections
    await page.locator('[data-testid="project-settings-nav-github"]').click();
    await expect(page.locator('[data-testid="project-github-section"]')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('[data-testid="project-github-repo-input"]')).toBeVisible();
  });

  test('opens from the sidebar and switches panes', async ({ page }) => {
    // Closed by default — the board owns the screen
    await expect(page.locator('[data-testid="project-view"]')).toBeHidden();

    await page.locator('[data-testid="sidebar-project-view"]').click();
    await expect(page.locator('[data-testid="project-view"]')).toBeVisible({ timeout: 5000 });

    // Every pane the old rails used to expose has a tab
    for (const tab of ['files', 'chat', 'agents', 'scripts', 'memory', 'mcp', 'settings']) {
      await expect(page.locator(`[data-testid="project-tab-${tab}"]`)).toBeVisible();
    }

    await page.locator('[data-testid="project-tab-scripts"]').click();
    await expect(page.locator('[data-testid="project-scripts-panel"]')).toBeVisible({
      timeout: 5000,
    });

    await page.locator('[data-testid="project-tab-agents"]').click();
    await expect(page.locator('[data-testid="project-skills-panel"]')).toBeVisible({
      timeout: 5000,
    });

    // Escape returns to the board
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="project-view"]')).toBeHidden({ timeout: 5000 });
  });

  test('creates a deploy script in .dmaker/deploy', async ({ page }) => {
    await page.locator('[data-testid="sidebar-project-view"]').click();
    await page.locator('[data-testid="project-tab-scripts"]').click();
    await expect(page.locator('[data-testid="project-scripts-panel"]')).toBeVisible({
      timeout: 5000,
    });

    await page.locator('[data-testid="new-script"]').click();
    await page.locator('[data-testid="new-script-name"]').fill('smoke-deploy');
    await page.getByRole('button', { name: 'Create' }).click();

    // The editor opens on the new script and the file lands in the project
    await expect(page.locator('[data-testid="script-editor"]')).toBeVisible({ timeout: 5000 });

    await expect(async () => {
      const response = await page.request.get(
        `${SERVER_URL}/api/deploy/folder-scripts?projectPath=${encodeURIComponent(projectPath)}`
      );
      const body = await response.json();
      const names = (body.scripts ?? []).map((script: { name: string }) => script.name);
      expect(names).toContain('smoke-deploy.ps1');
    }).toPass({ timeout: 5000 });
  });

  test('creates a skill in the DMaker namespace', async ({ page }) => {
    await page.locator('[data-testid="sidebar-project-view"]').click();
    await page.locator('[data-testid="project-tab-agents"]').click();
    await expect(page.locator('[data-testid="project-skills-panel"]')).toBeVisible({
      timeout: 5000,
    });

    await page.locator('[data-testid="new-skill"]').click();
    await page.locator('[data-testid="skill-name"]').fill('smoke skill');
    await page.locator('[data-testid="skill-description"]').fill('Used by the project view test');
    await page.locator('[data-testid="save-skill"]').click();

    // Skills are prefixed, not nested, so Claude can still discover them
    await expect(async () => {
      const response = await page.request.post(`${SERVER_URL}/api/skills/list`, {
        data: { projectPath, sources: ['project'] },
      });
      const body = await response.json();
      const skill = (body.skills ?? []).find(
        (candidate: { name: string }) => candidate.name === 'dmaker-smoke-skill'
      );
      expect(skill, `skills seen: ${JSON.stringify(body.skills ?? [])}`).toBeTruthy();
      expect(skill.filePath.split('\\').join('/')).toContain(
        '.claude/skills/dmaker-smoke-skill/SKILL.md'
      );
    }).toPass({ timeout: 5000 });
  });
});
