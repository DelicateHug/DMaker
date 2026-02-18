import { lazyDialogPassthrough } from '@/components/ui/lazy-dialog';

// ---------------------------------------------------------------------------
// Lazy-loaded dialog components
//
// Each dialog manages its own <Dialog> / <Sheet> shell, so we use
// lazyDialogPassthrough which wraps them with Suspense + ErrorBoundary
// without adding an extra Dialog layer.  The chunk for each dialog is only
// fetched when `open` becomes true for the first time.
// ---------------------------------------------------------------------------

export const BoardBackgroundModal = lazyDialogPassthrough(
  () => import('./board-background-modal'),
  'BoardBackgroundModal'
);

export const DeleteProjectDialog = lazyDialogPassthrough(
  () => import('./delete-project-dialog'),
  'DeleteProjectDialog'
);

// Static re-exports (not yet converted to lazy)
export { DeleteAllArchivedSessionsDialog } from './delete-all-archived-sessions-dialog';
export { DeleteSessionDialog } from './delete-session-dialog';
export { FileBrowserDialog } from './file-browser-dialog';
export { NewProjectModal } from './new-project-modal';
export { SandboxRejectionScreen } from './sandbox-rejection-screen';
export { SandboxRiskDialog } from './sandbox-risk-dialog';
export { WorkspacePickerModal } from './workspace-picker-modal';
