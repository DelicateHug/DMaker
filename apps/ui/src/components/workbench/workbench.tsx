import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowUp,
  ArrowDown,
  GitBranch,
  GitPullRequest,
  Bot,
  FileDiff,
  Files,
  TerminalSquare,
  Globe,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn, isMac } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useWorkbenchStore, WORKBENCH_TABS, type WorkbenchTabId } from '@/store/workbench-store';
import { useWorktreeSyncStatus } from '@/hooks/use-worktree-sync-status';
import { useRunningFeatureIds } from '@/hooks/use-running-feature-ids';
import {
  getStatusMeta,
  getPullRequestNumber,
  getLinkedIssue,
  getBranchName,
} from '@/components/layout/sidebar/status-meta';
import { AgentPane } from './panes/agent-pane';
import { DiffPane } from './panes/diff-pane';
import { FilesPane } from './panes/files-pane';
import { TerminalPane } from './panes/terminal-pane';
import { BrowserPane } from './panes/browser-pane';
import { AssigneeChip } from './assignee-chip';

interface WorkbenchProps {
  /** Task this workbench is for — one instance per open task tab */
  featureId: string;
  /** Is this the tab currently on screen? Only then do its shortcuts apply. */
  isActive: boolean;
}

const TAB_ICONS: Record<WorkbenchTabId, typeof Bot> = {
  agent: Bot,
  diff: FileDiff,
  files: Files,
  terminal: TerminalSquare,
  browser: Globe,
};

/**
 * Per-feature workbench: the agent transcript, its diff, its files, a terminal
 * and a preview of its dev server, behind one tab strip.
 *
 * One of these is mounted per open task tab, so several tasks can be open at
 * once. Panes stay mounted once opened (hidden with CSS) so terminal sessions
 * and scroll positions survive tab switches.
 */
