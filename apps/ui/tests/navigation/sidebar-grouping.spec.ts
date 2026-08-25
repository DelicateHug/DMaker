/**
 * Sidebar Grouping E2E Test
 *
 * Projects, and the branches inside a project, can be folded into user-made
 * folders — by dragging one onto another, or from the right-click menu. The
 * folders are pure presentation: nothing on disk or in git changes, and
 * ungrouping puts everything back exactly where it was.
 *
 * The two entry points are covered separately because they fail differently:
 * the menu path exercises the store actions, the drag path exercises the
 * HTML5 drop targets wired to them.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  createTempDirPath,
  cleanupTempDir,
  setupRealProject,
  registerProjectWithServer,
  waitForNetworkIdle,
  authenticateForTests,
  handleLoginScreenIfPresent,
  createTestGitRepo,
  createBranch,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('sidebar-grouping-test');

/**
 * A git repo is the minimum for a project to appear in the tree: the sidebar
 * builds its rows from the branches a project actually has, so a plain
 * directory would list nothing to group.
 */
async function makeProject(extraBranches: string[] = []): Promise<string> {
  const repo = await createTestGitRepo(TEST_TEMP_DIR);
  for (const branch of extraBranches) await createBranch(repo.path, branch);
  return repo.path;
}

async function openBoard(
  page: Page,
  project: { path: string; name: string },
  others: Array<{ path: string; name: string }> = []
): Promise<void> {
  await setupRealProject(page, project.path, project.name, { setAsCurrent: true });
  for (const other of others) {
    await registerProjectWithServer(page, other.path, other.name, { setAsCurrent: false });
  }
  await authenticateForTests(page);
  await page.goto('/board');
  await page.waitForLoadState('load');
  await handleLoginScreenIfPresent(page);
  await waitForNetworkIdle(page);
  await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });
}

/** The header row of a project section, which is what carries the menu. */
function projectHeader(page: Page, name: string): Locator {
  return page.locator('[data-testid^="sidebar-section-header-project:"]').filter({ hasText: name });
}

/**
 * The header row of one branch inside one project.
 *
 * Matched on the section id rather than on text: a branch header also carries
 * its task count and its sync countdown, and every project in the list has a
 * `main` of its own.
 */
function branchHeader(page: Page, projectName: string, branch: string): Locator {
  return page
    .locator('[data-testid^="sidebar-section-project:"]')
    .filter({ hasText: projectName })
    .locator(`[data-testid^="sidebar-section-header-branch:"][data-testid$=":${branch}"]`)
    .first();
}

/** Right-click a row, then pick `Group` › `item` from the menu it opens. */
async function chooseGroupAction(page: Page, row: Locator, item: string): Promise<void> {
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Group', exact: true }).hover();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/** Type a name into the rename input a freshly made folder opens with. */
async function nameNewFolder(page: Page, folder: Locator, name: string): Promise<void> {
  const input = folder.locator('input');
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.fill(name);
  await input.press('Enter');
  await expect(folder).toContainText(name);
}

/**
 * Drag one row onto another using real HTML5 drag events.
 *
 * Playwright's mouse cannot start a native drag, so the sequence is dispatched
 * directly — sharing one DataTransfer across the events, which is what makes
 * the payload readable on the drop the way a real drag would be.
 */
async function dragOnto(page: Page, source: Locator, target: Locator): Promise<void> {
  const sourceHandle = await source.elementHandle();
  const targetHandle = await target.elementHandle();
  if (!sourceHandle || !targetHandle) throw new Error('drag source or target is not attached');

  await page.evaluate(
    ([from, to]) => {
      const transfer = new DataTransfer();
      const fire = (element: Element, type: string) =>
        element.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer })
        );

      fire(from, 'dragstart');
      fire(to, 'dragover');
      fire(to, 'drop');
      fire(from, 'dragend');
    },
    [sourceHandle, targetHandle]
  );
}

