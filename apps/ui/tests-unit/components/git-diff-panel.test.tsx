import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { GitDiffPanel } from '@/components/ui/git-diff-panel';

const mocks = vi.hoisted(() => ({
  worktreeGetDiffs: vi.fn(),
  gitGetDiffs: vi.fn(),
}));

vi.mock('@/lib/electron', () => ({
  getElectronAPI: () => ({
    worktree: { getDiffs: mocks.worktreeGetDiffs },
    git: { getDiffs: mocks.gitGetDiffs },
  }),
}));

const PROJECT_PATH = 'C:/repo/dmaker';
const FEATURE_ID = '26-08-2026-testing_prod_issue_to';
const BRANCH_NAME = 'testing-prod-issue-to-dev-change-agents-67bfafb7';

const EMPTY_RESULT = { success: true, diff: '', files: [] };

beforeEach(() => {
  mocks.worktreeGetDiffs.mockResolvedValue(EMPTY_RESULT);
  mocks.gitGetDiffs.mockResolvedValue(EMPTY_RESULT);
});

describe('GitDiffPanel worktree lookup', () => {
  it('passes branchName to the worktree diff request', async () => {
    // Worktrees live at `.worktrees/<sanitised branchName>`, never
    // `.worktrees/<featureId>`. Without branchName the server misses, falls
    // back to the main checkout and returns its diff with success: true — so
    // the panel showed the wrong changes and looked like it had worked.
    render(
      <GitDiffPanel
        projectPath={PROJECT_PATH}
        featureId={FEATURE_ID}
        branchName={BRANCH_NAME}
        compact={false}
      />
    );

    await waitFor(() => expect(mocks.worktreeGetDiffs).toHaveBeenCalled());
    expect(mocks.worktreeGetDiffs).toHaveBeenCalledWith(PROJECT_PATH, FEATURE_ID, BRANCH_NAME);
  });

  it('omits branchName when the feature has no branch', async () => {
    render(<GitDiffPanel projectPath={PROJECT_PATH} featureId={FEATURE_ID} compact={false} />);

    await waitFor(() => expect(mocks.worktreeGetDiffs).toHaveBeenCalled());
    expect(mocks.worktreeGetDiffs).toHaveBeenCalledWith(PROJECT_PATH, FEATURE_ID, undefined);
  });

  it('refetches when the branch changes', async () => {
    const { rerender } = render(
      <GitDiffPanel
        projectPath={PROJECT_PATH}
        featureId={FEATURE_ID}
        branchName="branch-a"
        compact={false}
      />
    );
    await waitFor(() => expect(mocks.worktreeGetDiffs).toHaveBeenCalledTimes(1));

    rerender(
      <GitDiffPanel
        projectPath={PROJECT_PATH}
        featureId={FEATURE_ID}
        branchName="branch-b"
        compact={false}
      />
    );
    await waitFor(() => expect(mocks.worktreeGetDiffs).toHaveBeenCalledTimes(2));
    expect(mocks.worktreeGetDiffs).toHaveBeenLastCalledWith(PROJECT_PATH, FEATURE_ID, 'branch-b');
  });

  it('still uses the plain git API when worktrees are off', async () => {
    render(
      <GitDiffPanel
        projectPath={PROJECT_PATH}
        featureId={FEATURE_ID}
        branchName={BRANCH_NAME}
        useWorktrees={false}
        compact={false}
      />
    );

    await waitFor(() => expect(mocks.gitGetDiffs).toHaveBeenCalledWith(PROJECT_PATH));
    expect(mocks.worktreeGetDiffs).not.toHaveBeenCalled();
  });
});
