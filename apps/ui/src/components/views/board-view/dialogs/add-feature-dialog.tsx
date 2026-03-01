// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from 'react';
import { createLogger } from '@dmaker/utils/logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/forms';
import { Label } from '@/components/ui/forms';
import { Checkbox } from '@/components/ui/forms';
import { CategoryAutocomplete } from '@/components/ui/forms';
import { DependencySelector } from '@/components/ui/feedback';
import {
  DescriptionImageDropZone,
  FeatureImagePath as DescriptionImagePath,
  FeatureTextFilePath as DescriptionTextFilePath,
  ImagePreviewMap,
} from '@/components/ui/description-image-dropzone';
import {
  Play,
  Settings2,
  Check,
  ChevronDown,
  ChevronRight,
  HardDrive,
  CircleDot,
  GitBranch,
  SlidersHorizontal,
  ToggleRight,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays';
import { AgentSelector } from '@/components/ui/agent-selector';
import { ContextFileSelector } from '@/components/ui/context-file-selector';
import { toast } from 'sonner';
import { useLayerStore } from '@/store/layer-store';
import { cn } from '@/lib/utils';
import { modelSupportsThinking } from '@/lib/utils';
import { useAppStore, ModelAlias, ThinkingLevel, FeatureImage, Feature } from '@/store/app-store';
import type { ReasoningEffort, PhaseModelEntry, AgentModel } from '@dmaker/types';
import { supportsReasoningEffort } from '@dmaker/types';
import {
  TestingTabContent,
  PrioritySelector,
  AncestorContextSection,
  EnhanceWithAI,
  EnhancementHistoryButton,
  PhaseModelSelector,
  type BaseHistoryEntry,
} from '../shared';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/overlays';
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
} from '@dmaker/dependency-resolver';

const logger = createLogger('AddFeatureDialog');

type FeatureData = {
  title: string;
  category: string;
  description: string;
  images: FeatureImage[];
  imagePaths: DescriptionImagePath[];
  textFilePaths: DescriptionTextFilePath[];
  skipTests: boolean;
  buildRequired: boolean;
  model: AgentModel;
  thinkingLevel: ThinkingLevel;
  reasoningEffort: ReasoningEffort;
  priority: number;
  autoDeploy: boolean;
  requireApproval: boolean;
  selectedAgents?: string[];
  dependencies?: string[];
  childDependencies?: string[]; // Feature IDs that should depend on this feature
  waitForDependencies?: boolean; // If true, this feature won't start until all dependencies are completed/verified
  selectedProjectPath?: string; // The project path to add this feature to
  source: 'local' | 'github'; // Where this feature should be created
};