test.describe('Sidebar grouping', () => {
  let projectA = '';
  let projectB = '';

  test.beforeAll(async () => {
    fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    projectA = await makeProject(['feature-x']);
    projectB = await makeProject();
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('groups two projects from the right-click menu, then ungroups them', async ({ page }) => {
    const nameA = path.basename(projectA);
    const nameB = path.basename(projectB);
    await openBoard(page, { path: projectA, name: nameA }, [{ path: projectB, name: nameB }]);

    await expect(projectHeader(page, nameA)).toBeVisible({ timeout: 15000 });
    await expect(projectHeader(page, nameB)).toBeVisible();

    await chooseGroupAction(page, projectHeader(page, nameA), 'New group…');

    const folder = page.locator('[data-testid="sidebar-project-group"]');
    await expect(folder).toHaveCount(1);
    await nameNewFolder(page, folder, 'Clients');

    // The second project joins the folder that now exists by name.
    await chooseGroupAction(page, projectHeader(page, nameB), 'Clients');
    await expect(folder).toContainText('2');

    // Both projects are still listed — grouping moved them, nothing else.
    await expect(projectHeader(page, nameA)).toBeVisible();
    await expect(projectHeader(page, nameB)).toBeVisible();

    await folder.click({ button: 'right' });
    await page.locator('[data-testid="sidebar-folder-ungroup"]').click();

    await expect(folder).toHaveCount(0);
    await expect(projectHeader(page, nameA)).toBeVisible();
    await expect(projectHeader(page, nameB)).toBeVisible();
  });

  test('groups two projects by dragging one onto the other', async ({ page }) => {
    const nameA = path.basename(projectA);
    const nameB = path.basename(projectB);
    await openBoard(page, { path: projectA, name: nameA }, [{ path: projectB, name: nameB }]);

    await expect(projectHeader(page, nameA)).toBeVisible({ timeout: 15000 });

    await dragOnto(page, projectHeader(page, nameA), projectHeader(page, nameB));

    const folder = page.locator('[data-testid="sidebar-project-group"]');
    await expect(folder).toHaveCount(1);
    // A folder made by a drop holds exactly the pair, and opens ready to name.
    await nameNewFolder(page, folder, 'Dropped');
    await expect(folder).toContainText('2');
  });

  test('groups two branches of one project from the right-click menu', async ({ page }) => {
    const nameA = path.basename(projectA);
    await openBoard(page, { path: projectA, name: nameA });

    await expect(branchHeader(page, nameA, 'main')).toBeVisible({ timeout: 15000 });
    await expect(branchHeader(page, nameA, 'feature-x')).toBeVisible();

    await chooseGroupAction(page, branchHeader(page, nameA, 'feature-x'), 'New group…');

    const folder = page.locator('[data-testid="sidebar-branch-group"]');
    await expect(folder).toHaveCount(1);
    await nameNewFolder(page, folder, 'Shipped');

    await chooseGroupAction(page, branchHeader(page, nameA, 'main'), 'Shipped');
    await expect(folder).toContainText('2');

    // Both branches survive the regrouping.
    await expect(branchHeader(page, nameA, 'main')).toBeVisible();
    await expect(branchHeader(page, nameA, 'feature-x')).toBeVisible();
  });

  test('groups two branches by dragging one onto the other', async ({ page }) => {
    const nameA = path.basename(projectA);
    await openBoard(page, { path: projectA, name: nameA });

    await expect(branchHeader(page, nameA, 'feature-x')).toBeVisible({ timeout: 15000 });

    await dragOnto(page, branchHeader(page, nameA, 'feature-x'), branchHeader(page, nameA, 'main'));

    const folder = page.locator('[data-testid="sidebar-branch-group"]');
    await expect(folder).toHaveCount(1);
    await nameNewFolder(page, folder, 'Dropped');
    await expect(folder).toContainText('2');
  });
});
