/**
 * GitHubSyncService - Manages GitHub Issue claim/unclaim and assignee sync
 *
 * Provides:
 * - Claim an issue (assign current gh user on GitHub + update local feature)
 * - Unclaim an issue (remove current gh user from GitHub + update local feature)
 * - canExecute() check: blocks execution if someone else is assigned
 * - Sync assignee data from GitHub onto local feature
 */

import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@dmaker/utils';
import { getExtendedPath } from '@dmaker/platform';
import type { Feature } from '@dmaker/types';
import type { EventEmitter } from '../lib/events.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const logger = createLogger('GitHubSync');

const execEnv = {
  ...process.env,
  PATH: getExtendedPath(),
};

/** Machine-readable classification of a failed `gh` invocation. */
export type GhErrorCode = 'no-remote' | 'not-authenticated' | 'gh-missing' | 'unknown';

/**
 * Turn a failed `gh` invocation into something a user (and the UI) can act on.
 *
 * child_process rejects with `Command failed: <the whole command>` and appends
 * whatever gh wrote to stderr, so the actionable line ends up buried behind the
 * echoed command. Pull the stderr out and map the failures we know about onto
 * concrete advice plus a code callers can branch on.
 */
function classifyGhError(err: unknown): { code: GhErrorCode; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const { stderr, stdout, code } = (err ?? {}) as {
    stderr?: unknown;
    stdout?: unknown;
    code?: unknown;
  };
  // gh writes most failures to stderr, but not all of them — some land on
  // stdout, and a few exit non-zero saying nothing at all. Fall back through
  // each in turn so the user never just gets their own command echoed back.
  const detail =
    (typeof stderr === 'string' && stderr.trim()) ||
    (typeof stdout === 'string' && stdout.trim()) ||
    raw.replace(/^Command failed:.*(\r?\n)?/, '').trim() ||
    (code !== undefined ? raw + ' (exit code ' + String(code) + ')' : raw);

  if (
    /no git remotes found|not a git repository|could not determine base repository/i.test(detail)
  ) {
    return {
      code: 'no-remote',
      message:
        "This project has no GitHub repository behind it, so GitHub issues can't be created for it.",
    };
  }
  if (/gh auth login|not logged into|authentication token|requires authentication/i.test(detail)) {
    return {
      code: 'not-authenticated',
      message: 'The GitHub CLI is not authenticated. Run `gh auth login` and try again.',
    };
  }
  if (/\bgh\b[^\n]*(?:is not recognized|command not found)/i.test(detail)) {
    return {
      code: 'gh-missing',
      message:
        'The GitHub CLI (gh) was not found on PATH. Install it from https://cli.github.com and try again.',
    };
  }
  return { code: 'unknown', message: detail };
}

function describeGhError(err: unknown): string {
  return classifyGhError(err).message;
}

export interface GitHubIssueData {
  number: number;
  url: string;
  assignees: string[];
  labels: string[];
  state: 'open' | 'closed';
  syncedAt: string;
}

export interface CanExecuteResult {
  allowed: boolean;
  reason?: 'claimed_by_other' | 'no_github';
  claimedBy?: string;
}

/**
 * Why an agent is not permitted to modify files for a task.
 *
 * Ownership lives on GitHub, not locally: a task is owned when its linked
 * issue is assigned to you. Anything else — no issue at all, an issue held by
 * a colleague, or a `gh` that cannot say who we are — means we cannot prove
 * the work is ours to do, so writes stay shut.
 */
export type WriteDenyReason =
  | 'no_issue'
  | 'no_identity'
  | 'unclaimed'
  | 'owned_by_other'
  | 'claim_failed';

export interface FeatureOwnership {
  /** May the agent modify files for this task? */
  canWrite: boolean;
  /** The login holding the task, when there is one. */
  owner?: string;
  /** Set whenever `canWrite` is false. */
  reason?: WriteDenyReason;
  /** `reason` in prose — safe to show in the UI or hand to the agent. */
  message?: string;
  /** True when this very call is what assigned the task to the current user. */
  autoClaimed?: boolean;
}