interface AddFeatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (feature: FeatureData) => void;
  onAddAndStart?: (feature: FeatureData) => void;
  categorySuggestions: string[];
  defaultSkipTests: boolean;
  isMaximized: boolean;
  parentFeature?: Feature | null;
  allFeatures?: Feature[];
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
  /**
   * The currently active board modes. Used to determine the default source
   * for new features (github if github mode is active, local otherwise).
   */
  activeModes?: ('local' | 'github')[];
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
  defaultSkipTests,
  isMaximized,
  parentFeature = null,
  allFeatures = [],
  projects = [],
  selectedProject,
  showAllProjectsMode = false,
  activeModes = ['local'],
}: AddFeatureDialogProps) {
  const isSpawnMode = !!parentFeature;

  // Form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<FeatureImage[]>([]);
  const [imagePaths, setImagePaths] = useState<DescriptionImagePath[]>([]);
  const [textFilePaths, setTextFilePaths] = useState<DescriptionTextFilePath[]>([]);
  const [skipTests, setSkipTests] = useState(false);
  const [buildRequired, setBuildRequired] = useState(false);
  const [priority, setPriority] = useState(2);

  // Source selection state (local or github)
  const [source, setSource] = useState<'local' | 'github'>(
    activeModes.includes('github') ? 'github' : 'local'
  );

  // Model selection state
  const [modelEntry, setModelEntry] = useState<PhaseModelEntry>({ model: 'opus' });

  const [autoDeploy, setAutoDeploy] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [selectedContextFiles, setSelectedContextFiles] = useState<string[]>([]);

  // UI state
  const [previewMap, setPreviewMap] = useState<ImagePreviewMap>(() => new Map());
  const [descriptionError, setDescriptionError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Description history state
  const [descriptionHistory, setDescriptionHistory] = useState<DescriptionHistoryEntry[]>([]);

  // Spawn mode state
  const [ancestors, setAncestors] = useState<AncestorContext[]>([]);
  const [selectedAncestorIds, setSelectedAncestorIds] = useState<Set<string>>(new Set());

  // Dependency selection state (not in spawn mode)
  const [parentDependencies, setParentDependencies] = useState<string[]>([]);
  const [childDependencies, setChildDependencies] = useState<string[]>([]);
  const [waitForDependencies, setWaitForDependencies] = useState(false);
  const [showDependencies, setShowDependencies] = useState(false);
  const [showOptionals, setShowOptionals] = useState(false);

  // Project selection state (for multi-project mode)
  const [dialogSelectedProject, setDialogSelectedProject] = useState<Project | null>(
    selectedProject ?? null
  );
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  // Get defaults from store
  const { defaultFeatureModel, defaultAutoDeploy, defaultBuildRequired, defaultAgents } =
    useAppStore();

  // Track previous open state to detect when dialog opens
  const wasOpenRef = useRef(false);

  // Sync defaults only when dialog opens (transitions from closed to open)
  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;

    if (justOpened) {
      setSkipTests(defaultSkipTests);
      setBuildRequired(defaultBuildRequired ?? false);
      setAutoDeploy(defaultAutoDeploy ?? false);
      setRequireApproval(false);
      setSelectedAgents(defaultAgents ?? []);
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

      // Default source based on active board modes
      setSource(activeModes.includes('github') ? 'github' : 'local');
    }
  }, [
    open,
    defaultSkipTests,
    defaultBuildRequired,
    defaultAutoDeploy,
    defaultFeatureModel,
    parentFeature,
    allFeatures,
    selectedProject,
    activeModes,
  ]);

  const handleModelChange = (entry: PhaseModelEntry) => {
    setModelEntry(entry);
  };

  const buildFeatureData = (): FeatureData | null => {
    if (!description.trim()) {
      setDescriptionError(true);
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
      buildRequired,
      model: selectedModel,
      thinkingLevel: normalizedThinking,
      reasoningEffort: normalizedReasoning,
      priority,
      autoDeploy,
      requireApproval,
      selectedAgents: selectedAgents.length > 0 ? selectedAgents : undefined,
      selectedContextFiles: selectedContextFiles.length > 0 ? selectedContextFiles : undefined,
      dependencies: finalDependencies,
      childDependencies: childDependencies.length > 0 ? childDependencies : undefined,
      waitForDependencies:
        finalDependencies && finalDependencies.length > 0 ? waitForDependencies : undefined,
      // Include selected project path for multi-project support
      selectedProjectPath: dialogSelectedProject?.path,
      source,
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
    setBuildRequired(defaultBuildRequired ?? false);
    setPriority(2);
    setModelEntry(defaultFeatureModel);
    setAutoDeploy(defaultAutoDeploy ?? false);
    setRequireApproval(false);
    setSelectedAgents(defaultAgents ?? []);
    setPreviewMap(new Map());
    setDescriptionError(false);
    setDescriptionHistory([]);
    setParentDependencies([]);
    setChildDependencies([]);
    setWaitForDependencies(false);
    setShowDependencies(false);
    setShowOptionals(false);
    setSource(activeModes.includes('github') ? 'github' : 'local');
    onOpenChange(false);
  };

  const handleAction = (actionFn?: (data: FeatureData) => void | Promise<void>) => {
    if (!actionFn) return;
    const featureData = buildFeatureData();
    if (!featureData) return;
    // Fire-and-forget: don't block the dialog waiting for the server
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
          {isSpawnMode && (
            <DialogDescription>
              {`Create a sub-task that depends on "${parentFeature?.title || parentFeature?.description.slice(0, 50)}..."`}
            </DialogDescription>
          )}
        </DialogHeader>

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

          {/* Feature Options Section */}
          <div className={cardClass}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label htmlFor="description">Description</Label>
                  {/* Project Indicator - hover to show dropdown */}
                  {(projects.length > 0 || dialogSelectedProject) &&
                    (() => {
                      const displayProject = dialogSelectedProject ?? projects[0];
                      const DisplayIcon = displayProject
                        ? getProjectIcon(displayProject.icon)
                        : null;
                      return projects.length > 1 ? (
                        <div
                          className="relative"
                          onMouseEnter={() => setIsProjectDropdownOpen(true)}
                          onMouseLeave={() => setIsProjectDropdownOpen(false)}
                        >
                          <button
                            type="button"
                            className={cn(
                              'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors border bg-background',
                              dialogSelectedProject
                                ? 'border-brand-500/50 text-brand-500'
                                : 'border-destructive/50 text-destructive'
                            )}
                            data-testid="add-feature-project-dropdown-trigger"
                          >
                            {DisplayIcon && <DisplayIcon className="w-3 h-3" />}
                            <span className="max-w-[100px] truncate">
                              {displayProject?.name ?? 'Project...'}
                            </span>
                          </button>
                          {isProjectDropdownOpen && (
                            <div
                              className="absolute top-full left-0 mt-1 w-56 z-50 rounded-md border bg-popover p-1 shadow-md"
                              data-testid="add-feature-project-dropdown-content"
                            >
                              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                Project
                              </div>
                              {dialogSelectedProject &&
                                (() => {
                                  const ProjectIcon = getProjectIcon(dialogSelectedProject.icon);
                                  return (
                                    <button
                                      type="button"
                                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm bg-brand-500/10 cursor-default"
                                    >
                                      <ProjectIcon className="w-3 h-3 text-brand-500" />
                                      <span className="flex-1 text-left truncate">
                                        {dialogSelectedProject.name}
                                      </span>
                                      <Check className="w-3.5 h-3.5 text-foreground" />
                                    </button>
                                  );
                                })()}
                              {projects
                                .filter((p) => p.id !== dialogSelectedProject?.id)
                                .map((project) => {
                                  const ProjectIcon = getProjectIcon(project.icon);
                                  return (
                                    <button
                                      key={project.id}
                                      type="button"
                                      onClick={() => {
                                        setDialogSelectedProject(project);
                                        setIsProjectDropdownOpen(false);
                                      }}
                                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent cursor-pointer"
                                      data-testid={`add-feature-project-option-${project.id}`}
                                    >
                                      <ProjectIcon className="w-3 h-3 text-muted-foreground" />
                                      <span className="flex-1 text-left truncate">
                                        {project.name}
                                      </span>
                                    </button>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border border-border bg-background text-muted-foreground">
                          {DisplayIcon && <DisplayIcon className="w-3 h-3" />}
                          <span className="max-w-[100px] truncate">
                            {displayProject?.name ?? 'No project'}
                          </span>
                        </div>
                      );
                    })()}
                </div>
                <div className="flex items-center gap-2">
                  <EnhancementHistoryButton
                    history={descriptionHistory}
                    currentValue={description}
                    onRestore={setDescription}
                    valueAccessor={(entry) => entry.description}
                    title="Version History"
                    restoreMessage="Description restored from history"
                  />
                  <EnhanceWithAI
                    value={description}
                    onChange={setDescription}
                    compact
                    onHistoryAdd={({ mode, originalText, enhancedText }) => {
                      const timestamp = new Date().toISOString();
                      setDescriptionHistory((prev) => {
                        const newHistory = [...prev];
                        const lastEntry = prev[prev.length - 1];
                        if (!lastEntry || lastEntry.description !== originalText) {
                          newHistory.push({
                            description: originalText,
                            timestamp,
                            source: prev.length === 0 ? 'initial' : 'edit',
                          });
                        }
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
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            onOpenChange(false);
                            useLayerStore.getState().openLayer('settings');
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
                onAltEnter={handleAdd}
                hideHint
              />
            </div>

            <div className="flex items-center gap-2">
              <PhaseModelSelector
                value={modelEntry}
                onChange={handleModelChange}
                compact
                align="end"
              />
              <PrioritySelector
                selectedPriority={priority}
                onPrioritySelect={setPriority}
                testIdPrefix="priority"
              />
              <CategoryAutocomplete
                value={category}
                onChange={setCategory}
                suggestions={categorySuggestions}
                placeholder="Category"
                compact
                data-testid="feature-category-input"
              />
              <AgentSelector
                value={selectedAgents}
                onChange={setSelectedAgents}
                placeholder="Agents..."
                compact
                projectName={dialogSelectedProject?.name}
              />
              {/* Options chip */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors border bg-background',
                      !skipTests || buildRequired || autoDeploy || requireApproval
                        ? 'border-foreground/30 text-foreground'
                        : 'border-border text-muted-foreground'
                    )}
                  >
                    <ToggleRight className="w-3 h-3" />
                    Options
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="start">
                  <div className="flex flex-col gap-2.5">
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
                        id="add-feature-build-required"
                        checked={buildRequired}
                        onCheckedChange={(checked) => setBuildRequired(!!checked)}
                        data-testid="add-feature-build-required-checkbox"
                      />
                      <Label
                        htmlFor="add-feature-build-required"
                        className="text-xs font-normal cursor-pointer"
                      >
                        Verify build
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
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="add-feature-require-approval"
                        checked={requireApproval}
                        onCheckedChange={(checked) => setRequireApproval(!!checked)}
                        data-testid="add-feature-require-approval-checkbox"
                      />
                      <Label
                        htmlFor="add-feature-require-approval"
                        className="text-xs font-normal cursor-pointer"
                      >
                        Require plan approval
                      </Label>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Optionals Section - collapsed by default */}
          <div className={cardClass}>
            <button
              type="button"
              onClick={() => setShowOptionals((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
            >
              {showOptionals ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
              <span>More Options</span>
            </button>

            {showOptionals && (
              <div className="space-y-3 pt-1">
                <div className="space-y-2">
                  <Label htmlFor="title">Title (optional)</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Leave blank to auto-generate"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Context Files</Label>
                  <ContextFileSelector
                    value={selectedContextFiles}
                    onChange={setSelectedContextFiles}
                  />
                </div>

                {/* Source Selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Source</Label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setSource('local')}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
                        source === 'local'
                          ? 'bg-foreground text-background border-foreground'
                          : 'bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50'
                      )}
                    >
                      <HardDrive className="w-3.5 h-3.5" />
                      Local
                    </button>
                    <button
                      type="button"
                      onClick={() => setSource('github')}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
                        source === 'github'
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50'
                      )}
                    >
                      <CircleDot className="w-3.5 h-3.5" />
                      GitHub
                    </button>
                  </div>
                </div>

                {/* Dependencies - nested collapsible, only when not in spawn mode */}
                {!isSpawnMode && allFeatures.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowDependencies((v) => !v)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showDependencies ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>Dependencies</span>
                      {(parentDependencies.length > 0 || childDependencies.length > 0) && (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-brand-500/10 text-brand-500 text-[10px] font-medium">
                          {parentDependencies.length + childDependencies.length}
                        </span>
                      )}
                    </button>
                    {showDependencies && (
                      <div className="pt-2 pl-5 space-y-3">
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
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          {onAddAndStart && source !== 'local' && (
            <Button
              onClick={handleAddAndStart}
              variant="secondary"
              disabled={isSubmitting}
              data-testid="confirm-add-and-start-feature"
            >
              <Play className="w-4 h-4 mr-2" />
              {isSubmitting ? 'Starting...' : 'Make'}
            </Button>
          )}
          <HotkeyButton
            onClick={handleAdd}
            hotkey={{ key: 'Enter', cmdCtrl: true }}
            hotkeyActive={open && !isSubmitting}
            disabled={isSubmitting}
            data-testid="confirm-add-feature"
          >
            {isSpawnMode ? 'Spawn Task' : source === 'local' ? 'Add to Local' : 'Add to Backlog'}
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
