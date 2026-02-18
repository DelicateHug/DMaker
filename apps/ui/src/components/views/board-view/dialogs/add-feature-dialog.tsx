// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { CategoryAutocomplete } from '@/components/ui/category-autocomplete';
import { DependencySelector } from '@/components/ui/dependency-selector';
import {
  DescriptionImageDropZone,
  FeatureImagePath as DescriptionImagePath,
  FeatureTextFilePath as DescriptionTextFilePath,
  ImagePreviewMap,
} from '@/components/ui/description-image-dropzone';
import { Play, Cpu, FolderKanban, Settings2, Check, ChevronDown } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { modelSupportsThinking } from '@/lib/utils';
import {
  useAppStore,
  ModelAlias,
  ThinkingLevel,
  FeatureImage,
  PlanningMode,
  Feature,
} from '@/store/app-store';
import type { ReasoningEffort, PhaseModelEntry, AgentModel } from '@automaker/types';
import { supportsReasoningEffort, isClaudeModel } from '@automaker/types';
import {
  TestingTabContent,
  PrioritySelector,
  WorkModeSelector,
  PlanningModeSelect,
  AncestorContextSection,
  EnhanceWithAI,
  EnhancementHistoryButton,
  PhaseModelSelector,
  type BaseHistoryEntry,
} from '../shared';
import type { WorkMode } from '../shared';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Project } from '@/lib/electron';
import { getProjectIcon } from '@/lib/icon-registry';
import {
  getAncestors,
  formatAncestorContextForPrompt,
  type AncestorContext,
} from '@automaker/dependency-resolver';

const logger = createLogger('AddFeatureDialog');

/**
 * Determines the default work mode based on global settings and current worktree selection.
 *
 * Priority:
 * 1. If forceCurrentBranchMode is true, always defaults to 'current' (work on current branch)
 * 2. If a non-main worktree is selected in the board header, defaults to 'custom' (use that branch)
 * 3. If useWorktrees global setting is enabled, defaults to 'auto' (automatic worktree creation)
 * 4. Otherwise, defaults to 'current' (work on current branch without isolation)
 */
const getDefaultWorkMode = (
  useWorktrees: boolean,
  selectedNonMainWorktreeBranch?: string,
  forceCurrentBranchMode?: boolean
): WorkMode => {
  // If force current branch mode is enabled (worktree setting is off), always use 'current'
  if (forceCurrentBranchMode) {
    return 'current';
  }
  // If a non-main worktree is selected, default to 'custom' mode with that branch
  if (selectedNonMainWorktreeBranch) {
    return 'custom';
  }
  // Otherwise, respect the global worktree setting
  return useWorktrees ? 'auto' : 'current';
};

type FeatureData = {
  title: string;
  category: string;
  description: string;
  images: FeatureImage[];
  imagePaths: DescriptionImagePath[];
  textFilePaths: DescriptionTextFilePath[];
  skipTests: boolean;
  model: AgentModel;
  thinkingLevel: ThinkingLevel;
  reasoningEffort: ReasoningEffort;
  branchName: string;
  priority: number;
  planningMode: PlanningMode;
  requirePlanApproval: boolean;
  autoDeploy: boolean;
  dependencies?: string[];
  childDependencies?: string[]; // Feature IDs that should depend on this feature
  waitForDependencies?: boolean; // If true, this feature won't start until all dependencies are completed/verified
  workMode: WorkMode;
  selectedProjectPath?: string; // The project path to add this feature to
};

interface AddFeatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (feature: FeatureData) => void;
  onAddAndStart?: (feature: FeatureData) => void;
  categorySuggestions: string[];
  branchSuggestions: string[];
  branchCardCounts?: Record<string, number>;
  defaultSkipTests: boolean;
  defaultBranch?: string;
  currentBranch?: string;
  isMaximized: boolean;
  parentFeature?: Feature | null;
  allFeatures?: Feature[];
  /**
   * When a non-main worktree is selected in the board header, this will be set to that worktree's branch.
   * When set, the dialog will default to 'custom' work mode with this branch pre-filled.
   */
  selectedNonMainWorktreeBranch?: string;
  /**
   * When true, forces the dialog to default to 'current' work mode (work on current branch).
   * This is used when the "Default to worktree mode" setting is disabled.
   */
  forceCurrentBranchMode?: boolean;
  /**
   * All available projects for project selection.
   * When provided, a project selector will be shown.
   */
  projects?: Project[];
  /**
   * The currently selected project in the board view.
   * This will be the default selection in the project dropdown.
   */
  selectedProject?: Project | null;
  /**
   * Whether "All Projects" mode is active in the board.
   * When true, the project selector will be more prominently displayed.
   */
  showAllProjectsMode?: boolean;
}