/**
 * The login holding `feature` on GitHub, when it is someone other than
 * `currentUser` — otherwise null.
 *
 * Three things can mark a task as taken, in descending authority: an
 * `owner-{login}` label, an `in-progress-{login}` label, and the issue's own
 * assignees. The labels exist so a team can pin ownership independently of
 * GitHub's assignee list, so they are checked first.
 */
function findOtherHolder(feature: Feature, currentUser: string): string | null {
  const labels = feature.githubIssue?.labels ?? [];

  for (const prefix of ['owner-', 'in-progress-'] as const) {
    const label = labels.find((entry) => entry.startsWith(prefix));
    if (!label) continue;
    const login = label.slice(prefix.length);
    if (login && login !== currentUser) return login;
  }

  const assignees = feature.githubIssue?.assignees ?? [];
  if (assignees.length === 0 || assignees.includes(currentUser)) return null;

  return assignees[0];
}

/** Prose for each denial, written for whoever has to read it. */
function describeDenial(reason: WriteDenyReason, owner?: string): string {
  switch (reason) {
    case 'no_issue':
      return 'This task has no GitHub issue behind it, so nobody can own it. File an issue for the task before it can change any files.';
    case 'no_identity':
      return 'The GitHub CLI could not say who you are, so ownership of this task cannot be verified. Run `gh auth login` and try again.';
    case 'unclaimed':
      return 'Nobody has claimed this task yet. Claim its GitHub issue before it can change any files.';
    case 'owned_by_other':
      return `This task belongs to ${owner ?? 'someone else'} on GitHub. Only its owner may change files for it.`;
    case 'claim_failed':
      return 'The task was unclaimed but assigning it to you did not stick, so ownership is unproven and files stay locked.';
  }
}

export class GitHubSyncService {
  private events: EventEmitter;
  /** Cache: projectPath -> github username */
  private userCache = new Map<string, string | null>();

  constructor(events: EventEmitter) {
    this.events = events;
  }

  /**
   * Get the GitHub username for the authenticated gh CLI user.
   * Cached per process lifetime.
   */
  async getCurrentUser(projectPath: string): Promise<string | null> {
    if (this.userCache.has(projectPath)) {
      return this.userCache.get(projectPath) ?? null;
    }
    try {
      const { stdout } = await execAsync('gh api user --jq ".login"', {
        cwd: projectPath,
        env: execEnv,
        timeout: 10000,
      });
      const user = stdout.trim() || null;
      this.userCache.set(projectPath, user);
      return user;
    } catch {
      this.userCache.set(projectPath, null);
      return null;
    }
  }

