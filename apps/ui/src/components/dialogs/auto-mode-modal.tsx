import { useState, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import {
  Bot,
  FastForward,
  Play,
  Square,
  Zap,
  FolderKanban,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { useAppStore, DEFAULT_PROJECT_AUTO_MODE_CONFIG } from '@/store/app-store';
import { useAutoMode } from '@/hooks/use-auto-mode';
import { cn } from '@/lib/utils';

interface AutoModeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Local per-project configuration state (extends store config with selection state)
interface LocalProjectAutoModeConfig {
  selected: boolean;
  requireVerification: boolean;
}

export function AutoModeModal({ open, onOpenChange }: AutoModeModalProps) {
  const {
    projects,
    currentProject,
    agentMultiplier,
    skipVerificationInAutoMode,
    setAgentMultiplier,
    setSkipVerificationInAutoMode,
    autoModeByProject,
    autoModeConfigByProject,
    setProjectAutoModeConfig,
  } = useAppStore(
    useShallow((state) => ({
      projects: state.projects,
      currentProject: state.currentProject,
      agentMultiplier: state.agentMultiplier,
      skipVerificationInAutoMode: state.skipVerificationInAutoMode,
      setAgentMultiplier: state.setAgentMultiplier,
      setSkipVerificationInAutoMode: state.setSkipVerificationInAutoMode,
      autoModeByProject: state.autoModeByProject,
      autoModeConfigByProject: state.autoModeConfigByProject,
      setProjectAutoModeConfig: state.setProjectAutoModeConfig,
    }))
  );

  const { isRunning, runningTasks, start, stop } = useAutoMode();

  // Local state for per-project configuration
  const [projectConfigs, setProjectConfigs] = useState<Record<string, LocalProjectAutoModeConfig>>(
    {}
  );
  const [selectAllProjects, setSelectAllProjects] = useState(false);
  const [localSkipVerification, setLocalSkipVerification] = useState(skipVerificationInAutoMode);
  const [localAgentMultiplier, setLocalAgentMultiplier] = useState(agentMultiplier);

  // Helper to get selected project IDs from configs
  const selectedProjectIds = useMemo(() => {
    return new Set(
      Object.entries(projectConfigs)
        .filter(([_, config]) => config.selected)
        .map(([id]) => id)
    );
  }, [projectConfigs]);

  // Initialize configuration when modal opens
  useEffect(() => {
    if (open) {
      // Initialize per-project configs from store, with local selection state
      const initialConfigs: Record<string, LocalProjectAutoModeConfig> = {};
      projects.forEach((project) => {
        // Get stored config for this project, or use defaults
        const storedConfig =
          autoModeConfigByProject[project.id] || DEFAULT_PROJECT_AUTO_MODE_CONFIG;
        initialConfigs[project.id] = {
          selected: currentProject ? project.id === currentProject.id : true,
          requireVerification: storedConfig.requireVerification,
        };
      });
      setProjectConfigs(initialConfigs);
      setSelectAllProjects(!currentProject && projects.length > 0);
      setLocalSkipVerification(skipVerificationInAutoMode);
      setLocalAgentMultiplier(agentMultiplier);
    }
  }, [
    open,
    currentProject,
    projects,
    autoModeConfigByProject,
    skipVerificationInAutoMode,
    agentMultiplier,
  ]);

  // Calculate running agents count across selected projects
  const totalRunningAgents = useMemo(() => {
    let count = 0;
    for (const projectId of selectedProjectIds) {
      const projectState = autoModeByProject[projectId];
      if (projectState?.runningTasks) {
        count += projectState.runningTasks.length;
      }
    }
    return count;
  }, [selectedProjectIds, autoModeByProject]);

  // Check if auto mode is running for any selected project
  const isAutoModeActive = useMemo(() => {
    for (const projectId of selectedProjectIds) {
      const projectState = autoModeByProject[projectId];
      if (projectState?.isRunning) {
        return true;
      }
    }
    return false;
  }, [selectedProjectIds, autoModeByProject]);

  const handleSelectAllChange = (checked: boolean) => {
    setSelectAllProjects(checked);
    setProjectConfigs((prev) => {
      const updated = { ...prev };
      if (checked) {
        projects.forEach((p) => {
          updated[p.id] = { ...updated[p.id], selected: true };
        });
      } else {
        // When unchecking "all", keep current project selected if available
        projects.forEach((p) => {
          updated[p.id] = {
            ...updated[p.id],
            selected: currentProject ? p.id === currentProject.id : false,
          };
        });
      }
      return updated;
    });
  };

  const handleProjectToggle = (projectId: string) => {
    setProjectConfigs((prev) => {
      const updated = {
        ...prev,
        [projectId]: {
          ...prev[projectId],
          selected: !prev[projectId]?.selected,
        },
      };
      // Update "all" checkbox state
      const selectedCount = Object.values(updated).filter((c) => c.selected).length;
      setSelectAllProjects(selectedCount === projects.length);
      return updated;
    });
  };

  const handleProjectVerificationToggle = (projectId: string) => {
    setProjectConfigs((prev) => ({
      ...prev,
      [projectId]: {
        ...prev[projectId],
        requireVerification: !prev[projectId]?.requireVerification,
      },
    }));
  };

  // Helper to save all per-project configs to the store
  const saveProjectConfigsToStore = () => {
    // Save per-project settings to the store
    Object.entries(projectConfigs).forEach(([projectId, config]) => {
      setProjectAutoModeConfig(projectId, {
        requireVerification: config.requireVerification,
      });
    });

    // Update global agent multiplier
    setAgentMultiplier(localAgentMultiplier);

    // Update global skip verification setting
    setSkipVerificationInAutoMode(localSkipVerification);
  };

  const handleStartAutoMode = () => {
    // Save per-project settings to the store
    saveProjectConfigsToStore();

    // Start auto mode for current project
    // Note: In future tasks, this will be extended to support multi-project auto mode
    if (currentProject && selectedProjectIds.has(currentProject.id)) {
      start();
    }

    onOpenChange(false);
  };

  const handleStopAutoMode = () => {
    stop();
  };

  const handleApplySettings = () => {
    // Save per-project settings to the store
    saveProjectConfigsToStore();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="auto-mode-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand-500" />
            Auto Mode Configuration
          </DialogTitle>
          <DialogDescription>
            Configure automatic feature processing. Auto mode will pick up pending features and run
            agents to implement them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Global Max Agents */}
          <div className="p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-4 h-4 text-brand-500 shrink-0" />
              <Label className="text-sm font-medium">Max Concurrent Agents</Label>
              <span className="ml-auto text-sm font-medium text-brand-500">
                {localAgentMultiplier}
              </span>
            </div>
            <Slider
              value={[localAgentMultiplier]}
              onValueChange={(value) => setLocalAgentMultiplier(value[0])}
              min={1}
              max={20}
              step={1}
              className="w-full"
              data-testid="max-agents-slider"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Maximum number of concurrent agents across all projects.
            </p>
          </div>

          {/* Project Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-muted-foreground" />
                Projects
              </Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all-projects"
                  checked={selectAllProjects}
                  onCheckedChange={handleSelectAllChange}
                  data-testid="select-all-projects"
                />
                <Label
                  htmlFor="select-all-projects"
                  className="text-xs text-muted-foreground cursor-pointer"
                >
                  All Projects
                </Label>
              </div>
            </div>

            <ScrollArea className="h-[200px] rounded-md border border-border bg-muted/30 p-2">
              <div className="space-y-1">
                {projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No projects available
                  </p>
                ) : (
                  projects.map((project) => {
                    const projectState = autoModeByProject[project.id];
                    const isProjectRunning = projectState?.isRunning ?? false;
                    const projectRunningCount = projectState?.runningTasks?.length ?? 0;
                    const config = projectConfigs[project.id] ?? {
                      selected: false,
                      ...DEFAULT_PROJECT_AUTO_MODE_CONFIG,
                    };
                    const isSelected = config.selected;

                    return (
                      <div
                        key={project.id}
                        className={cn(
                          'rounded-md transition-colors border border-transparent',
                          isSelected && 'bg-accent/30 border-accent'
                        )}
                        data-testid={`project-item-${project.id}`}
                      >
                        {/* Project header row */}
                        <div
                          className={cn(
                            'flex items-center gap-3 p-2 cursor-pointer',
                            'hover:bg-accent/50 rounded-t-md',
                            !isSelected && 'rounded-b-md'
                          )}
                          onClick={() => handleProjectToggle(project.id)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleProjectToggle(project.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{project.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{project.path}</p>
                          </div>
                          {isProjectRunning && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                              </span>
                              <span className="text-green-600 dark:text-green-400">
                                {projectRunningCount} running
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Per-project settings (shown when selected) */}
                        {isSelected && (
                          <div className="px-3 pb-2 pt-1 border-t border-border/50 space-y-2">
                            {/* Require verification toggle */}
                            <div
                              className="flex items-center gap-3 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleProjectVerificationToggle(project.id);
                              }}
                            >
                              <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs text-muted-foreground flex-1">
                                Require verification
                              </span>
                              <Switch
                                checked={config.requireVerification}
                                onCheckedChange={() => handleProjectVerificationToggle(project.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="scale-75 origin-right"
                                data-testid={`require-verification-toggle-${project.id}`}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Agent Summary */}
          {selectedProjectIds.size > 0 && (
            <div className="p-3 rounded-lg bg-secondary/50">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-brand-500 shrink-0" />
                <Label className="text-sm font-medium">Agent Summary</Label>
                <span className="ml-auto text-sm text-muted-foreground">
                  {totalRunningAgents} running / {localAgentMultiplier} max
                </span>
              </div>
            </div>
          )}

          {/* Global Skip Verification Toggle (Default for new projects) */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <FastForward className="w-4 h-4 text-brand-500 shrink-0" />
              <div>
                <Label
                  htmlFor="skip-verification-toggle"
                  className="text-sm font-medium cursor-pointer"
                >
                  Skip verification (global default)
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Default setting for all projects. Override per-project above.
                </p>
              </div>
            </div>
            <Switch
              id="skip-verification-toggle"
              checked={localSkipVerification}
              onCheckedChange={(checked) => {
                setLocalSkipVerification(checked);
                // Update all selected projects to match the new default
                setProjectConfigs((prev) => {
                  const updated = { ...prev };
                  Object.keys(updated).forEach((id) => {
                    updated[id] = {
                      ...updated[id],
                      requireVerification: !checked,
                    };
                  });
                  return updated;
                });
              }}
              data-testid="skip-verification-toggle"
            />
          </div>

          {/* Status Display */}
          {isAutoModeActive && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-600 dark:text-green-400">
                Auto mode is active with {totalRunningAgents} agent
                {totalRunningAgents !== 1 ? 's' : ''} running
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground"
          >
            Cancel
          </Button>

          {isRunning ? (
            <Button
              variant="destructive"
              onClick={handleStopAutoMode}
              data-testid="stop-auto-mode-button"
            >
              <Square className="w-4 h-4 mr-2" />
              Stop Auto Mode
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleApplySettings}
                data-testid="apply-settings-button"
              >
                Apply Settings
              </Button>
              <Button
                onClick={handleStartAutoMode}
                disabled={selectedProjectIds.size === 0}
                className="bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-600 text-white border-0"
                data-testid="start-auto-mode-button"
              >
                <Play className="w-4 h-4 mr-2" />
                Start Auto Mode
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
