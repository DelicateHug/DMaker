import { Page, Locator } from '@playwright/test';

// The board was a kanban of columns and cards. The task list now lives in the
// SIDEBAR — board-view renders no list at all, only the canvas the workbench
// opens into. These helpers keep the old names so specs read the same, but
// point at the sidebar, which is where tasks actually are.

/**
 * A feature's row in the sidebar.
 */
export async function getKanbanCard(page: Page, featureId: string): Promise<Locator> {
  return page.locator(`[data-testid="sidebar-feature-row"][data-feature-id="${featureId}"]`);
}

/**
 * A status group in the sidebar (e.g. 'backlog', 'planning', 'waiting_approval').
 *
 * Groups are nested project → branch → status and their test id carries all
 * three, so match on the status suffix rather than trying to reconstruct the
 * project path and branch a feature happens to be on.
 */
export async function getKanbanColumn(page: Page, columnId: string): Promise<Locator> {
  return page.locator(`[data-testid^="sidebar-section-status:"][data-testid$=":${columnId}"]`);
}

/**
 * Rows inside a given status group, for counting or filtering by text.
 */
export async function getFeatureRowsInStatus(page: Page, status: string): Promise<Locator> {
  return (await getKanbanColumn(page, status)).locator('[data-testid="sidebar-feature-row"]');
}

/**
 * Widen the board's status funnel so every status group renders.
 *
 * The funnel starts on a single status, so a spec that seeds a backlog feature
 * and then looks for the backlog group finds nothing — the feature loaded fine,
 * it is just filtered out. Call this after the board loads.
 */
export async function showAllStatuses(page: Page): Promise<void> {
  const trigger = page.locator('[data-testid="board-status-dropdown-trigger"]');
  await trigger.waitFor({ state: 'visible', timeout: 10000 });
  await trigger.click();

  const content = page.locator('[data-testid="board-status-dropdown-content"]');
  await content.waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('[data-testid="board-status-dropdown-option-all"]').click();
  await page.keyboard.press('Escape');
  await content.waitFor({ state: 'hidden', timeout: 5000 });
}

/**
 * Drag a feature row onto a status group.
 */
export async function dragKanbanCard(
  page: Page,
  featureId: string,
  targetColumnId: string
): Promise<void> {
  const dragHandle = page.locator(`[data-testid="drag-handle-${featureId}"]`);
  const targetColumn = page.locator(
    `[data-testid^="sidebar-section-status:"][data-testid$=":${targetColumnId}"]`
  );

  // Perform drag and drop
  await dragHandle.dragTo(targetColumn);
}

/**
 * Click the view output button on a kanban card
 */
export async function clickViewOutput(page: Page, featureId: string): Promise<void> {
  // Try the running version first, then the in-progress version
  const runningBtn = page.locator(`[data-testid="view-output-${featureId}"]`);
  const inProgressBtn = page.locator(`[data-testid="view-output-inprogress-${featureId}"]`);

  if (await runningBtn.isVisible()) {
    await runningBtn.click();
  } else if (await inProgressBtn.isVisible()) {
    await inProgressBtn.click();
  } else {
    throw new Error(`View output button not found for feature ${featureId}`);
  }
}

/**
 * Check if the drag handle is visible for a specific feature card
 */
export async function isDragHandleVisibleForFeature(
  page: Page,
  featureId: string
): Promise<boolean> {
  const dragHandle = page.locator(`[data-testid="drag-handle-${featureId}"]`);
  return await dragHandle.isVisible().catch(() => false);
}

/**
 * Get the drag handle element for a specific feature card
 */
export async function getDragHandleForFeature(page: Page, featureId: string): Promise<Locator> {
  return page.locator(`[data-testid="drag-handle-${featureId}"]`);
}

// ============================================================================
// Add Feature Dialog
// ============================================================================

/**
 * Open the Add Feature dialog.
 *
 * The button moved out of the board header and into the sidebar when the
 * header was folded away, so the old `add-feature-button` hook no longer
 * exists anywhere.
 */
