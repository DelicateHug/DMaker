import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '@dmaker/utils/logger';
import { getElectronAPI, GitHubIssue } from '@/lib/electron';

const logger = createLogger('GitHubIssues');
import { useAppStore } from '@/store/app-store';

export function useGithubIssues(githubRepo?: string) {
  const { currentProject } = useAppStore();
  const [openIssues, setOpenIssues] = useState<GitHubIssue[]>([]);
  const [closedIssues, setClosedIssues] = useState<GitHubIssue[]>([]);
  const [repoFullName, setRepoFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const fetchIssues = useCallback(async () => {
    if (!currentProject?.path) {
      if (isMountedRef.current) {
        setError('No project selected');
        setLoading(false);
      }
      return;
    }

    try {
      if (isMountedRef.current) {
        setError(null);
      }
      const api = getElectronAPI();
      if (api.github) {
        const result = await api.github.listIssues(currentProject.path, githubRepo);
        if (isMountedRef.current) {
          if (result.success) {
            setOpenIssues(result.openIssues || []);
            setClosedIssues(result.closedIssues || []);
            if (result.owner && result.repo) {
              setRepoFullName(`${result.owner}/${result.repo}`);
            }
          } else {
            setError(result.error || 'Failed to fetch issues');
          }
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        logger.error('Error fetching issues:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch issues');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [currentProject?.path, githubRepo]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchIssues();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchIssues]);

  const refresh = useCallback(() => {
    if (isMountedRef.current) {
      setRefreshing(true);
    }
    fetchIssues();
  }, [fetchIssues]);

  return {
    openIssues,
    closedIssues,
    repoFullName,
    loading,
    refreshing,
    error,
    refresh,
  };
}
