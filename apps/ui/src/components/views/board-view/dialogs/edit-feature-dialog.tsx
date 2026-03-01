// @ts-nocheck
import { useState, useEffect } from 'react';
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
import { GitBranch, Settings2 } from 'lucide-react';
import { AgentSelector } from '@/components/ui/agent-selector';
import { ContextFileSelector } from '@/components/ui/context-file-selector';
import { toast } from 'sonner';
import { useLayerStore } from '@/store/layer-store';
import { modelSupportsThinking } from '@/lib/utils';
import { Feature, ModelAlias, ThinkingLevel, useAppStore } from '@/store/app-store';
import type { ReasoningEffort, PhaseModelEntry, DescriptionHistoryEntry } from '@dmaker/types';
import {
  TestingTabContent,
  PrioritySelector,
  EnhanceWithAI,
  EnhancementHistoryButton,
  PhaseModelSelector,
  type EnhancementMode,
} from '../shared';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/overlays';
import { DependencyTreeDialog } from './dependency-tree-dialog';
import { supportsReasoningEffort } from '@dmaker/types';

const logger = createLogger('EditFeatureDialog');

interface EditFeatureDialogProps {
  feature: Feature | null;
  onClose: () => void;
  onUpdate: (
    featureId: string,
    updates: {
      title: string;
      category: string;
      description: string;
      skipTests: boolean;
      buildRequired: boolean;
      model: ModelAlias;
      thinkingLevel: ThinkingLevel;
      reasoningEffort: ReasoningEffort;
      imagePaths: DescriptionImagePath[];
      textFilePaths: DescriptionTextFilePath[];
      priority: number;
      autoDeploy: boolean;
      requireApproval: boolean;
      dependencies?: string[];
      childDependencies?: string[]; // Feature IDs that should depend on this feature
      waitForDependencies?: boolean; // If true, this feature won't start until all dependencies are completed/verified
      enableSkills?: boolean;
      enableSubagents?: boolean;
      selectedAgents?: string[];
      selectedContextFiles?: string[];
    },
    descriptionHistorySource?: 'enhance' | 'edit',
    enhancementMode?: EnhancementMode,
    preEnhancementDescription?: string
  ) => void;
  categorySuggestions: string[];
  isMaximized: boolean;
  allFeatures: Feature[];
}