  /**
   * Fetch latest issue data from GitHub.
   */
  async syncIssueData(projectPath: string, issueNumber: number): Promise<GitHubIssueData | null> {
    try {
      const { stdout } = await execAsync(
        `gh issue view ${issueNumber} --json number,url,assignees,labels,state`,
        { cwd: projectPath, env: execEnv, timeout: 15000 }
      );
      const raw = JSON.parse(stdout);
      return {
        number: raw.number,
        url: raw.url,
        assignees: (raw.assignees as { login: string }[]).map((a) => a.login),
        labels: (raw.labels as { name: string }[]).map((l) => l.name),
        state: raw.state?.toLowerCase() === 'closed' ? 'closed' : 'open',
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.warn(`Failed to sync issue #${issueNumber}:`, err);
      return null;
    }
  }

  /**
   * Assign the current GitHub user to an issue (claim it).
   */
  async claimIssue(
    projectPath: string,
    issueNumber: number
  ): Promise<{ success: boolean; error?: string }> {
    const currentUser = await this.getCurrentUser(projectPath);
    if (!currentUser) {
      return { success: false, error: 'Not authenticated with GitHub CLI' };
    }
    try {
      await execAsync(`gh issue edit ${issueNumber} --add-assignee "${currentUser}"`, {
        cwd: projectPath,
        env: execEnv,
        timeout: 15000,
      });
      logger.info(`Claimed issue #${issueNumber} for ${currentUser}`);
      return { success: true };
    } catch (err) {
      const msg = describeGhError(err);
      logger.error(`Failed to claim issue #${issueNumber}:`, err);
      return { success: false, error: msg };
    }
  }

  /**
   * Remove the current GitHub user from an issue's assignees (unclaim it).
   */
  async unclaimIssue(
    projectPath: string,
    issueNumber: number
  ): Promise<{ success: boolean; error?: string }> {
    const currentUser = await this.getCurrentUser(projectPath);
    if (!currentUser) {
      return { success: false, error: 'Not authenticated with GitHub CLI' };
    }
    try {
      await execAsync(`gh issue edit ${issueNumber} --remove-assignee "${currentUser}"`, {
        cwd: projectPath,
        env: execEnv,
        timeout: 15000,
      });
      logger.info(`Unclaimed issue #${issueNumber} for ${currentUser}`);
      return { success: true };
    } catch (err) {
      const msg = describeGhError(err);
      logger.error(`Failed to unclaim issue #${issueNumber}:`, err);
      return { success: false, error: msg };
    }
  }

  /**
   * Ensure a GitHub label exists on the repo, creating it if missing.
   */
  private async ensureLabel(projectPath: string, label: string): Promise<boolean> {
    try {
      await execFileAsync('gh', ['label', 'create', label, '--force'], {
        cwd: projectPath,
        env: execEnv,
        timeout: 15000,
      });
      return true;
    } catch (err) {
      // A label that cannot be created is survivable on its own, but passing
      // `--label` for one that does not exist makes `gh issue create` fail
      // outright — so the caller has to know, not just a debug line nobody sees.
      logger.warn(`Could not ensure label "${label}": ${describeGhError(err)}`);
      return false;
    }
  }

  /**
   * Create a new GitHub issue via the gh CLI.
   * Ensures any labels exist before creating the issue.
   * Returns the created issue number and URL.
   */
  async createIssue(
    projectPath: string,
    title: string,
    body?: string,
    labels?: string[]
  ): Promise<{
    success: boolean;
    issueNumber?: number;
    url?: string;
    /** Labels actually applied — a label we could not create is dropped, not fatal */
    appliedLabels?: string[];
    error?: string;
    errorCode?: GhErrorCode;
  }> {
    try {
      // Only ask for labels that exist. `gh issue create --label` fails the
      // whole call for an unknown label, so a repo where label creation is
      // refused would otherwise be unable to file any issue at all.
      let usableLabels: string[] = [];
      if (labels && labels.length > 0) {
        const ensured = await Promise.all(
          labels.map(async (l) => ((await this.ensureLabel(projectPath, l)) ? l : null))
        );
        usableLabels = ensured.filter((l): l is string => l !== null);
        const dropped = labels.filter((l) => !usableLabels.includes(l));
        if (dropped.length > 0) {
          logger.warn(`Creating issue without unavailable label(s): ${dropped.join(', ')}`);
        }
      }

      // execFile (no shell) so bodies keep their real newlines and quoting is
      // not our problem on either platform.
      const args = ['issue', 'create', '--title', title];
      if (body) {
        args.push('--body', body);
      }
      if (usableLabels.length > 0) {
        args.push('--label', usableLabels.join(','));
      }

      const { stdout } = await execFileAsync('gh', args, {
        cwd: projectPath,
        env: execEnv,
        timeout: 30000,
      });

      // gh issue create outputs the URL of the new issue
      const url = stdout.trim();
      const numberMatch = url.match(/\/issues\/(\d+)/);
      const issueNumber = numberMatch ? parseInt(numberMatch[1], 10) : undefined;

      logger.info(`Created GitHub issue #${issueNumber}: ${url}`);
      return { success: true, issueNumber, url, appliedLabels: usableLabels };
    } catch (err) {
      const { code, message } = classifyGhError(err);
      logger.error('Failed to create GitHub issue:', err);
      return { success: false, error: message, errorCode: code };
    }
  }

  /**
   * Create a GitHub repository for a project that has none yet, wire it up as
   * `origin` and push the current branch.
   *
   * This is the escape hatch offered when issue creation fails with
   * `no-remote`: the project is a local-only git repo (or not a repo at all)
   * and the user opts into putting it on GitHub.
   */
  async createRepo(
    projectPath: string,
    name: string,
    visibility: 'private' | 'public' = 'private',
    description?: string
  ): Promise<{ success: boolean; url?: string; nameWithOwner?: string; error?: string }> {
    const repoName = name.trim();
    if (!/^[A-Za-z0-9._-]+$/.test(repoName)) {
      return {
        success: false,
        error:
          'Repository names may only contain letters, numbers, hyphens, underscores and periods.',
      };
    }

    try {
      // gh repo create --source requires a git repo; create one if needed.
      try {
        await execFileAsync('git', ['rev-parse', '--git-dir'], {
          cwd: projectPath,
          env: execEnv,
          timeout: 15000,
        });
      } catch {
        logger.info(`Initialising git repository at ${projectPath}`);
        await execFileAsync('git', ['init'], { cwd: projectPath, env: execEnv, timeout: 15000 });
      }

      // --push only works once there is a commit to push.
      let hasCommits = true;
      try {
        await execFileAsync('git', ['rev-parse', '--verify', 'HEAD'], {
          cwd: projectPath,
          env: execEnv,
          timeout: 15000,
        });
      } catch {
        hasCommits = false;
      }

      const args = [
        'repo',
        'create',
        repoName,
        visibility === 'public' ? '--public' : '--private',
        '--source',
        '.',
        '--remote',
        'origin',
      ];
      if (description?.trim()) {
        args.push('--description', description.trim());
      }
      if (hasCommits) {
        args.push('--push');
      }

      const { stdout } = await execFileAsync('gh', args, {
        cwd: projectPath,
        env: execEnv,
        timeout: 60000,
      });

      const url = stdout.trim().split(/\s+/).pop() || '';
      const match = url.match(/github\.com[/:]([^/]+\/[^/\s.]+)/);
      const nameWithOwner = match ? match[1] : undefined;

      logger.info(`Created GitHub repository ${nameWithOwner || repoName}: ${url}`);
      if (!hasCommits) {
        logger.info(`${repoName} has no commits yet, so nothing was pushed`);
      }
      return { success: true, url, nameWithOwner };
    } catch (err) {
      const { message } = classifyGhError(err);
      logger.error('Failed to create GitHub repository:', err);
      return { success: false, error: message };
    }
  }

  /**
   * Add and/or remove labels from a GitHub issue.
   * Ensures added labels exist before applying them.
   */
  async updateIssueLabels(
    projectPath: string,
    issueNumber: number,
    addLabels?: string[],
    removeLabels?: string[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Ensure labels to add exist first
      if (addLabels && addLabels.length > 0) {
        await Promise.all(addLabels.map((l) => this.ensureLabel(projectPath, l)));
      }

      const args: string[] = [];
      if (addLabels && addLabels.length > 0) {
        args.push(`--add-label "${addLabels.join(',')}"`);
      }
      if (removeLabels && removeLabels.length > 0) {
        args.push(`--remove-label "${removeLabels.join(',')}"`);
      }

      if (args.length === 0) return { success: true };

      await execAsync(`gh issue edit ${issueNumber} ${args.join(' ')}`, {
        cwd: projectPath,
        env: execEnv,
        timeout: 15000,
      });
      logger.info(
        `Updated labels on issue #${issueNumber}: +[${addLabels?.join(',')}] -[${removeLabels?.join(',')}]`
      );
      return { success: true };
    } catch (err) {
      const msg = describeGhError(err);
      logger.error(`Failed to update labels on issue #${issueNumber}:`, err);
      return { success: false, error: msg };
    }
  }

  /**
   * Post a comment on a GitHub issue.
   */
  async addComment(
    projectPath: string,
    issueNumber: number,
    body: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Use execFile (no shell) to avoid cross-platform escaping issues
      await execFileAsync('gh', ['issue', 'comment', String(issueNumber), '--body', body], {
        cwd: projectPath,
        env: execEnv,
        timeout: 15000,
      });
      logger.info(`Posted comment on issue #${issueNumber}`);
      return { success: true };
    } catch (err) {
      const msg = describeGhError(err);
      logger.error(`Failed to comment on issue #${issueNumber}:`, err);
      return { success: false, error: msg };
    }
  }

