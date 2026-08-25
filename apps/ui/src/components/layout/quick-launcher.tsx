import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  GitPullRequest,
  GitBranch,
  Lightbulb,
  FileText,
  Brain,
  Terminal,
  Settings,
  Plus,
  RefreshCw,
  PanelTop,
  CheckCircle2,
  FolderPlus,
  Wand2,
  Bot,
  FolderKanban,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn, pathsEqual } from '@/lib/utils';
import { getElectronAPI, type Project } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { Button } from '@/components/ui/button';
import { Switch, Label, Slider } from '@/components/ui/forms';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays';
import { CompletedFeaturesModal } from '@/components/views/board-view/dialogs';
import { ProjectPickerModal } from '@/components/dialogs/project-picker-modal';
import { useBoardControlsStore, getBoardControlsForTopNav } from '@/store/board-controls-store';
import { type LayerId } from '@/store/layer-store';
import { useCenterStore } from '@/store/center-store';

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  isCurrent?: boolean;
  hasWorktree?: boolean;
}

/**
 * AgConfigurationSection - Global agent concurrency slider (1-20, default 5)
 */
function AgConfigurationSection() {
  const agentMultiplier = useAppStore((state) => state.agentMultiplier);
  const setAgentMultiplier = useAppStore((state) => state.setAgentMultiplier);
  const runningAgentsCount = useBoardControlsStore((state) => state.runningAgentsCount);

  const handleMaxAgentsChange = (value: number[]) => {
    setAgentMultiplier(value[0]);
  };

  return (
    <div className="space-y-2 px-2 py-2">
      <div className="flex items-center gap-2">
        <Bot className="w-4 h-4 text-brand-500 shrink-0" />
        <span className="text-xs font-medium">Max Concurrent Agents</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {runningAgentsCount}/{agentMultiplier}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Slider
          value={[agentMultiplier]}
          onValueChange={handleMaxAgentsChange}
          min={1}
          max={20}
          step={1}
          className="flex-1"
          data-testid="tools-ag-concurrency-slider"
        />
        <span className="text-xs font-medium min-w-[2ch] text-right">{agentMultiplier}</span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Maximum number of concurrent agents across all projects.
      </p>
    </div>
  );
}

/**
 * QuickLauncher - Single [+] button that opens a popover with all tools, git, and actions.
 * Replaces the separate Tools, Git, and GitHub dropdown menus.
 */
interface QuickLauncherProps {
  currentProject: Project | null;
  onCreateWorktree?: () => void;
  onWorktreeRefresh?: () => void;
  worktreeRefreshTrigger?: number;
  /** Opens the OS folder picker to add a project */
  onOpenProject?: () => void;
  /** Extra classes for the trigger button */
  className?: string;
}

// All launcher items
const LAUNCHER_ITEMS: { id: LayerId; label: string; icon: typeof Lightbulb; section: string }[] = [
  { id: 'ideation', label: 'Ideation', icon: Lightbulb, section: 'Tools' },
  { id: 'spec', label: 'Spec Editor', icon: FileText, section: 'Tools' },
  { id: 'memory', label: 'Memory', icon: Brain, section: 'Tools' },
  { id: 'terminal', label: 'Terminal', icon: Terminal, section: 'Tools' },
  { id: 'github-prs', label: 'GitHub PRs', icon: GitPullRequest, section: 'GitHub' },
  { id: 'project-settings', label: 'Project Settings', icon: Settings, section: 'Settings' },
  { id: 'interview', label: 'Interview', icon: Wand2, section: 'Settings' },
];

