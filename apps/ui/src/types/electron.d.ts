/**
 * Electron API type definitions
 */

import type { ClaudeUsageResponse, CodexUsageResponse } from '@/store/app-store';

export interface ImageAttachment {
  id?: string; // Optional - may not be present in messages loaded from server
  data: string; // base64 encoded image data
  mimeType: string; // e.g., "image/png", "image/jpeg"
  filename: string;
  size?: number; // file size in bytes - optional for messages from server
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isError?: boolean;
  images?: ImageAttachment[];
}

export interface ToolUse {
  name: string;
  input: unknown;
}

export type StreamEvent =
  | {
      type: 'message';
      sessionId: string;
      message: Message;
    }
  | {
      type: 'stream';
      sessionId: string;
      messageId: string;
      content: string;
      isComplete: boolean;
    }
  | {
      type: 'tool_use';
      sessionId: string;
      tool: ToolUse;
    }
  | {
      type: 'complete';
      sessionId: string;
      messageId?: string;
      content: string;
      toolUses: ToolUse[];
    }
  | {
      type: 'error';
      sessionId: string;
      error: string;
      message?: Message;
    };

export interface SessionListItem {
  id: string;
  name: string;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  isArchived: boolean;
  isDirty?: boolean; // Indicates session has completed work that needs review
  tags: string[];
  preview: string;
  /**
   * Research chat — the research project it belongs to. `isolated` means a
   * throwaway sandbox with global skills only; any other id means that
   * project's directory, with its own `.claude` skills and memory as well.
   */
  researchProjectId?: string;
}

/** A local research project — a workspace for AI chats with no repository. */
export interface ResearchProjectInfo {
  id: string;
  name: string;
  path: string;
  isolated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchAPI {
  list: () => Promise<{
    success: boolean;
    projects?: ResearchProjectInfo[];
    error?: string;
  }>;

  create: (name: string) => Promise<{
    success: boolean;
    project?: ResearchProjectInfo;
    error?: string;
  }>;

  rename: (
    projectId: string,
    name: string
  ) => Promise<{
    success: boolean;
    project?: ResearchProjectInfo;
    error?: string;
  }>;

  /** Deletes the project directory and every chat that ran in it */
  delete: (projectId: string) => Promise<{ success: boolean; error?: string }>;
}

export interface AgentAPI {
  start: (
    sessionId: string,
    workingDirectory?: string
  ) => Promise<{
    success: boolean;
    messages?: Message[];
    sessionId?: string;
    error?: string;
  }>;

  send: (
    sessionId: string,
    message: string,
    workingDirectory?: string,
    imagePaths?: string[],
    model?: string,
    thinkingLevel?: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  getHistory: (sessionId: string) => Promise<{
    success: boolean;
    messages?: Message[];
    isRunning?: boolean;
    error?: string;
  }>;

  stop: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  clear: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  onStream: (callback: (event: StreamEvent) => void) => () => void;
}

export interface SessionsAPI {
  list: (includeArchived?: boolean) => Promise<{
    success: boolean;
    sessions?: SessionListItem[];
    error?: string;
  }>;

  create: (
    name: string,
    projectPath: string,
    workingDirectory?: string,
    options?: { researchProjectId?: string }
  ) => Promise<{
    success: boolean;
    sessionId?: string;
    session?: unknown;
    error?: string;
  }>;

