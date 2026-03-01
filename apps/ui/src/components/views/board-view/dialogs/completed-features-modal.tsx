import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { getElectronAPI } from '@/lib/electron';
import {
  CompletedFeaturesListView,
  type ClosedIssueWithProject,
} from '../completed-features-list-view';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Module-level cache — persists across modal open/close cycles
// ---------------------------------------------------------------------------

interface CachedData {
  issues: ClosedIssueWithProject[];
  fetchedAt: number;
}

/** Cache keyed by sorted project paths */
const dataCache = new Map<string, CachedData>();
const CACHE_TTL_MS = 60_000; // 60 seconds

function getCacheKey(paths: string[]): string {
  return [...paths].sort().join('|');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CompletedFeaturesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Project paths to load closed issues from. When empty, uses current project. */
  projectPaths?: string[];
  /** Available projects for filtering (project path -> project name) */
  availableProjects?: Map<string, string>;
  /** Current project path (for single project view) */
  currentProjectPath?: string;
}

export function CompletedFeaturesModal({
  open,
  onOpenChange,
  projectPaths,
  availableProjects,
  currentProjectPath,
}: CompletedFeaturesModalProps) {
  const [closedIssues, setClosedIssues] = useState<ClosedIssueWithProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const fetchingRef = useRef(false);

  const resolvePaths = useCallback((): string[] => {
    if (projectPaths?.length) return projectPaths;
    if (currentProjectPath) return [currentProjectPath];
    return [];
  }, [projectPaths, currentProjectPath]);

  const fetchClosedIssues = useCallback(
    async (showLoading: boolean) => {
      const paths = resolvePaths();
      if (paths.length === 0) return;
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);

      const api = getElectronAPI();
      if (!api.github) {
        setError('GitHub API not available');
        setIsLoading(false);
        fetchingRef.current = false;
        return;
      }

      try {
        const results = await Promise.allSettled(
          paths.map(async (projectPath) => {
            const result = await api.github!.listIssues(projectPath);
            return { projectPath, result };
          })
        );

        const allClosed: ClosedIssueWithProject[] = [];
        const seenUrls = new Set<string>();

        for (const settled of results) {
          if (settled.status === 'rejected') continue;
          const { projectPath, result } = settled.value;
          if (result.success && result.closedIssues) {
            const projectName = availableProjects?.get(projectPath);
            for (const issue of result.closedIssues) {
              if (seenUrls.has(issue.url)) continue;
              seenUrls.add(issue.url);
              allClosed.push({ ...issue, projectPath, projectName });
            }
          }
        }

        // Update cache
        const cacheKey = getCacheKey(paths);
        const now = Date.now();
        dataCache.set(cacheKey, { issues: allClosed, fetchedAt: now });

        setClosedIssues(allClosed);
        setLastFetchedAt(now);
      } catch {
        setError('Failed to fetch closed issues');
      } finally {
        setIsLoading(false);
        fetchingRef.current = false;
      }
    },
    [resolvePaths, availableProjects]
  );

  // When modal opens: use cache if fresh, otherwise fetch
  useEffect(() => {
    if (!open) return;

    const paths = resolvePaths();
    if (paths.length === 0) return;

    const cacheKey = getCacheKey(paths);
    const cached = dataCache.get(cacheKey);
    const now = Date.now();

    if (cached) {
      // Always show cached data immediately
      setClosedIssues(cached.issues);
      setLastFetchedAt(cached.fetchedAt);

      // Background refresh if stale
      if (now - cached.fetchedAt > CACHE_TTL_MS) {
        fetchClosedIssues(false);
      }
    } else {
      // First load — show spinner
      fetchClosedIssues(true);
    }
  }, [open, resolvePaths, fetchClosedIssues]);

  const handleRetry = useCallback(() => {
    fetchClosedIssues(true);
  }, [fetchClosedIssues]);

  const handleManualRefresh = useCallback(() => {
    // Force refresh, invalidate cache
    const paths = resolvePaths();
    if (paths.length > 0) {
      dataCache.delete(getCacheKey(paths));
    }
    fetchClosedIssues(false);
  }, [fetchClosedIssues, resolvePaths]);

  const handleReopen = useCallback(
    async (issue: ClosedIssueWithProject) => {
      const projectPath = issue.projectPath || currentProjectPath;
      if (!projectPath) return;

      const api = getElectronAPI();
      if (!api.github?.reopenIssue) return;

      try {
        const result = await api.github.reopenIssue(projectPath, issue.number);
        if (result.success) {
          // Remove from local state and cache
          setClosedIssues((prev) => {
            const updated = prev.filter((i) => i.url !== issue.url);
            // Update cache too
            const paths = resolvePaths();
            if (paths.length > 0) {
              const cacheKey = getCacheKey(paths);
              const cached = dataCache.get(cacheKey);
              if (cached) {
                dataCache.set(cacheKey, { ...cached, issues: updated });
              }
            }
            return updated;
          });
          toast.success('Issue reopened', {
            description: `#${issue.number} ${issue.title}`,
          });
        } else {
          toast.error('Failed to reopen issue', { description: result.error });
        }
      } catch {
        toast.error('Failed to reopen issue');
      }
    },
    [currentProjectPath, resolvePaths]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl max-h-[90vh] flex flex-col p-0 gap-0"
        showCloseButton={false}
        data-testid="completed-features-modal"
      >
        <CompletedFeaturesListView
          closedIssues={closedIssues}
          onReopen={handleReopen}
          onClose={() => onOpenChange(false)}
          availableProjects={availableProjects}
          isLoading={isLoading}
          error={error}
          onRetry={handleRetry}
          onRefresh={handleManualRefresh}
          lastFetchedAt={lastFetchedAt}
          cacheTtlMs={CACHE_TTL_MS}
          className="h-[85vh]"
        />
      </DialogContent>
    </Dialog>
  );
}
