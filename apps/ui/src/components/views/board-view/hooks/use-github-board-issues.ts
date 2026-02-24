import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createLogger } from '@dmaker/utils/logger';
import { getElectronAPI, GitHubIssue } from '@/lib/electron';
import type { Feature } from '@dmaker/types';
import type { StatusTab } from './use-board-status-tabs';

const logger = createLogger('GitHubBoardIssues');

/** Polling interval for refreshing GitHub issues (30 seconds) */
const POLL_INTERVAL_MS = 30_000;

/**
 * Label-to-status mapping aliases.
 * Maps normalized GitHub label names to board column status IDs.
 */
const LABEL_STATUS_ALIASES: Record<string, string> = {
  backlog: 'backlog',
  planning: 'planning',
  'in-progress': 'in_progress',
  in_progress: 'in_progress',
  'in progress': 'in_progress',
  doing: 'in_progress',
  active: 'in_progress',
  'waiting-approval': 'waiting_approval',
  waiting_approval: 'waiting_approval',
  'waiting approval': 'waiting_approval',
  review: 'waiting_approval',
  'in-review': 'waiting_approval',
  'needs-review': 'waiting_approval',
  waiting: 'waiting_approval',
  completed: 'completed',
  done: 'completed',
  closed: 'completed',
  verified: 'completed',
};

/**
 * Maps a GitHub issue's labels to a board column status ID.
 *
 * Strategy:
 * 1. Check for exact matches against known aliases
 * 2. Check against custom pipeline status tab labels
 * 3. Closed issues → completed
 * 4. Default → backlog
 */
function mapLabelsToStatus(
  labels: { name: string }[],
  issueState: string,
  statusTabs: StatusTab[]
): string {
  // Closed issues always go to completed
  if (issueState === 'closed') {
    return 'completed';
  }

  for (const label of labels) {
    const normalized = label.name
      .toLowerCase()
      .trim()
      .replace(/^(?:status|label)[:\s-]+/i, ''); // Strip "status:" or "label-" prefix

    // Check known aliases first
    const aliasMatch = LABEL_STATUS_ALIASES[normalized];
    if (aliasMatch) {
      return aliasMatch;
    }

    // Check against custom pipeline step labels
    for (const tab of statusTabs) {
      if (tab.id === 'all' || tab.id === 'completed') continue;

      const tabLabel = tab.label.toLowerCase().trim();
      const tabIdNormalized = tab.id.replace(/^pipeline_/, '').toLowerCase();

      if (
        normalized === tabLabel ||
        normalized === tabIdNormalized ||
        normalized === tab.id.toLowerCase()
      ) {
        return tab.id;
      }
    }
  }

  // Default: open issues with no matching label → backlog
  return 'backlog';
}

/**
 * Converts a GitHub issue into a Feature-compatible object for board rendering.
 */
/** Project info for tagging virtual GitHub features */
interface ProjectInfo {
  path: string;
  name: string;
}

function issueToFeature(
  issue: GitHubIssue,
  statusTabs: StatusTab[],
  project?: ProjectInfo
): Feature {
  const status = mapLabelsToStatus(issue.labels, issue.state, statusTabs);

  return {
    id: `github-issue-${issue.number}`,
    title: issue.title,
    description: issue.body || '',
    category: 'GitHub Issue',
    status,
    source: 'github',
    steps: [],
    model: 'sonnet',
    thinkingLevel: 'none',
    githubIssue: {
      number: issue.number,
      url: issue.url,
      assignees: issue.assignees.map((a) => a.login),
      labels: issue.labels.map((l) => l.name),
      state: issue.state as 'open' | 'closed',
      syncedAt: new Date().toISOString(),
    },
    claimedBy: issue.assignees[0]?.login,
    claimedAt: issue.assignees.length > 0 ? new Date().toISOString() : undefined,
    // Tag with project info so multi-project grouping works
    ...(project ? { projectPath: project.path, projectName: project.name } : {}),
  } as Feature;
}

export type { ProjectInfo };

