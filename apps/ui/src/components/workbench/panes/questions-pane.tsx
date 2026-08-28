import type { Feature as StoredFeature } from '@dmaker/types';
import { AgentQuestionsPanel } from '@/components/views/board-view/components/agent-questions-panel';
import type { Feature } from '@/store/app-store';

interface QuestionsPaneProps {
  feature: Feature;
  projectPath: string;
  /**
   * Whether this pane is the one on screen. Panes stay mounted once visited, so
   * without this every hidden Questions pane of every open task would keep
   * re-reading feature.json on the panel's safety-net poll.
   */
  isActive?: boolean;
}

/**
 * Questions the agent has raised for this feature, and the record of what was
 * offered and what was picked.
 *
 * The panel is shared with the task modal rather than reimplemented — one set
 * of testids, one answer path, one place the "choices are the record" rule
 * lives.
 */
export function QuestionsPane({ feature, projectPath, isActive }: QuestionsPaneProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto p-3">
      <AgentQuestionsPanel
        projectPath={projectPath}
        featureId={feature.id}
        // The store's Feature widens `status` to take `pipeline_*`, which the
        // shared type does not admit. The panel reads neither status nor any
        // field the two disagree on; it replaces this with the server's own
        // Feature on its first fetch.
        initialFeature={feature as unknown as StoredFeature}
        isActive={isActive}
      />
    </div>
  );
}