export function QuickLauncher({
  currentProject,
  onCreateWorktree,
  onWorktreeRefresh,
  worktreeRefreshTrigger = 0,
  onOpenProject,
  className,
}: QuickLauncherProps) {
  const [open, setOpen] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  // Tools that currently hold a centre tab.
  const openToolIds = useCenterStore(
    useShallow((state) => state.tabs.flatMap((tab) => (tab.kind === 'tool' ? [tab.toolId] : [])))
  );
  const projects = useAppStore((s) => s.projects);

  // Board actions (Plan, Closed Issues) come from the board controls store.
  const boardControlsState = useBoardControlsStore();
  const boardControls = useMemo(
    () => getBoardControlsForTopNav(boardControlsState),
    [boardControlsState]
  );

  // Git worktree state
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [isLoadingWorktrees, setIsLoadingWorktrees] = useState(false);
  const {
    getCurrentWorktree,
    setCurrentWorktree,
    setWorktrees: setWorktreesInStore,
    worktreePanelVisibleByProject,
    setWorktreePanelVisible,
  } = useAppStore(
    useShallow((state) => ({
      getCurrentWorktree: state.getCurrentWorktree,
      setCurrentWorktree: state.setCurrentWorktree,
      setWorktrees: state.setWorktrees,
      worktreePanelVisibleByProject: state.worktreePanelVisibleByProject,
      setWorktreePanelVisible: state.setWorktreePanelVisible,
    }))
  );

  const isWorktreePanelVisible = currentProject
    ? (worktreePanelVisibleByProject[currentProject.path] ?? true)
    : true;

  const handleWorktreePanelToggle = useCallback(
    async (visible: boolean) => {
      if (!currentProject) return;
      setWorktreePanelVisible(currentProject.path, visible);
      try {
        const httpClient = getHttpApiClient();
        await httpClient.settings.updateProject(currentProject.path, {
          worktreePanelVisible: visible,
        });
      } catch (error) {
        console.error('Failed to persist worktree panel visibility:', error);
      }
    },
    [currentProject, setWorktreePanelVisible]
  );

  const currentWorktree = currentProject ? getCurrentWorktree(currentProject.path) : null;
  const currentWorktreePath = currentWorktree?.path ?? null;

  const fetchWorktrees = useCallback(async () => {
    if (!currentProject?.path) return;
    setIsLoadingWorktrees(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.listAll) return;
      const result = await api.worktree.listAll(currentProject.path, true, false);
      if (result.success && result.worktrees) {
        setWorktrees(result.worktrees);
        setWorktreesInStore(currentProject.path, result.worktrees);
      }
    } catch (error) {
      console.error('Failed to fetch worktrees:', error);
    } finally {
      setIsLoadingWorktrees(false);
    }
  }, [currentProject?.path, setWorktreesInStore]);

  useEffect(() => {
    fetchWorktrees();
  }, [fetchWorktrees, worktreeRefreshTrigger]);

  const mainWorktree = useMemo(() => worktrees.find((w) => w.isMain), [worktrees]);
  const nonMainWorktrees = useMemo(() => worktrees.filter((w) => !w.isMain), [worktrees]);

  const isWorktreeSelected = useCallback(
    (worktree: WorktreeInfo) => {
      return worktree.isMain
        ? currentWorktreePath === null
        : pathsEqual(worktree.path, currentWorktreePath);
    },
    [currentWorktreePath]
  );

  const handleSelectWorktree = useCallback(
    (worktree: WorktreeInfo) => {
      if (!currentProject) return;
      setCurrentWorktree(
        currentProject.path,
        worktree.isMain ? null : worktree.path,
        worktree.branch
      );
      setOpen(false);
    },
    [currentProject, setCurrentWorktree]
  );

  const handleCreateWorktree = useCallback(() => {
    if (onCreateWorktree) {
      onCreateWorktree();
    } else {
      window.dispatchEvent(new CustomEvent('dmaker:create-worktree'));
    }
    setOpen(false);
  }, [onCreateWorktree]);

  const selectedWorktree = useMemo(() => {
    if (currentWorktreePath === null) return mainWorktree;
    return (
      worktrees.find((w) => !w.isMain && pathsEqual(w.path, currentWorktreePath)) || mainWorktree
    );
  }, [worktrees, currentWorktreePath, mainWorktree]);

  // Check if any launcher layer is open
  const hasOpenLayer = LAUNCHER_ITEMS.some((item) => openToolIds.includes(item.id));

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-7 w-7 p-0 shrink-0',
              'hover:bg-accent/50 transition-colors duration-150',
              hasOpenLayer && 'bg-brand-500/10 text-brand-500',
              className
            )}
            data-testid="quick-launcher-trigger"
            title="Open tools & navigation"
          >
            <Plus
              className={cn('w-4 h-4', hasOpenLayer ? 'text-brand-500' : 'text-muted-foreground')}
            />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-72 p-2" data-testid="quick-launcher-content">
          <div className="flex flex-col gap-1">
            {/* Tool navigation moved to the sidebar footer
                (components/layout/sidebar/app-sidebar.tsx). */}

            {/* Projects, Plan & Closed Issues */}
            <div className="h-px bg-border my-1.5" />
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
              Actions
            </div>
            <button
              className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-left"
              data-testid="launcher-switch-project"
              onClick={() => {
                setShowProjectPicker(true);
                setOpen(false);
              }}
            >
              <FolderKanban className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Projects…</span>
            </button>
            {onOpenProject && (
              <button
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-left"
                data-testid="launcher-add-project"
                onClick={() => {
                  onOpenProject();
                  setOpen(false);
                }}
              >
                <FolderPlus className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">Add project…</span>
              </button>
            )}
            {currentProject && (
              <button
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-left"
                data-testid="launcher-completed"
                onClick={() => {
                  setShowCompletedModal(true);
                  setOpen(false);
                }}
              >
                <CheckCircle2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">Closed Issues</span>
              </button>
            )}
            {boardControls && boardControls.isMounted && (
              <button
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-left"
                data-testid="launcher-plan"
                onClick={() => {
                  boardControls.onOpenPlanDialog();
                  setOpen(false);
                }}
              >
                <Wand2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">Plan</span>
                {boardControls.hasPendingPlan && (
                  <span className="ml-auto text-[10px] text-emerald-500 font-medium">
                    Review ready
                  </span>
                )}
              </button>
            )}

            {/* Git / Worktree section */}
            {currentProject && (
              <>
                <div className="h-px bg-border my-1.5" />
                <div className="flex items-center justify-between px-2 py-1">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Git
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={handleCreateWorktree}
                      title="Create new worktree"
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => {
                        fetchWorktrees();
                        onWorktreeRefresh?.();
                      }}
                      disabled={isLoadingWorktrees}
                      title="Refresh worktrees"
                    >
                      <RefreshCw className={cn('w-3 h-3', isLoadingWorktrees && 'animate-spin')} />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                  {mainWorktree && (
                    <button
                      onClick={() => handleSelectWorktree(mainWorktree)}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1 rounded-md text-xs font-mono cursor-pointer transition-colors',
                        'hover:bg-accent/50',
                        isWorktreeSelected(mainWorktree) && 'bg-accent'
                      )}
                    >
                      <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate text-left">{mainWorktree.branch}</span>
                      {isWorktreeSelected(mainWorktree) && (
                        <span className="text-[10px] text-brand-500 font-medium">Active</span>
                      )}
                    </button>
                  )}
                  {nonMainWorktrees.map((worktree) => (
                    <button
                      key={worktree.path}
                      onClick={() => handleSelectWorktree(worktree)}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1 rounded-md text-xs font-mono cursor-pointer transition-colors',
                        'hover:bg-accent/50',
                        isWorktreeSelected(worktree) && 'bg-accent'
                      )}
                    >
                      <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate text-left">{worktree.branch}</span>
                      {isWorktreeSelected(worktree) && (
                        <span className="text-[10px] text-brand-500 font-medium">Active</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground px-2 pt-1">
                  Branch: <span className="font-mono">{selectedWorktree?.branch || 'main'}</span>
                </div>
                <div className="flex items-center justify-between px-2 py-1">
                  <div className="flex items-center gap-2">
                    <PanelTop className="w-3.5 h-3.5 text-muted-foreground" />
                    <Label htmlFor="wt-bar-toggle" className="text-xs font-medium cursor-pointer">
                      Worktree Bar
                    </Label>
                  </div>
                  <Switch
                    id="wt-bar-toggle"
                    checked={isWorktreePanelVisible}
                    onCheckedChange={handleWorktreePanelToggle}
                  />
                </div>
              </>
            )}

            {/* AG Configuration */}
            <div className="h-px bg-border my-1.5" />
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
              Agents
            </div>
            <AgConfigurationSection />
          </div>
        </PopoverContent>
      </Popover>

      {/* Completed Features Modal */}
      <CompletedFeaturesModal
        open={showCompletedModal}
        onOpenChange={setShowCompletedModal}
        componentProps={{
          currentProjectPath: currentProject?.path,
          projectPaths: projects.map((p) => p.path),
          availableProjects: new Map(projects.map((p) => [p.path, p.name])),
        }}
      />

      {/* Project list — the replacement for the old /dashboard screen */}
      <ProjectPickerModal open={showProjectPicker} onOpenChange={setShowProjectPicker} />
    </>
  );
}
