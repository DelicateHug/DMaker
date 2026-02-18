/**
 * Centralized constants for test utilities
 * This file contains all shared constants like URLs, timeouts, and selectors
 */

// ============================================================================
// API Configuration
// ============================================================================

/**
 * Base URL for the API server
 * Uses TEST_SERVER_PORT env var (default 3008) to match playwright.config.ts
 */
export const API_BASE_URL = `http://localhost:${process.env.TEST_SERVER_PORT || '3008'}`;

/**
 * API endpoints for worktree operations
 */
export const API_ENDPOINTS = {
  worktree: {
    create: `${API_BASE_URL}/api/worktree/create`,
    delete: `${API_BASE_URL}/api/worktree/delete`,
    list: `${API_BASE_URL}/api/worktree/list`,
    commit: `${API_BASE_URL}/api/worktree/commit`,
    switchBranch: `${API_BASE_URL}/api/worktree/switch-branch`,
    listBranches: `${API_BASE_URL}/api/worktree/list-branches`,
    status: `${API_BASE_URL}/api/worktree/status`,
    info: `${API_BASE_URL}/api/worktree/info`,
  },
  fs: {
    browse: `${API_BASE_URL}/api/fs/browse`,
    read: `${API_BASE_URL}/api/fs/read`,
    write: `${API_BASE_URL}/api/fs/write`,
  },
  features: {
    list: `${API_BASE_URL}/api/features/list`,
    create: `${API_BASE_URL}/api/features/create`,
    update: `${API_BASE_URL}/api/features/update`,
    delete: `${API_BASE_URL}/api/features/delete`,
  },
} as const;

// ============================================================================
// Timeout Configuration
// ============================================================================

/**
 * Default timeouts in milliseconds
 */
export const TIMEOUTS = {
  /** Default timeout for element visibility checks */
  default: 5000,
  /** Short timeout for quick checks */
  short: 2000,
  /** Medium timeout for standard operations */
  medium: 10000,
  /** Long timeout for slow operations */
  long: 30000,
  /** Extra long timeout for very slow operations */
  extraLong: 60000,
  /** Timeout for animations to complete */
  animation: 300,
  /** Small delay for UI to settle */
  settle: 500,
  /** Delay for network operations */
  network: 1000,
} as const;

// ============================================================================
// Test ID Selectors
// ============================================================================

/**
 * Common data-testid selectors organized by component/view
 */
export const TEST_IDS = {
  // Top Navigation Bar
  topNavBar: 'top-nav-bar',
  projectDropdownTrigger: 'project-dropdown-trigger',
  projectDropdownContent: 'project-dropdown-content',
  tasksDropdownTrigger: 'tasks-dropdown-trigger',
  githubDropdownTrigger: 'github-dropdown-trigger',
  toolsDropdownTrigger: 'tools-dropdown-trigger',
  settingsButton: 'settings-button',
  runningAgentsIndicator: 'running-agents-indicator',
  mobileMenuToggle: 'mobile-menu-toggle',

  // Views
  boardView: 'board-view',
  specView: 'spec-view',
  memoryView: 'memory-view',
  agentView: 'agent-view',
  terminalView: 'terminal-view',
  ideationView: 'ideation-view',
  settingsView: 'settings-view',
  welcomeView: 'welcome-view',
  dashboardView: 'dashboard-view',
  setupView: 'setup-view',
  githubIssuesView: 'github-issues-view',
  githubPrsView: 'github-prs-view',

  // Board View Components
  addFeatureButton: 'add-feature-button',
  addFeatureDialog: 'add-feature-dialog',
  confirmAddFeature: 'confirm-add-feature',
  featureBranchInput: 'feature-input',
  featureCategoryInput: 'feature-category-input',
  worktreeSelector: 'worktree-selector',
  completedToggle: 'completed-toggle',

  // Spec Editor
  specEditor: 'spec-editor',

  // File Browser Dialog
  pathInput: 'path-input',
  goToPathButton: 'go-to-path-button',

  // Memory View (formerly Context View)
  memoryFileList: 'memory-file-list',
  addMemoryButton: 'add-memory-button',

  // Keyboard Map
  keyboardMap: 'keyboard-map',
  keyboardMapLegend: 'keyboard-map-legend',
  keyboardMapLayout: 'keyboard-map-layout',
  keyboardMapStats: 'keyboard-map-stats',
  shortcutReferencePanel: 'shortcut-reference-panel',
  resetAllShortcutsButton: 'reset-all-shortcuts-button',

  // Description Image Dropzone
  descriptionImageDropzone: 'description-image-dropzone',
  descriptionFileInput: 'description-file-input',
  descriptionDropOverlay: 'drop-overlay',
  featureDescriptionInput: 'feature-description-input',
  descriptionBrowseButton: 'description-browse-button',
  descriptionProcessingIndicator: 'description-processing-indicator',
  descriptionFilePreviews: 'description-file-previews',
  descriptionClearAllFiles: 'description-clear-all-files',

  // Xterm Log Viewer
  xtermLogViewer: 'xterm-log-viewer',
} as const;

// ============================================================================
// CSS Selectors
// ============================================================================

/**
 * Common CSS selectors for elements that don't have data-testid
 */
export const CSS_SELECTORS = {
  /** CodeMirror editor content area */
  codeMirrorContent: '.cm-content',
  /** Dialog elements */
  dialog: '[role="dialog"]',
  /** Sonner toast notifications */
  toast: '[data-sonner-toast]',
  toastError: '[data-sonner-toast][data-type="error"]',
  toastSuccess: '[data-sonner-toast][data-type="success"]',
  /** Command/combobox input (shadcn-ui cmdk) */
  commandInput: '[cmdk-input]',
  /** Radix dialog overlay */
  dialogOverlay: '[data-radix-dialog-overlay]',
} as const;

// ============================================================================
// Storage Keys
// ============================================================================

/**
 * localStorage keys used by the application
 */
export const STORAGE_KEYS = {
  appStorage: 'automaker-storage',
  setupStorage: 'automaker-setup',
} as const;

// ============================================================================
// Branch Name Utilities
// ============================================================================

/**
 * Sanitize a branch name to create a valid worktree directory name
 * @param branchName - The branch name to sanitize
 * @returns Sanitized name suitable for directory paths
 */
export function sanitizeBranchName(branchName: string): string {
  return branchName.replace(/[^a-zA-Z0-9_-]/g, '-');
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default values used in test setup
 */
export const DEFAULTS = {
  projectName: 'Test Project',
  projectPath: '/mock/test-project',
  theme: 'dark' as const,
  maxConcurrency: 3,
} as const;