  /**
   * Lock a GitHub issue conversation.
   */
  async lockIssue(
    projectPath: string,
    issueNumber: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await execFileAsync('gh', ['issue', 'lock', String(issueNumber)], {
        cwd: projectPath,
        env: execEnv,
        timeout: 15000,
      });
      logger.info(`Locked issue #${issueNumber}`);
      return { success: true };
    } catch (err) {
      const msg = describeGhError(err);
      logger.error(`Failed to lock issue #${issueNumber}:`, err);
      return { success: false, error: msg };
    }
  }

  /**
   * Close a GitHub issue.
   */
  async closeIssue(
    projectPath: string,
    issueNumber: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await execFileAsync('gh', ['issue', 'close', String(issueNumber)], {
        cwd: projectPath,
        env: execEnv,
        timeout: 15000,
      });
      logger.info(`Closed issue #${issueNumber}`);
      return { success: true };
    } catch (err) {
      const msg = describeGhError(err);
      logger.error(`Failed to close issue #${issueNumber}:`, err);
      return { success: false, error: msg };
    }
  }

  /**
   * Reopen a closed GitHub issue.
   */
  async reopenIssue(
    projectPath: string,
    issueNumber: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await execFileAsync('gh', ['issue', 'reopen', String(issueNumber)], {
        cwd: projectPath,
        env: execEnv,
        timeout: 15000,
      });
      logger.info(`Reopened issue #${issueNumber}`);
      return { success: true };
    } catch (err) {
      const msg = describeGhError(err);
      logger.error(`Failed to reopen issue #${issueNumber}:`, err);
      return { success: false, error: msg };
    }
  }

  /**
   * Unlock a GitHub issue conversation.
   */
  async unlockIssue(
    projectPath: string,
    issueNumber: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await execFileAsync('gh', ['issue', 'unlock', String(issueNumber)], {
        cwd: projectPath,
        env: execEnv,
        timeout: 15000,
      });
      logger.info(`Unlocked issue #${issueNumber}`);
      return { success: true };
    } catch (err) {
      const msg = describeGhError(err);
      logger.error(`Failed to unlock issue #${issueNumber}:`, err);
      return { success: false, error: msg };
    }
  }

  /**
   * Pin a GitHub issue.
   */
  async pinIssue(
    projectPath: string,
    issueNumber: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await execFileAsync('gh', ['issue', 'pin', String(issueNumber)], {
        cwd: projectPath,
        env: execEnv,
        timeout: 15000,
      });
      logger.info(`Pinned issue #${issueNumber}`);
      return { success: true };
    } catch (err) {
      const msg = describeGhError(err);
      logger.error(`Failed to pin issue #${issueNumber}:`, err);
      return { success: false, error: msg };
    }
  }

  /**
   * Unpin a GitHub issue.
   */
  async unpinIssue(
    projectPath: string,
    issueNumber: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await execFileAsync('gh', ['issue', 'unpin', String(issueNumber)], {
        cwd: projectPath,
        env: execEnv,
        timeout: 15000,
      });
      logger.info(`Unpinned issue #${issueNumber}`);
      return { success: true };
    } catch (err) {
      const msg = describeGhError(err);
      logger.error(`Failed to unpin issue #${issueNumber}:`, err);
      return { success: false, error: msg };
    }
  }

  /**
   * Delete a GitHub issue.
   */
  async deleteIssue(
    projectPath: string,
    issueNumber: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await execFileAsync('gh', ['issue', 'delete', String(issueNumber), '--yes'], {
        cwd: projectPath,
        env: execEnv,
        timeout: 15000,
      });
      logger.info(`Deleted issue #${issueNumber}`);
      return { success: true };
    } catch (err) {
      const msg = describeGhError(err);
      logger.error(`Failed to delete issue #${issueNumber}:`, err);
      return { success: false, error: msg };
    }
  }

  /**
   * Check whether the current DMaker instance can execute a feature.
   *
   * Rules:
   * - No linked GitHub issue -> allowed (local-only feature)
   * - Issue has owner-{otherUser} label -> BLOCKED
   * - Issue has in-progress-{otherUser} label -> BLOCKED
   * - No assignees on issue -> allowed (unclaimed)
   * - Current user is in assignees -> allowed (claimed by me)
   * - Someone else is assigned -> BLOCKED
   */
  async canExecute(projectPath: string, feature: Feature): Promise<CanExecuteResult> {
    if (!feature.githubIssue) {
      return { allowed: true };
    }

    const currentUser = await this.getCurrentUser(projectPath);
    if (!currentUser) {
      // Can't determine identity – allow but warn
      logger.warn(`Cannot determine GitHub user for ${projectPath}, allowing execution`);
      return { allowed: true };
    }

    const holder = findOtherHolder(feature, currentUser);
    if (holder) {
      this.events.emit('feature:claim-blocked', {
        featureId: feature.id,
        issueNumber: feature.githubIssue.number,
        claimedBy: holder,
        projectPath,
      });
      return { allowed: false, reason: 'claimed_by_other', claimedBy: holder };
    }

    // Unclaimed, or claimed by me – allow
    return { allowed: true };
  }

  /**
   * Decide whether an agent working on `feature` may modify files.
   *
   * This is deliberately stricter than {@link canExecute}, which only decides
   * whether a run may *begin*. A run is free to start and read the codebase
   * for anyone; only writing needs proven ownership, which means a linked
   * GitHub issue assigned to the authenticated `gh` user and nobody else.
   *
   * With `autoClaim`, an issue nobody has taken is assigned to the current
   * user on the spot — that is the "if no owner, take it" half of the rule.
   * An issue somebody else holds is never taken from them.
   *
   * Callers are responsible for persisting `claimedBy`/`claimedAt` when
   * `autoClaimed` comes back true; see `ensureFeatureOwnership`.
   */
  async resolveOwnership(
    projectPath: string,
    feature: Feature,
    options: { autoClaim?: boolean } = {}
  ): Promise<FeatureOwnership> {
    const deny = (reason: WriteDenyReason, owner?: string): FeatureOwnership => ({
      canWrite: false,
      reason,
      owner,
      message: describeDenial(reason, owner),
    });

    const issueNumber = feature.githubIssue?.number;
    if (!issueNumber) {
      return deny('no_issue');
    }

    const currentUser = await this.getCurrentUser(projectPath);
    if (!currentUser) {
      return deny('no_identity');
    }

    const holder = findOtherHolder(feature, currentUser);
    if (holder) {
      this.events.emit('feature:claim-blocked', {
        featureId: feature.id,
        issueNumber,
        claimedBy: holder,
        projectPath,
      });
      return deny('owned_by_other', holder);
    }

    const assignees = feature.githubIssue?.assignees ?? [];
    if (assignees.includes(currentUser)) {
      return { canWrite: true, owner: currentUser };
    }

    // Nobody holds it. Take it if we were asked to, otherwise report it free.
    if (!options.autoClaim) {
      return deny('unclaimed');
    }

    const claim = await this.claimIssue(projectPath, issueNumber);
    if (!claim.success) {
      logger.warn(`Auto-claim failed for issue #${issueNumber}: ${claim.error}`);
      return deny('claim_failed');
    }

    logger.info(`Auto-claimed issue #${issueNumber} for ${currentUser}`);
    return { canWrite: true, owner: currentUser, autoClaimed: true };
  }

  /**
   * Invalidate the cached GitHub user for a project path.
   * Useful after re-auth.
   */
  invalidateUserCache(projectPath?: string): void {
    if (projectPath) {
      this.userCache.delete(projectPath);
    } else {
      this.userCache.clear();
    }
  }
}

let _instance: GitHubSyncService | null = null;

export function getGitHubSyncService(events?: EventEmitter): GitHubSyncService {
  if (!_instance) {
    if (!events) throw new Error('GitHubSyncService not initialized');
    _instance = new GitHubSyncService(events);
  }
  return _instance;
}
