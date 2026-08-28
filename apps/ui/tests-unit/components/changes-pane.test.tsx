import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangesPane } from '@/components/workbench/panes/changes-pane';
import type { FileDiffsResult } from '@/types/electron';

/**
 * Hoisted because `vi.mock` factories run before the module body.
 */
const mocks = vi.hoisted(() => ({
  getDiffs: vi.fn(),
}));

vi.mock('@/lib/electron', () => ({
  getElectronAPI: () => ({ git: { getDiffs: mocks.getDiffs } }),
}));

// The real editor is a lazily-imported Monaco window. The pane only owes it an
// absolute path, so the stub exists to assert exactly that.
vi.mock('@/components/views/board-view/dialogs', () => ({
  CodeEditorWindow: ({
    open,
    componentProps,
  }: {
    open: boolean;
    componentProps: { initialFilePath?: string; projectPath: string | null };
  }) =>
    open ? (
      <div data-testid="code-editor" data-file-path={componentProps.initialFilePath ?? ''} />
    ) : null,
}));

const PROJECT_PATH = 'C:\\repo\\dmaker';
const WORKTREE_PATH = 'C:/repo/dmaker/.worktrees/feature-branch';

const DIFF = [
  'diff --git a/src/alpha.ts b/src/alpha.ts',
  'index 1111111..2222222 100644',
  '--- a/src/alpha.ts',
  '+++ b/src/alpha.ts',
  '@@ -1,2 +1,2 @@',
  ' const a = 1;',
  '-const b = 2;',
  '+const b = 3;',
  'diff --git a/src/gone.ts b/src/gone.ts',
  'deleted file mode 100644',
  'index 3333333..0000000',
  '--- a/src/gone.ts',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-const gone = true;',
].join('\n');

const RESULT: FileDiffsResult = {
  success: true,
  diff: DIFF,
  files: [
    { path: 'src/alpha.ts', status: 'M', statusText: 'Modified' },
    { path: 'src/gone.ts', status: 'D', statusText: 'Deleted' },
  ],
};

beforeEach(() => {
  mocks.getDiffs.mockResolvedValue(RESULT);
});

describe('ChangesPane', () => {
  it('renders an empty state rather than nothing when the worktree is clean', async () => {
    mocks.getDiffs.mockResolvedValue({ success: true, diff: '', files: [] });

    render(
      <ChangesPane projectPath={PROJECT_PATH} worktreePath={WORKTREE_PATH} branchName="feature" />
    );

    expect(await screen.findByTestId('changes-empty')).toBeVisible();
    expect(screen.getByTestId('changes-file-count')).toHaveTextContent('0 files changed');
  });

  it('says so when the branch has no worktree and the main checkout is being shown', async () => {
    render(<ChangesPane projectPath={PROJECT_PATH} worktreePath={null} branchName="feature/x" />);

    const banner = await screen.findByTestId('changes-main-checkout-banner');
    expect(banner).toHaveTextContent('Showing the main checkout — no worktree found for feature/x');
    // The fallback root is the project, normalised to one separator style.
    expect(mocks.getDiffs).toHaveBeenCalledWith('C:/repo/dmaker');
  });

  it('shows no banner when the branch resolved to a worktree', async () => {
    render(
      <ChangesPane projectPath={PROJECT_PATH} worktreePath={WORKTREE_PATH} branchName="feature/x" />
    );

    await screen.findByTestId('changes-file-list');
    expect(screen.queryByTestId('changes-main-checkout-banner')).toBeNull();
    expect(mocks.getDiffs).toHaveBeenCalledWith(WORKTREE_PATH);
  });

  it('lists one row per changed file and shows the selected file’s hunks', async () => {
    const user = userEvent.setup();
    render(<ChangesPane projectPath={PROJECT_PATH} worktreePath={WORKTREE_PATH} />);

    const rows = await screen.findAllByTestId('changes-file-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-status', 'M');
    expect(rows[1]).toHaveAttribute('data-status', 'D');

    // The first row is selected without a click, so the pane is never a blank
    // panel next to a populated list.
    expect(rows[0]).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('changes-diff')).toHaveTextContent('const b = 3;');
    expect(screen.getByTestId('changes-file-count')).toHaveTextContent('2 files changed');

    await user.click(rows[1]);
    expect(screen.getByTestId('changes-diff')).toHaveTextContent('const gone = true;');
  });

  it('opens the selected file by absolute path, and refuses a deleted one', async () => {
    const user = userEvent.setup();
    render(<ChangesPane projectPath={PROJECT_PATH} worktreePath={WORKTREE_PATH} />);

    const rows = await screen.findAllByTestId('changes-file-row');
    await user.click(screen.getByTestId('changes-open-editor'));
    expect(screen.getByTestId('code-editor')).toHaveAttribute(
      'data-file-path',
      `${WORKTREE_PATH}/src/alpha.ts`
    );

    // A deleted file is not on disk; `readFile` would only produce an error
    // dialog.
    await user.click(rows[1]);
    expect(screen.getByTestId('changes-open-editor')).toBeDisabled();
  });

  it('re-reads on demand, and spins the icon only for that request', async () => {
    const user = userEvent.setup();
    render(<ChangesPane projectPath={PROJECT_PATH} worktreePath={WORKTREE_PATH} />);

    await screen.findByTestId('changes-file-list');
    expect(mocks.getDiffs).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('changes-refresh').querySelector('.animate-spin')).toBeNull();

    await user.click(screen.getByTestId('changes-refresh'));
    expect(mocks.getDiffs).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.getByTestId('changes-refresh').querySelector('.animate-spin')).toBeNull()
    );
  });

  it('surfaces a failed read instead of showing a clean worktree', async () => {
    mocks.getDiffs.mockResolvedValue({ success: false, error: 'not a git repository' });

    render(<ChangesPane projectPath={PROJECT_PATH} worktreePath={WORKTREE_PATH} />);

    expect(await screen.findByTestId('changes-error')).toHaveTextContent('not a git repository');
    expect(screen.queryByTestId('changes-empty')).toBeNull();
  });

  it('does not fetch while the pane is hidden', async () => {
    render(
      <ChangesPane projectPath={PROJECT_PATH} worktreePath={WORKTREE_PATH} isActive={false} />
    );

    await waitFor(() => expect(screen.getByTestId('changes-pane')).toBeInTheDocument());
    expect(mocks.getDiffs).not.toHaveBeenCalled();
  });
});