export function Workbench({ featureId, isActive }: WorkbenchProps) {
  const { features, currentProject, worktreesByProject } = useAppStore(
    useShallow((state) => ({
      features: state.features,
      currentProject: state.currentProject,
      worktreesByProject: state.worktreesByProject,
    }))
  );

  /** Features whose agent is running right now — drives the header pulse. */
  const runningFeatureIds = useRunningFeatureIds();

  const { activeTab, setActiveTab } = useWorkbenchStore(
    useShallow((state) => ({
      activeTab: state.activeTab,
      setActiveTab: state.setActiveTab,
    }))
  );

  // Panes that have been visited, so we can keep them mounted.
  const [mountedTabs, setMountedTabs] = useState<Set<WorkbenchTabId>>(() => new Set([activeTab]));

  useEffect(() => {
    setMountedTabs((previous) => {
      if (previous.has(activeTab)) return previous;
      const next = new Set(previous);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  const feature = useMemo(
    () => features.find((candidate) => candidate.id === featureId) ?? null,
    [features, featureId]
  );

  const worktrees = useMemo(
    () => (currentProject ? (worktreesByProject[currentProject.path] ?? []) : []),
    [currentProject, worktreesByProject]
  );

  const { statusByBranch } = useWorktreeSyncStatus(worktrees, { enabled: !!currentProject });

  // Ctrl/Cmd+1..5 jump between panes. Several task tabs can be mounted at once
  // and only the one on screen may claim the shortcuts. Closing the tab is the
  // strip's business (Escape), not ours.
  useEffect(() => {
    if (!isActive) return;

    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const tab = WORKBENCH_TABS.find((candidate) => candidate.shortcutDigit === event.key);
      if (!tab) return;
      event.preventDefault();
      setActiveTab(tab.id);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveTab, isActive]);

  if (!feature || !currentProject) return null;

  const statusMeta = getStatusMeta(feature.status);
  const StatusIcon = statusMeta.Icon;
  const title = feature.title || feature.description || 'Untitled feature';
  const prNumber = getPullRequestNumber(feature);
  const linkedIssue = getLinkedIssue(feature);
  const branchName = getBranchName(feature);
  const isRunning = runningFeatureIds.has(feature.id);

  // Resolve the worktree this feature runs in; fall back to the project root.
  const worktree = branchName
    ? worktrees.find((candidate) => candidate.branch === branchName)
    : undefined;
  const rootPath = worktree?.path ?? currentProject.path;
  const syncStatus = branchName ? statusByBranch[branchName] : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="workbench">
      {/* Header */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 px-2">
        {/* Status glyph + title — spinning only while an agent actually runs */}
        {isRunning ? (
          <Loader2
            className="size-4 shrink-0 animate-spin"
            style={{ color: statusMeta.dotColor }}
            aria-label={`${statusMeta.label} — running`}
            data-testid="workbench-status-spinner"
          />
        ) : (
          <StatusIcon
            className="size-4 shrink-0"
            style={{ color: statusMeta.dotColor }}
            aria-label={statusMeta.label}
            data-testid="workbench-status-icon"
            data-status={feature.status ?? 'unknown'}
          />
        )}
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>
          {title}
        </h1>

        {/* Metadata cluster */}
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5">{statusMeta.label}</span>

          {/* Ownership gates whether this task's agent may write, so it sits
              with the status rather than buried in the issue dialog. */}
          <AssigneeChip feature={feature} />

          {branchName && (
            <span className="flex items-center gap-1" title={rootPath}>
              <GitBranch className="size-3" />
              <span className="max-w-[16ch] truncate font-mono">{branchName}</span>
            </span>
          )}

          {syncStatus && syncStatus.ahead > 0 && (
            <span className="flex items-center tabular-nums" title="Commits to push">
              <ArrowUp className="size-3" />
              {syncStatus.ahead}
            </span>
          )}
          {syncStatus && syncStatus.behind > 0 && (
            <span className="flex items-center tabular-nums" title="Commits to pull">
              <ArrowDown className="size-3" />
              {syncStatus.behind}
            </span>
          )}

          {prNumber !== null && feature.prUrl && (
            <a
              href={feature.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 hover:text-foreground"
              title="Open pull request on GitHub"
            >
              <GitPullRequest className="size-3" />#{prNumber}
            </a>
          )}

          {linkedIssue && (
            <a
              href={linkedIssue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground"
              title="Open linked issue on GitHub"
            >
              <ExternalLink className="size-3" />#{linkedIssue.number}
            </a>
          )}
        </div>
      </header>

      {/* Tab strip */}
      <nav
        className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border/60 px-2"
        role="tablist"
        aria-label="Workbench panes"
      >
        {WORKBENCH_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab.id];
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              title={`${tab.label} (${isMac ? '⌘' : 'Ctrl+'}${tab.shortcutDigit})`}
              data-testid={`workbench-tab-${tab.id}`}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs cursor-pointer',
                'transition-colors duration-100',
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <Icon className="size-3.5" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Panes — mounted once visited, hidden when inactive */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {mountedTabs.has('agent') && (
          <PaneHost paneId="agent" isActive={activeTab === 'agent'}>
            <AgentPane feature={feature} projectPath={currentProject.path} />
          </PaneHost>
        )}
        {mountedTabs.has('diff') && (
          <PaneHost paneId="diff" isActive={activeTab === 'diff'}>
            <DiffPane
              projectPath={currentProject.path}
              featureId={feature.id}
              useWorktrees={!!branchName}
            />
          </PaneHost>
        )}
        {mountedTabs.has('files') && (
          <PaneHost paneId="files" isActive={activeTab === 'files'}>
            <FilesPane rootPath={rootPath} />
          </PaneHost>
        )}
        {mountedTabs.has('terminal') && (
          <PaneHost paneId="terminal" isActive={activeTab === 'terminal'}>
            <TerminalPane />
          </PaneHost>
        )}
        {mountedTabs.has('browser') && (
          <PaneHost paneId="browser" isActive={activeTab === 'browser'}>
            <BrowserPane projectPath={currentProject.path} worktreePath={rootPath} />
          </PaneHost>
        )}
      </div>
    </div>
  );
}

/** Keeps a pane mounted while hiding it, preserving its internal state. */
function PaneHost({
  paneId,
  isActive,
  children,
}: {
  paneId: WorkbenchTabId;
  isActive: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ visibility: isActive ? 'visible' : 'hidden' }}
      aria-hidden={!isActive}
      inert={!isActive ? true : undefined}
      data-testid={`workbench-pane-${paneId}`}
      data-active={isActive ? 'true' : 'false'}
    >
      {children}
    </div>
  );
}
