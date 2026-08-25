import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { getElectronAPI } from '@/lib/electron';
import {
  CompletedFeaturesListView,
  rowKey,
  type ClosedIssueWithProject,
} from '../completed-features-list-view';
import type { Feature } from '@dmaker/types';
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

/**
 * Present a locally archived task as a row in the closed list.
 *
 * Archived tasks and closed issues are two ways of saying "this is off the
 * board"; showing them in one list is the only way a task that never got an
 * issue is reachable at all.
 */
function archivedFeatureToRow(
  feature: Feature,
  projectPath: string,
  projectName?: string
): ClosedIssueWithProject {
  const archivedAt = feature.archivedAt || feature.updatedAt || new Date().toISOString();
  return {
    number: feature.githubIssue?.number ?? 0,
    title: feature.title?.trim() || feature.description?.slice(0, 100) || 'Untitled task',
    state: 'closed',
    author: { login: feature.owner?.name || '' },
    createdAt: feature.startedAt || archivedAt,
    closedAt: archivedAt,
    labels: [],
    url: feature.githubIssue?.url || '',
    body: feature.description || '',
    assignees: feature.claimedBy ? [{ login: feature.claimedBy }] : [],
    projectPath,
    projectName,
    archivedFeatureId: feature.id,
    archivedFrom: feature.archivedFrom,
  };
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
            const [issues, archived] = await Promise.all([
              api.github!.listIssues(projectPath),
              // Archived tasks are local state; a project with none, or an
              // older server without the endpoint, must not fail the fetch.
              api.features?.listArchived
                ? api.features.listArchived(projectPath).catch(() => null)
                : Promise.resolve(null),
            ]);
            return { projectPath, result: issues, archived };
          })
        );

        const allClosed: ClosedIssueWithProject[] = [];
        const seenKeys = new Set<string>();
        /** Issue numbers already represented by an archived task, per project. */
        const claimedIssues = new Set<string>();

        // Archived tasks first: when a task and its closed issue are the same
        // thing, the archived row is the one that can restore both sides.
        for (const settled of results) {
          if (settled.status === 'rejected') continue;
          const { projectPath, archived } = settled.value;
          if (!archived?.success || !archived.features) continue;
          const projectName = availableProjects?.get(projectPath);
          for (const feature of archived.features) {
            const row = archivedFeatureToRow(feature, projectPath, projectName);
            const key = rowKey(row);
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            if (row.number > 0) claimedIssues.add(`${projectPath}#${row.number}`);
            allClosed.push(row);
          }
        }

        for (const settled of results) {
          if (settled.status === 'rejected') continue;
          const { projectPath, result } = settled.value;
          if (result.success && result.closedIssues) {
            const projectName = availableProjects?.get(projectPath);
            for (const issue of result.closedIssues) {
              if (claimedIssues.has(`${projectPath}#${issue.number}`)) continue;
              const row: ClosedIssueWithProject = { ...issue, projectPath, projectName };
              const key = rowKey(row);
              if (seenKeys.has(key)) continue;
              seenKeys.add(key);
              allClosed.push(row);
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
        setError('Failed to load archived tasks and closed issues');
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

      // Restoring an archived task also reopens its issue (server side), so
      // this is one call, not two.
      const restore = issue.archivedFeatureId
        ? () => api.features!.unarchive(projectPath, issue.archivedFeatureId!)
        : api.github?.reopenIssue
          ? () => api.github!.reopenIssue!(projectPath, issue.number)
          : null;

      if (!restore) return;

      const verb = issue.archivedFeatureId ? 'restore' : 'reopen';

      try {
        const result = await restore();
        if (result.success) {
          // Remove from local state and cache
          setClosedIssues((prev) => {
            const key = rowKey(issue);
            const updated = prev.filter((i) => rowKey(i) !== key);
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
          toast.success(issue.archivedFeatureId ? 'Task restored' : 'Issue reopened', {
            description: issue.number > 0 ? `#${issue.number} ${issue.title}` : issue.title,
          });
        } else {
          toast.error(`Failed to ${verb}`, { description: result.error });
        }
      } catch {
        toast.error(`Failed to ${verb}`);
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
