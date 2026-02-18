import { useState, useCallback, useMemo, memo } from 'react';
import { createLogger } from '@automaker/utils/logger';
import {
  Bot,
  Loader2,
  RefreshCw,
  Square,
  Activity,
  FileText,
  Clock,
  Play,
  ChevronDown,
  ChevronUp,
  Timer,
} from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { useRunningAgents, type RunningAgentFeature } from '@/hooks/use-running-agents';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgentOutputModal } from '../dialogs/agent-output-modal';

const logger = createLogger('RunningAgentsPanel');

// Extended running agent type with UI status
interface RunningAgentWithStatus extends RunningAgentFeature {
  uiStatus: 'running' | 'waiting_approval';
}

export interface RunningAgentsPanelProps {
  /** Additional CSS classes for the container */
  className?: string;
  /** Whether to show only agents for a specific project path */
  projectPath?: string;
  /** Whether the panel is collapsed by default */
  defaultCollapsed?: boolean;
  /** Maximum height for the agent list (scrollable) */
  maxHeight?: string;
  /** Callback when an agent's project is clicked */
  onNavigateToProject?: (agent: RunningAgentWithStatus) => void;
  /** Compact mode for smaller display */
  compact?: boolean;
  /** Whether to hide the internal header (when embedded in a parent with its own header) */
  hideHeader?: boolean;
}

/**
 * RunningAgentsPanel - An embedded panel for displaying running agents
 *
 * This component provides a compact view of running agents that can be embedded
 * directly in the board view. It shows agent status, allows viewing logs, and
 * provides controls to stop agents.
 *
 * @example
 * ```tsx
 * <RunningAgentsPanel
 *   projectPath={currentProject?.path}
 *   compact
 *   maxHeight="300px"
 * />
 * ```
 */
