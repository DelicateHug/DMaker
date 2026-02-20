/**
 * GitHubSyncService - Manages GitHub Issue claim/unclaim and assignee sync
 *
 * Provides:
 * - Claim an issue (assign current gh user on GitHub + update local feature)
 * - Unclaim an issue (remove current gh user from GitHub + update local feature)
 * - canExecute() check: blocks execution if someone else is assigned
 * - Sync assignee data from GitHub onto local feature
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@automaker/utils';
import { getExtendedPath } from '@automaker/platform';
import type { Feature } from '@automaker/types';
import type { EventEmitter } from '../lib/events.js';

const execAsync = promisify(exec);
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
   * Check whether the current Automaker instance can execute a feature.
   *
   * Rules:
   * - No linked GitHub issue -> allowed (local-only feature)
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
