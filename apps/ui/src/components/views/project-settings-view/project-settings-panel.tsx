/**
 * The project settings body: side navigation plus the active section.
 *
 * Shared by the standalone Project Settings layer and the Settings tab inside
 * the project view, so both show exactly the same sections.
 */

import { useEffect, useState } from 'react';
import { FolderOpen, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { ProjectIdentitySection } from './project-identity-section';
import { ProjectGitHubSection } from './project-github-section';
import { ProjectThemeSection } from './project-theme-section';
import { WorktreePreferencesSection } from './worktree-preferences-section';
import { DangerZoneSection } from '../settings-view/danger-zone/danger-zone-section';
import { DeleteProjectDialog } from '../settings-view/components/delete-project-dialog';
import { ProjectSettingsNavigation } from './components/project-settings-navigation';
import {
  useProjectSettingsView,
  type ProjectSettingsViewId,
} from './hooks/use-project-settings-view';
import type { Project as ElectronProject } from '@/lib/electron';

// Breakpoint constant for mobile (matches Tailwind lg breakpoint)
const LG_BREAKPOINT = 1024;

interface ProjectSettingsPanelProps {
  /** Which section to open on first render */
  initialView?: ProjectSettingsViewId;
  /**
   * Renders the mobile navigation toggle. The standalone view puts it in its
   * own header, so it passes a setter instead of showing one here.
   */
  showInlineMobileToggle?: boolean;
  className?: string;
}

/** Convert the electron Project shape to what the shared sections expect. */
interface SettingsProject {
  id: string;
  name: string;
  path: string;
  theme?: string;
  icon?: string;
  customIconPath?: string;
}

function convertProject(project: ElectronProject | null): SettingsProject | null {
  if (!project) return null;
  return {
    id: project.id,
    name: project.name,
    path: project.path,
    theme: project.theme,
    icon: project.icon,
    customIconPath: project.customIconPath,
  };
}

export function ProjectSettingsPanel({
  initialView = 'identity',
  showInlineMobileToggle = false,
  className,
}: ProjectSettingsPanelProps) {
  const currentProject = useAppStore((state) => state.currentProject);
  const moveProjectToTrash = useAppStore((state) => state.moveProjectToTrash);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { activeView, navigateTo } = useProjectSettingsView({ initialView });

  // Navigation is a permanent column on desktop, an overlay on mobile.
  const [showNavigation, setShowNavigation] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= LG_BREAKPOINT;
    }
    return true;
  });

  // Picking a section on mobile should reveal it, not leave the menu covering it.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < LG_BREAKPOINT) {
      setShowNavigation(false);
    }
  }, [activeView]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= LG_BREAKPOINT) {
        setShowNavigation(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!currentProject) {
    return (
      <div
        className={cn('flex-1 flex items-center justify-center p-8', className)}
        data-testid="project-settings-no-project"
      >
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
            <FolderOpen className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">No Project Selected</h2>
          <p className="text-sm text-muted-foreground">
            Select a project from the sidebar to configure project-specific settings.
          </p>
        </div>
      </div>
    );
  }

  const settingsProject = convertProject(currentProject);

  const renderActiveSection = () => {
    switch (activeView) {
      case 'identity':
        return <ProjectIdentitySection project={currentProject} />;
      case 'github':
        return <ProjectGitHubSection project={currentProject} />;
      case 'theme':
        return <ProjectThemeSection project={currentProject} />;
      case 'worktrees':
        return <WorktreePreferencesSection project={currentProject} />;
      case 'danger':
        return (
          <DangerZoneSection
            project={settingsProject}
            onDeleteClick={() => setShowDeleteDialog(true)}
          />
        );
      default:
        return <ProjectIdentitySection project={currentProject} />;
    }
  };

  return (
    <div className={cn('flex-1 flex flex-col overflow-hidden min-h-0', className)}>
      {showInlineMobileToggle && (
        <div className="lg:hidden flex justify-end px-3 py-2 border-b border-border/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowNavigation(!showNavigation)}
            className="h-8 w-8 p-0"
            aria-label={showNavigation ? 'Close navigation menu' : 'Open navigation menu'}
            data-testid="project-settings-mobile-menu-button"
          >
            {showNavigation ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden min-h-0">
        <ProjectSettingsNavigation
          activeSection={activeView}
          onNavigate={navigateTo}
          isOpen={showNavigation}
          onClose={() => setShowNavigation(false)}
        />

        <div className="flex-1 overflow-y-auto p-4 lg:p-8" data-testid="project-settings-content">
          <div className="max-w-4xl mx-auto">{renderActiveSection()}</div>
        </div>
      </div>

      <DeleteProjectDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        project={currentProject}
        onConfirm={moveProjectToTrash}
      />
    </div>
  );
}