export const RunningAgentsPanel = memo(function RunningAgentsPanel({
  className,
  projectPath,
  defaultCollapsed = false,
  maxHeight = '400px',
  onNavigateToProject,
  compact = false,
  hideHeader = false,
}: RunningAgentsPanelProps) {
  // Use the running agents hook that fetches features from ALL projects
  // Uses the same approach as the board's "All Projects" mode
  // Polls every 30 seconds with a visible countdown timer
  const { runningAgents, secondsUntilRefresh, isRefreshing, refetch } = useRunningAgents();

  const loading = false; // Hook fetches on mount, no explicit loading state needed

  const [refreshing, setRefreshing] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<RunningAgentWithStatus | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const pendingPlanApproval = useAppStore((state) => state.pendingPlanApproval);

  // Combine running agents with their UI status based on pending plan approval
  // This shows agents from ALL projects, with optional filtering by projectPath
  const agentsWithStatus = useMemo<RunningAgentWithStatus[]>(() => {
    let agents = runningAgents.map((agent) => ({
      ...agent,
      uiStatus: pendingPlanApproval?.featureId === agent.featureId ? 'waiting_approval' : 'running',
    })) as RunningAgentWithStatus[];

    // Filter by project path if provided (for project-specific views)
    // When projectPath is undefined, show agents from ALL projects
    if (projectPath) {
      agents = agents.filter((agent) => agent.projectPath === projectPath);
    }

    return agents;
  }, [runningAgents, pendingPlanApproval, projectPath]);

  // Calculate counts for running and waiting approval
  const runningCount = useMemo(() => {
    return agentsWithStatus.filter((a) => a.uiStatus === 'running').length;
  }, [agentsWithStatus]);

  const waitingApprovalCount = useMemo(() => {
    return agentsWithStatus.filter((a) => a.uiStatus === 'waiting_approval').length;
  }, [agentsWithStatus]);

  // Auto-mode event subscriptions are handled internally by useRunningAgents hook
  // No need to duplicate event listeners here

  const handleRefresh = useCallback(async () => {
    logger.debug('Manual refresh requested for running agents');
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const handleStopAgent = useCallback(
    async (agent: RunningAgentWithStatus) => {
      try {
        const api = getElectronAPI();
        const isBacklogPlan = agent.featureId.startsWith('backlog-plan:');
        if (isBacklogPlan && api.backlogPlan) {
          logger.debug('Stopping backlog plan agent', { featureId: agent.featureId });
          await api.backlogPlan.stop();
          refetch();
          return;
        }
        if (api.autoMode) {
          logger.debug('Stopping running agent', { featureId: agent.featureId });
          await api.autoMode.stopFeature(agent.featureId);
          // Refresh list after stopping
          refetch();
        } else {
          logger.debug('Auto mode API not available to stop agent', {
            featureId: agent.featureId,
          });
        }
      } catch (error) {
        logger.error('Error stopping agent:', error);
      }
    },
    [refetch]
  );

  const handleViewLogs = useCallback((agent: RunningAgentWithStatus) => {
    logger.debug('Opening running agent logs', {
      featureId: agent.featureId,
      projectPath: agent.projectPath,
    });
    setSelectedAgent(agent);
  }, []);

  // Determine if we're in "All Projects" mode (no specific project path)
  const isAllProjectsMode = projectPath === undefined;

  // Don't render if there are no agents and we're not loading
  // When in "All Projects" mode, always render the container so users see the agents panel
  const shouldRenderContainer = loading || agentsWithStatus.length > 0 || isAllProjectsMode;

  if (!shouldRenderContainer) {
    return null;
  }

  if (loading) {
    return (
      <div
        className={cn('flex items-center justify-center p-4 border rounded-lg bg-card', className)}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading agents...</span>
      </div>
    );
  }

  return (
    <div
      className={cn('flex flex-col gap-2 overflow-hidden', className)}
      data-testid="running-agents-panel-container"
    >
      {/* Running Agents Section */}
      {/* Show panel when there are agents, OR in "All Projects" mode (to provide consistent UI) */}
      {(agentsWithStatus.length > 0 || isAllProjectsMode) && (
        <div
          className={cn('overflow-hidden shrink-0', !hideHeader && 'border rounded-lg bg-card')}
          data-testid="running-agents-panel"
        >
          {/* Header - only show when not embedded in a parent with its own header */}
          {!hideHeader && (
            <div
              className={cn(
                'flex items-center justify-between px-3 py-2 border-b bg-muted/30 cursor-pointer',
                compact ? 'py-1.5' : 'py-2'
              )}
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              <div className="flex items-center gap-2">
                <div className={cn('p-1 rounded bg-brand-500/10', compact ? 'p-0.5' : 'p-1')}>
                  <Activity className={cn('text-brand-500', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
                </div>
                <div>
                  <h3 className={cn('font-semibold', compact ? 'text-xs' : 'text-sm')}>
                    Running Agents
                  </h3>
                  {!compact && (
                    <p className="text-[10px] text-muted-foreground">
                      {agentsWithStatus.length === 0 ? (
                        <span className="flex items-center gap-1.5">
                          <span>No agents active</span>
                          <span className="text-muted-foreground/50">•</span>
                          <span className="flex items-center gap-0.5">
                            <Timer className="h-2.5 w-2.5" />
                            <span>refresh in {secondsUntilRefresh}s</span>
                          </span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <span className="flex items-center gap-0.5">
                            <Play className="h-2.5 w-2.5 text-green-500" />
                            <span>{runningCount} running</span>
                          </span>
                          {waitingApprovalCount > 0 && (
                            <>
                              <span className="text-muted-foreground/50">•</span>
                              <span className="flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5 text-yellow-500" />
                                <span>{waitingApprovalCount} waiting</span>
                              </span>
                            </>
                          )}
                          <span className="text-muted-foreground/50">•</span>
                          <span className="flex items-center gap-0.5">
                            <Timer className="h-2.5 w-2.5" />
                            <span>{secondsUntilRefresh}s</span>
                          </span>
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Count badge when collapsed */}
                {isCollapsed && agentsWithStatus.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-brand-500/10 text-brand-500">
                    {agentsWithStatus.length}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('h-6 w-6', compact && 'h-5 w-5')}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRefresh();
                  }}
                  disabled={refreshing || isRefreshing}
                  title={
                    isRefreshing ? 'Refreshing...' : `Refresh (auto in ${secondsUntilRefresh}s)`
                  }
                >
                  <RefreshCw
                    className={cn(
                      compact ? 'h-3 w-3' : 'h-3.5 w-3.5',
                      (refreshing || isRefreshing) && 'animate-spin'
                    )}
                  />
                </Button>
                <Button variant="ghost" size="icon" className={cn('h-6 w-6', compact && 'h-5 w-5')}>
                  {isCollapsed ? (
                    <ChevronDown className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                  ) : (
                    <ChevronUp className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Agent List - Collapsible (when header is hidden, always show content) */}
          {(!isCollapsed || hideHeader) && (
            <ScrollArea
              className="w-full"
              style={{ maxHeight: hideHeader ? undefined : maxHeight }}
            >
              {agentsWithStatus.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <div className="p-3 rounded-full bg-muted/50 mb-3">
                    <Bot className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    No Running Agents
                  </p>
                  <p className="text-xs text-muted-foreground/70 max-w-[200px]">
                    {isAllProjectsMode
                      ? 'Agents from all projects will appear here when actively working on features.'
                      : 'Agents will appear here when actively working on features.'}
                  </p>
                </div>
              ) : (
                <div className={cn('divide-y divide-border', compact ? 'p-1' : 'p-2')}>
                  {agentsWithStatus.map((agent) => (
                    <AgentItem
                      key={`${agent.projectPath}-${agent.featureId}`}
                      agent={agent}
                      compact={compact}
                      onStop={handleStopAgent}
                      onViewLogs={handleViewLogs}
                      onNavigate={onNavigateToProject}
                      showProjectName={!projectPath}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          )}
        </div>
      )}

      {/* Agent Output Modal */}
      {selectedAgent && (
        <AgentOutputModal
          open={true}
          onClose={() => setSelectedAgent(null)}
          projectPath={selectedAgent.projectPath}
          featureDescription={selectedAgent.featureTitle || selectedAgent.featureId}
          featureId={selectedAgent.featureId}
          featureStatus="running"
        />
      )}
    </div>
  );
});

/**
 * Individual agent item in the panel
 */
interface AgentItemProps {
  agent: RunningAgentWithStatus;
  compact?: boolean;
  onStop: (agent: RunningAgentWithStatus) => void;
  onViewLogs: (agent: RunningAgentWithStatus) => void;
  onNavigate?: (agent: RunningAgentWithStatus) => void;
  showProjectName?: boolean;
}

const AgentItem = memo(function AgentItem({
  agent,
  compact = false,
  onStop,
  onViewLogs,
  onNavigate,
  showProjectName = true,
}: AgentItemProps) {
  const isWaitingApproval = agent.uiStatus === 'waiting_approval';

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-md transition-colors',
        compact ? 'p-1.5 gap-2' : 'p-2 gap-3',
        isWaitingApproval ? 'bg-yellow-500/5 hover:bg-yellow-500/10' : 'hover:bg-accent/50'
      )}
      data-testid={`agent-item-${agent.featureId}`}
    >
      {/* Agent Info */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Status indicator */}
        <div className="relative shrink-0">
          <Bot
            className={cn(
              compact ? 'h-5 w-5' : 'h-6 w-6',
              isWaitingApproval ? 'text-yellow-500' : 'text-brand-500'
            )}
          />
          {agent.uiStatus === 'running' ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          ) : (
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500" />
            </span>
          )}
        </div>

        {/* Agent details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={cn('font-medium truncate', compact ? 'text-xs' : 'text-sm')}
              title={agent.featureTitle || agent.featureId}
            >
              {agent.featureTitle || agent.featureId}
              {agent.titleGenerating && agent.featureTitle === 'Untitled Feature' && (
                <span className="text-muted-foreground ml-1 font-normal">(checking...)</span>
              )}
            </span>
            {/* All running agents are in auto mode */}
            <span
              className={cn(
                'shrink-0 px-1 py-0.5 font-medium rounded bg-brand-500/10 text-brand-500 border border-brand-500/30',
                compact ? 'text-[8px]' : 'text-[9px]'
              )}
            >
              AUTO
            </span>
          </div>
          {/* Status indicator */}
          {!compact && (
            <div className="mt-0.5 text-[10px] text-muted-foreground">Status: {agent.status}</div>
          )}
          {showProjectName && !compact && (
            <button
              onClick={() => onNavigate?.(agent)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors truncate block mt-1"
              title={agent.projectName}
            >
              {agent.projectName}
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {isWaitingApproval && onNavigate && (
          <Button
            variant="default"
            size="sm"
            className={cn(
              'bg-yellow-500 hover:bg-yellow-600 text-white',
              compact ? 'h-6 px-2 text-[10px]' : 'h-7 px-2.5 text-xs'
            )}
            onClick={() => onNavigate(agent)}
          >
            <Clock className={compact ? 'h-2.5 w-2.5 mr-1' : 'h-3 w-3 mr-1'} />
            Review
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'text-muted-foreground hover:text-foreground',
            compact ? 'h-6 w-6' : 'h-7 w-7'
          )}
          onClick={() => onViewLogs(agent)}
          title="View Logs"
        >
          <FileText className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'text-destructive/70 hover:text-destructive hover:bg-destructive/10',
            compact ? 'h-6 w-6' : 'h-7 w-7'
          )}
          onClick={() => onStop(agent)}
          title="Stop Agent"
        >
          <Square className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </Button>
      </div>
    </div>
  );
});

export default RunningAgentsPanel;
