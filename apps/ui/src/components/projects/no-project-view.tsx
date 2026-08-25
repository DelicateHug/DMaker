import { ProjectPicker } from './project-picker';

/**
 * The board's empty state: shown in the centre pane whenever no project is
 * open. Replaces the old standalone `/dashboard` screen — the app now lands on
 * `/board` straight after onboarding and this is what greets a first run.
 */
export function NoProjectView() {
  return (
    <div
      className="flex-1 overflow-y-auto content-bg p-4 sm:p-8"
      data-testid="board-view-no-project"
    >
      <div className="max-w-6xl mx-auto py-8 sm:py-12">
        <ProjectPicker />
      </div>
    </div>
  );
}
