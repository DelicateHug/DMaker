import { GitDiffPanel } from '@/components/ui/git-diff-panel';

interface DiffPaneProps {
  projectPath: string;
  featureId: string;
  /** Whether the feature runs on its own worktree branch */
  useWorktrees: boolean;
}

/** Review the changes the agent made for this feature before merging. */
export function DiffPane({ projectPath, featureId, useWorktrees }: DiffPaneProps) {
  return (
    <GitDiffPanel
      projectPath={projectPath}
      featureId={featureId}
      useWorktrees={useWorktrees}
      className="h-full"
    />
  );
}
