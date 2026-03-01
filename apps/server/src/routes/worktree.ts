/**
 * Worktree routes - HTTP API for git worktree operations
 *
 * Consolidated from worktree/ directory into a single flat file.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join, isAbsolute } from 'path';
import path from 'path';
import { createLogger } from '@dmaker/utils';
import {
  secureFs,
  spawnProcess,
  getBranchTrackingPath,
  ensureDmakerDir,
  getDmakerDir,
  clearEditorCache,
  detectAllEditors,
  detectDefaultEditor,
  openInEditor,
  openInFileManager,
} from '@dmaker/platform';
import {
  isGitRepo,
  generateSyntheticDiffForNewFile,
  getGitRepositoryDiffs,
} from '@dmaker/git-utils';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { DEFAULT_PHASE_MODELS, isCursorModel, stripProviderPrefix } from '@dmaker/types';
import { resolvePhaseModel } from '@dmaker/model-resolver';
import { mergeCommitMessagePrompts } from '@dmaker/prompts';
import { ProviderFactory } from '../providers/provider-factory.js';
import type { EventEmitter } from '../lib/events.js';
import { validatePathParams } from '../middleware.js';
import {
  updateWorktreePRInfo,
  readAllWorktreeMetadata,
  type WorktreePRInfo,
} from '../lib/worktree-metadata.js';
import { getDevServerService } from '../services/dev-server-service.js';
import { runInitScript, forceRunInitScript } from '../services/init-script-service.js';
import type { SettingsService } from '../services/settings-service.js';
import { checkGitHubRemote, type GitHubRemoteStatus } from './github.js';

const execAsync = promisify(exec);

// ============================================================================
// Logger & Error Utilities (inlined from common.ts)
// ============================================================================

const logger = createLogger('Worktree');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(error: unknown, context: string): void {
  logger.error(`\u274c ${context}:`, error);
}

// ============================================================================
// Secure Command Execution (from worktree/common.ts)
// ============================================================================

/**
 * Execute git command with array arguments to prevent command injection.
 * Uses spawnProcess from @dmaker/platform for secure, cross-platform execution.
 */
async function execGitCommand(args: string[], cwd: string): Promise<string> {
  const result = await spawnProcess({
    command: 'git',
    args,
    cwd,
  });

  if (result.exitCode === 0) {
    return result.stdout;
  } else {
    const errorMessage = result.stderr || `Git command failed with code ${result.exitCode}`;
    throw new Error(errorMessage);
  }
}

// ============================================================================
// Constants
// ============================================================================

const MAX_BRANCH_NAME_LENGTH = 250;

export const DMAKER_INITIAL_COMMIT_MESSAGE = 'chore: dmaker initial commit';

// ============================================================================
// Extended PATH configuration for Electron apps
// ============================================================================

const pathSeparator = process.platform === 'win32' ? ';' : ':';
const additionalPaths: string[] = [];

if (process.platform === 'win32') {
  if (process.env.LOCALAPPDATA) {
    additionalPaths.push(`${process.env.LOCALAPPDATA}\\Programs\\Git\\cmd`);
  }
  if (process.env.PROGRAMFILES) {
    additionalPaths.push(`${process.env.PROGRAMFILES}\\Git\\cmd`);
  }
  if (process.env['ProgramFiles(x86)']) {
    additionalPaths.push(`${process.env['ProgramFiles(x86)']}\\Git\\cmd`);
  }
} else {
  additionalPaths.push(
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/home/linuxbrew/.linuxbrew/bin',
    `${process.env.HOME}/.local/bin`
  );
}

const extendedPath = [process.env.PATH, ...additionalPaths.filter(Boolean)]
  .filter(Boolean)
  .join(pathSeparator);

const execEnv = {
  ...process.env,
  PATH: extendedPath,
};

// ============================================================================
// Validation Utilities
// ============================================================================

function isValidBranchName(name: string): boolean {
  return /^[a-zA-Z0-9._\-/]+$/.test(name) && name.length < MAX_BRANCH_NAME_LENGTH;
}

