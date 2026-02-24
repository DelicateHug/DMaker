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
      const msg = err instanceof Error ? err.message : String(err);
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
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to unclaim issue #${issueNumber}:`, err);
      return { success: false, error: msg };
    }
  }

  /**
   * Ensure a GitHub label exists on the repo, creating it if missing.
   */
  private async ensureLabel(projectPath: string, label: string): Promise<void> {
    try {
      await execAsync(`gh label create "${label.replace(/"/g, '\\"')}" --force`, {
        cwd: projectPath,
        env: execEnv,
        timeout: 15000,
      });
    } catch {
      // Label may already exist or creation may fail - non-fatal
      logger.debug(`Label "${label}" may already exist or could not be created`);
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
  ): Promise<{ success: boolean; issueNumber?: number; url?: string; error?: string }> {
    try {
      // Ensure all labels exist before creating the issue
      if (labels && labels.length > 0) {
        await Promise.all(labels.map((l) => this.ensureLabel(projectPath, l)));
      }

      let cmd = `gh issue create --title "${title.replace(/"/g, '\\"')}"`;
      if (body) {
        cmd += ` --body "${body.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
      }
      if (labels && labels.length > 0) {
        cmd += ` --label "${labels.join(',')}"`;
      }

      const { stdout } = await execAsync(cmd, {
        cwd: projectPath,
        env: execEnv,
        timeout: 30000,
      });

      // gh issue create outputs the URL of the new issue
      const url = stdout.trim();
      const numberMatch = url.match(/\/issues\/(\d+)/);
      const issueNumber = numberMatch ? parseInt(numberMatch[1], 10) : undefined;

      logger.info(`Created GitHub issue #${issueNumber}: ${url}`);
      return { success: true, issueNumber, url };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to create GitHub issue:', err);
      return { success: false, error: msg };
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
      const msg = err instanceof Error ? err.message : String(err);
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
      const msg = err instanceof Error ? err.message : String(err);
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
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to lock issue #${issueNumber}:`, err);
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
      const msg = err instanceof Error ? err.message : String(err);
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
      const msg = err instanceof Error ? err.message : String(err);
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
      const msg = err instanceof Error ? err.message : String(err);
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
      const msg = err instanceof Error ? err.message : String(err);
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

    const labels = feature.githubIssue.labels ?? [];

    // Check for owner-{username} labels — blocks if another user owns it
    const ownerLabel = labels.find((l) => l.startsWith('owner-'));
    if (ownerLabel) {
      const owner = ownerLabel.replace('owner-', '');
      if (owner !== currentUser) {
        this.events.emit('feature:claim-blocked', {
          featureId: feature.id,
          issueNumber: feature.githubIssue.number,
          claimedBy: owner,
          projectPath,
        });
        return { allowed: false, reason: 'claimed_by_other', claimedBy: owner };
      }
    }

    // Check for in-progress-{username} labels — blocks if another user is working on it
    const inProgressLabel = labels.find((l) => l.startsWith('in-progress-'));
    if (inProgressLabel) {
      const inProgressUser = inProgressLabel.replace('in-progress-', '');
      if (inProgressUser !== currentUser) {
        this.events.emit('feature:claim-blocked', {
          featureId: feature.id,
          issueNumber: feature.githubIssue.number,
          claimedBy: inProgressUser,
          projectPath,
        });
        return { allowed: false, reason: 'claimed_by_other', claimedBy: inProgressUser };
      }
    }

    const assignees = feature.githubIssue.assignees ?? [];

    if (assignees.length === 0) {
      // Unclaimed – allow
      return { allowed: true };
    }

    if (assignees.includes(currentUser)) {
      // Claimed by me – allow
      return { allowed: true };
    }

    // Claimed by someone else – block
    const claimedBy = assignees[0];
    this.events.emit('feature:claim-blocked', {
      featureId: feature.id,
      issueNumber: feature.githubIssue.number,
      claimedBy,
      projectPath,
    });

    return { allowed: false, reason: 'claimed_by_other', claimedBy };
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