export function EditFeatureDialog({
  feature,
  onClose,
  onUpdate,
  categorySuggestions,
  isMaximized,
  allFeatures,
}: EditFeatureDialogProps) {
  const currentProject = useAppStore((state) => state.currentProject);
  const [editingFeature, setEditingFeature] = useState<Feature | null>(feature);
  const [editFeaturePreviewMap, setEditFeaturePreviewMap] = useState<ImagePreviewMap>(
    () => new Map()
  );
  const [showDependencyTree, setShowDependencyTree] = useState(false);
  const [autoDeploy, setAutoDeploy] = useState(feature?.autoDeploy ?? false);
  const [buildRequired, setBuildRequired] = useState(feature?.buildRequired ?? false);
  const [requireApproval, setRequireApproval] = useState(feature?.requireApproval ?? false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>(feature?.selectedAgents ?? []);
  const [selectedContextFiles, setSelectedContextFiles] = useState<string[]>(
    feature?.selectedContextFiles ?? []
  );
  const [waitForDependencies, setWaitForDependencies] = useState(
    feature?.waitForDependencies ?? false
  );

  // Model selection state
  const [modelEntry, setModelEntry] = useState<PhaseModelEntry>(() => ({
    model: (feature?.model as ModelAlias) || 'opus',
    thinkingLevel: feature?.thinkingLevel || 'none',
    reasoningEffort: feature?.reasoningEffort || 'none',
  }));

  // Track the source of description changes for history
  const [descriptionChangeSource, setDescriptionChangeSource] = useState<
    { source: 'enhance'; mode: EnhancementMode } | 'edit' | null
  >(null);
  // Track the original description when the dialog opened for comparison
  const [originalDescription, setOriginalDescription] = useState(feature?.description ?? '');
  // Track the description before enhancement (so it can be restored)
  const [preEnhancementDescription, setPreEnhancementDescription] = useState<string | null>(null);
  // Local history state for real-time display (combines persisted + session history)
  const [localHistory, setLocalHistory] = useState<DescriptionHistoryEntry[]>(
    feature?.descriptionHistory ?? []
  );

  // Dependency state
  const [parentDependencies, setParentDependencies] = useState<string[]>(
    feature?.dependencies ?? []
  );
  // Child dependencies are features that have this feature in their dependencies
  const [childDependencies, setChildDependencies] = useState<string[]>(() => {
    if (!feature) return [];
    return allFeatures.filter((f) => f.dependencies?.includes(feature.id)).map((f) => f.id);
  });
  // Track original child dependencies to detect changes
  const [originalChildDependencies, setOriginalChildDependencies] = useState<string[]>(() => {
    if (!feature) return [];
    return allFeatures.filter((f) => f.dependencies?.includes(feature.id)).map((f) => f.id);
  });

  useEffect(() => {
    setEditingFeature(feature);
    if (feature) {
      setAutoDeploy(feature.autoDeploy ?? false);
      setBuildRequired(feature.buildRequired ?? false);
      setRequireApproval(feature.requireApproval ?? false);
      setSelectedAgents(feature.selectedAgents ?? []);
      setSelectedContextFiles(feature.selectedContextFiles ?? []);
      // Reset history tracking state
      setOriginalDescription(feature.description ?? '');
      setDescriptionChangeSource(null);
      setPreEnhancementDescription(null);
      setLocalHistory(feature.descriptionHistory ?? []);
      // Reset model entry
      setModelEntry({
        model: (feature.model as ModelAlias) || 'opus',
        thinkingLevel: feature.thinkingLevel || 'none',
        reasoningEffort: feature.reasoningEffort || 'none',
      });
      // Reset dependency state
      setParentDependencies(feature.dependencies ?? []);
      setWaitForDependencies(feature.waitForDependencies ?? false);
      const childDeps = allFeatures
        .filter((f) => f.dependencies?.includes(feature.id))
        .map((f) => f.id);
      setChildDependencies(childDeps);
      setOriginalChildDependencies(childDeps);
    } else {
      setEditFeaturePreviewMap(new Map());
      setDescriptionChangeSource(null);
      setPreEnhancementDescription(null);
      setLocalHistory([]);
      setParentDependencies([]);
      setChildDependencies([]);
      setOriginalChildDependencies([]);
      setWaitForDependencies(false);
      setAutoDeploy(false);
      setRequireApproval(false);
      setSelectedAgents([]);
    }
  }, [feature, allFeatures]);

  const handleModelChange = (entry: PhaseModelEntry) => {
    setModelEntry(entry);
  };

  const handleUpdate = () => {
    if (!editingFeature) return;

    const selectedModel = modelEntry.model;
    const normalizedThinking: ThinkingLevel = modelSupportsThinking(selectedModel)
      ? (modelEntry.thinkingLevel ?? 'none')
      : 'none';
    const normalizedReasoning: ReasoningEffort = supportsReasoningEffort(selectedModel)
      ? (modelEntry.reasoningEffort ?? 'none')
      : 'none';

    // Check if child dependencies changed
    const childDepsChanged =
      childDependencies.length !== originalChildDependencies.length ||
      childDependencies.some((id) => !originalChildDependencies.includes(id)) ||
      originalChildDependencies.some((id) => !childDependencies.includes(id));

    const updates = {
      title: editingFeature.title ?? '',
      category: editingFeature.category,
      description: editingFeature.description,
      skipTests: editingFeature.skipTests ?? false,
      buildRequired,
      model: selectedModel,
      thinkingLevel: normalizedThinking,
      reasoningEffort: normalizedReasoning,
      imagePaths: editingFeature.imagePaths ?? [],
      textFilePaths: editingFeature.textFilePaths ?? [],
      priority: editingFeature.priority ?? 2,
      autoDeploy,
      requireApproval,
      dependencies: parentDependencies,
      childDependencies: childDepsChanged ? childDependencies : undefined,
      waitForDependencies,
      enableSkills: editingFeature.enableSkills,
      enableSubagents: selectedAgents.length > 0 ? true : editingFeature.enableSubagents,
      selectedAgents: selectedAgents.length > 0 ? selectedAgents : undefined,
      selectedContextFiles: selectedContextFiles.length > 0 ? selectedContextFiles : undefined,
    };

    // Determine if description changed and what source to use
    const descriptionChanged = editingFeature.description !== originalDescription;
    let historySource: 'enhance' | 'edit' | undefined;
    let historyEnhancementMode: 'improve' | 'technical' | 'simplify' | 'acceptance' | undefined;

    if (descriptionChanged && descriptionChangeSource) {
      if (descriptionChangeSource === 'edit') {
        historySource = 'edit';
      } else {
        historySource = 'enhance';
        historyEnhancementMode = descriptionChangeSource.mode;
      }
    }

    onUpdate(
      editingFeature.id,
      updates,
      historySource,
      historyEnhancementMode,
      preEnhancementDescription ?? undefined
    );
    setEditFeaturePreviewMap(new Map());
    onClose();
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  if (!editingFeature) {
    return null;
  }

  // Shared card styling
  const cardClass = 'rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3';
  const sectionHeaderClass = 'flex items-center gap-2 text-sm font-medium text-foreground';

  return (
    <Dialog open={!!editingFeature} onOpenChange={handleDialogClose}>
      <DialogContent
        compact={!isMaximized}
        data-testid="edit-feature-dialog"
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
          <DialogTitle>Edit Feature</DialogTitle>
          <DialogDescription>Modify the feature details.</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Task Details Section */}
          <div className={cardClass}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-description">Description</Label>
                {/* Version History Button - uses local history for real-time updates */}
                <EnhancementHistoryButton
                  history={localHistory}
                  currentValue={editingFeature.description}
                  onRestore={(description) => {
                    setEditingFeature((prev) => (prev ? { ...prev, description } : prev));
                    setDescriptionChangeSource('edit');
                  }}
                  valueAccessor={(entry) => entry.description}
                  title="Version History"
                  restoreMessage="Description restored from history"
                />
              </div>
              <DescriptionImageDropZone
                value={editingFeature.description}
                onChange={(value) => {
                  setEditingFeature({
                    ...editingFeature,
                    description: value,
                  });
                  // Track that this change was a manual edit (unless already enhanced)
                  if (!descriptionChangeSource || descriptionChangeSource === 'edit') {
                    setDescriptionChangeSource('edit');
                  }
                }}
                images={editingFeature.imagePaths ?? []}
                onImagesChange={(images) =>
                  setEditingFeature({
                    ...editingFeature,
                    imagePaths: images,
                  })
                }
                textFiles={editingFeature.textFilePaths ?? []}
                onTextFilesChange={(textFiles) =>
                  setEditingFeature({
                    ...editingFeature,
                    textFilePaths: textFiles,
                  })
                }
                placeholder="Describe the feature..."
                previewMap={editFeaturePreviewMap}
                onPreviewMapChange={setEditFeaturePreviewMap}
                data-testid="edit-feature-description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-title">Title (optional)</Label>
              <Input
                id="edit-title"
                value={editingFeature.title ?? ''}
                onChange={(e) =>
                  setEditingFeature({
                    ...editingFeature,
                    title: e.target.value,
                  })
                }
                placeholder="Leave blank to auto-generate"
                data-testid="edit-feature-title"
              />
            </div>

            {/* Enhancement Section */}
            <EnhanceWithAI
              value={editingFeature.description}
              onChange={(enhanced) =>
                setEditingFeature((prev) => (prev ? { ...prev, description: enhanced } : prev))
              }
              onHistoryAdd={({ mode, originalText, enhancedText }) => {
                setDescriptionChangeSource({ source: 'enhance', mode });
                setPreEnhancementDescription(originalText);

                // Update local history for real-time display
                const timestamp = new Date().toISOString();
                setLocalHistory((prev) => {
                  const newHistory = [...prev];
                  // Add original text first (so user can restore to pre-enhancement state)
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

          {/* Feature Options Section */}
          <div className={cardClass}>
            <div className="flex items-center justify-between">
              <div className={sectionHeaderClass}>
                <Settings2 className="w-4 h-4 text-muted-foreground" />
                <span>Feature Options</span>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
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

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Model</Label>
              <PhaseModelSelector
                value={modelEntry}
                onChange={handleModelChange}
                compact
                align="end"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Options</Label>
              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-feature-skip-tests"
                    checked={!(editingFeature.skipTests ?? false)}
                    onCheckedChange={(checked) =>
                      setEditingFeature({ ...editingFeature, skipTests: !checked })
                    }
                    data-testid="edit-feature-skip-tests-checkbox"
                  />
                  <Label
                    htmlFor="edit-feature-skip-tests"
                    className="text-xs font-normal cursor-pointer"
                  >
                    Run tests
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-feature-build-required"
                    checked={buildRequired}
                    onCheckedChange={(checked) => setBuildRequired(!!checked)}
                    data-testid="edit-feature-build-required-checkbox"
                  />
                  <Label
                    htmlFor="edit-feature-build-required"
                    className="text-xs font-normal cursor-pointer"
                  >
                    Verify build
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-feature-auto-deploy"
                    checked={autoDeploy}
                    onCheckedChange={(checked) => setAutoDeploy(!!checked)}
                    data-testid="edit-feature-auto-deploy-checkbox"
                  />
                  <Label
                    htmlFor="edit-feature-auto-deploy"
                    className="text-xs font-normal cursor-pointer"
                  >
                    Auto-deploy
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-feature-require-approval"
                    checked={requireApproval}
                    onCheckedChange={(checked) => setRequireApproval(!!checked)}
                    data-testid="edit-feature-require-approval-checkbox"
                  />
                  <Label
                    htmlFor="edit-feature-require-approval"
                    className="text-xs font-normal cursor-pointer"
                  >
                    Require plan approval
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-feature-enable-skills"
                    checked={editingFeature.enableSkills ?? true}
                    onCheckedChange={(checked) =>
                      setEditingFeature({ ...editingFeature, enableSkills: !!checked })
                    }
                  />
                  <Label
                    htmlFor="edit-feature-enable-skills"
                    className="text-xs font-normal cursor-pointer"
                  >
                    Enable Skills
                  </Label>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Agents</Label>
              <AgentSelector
                value={selectedAgents}
                onChange={setSelectedAgents}
                placeholder="Select agents..."
                projectName={currentProject?.name}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Context Files</Label>
              <ContextFileSelector
                value={selectedContextFiles}
                onChange={setSelectedContextFiles}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <CategoryAutocomplete
                  value={editingFeature.category}
                  onChange={(value) =>
                    setEditingFeature({
                      ...editingFeature,
                      category: value,
                    })
                  }
                  suggestions={categorySuggestions}
                  placeholder="e.g., Core, UI, API"
                  data-testid="edit-feature-category"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <PrioritySelector
                  selectedPriority={editingFeature.priority ?? 2}
                  onPrioritySelect={(priority) =>
                    setEditingFeature({
                      ...editingFeature,
                      priority,
                    })
                  }
                  testIdPrefix="edit-priority"
                />
              </div>
            </div>

            {/* Branch info (read-only, auto-assigned) */}
            {editingFeature.branchName && (
              <div className="pt-2">
                <Label className="text-xs text-muted-foreground">Branch</Label>
                <p className="text-sm font-mono text-muted-foreground mt-1">
                  {editingFeature.branchName}
                </p>
              </div>
            )}

            {/* Dependencies */}
            {allFeatures.length > 1 && (
              <div className="pt-2 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Parent Dependencies (this feature depends on)
                  </Label>
                  <DependencySelector
                    currentFeatureId={editingFeature.id}
                    value={parentDependencies}
                    onChange={setParentDependencies}
                    features={allFeatures}
                    type="parent"
                    placeholder="Select features this depends on..."
                    data-testid="edit-feature-parent-deps"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Child Dependencies (features that depend on this)
                  </Label>
                  <DependencySelector
                    currentFeatureId={editingFeature.id}
                    value={childDependencies}
                    onChange={setChildDependencies}
                    features={allFeatures}
                    type="child"
                    placeholder="Select features that depend on this..."
                    data-testid="edit-feature-child-deps"
                  />
                </div>
                {/* Wait for dependencies option - only show when there are parent dependencies */}
                {parentDependencies.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id="edit-feature-wait-for-deps"
                      checked={waitForDependencies}
                      onCheckedChange={(checked) => setWaitForDependencies(!!checked)}
                      data-testid="edit-feature-wait-for-deps-checkbox"
                    />
                    <Label
                      htmlFor="edit-feature-wait-for-deps"
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

        <DialogFooter className="sm:!justify-between">
          <Button
            variant="outline"
            onClick={() => setShowDependencyTree(true)}
            className="gap-2 h-10"
          >
            <GitBranch className="w-4 h-4" />
            View Dependency Tree
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <HotkeyButton
              onClick={handleUpdate}
              hotkey={{ key: 'Enter', cmdCtrl: true }}
              hotkeyActive={!!editingFeature}
              data-testid="confirm-edit-feature"
            >
              Save Changes
            </HotkeyButton>
          </div>
        </DialogFooter>
      </DialogContent>

      <DependencyTreeDialog
        open={showDependencyTree}
        onClose={() => setShowDependencyTree(false)}
        feature={editingFeature}
        allFeatures={allFeatures}
      />
    </Dialog>
  );
}
