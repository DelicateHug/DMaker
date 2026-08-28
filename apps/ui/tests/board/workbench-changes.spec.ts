/**
 * Changes pane E2E — a working tree with real uncommitted work in it.
 *
 * `workbench-panes.spec.ts` covers the floor: a committed-clean repo and the
 * "No uncommitted changes" state. This covers the case the pane exists for —
 * a modified file, a brand-new file and a deleted one, all at once — because
 * that is where every interesting behaviour lives: the porcelain status code
 * that ends up on each row, the auto-selection, the `+`/`-` rendering, and the
 * editor action that must refuse a file with nothing left on disk.
 *
 * The changes are made with REAL git rather than seeded, because the pane's
 * whole data path is `POST /api/git/diffs` -> `getGitRepositoryDiffs` ->
 * `git diff HEAD` + `git status --porcelain`, with an untracked file's diff
 * synthesised on top. Nothing short of an actual dirty tree exercises the join
 * between the two halves, and the join is the part that has been wrong before:
 * the untracked file appears in the status list but never in `git diff HEAD`.
 *
 * Every UI count is cross-checked against a direct call to the same endpoint,
 * so a failure says whether the pane lied or git did.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  API_BASE_URL,
  cleanupTempDir,
  commitFile,
  createTempDirPath,
  createTestGitRepo,
  gitExec,
  openTaskWorkbench,
  openWorkbenchBoard,
  seedWorkbenchFeatures,
  selectWorkbenchTab,
  workbenchPane,
  type SeededFeature,
  type WorkbenchProject,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('workbench-changes-test');

/** The task whose workbench these tests open. Never run — the tree is the fixture. */
const FEATURE: SeededFeature = {
  id: 'feat-dirty-tree',
  status: 'in_progress',
  title: 'A task with uncommitted work',
};

/**
 * A second task carrying a branch no worktree was ever created for.
 *
 * `rootPath` silently falls back to the main checkout in that case, which looks
 * exactly like "the agent changed nothing" unless the pane says otherwise.
 */
const BRANCH_FEATURE: SeededFeature = {
  id: 'feat-ghost-branch',
  status: 'in_progress',
  title: 'A task whose worktree is missing',
  branchName: 'feature/never-created',
};

// ---------------------------------------------------------------------------
// The dirty tree
//
// Paths are chosen so `git status --porcelain` produces one row per status:
// it lists tracked changes sorted by path and then untracked ones, so the
// order on screen is legacy.ts (D), parser.ts (M), added.ts (?).
// ---------------------------------------------------------------------------

const MODIFIED_FILE = 'src/parser.ts';
const DELETED_FILE = 'src/legacy.ts';
const UNTRACKED_FILE = 'src/added.ts';

const KEPT_LINE = "export const marker = 'unchanged';";
const REMOVED_LINE = "export const revision = 'one';";
const ADDED_LINE = "export const revision = 'two';";
const DELETED_FILE_LINE = "export const legacy = 'this file gets deleted';";
const UNTRACKED_FILE_LINE = "export const added = 'this file is brand new';";

const COMMITTED_PARSER = `${KEPT_LINE}\n${REMOVED_LINE}\n`;
const MODIFIED_PARSER = `${KEPT_LINE}\n${ADDED_LINE}\n`;

/** Every status code the fixture produces, in the order the rows render. */
const EXPECTED_STATUSES = ['D', 'M', '?'] as const;

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

function changesPane(page: Page): Locator {
  return workbenchPane(page, 'changes');
}

function fileRows(page: Page): Locator {
  return changesPane(page).locator('[data-testid="changes-file-row"]');
}

function fileRow(page: Page, status: string): Locator {
  return changesPane(page).locator(`[data-testid="changes-file-row"][data-status="${status}"]`);
}

function selectedDiff(page: Page): Locator {
  return changesPane(page).locator('[data-testid="changes-diff"]');
}

/**
 * The `+` and `-` markers a diff actually renders.
 *
 * `DiffLine` emits no test id — it renders a four-span row whose third span
 * holds the marker and nothing else. Matching that span by its exact text is
 * the only structural way to count added and removed lines from outside the
 * component, and it is what makes this an assertion about the diff rather than
 * about the file's prose. A context line's marker span holds a single space,
 * which normalises to empty and matches neither pattern.
 */
function addedLines(page: Page): Locator {
  return selectedDiff(page).locator('span', { hasText: /^\+$/ });
}

function removedLines(page: Page): Locator {
  return selectedDiff(page).locator('span', { hasText: /^-$/ });
}

// ---------------------------------------------------------------------------
// The endpoint the pane reads, called directly
// ---------------------------------------------------------------------------

interface GitDiffsResponse {
  success?: boolean;
  diff?: string;
  files?: Array<{ status: string; path: string; statusText: string }>;
  hasChanges?: boolean;
}

