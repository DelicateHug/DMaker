import { useCallback, useEffect, useMemo } from 'react';
import {
  Plus,
  LayoutGrid,
  Settings,
  Lightbulb,
  FileText,
  Brain,
  Terminal,
  GitPullRequest,
  Wand2,
  FolderOpen,
  PanelLeft,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/overlays';
import { useAppStore } from '@/store/app-store';
import { openLayer, LAYER_TITLES, type LayerId } from '@/store/layer-store';
import { showBoardTab, useActiveFeatureId } from '@/store/center-store';
import { useWorkbenchStore, WORKBENCH_TABS } from '@/store/workbench-store';
import { getStatusMeta } from './sidebar/status-meta';
import { isMac } from '@/lib/utils';

/** Tool layers offered in the palette, in menu order. */
const TOOL_LAYERS: Array<{ id: LayerId; icon: typeof Lightbulb }> = [
  { id: 'ideation', icon: Lightbulb },
  { id: 'spec', icon: FileText },
  { id: 'memory', icon: Brain },
  { id: 'terminal', icon: Terminal },
  { id: 'github-prs', icon: GitPullRequest },
  { id: 'interview', icon: Wand2 },
  { id: 'project-settings', icon: Settings },
  { id: 'settings', icon: Settings },
];

interface CommandPaletteProps {
  onCreateFeature: () => void;
}

/**
 * Global command palette (Ctrl/Cmd+K).
 *
 * Jumps to any feature, switches workbench panes, opens tool layers and
 * switches projects. Registration of the shortcut itself lives here so the
 * palette is self-contained.
 */
export function CommandPalette({ onCreateFeature }: CommandPaletteProps) {
  const { features, projects, currentProject, setCurrentProject } = useAppStore(
    useShallow((state) => ({
      features: state.features,
      projects: state.projects,
      currentProject: state.currentProject,
      setCurrentProject: state.setCurrentProject,
    }))
  );

  const {
    open,
    setCommandPaletteOpen,
    toggleCommandPalette,
    openWorkbench,
    setActiveTab,
    toggleSidebar,
  } = useWorkbenchStore(
    useShallow((state) => ({
      open: state.commandPaletteOpen,
      setCommandPaletteOpen: state.setCommandPaletteOpen,
      toggleCommandPalette: state.toggleCommandPalette,
      openWorkbench: state.openWorkbench,
      setActiveTab: state.setActiveTab,
      toggleSidebar: state.toggleSidebar,
    }))
  );

  const activeFeatureId = useActiveFeatureId();

  // Ctrl/Cmd+K toggles the palette from anywhere except while typing.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k') return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      toggleCommandPalette();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleCommandPalette]);

  /** Run an action and dismiss the palette. */
  const run = useCallback(
    (action: () => void) => {
      action();
      setCommandPaletteOpen(false);
    },
    [setCommandPaletteOpen]
  );

  const searchableFeatures = useMemo(
    () => features.filter((feature) => feature.status !== 'completed').slice(0, 200),
    [features]
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setCommandPaletteOpen}
      title="Command palette"
      description="Jump to a feature or run a command"
    >
      <CommandInput placeholder="Search features and commands…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Features">
          {searchableFeatures.map((feature) => {
            const statusMeta = getStatusMeta(feature.status);
            const StatusIcon = statusMeta.Icon;
            const title = feature.title || feature.description || 'Untitled feature';
            return (
              <CommandItem
                key={feature.id}
                value={`${title} ${feature.branchName ?? ''} ${statusMeta.label}`}
                onSelect={() => run(() => openWorkbench(feature.id))}
              >
                <StatusIcon
                  className="size-3.5 shrink-0"
                  style={{ color: statusMeta.dotColor }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{statusMeta.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Workbench">
          {WORKBENCH_TABS.map((tab) => (
            <CommandItem
              key={tab.id}
              value={`Go to ${tab.label} pane`}
              disabled={!activeFeatureId}
              onSelect={() => run(() => setActiveTab(tab.id))}
            >
              <PanelLeft className="shrink-0" />
              <span className="flex-1">Go to {tab.label}</span>
              <CommandShortcut>
                {isMac ? '⌘' : 'Ctrl '}
                {tab.shortcutDigit}
              </CommandShortcut>
            </CommandItem>
          ))}
          <CommandItem value="Show the board tab" onSelect={() => run(showBoardTab)}>
            <LayoutGrid className="shrink-0" />
            <span className="flex-1">Go to board</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem value="New feature create" onSelect={() => run(onCreateFeature)}>
            <Plus className="shrink-0" />
            <span className="flex-1">New feature</span>
            <CommandShortcut>{isMac ? '⌘N' : 'Ctrl N'}</CommandShortcut>
          </CommandItem>
          <CommandItem value="Toggle sidebar" onSelect={() => run(toggleSidebar)}>
            <PanelLeft className="shrink-0" />
            <span className="flex-1">Toggle sidebar</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Tools">
          {TOOL_LAYERS.map((tool) => {
            const Icon = tool.icon;
            return (
              <CommandItem
                key={tool.id}
                value={`Open ${LAYER_TITLES[tool.id]}`}
                onSelect={() => run(() => openLayer(tool.id))}
              >
                <Icon className="shrink-0" />
                <span className="flex-1">{LAYER_TITLES[tool.id]}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {projects.length > 1 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={`Switch to project ${project.name}`}
                  onSelect={() => run(() => setCurrentProject(project))}
                >
                  <FolderOpen className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  {currentProject?.id === project.id && (
                    <span className="shrink-0 text-xs text-muted-foreground">Current</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