async function isGhCliAvailable(): Promise<boolean> {
  try {
    const checkCommand = process.platform === 'win32' ? 'where gh' : 'command -v gh';
    await execAsync(checkCommand, { env: execEnv });
    return true;
  } catch {
    return false;
  }
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

async function hasCommits(repoPath: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --verify HEAD', { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

function isENOENT(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

function isMockPath(worktreePath: string): boolean {
  return worktreePath.startsWith('/mock/') || worktreePath.includes('/mock/');
}

function logWorktreeError(error: unknown, message: string, worktreePath?: string): void {
  if (isENOENT(error) && worktreePath && isMockPath(worktreePath)) {
    return;
  }
  logError(error, message);
}

async function ensureInitialCommit(
  repoPath: string,
  env?: Record<string, string>
): Promise<boolean> {
  try {
    await execAsync('git rev-parse --verify HEAD', { cwd: repoPath });
    return false;
  } catch {
    try {
      await execAsync(`git commit --allow-empty -m "${DMAKER_INITIAL_COMMIT_MESSAGE}"`, {
        cwd: repoPath,
        env: { ...process.env, ...env },
      });
      logger.info(`[Worktree] Created initial empty commit to enable worktrees in ${repoPath}`);
      return true;
    } catch (error) {
      const reason = getErrorMessage(error);
      throw new Error(
        `Failed to create initial git commit. Please commit manually and retry. ${reason}`
      );
    }
  }
}

// ============================================================================
// Middleware (from worktree/middleware.ts)
// ============================================================================

interface ValidationOptions {
  requireGitRepo?: boolean;
  requireCommits?: boolean;
  pathField?: 'worktreePath' | 'projectPath';
}

function requireValidGitRepo(options: ValidationOptions = {}) {
  const {
    requireGitRepo: reqGitRepo = true,
    requireCommits = true,
    pathField = 'worktreePath',
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const repoPath = req.body[pathField] as string | undefined;

    if (!repoPath) {
      next();
      return;
    }

    if (reqGitRepo && !(await isGitRepo(repoPath))) {
      res.status(400).json({
        success: false,
        error: 'Not a git repository',
        code: 'NOT_GIT_REPO',
      });
      return;
    }

    if (requireCommits && !(await hasCommits(repoPath))) {
      res.status(400).json({
        success: false,
        error: 'Repository has no commits yet',
        code: 'NO_COMMITS',
      });
      return;
    }

    next();
  };
}

const requireValidWorktree = requireValidGitRepo({ pathField: 'worktreePath' });
const requireValidProject = requireValidGitRepo({ pathField: 'projectPath' });
const requireGitRepoOnly = requireValidGitRepo({
  pathField: 'worktreePath',
  requireCommits: false,
});

// ============================================================================
// Branch Tracking (from worktree/routes/branch-tracking.ts)
// ============================================================================

const branchTrackingLogger = createLogger('BranchTracking');

interface TrackedBranch {
  name: string;
  createdAt: string;
  lastActivatedAt?: string;
}

interface BranchTrackingData {
  branches: TrackedBranch[];
}

async function getTrackedBranches(projectPath: string): Promise<TrackedBranch[]> {
  try {
    const filePath = getBranchTrackingPath(projectPath);
    const content = (await secureFs.readFile(filePath, 'utf-8')) as string;
    const data: BranchTrackingData = JSON.parse(content);
    return data.branches || [];
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    branchTrackingLogger.warn('Failed to read tracked branches:', error);
    return [];
  }
}

async function saveTrackedBranches(projectPath: string, branches: TrackedBranch[]): Promise<void> {
  const dmakerDir = await ensureDmakerDir(projectPath);
  const filePath = path.join(dmakerDir, 'active-branches.json');
  const data: BranchTrackingData = { branches };
  await secureFs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function trackBranch(projectPath: string, branchName: string): Promise<void> {
  const branches = await getTrackedBranches(projectPath);

  const existing = branches.find((b) => b.name === branchName);
  if (existing) {
    return;
  }

  branches.push({
    name: branchName,
    createdAt: new Date().toISOString(),
  });

  await saveTrackedBranches(projectPath, branches);
  branchTrackingLogger.info(`Now tracking branch: ${branchName}`);
}

// ============================================================================
// Init Script helpers
// ============================================================================

const initScriptLogger = createLogger('InitScript');
const INIT_SCRIPT_FILENAME = 'worktree-init.sh';
const MAX_SCRIPT_SIZE_BYTES = 1024 * 1024;

function getInitScriptPath(projectPath: string): string {
  return path.join(projectPath, '.dmaker', INIT_SCRIPT_FILENAME);
}

// ============================================================================
// Generate Commit Message helpers
// ============================================================================

const commitMsgLogger = createLogger('GenerateCommitMessage');
const AI_TIMEOUT_MS = 30_000;

async function* withTimeout<T>(
  generator: AsyncIterable<T>,
  timeoutMs: number
): AsyncGenerator<T, void, unknown> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`AI provider timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  const iterator = generator[Symbol.asyncIterator]();
  let done = false;

  while (!done) {
    const result = await Promise.race([iterator.next(), timeoutPromise]);
    if (result.done) {
      done = true;
    } else {
      yield result.value;
    }
  }
}

async function getCommitMsgSystemPrompt(settingsService?: SettingsService): Promise<string> {
  const settings = await settingsService?.getGlobalSettings();
  const prompts = mergeCommitMessagePrompts(settings?.promptCustomization?.commitMessage);
  return prompts.systemPrompt;
}

interface GenerateCommitMessageRequestBody {
  worktreePath: string;
}

interface GenerateCommitMessageSuccessResponse {
  success: true;
  message: string;
}

interface GenerateCommitMessageErrorResponse {
  success: false;
  error: string;
}

async function extractTextFromStream(
  stream: AsyncIterable<{
    type: string;
    subtype?: string;
    result?: string;
    message?: {
      content?: Array<{ type: string; text?: string }>;
    };
  }>
): Promise<string> {
  let responseText = '';

  for await (const msg of stream) {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) {
          responseText += block.text;
        }
      }
    } else if (msg.type === 'result' && msg.subtype === 'success') {
      responseText = msg.result || responseText;
    }
  }

  return responseText;
}

// ============================================================================
// List worktrees helpers (from worktree/routes/list.ts)
// ============================================================================

const listLogger = createLogger('Worktree');

interface GitHubRemoteCacheEntry {
  status: GitHubRemoteStatus;
  checkedAt: number;
}

const githubRemoteCache = new Map<string, GitHubRemoteCacheEntry>();
const GITHUB_REMOTE_CACHE_TTL_MS = 5 * 60 * 1000;

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  isCurrent: boolean;
  hasWorktree: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
  pr?: WorktreePRInfo;
}

async function getCurrentBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git branch --show-current', { cwd });
    return stdout.trim();
  } catch {
    return '';
  }
}

async function scanWorktreesDirectory(
  projectPath: string,
  knownWorktreePaths: Set<string>
): Promise<Array<{ path: string; branch: string }>> {
  const discovered: Array<{ path: string; branch: string }> = [];
  const worktreesDir = path.join(projectPath, '.worktrees');

  try {
    await secureFs.access(worktreesDir);
  } catch {
    return discovered;
  }

  try {
    const entries = await secureFs.readdir(worktreesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const worktreePath = path.join(worktreesDir, entry.name);
      const normalizedPath = normalizePath(worktreePath);

      if (knownWorktreePaths.has(normalizedPath)) continue;

      const gitPath = path.join(worktreePath, '.git');
      try {
        const gitStat = await secureFs.stat(gitPath);

        if (gitStat.isFile() || gitStat.isDirectory()) {
          const branch = await getCurrentBranch(worktreePath);
          if (branch) {
            listLogger.info(
              `Discovered worktree in .worktrees/ not in git worktree list: ${entry.name} (branch: ${branch})`
            );
            discovered.push({
              path: normalizedPath,
              branch,
            });
          } else {
            try {
              const { stdout: headRef } = await execAsync('git rev-parse --abbrev-ref HEAD', {
                cwd: worktreePath,
              });
              const headBranch = headRef.trim();
              if (headBranch && headBranch !== 'HEAD') {
                listLogger.info(
                  `Discovered worktree in .worktrees/ not in git worktree list: ${entry.name} (branch: ${headBranch})`
                );
                discovered.push({
                  path: normalizedPath,
                  branch: headBranch,
                });
              }
            } catch {
              // Can't determine branch, skip
            }
          }
        }
      } catch {
        // Not a git repo, skip
      }
    }
  } catch (error) {
    listLogger.warn(`Failed to scan .worktrees directory: ${getErrorMessage(error)}`);
  }

  return discovered;
}

async function getGitHubRemoteStatus(projectPath: string): Promise<GitHubRemoteStatus | null> {
  const ghAvailable = await isGhCliAvailable();
  if (!ghAvailable) {
    return null;
  }

  const now = Date.now();
  const cached = githubRemoteCache.get(projectPath);

  if (cached && now - cached.checkedAt < GITHUB_REMOTE_CACHE_TTL_MS) {
    return cached.status;
  }

  const status = await checkGitHubRemote(projectPath);
  githubRemoteCache.set(projectPath, {
    status,
    checkedAt: Date.now(),
  });

  return status;
}

async function fetchGitHubPRs(projectPath: string): Promise<Map<string, WorktreePRInfo>> {
  const prMap = new Map<string, WorktreePRInfo>();

  try {
    const remoteStatus = await getGitHubRemoteStatus(projectPath);

    if (!remoteStatus || !remoteStatus.hasGitHubRemote) {
      return prMap;
    }

    const repoFlag =
      remoteStatus.owner && remoteStatus.repo
        ? `-R ${remoteStatus.owner}/${remoteStatus.repo}`
        : '';

    const { stdout } = await execAsync(
      `gh pr list ${repoFlag} --state open --json number,title,url,state,headRefName,createdAt --limit 1000`,
      { cwd: projectPath, env: execEnv, timeout: 15000 }
    );

    const prs = JSON.parse(stdout || '[]') as Array<{
      number: number;
      title: string;
      url: string;
      state: string;
      headRefName: string;
      createdAt: string;
    }>;

    for (const pr of prs) {
      prMap.set(pr.headRefName, {
        number: pr.number,
        url: pr.url,
        title: pr.title,
        state: pr.state,
        createdAt: pr.createdAt,
      });
    }
  } catch (error) {
    listLogger.warn(`Failed to fetch GitHub PRs: ${getErrorMessage(error)}`);
  }

  return prMap;
}

// ============================================================================
// PR Info types (from worktree/routes/pr-info.ts)
// ============================================================================

const prInfoLogger = createLogger('PRInfo');

export interface PRComment {
  id: number;
  author: string;
  body: string;
  path?: string;
  line?: number;
  createdAt: string;
  isReviewComment: boolean;
}

export interface PRInfo {
  number: number;
  title: string;
  url: string;
  state: string;
  author: string;
  body: string;
  comments: PRComment[];
  reviewComments: PRComment[];
}

// ============================================================================
// Create PR logger
// ============================================================================

const createPRLogger = createLogger('CreatePR');

// ============================================================================
// Open In Editor logger
// ============================================================================

const editorLogger = createLogger('open-in-editor');

// ============================================================================
// Switch Branch helpers
// ============================================================================

async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd });
    const lines = stdout
      .trim()
      .split('\n')
      .filter((line) => {
        if (!line.trim()) return false;
        if (line.includes('.worktrees/') || line.endsWith('.worktrees')) return false;
        return true;
      });
    return lines.length > 0;
  } catch {
    return false;
  }
}

async function getChangesSummary(cwd: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git status --short', { cwd });
    const lines = stdout
      .trim()
      .split('\n')
      .filter((line) => {
        if (!line.trim()) return false;
        if (line.includes('.worktrees/') || line.endsWith('.worktrees')) return false;
        return true;
      });
    if (lines.length === 0) return '';
    if (lines.length <= 5) return lines.join(', ');
    return `${lines.slice(0, 5).join(', ')} and ${lines.length - 5} more files`;
  } catch {
    return 'unknown changes';
  }
}

// ============================================================================
// List Branches types
// ============================================================================

interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

// ============================================================================
// Create worktree helpers (from worktree/routes/create.ts)
// ============================================================================

async function findExistingWorktreeForBranch(
  projectPath: string,
  branchName: string
): Promise<{ path: string; branch: string } | null> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', {
      cwd: projectPath,
    });

    const lines = stdout.split('\n');
    let currentPath: string | null = null;
    let currentBranch: string | null = null;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        currentPath = line.slice(9);
      } else if (line.startsWith('branch ')) {
        currentBranch = line.slice(7).replace('refs/heads/', '');
      } else if (line === '' && currentPath && currentBranch) {
        if (currentBranch === branchName) {
          const resolvedPath = path.isAbsolute(currentPath)
            ? path.resolve(currentPath)
            : path.resolve(projectPath, currentPath);
          return { path: resolvedPath, branch: currentBranch };
        }
        currentPath = null;
        currentBranch = null;
      }
    }

    if (currentPath && currentBranch && currentBranch === branchName) {
      const resolvedPath = path.isAbsolute(currentPath)
        ? path.resolve(currentPath)
        : path.resolve(projectPath, currentPath);
      return { path: resolvedPath, branch: currentBranch };
    }

    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Route Handler Functions
// ============================================================================

function createInfoHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body as {
        projectPath: string;
        featureId: string;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId required',
        });
        return;
      }

      const worktreePath = path.join(projectPath, '.worktrees', featureId);
      try {
        await secureFs.access(worktreePath);
        const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
          cwd: worktreePath,
        });
        res.json({
          success: true,
          worktreePath: normalizePath(worktreePath),
          branchName: stdout.trim(),
        });
      } catch {
        res.json({ success: true, worktreePath: null, branchName: null });
      }
    } catch (error) {
      logError(error, 'Get worktree info failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createStatusHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body as {
        projectPath: string;
        featureId: string;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId required',
        });
        return;
      }

      const worktreePath = path.join(projectPath, '.worktrees', featureId);

      try {
        await secureFs.access(worktreePath);
        const { stdout: status } = await execAsync('git status --porcelain', {
          cwd: worktreePath,
        });
        const files = status
          .split('\n')
          .filter(Boolean)
          .map((line) => line.slice(3));
        const { stdout: diffStat } = await execAsync('git diff --stat', {
          cwd: worktreePath,
        });
        const { stdout: logOutput } = await execAsync('git log --oneline -5 --format="%h %s"', {
          cwd: worktreePath,
        });

        res.json({
          success: true,
          modifiedFiles: files.length,
          files,
          diffStat: diffStat.trim(),
          recentCommits: logOutput.trim().split('\n').filter(Boolean),
        });
      } catch {
        res.json({
          success: true,
          modifiedFiles: 0,
          files: [],
          diffStat: '',
          recentCommits: [],
        });
      }
    } catch (error) {
      logError(error, 'Get worktree status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createListHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, includeDetails, forceRefreshGitHub } = req.body as {
        projectPath: string;
        includeDetails?: boolean;
        forceRefreshGitHub?: boolean;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      if (forceRefreshGitHub) {
        githubRemoteCache.delete(projectPath);
      }

      if (!(await isGitRepo(projectPath))) {
        res.json({ success: true, worktrees: [] });
        return;
      }

      const currentBranch = await getCurrentBranch(projectPath);

      const { stdout } = await execAsync('git worktree list --porcelain', {
        cwd: projectPath,
      });

      const worktrees: WorktreeInfo[] = [];
      const removedWorktrees: Array<{ path: string; branch: string }> = [];
      const lines = stdout.split('\n');
      let current: { path?: string; branch?: string } = {};
      let isFirst = true;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          current.path = normalizePath(line.slice(9));
        } else if (line.startsWith('branch ')) {
          current.branch = line.slice(7).replace('refs/heads/', '');
        } else if (line === '') {
          if (current.path && current.branch) {
            const isMainWorktree = isFirst;
            let worktreeExists = false;
            try {
              await secureFs.access(current.path);
              worktreeExists = true;
            } catch {
              worktreeExists = false;
            }
            if (!isMainWorktree && !worktreeExists) {
              removedWorktrees.push({
                path: current.path,
                branch: current.branch,
              });
            } else {
              worktrees.push({
                path: current.path,
                branch: current.branch,
                isMain: isMainWorktree,
                isCurrent: current.branch === currentBranch,
                hasWorktree: true,
              });
              isFirst = false;
            }
          }
          current = {};
        }
      }

      if (removedWorktrees.length > 0) {
        try {
          await execAsync('git worktree prune', { cwd: projectPath });
        } catch {
          // Prune failed, but we'll still report the removed worktrees
        }
      }

      const knownPaths = new Set(worktrees.map((w) => w.path));
      const discoveredWorktrees = await scanWorktreesDirectory(projectPath, knownPaths);

      for (const discovered of discoveredWorktrees) {
        worktrees.push({
          path: discovered.path,
          branch: discovered.branch,
          isMain: false,
          isCurrent: discovered.branch === currentBranch,
          hasWorktree: true,
        });
      }

      const allMetadata = await readAllWorktreeMetadata(projectPath);

      if (includeDetails) {
        for (const worktree of worktrees) {
          try {
            const { stdout: statusOutput } = await execAsync('git status --porcelain', {
              cwd: worktree.path,
            });
            const changedFiles = statusOutput
              .trim()
              .split('\n')
              .filter((line) => line.trim());
            worktree.hasChanges = changedFiles.length > 0;
            worktree.changedFilesCount = changedFiles.length;
          } catch {
            worktree.hasChanges = false;
            worktree.changedFilesCount = 0;
          }
        }
      }

      const githubPRs = includeDetails
        ? await fetchGitHubPRs(projectPath)
        : new Map<string, WorktreePRInfo>();

      for (const worktree of worktrees) {
        const metadata = allMetadata.get(worktree.branch);
        if (metadata?.pr) {
          worktree.pr = metadata.pr;
        } else if (includeDetails) {
          const githubPR = githubPRs.get(worktree.branch);
          if (githubPR) {
            worktree.pr = githubPR;
          }
        }
      }

      res.json({
        success: true,
        worktrees,
        removedWorktrees: removedWorktrees.length > 0 ? removedWorktrees : undefined,
      });
    } catch (error) {
      logError(error, 'List worktrees failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createDiffsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body as {
        projectPath: string;
        featureId: string;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId required',
        });
        return;
      }

      const worktreePath = path.join(projectPath, '.worktrees', featureId);

      try {
        await secureFs.access(worktreePath);

        const result = await getGitRepositoryDiffs(worktreePath);
        res.json({
          success: true,
          diff: result.diff,
          files: result.files,
          hasChanges: result.hasChanges,
        });
      } catch (innerError) {
        const code = (innerError as NodeJS.ErrnoException | undefined)?.code;
        if (code && code !== 'ENOENT') {
          logError(innerError, 'Worktree access failed, falling back to main project');
        }

        try {
          const result = await getGitRepositoryDiffs(projectPath);
          res.json({
            success: true,
            diff: result.diff,
            files: result.files,
            hasChanges: result.hasChanges,
          });
        } catch (fallbackError) {
          logError(fallbackError, 'Fallback to main project also failed');
          res.json({ success: true, diff: '', files: [], hasChanges: false });
        }
      }
    } catch (error) {
      logError(error, 'Get worktree diffs failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createFileDiffHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, filePath } = req.body as {
        projectPath: string;
        featureId: string;
        filePath: string;
      };

      if (!projectPath || !featureId || !filePath) {
        res.status(400).json({
          success: false,
          error: 'projectPath, featureId, and filePath required',
        });
        return;
      }

      const worktreePath = path.join(projectPath, '.worktrees', featureId);

      try {
        await secureFs.access(worktreePath);

        const { stdout: status } = await execAsync(`git status --porcelain -- "${filePath}"`, {
          cwd: worktreePath,
        });

        const isUntracked = status.trim().startsWith('??');

        let diff: string;
        if (isUntracked) {
          diff = await generateSyntheticDiffForNewFile(worktreePath, filePath);
        } else {
          const result = await execAsync(`git diff HEAD -- "${filePath}"`, {
            cwd: worktreePath,
            maxBuffer: 10 * 1024 * 1024,
          });
          diff = result.stdout;
        }

        res.json({ success: true, diff, filePath });
      } catch (innerError) {
        const code = (innerError as NodeJS.ErrnoException | undefined)?.code;
        if (code && code !== 'ENOENT') {
          logError(innerError, 'Worktree file diff failed');
        }
        res.json({ success: true, diff: '', filePath });
      }
    } catch (error) {
      logError(error, 'Get worktree file diff failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createMergeHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, branchName, worktreePath, options } = req.body as {
        projectPath: string;
        branchName: string;
        worktreePath: string;
        options?: { squash?: boolean; message?: string };
      };

      if (!projectPath || !branchName || !worktreePath) {
        res.status(400).json({
          success: false,
          error: 'projectPath, branchName, and worktreePath are required',
        });
        return;
      }

      try {
        await execAsync(`git rev-parse --verify ${branchName}`, { cwd: projectPath });
      } catch {
        res.status(400).json({
          success: false,
          error: `Branch "${branchName}" does not exist`,
        });
        return;
      }

      const mergeCmd = options?.squash
        ? `git merge --squash ${branchName}`
        : `git merge ${branchName} -m "${options?.message || `Merge ${branchName}`}"`;

      await execAsync(mergeCmd, { cwd: projectPath });

      if (options?.squash) {
        await execAsync(`git commit -m "${options?.message || `Merge ${branchName} (squash)`}"`, {
          cwd: projectPath,
        });
      }

      try {
        await execAsync(`git worktree remove "${worktreePath}" --force`, {
          cwd: projectPath,
        });
        await execAsync(`git branch -D ${branchName}`, { cwd: projectPath });
      } catch {
        // Cleanup errors are non-fatal
      }

      res.json({ success: true, mergedBranch: branchName });
    } catch (error) {
      logError(error, 'Merge worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createCreateHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, branchName, baseBranch } = req.body as {
        projectPath: string;
        branchName: string;
        baseBranch?: string;
      };

      if (!projectPath || !branchName) {
        res.status(400).json({
          success: false,
          error: 'projectPath and branchName required',
        });
        return;
      }

      if (!isValidBranchName(branchName)) {
        res.status(400).json({
          success: false,
          error:
            'Invalid branch name. Branch names must contain only letters, numbers, dots, hyphens, underscores, and forward slashes.',
        });
        return;
      }

      if (baseBranch && !isValidBranchName(baseBranch) && baseBranch !== 'HEAD') {
        res.status(400).json({
          success: false,
          error:
            'Invalid base branch name. Branch names must contain only letters, numbers, dots, hyphens, underscores, and forward slashes.',
        });
        return;
      }

      if (!(await isGitRepo(projectPath))) {
        res.status(400).json({
          success: false,
          error: 'Not a git repository',
        });
        return;
      }

      const gitEnv = {
        GIT_AUTHOR_NAME: 'DMaker',
        GIT_AUTHOR_EMAIL: 'dmaker@localhost',
        GIT_COMMITTER_NAME: 'DMaker',
        GIT_COMMITTER_EMAIL: 'dmaker@localhost',
      };
      await ensureInitialCommit(projectPath, gitEnv);

      const existingWorktree = await findExistingWorktreeForBranch(projectPath, branchName);
      if (existingWorktree) {
        logger.info(
          `Found existing worktree for branch "${branchName}" at: ${existingWorktree.path}`
        );

        await trackBranch(projectPath, branchName);

        res.json({
          success: true,
          worktree: {
            path: normalizePath(existingWorktree.path),
            branch: branchName,
            isNew: false,
          },
        });
        return;
      }

      const sanitizedName = branchName.replace(/[^a-zA-Z0-9_-]/g, '-');
      const worktreesDir = path.join(projectPath, '.worktrees');
      const worktreePath = path.join(worktreesDir, sanitizedName);

      await secureFs.mkdir(worktreesDir, { recursive: true });

      let branchExists = false;
      try {
        await execGitCommand(['rev-parse', '--verify', branchName], projectPath);
        branchExists = true;
      } catch {
        // Branch doesn't exist
      }

      if (branchExists) {
        await execGitCommand(['worktree', 'add', worktreePath, branchName], projectPath);
      } else {
        const base = baseBranch || 'HEAD';
        await execGitCommand(
          ['worktree', 'add', '-b', branchName, worktreePath, base],
          projectPath
        );
      }

      await trackBranch(projectPath, branchName);

      const absoluteWorktreePath = path.resolve(worktreePath);

      res.json({
        success: true,
        worktree: {
          path: normalizePath(absoluteWorktreePath),
          branch: branchName,
          isNew: !branchExists,
        },
      });

      runInitScript({
        projectPath,
        worktreePath: absoluteWorktreePath,
        branch: branchName,
        emitter: events,
      }).catch((err) => {
        logger.error(`Init script failed for ${branchName}:`, err);
      });
    } catch (error) {
      logError(error, 'Create worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createDeleteHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, worktreePath, deleteBranch } = req.body as {
        projectPath: string;
        worktreePath: string;
        deleteBranch?: boolean;
      };

      if (!projectPath || !worktreePath) {
        res.status(400).json({
          success: false,
          error: 'projectPath and worktreePath required',
        });
        return;
      }

      if (!(await isGitRepo(projectPath))) {
        res.status(400).json({
          success: false,
          error: 'Not a git repository',
        });
        return;
      }

      let branchName: string | null = null;
      try {
        const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
          cwd: worktreePath,
        });
        branchName = stdout.trim();
      } catch {
        // Could not get branch name
      }

      try {
        await execGitCommand(['worktree', 'remove', worktreePath, '--force'], projectPath);
      } catch (error) {
        await execGitCommand(['worktree', 'prune'], projectPath);
      }

      let branchDeleted = false;
      if (deleteBranch && branchName && branchName !== 'main' && branchName !== 'master') {
        if (!isValidBranchName(branchName)) {
          logger.warn(`Invalid branch name detected, skipping deletion: ${branchName}`);
        } else {
          try {
            await execGitCommand(['branch', '-D', branchName], projectPath);
            branchDeleted = true;
          } catch {
            logger.warn(`Failed to delete branch: ${branchName}`);
          }
        }
      }

      res.json({
        success: true,
        deleted: {
          worktreePath,
          branch: branchDeleted ? branchName : null,
          branchDeleted,
        },
      });
    } catch (error) {
      logError(error, 'Delete worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createCreatePRHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, projectPath, commitMessage, prTitle, prBody, baseBranch, draft } =
        req.body as {
          worktreePath: string;
          projectPath?: string;
          commitMessage?: string;
          prTitle?: string;
          prBody?: string;
          baseBranch?: string;
          draft?: boolean;
        };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      const effectiveProjectPath = projectPath || worktreePath;

      const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
        env: execEnv,
      });
      const branchName = branchOutput.trim();

      if (!isValidBranchName(branchName)) {
        res.status(400).json({
          success: false,
          error: 'Invalid branch name contains unsafe characters',
        });
        return;
      }

      createPRLogger.debug(`Checking for uncommitted changes in: ${worktreePath}`);
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
        env: execEnv,
      });
      const hasChanges = status.trim().length > 0;
      createPRLogger.debug(`Has uncommitted changes: ${hasChanges}`);
      if (hasChanges) {
        createPRLogger.debug(`Changed files:\n${status}`);
      }

      let commitHash: string | null = null;
      if (hasChanges) {
        const message = commitMessage || `Changes from ${branchName}`;
        createPRLogger.debug(`Committing changes with message: ${message}`);

        try {
          createPRLogger.debug(`Running: git add -A`);
          await execAsync('git add -A', { cwd: worktreePath, env: execEnv });

          createPRLogger.debug(`Running: git commit`);
          await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
            cwd: worktreePath,
            env: execEnv,
          });

          const { stdout: hashOutput } = await execAsync('git rev-parse HEAD', {
            cwd: worktreePath,
            env: execEnv,
          });
          commitHash = hashOutput.trim().substring(0, 8);
          createPRLogger.info(`Commit successful: ${commitHash}`);
        } catch (commitErr: unknown) {
          const err = commitErr as { stderr?: string; message?: string };
          const commitError = err.stderr || err.message || 'Commit failed';
          createPRLogger.error(`Commit failed: ${commitError}`);

          res.status(500).json({
            success: false,
            error: `Failed to commit changes: ${commitError}`,
          });
          return;
        }
      }

      let pushError: string | null = null;
      try {
        await execAsync(`git push -u origin ${branchName}`, {
          cwd: worktreePath,
          env: execEnv,
        });
      } catch (error: unknown) {
        try {
          await execAsync(`git push --set-upstream origin ${branchName}`, {
            cwd: worktreePath,
            env: execEnv,
          });
        } catch (error2: unknown) {
          const err = error2 as { stderr?: string; message?: string };
          pushError = err.stderr || err.message || 'Push failed';
          createPRLogger.error('Push failed:', pushError);
        }
      }

      if (pushError) {
        res.status(500).json({
          success: false,
          error: `Failed to push branch: ${pushError}`,
        });
        return;
      }

      const base = baseBranch || 'main';
      const title = prTitle || branchName;
      const body = prBody || `Changes from branch ${branchName}`;
      const draftFlag = draft ? '--draft' : '';

      let prUrl: string | null = null;
      let prError: string | null = null;
      let browserUrl: string | null = null;
      let ghCliAvailable = false;

      let repoUrl: string | null = null;
      let upstreamRepo: string | null = null;
      let originOwner: string | null = null;
      try {
        const { stdout: remotes } = await execAsync('git remote -v', {
          cwd: worktreePath,
          env: execEnv,
        });

        const remoteLines = remotes.split(/\r?\n/);
        for (const line of remoteLines) {
          let match = line.match(/^(\w+)\s+.*[:/]([^/]+)\/([^/\s]+?)(?:\.git)?\s+\(fetch\)/);
          if (!match) {
            match = line.match(/^(\w+)\s+git@[^:]+:([^/]+)\/([^\s]+?)(?:\.git)?\s+\(fetch\)/);
          }
          if (!match) {
            match = line.match(
              /^(\w+)\s+https?:\/\/[^/]+\/([^/]+)\/([^\s]+?)(?:\.git)?\s+\(fetch\)/
            );
          }

          if (match) {
            const [, remoteName, owner, repo] = match;
            if (remoteName === 'upstream') {
              upstreamRepo = `${owner}/${repo}`;
              repoUrl = `https://github.com/${owner}/${repo}`;
            } else if (remoteName === 'origin') {
              originOwner = owner;
              if (!repoUrl) {
                repoUrl = `https://github.com/${owner}/${repo}`;
              }
            }
          }
        }
      } catch (error) {
        // Couldn't parse remotes
      }

      if (!repoUrl) {
        try {
          const { stdout: originUrl } = await execAsync('git config --get remote.origin.url', {
            cwd: worktreePath,
            env: execEnv,
          });
          const url = originUrl.trim();

          let match = url.match(/[:/]([^/]+)\/([^/\s]+?)(?:\.git)?$/);
          if (match) {
            const [, owner, repo] = match;
            originOwner = owner;
            repoUrl = `https://github.com/${owner}/${repo}`;
          }
        } catch (error) {
          // Failed to get repo URL
        }
      }

      ghCliAvailable = await isGhCliAvailable();

      if (repoUrl) {
        const encodedTitle = encodeURIComponent(title);
        const encodedBody = encodeURIComponent(body);

        if (upstreamRepo && originOwner) {
          browserUrl = `https://github.com/${upstreamRepo}/compare/${base}...${originOwner}:${branchName}?expand=1&title=${encodedTitle}&body=${encodedBody}`;
        } else {
          browserUrl = `${repoUrl}/compare/${base}...${branchName}?expand=1&title=${encodedTitle}&body=${encodedBody}`;
        }
      }

      let prNumber: number | undefined;
      let prAlreadyExisted = false;

      if (ghCliAvailable) {
        const headRef = upstreamRepo && originOwner ? `${originOwner}:${branchName}` : branchName;
        const repoArg = upstreamRepo ? ` --repo "${upstreamRepo}"` : '';

        createPRLogger.debug(
          `Checking for existing PR for branch: ${branchName} (headRef: ${headRef})`
        );
        try {
          const listCmd = `gh pr list${repoArg} --head "${headRef}" --json number,title,url,state --limit 1`;
          createPRLogger.debug(`Running: ${listCmd}`);
          const { stdout: existingPrOutput } = await execAsync(listCmd, {
            cwd: worktreePath,
            env: execEnv,
          });
          createPRLogger.debug(`gh pr list output: ${existingPrOutput}`);

          const existingPrs = JSON.parse(existingPrOutput);

          if (Array.isArray(existingPrs) && existingPrs.length > 0) {
            const existingPr = existingPrs[0];
            createPRLogger.info(
              `PR already exists for branch ${branchName}: PR #${existingPr.number}`
            );
            prUrl = existingPr.url;
            prNumber = existingPr.number;
            prAlreadyExisted = true;

            await updateWorktreePRInfo(effectiveProjectPath, branchName, {
              number: existingPr.number,
              url: existingPr.url,
              title: existingPr.title || title,
              state: existingPr.state || 'open',
              createdAt: new Date().toISOString(),
            });
            createPRLogger.debug(
              `Stored existing PR info for branch ${branchName}: PR #${existingPr.number}`
            );
          } else {
            createPRLogger.debug(`No existing PR found for branch ${branchName}`);
          }
        } catch (listError) {
          createPRLogger.debug(`gh pr list failed (this is ok, will try to create):`, listError);
        }

        if (!prUrl) {
          try {
            let prCmd = `gh pr create --base "${base}"`;

            if (upstreamRepo && originOwner) {
              prCmd += ` --repo "${upstreamRepo}" --head "${originOwner}:${branchName}"`;
            } else {
              prCmd += ` --head "${branchName}"`;
            }

            prCmd += ` --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" ${draftFlag}`;
            prCmd = prCmd.trim();

            createPRLogger.debug(`Creating PR with command: ${prCmd}`);
            const { stdout: prOutput } = await execAsync(prCmd, {
              cwd: worktreePath,
              env: execEnv,
            });
            prUrl = prOutput.trim();
            createPRLogger.info(`PR created: ${prUrl}`);

            if (prUrl) {
              const prMatch = prUrl.match(/\/pull\/(\d+)/);
              prNumber = prMatch ? parseInt(prMatch[1], 10) : undefined;

              if (prNumber) {
                try {
                  await updateWorktreePRInfo(effectiveProjectPath, branchName, {
                    number: prNumber,
                    url: prUrl,
                    title,
                    state: draft ? 'draft' : 'open',
                    createdAt: new Date().toISOString(),
                  });
                  createPRLogger.debug(`Stored PR info for branch ${branchName}: PR #${prNumber}`);
                } catch (metadataError) {
                  createPRLogger.error('Failed to store PR metadata:', metadataError);
                }
              }
            }
          } catch (ghError: unknown) {
            const err = ghError as { stderr?: string; message?: string };
            const errorMessage = err.stderr || err.message || 'PR creation failed';
            createPRLogger.debug(`gh pr create failed: ${errorMessage}`);

            if (errorMessage.toLowerCase().includes('already exists')) {
              createPRLogger.debug(`PR already exists error - trying to fetch existing PR`);
              try {
                const { stdout: viewOutput } = await execAsync(
                  `gh pr view --json number,title,url,state`,
                  { cwd: worktreePath, env: execEnv }
                );
                const existingPr = JSON.parse(viewOutput);
                if (existingPr.url) {
                  prUrl = existingPr.url;
                  prNumber = existingPr.number;
                  prAlreadyExisted = true;

                  await updateWorktreePRInfo(effectiveProjectPath, branchName, {
                    number: existingPr.number,
                    url: existingPr.url,
                    title: existingPr.title || title,
                    state: existingPr.state || 'open',
                    createdAt: new Date().toISOString(),
                  });
                  createPRLogger.debug(`Fetched and stored existing PR: #${existingPr.number}`);
                }
              } catch (viewError) {
                createPRLogger.error('Failed to fetch existing PR:', viewError);
                prError = errorMessage;
              }
            } else {
              prError = errorMessage;
            }
          }
        }
      } else {
        prError = 'gh_cli_not_available';
      }

      res.json({
        success: true,
        result: {
          branch: branchName,
          committed: hasChanges,
          commitHash,
          pushed: true,
          prUrl,
          prNumber,
          prCreated: !!prUrl,
          prAlreadyExisted,
          prError: prError || undefined,
          browserUrl: browserUrl || undefined,
          ghCliAvailable,
        },
      });
    } catch (error) {
      logError(error, 'Create PR failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createPRInfoHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, branchName } = req.body as {
        worktreePath: string;
        branchName: string;
      };

      if (!worktreePath || !branchName) {
        res.status(400).json({
          success: false,
          error: 'worktreePath and branchName required',
        });
        return;
      }

      if (!isValidBranchName(branchName)) {
        res.status(400).json({
          success: false,
          error: 'Invalid branch name contains unsafe characters',
        });
        return;
      }

      const ghCliAvailableVal = await isGhCliAvailable();

      if (!ghCliAvailableVal) {
        res.json({
          success: true,
          result: {
            hasPR: false,
            ghCliAvailable: false,
            error: 'gh CLI not available',
          },
        });
        return;
      }

      let upstreamRepo: string | null = null;
      let originOwner: string | null = null;
      let originRepo: string | null = null;

      try {
        const { stdout: remotes } = await execAsync('git remote -v', {
          cwd: worktreePath,
          env: execEnv,
        });

        const remoteLines = remotes.split(/\r?\n/);
        for (const line of remoteLines) {
          let match =
            line.match(/^(\w+)\s+.*[:/]([^/]+)\/([^/\s]+?)(?:\.git)?\s+\(fetch\)/) ||
            line.match(/^(\w+)\s+git@[^:]+:([^/]+)\/([^\s]+?)(?:\.git)?\s+\(fetch\)/) ||
            line.match(/^(\w+)\s+https?:\/\/[^/]+\/([^/]+)\/([^\s]+?)(?:\.git)?\s+\(fetch\)/);

          if (match) {
            const [, remoteName, owner, repo] = match;
            if (remoteName === 'upstream') {
              upstreamRepo = `${owner}/${repo}`;
            } else if (remoteName === 'origin') {
              originOwner = owner;
              originRepo = repo;
            }
          }
        }
      } catch {
        // Ignore remote parsing errors
      }

      if (!originOwner || !originRepo) {
        try {
          const { stdout: originUrl } = await execAsync('git config --get remote.origin.url', {
            cwd: worktreePath,
            env: execEnv,
          });
          const match = originUrl.trim().match(/[:/]([^/]+)\/([^/\s]+?)(?:\.git)?$/);
          if (match) {
            if (!originOwner) {
              originOwner = match[1];
            }
            if (!originRepo) {
              originRepo = match[2];
            }
          }
        } catch {
          // Ignore fallback errors
        }
      }

      const targetRepo =
        upstreamRepo || (originOwner && originRepo ? `${originOwner}/${originRepo}` : null);
      const repoFlag = targetRepo ? ` --repo "${targetRepo}"` : '';
      const headRef = upstreamRepo && originOwner ? `${originOwner}:${branchName}` : branchName;

      try {
        const listCmd = `gh pr list${repoFlag} --head "${headRef}" --json number,title,url,state,author,body --limit 1`;
        const { stdout: prListOutput } = await execAsync(listCmd, {
          cwd: worktreePath,
          env: execEnv,
        });

        const prList = JSON.parse(prListOutput);

        if (prList.length === 0) {
          res.json({
            success: true,
            result: {
              hasPR: false,
              ghCliAvailable: true,
            },
          });
          return;
        }

        const pr = prList[0];
        const prNumber = pr.number;

        let comments: PRComment[] = [];
        try {
          const viewCmd = `gh pr view ${prNumber}${repoFlag} --json comments`;
          const { stdout: commentsOutput } = await execAsync(viewCmd, {
            cwd: worktreePath,
            env: execEnv,
          });
          const commentsData = JSON.parse(commentsOutput);
          comments = (commentsData.comments || []).map(
            (c: { id: number; author: { login: string }; body: string; createdAt: string }) => ({
              id: c.id,
              author: c.author?.login || 'unknown',
              body: c.body,
              createdAt: c.createdAt,
              isReviewComment: false,
            })
          );
        } catch (error) {
          prInfoLogger.warn('Failed to fetch PR comments:', error);
        }

        let reviewComments: PRComment[] = [];
        if (targetRepo) {
          try {
            const reviewsEndpoint = `repos/${targetRepo}/pulls/${prNumber}/comments`;
            const reviewsCmd = `gh api ${reviewsEndpoint}`;
            const { stdout: reviewsOutput } = await execAsync(reviewsCmd, {
              cwd: worktreePath,
              env: execEnv,
            });
            const reviewsData = JSON.parse(reviewsOutput);
            reviewComments = reviewsData.map(
              (c: {
                id: number;
                user: { login: string };
                body: string;
                path: string;
                line?: number;
                original_line?: number;
                created_at: string;
              }) => ({
                id: c.id,
                author: c.user?.login || 'unknown',
                body: c.body,
                path: c.path,
                line: c.line || c.original_line,
                createdAt: c.created_at,
                isReviewComment: true,
              })
            );
          } catch (error) {
            prInfoLogger.warn('Failed to fetch review comments:', error);
          }
        } else {
          prInfoLogger.warn('Cannot fetch review comments: repository info not available');
        }

        const prInfo: PRInfo = {
          number: prNumber,
          title: pr.title,
          url: pr.url,
          state: pr.state,
          author: pr.author?.login || 'unknown',
          body: pr.body || '',
          comments,
          reviewComments,
        };

        res.json({
          success: true,
          result: {
            hasPR: true,
            ghCliAvailable: true,
            prInfo,
          },
        });
      } catch (error) {
        logError(error, 'Failed to get PR info');
        res.json({
          success: true,
          result: {
            hasPR: false,
            ghCliAvailable: true,
            error: getErrorMessage(error),
          },
        });
      }
    } catch (error) {
      logError(error, 'PR info handler failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createCommitHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, message } = req.body as {
        worktreePath: string;
        message: string;
      };

      if (!worktreePath || !message) {
        res.status(400).json({
          success: false,
          error: 'worktreePath and message required',
        });
        return;
      }

      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
      });

      if (!status.trim()) {
        res.json({
          success: true,
          result: {
            committed: false,
            message: 'No changes to commit',
          },
        });
        return;
      }

      await execAsync('git add -A', { cwd: worktreePath });

      await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
        cwd: worktreePath,
      });

      const { stdout: hashOutput } = await execAsync('git rev-parse HEAD', {
        cwd: worktreePath,
      });
      const commitHash = hashOutput.trim().substring(0, 8);

      const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
      });
      const branchName = branchOutput.trim();

      res.json({
        success: true,
        result: {
          committed: true,
          commitHash,
          branch: branchName,
          message,
        },
      });
    } catch (error) {
      logError(error, 'Commit worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createGenerateCommitMessageHandler(
  settingsService?: SettingsService
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as GenerateCommitMessageRequestBody;

      if (!worktreePath || typeof worktreePath !== 'string') {
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'worktreePath is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      if (!existsSync(worktreePath)) {
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'worktreePath does not exist',
        };
        res.status(400).json(response);
        return;
      }

      const gitPath = join(worktreePath, '.git');
      if (!existsSync(gitPath)) {
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'worktreePath is not a git repository',
        };
        res.status(400).json(response);
        return;
      }

      commitMsgLogger.info(`Generating commit message for worktree: ${worktreePath}`);

      let diff = '';
      try {
        const { stdout: stagedDiff } = await execAsync('git diff --cached', {
          cwd: worktreePath,
          maxBuffer: 1024 * 1024 * 5,
        });

        if (!stagedDiff.trim()) {
          const { stdout: unstagedDiff } = await execAsync('git diff', {
            cwd: worktreePath,
            maxBuffer: 1024 * 1024 * 5,
          });
          diff = unstagedDiff;
        } else {
          diff = stagedDiff;
        }
      } catch (error) {
        commitMsgLogger.error('Failed to get git diff:', error);
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'Failed to get git changes',
        };
        res.status(500).json(response);
        return;
      }

      if (!diff.trim()) {
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'No changes to commit',
        };
        res.status(400).json(response);
        return;
      }

      const truncatedDiff =
        diff.length > 10000 ? diff.substring(0, 10000) + '\n\n[... diff truncated ...]' : diff;

      const userPrompt = `Generate a commit message for these changes:\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\``;

      const settings = await settingsService?.getGlobalSettings();
      const phaseModelEntry =
        settings?.phaseModels?.commitMessageModel || DEFAULT_PHASE_MODELS.commitMessageModel;
      const { model } = resolvePhaseModel(phaseModelEntry);

      commitMsgLogger.info(`Using model for commit message: ${model}`);

      const systemPrompt = await getCommitMsgSystemPrompt(settingsService);

      let message: string;

      if (isCursorModel(model)) {
        commitMsgLogger.info(`Using Cursor provider for model: ${model}`);

        const provider = ProviderFactory.getProviderForModel(model);
        const bareModel = stripProviderPrefix(model);

        const cursorPrompt = `${systemPrompt}\n\n${userPrompt}`;

        let responseText = '';
        const cursorStream = provider.executeQuery({
          prompt: cursorPrompt,
          model: bareModel,
          cwd: worktreePath,
          maxTurns: 1,
          allowedTools: [],
          readOnly: true,
        });

        for await (const msg of withTimeout(cursorStream, AI_TIMEOUT_MS)) {
          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'text' && block.text) {
                responseText += block.text;
              }
            }
          }
        }

        message = responseText.trim();
      } else {
        const stream = query({
          prompt: userPrompt,
          options: {
            model,
            systemPrompt,
            maxTurns: 1,
            allowedTools: [],
            permissionMode: 'default',
          },
        });

        message = await extractTextFromStream(withTimeout(stream, AI_TIMEOUT_MS));
      }

      if (!message || message.trim().length === 0) {
        commitMsgLogger.warn('Received empty response from model');
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'Failed to generate commit message - empty response',
        };
        res.status(500).json(response);
        return;
      }

      commitMsgLogger.info(`Generated commit message: ${message.trim().substring(0, 100)}...`);

      const response: GenerateCommitMessageSuccessResponse = {
        success: true,
        message: message.trim(),
      };
      res.json(response);
    } catch (error) {
      logError(error, 'Generate commit message failed');
      const response: GenerateCommitMessageErrorResponse = {
        success: false,
        error: getErrorMessage(error),
      };
      res.status(500).json(response);
    }
  };
}

function createPushHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, force } = req.body as {
        worktreePath: string;
        force?: boolean;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
      });
      const branchName = branchOutput.trim();

      const forceFlag = force ? '--force' : '';
      try {
        await execAsync(`git push -u origin ${branchName} ${forceFlag}`, {
          cwd: worktreePath,
        });
      } catch {
        await execAsync(`git push --set-upstream origin ${branchName} ${forceFlag}`, {
          cwd: worktreePath,
        });
      }

      res.json({
        success: true,
        result: {
          branch: branchName,
          pushed: true,
          message: `Successfully pushed ${branchName} to origin`,
        },
      });
    } catch (error) {
      logError(error, 'Push worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createPullHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as {
        worktreePath: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
      });
      const branchName = branchOutput.trim();

      await execAsync('git fetch origin', { cwd: worktreePath });

      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
      });
      const hasLocalChanges = status.trim().length > 0;

      if (hasLocalChanges) {
        res.status(400).json({
          success: false,
          error: 'You have local changes. Please commit them before pulling.',
        });
        return;
      }

      try {
        const { stdout: pullOutput } = await execAsync(`git pull origin ${branchName}`, {
          cwd: worktreePath,
        });

        const alreadyUpToDate = pullOutput.includes('Already up to date');

        res.json({
          success: true,
          result: {
            branch: branchName,
            pulled: !alreadyUpToDate,
            message: alreadyUpToDate ? 'Already up to date' : 'Pulled latest changes',
          },
        });
      } catch (pullError: unknown) {
        const err = pullError as { stderr?: string; message?: string };
        const errorMsg = err.stderr || err.message || 'Pull failed';

        if (errorMsg.includes('no tracking information')) {
          res.status(400).json({
            success: false,
            error: `Branch '${branchName}' has no upstream branch. Push it first or set upstream with: git branch --set-upstream-to=origin/${branchName}`,
          });
          return;
        }

        res.status(500).json({
          success: false,
          error: errorMsg,
        });
      }
    } catch (error) {
      logError(error, 'Pull failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createCheckoutBranchHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, branchName } = req.body as {
        worktreePath: string;
        branchName: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      if (!branchName) {
        res.status(400).json({
          success: false,
          error: 'branchName required',
        });
        return;
      }

      const invalidChars = /[\s~^:?*\[\\]/;
      if (invalidChars.test(branchName)) {
        res.status(400).json({
          success: false,
          error: 'Branch name contains invalid characters',
        });
        return;
      }

      const { stdout: currentBranchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
      });
      const currentBranch = currentBranchOutput.trim();

      try {
        await execAsync(`git rev-parse --verify ${branchName}`, {
          cwd: worktreePath,
        });
        res.status(400).json({
          success: false,
          error: `Branch '${branchName}' already exists`,
        });
        return;
      } catch {
        // Branch doesn't exist, good to create
      }

      await execAsync(`git checkout -b ${branchName}`, {
        cwd: worktreePath,
      });

      res.json({
        success: true,
        result: {
          previousBranch: currentBranch,
          newBranch: branchName,
          message: `Created and checked out branch '${branchName}'`,
        },
      });
    } catch (error) {
      logError(error, 'Checkout branch failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createListBranchesHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, includeRemote = false } = req.body as {
        worktreePath: string;
        includeRemote?: boolean;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      const { stdout: currentBranchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
      });
      const currentBranch = currentBranchOutput.trim();

      const { stdout: branchesOutput } = await execAsync('git branch --format="%(refname:short)"', {
        cwd: worktreePath,
      });

      const branches: BranchInfo[] = branchesOutput
        .trim()
        .split('\n')
        .filter((b) => b.trim())
        .map((name) => {
          const cleanName = name.trim().replace(/^['"]|['"]$/g, '');
          return {
            name: cleanName,
            isCurrent: cleanName === currentBranch,
            isRemote: false,
          };
        });

      if (includeRemote) {
        try {
          try {
            await execAsync('git fetch --all --quiet', {
              cwd: worktreePath,
              timeout: 10000,
            });
          } catch {
            // Ignore fetch errors
          }

          const { stdout: remoteBranchesOutput } = await execAsync(
            'git branch -r --format="%(refname:short)"',
            { cwd: worktreePath }
          );

          const localBranchNames = new Set(branches.map((b) => b.name));

          remoteBranchesOutput
            .trim()
            .split('\n')
            .filter((b) => b.trim())
            .forEach((name) => {
              const cleanName = name.trim().replace(/^['"]|['"]$/g, '');
              if (cleanName.includes('/HEAD')) return;

              if (!localBranchNames.has(cleanName)) {
                branches.push({
                  name: cleanName,
                  isCurrent: false,
                  isRemote: true,
                });
              }
            });
        } catch {
          // Ignore errors fetching remote branches
        }
      }

      let aheadCount = 0;
      let behindCount = 0;
      try {
        const { stdout: upstreamOutput } = await execAsync(
          `git rev-parse --abbrev-ref ${currentBranch}@{upstream}`,
          { cwd: worktreePath }
        );

        if (upstreamOutput.trim()) {
          const { stdout: aheadBehindOutput } = await execAsync(
            `git rev-list --left-right --count ${currentBranch}@{upstream}...HEAD`,
            { cwd: worktreePath }
          );
          const [behind, ahead] = aheadBehindOutput.trim().split(/\s+/).map(Number);
          aheadCount = ahead || 0;
          behindCount = behind || 0;
        }
      } catch {
        // No upstream branch set
      }

      res.json({
        success: true,
        result: {
          currentBranch,
          branches,
          aheadCount,
          behindCount,
        },
      });
    } catch (error) {
      const worktreePath = req.body?.worktreePath;
      logWorktreeError(error, 'List branches failed', worktreePath);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createSwitchBranchHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, branchName } = req.body as {
        worktreePath: string;
        branchName: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      if (!branchName) {
        res.status(400).json({
          success: false,
          error: 'branchName required',
        });
        return;
      }

      const { stdout: currentBranchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
      });
      const previousBranch = currentBranchOutput.trim();

      if (previousBranch === branchName) {
        res.json({
          success: true,
          result: {
            previousBranch,
            currentBranch: branchName,
            message: `Already on branch '${branchName}'`,
          },
        });
        return;
      }

      try {
        await execAsync(`git rev-parse --verify ${branchName}`, {
          cwd: worktreePath,
        });
      } catch {
        res.status(400).json({
          success: false,
          error: `Branch '${branchName}' does not exist`,
        });
        return;
      }

      if (await hasUncommittedChanges(worktreePath)) {
        const summary = await getChangesSummary(worktreePath);
        res.status(400).json({
          success: false,
          error: `Cannot switch branches: you have uncommitted changes (${summary}). Please commit your changes first.`,
          code: 'UNCOMMITTED_CHANGES',
        });
        return;
      }

      await execAsync(`git checkout "${branchName}"`, { cwd: worktreePath });

      res.json({
        success: true,
        result: {
          previousBranch,
          currentBranch: branchName,
          message: `Switched to branch '${branchName}'`,
        },
      });
    } catch (error) {
      logError(error, 'Switch branch failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createOpenInEditorHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, editorCommand } = req.body as {
        worktreePath: string;
        editorCommand?: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      if (!isAbsolute(worktreePath)) {
        res.status(400).json({
          success: false,
          error: 'worktreePath must be an absolute path',
        });
        return;
      }

      try {
        const result = await openInEditor(worktreePath, editorCommand);
        res.json({
          success: true,
          result: {
            message: `Opened ${worktreePath} in ${result.editorName}`,
            editorName: result.editorName,
          },
        });
      } catch (editorError) {
        editorLogger.warn(
          `Failed to open in editor, falling back to file manager: ${getErrorMessage(editorError)}`
        );

        try {
          const result = await openInFileManager(worktreePath);
          res.json({
            success: true,
            result: {
              message: `Opened ${worktreePath} in ${result.editorName}`,
              editorName: result.editorName,
            },
          });
        } catch (fallbackError) {
          throw fallbackError;
        }
      }
    } catch (error) {
      logError(error, 'Open in editor failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createGetDefaultEditorHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const editor = await detectDefaultEditor();
      res.json({
        success: true,
        result: {
          editorName: editor.name,
          editorCommand: editor.command,
        },
      });
    } catch (error) {
      logError(error, 'Get default editor failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createGetAvailableEditorsHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const editors = await detectAllEditors();
      res.json({
        success: true,
        result: {
          editors,
        },
      });
    } catch (error) {
      logError(error, 'Get available editors failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createRefreshEditorsHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      clearEditorCache();

      const editors = await detectAllEditors();

      editorLogger.info(`Editor cache refreshed, found ${editors.length} editors`);

      res.json({
        success: true,
        result: {
          editors,
          message: `Found ${editors.length} available editors`,
        },
      });
    } catch (error) {
      logError(error, 'Refresh editors failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createInitGitHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as {
        projectPath: string;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath required',
        });
        return;
      }

      const gitDirPath = join(projectPath, '.git');
      try {
        await secureFs.access(gitDirPath);
        res.json({
          success: true,
          result: {
            initialized: false,
            message: 'Git repository already exists',
          },
        });
        return;
      } catch {
        // .git doesn't exist, continue
      }

      await execAsync(`git init && git commit --allow-empty -m "Initial commit"`, {
        cwd: projectPath,
      });

      res.json({
        success: true,
        result: {
          initialized: true,
          message: 'Git repository initialized with initial commit',
        },
      });
    } catch (error) {
      logError(error, 'Init git failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createMigrateHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    const { projectPath } = req.body as { projectPath: string };

    if (!projectPath) {
      res.status(400).json({
        success: false,
        error: 'projectPath is required',
      });
      return;
    }

    const dmakerDir = getDmakerDir(projectPath);
    res.json({
      success: true,
      migrated: false,
      message: 'No migration needed - .dmaker is stored in project directory',
      path: dmakerDir,
    });
  };
}

function createStartDevHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, worktreePath } = req.body as {
        projectPath: string;
        worktreePath: string;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath is required',
        });
        return;
      }

      const devServerService = getDevServerService();
      const result = await devServerService.startDevServer(projectPath, worktreePath);

      if (result.success && result.result) {
        res.json({
          success: true,
          result: {
            worktreePath: result.result.worktreePath,
            port: result.result.port,
            url: result.result.url,
            message: result.result.message,
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to start dev server',
        });
      }
    } catch (error) {
      logError(error, 'Start dev server failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createStopDevHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as {
        worktreePath: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath is required',
        });
        return;
      }

      const devServerService = getDevServerService();
      const result = await devServerService.stopDevServer(worktreePath);

      if (result.success && result.result) {
        res.json({
          success: true,
          result: {
            worktreePath: result.result.worktreePath,
            message: result.result.message,
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to stop dev server',
        });
      }
    } catch (error) {
      logError(error, 'Stop dev server failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createListDevServersHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const devServerService = getDevServerService();
      const result = devServerService.listDevServers();

      res.json({
        success: true,
        result: {
          servers: result.result.servers,
        },
      });
    } catch (error) {
      logError(error, 'List dev servers failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createGetDevServerLogsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.query as {
        worktreePath?: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath query parameter is required',
        });
        return;
      }

      const devServerService = getDevServerService();
      const result = devServerService.getServerLogs(worktreePath);

      if (result.success && result.result) {
        res.json({
          success: true,
          result: {
            worktreePath: result.result.worktreePath,
            port: result.result.port,
            url: result.result.url,
            logs: result.result.logs,
            startedAt: result.result.startedAt,
          },
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error || 'Failed to get dev server logs',
        });
      }
    } catch (error) {
      logError(error, 'Get dev server logs failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createGetInitScriptHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const rawProjectPath = req.query.projectPath;

      if (!rawProjectPath || typeof rawProjectPath !== 'string') {
        res.status(400).json({
          success: false,
          error: 'projectPath query parameter is required',
        });
        return;
      }

      const projectPath = rawProjectPath.trim();
      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath cannot be empty',
        });
        return;
      }

      const scriptPath = getInitScriptPath(projectPath);

      try {
        const content = await secureFs.readFile(scriptPath, 'utf-8');
        res.json({
          success: true,
          exists: true,
          content: content as string,
          path: scriptPath,
        });
      } catch {
        res.json({
          success: true,
          exists: false,
          content: '',
          path: scriptPath,
        });
      }
    } catch (error) {
      logError(error, 'Read init script failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

function createPutInitScriptHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, content } = req.body as {
        projectPath: string;
        content: string;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      if (typeof content !== 'string') {
        res.status(400).json({
          success: false,
          error: 'content must be a string',
        });
        return;
      }

      const sizeBytes = Buffer.byteLength(content, 'utf-8');
      if (sizeBytes > MAX_SCRIPT_SIZE_BYTES) {
        res.status(400).json({
          success: false,
          error: `Script size (${Math.round(sizeBytes / 1024)}KB) exceeds maximum allowed size (${Math.round(MAX_SCRIPT_SIZE_BYTES / 1024)}KB)`,
        });
        return;
      }

      const dangerousPatterns = [
        /rm\s+-rf\s+\/(?!\s*\$)/i,
        /curl\s+.*\|\s*(?:bash|sh)/i,
        /wget\s+.*\|\s*(?:bash|sh)/i,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(content)) {
          initScriptLogger.warn(
            `Init script contains potentially dangerous pattern: ${pattern.source}. User responsibility to verify script safety.`
          );
        }
      }

      const scriptPath = getInitScriptPath(projectPath);
      const dmakerDir = path.dirname(scriptPath);

      await secureFs.mkdir(dmakerDir, { recursive: true });

      await secureFs.writeFile(scriptPath, content, 'utf-8');

      initScriptLogger.info(`Wrote init script to ${scriptPath}`);

      res.json({
        success: true,
        path: scriptPath,
      });
    } catch (error) {
      logError(error, 'Write init script failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

function createDeleteInitScriptHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      const scriptPath = getInitScriptPath(projectPath);

      await secureFs.rm(scriptPath, { force: true });
      initScriptLogger.info(`Deleted init script at ${scriptPath}`);
      res.json({
        success: true,
      });
    } catch (error) {
      logError(error, 'Delete init script failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

function createRunInitScriptHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, worktreePath, branch } = req.body as {
        projectPath: string;
        worktreePath: string;
        branch: string;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath is required',
        });
        return;
      }

      if (!branch) {
        res.status(400).json({
          success: false,
          error: 'branch is required',
        });
        return;
      }

      if (!isValidBranchName(branch)) {
        res.status(400).json({
          success: false,
          error:
            'Invalid branch name. Branch names must contain only letters, numbers, dots, hyphens, underscores, and forward slashes.',
        });
        return;
      }

      const scriptPath = getInitScriptPath(projectPath);

      try {
        await secureFs.access(scriptPath);
      } catch {
        res.status(404).json({
          success: false,
          error: 'No init script found. Create one in Settings > Worktrees.',
        });
        return;
      }

      initScriptLogger.info(`Running init script for branch "${branch}" (forced)`);

      forceRunInitScript({
        projectPath,
        worktreePath,
        branch,
        emitter: events,
      });

      res.json({
        success: true,
        message: 'Init script started',
      });
    } catch (error) {
      logError(error, 'Run init script failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

// ============================================================================
// Router Factory
// ============================================================================

export function createWorktreeRoutes(
  events: EventEmitter,
  settingsService?: SettingsService
): Router {
  const router = Router();

  router.post('/info', validatePathParams('projectPath'), createInfoHandler());
  router.post('/status', validatePathParams('projectPath'), createStatusHandler());
  router.post('/list', createListHandler());
  router.post('/diffs', validatePathParams('projectPath'), createDiffsHandler());
  router.post('/file-diff', validatePathParams('projectPath', 'filePath'), createFileDiffHandler());
  router.post(
    '/merge',
    validatePathParams('projectPath'),
    requireValidProject,
    createMergeHandler()
  );
  router.post('/create', validatePathParams('projectPath'), createCreateHandler(events));
  router.post('/delete', validatePathParams('projectPath', 'worktreePath'), createDeleteHandler());
  router.post('/create-pr', createCreatePRHandler());
  router.post('/pr-info', createPRInfoHandler());
  router.post(
    '/commit',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createCommitHandler()
  );
  router.post(
    '/generate-commit-message',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createGenerateCommitMessageHandler(settingsService)
  );
  router.post(
    '/push',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createPushHandler()
  );
  router.post(
    '/pull',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createPullHandler()
  );
  router.post('/checkout-branch', requireValidWorktree, createCheckoutBranchHandler());
  router.post(
    '/list-branches',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createListBranchesHandler()
  );
  router.post('/switch-branch', requireValidWorktree, createSwitchBranchHandler());
  router.post('/open-in-editor', validatePathParams('worktreePath'), createOpenInEditorHandler());
  router.get('/default-editor', createGetDefaultEditorHandler());
  router.get('/available-editors', createGetAvailableEditorsHandler());
  router.post('/refresh-editors', createRefreshEditorsHandler());
  router.post('/init-git', validatePathParams('projectPath'), createInitGitHandler());
  router.post('/migrate', createMigrateHandler());
  router.post(
    '/start-dev',
    validatePathParams('projectPath', 'worktreePath'),
    createStartDevHandler()
  );
  router.post('/stop-dev', createStopDevHandler());
  router.post('/list-dev-servers', createListDevServersHandler());
  router.get(
    '/dev-server-logs',
    validatePathParams('worktreePath'),
    createGetDevServerLogsHandler()
  );

  // Init script routes
  router.get('/init-script', createGetInitScriptHandler());
  router.put('/init-script', validatePathParams('projectPath'), createPutInitScriptHandler());
  router.delete('/init-script', validatePathParams('projectPath'), createDeleteInitScriptHandler());
  router.post(
    '/run-init-script',
    validatePathParams('projectPath', 'worktreePath'),
    createRunInitScriptHandler(events)
  );

  return router;
}