  update: (
    sessionId: string,
    name?: string,
    tags?: string[]
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  archive: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  unarchive: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  delete: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  markClean: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
}

/** Base fields included in all auto mode events */
interface AutoModeEventBase {
  /** ISO 8601 timestamp of when the event was emitted */
  timestamp: string;
}

export type AutoModeEvent = AutoModeEventBase &
  (
    | {
        type: 'auto_mode_feature_start';
        featureId: string;
        projectId?: string;
        projectPath?: string;
        feature: unknown;
      }
    | {
        type: 'auto_mode_progress';
        featureId: string;
        projectId?: string;
        projectPath?: string;
        content: string;
        /**
         * Which agent produced this. OPTIONAL on purpose: pipeline steps, spec
         * regeneration and every session recorded before agent-tree tracking
         * landed emit none, and those must attribute to the root, not vanish.
         */
        agentId?: string;
        agentName?: string;
      }
    | {
        type: 'auto_mode_tool';
        featureId: string;
        projectId?: string;
        projectPath?: string;
        tool: string;
        input: unknown;
        /** Optional for the same reason as on `auto_mode_progress`. */
        agentId?: string;
        agentName?: string;
        /** The SDK `tool_use` block id. For a `Task` block it is the child's node id. */
        toolUseId?: string;
      }
    | {
        type: 'auto_mode_feature_complete';
        featureId: string;
        featureTitle?: string;
        projectId?: string;
        projectPath?: string;
        passes: boolean;
        message: string;
        metrics?: import('@dmaker/types').ExecutionMetrics;
      }
    | {
        type: 'pipeline_step_started';
        featureId: string;
        projectPath?: string;
        stepId: string;
        stepName: string;
        stepIndex: number;
        totalSteps: number;
      }
    | {
        type: 'pipeline_step_complete';
        featureId: string;
        projectPath?: string;
        stepId: string;
        stepName: string;
        stepIndex: number;
        totalSteps: number;
      }
    | {
        type: 'auto_mode_error';
        error: string;
        errorType?: 'authentication' | 'cancellation' | 'abort' | 'execution' | 'feature_not_found';
        featureId?: string;
        projectId?: string;
        projectPath?: string;
      }
    | {
        type: 'auto_mode_phase';
        featureId: string;
        projectId?: string;
        projectPath?: string;
        phase: 'planning' | 'action' | 'verification';
        message: string;
      }
    | {
        type: 'auto_mode_ultrathink_preparation';
        featureId: string;
        projectPath?: string;
        warnings: string[];
        recommendations: string[];
        estimatedCost?: number;
        estimatedTime?: string;
      }
    | {
        type: 'plan_approval_required';
        featureId: string;
        projectPath?: string;
        planContent: string;
        planVersion?: number;
      }
    | {
        type: 'plan_auto_approved';
        featureId: string;
        projectPath?: string;
        /**
         * Only the full-plan approval path carries the plan. The lite/adaptive
         * path — the default — sends `mode`/`tasksCount`/`message` and no
         * `planContent` at all, so declaring it required was a lie about the
         * wire that any consumer reading it would have tripped over.
         */
        planContent?: string;
        /** Lite planning is the only depth that auto-approves without a plan body. */
        mode?: 'lite';
        tasksCount?: number;
        message?: string;
      }
    | {
        type: 'plan_approved';
        featureId: string;
        projectPath?: string;
        hasEdits: boolean;
        planVersion?: number;
      }
    | {
        type: 'plan_rejected';
        featureId: string;
        projectPath?: string;
        feedback?: string;
      }
    | {
        type: 'plan_revision_requested';
        featureId: string;
        projectPath?: string;
        feedback?: string;
        hasEdits?: boolean;
        planVersion?: number;
      }
    | {
        type: 'planning_started';
        featureId: string;
        projectPath?: string;
        /**
         * `'adaptive'` is what the default `planningStrategy: 'auto'` emits and
         * was missing here; a client narrowing on this union never saw it.
         */
        mode: 'lite' | 'spec' | 'full' | 'adaptive';
        message: string;
      }
    | {
        type: 'auto_mode_task_started';
        featureId: string;
        projectPath?: string;
        taskId: string;
        taskDescription: string;
        taskIndex: number;
        tasksTotal: number;
      }
    | {
        type: 'auto_mode_task_complete';
        featureId: string;
        projectPath?: string;
        taskId: string;
        tasksCompleted: number;
        tasksTotal: number;
      }
    | {
        type: 'auto_mode_phase_complete';
        featureId: string;
        projectPath?: string;
        /** The raw phase label, e.g. 'Phase 1' or 'Foundation'. */
        phase?: string;
        /**
         * Omitted when the label has no digits. A phase named 'Foundation' used
         * to emit no event at all; it now emits one with no number, so this can
         * no longer be required.
         */
        phaseNumber?: number;
      }
    | {
        type: 'auto_mode_resuming_features';
        message: string;
        projectPath?: string;
        featureIds: string[];
        features: Array<{
          id: string;
          title?: string;
          status?: string;
        }>;
      }
    | {
        type: 'auto_mode_metrics_update';
        featureId: string;
        projectPath?: string;
        metrics: import('@dmaker/types').ExecutionMetrics;
      }
    // The agent-tree trio. Imported rather than re-declared: the server emits
    // straight from these same interfaces, so a hand-copy here could only ever
    // drift. All three ride inside the existing 'auto-mode:event' envelope —
    // there are no new EventType names.
    //
    // `auto_mode_subagent_started` can arrive TWICE for one agentId: once as an
    // inferred placeholder, once when the Task block explaining it turns up.
    // Upsert by agentId, never append. `auto_mode_agent_tree` is the late-join
    // resync and replaces the tree wholesale.
    | import('@dmaker/types').AutoModeSubagentStartedEvent
    | import('@dmaker/types').AutoModeSubagentFinishedEvent
    | import('@dmaker/types').AutoModeAgentTreeEvent
  );

export type SpecRegenerationEvent =
  | {
      type: 'spec_regeneration_progress';
      content: string;
      projectPath: string;
    }
  | {
      type: 'spec_regeneration_tool';
      tool: string;
      input: unknown;
      projectPath: string;
    }
  | {
      type: 'spec_regeneration_complete';
      message: string;
      projectPath: string;
    }
  | {
      type: 'spec_regeneration_error';
      error: string;
      projectPath: string;
    };

export interface SpecRegenerationAPI {
  create: (
    projectPath: string,
    projectOverview: string,
    generateFeatures?: boolean,
    analyzeProject?: boolean,
    maxFeatures?: number
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  generate: (
    projectPath: string,
    projectDefinition: string,
    generateFeatures?: boolean,
    analyzeProject?: boolean,
    maxFeatures?: number
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  generateFeatures: (
    projectPath: string,
    maxFeatures?: number
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  sync: (projectPath: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  stop: (projectPath?: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  status: (projectPath?: string) => Promise<{
    success: boolean;
    isRunning?: boolean;
    currentPhase?: string;
    projectPath?: string;
    error?: string;
  }>;

  onEvent: (callback: (event: SpecRegenerationEvent) => void) => () => void;
}

export interface AutoModeAPI {
  stopFeature: (featureId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  status: (projectPath?: string) => Promise<{
    success: boolean;
    isRunning?: boolean;
    currentFeatureId?: string | null;
    runningFeatures?: string[];
    runningProjects?: string[];
    runningCount?: number;
    error?: string;
  }>;

  runFeature: (
    projectPath: string,
    featureId: string,
    forceRun?: boolean,
    forceRunClaimed?: boolean
  ) => Promise<{
    success: boolean;
    passes?: boolean;
    error?: string;
    /** Warning type when feature has unsatisfied dependencies or is claimed by another user */
    warning?: 'unsatisfied_dependencies' | 'claimed_by_other';
    /** Human-readable warning message */
    message?: string;
    /** GitHub username that claimed the feature (when warning is 'claimed_by_other') */
    claimedBy?: string;
    /** Whether the feature is already running */
    alreadyRunning?: boolean;
    /** Details of blocking dependencies when warning is 'unsatisfied_dependencies' */
    blockingDependencies?: Array<{
      id: string;
      title?: string;
      description?: string;
      status?: string;
    }>;
  }>;

  verifyFeature: (
    projectPath: string,
    featureId: string
  ) => Promise<{
    success: boolean;
    passes?: boolean;
    error?: string;
  }>;

  resumeFeature: (
    projectPath: string,
    featureId: string
  ) => Promise<{
    success: boolean;
    passes?: boolean;
    error?: string;
  }>;

  contextExists: (
    projectPath: string,
    featureId: string
  ) => Promise<{
    success: boolean;
    exists?: boolean;
    error?: string;
  }>;

  analyzeProject: (projectPath: string) => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;

  followUpFeature: (
    projectPath: string,
    featureId: string,
    prompt: string,
    imagePaths?: string[]
  ) => Promise<{
    success: boolean;
    passes?: boolean;
    error?: string;
  }>;

  commitFeature: (
    projectPath: string,
    featureId: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  approvePlan: (
    projectPath: string,
    featureId: string,
    approved: boolean,
    editedPlan?: string,
    feedback?: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  onEvent: (callback: (event: AutoModeEvent) => void) => () => void;
}

export interface ElectronAPI {
  // Platform info (exposed from preload)
  platform?: 'darwin' | 'win32' | 'linux';
  isElectron?: boolean;

  ping: () => Promise<string>;
  getApiKey?: () => Promise<string | null>;
  quit?: () => Promise<void>;
  openExternalLink: (url: string) => Promise<{ success: boolean; error?: string }>;
  updateTrayCount?: (count: number) => Promise<{ success: boolean; error?: string }>;

  // Dialog APIs
  openDirectory: () => Promise<{
    canceled: boolean;
    filePaths: string[];
  }>;
  openFile: (options?: {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    properties?: string[];
  }) => Promise<{
    canceled: boolean;
    filePaths: string[];
  }>;

  // File system APIs
  readFile: (filePath: string) => Promise<{
    success: boolean;
    content?: string;
    error?: string;
  }>;
  writeFile: (
    filePath: string,
    content: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;
  mkdir: (dirPath: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  readdir: (dirPath: string) => Promise<{
    success: boolean;
    entries?: Array<{
      name: string;
      isDirectory: boolean;
      isFile: boolean;
    }>;
    error?: string;
  }>;
  exists: (filePath: string) => Promise<boolean>;
  stat: (filePath: string) => Promise<{
    success: boolean;
    stats?: {
      isDirectory: boolean;
      isFile: boolean;
      size: number;
      mtime: Date;
    };
    error?: string;
  }>;
  deleteFile: (filePath: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  // App APIs
  getPath: (name: string) => Promise<string>;
  saveImageToTemp: (
    data: string,
    filename: string,
    mimeType: string,
    projectPath?: string
  ) => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;

  // Agent APIs
  agent: AgentAPI;

  // Session Management APIs
  sessions: SessionsAPI;

  // Auto Mode APIs
  autoMode: AutoModeAPI;

  // Claude CLI Detection API
  checkClaudeCli: () => Promise<{
    success: boolean;
    status?: string;
    method?: string;
    version?: string;
    path?: string;
    recommendation?: string;
    installCommands?: {
      macos?: string;
      windows?: string;
      linux?: string;
      npm?: string;
    };
    error?: string;
  }>;

  // Model Management APIs
  model: {
    // Get all available models from all providers
    getAvailable: () => Promise<{
      success: boolean;
      models?: ModelDefinition[];
      error?: string;
    }>;

    // Check all provider installation status
    checkProviders: () => Promise<{
      success: boolean;
      providers?: Record<string, ProviderStatus>;
      error?: string;
    }>;
  };

  // OpenAI API
  testOpenAIConnection: (apiKey?: string) => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;

  // Claude Usage API
  claude: {
    getUsage: () => Promise<ClaudeUsageResponse>;
  };

  // Codex Usage API
  codex: {
    getUsage: () => Promise<CodexUsageResponse>;
  };

  // Worktree Management APIs
  worktree: WorktreeAPI;

  // Git Operations APIs (for non-worktree operations)
  git: GitAPI;

  // Spec Regeneration APIs
  specRegeneration: SpecRegenerationAPI;
}

export interface WorktreeInfo {
  worktreePath: string;
  branchName: string;
  head?: string;
  baseBranch?: string;
}

export interface WorktreeStatus {
  success: boolean;
  modifiedFiles?: number;
  files?: string[];
  diffStat?: string;
  recentCommits?: string[];
  error?: string;
}

export interface FileStatus {
  status: string;
  path: string;
  statusText: string;
}

export interface FileDiffsResult {
  success: boolean;
  diff?: string;
  files?: FileStatus[];
  hasChanges?: boolean;
  error?: string;
  /**
   * Worktree these diffs actually came from, or `null` when the request fell
   * back to the main checkout. Only `/api/worktree/diffs` sets these two;
   * `/api/git/diffs` leaves them absent because it is always given a path.
   */
  worktreePath?: string | null;
  /**
   * The feature's worktree could not be resolved and the MAIN CHECKOUT's
   * changes were returned instead. This used to be a silent `success: true`,
   * which is why the Diff tab had never once shown a feature's own worktree.
   * Anything rendering these diffs must say so when this is true.
   */
  usedMainCheckout?: boolean;
}

export interface FileDiffResult {
  success: boolean;
  diff?: string;
  filePath?: string;
  error?: string;
}

/**
 * What the branch-delete dialog needs before it dares offer the button.
 *
 * `remoteRef` is read from this clone's remote-tracking refs, not from a live
 * fetch — so it can be stale in the over-warning direction (the branch was
 * deleted upstream and nobody has pruned yet), never in the under-warning one.
 */
export interface BranchDeleteInfo {
  branchName: string;
  /** The repository has the branch itself, not just a remote-tracking ref */
  hasLocal: boolean;
  /** The repository's trunk — refused outright */
  isDefault: boolean;
  /** Checked out in the main working copy — refused outright */
  isCurrent: boolean;
  /** Checked out in a worktree, which has to be removed first */
  worktreePath: string | null;
  /** e.g. 'origin/feature-x', when the remote has it */
  remoteRef: string | null;
  /** e.g. 'origin' */
  remote: string | null;
  /** Fully merged into the trunk — deleting loses nothing */
  isMerged: boolean;
  /** Commits on this branch the trunk does not have */
  unmergedCommits: number;
  /** Trunk it was compared against, when there was one */
  comparedAgainst: string | null;
}

export interface WorktreeAPI {
  // Merge worktree branch into main and clean up
  mergeFeature: (
    projectPath: string,
    branchName: string,
    worktreePath: string,
    options?: {
      squash?: boolean;
      message?: string;
    }
  ) => Promise<{
    success: boolean;
    mergedBranch?: string;
    error?: string;
  }>;

  // Get worktree info for a feature
  //
  // `branchName` is optional but strongly wanted: worktree directories are named
  // after the SANITISED BRANCH, never the feature id, so resolving by featureId
  // alone misses for every real feature and silently reports the main checkout.
  // Pass `feature.branchName` and the server resolves through git first.
  getInfo: (
    projectPath: string,
    featureId: string,
    branchName?: string
  ) => Promise<{
    success: boolean;
    worktreePath?: string;
    branchName?: string;
    head?: string;
    error?: string;
  }>;

  // Get worktree status (changed files, commits)
  getStatus: (
    projectPath: string,
    featureId: string,
    branchName?: string
  ) => Promise<WorktreeStatus>;

  // List all feature worktrees
  list: (projectPath: string) => Promise<{
    success: boolean;
    worktrees?: WorktreeInfo[];
    error?: string;
  }>;

  // List all worktrees with details (for worktree selector)
  listAll: (
    projectPath: string,
    includeDetails?: boolean,
    forceRefreshGitHub?: boolean
  ) => Promise<{
    success: boolean;
    worktrees?: Array<{
      path: string;
      branch: string;
      isMain: boolean;
      isCurrent: boolean; // Is this the currently checked out branch?
      hasWorktree: boolean; // Does this branch have an active worktree?
      hasChanges?: boolean;
      changedFilesCount?: number;
      pr?: {
        number: number;
        url: string;
        title: string;
        state: string;
        createdAt: string;
      };
    }>;
    removedWorktrees?: Array<{
      path: string;
      branch: string;
    }>;
    error?: string;
  }>;

  // Create a new worktree
  create: (
    projectPath: string,
    branchName: string,
    baseBranch?: string
  ) => Promise<{
    success: boolean;
    worktree?: {
      path: string;
      branch: string;
      isNew: boolean;
    };
    error?: string;
  }>;

  // Delete a worktree
  delete: (
    projectPath: string,
    worktreePath: string,
    deleteBranch?: boolean
  ) => Promise<{
    success: boolean;
    deleted?: {
      worktreePath: string;
      branch: string | null;
    };
    error?: string;
  }>;

  // What deleting a branch would cost, and what stands in the way of it
  getBranchDeleteInfo: (
    projectPath: string,
    branchName: string
  ) => Promise<{
    success: boolean;
    info?: BranchDeleteInfo;
    error?: string;
  }>;

  // Delete a branch that still exists, optionally on its remote too
  deleteBranch: (
    projectPath: string,
    branchName: string,
    options?: { force?: boolean; deleteRemote?: boolean }
  ) => Promise<{
    success: boolean;
    deleted?: {
      branch: string;
      local: boolean;
      remote: boolean;
      remoteRef: string | null;
    };
    /** The local delete landed but the remote one did not */
    remoteError?: string;
    /** `git branch -d` refused because the trunk lacks the commits */
    needsForce?: boolean;
    info?: BranchDeleteInfo;
    error?: string;
  }>;

  // Commit changes in a worktree
  commit: (
    worktreePath: string,
    message: string
  ) => Promise<{
    success: boolean;
    result?: {
      committed: boolean;
      commitHash?: string;
      branch?: string;
      message?: string;
    };
    error?: string;
  }>;

  // Generate an AI commit message from git diff
  generateCommitMessage: (worktreePath: string) => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;

  // Push a worktree branch to remote
  push: (
    worktreePath: string,
    force?: boolean
  ) => Promise<{
    success: boolean;
    result?: {
      branch: string;
      pushed: boolean;
      message: string;
    };
    error?: string;
    code?: 'NOT_GIT_REPO' | 'NO_COMMITS';
  }>;

  // Create a pull request from a worktree
  createPR: (
    worktreePath: string,
    options?: {
      projectPath?: string;
      commitMessage?: string;
      prTitle?: string;
      prBody?: string;
      baseBranch?: string;
      draft?: boolean;
    }
  ) => Promise<{
    success: boolean;
    result?: {
      branch: string;
      committed: boolean;
      commitHash?: string;
      pushed: boolean;
      prUrl?: string;
      prNumber?: number;
      prCreated: boolean;
      prAlreadyExisted?: boolean;
      prError?: string;
      browserUrl?: string;
      ghCliAvailable?: boolean;
    };
    error?: string;
  }>;

  // Get file diffs for a feature worktree. See `getInfo` on why branchName matters.
  getDiffs: (
    projectPath: string,
    featureId: string,
    branchName?: string
  ) => Promise<FileDiffsResult>;

  // Get diff for a specific file in a worktree
  getFileDiff: (
    projectPath: string,
    featureId: string,
    filePath: string,
    branchName?: string
  ) => Promise<FileDiffResult>;

  // Pull latest changes from remote
  pull: (worktreePath: string) => Promise<{
    success: boolean;
    result?: {
      branch: string;
      pulled: boolean;
      message: string;
    };
    error?: string;
    code?: 'NOT_GIT_REPO' | 'NO_COMMITS';
  }>;

  // Create and checkout a new branch
  checkoutBranch: (
    worktreePath: string,
    branchName: string
  ) => Promise<{
    success: boolean;
    result?: {
      previousBranch: string;
      newBranch: string;
      message: string;
    };
    error?: string;
    code?: 'NOT_GIT_REPO' | 'NO_COMMITS';
  }>;

  // List branches (local and optionally remote)
  listBranches: (
    worktreePath: string,
    includeRemote?: boolean
  ) => Promise<{
    success: boolean;
    result?: {
      currentBranch: string;
      branches: Array<{
        name: string;
        isCurrent: boolean;
        isRemote: boolean;
      }>;
      aheadCount: number;
      behindCount: number;
    };
    error?: string;
    code?: 'NOT_GIT_REPO' | 'NO_COMMITS'; // Error codes for git status issues
  }>;

  // Switch to an existing branch
  switchBranch: (
    worktreePath: string,
    branchName: string
  ) => Promise<{
    success: boolean;
    result?: {
      previousBranch: string;
      currentBranch: string;
      message: string;
    };
    error?: string;
    code?: 'NOT_GIT_REPO' | 'NO_COMMITS' | 'UNCOMMITTED_CHANGES';
  }>;

  // Open a worktree directory in the editor
  openInEditor: (
    worktreePath: string,
    editorCommand?: string
  ) => Promise<{
    success: boolean;
    result?: {
      message: string;
      editorName?: string;
    };
    error?: string;
  }>;

  // Get the default code editor name
  getDefaultEditor: () => Promise<{
    success: boolean;
    result?: {
      editorName: string;
      editorCommand: string;
    };
    error?: string;
  }>;

  // Get all available code editors
  getAvailableEditors: () => Promise<{
    success: boolean;
    result?: {
      editors: Array<{
        name: string;
        command: string;
      }>;
    };
    error?: string;
  }>;

  // Refresh editor cache and re-detect available editors
  refreshEditors: () => Promise<{
    success: boolean;
    result?: {
      editors: Array<{
        name: string;
        command: string;
      }>;
      message: string;
    };
    error?: string;
  }>;
  // Initialize git repository in a project
  initGit: (projectPath: string) => Promise<{
    success: boolean;
    result?: {
      initialized: boolean;
      message: string;
    };
    error?: string;
  }>;

  // Start a dev server for a worktree
  startDevServer: (
    projectPath: string,
    worktreePath: string
  ) => Promise<{
    success: boolean;
    result?: {
      worktreePath: string;
      port: number;
      url: string;
      message: string;
    };
    error?: string;
  }>;

  // Stop a dev server for a worktree
  stopDevServer: (worktreePath: string) => Promise<{
    success: boolean;
    result?: {
      worktreePath: string;
      message: string;
    };
    error?: string;
  }>;

  /**
   * Batched ahead/behind + uncommitted-change counts for a set of worktrees.
   * Never runs `git fetch`, so it is cheap enough for the sidebar to poll.
   */
  getSyncStatus: (worktreePaths: string[]) => Promise<{
    success: boolean;
    statuses?: Array<{
      worktreePath: string;
      branch: string;
      ahead: number;
      behind: number;
      dirtyCount: number;
    }>;
    error?: string;
  }>;

  /**
   * Branches that exist on each project's remote but have no worktree locally.
   * Fetches with --prune, and drops branches already merged into the trunk.
   */
  getRemoteBranches: (projectPaths: string[]) => Promise<{
    success: boolean;
    projects?: Array<{
      projectPath: string;
      remote?: string;
      defaultBranch?: string;
      branches: Array<{
        name: string;
        remoteRef: string;
        lastCommitAt?: string;
        lastCommitBy?: string;
        lastCommitSubject?: string;
        hasLocalBranch: boolean;
      }>;
      error?: string;
    }>;
    error?: string;
  }>;

  /**
   * Every branch each project actually has, read from `refs/heads`.
   *
   * Local only — no fetch — so it is cheap to poll, and it is the only source
   * that says a branch has been deleted rather than merely gone quiet.
   */
  getLocalBranches: (projectPaths: string[]) => Promise<{
    success: boolean;
    projects?: Array<{
      projectPath: string;
      defaultBranch?: string;
      branches: Array<{
        name: string;
        isDefault: boolean;
        isCurrent: boolean;
        hasWorktree: boolean;
        worktreePath?: string;
        lastCommitAt?: string;
        lastCommitBy?: string;
        lastCommitSubject?: string;
        upstream?: string;
        upstreamGone: boolean;
      }>;
      error?: string;
    }>;
    error?: string;
  }>;

  /**
   * Fetches each project's remote, then reports every listed worktree's real
   * position against its upstream. With `autoUpdate` it also fast-forwards
   * branches that are cleanly behind — never anything more invasive.
   */
  branchSync: (
    projects: Array<{ projectPath: string; worktreePaths: string[] }>,
    autoUpdate?: boolean
  ) => Promise<{
    success: boolean;
    projects?: Array<{
      projectPath: string;
      remote?: string;
      fetched: boolean;
      error?: string;
      branches: Array<{
        worktreePath: string;
        branch: string;
        upstream?: string;
        ahead: number;
        behind: number;
        dirtyCount: number;
        conflictedFiles: string[];
        state:
          | 'in-sync'
          | 'updated'
          | 'ahead'
          | 'no-upstream'
          | 'behind'
          | 'blocked'
          | 'diverged'
          | 'conflict'
          | 'error';
        message?: string;
        canAutoFix: boolean;
        didUpdate: boolean;
      }>;
    }>;
    error?: string;
  }>;

  /**
   * Deterministic repair for one branch: stash, then fast-forward or rebase.
   * Refuses a branch that already has unresolved conflicts.
   */
  branchAutoFix: (worktreePath: string) => Promise<{
    success: boolean;
    result?: {
      worktreePath: string;
      branch: string;
      upstream?: string;
      ahead: number;
      behind: number;
      dirtyCount: number;
      conflictedFiles: string[];
      state: string;
      message?: string;
      canAutoFix: boolean;
      didUpdate: boolean;
    };
    steps?: string[];
    error?: string;
  }>;

  // List all running dev servers
  listDevServers: () => Promise<{
    success: boolean;
    result?: {
      servers: Array<{
        worktreePath: string;
        port: number;
        url: string;
      }>;
    };
    error?: string;
  }>;

  // Get buffered logs for a dev server
  getDevServerLogs: (worktreePath: string) => Promise<{
    success: boolean;
    result?: {
      worktreePath: string;
      port: number;
      url: string;
      logs: string;
      startedAt: string;
    };
    error?: string;
  }>;

  // Subscribe to dev server log events (started, output, stopped)
  onDevServerLogEvent: (
    callback: (
      event:
        | {
            type: 'dev-server:started';
            payload: { worktreePath: string; port: number; url: string; timestamp: string };
          }
        | {
            type: 'dev-server:output';
            payload: { worktreePath: string; content: string; timestamp: string };
          }
        | {
            type: 'dev-server:stopped';
            payload: {
              worktreePath: string;
              port: number;
              exitCode: number | null;
              error?: string;
              timestamp: string;
            };
          }
    ) => void
  ) => () => void;

  // Get PR info and comments for a branch
  getPRInfo: (
    worktreePath: string,
    branchName: string
  ) => Promise<{
    success: boolean;
    result?: {
      hasPR: boolean;
      ghCliAvailable: boolean;
      prInfo?: {
        number: number;
        title: string;
        url: string;
        state: string;
        author: string;
        body: string;
        comments: Array<{
          id: number;
          author: string;
          body: string;
          createdAt: string;
          isReviewComment: boolean;
        }>;
        reviewComments: Array<{
          id: number;
          author: string;
          body: string;
          path?: string;
          line?: number;
          createdAt: string;
          isReviewComment: boolean;
        }>;
      };
      error?: string;
    };
    error?: string;
  }>;

  // Get init script content for a project
  getInitScript: (projectPath: string) => Promise<{
    success: boolean;
    exists: boolean;
    content: string;
    path: string;
    error?: string;
  }>;

  // Set init script content for a project
  setInitScript: (
    projectPath: string,
    content: string
  ) => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;

  // Delete init script for a project
  deleteInitScript: (projectPath: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  // Run (or re-run) init script for a worktree
  runInitScript: (
    projectPath: string,
    worktreePath: string,
    branch: string
  ) => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;

  // Subscribe to init script events
  onInitScriptEvent: (
    callback: (event: {
      type: 'worktree:init-started' | 'worktree:init-output' | 'worktree:init-completed';
      payload: unknown;
    }) => void
  ) => () => void;
}

export interface GitAPI {
  // Get diffs for the main project (not a worktree)
  getDiffs: (projectPath: string) => Promise<FileDiffsResult>;

  // Get diff for a specific file in the main project
  getFileDiff: (projectPath: string, filePath: string) => Promise<FileDiffResult>;
}

// Model definition type
export interface ModelDefinition {
  id: string;
  name: string;
  modelString: string;
  provider: 'claude';
  description?: string;
  tier?: 'basic' | 'standard' | 'premium';
  default?: boolean;
}

// Provider status type
export interface ProviderStatus {
  status: 'installed' | 'not_installed' | 'api_key_only';
  method?: string;
  version?: string;
  path?: string;
  recommendation?: string;
  installCommands?: {
    macos?: string;
    windows?: string;
    linux?: string;
    npm?: string;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    isElectron: boolean;
  }
}

export {};
