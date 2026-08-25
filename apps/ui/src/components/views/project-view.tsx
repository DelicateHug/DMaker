import { useEffect, useState, type ReactNode } from 'react';
import { Bot, Brain, Files, MessageSquare, Plug, ScrollText, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import {
  PROJECT_VIEW_TABS,
  useProjectViewStore,
  type ProjectViewTabId,
} from '@/store/project-view-store';
import { AgentChatPanel, FileExplorer } from './board-view/components';
import { CodeEditorWindow } from './board-view/dialogs';
import { AgentsSkillsSection } from './settings-view/agents-skills/agents-skills-section';
import { MCPServersSection } from './settings-view/mcp-servers/mcp-servers-section';
import { MemoryView } from './memory-view';
import { ScriptsPanel } from './project-view/scripts-panel';
import { SkillsPanel } from './project-view/skills-panel';
import { ProjectSettingsPanel } from './project-settings-view/project-settings-panel';

const TAB_ICONS: Record<ProjectViewTabId, typeof Bot> = {
  files: Files,
  chat: MessageSquare,
  agents: Bot,
  scripts: ScrollText,
  memory: Brain,
  mcp: Plug,
  settings: Settings,
};

/**
 * Project-scoped workspace: the project's files, its chat, the agents and
 * skills it can use, its deploy scripts, memory, MCP servers and its own
 * settings (identity, GitHub, worktrees, theme).
 *
 * Opens as a centre tab alongside the board, any open tasks and any open
 * tools — it is not an overlay, and opening it displaces nothing. Each pane
 * stays mounted once visited so chat sessions and scroll positions survive
 * tab switches.
 */
export function ProjectView() {
  const currentProject = useAppStore((state) => state.currentProject);
  const activeTab = useProjectViewStore((state) => state.activeTab);
  const setActiveTab = useProjectViewStore((state) => state.setActiveTab);

  const [mountedTabs, setMountedTabs] = useState<Set<ProjectViewTabId>>(() => new Set([activeTab]));

  useEffect(() => {
    setMountedTabs((previous) => {
      if (previous.has(activeTab)) return previous;
      const next = new Set(previous);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  // Files pane: opening a file pops the shared code editor window.
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [codeEditorFilePath, setCodeEditorFilePath] = useState<string | undefined>(undefined);

  const projectPath = currentProject?.path ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="project-view">
      {/* Pane strip — the centre tab above already names the project */}
      <nav
        className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border/60 px-2"
        role="tablist"
        aria-label="Project panes"
      >
        {PROJECT_VIEW_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab.id];
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`project-tab-${tab.id}`}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs cursor-pointer',
                'transition-colors duration-100',
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <Icon className="size-3.5" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Panes — mounted once visited, hidden when inactive */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {mountedTabs.has('files') && (
          <PaneHost isActive={activeTab === 'files'}>
            <FileExplorer
              projectPath={projectPath}
              onFileSelect={(filePath: string) => {
                setCodeEditorFilePath(filePath);
                setShowCodeEditor(true);
              }}
              className="h-full"
            />
          </PaneHost>
        )}

        {mountedTabs.has('chat') && (
          <PaneHost isActive={activeTab === 'chat'}>
            <AgentChatPanel
              project={currentProject}
              isCollapsed={false}
              showProjectSelector
              compact
              className="h-full"
            />
          </PaneHost>
        )}

        {mountedTabs.has('agents') && (
          <PaneHost isActive={activeTab === 'agents'}>
            <div className="flex h-full min-h-0">
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <AgentsSkillsSection />
              </div>
              <div className="w-80 shrink-0 border-l border-border/60">
                <SkillsPanel projectPath={projectPath} />
              </div>
            </div>
          </PaneHost>
        )}

        {mountedTabs.has('scripts') && (
          <PaneHost isActive={activeTab === 'scripts'}>
            <ScriptsPanel
              project={currentProject}
              projectPath={projectPath}
              showProjectSelector
              className="h-full"
            />
          </PaneHost>
        )}

        {mountedTabs.has('memory') && (
          <PaneHost isActive={activeTab === 'memory'}>
            <MemoryView />
          </PaneHost>
        )}

        {mountedTabs.has('mcp') && (
          <PaneHost isActive={activeTab === 'mcp'}>
            <div className="h-full overflow-y-auto p-3">
              <MCPServersSection />
            </div>
          </PaneHost>
        )}

        {mountedTabs.has('settings') && (
          <PaneHost isActive={activeTab === 'settings'}>
            <ProjectSettingsPanel className="h-full" showInlineMobileToggle />
          </PaneHost>
        )}
      </div>

      <CodeEditorWindow
        open={showCodeEditor}
        onOpenChange={setShowCodeEditor}
        componentProps={{
          initialFilePath: codeEditorFilePath,
          projectPath,
        }}
      />
    </div>
  );
}

/** Keeps a pane mounted while hiding it, preserving its internal state. */
function PaneHost({ isActive, children }: { isActive: boolean; children: ReactNode }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ visibility: isActive ? 'visible' : 'hidden' }}
      aria-hidden={!isActive}
      inert={!isActive ? true : undefined}
    >
      {children}
    </div>
  );
}
