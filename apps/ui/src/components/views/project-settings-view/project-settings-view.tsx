import { Settings } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { ProjectSettingsPanel } from './project-settings-panel';

/**
 * Standalone Project Settings screen: a titled header over the shared settings
 * panel. The same panel is also mounted as the Settings tab of the project
 * view, so the two never drift apart.
 */
export function ProjectSettingsView() {
  const currentProject = useAppStore((state) => state.currentProject);

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden content-bg"
      data-testid="project-settings-view"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md"
        data-testid="project-settings-header"
      >
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">Project Settings</h1>
            <p className="text-sm text-muted-foreground">
              {currentProject
                ? `Configure settings for ${currentProject.name}`
                : 'Select a project to configure its settings'}
            </p>
          </div>
        </div>
      </div>

      <ProjectSettingsPanel showInlineMobileToggle />
    </div>
  );
}
