/**
 * Feature ownership — who a task belongs to, and whether its agent may write.
 *
 * DMaker's collaboration model puts ownership on GitHub rather than on disk:
 * a task is yours when its linked issue is assigned to you. That is the only
 * record two people sharing a repository can both see and both trust, so it is
 * the only record allowed to unlock file changes.
 *
 * The rule this module enforces:
 *
 *   - a run may always START — reading, searching and planning are harmless
 *   - files may only CHANGE once the task's issue is assigned to you
 *   - an unclaimed issue is assigned to you automatically, and then writes open
 *   - an issue somebody else holds is never taken from them; writes stay shut
 *   - a task with no issue at all can never be owned, so writes stay shut
 *
 * `resolveOwnership` on GitHubSyncService decides all of that. This wrapper
 * adds the one thing it deliberately leaves out: persisting the claim onto the
 * feature so the board reflects it without waiting for the next GitHub sync.
 */

import type { Feature } from '@dmaker/types';
import { createLogger } from '@dmaker/utils';
import { getGitHubSyncService, type FeatureOwnership } from '../services/github-sync-service.js';

const logger = createLogger('FeatureOwnership');

/** The slice of FeatureLoader this module needs, kept structural to avoid a cycle. */
export interface OwnershipFeatureStore {
  update(projectPath: string, featureId: string, updates: Partial<Feature>): Promise<unknown>;
}

/**
 * True while the process is standing in for a real agent.
 *
 * Mock-agent mode exists so CI can exercise the pipeline without an API key or
 * a GitHub account. There is no real agent to restrain and no `gh` to ask who
 * we are, so the gate would deny every run for want of an identity.
 */
function ownershipEnforcementDisabled(): boolean {
  return process.env.DMAKER_MOCK_AGENT === 'true';
}

/**
 * Read a task's ownership without changing it.
 *
 * Use this to decide whether work is worth starting; use
 * {@link ensureFeatureOwnership} at the point where writes actually matter,
 * because only that one will claim an unclaimed task.
 */
export async function resolveFeatureOwnership(
  projectPath: string,
  feature: Feature
): Promise<FeatureOwnership> {
  if (ownershipEnforcementDisabled()) {
    return { canWrite: true, owner: 'mock-agent' };
  }

  try {
    return await getGitHubSyncService().resolveOwnership(projectPath, feature);
  } catch (error) {
    logger.warn(`Ownership check failed for feature ${feature.id}:`, error);
    return {
      canWrite: false,
      reason: 'no_identity',
      message:
        'Ownership of this task could not be checked against GitHub, so file changes are blocked. Check that `gh` is installed and authenticated.',
    };
  }
}

/**
 * Resolve whether this machine's user may modify files for `feature`,
 * claiming the task first if nobody has taken it.
 *
 * Never throws: a `gh` that is missing, unauthenticated or offline resolves to
 * "cannot prove ownership", which denies writes rather than granting them.
 */
export async function ensureFeatureOwnership(
  projectPath: string,
  feature: Feature,
  store?: OwnershipFeatureStore
): Promise<FeatureOwnership> {
  if (ownershipEnforcementDisabled()) {
    return { canWrite: true, owner: 'mock-agent' };
  }

  let ownership: FeatureOwnership;

  try {
    ownership = await getGitHubSyncService().resolveOwnership(projectPath, feature, {
      autoClaim: true,
    });
  } catch (error) {
    // An ownership check that fell over tells us nothing, and "we don't know"
    // is not permission. Deny and say why.
    logger.warn(`Ownership check failed for feature ${feature.id}:`, error);
    return {
      canWrite: false,
      reason: 'no_identity',
      message:
        'Ownership of this task could not be checked against GitHub, so file changes are blocked. Check that `gh` is installed and authenticated.',
    };
  }

  if (ownership.autoClaimed && store) {
    // Best-effort: the claim already landed on GitHub, which is what actually
    // governs. Failing to mirror it locally must not undo it.
    try {
      const syncService = getGitHubSyncService();
      const issueNumber = feature.githubIssue?.number;
      const updates: Partial<Feature> = {
        claimedBy: ownership.owner,
        claimedAt: new Date().toISOString(),
      };

      if (issueNumber) {
        const issueData = await syncService.syncIssueData(projectPath, issueNumber);
        if (issueData) updates.githubIssue = issueData;
      }

      await store.update(projectPath, feature.id, updates);
    } catch (error) {
      logger.warn(`Could not persist auto-claim for feature ${feature.id}:`, error);
    }
  }

  return ownership;
}

/**
 * The notice appended to an agent's system prompt when it may not write.
 *
 * The tool list is already cut down to read-only, so this exists to stop the
 * agent burning its turns planning edits it has no way to make — and to give
 * it something accurate to tell the user instead.
 */
export function buildReadOnlyNotice(ownership: FeatureOwnership): string {
  return [
    '## READ-ONLY: you do not own this task',
    '',
    ownership.message ?? 'You are not the owner of this task.',
    '',
    'You have read-only tools only — there is no Write, no Edit and no Bash.',
    'Do not attempt to change any file, run any command, or work around the',
    'restriction. Investigate and explain what you would change, then stop and',
    'report that the task needs to be claimed before it can be implemented.',
  ].join('\n');
}
