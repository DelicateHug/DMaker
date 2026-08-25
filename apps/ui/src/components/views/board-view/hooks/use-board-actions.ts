// @ts-nocheck
import { useCallback, useState } from 'react';
import { Feature, FeatureImage, ModelAlias, ThinkingLevel, useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import type { FeatureStatusWithPipeline, ReasoningEffort } from '@dmaker/types';
import { FeatureImagePath as DescriptionImagePath } from '@/components/ui/description-image-dropzone';
import { getElectronAPI } from '@/lib/electron';
import { isConnectionError, handleServerOffline } from '@/lib/http-api-client';
import { toast } from 'sonner';
import { useAutoMode } from '@/hooks/use-auto-mode';
import { truncateDescription } from '@/lib/utils';
import { getBlockingDependencies, shouldBlockOnDependencies } from '@dmaker/dependency-resolver';
import { createLogger } from '@dmaker/utils/logger';
import { createFeatureIssue } from '../shared/create-feature-issue';
import { getStatusMeta } from '@/components/layout/sidebar/status-meta';

const logger = createLogger('BoardActions');

/** Resolve the project path for a feature, preferring the feature's own projectPath (set in multi-project mode) */
function getFeatureProjectPath(
  feature: Feature,
  fallbackProject: { path: string } | null
): string | null {
  return (feature as any)?.projectPath || fallbackProject?.path || null;
}

/** Information about a blocking dependency for the confirmation dialog */
export interface BlockingDependencyInfo {
  id: string;
  title?: string;
  description: string;
  status: string;
}

/** State for the unsatisfied dependencies confirmation dialog */
export interface UnsatisfiedDependenciesDialogState {
  open: boolean;
  feature: Feature | null;
  blockingDependencies: BlockingDependencyInfo[];
}

/**
 * State for the "create a GitHub repo for this project" offer, raised when a
 * feature can't be started because the project has no repository behind it.
 */
export interface CreateGitHubRepoDialogState {
  open: boolean;
  /** Feature whose start was interrupted — retried once the repo exists. */
  feature: Feature | null;
  projectPath: string | null;
  reason?: string;
}

interface UseBoardActionsProps {
  currentProject: { path: string; id: string } | null;
  features: Feature[];
  runningAutoTasks: string[];
  loadFeatures: () => Promise<void>;
  persistFeatureCreate: (feature: Feature) => Promise<void>;
  persistFeatureUpdate: (
    featureId: string,
    updates: Partial<Feature>,
    descriptionHistorySource?: 'enhance' | 'edit',
    enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer',
    preEnhancementDescription?: string
  ) => Promise<void>;
  persistFeatureArchive: (featureId: string) => Promise<boolean>;
  saveCategory: (category: string) => Promise<void>;
  setEditingFeature: (feature: Feature | null) => void;
  setShowOutputModal: (show: boolean) => void;
  setOutputFeature: (feature: Feature | null) => void;
  followUpFeature: Feature | null;
  followUpPrompt: string;
  followUpImagePaths: DescriptionImagePath[];
  setFollowUpFeature: (feature: Feature | null) => void;
  setFollowUpPrompt: (prompt: string) => void;
  setFollowUpImagePaths: (paths: DescriptionImagePath[]) => void;
  setFollowUpPreviewMap: (map: Map<string, string>) => void;
  setShowFollowUpDialog: (show: boolean) => void;
  inProgressFeaturesForShortcuts: Feature[];
  outputFeature: Feature | null;
  projectPath: string | null;
  onWorktreeCreated?: () => void;
  onWorktreeAutoSelect?: (worktree: { path: string; branch: string }) => void;
  currentWorktreeBranch: string | null; // Branch name of the selected worktree for filtering
}

export function useBoardActions({
  currentProject,
  features,
  runningAutoTasks,
  loadFeatures,
  persistFeatureCreate,
  persistFeatureUpdate,
  persistFeatureArchive,
  saveCategory,
  setEditingFeature,
  setShowOutputModal,
  setOutputFeature,
  followUpFeature,
  followUpPrompt,
  followUpImagePaths,
  setFollowUpFeature,
  setFollowUpPrompt,
  setFollowUpImagePaths,
  setFollowUpPreviewMap,
  setShowFollowUpDialog,
  inProgressFeaturesForShortcuts,
  outputFeature,
  projectPath,
  onWorktreeCreated,
  onWorktreeAutoSelect,
  currentWorktreeBranch,
}: UseBoardActionsProps) {
  const {
    addFeature,
    updateFeature,
    removeFeature,
    moveFeature,
    enableDependencyBlocking,
    skipVerificationInAutoMode,
    isPrimaryWorktreeBranch,
    getPrimaryWorktreeBranch,
    addRunningTask,
  } = useAppStore(
    useShallow((state) => ({
      addFeature: state.addFeature,
      updateFeature: state.updateFeature,
      removeFeature: state.removeFeature,
      moveFeature: state.moveFeature,
      enableDependencyBlocking: state.enableDependencyBlocking,
      skipVerificationInAutoMode: state.skipVerificationInAutoMode,
      isPrimaryWorktreeBranch: state.isPrimaryWorktreeBranch,
      getPrimaryWorktreeBranch: state.getPrimaryWorktreeBranch,
      addRunningTask: state.addRunningTask,
    }))
  );
  const autoMode = useAutoMode();

  // State for unsatisfied dependencies confirmation dialog
  const [unsatisfiedDepsDialog, setUnsatisfiedDepsDialog] =
    useState<UnsatisfiedDependenciesDialogState>({
      open: false,
      feature: null,
      blockingDependencies: [],
    });

  // State for the "create a GitHub repo for this project" offer
  const [createRepoDialog, setCreateRepoDialog] = useState<CreateGitHubRepoDialogState>({
    open: false,
    feature: null,
    projectPath: null,
  });

  // Worktrees are created when adding/editing features with a branch name
  // This ensures the worktree exists before the feature starts execution

  const handleAddFeature = useCallback(
    async (featureData: {
      title: string;
      category: string;
      description: string;
      images: FeatureImage[];
      imagePaths: DescriptionImagePath[];
      skipTests: boolean;
      model: ModelAlias;
      thinkingLevel: ThinkingLevel;
      priority: number;
      requireApproval?: boolean;
      dependencies?: string[];
      childDependencies?: string[]; // Feature IDs that should depend on this feature
      selectedProjectPath?: string; // Optional project path for multi-project support
      source?: 'local' | 'github'; // Where this feature should be created
      status?: FeatureStatusWithPipeline; // Status column to land in; defaults to 'local'
      branchName?: string; // Existing branch to reuse instead of minting a new one
    }) => {
      // Use the selected project path if provided (for multi-project mode),
      // otherwise fall back to the current project
      const targetProjectPath = featureData.selectedProjectPath || currentProject?.path;

      // A feature created from a branch context (the sidebar's branch groups,
      // a PR-feedback task) reuses that branch. Everything else gets an
      // isolated worktree of its own, named slugified-title + short UUID.
      const reusedBranch = featureData.branchName?.trim();
      const nameSource = featureData.title.trim() || featureData.description.slice(0, 40);
      const slugified = nameSource
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50);
      const shortUuid = crypto.randomUUID().slice(0, 8);
      const finalBranchName = reusedBranch || `${slugified}-${shortUuid}`;

      // Only a freshly minted branch needs a worktree created and selected. A
      // reused branch already has one — or is the primary branch, which has no
      // separate worktree at all, so auto-selecting it would leave the board
      // pointing at the repo root as if it were a secondary worktree.
      if (!reusedBranch && targetProjectPath) {
        try {
          const api = getElectronAPI();
          if (api?.worktree?.create) {
            const result = await api.worktree.create(targetProjectPath, finalBranchName);
            if (result.success && result.worktree) {
              logger.info(
                `Worktree for branch "${finalBranchName}" ${
                  result.worktree?.isNew ? 'created' : 'already exists'
                }`
              );
              // Auto-select the worktree when creating a feature for it
              onWorktreeAutoSelect?.({
                path: result.worktree.path,
                branch: result.worktree.branch,
              });
              // Refresh worktree list in UI
              onWorktreeCreated?.();
            } else if (!result.success) {
              logger.error(
                `Failed to create worktree for branch "${finalBranchName}":`,
                result.error
              );
              toast.error('Failed to create worktree', {
                description: result.error || 'An error occurred',
              });
            }
          }
        } catch (error) {
          logger.error('Error creating worktree:', error);
          toast.error('Failed to create worktree', {
            description: error instanceof Error ? error.message : 'An error occurred',
          });
        }
      }

      // Check if we need to generate a title
      const needsTitleGeneration = !featureData.title.trim() && featureData.description.trim();

      const newFeatureData = {
        ...featureData,
        title: featureData.title,
        titleGenerating: needsTitleGeneration,
        status: featureData.status ?? ('local' as const),
        branchName: finalBranchName,
        dependencies: featureData.dependencies || [],
        // Add project path for multi-project support
        projectPath: targetProjectPath,
        // Source tracking
        source: featureData.source || 'local',
      };
      const createdFeature = addFeature(newFeatureData);
      // Must await to ensure feature exists on server before user can drag it
      // Pass the target project path for multi-project support
      await persistFeatureCreate(createdFeature, targetProjectPath);
      saveCategory(featureData.category);

      // The GitHub issue is filed by the server the moment the feature is
      // created — in the background, so adding a task never waits on GitHub.
      // The task view's Questions tab tracks it, and answers any clarification
      // the drafter needs. Nothing to do here.

      // Handle child dependencies - update other features to depend on this new feature
      if (featureData.childDependencies && featureData.childDependencies.length > 0) {
        for (const childId of featureData.childDependencies) {
          const childFeature = features.find((f) => f.id === childId);
          if (childFeature) {
            const childDeps = childFeature.dependencies || [];
            if (!childDeps.includes(createdFeature.id)) {
              const newDeps = [...childDeps, createdFeature.id];
              updateFeature(childId, { dependencies: newDeps });
              persistFeatureUpdate(childId, { dependencies: newDeps });
            }
          }
        }
      }

      // Generate title in the background if needed (non-blocking)
      if (needsTitleGeneration) {
        const api = getElectronAPI();
        if (api?.features?.generateTitle) {
          // Wrap in a timeout to prevent hanging indefinitely
          const TITLE_GENERATION_TIMEOUT_MS = 30000;
          const titlePromise = api.features.generateTitle(featureData.description);
          const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) =>
            setTimeout(
              () => resolve({ success: false, error: 'Title generation timed out' }),
              TITLE_GENERATION_TIMEOUT_MS
            )
          );

          Promise.race([titlePromise, timeoutPromise])
            .then((result) => {
              if (result.success && 'title' in result && result.title) {
                const titleUpdates = {
                  title: result.title,
                  titleGenerating: false,
                };
                updateFeature(createdFeature.id, titleUpdates);
                persistFeatureUpdate(createdFeature.id, titleUpdates);
              } else {
                // Clear generating flag even if failed or timed out
                const titleUpdates = { titleGenerating: false };
                updateFeature(createdFeature.id, titleUpdates);
                persistFeatureUpdate(createdFeature.id, titleUpdates);
              }
            })
            .catch((error) => {
              logger.error('Error generating title:', error);
              // Clear generating flag on error
              const titleUpdates = { titleGenerating: false };
              updateFeature(createdFeature.id, titleUpdates);
              persistFeatureUpdate(createdFeature.id, titleUpdates);
            });
        } else {
          // API not available — clear the flag immediately
          const titleUpdates = { titleGenerating: false };
          updateFeature(createdFeature.id, titleUpdates);
          persistFeatureUpdate(createdFeature.id, titleUpdates);
        }
      }
    },
    [
      addFeature,
      persistFeatureCreate,
      persistFeatureUpdate,
      updateFeature,
      saveCategory,
      currentProject,
      onWorktreeCreated,
      onWorktreeAutoSelect,
      getPrimaryWorktreeBranch,
      features,
    ]
  );

  const handleUpdateFeature = useCallback(
    async (
      featureId: string,
      updates: {
        title: string;
        category: string;
        description: string;
        skipTests: boolean;
        model: ModelAlias;
        thinkingLevel: ThinkingLevel;
        reasoningEffort: ReasoningEffort;
        imagePaths: DescriptionImagePath[];
        priority: number;
        dependencies?: string[];
        childDependencies?: string[]; // Feature IDs that should depend on this feature
        enableSkills?: boolean;
        enableSubagents?: boolean;
        selectedAgents?: string[];
      },
      descriptionHistorySource?: 'enhance' | 'edit',
      enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer',
      preEnhancementDescription?: string
    ) => {
      // Separate child dependencies from the main updates (they affect other features)
      const { childDependencies, ...restUpdates } = updates;

      const finalUpdates = {
        ...restUpdates,
        title: updates.title,
        // Clear remote modified flag when user edits the feature
        remoteModified: false,
        remoteModifiedBy: undefined,
        remoteModifiedAt: undefined,
      };

      updateFeature(featureId, finalUpdates);
      persistFeatureUpdate(
        featureId,
        finalUpdates,
        descriptionHistorySource,
        enhancementMode,
        preEnhancementDescription
      );

      // Handle child dependency changes
      // This updates other features' dependencies arrays
      if (childDependencies !== undefined) {
        // Find current child dependencies (features that have this feature in their dependencies)
        const currentChildDeps = features
          .filter((f) => f.dependencies?.includes(featureId))
          .map((f) => f.id);

        // Find features to add this feature as a dependency (new child deps)
        const toAdd = childDependencies.filter((id) => !currentChildDeps.includes(id));
        // Find features to remove this feature as a dependency (removed child deps)
        const toRemove = currentChildDeps.filter((id) => !childDependencies.includes(id));

        // Add this feature as a dependency to new child features
        for (const childId of toAdd) {
          const childFeature = features.find((f) => f.id === childId);
          if (childFeature) {
            const childDeps = childFeature.dependencies || [];
            if (!childDeps.includes(featureId)) {
              const newDeps = [...childDeps, featureId];
              updateFeature(childId, { dependencies: newDeps });
              persistFeatureUpdate(childId, { dependencies: newDeps });
            }
          }
        }

        // Remove this feature as a dependency from removed child features
        for (const childId of toRemove) {
          const childFeature = features.find((f) => f.id === childId);
          if (childFeature) {
            const childDeps = childFeature.dependencies || [];
            const newDeps = childDeps.filter((depId) => depId !== featureId);
            updateFeature(childId, { dependencies: newDeps });
            persistFeatureUpdate(childId, { dependencies: newDeps });
          }
        }
      }

      if (updates.category) {
        saveCategory(updates.category);
      }
      setEditingFeature(null);
    },
    [
      updateFeature,
      persistFeatureUpdate,
      saveCategory,
      setEditingFeature,
      currentProject,
      onWorktreeCreated,
      getPrimaryWorktreeBranch,
      features,
    ]
  );

  const handleArchiveFeature = useCallback(
    async (featureId: string) => {
      const feature = features.find((f) => f.id === featureId);
      if (!feature) return;

      const isRunning = runningAutoTasks.includes(featureId);

      if (isRunning) {
        try {
          await autoMode.stopFeature(featureId);
          toast.success('Agent stopped', {
            description: `Stopped and archived: ${truncateDescription(feature.description)}`,
          });
        } catch (error) {
          logger.error('Error stopping feature before archive:', error);
          toast.error('Failed to stop agent', {
            description: 'The feature will still be archived.',
          });
        }
      }

      // Nothing is destroyed here: the feature directory moves to
      // features/archived/ and the linked issue is closed (server side), so
      // both come back through the Closed Issues view. Images stay with it.
      removeFeature(featureId);
      const archived = await persistFeatureArchive(featureId);

      if (!archived) {
        toast.error('Failed to archive task', {
          description: truncateDescription(feature.description),
        });
        return;
      }

      toast.success('Task archived', {
        description: feature.githubIssue?.number
          ? `Issue #${feature.githubIssue.number} closed — find it under Closed Issues`
          : 'Find it under Closed Issues',
      });
    },
    [features, runningAutoTasks, autoMode, removeFeature, persistFeatureArchive]
  );

  const handleRunFeature = useCallback(
    async (feature: Feature) => {
      const projectPath = getFeatureProjectPath(feature, currentProject);
      if (!projectPath) {
        throw new Error('No project selected');
      }

      const api = getElectronAPI();
      if (!api?.autoMode) {
        throw new Error('Auto mode API not available');
      }

      // Server derives workDir from feature.branchName at execution time
      // Worktrees are always used - every feature runs in isolation
      const result = await api.autoMode.runFeature(projectPath, feature.id, true);

      if (result.success) {
        logger.info('Feature run started successfully, branch:', feature.branchName || 'default');
        return;
      }

      // Handle specific warning/error types with descriptive messages
      if (result.warning === 'claimed_by_other') {
        throw new Error(
          `This issue is claimed by ${result.claimedBy || 'another user'} on GitHub. Claim it first before executing.`
        );
      }

      if (result.warning === 'unsatisfied_dependencies') {
        throw new Error(
          result.message || 'Feature has unsatisfied dependencies. Resolve them first or force run.'
        );
      }

      if (result.alreadyRunning) {
        const err = new Error(
          'This feature is already running. Check the Agents panel for status.'
        );
        (err as any).alreadyRunning = true;
        throw err;
      }

      // Fallback: surface the actual server error message
      throw new Error(
        result.error || result.message || 'Failed to start feature. Check server logs.'
      );
    },
    [currentProject]
  );

  // Internal function that actually starts the feature (used after confirmation or directly)
  const doStartImplementation = useCallback(
    async (feature: Feature): Promise<boolean> => {
      const updates = {
        status: 'planning' as const,
        startedAt: new Date().toISOString(),
      };

      // Ensure the feature exists in the store before updating/persisting.
      // Virtual GitHub features (from useGithubBoardIssues) live in a separate
      // state and aren't in the Zustand store — we need to add them so that
      // updateFeature, persistFeatureUpdate (and its auto-create fallback) work.
      const { features: storeFeatures } = useAppStore.getState();
      if (!storeFeatures.some((f) => f.id === feature.id)) {
        useAppStore.setState({ features: [...storeFeatures, feature] });
      }

      updateFeature(feature.id, updates);

      try {
        // Must await to ensure feature status is persisted before starting agent
        await persistFeatureUpdate(feature.id, updates);
        logger.info('Feature moved to planning, starting agent...');

        // Update GitHub issue labels and post comment before starting the agent
        // so the issue reflects the correct state (in-progress, claimed) on GitHub
        const featureProjectPath = getFeatureProjectPath(feature, currentProject);
        if (feature.githubIssue?.number && featureProjectPath) {
          const api = getElectronAPI();
          if (api?.github?.updateIssueLabels) {
            try {
              // Update status labels (backlog -> planning)
              await api.github.updateIssueLabels(
                featureProjectPath,
                feature.githubIssue!.number,
                ['label-planning'],
                ['label-backlog']
              );
            } catch (err) {
              logger.error('Failed to update GitHub issue labels:', err);
            }
          }
        }

        await handleRunFeature(feature);
        // Optimistic UI update: immediately show the blinking running state
        // so the user doesn't have to wait for the server event
        if (currentProject?.id) {
          addRunningTask(currentProject.id, feature.id);
        }

        return true;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Server may be offline. Please try again.';
        const isAlreadyRunning = !!(error && (error as any).alreadyRunning);

        logger.error('Failed to start feature:', error);

        // Don't rollback if feature is already running — it IS running
        if (!isAlreadyRunning) {
          const rollbackUpdates = {
            status: 'backlog' as const,
            startedAt: undefined,
          };
          updateFeature(feature.id, rollbackUpdates);
        }

        // If server is offline (connection refused), redirect to login page
        if (isConnectionError(error)) {
          handleServerOffline();
          return false;
        }

        // Show specific toast messages based on error type
        if (isAlreadyRunning) {
          toast.info('Feature is already running', {
            description: 'Check the Agents panel to monitor progress.',
          });
        } else if (errorMessage.includes('unsatisfied dependencies')) {
          toast.warning('Blocked by dependencies', {
            description: errorMessage,
          });
        } else if (errorMessage.includes('claimed by')) {
          toast.warning('Feature claimed by another user', {
            description: errorMessage,
          });
        } else {
          toast.error('Failed to start feature', {
            description: errorMessage,
          });
        }
        return false;
      }
    },
    [updateFeature, persistFeatureUpdate, handleRunFeature, currentProject, addRunningTask]
  );

  const handleStartImplementation = useCallback(
    async (feature: Feature) => {
      // Features in 'local' status need a GitHub issue before they can run.
      // Create one on the fly rather than making the user convert by hand.
      if (feature.status === 'local' && !feature.githubIssue) {
        const issueProjectPath = getFeatureProjectPath(feature, currentProject);
        if (!issueProjectPath) {
          toast.error('Cannot start feature', {
            description: 'No project path available to create a GitHub issue.',
          });
          return false;
        }

        try {
          const issueResult = await createFeatureIssue(issueProjectPath, feature);
          if (!issueResult.success || !issueResult.updates) {
            // No repository behind the project is fixable — offer to create one
            // and retry the start rather than dead-ending on the error.
            if (issueResult.needsRepo) {
              setCreateRepoDialog({
                open: true,
                feature,
                projectPath: issueProjectPath,
                reason: issueResult.error,
              });
              return false;
            }
            toast.error('Cannot start feature', {
              description: issueResult.error || 'Failed to create a GitHub issue.',
            });
            return false;
          }

          updateFeature(feature.id, issueResult.updates);
          await persistFeatureUpdate(feature.id, issueResult.updates);
          toast.success(`GitHub issue #${issueResult.updates.githubIssue.number} created`);

          // Continue with the linked feature so downstream checks see the issue
          feature = { ...feature, ...issueResult.updates } as Feature;
        } catch (error) {
          logger.error('Failed to auto-create GitHub issue on start:', error);
          toast.error('Cannot start feature', {
            description:
              error instanceof Error ? error.message : 'Failed to create a GitHub issue.',
          });
          return false;
        }
      }

      if (!autoMode.canStartNewTask) {
        toast.error('Concurrency limit reached', {
          description: `You can only have ${autoMode.effectiveMaxAgents} task${
            autoMode.effectiveMaxAgents > 1 ? 's' : ''
          } running at a time. Wait for a task to complete or increase the limit.`,
        });
        return false;
      }

      // Check if feature should block on dependencies (combines global and per-feature settings)
      const shouldBlock = shouldBlockOnDependencies(feature, { enableDependencyBlocking });

      if (shouldBlock) {
        // Get blocking dependencies when waitForDependencies is enabled
        const blockingDeps = getBlockingDependencies(feature, features);
        if (blockingDeps.length > 0) {
          // Build detailed info about blocking dependencies for the dialog
          const blockingDependencyInfos: BlockingDependencyInfo[] = blockingDeps
            .map((depId) => {
              const dep = features.find((f) => f.id === depId);
              if (!dep) return null;
              return {
                id: dep.id,
                title: dep.title,
                description: dep.description,
                status: dep.status,
              };
            })
            .filter((info): info is BlockingDependencyInfo => info !== null);

          // Show confirmation dialog instead of just starting with a warning
          setUnsatisfiedDepsDialog({
            open: true,
            feature,
            blockingDependencies: blockingDependencyInfos,
          });
          return false; // Don't start yet - wait for user confirmation
        }
      } else if (enableDependencyBlocking) {
        // Global dependency blocking is enabled but this feature doesn't have waitForDependencies
        // Show a warning toast but proceed anyway (existing behavior for features without the flag)
        const blockingDeps = getBlockingDependencies(feature, features);
        if (blockingDeps.length > 0) {
          const depDescriptions = blockingDeps
            .map((depId) => {
              const dep = features.find((f) => f.id === depId);
              return dep ? truncateDescription(dep.description, 40) : depId;
            })
            .join(', ');

          toast.warning('Starting feature with incomplete dependencies', {
            description: `This feature depends on: ${depDescriptions}`,
          });
        }
      }

      // No blocking dependencies or feature doesn't require waiting - start immediately
      return doStartImplementation(feature);
    },
    [
      autoMode,
      enableDependencyBlocking,
      features,
      doStartImplementation,
      currentProject,
      updateFeature,
      persistFeatureUpdate,
    ]
  );

  // Handler for confirming start despite unsatisfied dependencies
  const handleConfirmStartWithUnsatisfiedDeps = useCallback(async () => {
    const feature = unsatisfiedDepsDialog.feature;
    if (!feature) return;

    // Close the dialog
    setUnsatisfiedDepsDialog({
      open: false,
      feature: null,
      blockingDependencies: [],
    });

    // Proceed with starting the feature
    await doStartImplementation(feature);
  }, [unsatisfiedDepsDialog.feature, doStartImplementation]);

  // Handler for canceling the start
  const handleCancelStartWithUnsatisfiedDeps = useCallback(() => {
    setUnsatisfiedDepsDialog({
      open: false,
      feature: null,
      blockingDependencies: [],
    });
  }, []);

  // Handler for dialog open state changes
  const handleUnsatisfiedDepsDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setUnsatisfiedDepsDialog({
        open: false,
        feature: null,
        blockingDependencies: [],
      });
    }
  }, []);

  // The repo now exists and `origin` is wired up — resume the start that was
  // interrupted, which will create the GitHub issue on this second pass.
  const handleGitHubRepoCreated = useCallback(async () => {
    const feature = createRepoDialog.feature;
    setCreateRepoDialog({ open: false, feature: null, projectPath: null });
    if (!feature) return;
    await handleStartImplementation(feature);
  }, [createRepoDialog.feature, handleStartImplementation]);

  const handleCreateRepoDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setCreateRepoDialog({ open: false, feature: null, projectPath: null });
    }
  }, []);

  const handleVerifyFeature = useCallback(
    async (feature: Feature) => {
      const projectPath = getFeatureProjectPath(feature, currentProject);
      if (!projectPath) return;

      try {
        const api = getElectronAPI();
        if (!api?.autoMode) {
          logger.error('Auto mode API not available');
          return;
        }

        const result = await api.autoMode.verifyFeature(projectPath, feature.id);

        if (result.success) {
          logger.info('Feature verification started successfully');
        } else {
          logger.error('Failed to verify feature:', result.error);
          await loadFeatures();
        }
      } catch (error) {
        logger.error('Error verifying feature:', error);
        await loadFeatures();
      }
    },
    [currentProject, loadFeatures]
  );

  const handleResumeFeature = useCallback(
    async (feature: Feature) => {
      logger.info('handleResumeFeature called for feature:', feature.id);
      const projectPath = getFeatureProjectPath(feature, currentProject);
      if (!projectPath) {
        logger.error('No current project');
        return;
      }

      try {
        const api = getElectronAPI();
        if (!api?.autoMode) {
          logger.error('Auto mode API not available');
          return;
        }

        logger.info('Calling resumeFeature API...', {
          projectPath,
          featureId: feature.id,
        });

        const result = await api.autoMode.resumeFeature(projectPath, feature.id, true);

        logger.info('resumeFeature result:', result);

        if (result.success) {
          logger.info('Feature resume started successfully');
          // Optimistic UI update: immediately show the blinking running state
          // so the user doesn't have to wait for the server event
          if (currentProject?.id) {
            addRunningTask(currentProject.id, feature.id);
          }
        } else {
          logger.error('Failed to resume feature:', result.error);
          toast.error('Failed to resume feature', {
            description: result.error || 'The feature could not be found or resumed',
          });
          await loadFeatures();
        }
      } catch (error) {
        logger.error('Error resuming feature:', error);
        toast.error('Failed to resume feature', {
          description: 'An unexpected error occurred',
        });
        await loadFeatures();
      }
    },
    [currentProject, loadFeatures, addRunningTask]
  );

  const handleManualVerify = useCallback(
    async (feature: Feature) => {
      try {
        // Ensure the feature exists in the Zustand store before operating on it.
        // Virtual GitHub features (from useGithubBoardIssues) live in separate
        // state and may not be in the store.
        const { features: storeFeatures } = useAppStore.getState();
        if (!storeFeatures.some((f) => f.id === feature.id)) {
          useAppStore.setState({ features: [...storeFeatures, feature] });
        }

        moveFeature(feature.id, 'completed');
        // Must await to ensure the status is persisted to disk before any
        // background loadFeatures() reload can read stale data and overwrite
        // the local state back to waiting_approval.
        const updates: Partial<Feature> = {
          status: 'completed',
          completedAt: new Date().toISOString(),
          justFinishedAt: undefined,
        };

        // Close the linked GitHub issue and update labels if one exists
        const issueNumber = feature.githubIssue?.number;
        if (issueNumber) {
          const projectPath = getFeatureProjectPath(feature, currentProject);
          if (projectPath) {
            const api = getElectronAPI();

            // Update status labels: remove old status label, add label-completed
            if (api.github?.updateIssueLabels) {
              const oldLabels = (feature.githubIssue?.labels || []).filter((l) =>
                l.startsWith('label-')
              );
              try {
                await api.github.updateIssueLabels(
                  projectPath,
                  issueNumber,
                  ['label-completed'],
                  oldLabels
                );
              } catch (err) {
                logger.error('Failed to update labels on complete:', err);
              }
            }

            // Close the issue on GitHub
            if (api.github?.closeIssue) {
              const result = await api.github.closeIssue(projectPath, issueNumber);
              if (result.success) {
                const updatedLabels = [
                  ...(feature.githubIssue?.labels || []).filter((l) => !l.startsWith('label-')),
                  'label-completed',
                ];
                updates.githubIssue = {
                  ...feature.githubIssue!,
                  labels: updatedLabels,
                  state: 'closed',
                  syncedAt: new Date().toISOString(),
                };
              } else {
                logger.error(`Failed to close GitHub issue #${issueNumber}:`, result.error);
                toast.error('Failed to close GitHub issue', {
                  description: result.error || `Could not close issue #${issueNumber}`,
                });
              }
            }

            // Post completion summary as GitHub comment (non-blocking)
            if (api.github?.addComment && api.features?.getSummaries) {
              try {
                const summariesResult = await api.features.getSummaries(projectPath, feature.id);
                if (summariesResult?.success && summariesResult.summaries?.length > 0) {
                  const summaries = summariesResult.summaries; // newest-first
                  const latest = summaries[0];

                  const commentParts: string[] = ['## Implementation Summary', '', latest.summary];

                  // Include older summaries as collapsed sections
                  if (summaries.length > 1) {
                    commentParts.push('', '---', '');
                    commentParts.push(
                      '<details>',
                      `<summary>Previous summaries (${summaries.length - 1})</summary>`,
                      ''
                    );
                    for (let i = 1; i < summaries.length; i++) {
                      const entry = summaries[i];
                      const date = new Date(entry.timestamp).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      });
                      commentParts.push(
                        `### ${date}${entry.model ? ` (${entry.model})` : ''}`,
                        '',
                        entry.summary,
                        ''
                      );
                    }
                    commentParts.push('</details>');
                  }

                  const completionComment = commentParts.join('\n');
                  api.github
                    .addComment(projectPath, issueNumber, completionComment)
                    .catch((err) =>
                      logger.error('Failed to post completion summary comment:', err)
                    );
                }
              } catch (err) {
                logger.error('Failed to fetch summaries for completion comment:', err);
              }
            }
          }
        }

        await persistFeatureUpdate(feature.id, updates);
        toast.success('Feature completed', {
          description: `Marked as complete: ${truncateDescription(feature.description)}`,
        });
      } catch (error) {
        console.error('Failed to complete feature:', error);
        toast.error('Failed to complete feature', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
        // Revert the optimistic update
        loadFeatures();
      }
    },
    [moveFeature, persistFeatureUpdate, loadFeatures, currentProject]
  );

  const handleMoveBackToInProgress = useCallback(
    async (feature: Feature) => {
      const updates = {
        status: 'in_progress' as const,
        startedAt: new Date().toISOString(),
      };
      updateFeature(feature.id, updates);
      await persistFeatureUpdate(feature.id, updates);
      toast.info('Feature moved back', {
        description: `Moved back to In Progress: ${truncateDescription(feature.description)}`,
      });
    },
    [updateFeature, persistFeatureUpdate]
  );

  const handleMoveBackToBacklog = useCallback(
    async (feature: Feature) => {
      const updates = {
        status: 'backlog' as const,
        startedAt: undefined,
      };
      updateFeature(feature.id, updates);
      await persistFeatureUpdate(feature.id, updates);
      toast.info('Feature moved to backlog', {
        description: `Moved to Backlog: ${truncateDescription(feature.description)}`,
      });
    },
    [updateFeature, persistFeatureUpdate]
  );

  /**
   * Move a feature to any status.
   *
   * The board used to be the only place a status could change — by dragging a
   * card between columns. The sidebar replaced that list and shipped without
   * a replacement, leaving a feature stuck wherever it happened to be. This
   * is the generic move the sidebar's context menu calls.
   */
  const handleSetFeatureStatus = useCallback(
    async (feature: Feature, status: string) => {
      if (feature.status === status) return;

      const updates: Partial<Feature> = { status };
      // Keep the timestamps consistent with the dedicated handlers above, so a
      // feature moved from the menu behaves like one moved any other way.
      if (status === 'in_progress') updates.startedAt = new Date().toISOString();
      if (status === 'backlog') updates.startedAt = undefined;
      if (status === 'completed' || status === 'verified') {
        updates.completedAt = new Date().toISOString();
      }

      updateFeature(feature.id, updates);
      try {
        await persistFeatureUpdate(feature.id, updates);
        toast.success('Feature moved', {
          description: `${truncateDescription(feature.description)} → ${getStatusMeta(status).label}`,
        });
      } catch (error) {
        logger.error('Failed to move feature:', error);
        toast.error('Failed to move feature', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
        await loadFeatures();
      }
    },
    [updateFeature, persistFeatureUpdate, loadFeatures]
  );

  const handleOpenFollowUp = useCallback(
    (feature: Feature) => {
      setFollowUpFeature(feature);
      setFollowUpPrompt('');
      setFollowUpImagePaths([]);
      setShowFollowUpDialog(true);
    },
    [setFollowUpFeature, setFollowUpPrompt, setFollowUpImagePaths, setShowFollowUpDialog]
  );

  const handleSendFollowUp = useCallback(async () => {
    if (!followUpFeature || !followUpPrompt.trim()) return;

    const projectPath = getFeatureProjectPath(followUpFeature, currentProject);
    if (!projectPath) return;

    const featureId = followUpFeature.id;
    const featureDescription = followUpFeature.description;
    const previousStatus = followUpFeature.status;

    const api = getElectronAPI();
    if (!api?.autoMode?.followUpFeature) {
      logger.error('Follow-up feature API not available');
      toast.error('Follow-up not available', {
        description: 'This feature is not available in the current version.',
      });
      return;
    }

    const updates = {
      status: 'in_progress' as const,
      startedAt: new Date().toISOString(),
      justFinishedAt: undefined,
    };
    updateFeature(featureId, updates);

    try {
      await persistFeatureUpdate(featureId, updates);

      setShowFollowUpDialog(false);
      setFollowUpFeature(null);
      setFollowUpPrompt('');
      setFollowUpImagePaths([]);
      setFollowUpPreviewMap(new Map());

      toast.success('Follow-up started', {
        description: `Continuing work on: ${truncateDescription(featureDescription)}`,
      });

      const imagePaths = followUpImagePaths.map((img) => img.path);
      // Server derives workDir from feature.branchName at execution time
      const result = await api.autoMode.followUpFeature(
        projectPath,
        followUpFeature.id,
        followUpPrompt,
        imagePaths,
        true
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to send follow-up');
      }

      // Optimistic UI update: immediately show the blinking running state
      // so the user doesn't have to wait for the server event
      if (currentProject?.id) {
        addRunningTask(currentProject.id, featureId);
      }
    } catch (error) {
      // Rollback to previous status if follow-up fails
      logger.error('Error sending follow-up, rolling back:', error);
      const rollbackUpdates = {
        status: previousStatus as 'backlog' | 'in_progress' | 'waiting_approval' | 'completed',
        startedAt: undefined,
      };
      updateFeature(featureId, rollbackUpdates);

      // If server is offline (connection refused), redirect to login page
      if (isConnectionError(error)) {
        handleServerOffline();
        return;
      }

      toast.error('Failed to send follow-up', {
        description:
          error instanceof Error ? error.message : 'Server may be offline. Please try again.',
      });
    }
  }, [
    currentProject,
    followUpFeature,
    followUpPrompt,
    followUpImagePaths,
    updateFeature,
    persistFeatureUpdate,
    addRunningTask,
    setShowFollowUpDialog,
    setFollowUpFeature,
    setFollowUpPrompt,
    setFollowUpImagePaths,
    setFollowUpPreviewMap,
  ]);

  const handleCommitFeature = useCallback(
    async (feature: Feature) => {
      const projectPath = getFeatureProjectPath(feature, currentProject);
      if (!projectPath) return;

      try {
        const api = getElectronAPI();
        if (!api?.autoMode?.commitFeature) {
          logger.error('Commit feature API not available');
          toast.error('Commit not available', {
            description: 'This feature is not available in the current version.',
          });
          return;
        }

        // Server derives workDir from feature.branchName
        const result = await api.autoMode.commitFeature(
          projectPath,
          feature.id
          // No worktreePath - server derives from feature.branchName
        );

        if (result.success) {
          moveFeature(feature.id, 'completed');
          persistFeatureUpdate(feature.id, {
            status: 'completed',
            completedAt: new Date().toISOString(),
          });
          toast.success('Feature committed', {
            description: `Committed and completed: ${truncateDescription(feature.description)}`,
          });
          // Refresh worktree selector to update commit counts
          onWorktreeCreated?.();
        } else if (result.blocked) {
          // Not a failure — the task's GitHub issue is not there yet, and
          // nothing commits before it is.
          toast.warning('Waiting for the GitHub issue', {
            description: result.error || 'The issue for this task has not been created yet.',
          });
          await loadFeatures();
        } else {
          logger.error('Failed to commit feature:', result.error);
          toast.error('Failed to commit feature', {
            description: result.error || 'An error occurred',
          });
          await loadFeatures();
        }
      } catch (error) {
        logger.error('Error committing feature:', error);
        toast.error('Failed to commit feature', {
          description: error instanceof Error ? error.message : 'An error occurred',
        });
        await loadFeatures();
      }
    },
    [currentProject, moveFeature, persistFeatureUpdate, loadFeatures, onWorktreeCreated]
  );

  const handleMergeFeature = useCallback(
    async (feature: Feature) => {
      const projectPath = getFeatureProjectPath(feature, currentProject);
      if (!projectPath) return;

      try {
        const api = getElectronAPI();
        if (!api?.worktree?.mergeFeature) {
          logger.error('Worktree API not available');
          toast.error('Merge not available', {
            description: 'This feature is not available in the current version.',
          });
          return;
        }

        const result = await api.worktree.mergeFeature(projectPath, feature.id);

        if (result.success) {
          await loadFeatures();
          toast.success('Feature merged', {
            description: `Changes merged to main branch: ${truncateDescription(
              feature.description
            )}`,
          });
        } else {
          logger.error('Failed to merge feature:', result.error);
          toast.error('Failed to merge feature', {
            description: result.error || 'An error occurred',
          });
        }
      } catch (error) {
        logger.error('Error merging feature:', error);
        toast.error('Failed to merge feature', {
          description: error instanceof Error ? error.message : 'An error occurred',
        });
      }
    },
    [currentProject, loadFeatures]
  );

  const handleCompleteFeature = useCallback(
    async (feature: Feature) => {
      // Ensure the feature exists in the Zustand store before operating on it.
      const { features: storeFeatures } = useAppStore.getState();
      if (!storeFeatures.some((f) => f.id === feature.id)) {
        useAppStore.setState({ features: [...storeFeatures, feature] });
      }

      const updates: Partial<Feature> = {
        status: 'completed' as const,
        completedAt: new Date().toISOString(),
      };

      // Close the linked GitHub issue and update labels if one exists
      const issueNumber = feature.githubIssue?.number;
      if (issueNumber) {
        const projectPath = getFeatureProjectPath(feature, currentProject);
        if (projectPath) {
          const api = getElectronAPI();

          // Update status labels: remove old status label, add label-completed
          if (api.github?.updateIssueLabels) {
            const oldLabels = (feature.githubIssue?.labels || []).filter((l) =>
              l.startsWith('label-')
            );
            try {
              await api.github.updateIssueLabels(
                projectPath,
                issueNumber,
                ['label-completed'],
                oldLabels
              );
            } catch (err) {
              logger.error('Failed to update labels on complete:', err);
            }
          }

          // Close the issue on GitHub
          if (api.github?.closeIssue) {
            const result = await api.github.closeIssue(projectPath, issueNumber);
            if (result.success) {
              const updatedLabels = [
                ...(feature.githubIssue?.labels || []).filter((l) => !l.startsWith('label-')),
                'label-completed',
              ];
              updates.githubIssue = {
                ...feature.githubIssue!,
                labels: updatedLabels,
                state: 'closed',
                syncedAt: new Date().toISOString(),
              };
            } else {
              logger.error(`Failed to close GitHub issue #${issueNumber}:`, result.error);
              toast.error('Failed to close GitHub issue', {
                description: result.error || `Could not close issue #${issueNumber}`,
              });
            }
          }
        }
      }

      updateFeature(feature.id, updates);
      await persistFeatureUpdate(feature.id, updates);

      toast.success('Feature completed', {
        description: `Completed: ${truncateDescription(feature.description)}`,
      });
    },
    [updateFeature, persistFeatureUpdate, currentProject]
  );

  const handleRestoreFeature = useCallback(
    async (feature: Feature) => {
      const updates = {
        status: 'waiting_approval' as const,
      };
      updateFeature(feature.id, updates);
      await persistFeatureUpdate(feature.id, updates);

      toast.success('Feature restored', {
        description: `Moved back to Waiting Approval: ${truncateDescription(feature.description)}`,
      });
    },
    [updateFeature, persistFeatureUpdate]
  );

  const handleViewOutput = useCallback(
    (feature: Feature) => {
      setOutputFeature(feature);
      setShowOutputModal(true);
    },
    [setOutputFeature, setShowOutputModal]
  );

  const handleOutputModalNumberKeyPress = useCallback(
    (key: string) => {
      const index = key === '0' ? 9 : parseInt(key, 10) - 1;
      const targetFeature = inProgressFeaturesForShortcuts[index];

      if (!targetFeature) {
        return;
      }

      if (targetFeature.id === outputFeature?.id) {
        setShowOutputModal(false);
      } else {
        setOutputFeature(targetFeature);
      }
    },
    [inProgressFeaturesForShortcuts, outputFeature?.id, setShowOutputModal, setOutputFeature]
  );

  const handleForceStopFeature = useCallback(
    async (feature: Feature) => {
      try {
        await autoMode.stopFeature(feature.id);

        const targetStatus =
          feature.skipTests && feature.status === 'waiting_approval'
            ? 'waiting_approval'
            : 'backlog';

        if (targetStatus !== feature.status) {
          moveFeature(feature.id, targetStatus);
          // Must await to ensure file is written before user can restart
          await persistFeatureUpdate(feature.id, { status: targetStatus });
        }

        toast.success('Agent stopped', {
          description:
            targetStatus === 'waiting_approval'
              ? `Stopped commit - returned to waiting approval: ${truncateDescription(
                  feature.description
                )}`
              : `Stopped working on: ${truncateDescription(feature.description)}`,
        });
      } catch (error) {
        logger.error('Error stopping feature:', error);
        toast.error('Failed to stop agent', {
          description: error instanceof Error ? error.message : 'An error occurred',
        });
      }
    },
    [autoMode, moveFeature, persistFeatureUpdate]
  );

  const handleStartNextFeatures = useCallback(async () => {
    // Filter backlog features by the currently selected worktree branch
    // This ensures "G" only starts features from the filtered list
    const primaryBranch = projectPath ? getPrimaryWorktreeBranch(projectPath) : null;
    const backlogFeatures = features.filter((f) => {
      if (f.status !== 'backlog') return false;

      // Determine the feature's branch (default to primary branch if not set)
      const featureBranch = f.branchName || primaryBranch || 'main';

      // If no worktree is selected (currentWorktreeBranch is null or matches primary),
      // show features with no branch or primary branch
      if (
        !currentWorktreeBranch ||
        (projectPath && isPrimaryWorktreeBranch(projectPath, currentWorktreeBranch))
      ) {
        return (
          !f.branchName || (projectPath && isPrimaryWorktreeBranch(projectPath, featureBranch))
        );
      }

      // Otherwise, only show features matching the selected worktree branch
      return featureBranch === currentWorktreeBranch;
    });

    const availableSlots = useAppStore.getState().agentMultiplier - runningAutoTasks.length;

    if (availableSlots <= 0) {
      toast.error('Concurrency limit reached', {
        description: 'Wait for a task to complete or increase the concurrency limit.',
      });
      return;
    }

    if (backlogFeatures.length === 0) {
      const isOnPrimaryBranch =
        !currentWorktreeBranch ||
        (projectPath && isPrimaryWorktreeBranch(projectPath, currentWorktreeBranch));
      toast.info('Backlog empty', {
        description: !isOnPrimaryBranch
          ? `No features in backlog for branch "${currentWorktreeBranch}".`
          : 'No features in backlog to start.',
      });
      return;
    }

    // Sort by priority (lower number = higher priority, priority 1 is highest)
    // Features with blocking dependencies are sorted to the end
    const sortedBacklog = [...backlogFeatures].sort((a, b) => {
      const aBlocked =
        enableDependencyBlocking && !skipVerificationInAutoMode
          ? getBlockingDependencies(a, features).length > 0
          : false;
      const bBlocked =
        enableDependencyBlocking && !skipVerificationInAutoMode
          ? getBlockingDependencies(b, features).length > 0
          : false;

      // Blocked features go to the end
      if (aBlocked && !bBlocked) return 1;
      if (!aBlocked && bBlocked) return -1;

      // Within same blocked/unblocked group, sort by priority
      return (a.priority || 999) - (b.priority || 999);
    });

    // Find the first feature without blocking dependencies
    const featureToStart = sortedBacklog.find((f) => {
      if (!enableDependencyBlocking || skipVerificationInAutoMode) return true;
      return getBlockingDependencies(f, features).length === 0;
    });

    if (!featureToStart) {
      toast.info('No eligible features', {
        description:
          'All backlog features have unmet dependencies. Complete their dependencies first (or enable "Skip verification requirement" in Auto Mode settings).',
      });
      return;
    }

    // Start only one feature per keypress (user must press again for next)
    // Simplified: No worktree creation on client - server derives workDir from feature.branchName
    await handleStartImplementation(featureToStart);
  }, [
    features,
    runningAutoTasks,
    handleStartImplementation,
    currentWorktreeBranch,
    projectPath,
    isPrimaryWorktreeBranch,
    getPrimaryWorktreeBranch,
    enableDependencyBlocking,
    skipVerificationInAutoMode,
  ]);

  const handleToggleOwner = useCallback(
    async (feature: Feature) => {
      const featurePath = getFeatureProjectPath(feature, currentProject);
      if (!feature.githubIssue?.number || !featurePath) return;

      const api = getElectronAPI();
      if (!api?.github?.getCurrentUser || !api?.github?.updateIssueLabels) return;

      try {
        const userResult = await api.github.getCurrentUser(featurePath);
        if (!userResult.success || !userResult.username) {
          toast.error('Cannot determine GitHub user');
          return;
        }

        const ownerLabel = `owner-${userResult.username}`;
        const labels = feature.githubIssue.labels ?? [];
        const existingOwnerLabel = labels.find((l) => l.startsWith('owner-'));
        const isOwnedByMe = existingOwnerLabel === ownerLabel;
        const isOwnedByOther = existingOwnerLabel && !isOwnedByMe;

        if (isOwnedByOther) {
          const otherUser = existingOwnerLabel.replace('owner-', '');
          toast.error(`Owned by ${otherUser}`, {
            description: 'You cannot change ownership of an issue owned by another user.',
          });
          return;
        }

        if (isOwnedByMe) {
          // Unclaim ownership
          const result = await api.github.updateIssueLabels(
            featurePath,
            feature.githubIssue.number,
            [],
            [ownerLabel]
          );
          if (result.success) {
            const updatedLabels = labels.filter((l) => l !== ownerLabel);
            const githubUpdate = {
              githubIssue: { ...feature.githubIssue, labels: updatedLabels },
            };
            updateFeature(feature.id, githubUpdate);
            persistFeatureUpdate(feature.id, githubUpdate);
            toast.success('Ownership released');
          }
        } else {
          // Claim ownership
          const result = await api.github.updateIssueLabels(
            featurePath,
            feature.githubIssue.number,
            [ownerLabel],
            []
          );
          if (result.success) {
            const updatedLabels = [...labels, ownerLabel];
            const githubUpdate = {
              githubIssue: { ...feature.githubIssue, labels: updatedLabels },
            };
            updateFeature(feature.id, githubUpdate);
            persistFeatureUpdate(feature.id, githubUpdate);
            toast.success('You now own this issue');
          }
        }
      } catch (error) {
        logger.error('Error toggling ownership:', error);
        toast.error('Failed to update ownership', {
          description: error instanceof Error ? error.message : 'An error occurred',
        });
      }
    },
    [currentProject, updateFeature, persistFeatureUpdate]
  );

  const handleCompleteAllWaiting = useCallback(async () => {
    const waitingFeatures = features.filter((f) => f.status === 'waiting_approval');

    for (const feature of waitingFeatures) {
      const isRunning = runningAutoTasks.includes(feature.id);
      if (isRunning) {
        try {
          await autoMode.stopFeature(feature.id);
        } catch (error) {
          logger.error('Error stopping feature before completing:', error);
        }
      }

      const updates: Partial<Feature> = {
        status: 'completed' as const,
        completedAt: new Date().toISOString(),
      };

      // Close the linked GitHub issue and update labels
      const issueNumber = feature.githubIssue?.number;
      if (issueNumber) {
        const projectPath = getFeatureProjectPath(feature, currentProject);
        if (projectPath) {
          const api = getElectronAPI();

          if (api.github?.updateIssueLabels) {
            const oldLabels = (feature.githubIssue?.labels || []).filter((l) =>
              l.startsWith('label-')
            );
            try {
              await api.github.updateIssueLabels(
                projectPath,
                issueNumber,
                ['label-completed'],
                oldLabels
              );
            } catch (err) {
              logger.error('Failed to update labels on complete:', err);
            }
          }

          if (api.github?.closeIssue) {
            const result = await api.github.closeIssue(projectPath, issueNumber);
            if (result.success) {
              const updatedLabels = [
                ...(feature.githubIssue?.labels || []).filter((l) => !l.startsWith('label-')),
                'label-completed',
              ];
              updates.githubIssue = {
                ...feature.githubIssue!,
                labels: updatedLabels,
                state: 'closed',
                syncedAt: new Date().toISOString(),
              };
            }
          }
        }
      }

      updateFeature(feature.id, updates);
      await persistFeatureUpdate(feature.id, updates);
    }

    toast.success('All waiting approval features completed', {
      description: `Completed ${waitingFeatures.length} feature(s).`,
    });
  }, [features, runningAutoTasks, autoMode, updateFeature, persistFeatureUpdate, currentProject]);

  return {
    handleAddFeature,
    handleUpdateFeature,
    handleArchiveFeature,
    // Kept under the old name so callers that still say "delete" keep working;
    // deleting from the board archives now.
    handleDeleteFeature: handleArchiveFeature,
    handleStartImplementation,
    handleVerifyFeature,
    handleResumeFeature,
    handleManualVerify,
    handleMoveBackToInProgress,
    handleMoveBackToBacklog,
    handleSetFeatureStatus,
    handleOpenFollowUp,
    handleSendFollowUp,
    handleCommitFeature,
    handleMergeFeature,
    handleCompleteFeature,
    handleRestoreFeature,
    handleViewOutput,
    handleOutputModalNumberKeyPress,
    handleForceStopFeature,
    handleStartNextFeatures,
    handleCompleteAllWaiting,
    handleToggleOwner,
    // Unsatisfied dependencies dialog state and handlers
    unsatisfiedDepsDialog,
    handleConfirmStartWithUnsatisfiedDeps,
    handleCancelStartWithUnsatisfiedDeps,
    handleUnsatisfiedDepsDialogOpenChange,
    // "Create a GitHub repo for this project" offer
    createRepoDialog,
    handleGitHubRepoCreated,
    handleCreateRepoDialogOpenChange,
  };
}