interface UseGithubBoardIssuesOptions {
  /** Whether GitHub mode is active. When false, no fetching occurs. */
  enabled: boolean;
  /** Path to the current project (for GitHub API calls). Used for single-project mode. */
  projectPath?: string | null;
  /** Project info objects for multiple projects. When provided, issues are fetched from all of them. */
  projectInfos?: ProjectInfo[];
  /** Available status tabs (including custom pipeline steps) for label mapping */
  statusTabs: StatusTab[];
}

/**
 * Hook that fetches GitHub issues and maps them to Feature objects for the kanban board.
 *
 * Supports both single-project (projectPath) and multi-project (projectPaths) modes.
 * Only fetches when `enabled` is true (GitHub mode is active).
 * Polls for updates every 30 seconds.
 */
export function useGithubBoardIssues({
  enabled,
  projectPath,
  projectInfos,
  statusTabs,
}: UseGithubBoardIssuesOptions) {
  const [githubFeatures, setGithubFeatures] = useState<Feature[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const statusTabsRef = useRef(statusTabs);
  statusTabsRef.current = statusTabs;

  // Resolve effective project infos: prefer projectInfos array, fall back to single projectPath
  const effectiveProjects = useMemo(() => {
    if (projectInfos && projectInfos.length > 0) return projectInfos;
    if (projectPath) return [{ path: projectPath, name: '' }];
    return [];
  }, [projectInfos, projectPath]);

  // Stable key for dependency tracking
  const pathsKey = useMemo(
    () => effectiveProjects.map((p) => p.path).join('|'),
    [effectiveProjects]
  );

  const fetchAndMap = useCallback(async () => {
    if (effectiveProjects.length === 0) {
      if (isMountedRef.current) {
        setGithubFeatures([]);
        setError(null);
      }
      return;
    }

    try {
      if (isMountedRef.current) {
        setError(null);
      }

      const api = getElectronAPI();
      const githubApi = api.github;
      if (!githubApi) {
        if (isMountedRef.current) {
          setError('GitHub API not available');
        }
        return;
      }

      // Fetch issues from all project paths in parallel
      const results = await Promise.allSettled(
        effectiveProjects.map(async (project) => {
          const result = await githubApi.listIssues(project.path);
          return { project, result };
        })
      );

      if (!isMountedRef.current) return;

      const allFeatures: Feature[] = [];
      const errors: string[] = [];
      // Track seen issue URLs to deduplicate across projects sharing the same repo
      const seenIssueUrls = new Set<string>();

      for (const settled of results) {
        if (settled.status === 'rejected') {
          errors.push(String(settled.reason));
          continue;
        }
        const { project, result } = settled.value;
        if (result.success) {
          const allIssues = [...(result.openIssues || []), ...(result.closedIssues || [])];
          for (const issue of allIssues) {
            // Deduplicate: same repo URL means same issue across projects
            if (seenIssueUrls.has(issue.url)) continue;
            seenIssueUrls.add(issue.url);
            allFeatures.push(issueToFeature(issue, statusTabsRef.current, project));
          }
        } else {
          errors.push(result.error || `Failed to fetch issues for ${project.path}`);
        }
      }

      setGithubFeatures(allFeatures);
      if (errors.length > 0) {
        setError(errors.join('; '));
      }
      logger.info(
        `Mapped ${allFeatures.length} GitHub issues from ${effectiveProjects.length} project(s)`
      );
    } catch (err) {
      if (isMountedRef.current) {
        const message = err instanceof Error ? err.message : 'Failed to fetch GitHub issues';
        logger.error('Error fetching GitHub issues for board:', err);
        setError(message);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [pathsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch when enabled or project changes
  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled) {
      setGithubFeatures([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchAndMap();

    return () => {
      isMountedRef.current = false;
    };
  }, [enabled, fetchAndMap]);

  // Poll for updates when enabled
  useEffect(() => {
    if (!enabled || effectiveProjects.length === 0) return;

    const intervalId = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      fetchAndMap();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [enabled, pathsKey, fetchAndMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    if (enabled) {
      setIsLoading(true);
      fetchAndMap();
    }
  }, [enabled, fetchAndMap]);

  return {
    githubFeatures,
    isLoading,
    error,
    refresh,
  };
}
