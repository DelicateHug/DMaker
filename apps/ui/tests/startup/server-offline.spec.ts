/**
 * Server Offline Startup Regression Test
 *
 * Repro (historical bug):
 * - The backend is not running, or is running on a different port than the UI
 *   calls (`npm run dev:full` started the server on 3009 while the dev UI asked
 *   for 3019)
 * - `waitForServerReady()` exhausts its retries and returns false
 * - The bootstrap effect called `handleServerOffline()` and returned WITHOUT
 *   setting `appReady`
 * - The app sat on "Loading..." forever: no error, no port, no way to recover
 *   short of a reload that would do exactly the same thing
 *
 * The spinner gave no clue which half of the stack was missing, so the symptom
 * looked like a hung app rather than an unreachable server. These tests pin the
 * two things that make it diagnosable: the failure is stated, and it names the
 * URL that was tried.
 */

import { test, expect } from '@playwright/test';
import { authenticateForTests, handleLoginScreenIfPresent } from '../utils';

test.describe('Server offline at startup', () => {
  test('shows an offline message naming the server URL instead of spinning forever', async ({
    page,
  }) => {
    // Kill only the readiness probe — the UI cannot tell this apart from a
    // backend that is not listening.
    await page.route('**/api/health', (route) => route.abort('connectionrefused'));

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');

    const offline = page.locator('[data-testid="server-offline"]');
    // waitForServerReady retries 4 times with backoff before giving up.
    await expect(offline).toBeVisible({ timeout: 20000 });

    // The port is the whole diagnostic value here: it says which server is
    // missing. Assert a port is actually rendered, not just that some text is.
    await expect(offline).toContainText(/http:\/\/[^\s]+:\d+/);

    // And the spinner must be gone — the bug was that it never was.
    await expect(page.getByText('Loading...')).toBeHidden();
  });

  test('retry recovers once the server answers, without a reload', async ({ page }) => {
    let blockHealth = true;
    await page.route('**/api/health', async (route) => {
      if (blockHealth) {
        await route.abort('connectionrefused');
        return;
      }
      await route.continue();
    });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');

    await expect(page.locator('[data-testid="server-offline"]')).toBeVisible({ timeout: 20000 });

    // Simulate the developer starting the backend they forgot to start.
    blockHealth = false;
    await page.locator('[data-testid="server-offline-retry"]').click();

    await handleLoginScreenIfPresent(page);
    await expect(page.locator('[data-testid="server-offline"]')).toBeHidden({ timeout: 20000 });
    await expect(page.locator('[data-testid="app-container"]')).toBeVisible();
  });
});