/**
 * A single entry in the description history
 */
interface DescriptionHistoryEntry extends BaseHistoryEntry {
  description: string;
}

export function AddFeatureDialog({
  open,
  onOpenChange,
  onAdd,
  onAddAndStart,
  categorySuggestions,
  branchSuggestions,
  branchCardCounts,
  defaultSkipTests,
  defaultBranch = 'main',
  currentBranch,
  isMaximized,
  parentFeature = null,
  allFeatures = [],
  selectedNonMainWorktreeBranch,
  forceCurrentBranchMode,
  projects = [],
  selectedProject,
  showAllProjectsMode = false,
}: AddFeatureDialogProps) {
  const isSpawnMode = !!parentFeature;
  const navigate = useNavigate();
  const [workMode, setWorkMode] = useState<WorkMode>('current');

  // Form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<FeatureImage[]>([]);
  const [imagePaths, setImagePaths] = useState<DescriptionImagePath[]>([]);
  const [textFilePaths, setTextFilePaths] = useState<DescriptionTextFilePath[]>([]);
  const [skipTests, setSkipTests] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [priority, setPriority] = useState(2);

  // Model selection state
  const [modelEntry, setModelEntry] = useState<PhaseModelEntry>({ model: 'opus' });

  // Check if current model supports planning mode (Claude/Anthropic only)
  const modelSupportsPlanningMode = isClaudeModel(modelEntry.model);

  // Planning mode state
  const [planningMode, setPlanningMode] = useState<PlanningMode>('skip');
  const [requirePlanApproval, setRequirePlanApproval] = useState(false);
  const [autoDeploy, setAutoDeploy] = useState(false);

  // UI state
  const [previewMap, setPreviewMap] = useState<ImagePreviewMap>(() => new Map());
  const [descriptionError, setDescriptionError] = useState(false);

  // Description history state
  const [descriptionHistory, setDescriptionHistory] = useState<DescriptionHistoryEntry[]>([]);

  // Spawn mode state
  const [ancestors, setAncestors] = useState<AncestorContext[]>([]);
  const [selectedAncestorIds, setSelectedAncestorIds] = useState<Set<string>>(new Set());

  // Dependency selection state (not in spawn mode)
  const [parentDependencies, setParentDependencies] = useState<string[]>([]);
  const [childDependencies, setChildDependencies] = useState<string[]>([]);
  const [waitForDependencies, setWaitForDependencies] = useState(false);

  // Project selection state (for multi-project mode)
  const [dialogSelectedProject, setDialogSelectedProject] = useState<Project | null>(
    selectedProject ?? null
  );
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  // Get defaults from store
  const {
    defaultPlanningMode,
    defaultRequirePlanApproval,
    useWorktrees,
    defaultFeatureModel,
    defaultAutoDeploy,
  } = useAppStore();

  // Track previous open state to detect when dialog opens
  const wasOpenRef = useRef(false);

  // Sync defaults only when dialog opens (transitions from closed to open)
  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;

    if (justOpened) {
      setSkipTests(defaultSkipTests);
      // When a non-main worktree is selected, use its branch name for custom mode
      // Otherwise, use the default branch
      setBranchName(selectedNonMainWorktreeBranch || defaultBranch || '');
      setWorkMode(
        getDefaultWorkMode(useWorktrees, selectedNonMainWorktreeBranch, forceCurrentBranchMode)
      );
      setPlanningMode(defaultPlanningMode);
      setRequirePlanApproval(defaultRequirePlanApproval);
      setAutoDeploy(defaultAutoDeploy ?? false);
      setModelEntry(defaultFeatureModel);

      // Initialize description history (empty for new feature)
      setDescriptionHistory([]);

      // Initialize ancestors for spawn mode
      if (parentFeature) {
        const ancestorList = getAncestors(parentFeature, allFeatures);
        setAncestors(ancestorList);
        setSelectedAncestorIds(new Set([parentFeature.id]));
      } else {
        setAncestors([]);
        setSelectedAncestorIds(new Set());
      }

      // Reset dependency selections
      setParentDependencies([]);
      setChildDependencies([]);
      setWaitForDependencies(false);

      // Sync the selected project from the board when dialog opens
      setDialogSelectedProject(selectedProject ?? null);
    }
  }, [
    open,
    defaultSkipTests,
    defaultBranch,
    defaultPlanningMode,
    defaultRequirePlanApproval,
    defaultAutoDeploy,
    defaultFeatureModel,
    useWorktrees,
    selectedNonMainWorktreeBranch,
    forceCurrentBranchMode,
    parentFeature,
    allFeatures,
    selectedProject,
  ]);

  const handleModelChange = (entry: PhaseModelEntry) => {
    setModelEntry(entry);
  };

  const buildFeatureData = (): FeatureData | null => {
    if (!description.trim()) {
      setDescriptionError(true);
      return null;
    }

    if (workMode === 'custom' && !branchName.trim()) {
      toast.error('Please select a branch name');
      return null;
    }

    // When in "All Projects" mode with multiple projects, require project selection
    if (showAllProjectsMode && projects.length > 1 && !dialogSelectedProject) {
      toast.error('Please select a project');
      return null;
    }

    const finalCategory = category || 'Uncategorized';
    const selectedModel = modelEntry.model;
    const normalizedThinking = modelSupportsThinking(selectedModel)
      ? modelEntry.thinkingLevel || 'none'
      : 'none';
    const normalizedReasoning = supportsReasoningEffort(selectedModel)
      ? modelEntry.reasoningEffort || 'none'
      : 'none';

    // For 'current' mode, use empty string (work on current branch)
    // For 'auto' mode, use empty string (will be auto-generated in use-board-actions)
    // For 'custom' mode, use the specified branch name
    const finalBranchName = workMode === 'custom' ? branchName || '' : '';

    // Build final description with ancestor context in spawn mode
    let finalDescription = description;
    if (isSpawnMode && parentFeature && selectedAncestorIds.size > 0) {
      const parentContext: AncestorContext = {
        id: parentFeature.id,
        title: parentFeature.title,
        description: parentFeature.description,
        spec: parentFeature.spec,
        summary: parentFeature.summary,
        depth: -1,
      };

      const allAncestorsWithParent = [parentContext, ...ancestors];
      const contextText = formatAncestorContextForPrompt(
        allAncestorsWithParent,
        selectedAncestorIds
      );

      if (contextText) {
        finalDescription = `${contextText}\n\n---\n\n## Task Description\n\n${description}`;
      }
    }

    // Determine final dependencies
    // In spawn mode, use parent feature as dependency
    // Otherwise, use manually selected parent dependencies
    const finalDependencies =
      isSpawnMode && parentFeature
        ? [parentFeature.id]
        : parentDependencies.length > 0
          ? parentDependencies
          : undefined;

    return {
      title,
      category: finalCategory,
      description: finalDescription,
      images,
      imagePaths,
      textFilePaths,
      skipTests,
      model: selectedModel,
      thinkingLevel: normalizedThinking,
      reasoningEffort: normalizedReasoning,
      branchName: finalBranchName,
      priority,
      planningMode,
      requirePlanApproval,
      autoDeploy,
      dependencies: finalDependencies,
      childDependencies: childDependencies.length > 0 ? childDependencies : undefined,
      waitForDependencies:
        finalDependencies && finalDependencies.length > 0 ? waitForDependencies : undefined,
      workMode,
      // Include selected project path for multi-project support
      selectedProjectPath: dialogSelectedProject?.path,
    };
  };

  const resetForm = () => {
    setTitle('');
    setCategory('');
    setDescription('');
    setImages([]);
    setImagePaths([]);
    setTextFilePaths([]);
    setSkipTests(defaultSkipTests);
    // When a non-main worktree is selected, use its branch name for custom mode
    setBranchName(selectedNonMainWorktreeBranch || '');
    setPriority(2);
    setModelEntry(defaultFeatureModel);
    setWorkMode(
      getDefaultWorkMode(useWorktrees, selectedNonMainWorktreeBranch, forceCurrentBranchMode)
    );
    setPlanningMode(defaultPlanningMode);
    setRequirePlanApproval(defaultRequirePlanApproval);
    setAutoDeploy(defaultAutoDeploy ?? false);
    setPreviewMap(new Map());
    setDescriptionError(false);
    setDescriptionHistory([]);
    setParentDependencies([]);
    setChildDependencies([]);
    setWaitForDependencies(false);
    onOpenChange(false);
  };

  const handleAction = (actionFn?: (data: FeatureData) => void) => {
    if (!actionFn) return;
    const featureData = buildFeatureData();
    if (!featureData) return;
    actionFn(featureData);
    resetForm();
  };

  const handleAdd = () => handleAction(onAdd);
  const handleAddAndStart = () => handleAction(onAddAndStart);

  const handleDialogClose = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setPreviewMap(new Map());
      setDescriptionError(false);
    }
  };

  // Shared card styling
  const cardClass = 'rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3';
  const sectionHeaderClass = 'flex items-center gap-2 text-sm font-medium text-foreground';

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent
        compact={!isMaximized}
        data-testid="add-feature-dialog"
        onPointerDownOutside={(e: CustomEvent) => {
          const target = e.target as HTMLElement;
          if (target.closest('[data-testid="category-autocomplete-list"]')) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e: CustomEvent) => {
          const target = e.target as HTMLElement;
          if (target.closest('[data-testid="category-autocomplete-list"]')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{isSpawnMode ? 'Spawn Sub-Task' : 'Add New Feature'}</DialogTitle>
          <DialogDescription>
            {isSpawnMode
              ? `Create a sub-task that depends on "${parentFeature?.title || parentFeature?.description.slice(0, 50)}..."`
              : 'Create a new feature card for the Kanban board.'}
          </DialogDescription>
        </DialogHeader>

        {/* Project Indicator/Selector - Always show which project the feature will be added to */}
        {(projects.length > 0 || dialogSelectedProject) && (
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-md border',
              showAllProjectsMode && !dialogSelectedProject
                ? 'border-destructive/50 bg-destructive/10'
                : 'border-border/50 bg-muted/30'
            )}
          >
            <span className="text-xs text-muted-foreground">Adding to:</span>
            {projects.length > 1 ? (
              // Show dropdown when multiple projects are available
              <DropdownMenu open={isProjectDropdownOpen} onOpenChange={setIsProjectDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'flex items-center gap-1.5 h-7 px-2',
                      'hover:bg-accent/50 transition-colors duration-150',
                      'font-medium text-xs',
                      !dialogSelectedProject && 'text-destructive'
                    )}
                    data-testid="add-feature-project-dropdown-trigger"
                  >
                    {dialogSelectedProject ? (
                      <>
                        {(() => {
                          const ProjectIcon = getProjectIcon(dialogSelectedProject?.icon);
                          return (
                            <div className="w-4 h-4 rounded flex items-center justify-center bg-brand-500/10">
                              <ProjectIcon className="w-2.5 h-2.5 text-brand-500" />
                            </div>
                          );
                        })()}
                        <span className="max-w-[150px] truncate">{dialogSelectedProject.name}</span>
                      </>
                    ) : (
                      <span>Select project...</span>
                    )}
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-56"
                  data-testid="add-feature-project-dropdown-content"
                >
                  {projects.map((project) => {
                    const ProjectIcon = getProjectIcon(project.icon);
                    const isActive = dialogSelectedProject?.id === project.id;
                    return (
                      <DropdownMenuItem
                        key={project.id}
                        onClick={() => {
                          setDialogSelectedProject(project);
                          setIsProjectDropdownOpen(false);
                        }}
                        className={cn(
                          'flex items-center gap-2 cursor-pointer',
                          isActive && 'bg-brand-500/10'
                        )}
                        data-testid={`add-feature-project-option-${project.id}`}
                      >
                        <div
                          className={cn(
                            'w-5 h-5 rounded flex items-center justify-center',
                            isActive ? 'bg-brand-500/20' : 'bg-muted'
                          )}
                        >
                          <ProjectIcon
                            className={cn(
                              'w-3 h-3',
                              isActive ? 'text-brand-500' : 'text-muted-foreground'
                            )}
                          />
                        </div>
                        <span className="flex-1 text-sm truncate">{project.name}</span>
                        {isActive && <Check className="w-3.5 h-3.5 text-brand-500" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : dialogSelectedProject ? (
              // Show static project indicator when only one project exists
              <div className="flex items-center gap-1.5">
                {(() => {
                  const ProjectIcon = getProjectIcon(dialogSelectedProject?.icon);
                  return (
                    <div className="w-4 h-4 rounded flex items-center justify-center bg-brand-500/10">
                      <ProjectIcon className="w-2.5 h-2.5 text-brand-500" />
                    </div>
                  );
                })()}
                <span className="text-sm font-medium">{dialogSelectedProject.name}</span>
              </div>
            ) : projects.length === 1 ? (
              // Single project available, show it
              <div className="flex items-center gap-1.5">
                {(() => {
                  const project = projects[0];
                  const ProjectIcon = getProjectIcon(project.icon);
                  return (
                    <>
                      <div className="w-4 h-4 rounded flex items-center justify-center bg-brand-500/10">
                        <ProjectIcon className="w-2.5 h-2.5 text-brand-500" />
                      </div>
                      <span className="text-sm font-medium">{project.name}</span>
                    </>
                  );
                })()}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">No project selected</span>
            )}
          </div>
        )}

        <div className="py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Ancestor Context Section - only in spawn mode */}
          {isSpawnMode && parentFeature && (
            <AncestorContextSection
              parentFeature={{
                id: parentFeature.id,
                title: parentFeature.title,
                description: parentFeature.description,
                spec: parentFeature.spec,
                summary: parentFeature.summary,
              }}
              ancestors={ancestors}
              selectedAncestorIds={selectedAncestorIds}
              onSelectionChange={setSelectedAncestorIds}
            />
          )}

          {/* Task Details Section */}
          <div className={cardClass}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Description</Label>
                {/* Version History Button */}
                <EnhancementHistoryButton
                  history={descriptionHistory}
                  currentValue={description}
                  onRestore={setDescription}
                  valueAccessor={(entry) => entry.description}
                  title="Version History"
                  restoreMessage="Description restored from history"
                />
              </div>
              <DescriptionImageDropZone
                value={description}
                onChange={(value) => {
                  setDescription(value);
                  if (value.trim()) setDescriptionError(false);
                }}
                images={imagePaths}
                onImagesChange={setImagePaths}
                textFiles={textFilePaths}
                onTextFilesChange={setTextFilePaths}
                placeholder="Describe the feature..."
                previewMap={previewMap}
                onPreviewMapChange={setPreviewMap}
                autoFocus
                error={descriptionError}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Leave blank to auto-generate"
              />
            </div>

            {/* Enhancement Section */}
            <EnhanceWithAI
              value={description}
              onChange={setDescription}
              onHistoryAdd={({ mode, originalText, enhancedText }) => {
                const timestamp = new Date().toISOString();
                setDescriptionHistory((prev) => {
                  const newHistory = [...prev];
                  // Add original text first (so user can restore to pre-enhancement state)
                  // Only add if it's different from the last entry to avoid duplicates
                  const lastEntry = prev[prev.length - 1];
                  if (!lastEntry || lastEntry.description !== originalText) {
                    newHistory.push({
                      description: originalText,
                      timestamp,
                      source: prev.length === 0 ? 'initial' : 'edit',
                    });
                  }
                  // Add enhanced text
                  newHistory.push({
                    description: enhancedText,
                    timestamp,
                    source: 'enhance',
                    enhancementMode: mode,
                  });
                  return newHistory;
                });
              }}
            />
          </div>

          {/* AI & Execution Section */}
          <div className={cardClass}>
            <div className="flex items-center justify-between">
              <div className={sectionHeaderClass}>
                <Cpu className="w-4 h-4 text-muted-foreground" />
                <span>AI & Execution</span>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        navigate({ to: '/settings', search: { view: 'defaults' } });
                      }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                      <span>Edit Defaults</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Change default model and planning settings for new features</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Model</Label>
              <PhaseModelSelector
                value={modelEntry}
                onChange={handleModelChange}
                compact
                align="end"
              />
            </div>

            <div className="grid gap-3 grid-cols-2">
              <div className="space-y-1.5">
                <Label
                  className={cn(
                    'text-xs text-muted-foreground',
                    !modelSupportsPlanningMode && 'opacity-50'
                  )}
                >
                  Planning
                </Label>
                {modelSupportsPlanningMode ? (
                  <PlanningModeSelect
                    mode={planningMode}
                    onModeChange={setPlanningMode}
                    testIdPrefix="add-feature-planning"
                    compact
                  />
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <PlanningModeSelect
                            mode="skip"
                            onModeChange={() => {}}
                            testIdPrefix="add-feature-planning"
                            compact
                            disabled
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Planning modes are only available for Claude Provider</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Options</Label>
                <div className="flex flex-col gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="add-feature-skip-tests"
                      checked={!skipTests}
                      onCheckedChange={(checked) => setSkipTests(!checked)}
                      data-testid="add-feature-skip-tests-checkbox"
                    />
                    <Label
                      htmlFor="add-feature-skip-tests"
                      className="text-xs font-normal cursor-pointer"
                    >
                      Run tests
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="add-feature-require-approval"
                      checked={requirePlanApproval}
                      onCheckedChange={(checked) => setRequirePlanApproval(!!checked)}
                      disabled={
                        !modelSupportsPlanningMode ||
                        planningMode === 'skip' ||
                        planningMode === 'lite'
                      }
                      data-testid="add-feature-require-approval-checkbox"
                    />
                    <Label
                      htmlFor="add-feature-require-approval"
                      className={cn(
                        'text-xs font-normal',
                        !modelSupportsPlanningMode ||
                          planningMode === 'skip' ||
                          planningMode === 'lite'
                          ? 'cursor-not-allowed text-muted-foreground'
                          : 'cursor-pointer'
                      )}
                    >
                      Require approval
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="add-feature-auto-deploy"
                      checked={autoDeploy}
                      onCheckedChange={(checked) => setAutoDeploy(!!checked)}
                      data-testid="add-feature-auto-deploy-checkbox"
                    />
                    <Label
                      htmlFor="add-feature-auto-deploy"
                      className="text-xs font-normal cursor-pointer"
                    >
                      Auto-deploy
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Organization Section */}
          <div className={cardClass}>
            <div className={sectionHeaderClass}>
              <FolderKanban className="w-4 h-4 text-muted-foreground" />
              <span>Organization</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <CategoryAutocomplete
                  value={category}
                  onChange={setCategory}
                  suggestions={categorySuggestions}
                  placeholder="e.g., Core, UI, API"
                  data-testid="feature-category-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <PrioritySelector
                  selectedPriority={priority}
                  onPrioritySelect={setPriority}
                  testIdPrefix="priority"
                />
              </div>
            </div>

            {/* Work Mode Selector */}
            <div className="pt-2">
              <WorkModeSelector
                workMode={workMode}
                onWorkModeChange={setWorkMode}
                branchName={branchName}
                onBranchNameChange={setBranchName}
                branchSuggestions={branchSuggestions}
                branchCardCounts={branchCardCounts}
                currentBranch={currentBranch}
                testIdPrefix="feature-work-mode"
              />
            </div>

            {/* Dependencies - only show when not in spawn mode */}
            {!isSpawnMode && allFeatures.length > 0 && (
              <div className="pt-2 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Parent Dependencies (this feature depends on)
                  </Label>
                  <DependencySelector
                    value={parentDependencies}
                    onChange={setParentDependencies}
                    features={allFeatures}
                    type="parent"
                    placeholder="Select features this depends on..."
                    data-testid="add-feature-parent-deps"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Child Dependencies (features that depend on this)
                  </Label>
                  <DependencySelector
                    value={childDependencies}
                    onChange={setChildDependencies}
                    features={allFeatures}
                    type="child"
                    placeholder="Select features that will depend on this..."
                    data-testid="add-feature-child-deps"
                  />
                </div>
                {/* Wait for dependencies option - only show when there are parent dependencies */}
                {parentDependencies.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id="add-feature-wait-for-deps"
                      checked={waitForDependencies}
                      onCheckedChange={(checked) => setWaitForDependencies(!!checked)}
                      data-testid="add-feature-wait-for-deps-checkbox"
                    />
                    <Label
                      htmlFor="add-feature-wait-for-deps"
                      className="text-xs font-normal cursor-pointer"
                    >
                      Wait for dependencies before starting (block in auto mode until all
                      dependencies are completed)
                    </Label>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {onAddAndStart && (
            <Button
              onClick={handleAddAndStart}
              variant="secondary"
              data-testid="confirm-add-and-start-feature"
              disabled={workMode === 'custom' && !branchName.trim()}
            >
              <Play className="w-4 h-4 mr-2" />
              Make
            </Button>
          )}
          <HotkeyButton
            onClick={handleAdd}
            hotkey={{ key: 'Enter', cmdCtrl: true }}
            hotkeyActive={open}
            data-testid="confirm-add-feature"
            disabled={workMode === 'custom' && !branchName.trim()}
          >
            {isSpawnMode ? 'Spawn Task' : 'Add Feature'}
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
