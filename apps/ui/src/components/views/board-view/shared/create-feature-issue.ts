import { getElectronAPI } from '@/lib/electron';
import { createLogger } from '@dmaker/utils/logger';

const logger = createLogger('CreateFeatureIssue');

/** Label applied to newly created issues so the board can map them back to a column. */
const BACKLOG_LABEL = 'label-backlog';

/** The subset of a feature needed to describe it on GitHub. */
export interface FeatureIssueInput {
  title?: string;
  description?: string;
  model?: string;
  thinkingLevel?: string;
  category?: string;
  skipTests?: boolean;
}

/** Feature updates that link the created issue and move the card to the backlog. */
export interface FeatureIssueUpdates {
  status: 'backlog';
  githubIssue: {
    number: number;
    url: string;
    assignees: string[];
    labels: string[];
    state: 'open';
    syncedAt: string;
  };
}

export interface CreateFeatureIssueResult {
  success: boolean;
  /** Present when success — apply these to the feature and persist them. */
  updates?: FeatureIssueUpdates;
  error?: string;
  /**
   * True when the project has no GitHub repository behind it. The caller can
   * offer to create one rather than dead-ending on the error.
   */
  needsRepo?: boolean;
}

/**
 * Create a GitHub issue for a feature and return the updates that link it.
 *
 * The caller owns persistence: apply `updates` via updateFeature +
 * persistFeatureUpdate. The details comment is posted best-effort and never
 * blocks the result.
 */
export async function createFeatureIssue(
  projectPath: string,
  feature: FeatureIssueInput
): Promise<CreateFeatureIssueResult> {
  const api = getElectronAPI();
  if (!api?.github?.createIssue) {
    return { success: false, error: 'GitHub API not available' };
  }

  const description = feature.description || '';
  const issueTitle = (feature.title || '').trim() || description.slice(0, 100);
  if (!issueTitle) {
    return { success: false, error: 'Feature needs a title or description' };
  }

  const firstParagraph = description.split('\n\n')[0] || '';
  const issueSummary =
    firstParagraph.length > 200 ? firstParagraph.slice(0, 200) + '...' : firstParagraph;

  let result: Awaited<ReturnType<typeof api.github.createIssue>>;
  try {
    result = await api.github.createIssue(projectPath, issueTitle, issueSummary, [BACKLOG_LABEL]);
  } catch (err) {
    // The HTTP client rejects on a non-2xx response but carries the server's
    // error code through, so a missing repo is still recoverable here.
    const errorCode = (err as { errorCode?: string })?.errorCode;
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create GitHub issue',
      needsRepo: errorCode === 'no-remote',
    };
  }

  if (!result.success || !result.issueNumber) {
    return {
      success: false,
      error: result.error || 'Failed to create GitHub issue',
      needsRepo: result.errorCode === 'no-remote',
    };
  }

  // Post description + feature options as the first comment (non-blocking)
  if (api.github.addComment && description) {
    const commentBody = [
      '## Description',
      '',
      description,
      '',
      '## Feature Options',
      '',
      `- **Model**: ${feature.model || 'default'}`,
      `- **Thinking Level**: ${feature.thinkingLevel || 'none'}`,
      `- **Category**: ${feature.category || 'Uncategorized'}`,
      `- **Skip Tests**: ${feature.skipTests ? 'Yes' : 'No'}`,
    ].join('\n');
    api.github
      .addComment(projectPath, result.issueNumber, commentBody)
      .catch((err: unknown) => logger.error('Failed to post feature details comment:', err));
  }

  return {
    success: true,
    updates: {
      status: 'backlog',
      githubIssue: {
        number: result.issueNumber,
        url: result.url || '',
        assignees: [],
        // Record what GitHub actually has, not what we asked for.
        labels: result.appliedLabels ?? [BACKLOG_LABEL],
        state: 'open',
        syncedAt: new Date().toISOString(),
      },
    },
  };
}
