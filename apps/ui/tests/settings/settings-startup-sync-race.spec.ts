/**
 * Settings Startup Race Regression Test
 *
 * Repro (historical bug):
 * - UI verifies session successfully
 * - Initial GET /api/settings/global fails transiently (backend still starting)
 * - UI unblocks settings sync anyway and can push default empty state to server
 * - Server persists projects: [] (and other defaults), wiping settings.json
 *
 * This test forces the first few /api/settings/global requests to fail and asserts that
 * the server-side settings.json is NOT overwritten while the UI is waiting to hydrate.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { authenticateForTests, handleLoginScreenIfPresent } from '../utils';

/**
 * The test backend's settings file — NOT apps/server/data/settings.json, which
 * is the developer's own project list. This spec rewrites the file it points
 * at, so aiming it at real data meant a test run edited the user's projects.
 * Must match playwright.config.ts and scripts/setup-e2e-fixtures.mjs.
 */
const TEST_DATA_DIR = process.env.DMAKER_E2E_DATA_DIR || path.join(os.tmpdir(), 'dmaker-e2e-data');
const SETTINGS_PATH = path.join(TEST_DATA_DIR, 'settings.json');
const WORKSPACE_ROOT = path.resolve(process.cwd(), '../..');
const FIXTURE_PROJECT_PATH = path.join(WORKSPACE_ROOT, 'test/fixtures/projectA');

test.describe('Settings startup sync race', () => {
  let originalSettingsJson: string;

  test.beforeAll(() => {
    originalSettingsJson = fs.readFileSync(SETTINGS_PATH, 'utf-8');

    const settings = JSON.parse(originalSettingsJson) as Record<string, unknown>;
    settings.projects = [
      {
        id: `e2e-project-${Date.now()}`,
        name: 'E2E Project (settings race)',
        path: FIXTURE_PROJECT_PATH,
        lastOpened: new Date().toISOString(),
        theme: 'dark',
      },
    ];

    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  });

  test.afterAll(() => {
    // Restore original settings.json to avoid polluting other tests/dev state
    fs.writeFileSync(SETTINGS_PATH, originalSettingsJson);
  });

  test('does not overwrite projects when /api/settings/global is temporarily unavailable', async ({
    page,
  }) => {
    // Gate the real settings request so we can assert file contents before allowing hydration.
    let requestCount = 0;
    let allowSettingsRequestResolve: (() => void) | null = null;
    const allowSettingsRequest = new Promise<void>((resolve) => {
      allowSettingsRequestResolve = resolve;
    });

    let sawThreeFailuresResolve: (() => void) | null = null;
    const sawThreeFailures = new Promise<void>((resolve) => {
      sawThreeFailuresResolve = resolve;
    });

    await page.route('**/api/settings/global', async (route) => {
      requestCount++;
      if (requestCount <= 3) {
        if (requestCount === 3) {
          sawThreeFailuresResolve?.();
        }
        await route.abort('failed');
        return;
      }
      // Keep the 4th+ request pending until the test explicitly allows it.
      await allowSettingsRequest;
      await route.continue();
    });

    // Ensure we are authenticated (session cookie) before loading the app.
    await authenticateForTests(page);
    await page.goto('/');

    // Wait until we have forced a few failures.
    await sawThreeFailures;

    // At this point, the UI should NOT have written defaults back to the server.
    const settingsAfterFailures = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) as {
      projects?: Array<{ path?: string }>;
    };
    expect(settingsAfterFailures.projects?.length).toBeGreaterThan(0);
    expect(settingsAfterFailures.projects?.[0]?.path).toBe(FIXTURE_PROJECT_PATH);

    // Allow the settings request to succeed so the app can hydrate and proceed.
    allowSettingsRequestResolve?.();

    // App should eventually render a main view after settings hydration.
    await page
      .locator(
        '[data-testid="welcome-view"], [data-testid="board-view-no-project"], [data-testid="board-view"]'
      )
      .first()
      .waitFor({ state: 'visible', timeout: 30000 });

    // Verify settings.json still contains the project after hydration completes.
    const settingsAfterHydration = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) as {
      projects?: Array<{ path?: string }>;
    };
    expect(settingsAfterHydration.projects?.length).toBeGreaterThan(0);
    expect(settingsAfterHydration.projects?.[0]?.path).toBe(FIXTURE_PROJECT_PATH);
  });

  /**
   * The logout button this used to click is gone with the app's auth UI, but
   * the guard it exercised is not: useSettingsSync stops syncing and resets
   * the moment auth is lost, so a session that expires cannot push empty
   * defaults over the server's project list. Losing the session is now
   * simulated directly instead of driven through a screen that no longer
   * exists.
   */
  test('does not wipe projects when the session is lost', async ({ page }) => {
    await authenticateForTests(page);
    await page.goto('/');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await page
      .locator(
        '[data-testid="welcome-view"], [data-testid="board-view-no-project"], [data-testid="board-view"]'
      )
      .first()
      .waitFor({ state: 'visible', timeout: 30000 });

    // Precondition: the server's settings still list the fixture project.
    const beforeLogout = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) as {
      projects?: Array<unknown>;
    };
    expect(beforeLogout.projects?.length).toBeGreaterThan(0);

    // From here on, every settings write is rejected as unauthenticated —
    // exactly what an expired session looks like to the UI.
    await page.route('**/api/settings/global', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Unauthorized' }),
        });
        return;
      }
      await route.continue();
    });

    // Clear the local project list, the state the old bug used to push up.
    await page.evaluate(() => {
      const raw = localStorage.getItem('dmaker-storage');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.state) {
          parsed.state.projects = [];
          parsed.state.currentProject = null;
          localStorage.setItem('dmaker-storage', JSON.stringify(parsed));
        }
      }
    });
    await page.reload();
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);

    // The server's settings file must still list the project.
    const afterLogout = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) as {
      projects?: Array<unknown>;
    };
    expect(afterLogout.projects?.length).toBeGreaterThan(0);
  });
});