/**
 * `POST /api/git/diffs` for the same root the pane resolves.
 *
 * The root is forward-slashed on purpose: `normalizeRootPath` in
 * `use-changed-files.ts` does that before every request, and
 * `getGitRepositoryDiffs` caches per repo-path STRING, so asking with the
 * Windows spelling would answer from a different cache entry than the one the
 * pane is reading.
 */
async function fetchGitDiffs(page: Page, projectPath: string): Promise<GitDiffsResponse> {
  const response = await page.request.post(`${API_BASE_URL}/api/git/diffs`, {
    data: { projectPath: projectPath.replace(/\\/g, '/') },
  });
  if (!response.ok()) return {};
  return (await response.json()) as GitDiffsResponse;
}

test.describe('Changes pane', () => {
  // Hooks share the test's budget, and every test here pays for a board boot
  // plus the endpoint gate below before it asserts anything. The default 30s is
  // enough on a warm machine and not enough on a cold one — which is a flake,
  // not a signal.
  test.describe.configure({ timeout: 90_000 });

  let project: WorkbenchProject;

  test.beforeAll(async () => {
    const repo = await createTestGitRepo(TEST_TEMP_DIR);

    // Line endings must not be rewritten under the fixture: every assertion
    // below is about the exact lines git reports, and a checkout that converted
    // them would report the whole file as modified.
    await gitExec(repo.path, 'config core.autocrlf false');

    fs.mkdirSync(path.join(repo.path, '.dmaker', 'context'), { recursive: true });

    // `.dmaker/` is where these specs seed their state and `.worktrees/` is
    // where the app would put a worktree. Ignoring both keeps the changed-file
    // list to the three files this fixture is actually about.
    await commitFile(
      repo.path,
      '.gitignore',
      '.dmaker/\n.worktrees/\n',
      'chore: ignore local state'
    );

    fs.mkdirSync(path.join(repo.path, 'src'), { recursive: true });
    await commitFile(repo.path, MODIFIED_FILE, COMMITTED_PARSER, 'feat: add the parser');
    await commitFile(
      repo.path,
      DELETED_FILE,
      `${DELETED_FILE_LINE}\n`,
      'feat: add the legacy module'
    );

    // Dirty the tree once: nothing in these tests writes to it, and re-doing it
    // per test would only race the server's 3s diff cache.
    fs.writeFileSync(path.join(repo.path, MODIFIED_FILE), MODIFIED_PARSER);
    fs.rmSync(path.join(repo.path, DELETED_FILE));
    fs.writeFileSync(path.join(repo.path, UNTRACKED_FILE), `${UNTRACKED_FILE_LINE}\n`);

    project = {
      projectPath: repo.path,
      projectName: `workbench-changes-${Date.now()}`,
      projectId: `workbench-changes-project-${Date.now()}`,
    };
  });

  test.afterAll(async () => {
    if (process.env.KEEP_TEST_DIR === 'true') return;
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test.beforeEach(async ({ page }) => {
    // Re-seed every time: seeding wipes `.dmaker/features`, and a spec that
    // inherits the previous one's leftovers reads as a mysterious extra row.
    seedWorkbenchFeatures(project.projectPath, [FEATURE, BRANCH_FEATURE]);

    await openWorkbenchBoard(page, project);

    // Gate every test on the endpoint actually reporting the dirty tree, not on
    // the files existing. Failing here names git and the route instead of
    // leaving a mystery empty file list in every test.
    await expect(async () => {
      const body = await fetchGitDiffs(page, project.projectPath);
      expect(body.files?.map((file) => file.status) ?? []).toEqual([...EXPECTED_STATUSES]);
    }).toPass({ timeout: 20000 });
  });

  test('lists one row per changed file, tagged with its git status', async ({ page }) => {
    await openTaskWorkbench(page, FEATURE.id);
    await selectWorkbenchTab(page, 'changes');

    const pane = changesPane(page);

    await expect(fileRows(page)).toHaveCount(3, { timeout: 15000 });
    await expect(pane.locator('[data-testid="changes-file-count"]')).toContainText(
      '3 files changed'
    );

    // Status grouping is carried on the rows themselves — there is no per-status
    // header — so this is what "grouped by status" has to mean on screen.
    await expect(fileRow(page, 'M')).toHaveCount(1);
    await expect(fileRow(page, 'M')).toContainText('parser.ts');
    await expect(fileRow(page, 'D')).toHaveCount(1);
    await expect(fileRow(page, 'D')).toContainText('legacy.ts');
    await expect(fileRow(page, '?')).toHaveCount(1);
    await expect(fileRow(page, '?')).toContainText('added.ts');

    // The header's roll-up spans the WHOLE payload, not the selected file:
    // parser.ts contributes +1/-1, added.ts +1 and legacy.ts -1.
    const header = pane.locator('[data-testid="changes-pane"] > header');
    await expect(header).toContainText('+2');
    await expect(header).toContainText('-2');

    // Cross-check: the pane and the endpoint must agree on what changed. A
    // count that only ever came from the UI cannot tell a rendering bug from a
    // git one — and the untracked file reaches the two halves by different
    // routes (`git status` lists it, `git diff HEAD` never mentions it).
    await expect(async () => {
      const body = await fetchGitDiffs(page, project.projectPath);
      expect(body.success).toBe(true);
      expect(body.hasChanges).toBe(true);
      expect(body.files?.map((file) => file.path) ?? []).toEqual([
        DELETED_FILE,
        MODIFIED_FILE,
        UNTRACKED_FILE,
      ]);
      expect(await fileRows(page).count()).toBe(body.files?.length ?? 0);
    }).toPass({ timeout: 20000 });

    // No branch on this task, so the fallback banner would be a lie.
    await expect(pane.locator('[data-testid="changes-main-checkout-banner"]')).toHaveCount(0);
  });

  test('selecting the modified file renders its added and removed lines', async ({ page }) => {
    await openTaskWorkbench(page, FEATURE.id);
    await selectWorkbenchTab(page, 'changes');

    const pane = changesPane(page);

    // The first row is selected on load so the pane is never blank. Here that
    // is the DELETED file — porcelain sorts tracked changes by path — which is
    // also why the editor action starts out refused.
    await expect(fileRows(page).first()).toHaveAttribute('data-selected', 'true', {
      timeout: 15000,
    });
    await expect(fileRow(page, 'D')).toHaveAttribute('data-selected', 'true');
    await expect(pane.locator('[data-testid="changes-open-editor"]')).toBeDisabled();

    await fileRow(page, 'M').click();
    await expect(fileRow(page, 'M')).toHaveAttribute('data-selected', 'true');
    await expect(fileRow(page, 'D')).toHaveAttribute('data-selected', 'false');

    // Both sides of the hunk, and only the changed line on each: the untouched
    // line rendered as context rather than as an addition.
    const diff = selectedDiff(page);
    await expect(diff).toContainText(REMOVED_LINE);
    await expect(diff).toContainText(ADDED_LINE);
    await expect(diff).toContainText(KEPT_LINE);
    await expect(addedLines(page)).toHaveCount(1);
    await expect(removedLines(page)).toHaveCount(1);

    await expect(pane).toContainText(MODIFIED_FILE);
    await expect(pane).toContainText('Modified');

    // A file that still exists is the case the editor action is for.
    await expect(pane.locator('[data-testid="changes-open-editor"]')).toBeEnabled();
  });

  test('a deleted file is all removals, and cannot be opened in the editor', async ({ page }) => {
    await openTaskWorkbench(page, FEATURE.id);
    await selectWorkbenchTab(page, 'changes');

    const pane = changesPane(page);

    await expect(fileRow(page, 'D')).toBeVisible({ timeout: 15000 });
    await fileRow(page, 'D').click();
    await expect(fileRow(page, 'D')).toHaveAttribute('data-selected', 'true');

    await expect(selectedDiff(page)).toContainText(DELETED_FILE_LINE);
    await expect(removedLines(page)).toHaveCount(1);
    await expect(addedLines(page)).toHaveCount(0);

    await expect(pane).toContainText('Deleted');
    // There is no file left to open — `readFile` would fail on it.
    await expect(pane.locator('[data-testid="changes-open-editor"]')).toBeDisabled();
  });

  test('an untracked file gets a diff of its own, all additions', async ({ page }) => {
    await openTaskWorkbench(page, FEATURE.id);
    await selectWorkbenchTab(page, 'changes');

    const pane = changesPane(page);

    await expect(fileRow(page, '?')).toBeVisible({ timeout: 15000 });
    await fileRow(page, '?').click();
    await expect(fileRow(page, '?')).toHaveAttribute('data-selected', 'true');

    // `git diff HEAD` never mentions an untracked file; every line here came
    // from the synthetic diff the server appends, so this is the assertion that
    // the two halves of the payload were joined on the same path string.
    await expect(selectedDiff(page)).toContainText(UNTRACKED_FILE_LINE);
    await expect(addedLines(page)).toHaveCount(1);
    await expect(removedLines(page)).toHaveCount(0);

    await expect(pane).toContainText('Untracked');
    await expect(pane.locator('[data-testid="changes-open-editor"]')).toBeEnabled();
  });

  test('a branch with no worktree says so instead of showing an empty pane', async ({ page }) => {
    await openTaskWorkbench(page, BRANCH_FEATURE.id);
    await selectWorkbenchTab(page, 'changes');

    const pane = changesPane(page);
    const banner = pane.locator('[data-testid="changes-main-checkout-banner"]');

    await expect(banner).toBeVisible({ timeout: 15000 });
    await expect(banner).toContainText('Showing the main checkout');
    await expect(banner).toContainText('feature/never-created');

    // The fallback still shows the main checkout's changes — the banner exists
    // because those look like the feature's own work, not because they vanish.
    await expect(fileRows(page)).toHaveCount(3);
  });
});
