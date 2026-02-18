import { lazyDialogPassthrough } from '@/components/ui/lazy-dialog';

// Types that must remain statically importable
export type { FollowUpHistoryEntry } from './follow-up-dialog';
export type { CompletedRunEntry, CompletedRunsModalProps } from './completed-runs-modal';

// ---------------------------------------------------------------------------
// Lazy-loaded dialog components
//
// Each dialog manages its own <Dialog> shell, so we use lazyDialogPassthrough
// which wraps them with Suspense + ErrorBoundary without adding an extra
// Dialog layer.  The chunk for each dialog is only fetched when `open` becomes
// true for the first time.
// ---------------------------------------------------------------------------

export const AddFeatureDialog = lazyDialogPassthrough(
  () => import('./add-feature-dialog'),
  'AddFeatureDialog'
);

export const AgentOutputModal = lazyDialogPassthrough(
  () => import('./agent-output-modal'),
  'AgentOutputModal'
);

export const BacklogPlanDialog = lazyDialogPassthrough(
  () => import('./backlog-plan-dialog'),
  'BacklogPlanDialog'
);

export const CompletedFeaturesModal = lazyDialogPassthrough(
  () => import('./completed-features-modal'),
  'CompletedFeaturesModal'
);

export const CompleteAllWaitingDialog = lazyDialogPassthrough(
  () => import('./complete-all-waiting-dialog'),
  'CompleteAllWaitingDialog'
);

export const DeleteCompletedFeatureDialog = lazyDialogPassthrough(
  () => import('./delete-completed-feature-dialog'),
  'DeleteCompletedFeatureDialog'
);

export const EditFeatureDialog = lazyDialogPassthrough(
  () => import('./edit-feature-dialog'),
  'EditFeatureDialog'
);

export const FollowUpDialog = lazyDialogPassthrough(
  () => import('./follow-up-dialog'),
  'FollowUpDialog'
);

export const PlanApprovalDialog = lazyDialogPassthrough(
  () => import('./plan-approval-dialog'),
  'PlanApprovalDialog'
);

export const MassEditDialog = lazyDialogPassthrough(
  () => import('./mass-edit-dialog'),
  'MassEditDialog'
);

export const UnsatisfiedDependenciesDialog = lazyDialogPassthrough(
  () => import('./unsatisfied-dependencies-dialog'),
  'UnsatisfiedDependenciesDialog'
);

export const CodeEditorWindow = lazyDialogPassthrough(
  () => import('./code-editor-window'),
  'CodeEditorWindow'
);

export const PipelineSettingsDialog = lazyDialogPassthrough(
  () => import('./pipeline-settings-dialog'),
  'PipelineSettingsDialog'
);

export const CreateWorktreeDialog = lazyDialogPassthrough(
  () => import('./create-worktree-dialog'),
  'CreateWorktreeDialog'
);

export const DeleteWorktreeDialog = lazyDialogPassthrough(
  () => import('./delete-worktree-dialog'),
  'DeleteWorktreeDialog'
);

export const CommitWorktreeDialog = lazyDialogPassthrough(
  () => import('./commit-worktree-dialog'),
  'CommitWorktreeDialog'
);

export const CreatePRDialog = lazyDialogPassthrough(
  () => import('./create-pr-dialog'),
  'CreatePRDialog'
);

export const CreateBranchDialog = lazyDialogPassthrough(
  () => import('./create-branch-dialog'),
  'CreateBranchDialog'
);

export const MergeWorktreeDialog = lazyDialogPassthrough(
  () => import('./merge-worktree-dialog'),
  'MergeWorktreeDialog'
);

export const CompletedRunsModal = lazyDialogPassthrough(
  () => import('./completed-runs-modal'),
  'CompletedRunsModal'
);
