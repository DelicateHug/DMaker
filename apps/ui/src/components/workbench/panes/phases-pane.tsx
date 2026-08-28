import { PhasesTodosPanel } from '@/components/views/board-view/components/phases-todos-panel';
import type { Feature } from '@/store/app-store';

interface PhasesPaneProps {
  feature: Feature;
  projectPath: string;
  /**
   * Whether this pane is the one on screen. Panes stay mounted once visited,
   * so without this every hidden Phases pane of every open task would read the
   * transcript on mount.
   */
  isActive?: boolean;
}

/**
 * Plan phases, pipeline steps and the agent's live todos for the open feature.
 */
export function PhasesPane({ feature, projectPath, isActive }: PhasesPaneProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto p-3">
      <PhasesTodosPanel
        projectPath={projectPath}
        featureId={feature.id}
        feature={feature}
        isActive={isActive}
      />
    </div>
  );
}