export async function clickAddFeature(page: Page): Promise<void> {
  await page.click('[data-testid="sidebar-new-feature"]');
  await page.waitForSelector('[data-testid="add-feature-dialog"]', {
    timeout: 5000,
  });
}

/**
 * Fill in the add feature dialog
 */
export async function fillAddFeatureDialog(
  page: Page,
  description: string,
  options?: { branch?: string; category?: string }
): Promise<void> {
  // Fill description (using the dropzone textarea)
  const descriptionInput = page.locator('[data-testid="add-feature-dialog"] textarea').first();
  await descriptionInput.fill(description);

  // Fill branch if provided (it's a combobox autocomplete)
  if (options?.branch) {
    // First, select "Other branch" radio option if not already selected
    const otherBranchRadio = page
      .locator('[data-testid="feature-radio-group"]')
      .locator('[id="feature-other"]');
    await otherBranchRadio.waitFor({ state: 'visible', timeout: 5000 });
    await otherBranchRadio.click();
    // Wait for the branch input to appear
    await page.waitForTimeout(300);

    // Now click on the branch input (autocomplete)
    const branchInput = page.locator('[data-testid="feature-input"]');
    await branchInput.waitFor({ state: 'visible', timeout: 5000 });
    await branchInput.click();
    // Wait for the popover to open
    await page.waitForTimeout(300);
    // Type in the command input
    const commandInput = page.locator('[cmdk-input]');
    await commandInput.fill(options.branch);
    // Press Enter to select/create the branch
    await commandInput.press('Enter');
    // Wait for popover to close
    await page.waitForTimeout(200);
  }

  // Fill category if provided (it's also a combobox autocomplete)
  if (options?.category) {
    const categoryButton = page.locator('[data-testid="feature-category-input"]');
    await categoryButton.click();
    await page.waitForTimeout(300);
    const commandInput = page.locator('[cmdk-input]');
    await commandInput.fill(options.category);
    await commandInput.press('Enter');
    await page.waitForTimeout(200);
  }
}

/**
 * Confirm the add feature dialog
 */
export async function confirmAddFeature(page: Page): Promise<void> {
  await page.click('[data-testid="confirm-add-feature"]');
  // Wait for dialog to close
  await page.waitForFunction(() => !document.querySelector('[data-testid="add-feature-dialog"]'), {
    timeout: 5000,
  });
}

/**
 * Add a feature with all steps in one call
 */
export async function addFeature(
  page: Page,
  description: string,
  options?: { branch?: string; category?: string }
): Promise<void> {
  await clickAddFeature(page);
  await fillAddFeatureDialog(page, description, options);
  await confirmAddFeature(page);
}

// ============================================================================
// Worktree Selector
// ============================================================================

/**
 * Get the worktree selector element
 */
export async function getWorktreeSelector(page: Page): Promise<Locator> {
  return page.locator('[data-testid="worktree-selector"]');
}

/**
 * Click on a branch button in the worktree selector
 */
export async function selectWorktreeBranch(page: Page, branchName: string): Promise<void> {
  const branchButton = page.getByRole('button', {
    name: new RegExp(branchName, 'i'),
  });
  await branchButton.click();
  await page.waitForTimeout(500); // Wait for UI to update
}

/**
 * Get the currently selected branch in the worktree selector
 */
export async function getSelectedWorktreeBranch(page: Page): Promise<string | null> {
  // The main branch button has aria-pressed="true" when selected
  const selectedButton = page.locator(
    '[data-testid="worktree-selector"] button[aria-pressed="true"]'
  );
  const text = await selectedButton.textContent().catch(() => null);
  return text?.trim() || null;
}

/**
 * Check if a branch button is visible in the worktree selector
 */
export async function isWorktreeBranchVisible(page: Page, branchName: string): Promise<boolean> {
  const branchButton = page.getByRole('button', {
    name: new RegExp(branchName, 'i'),
  });
  return await branchButton.isVisible().catch(() => false);
}
