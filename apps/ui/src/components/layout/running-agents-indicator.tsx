import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import {
  Activity,
  Bot,
  Clock,
  ChevronDown,
  ChevronRight,
  Square,
  Loader2,
  ExternalLink,
  CheckCircle,
  X,
  Eye,
  Archive,
  Folder,
  Timer,
  Bell,
  Check,
  CheckCheck,
  Trash2,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useRunningAgents, type RunningAgentFeature } from '@/hooks/use-running-agents';
import { getElectronAPI } from '@/lib/electron';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useAppStore } from '@/store/app-store';
import { useNotificationsStore } from '@/store/notifications-store';
import { createLogger } from '@automaker/utils/logger';
import type { Notification } from '@automaker/types';

const logger = createLogger('RunningAgentsIndicator');

// Extended running agent type with UI status
interface RunningAgentWithStatus extends RunningAgentFeature {
  uiStatus: 'running' | 'waiting_approval';
}

/**
 * RunningAgentsIndicator - Shows running agents count with dropdown list
 *
 * Phase 8: T037 - Create RunningAgentsIndicator for top bar
 * Phase 3: T007 - Updated to use refactored useRunningAgentsPolling hook with singleton manager
 * T001 - Added notification data loading and event subscription
 * T002 - Added notifications section UI with mark-as-read, dismiss, mark-all, dismiss-all actions
 *
 * This component displays:
 * - Running count: Number of agents actively working on features
 * - Waiting Approval count: Number of agents paused waiting for plan approval
 * - Recently completed count: Features that finished in the last 30 minutes
 * - Notifications count: Unread notifications across all projects
 * - Dropdown list showing all running agents with their status
 *
 * Features:
 * - Animated pulse indicator when agents are running
 * - Color-coded badges (green for running, amber for waiting, blue for completed, purple for notifications)
 * - Dropdown with scrollable list of running agents
 * - Quick access to stop individual agents
 * - Navigate to board view when clicking an agent
 * - Uses singleton polling manager for consistent updates across all components
 * - Polling continues uninterrupted during project switches
 * - Automatic refresh every 30 seconds via singleton manager
 * - Loads notifications from all projects and subscribes to real-time notification events
 * - Shows up to 5 most recent notifications in dropdown with "View All" link
 * - Per-notification mark-as-read and dismiss actions
 * - Bulk mark-all-as-read and dismiss-all actions in notifications header
 */
export interface RunningAgentsIndicatorProps {
  /** Current location object with pathname (deprecated - no longer used) */
  location?: { pathname: string };
  /** Navigation callback */
  onNavigate: (path: string) => void;
  /** Optional additional className */
  className?: string;
  /** Whether to show the label text (default: true) */
  showLabel?: boolean;
  /** Size variant (default: 'default') */
  size?: 'sm' | 'default';
}

// Type for recently completed feature context menu
interface RecentlyCompletedContextMenu {
  x: number;
  y: number;
  feature: {
    featureId: string;
    projectPath: string;
    projectName: string;
    title: string;
  };
}

/**
 * ProjectGroup - Collapsible component for grouping agents by project
 *
 * Displays a project header with name and agent count, which can be
 * expanded/collapsed to show/hide the individual agent entries.
 */
interface ProjectGroupProps {
  projectPath: string;
  projectName: string;
  agents: RunningAgentWithStatus[];
  isExpanded: boolean;
  onToggle: () => void;
  onNavigateToAgent: (agent: RunningAgentWithStatus) => void;
  onStopAgent: (featureId: string, e: React.MouseEvent) => void;
  stoppingAgents: Set<string>;
  showSeparator?: boolean;
}

const ProjectGroup = memo(function ProjectGroup({
  projectPath,
  projectName,
  agents,
  isExpanded,
  onToggle,
  onNavigateToAgent,
  onStopAgent,
  stoppingAgents,
  showSeparator = false,
}: ProjectGroupProps) {
  return (
    <div data-testid={`project-group-${projectPath}`}>
      {/* Project separator - only show after first project */}
      {showSeparator && <div className="h-px bg-border/40 my-2" />}

      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        {/* Collapsible project header */}
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              'w-full px-2 py-1.5 flex items-center gap-2 rounded-md',
              'hover:bg-accent/50 transition-colors cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
            )}
            aria-expanded={isExpanded}
            data-testid={`project-group-header-${projectPath}`}
          >
            {/* Collapse/expand indicator */}
            <span className="text-muted-foreground shrink-0">
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </span>
            <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold text-muted-foreground truncate">
              {projectName}
            </span>
            <span className="text-[10px] text-muted-foreground/60 shrink-0">({agents.length})</span>
          </button>
        </CollapsibleTrigger>

        {/* Collapsible content - agent list */}
        <CollapsibleContent>
          <div className="ml-2">
            {agents.map((agent) => (
              <div
                key={agent.featureId}
                className={cn(
                  'group flex items-start gap-2 p-2 rounded-md cursor-pointer ml-1',
                  'hover:bg-accent/50 transition-colors',
                  agent.uiStatus === 'waiting_approval' && 'bg-amber-500/5'
                )}
                onClick={() => onNavigateToAgent(agent)}
                data-testid={`agent-item-${agent.featureId}`}
              >
                {/* Status indicator */}
                <div className="mt-0.5 shrink-0">
                  {agent.uiStatus === 'waiting_approval' ? (
                    <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <Clock className="w-3 h-3 text-amber-500" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center relative">
                      <Bot className="w-3 h-3 text-green-500" />
                      <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                      </span>
                    </div>
                  )}
                </div>

                {/* Agent info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium truncate">
                      {agent.featureTitle || 'Untitled Task'}
                      {agent.titleGenerating && agent.featureTitle === 'Untitled Feature' && (
                        <span className="text-muted-foreground ml-1">(checking...)</span>
                      )}
                    </span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-[10px] text-muted-foreground">Status: {agent.status}</div>
                </div>

                {/* Stop button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20 hover:text-destructive"
                  onClick={(e) => onStopAgent(agent.featureId, e)}
                  disabled={stoppingAgents.has(agent.featureId)}
                  title="Stop agent"
                >
                  {stoppingAgents.has(agent.featureId) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Square className="h-3 w-3" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});

export function RunningAgentsIndicator({
  onNavigate,
  className,
  showLabel = true,
  size = 'default',
}: RunningAgentsIndicatorProps) {
  // Use the running agents hook that fetches features from ALL projects
  // Uses the same approach as the board's "All Projects" mode
  // Polls every 30 seconds with a visible countdown timer
  const {
    agentsByProject: projectGroups,
    runningAgentsCount,
    secondsUntilRefresh,
    refetch,
  } = useRunningAgents();

  // Log component mount for debugging
  useEffect(() => {
    logger.debug('[RunningAgentsIndicator] Component mounted', {
      runningAgentsCount,
      projectGroupsCount: projectGroups.length,
    });

    return () => {
      logger.debug('[RunningAgentsIndicator] Component unmounting');
    };
  }, []); // Only run on mount/unmount

  // Log when agent data changes
  useEffect(() => {
    logger.debug('[RunningAgentsIndicator] Running agents data updated', {
      runningAgentsCount,
      projectGroupsCount: projectGroups.length,
    });
  }, [runningAgentsCount, projectGroups.length]);

  const [isOpen, setIsOpen] = useState(false);
  const [stoppingAgents, setStoppingAgents] = useState<Set<string>>(new Set());

  // Context menu state for recently completed features
  const [contextMenu, setContextMenu] = useState<RecentlyCompletedContextMenu | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Track which project groups are expanded (by project path)
  // Default to collapsed (empty set means all collapsed)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const {
    pendingPlanApproval,
    projects,
    setCurrentProject,
    setShowAllProjects,
    setPendingBoardStatusTab,
    getVisibleRecentlyCompletedFeatures,
    dismissRecentlyCompletedFeature,
    dismissAllVisibleRecentlyCompletedFeatures,
    cleanupExpiredRecentlyCompletedFeatures,
  } = useAppStore(
    useShallow((state) => ({
      pendingPlanApproval: state.pendingPlanApproval,
      projects: state.projects,
      setCurrentProject: state.setCurrentProject,
      setShowAllProjects: state.setShowAllProjects,
      setPendingBoardStatusTab: state.setPendingBoardStatusTab,
      getVisibleRecentlyCompletedFeatures: state.getVisibleRecentlyCompletedFeatures,
      dismissRecentlyCompletedFeature: state.dismissRecentlyCompletedFeature,
      dismissAllVisibleRecentlyCompletedFeatures: state.dismissAllVisibleRecentlyCompletedFeatures,
      cleanupExpiredRecentlyCompletedFeatures: state.cleanupExpiredRecentlyCompletedFeatures,
    }))
  );

  // Notification store integration - subscribe to unread count, notifications, and action methods
  const {
    notifications,
    unreadCount: notificationUnreadCount,
    addNotification,
    setNotifications,
    setUnreadCount: setNotificationUnreadCount,
    setLoading: setNotificationsLoading,
    setError: setNotificationsError,
    markAsRead: storeMarkAsRead,
    markAllAsRead: storeMarkAllAsRead,
    dismissNotification: storeDismissNotification,
    dismissAll: storeDismissAll,
  } = useNotificationsStore(
    useShallow((state) => ({
      notifications: state.notifications,
      unreadCount: state.unreadCount,
      addNotification: state.addNotification,
      setNotifications: state.setNotifications,
      setUnreadCount: state.setUnreadCount,
      setLoading: state.setLoading,
      setError: state.setError,
      markAsRead: state.markAsRead,
      markAllAsRead: state.markAllAsRead,
      dismissNotification: state.dismissNotification,
      dismissAll: state.dismissAll,
    }))
  );

  // Load notifications for all projects on mount and when projects change
  useEffect(() => {
    if (projects.length === 0) return;

    const loadAllNotifications = async () => {
      setNotificationsLoading(true);
      setNotificationsError(null);

      try {
        const api = getHttpApiClient();

        // Fetch notifications from all projects in parallel
        const results = await Promise.all(
          projects.map(async (project) => {
            try {
              const result = await api.notifications.list(project.path);
              if (result.success && result.notifications) {
                return result.notifications;
              }
              return [];
            } catch (error) {
              logger.error(`Failed to load notifications for project ${project.name}:`, error);
              return [];
            }
          })
        );

        // Merge all notifications, sort by creation date (newest first)
        const allNotifications = results.flat();
        allNotifications.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        setNotifications(allNotifications);
        setNotificationUnreadCount(allNotifications.filter((n) => !n.read).length);
      } catch (error) {
        logger.error('Error loading notifications:', error);
        setNotificationsError(
          error instanceof Error ? error.message : 'Failed to load notifications'
        );
      } finally {
        setNotificationsLoading(false);
      }
    };

    loadAllNotifications();
  }, [
    projects,
    setNotifications,
    setNotificationUnreadCount,
    setNotificationsLoading,
    setNotificationsError,
  ]);

  // Subscribe to real-time notification:created events via WebSocket
  useEffect(() => {
    const api = getHttpApiClient();

    const unsubscribe = api.notifications.onNotificationCreated((notification: Notification) => {
      logger.debug('Notification created event received', {
        type: notification.type,
        id: notification.id,
      });
      addNotification(notification);
    });

    return unsubscribe;
  }, [addNotification]);

  // Calculate waiting approval count from pendingPlanApproval state
  const waitingApprovalCount = pendingPlanApproval ? 1 : 0;

  // Get recently completed features (visible = not dismissed and < 30 mins old)
  const recentlyCompletedFeatures = getVisibleRecentlyCompletedFeatures();

  // Periodic cleanup of expired features (every minute)
  useEffect(() => {
    const cleanup = () => cleanupExpiredRecentlyCompletedFeatures();
    cleanup(); // Run once on mount
    const interval = setInterval(cleanup, 60000); // Run every minute
    return () => clearInterval(interval);
  }, [cleanupExpiredRecentlyCompletedFeatures]);

  // Total count for badge display
  const totalCount = runningAgentsCount + waitingApprovalCount;

  // Determine if there's any activity to show
  const hasActivity =
    totalCount > 0 || recentlyCompletedFeatures.length > 0 || notificationUnreadCount > 0;

  // Refresh agents when dropdown opens and periodically while open
  useEffect(() => {
    if (isOpen) {
      refetch();
      // Refresh every 2 seconds while open
      const interval = setInterval(refetch, 2000);
      return () => clearInterval(interval);
    }
  }, [isOpen, refetch]);

  // Build a map from project groups (from hook) with UI status-enhanced agents
  // This combines the hook's project grouping with the waiting_approval status
  const agentsByProject = useMemo(() => {
    const grouped = new Map<string, RunningAgentWithStatus[]>();

    // Use projectGroups from hook but enhance agents with UI status
    for (const group of projectGroups) {
      const agentsWithStatusForProject = group.agents.map((agent) => ({
        ...agent,
        uiStatus:
          pendingPlanApproval?.featureId === agent.featureId ? 'waiting_approval' : 'running',
      })) as RunningAgentWithStatus[];

      grouped.set(group.projectPath, agentsWithStatusForProject);
    }

    return grouped;
  }, [projectGroups, pendingPlanApproval]);

  // Toggle a project group's expanded/collapsed state
  const toggleProjectExpanded = useCallback((projectPath: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectPath)) {
        next.delete(projectPath);
      } else {
        next.add(projectPath);
      }
      return next;
    });
  }, []);

  // Stop a specific agent
  const handleStopAgent = useCallback(
    async (featureId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setStoppingAgents((prev) => new Set(prev).add(featureId));
      try {
        const api = getElectronAPI();
        if (api.autoMode?.stopFeature) {
          await api.autoMode.stopFeature(featureId);
          // Refresh the list
          refetch();
        }
      } catch (error) {
        logger.error('Error stopping agent:', error);
      } finally {
        setStoppingAgents((prev) => {
          const next = new Set(prev);
          next.delete(featureId);
          return next;
        });
      }
    },
    [refetch]
  );

  // Navigate to a project and go to board view with In Progress tab active
  const handleNavigateToAgent = useCallback(
    (agent: RunningAgentWithStatus) => {
      // Find the project by path
      const project = projects.find((p) => p.path === agent.projectPath);
      if (project) {
        setShowAllProjects(false);
        setCurrentProject(project);
      }
      // Signal the board to switch to the In Progress tab
      setPendingBoardStatusTab('in_progress');
      // Navigate to board
      onNavigate('/board');
      setIsOpen(false);
    },
    [projects, setCurrentProject, setShowAllProjects, setPendingBoardStatusTab, onNavigate]
  );

  // Navigate to a recently completed feature
  const handleNavigateToRecentlyCompleted = useCallback(
    (feature: { featureId: string; projectPath: string; projectName: string; title: string }) => {
      const project = projects.find((p) => p.path === feature.projectPath);
      if (project) {
        setShowAllProjects(false);
        setCurrentProject(project);
      }
      onNavigate('/board');
      setIsOpen(false);
    },
    [projects, setCurrentProject, setShowAllProjects, onNavigate]
  );

  // Dismiss a recently completed feature notification
  const handleDismissRecentlyCompleted = useCallback(
    (featureId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      dismissRecentlyCompletedFeature(featureId);
    },
    [dismissRecentlyCompletedFeature]
  );

  // Complete All: Dismiss all recently completed features at once
  const handleCompleteAll = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      dismissAllVisibleRecentlyCompletedFeatures();
    },
    [dismissAllVisibleRecentlyCompletedFeatures]
  );

  // Handle right-click context menu for recently completed features
  const handleRecentlyCompletedContextMenu = useCallback(
    (e: React.MouseEvent, feature: RecentlyCompletedContextMenu['feature']) => {
      e.preventDefault();
      e.stopPropagation();

      // Menu dimensions (approximate)
      const menuWidth = 180;
      const menuHeight = 100;
      const padding = 8;

      // Calculate position with boundary checks
      let x = e.clientX;
      let y = e.clientY;

      // Check right edge
      if (x + menuWidth + padding > window.innerWidth) {
        x = window.innerWidth - menuWidth - padding;
      }

      // Check bottom edge
      if (y + menuHeight + padding > window.innerHeight) {
        y = window.innerHeight - menuHeight - padding;
      }

      // Ensure not negative
      x = Math.max(padding, x);
      y = Math.max(padding, y);

      setContextMenu({ x, y, feature });
    },
    []
  );

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Handle context menu action
  const handleContextMenuAction = useCallback(
    (action: 'view' | 'dismiss' | 'archive') => {
      if (!contextMenu) return;

      const { feature } = contextMenu;
      closeContextMenu();

      switch (action) {
        case 'view':
          handleNavigateToRecentlyCompleted(feature);
          break;
        case 'dismiss':
          dismissRecentlyCompletedFeature(feature.featureId);
          break;
        case 'archive':
          // Dismiss from recently completed (effectively archives it from this view)
          dismissRecentlyCompletedFeature(feature.featureId);
          break;
      }
    },
    [
      contextMenu,
      closeContextMenu,
      handleNavigateToRecentlyCompleted,
      dismissRecentlyCompletedFeature,
    ]
  );

  // Close context menu on click outside or scroll
  useEffect(() => {
    if (!contextMenu) return;

    const handleClick = () => closeContextMenu();
    const handleScroll = () => closeContextMenu();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeContextMenu();
      }
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu, closeContextMenu]);

  // ── Notification action handlers (optimistic update + server sync) ──

  // Mark a single notification as read
  const handleNotificationMarkAsRead = useCallback(
    async (notification: Notification, e: React.MouseEvent) => {
      e.stopPropagation();
      if (notification.read) return;

      // Optimistic update in store
      storeMarkAsRead(notification.id);

      // Sync with server
      try {
        const api = getHttpApiClient();
        await api.notifications.markAsRead(notification.projectPath, notification.id);
      } catch (error) {
        logger.error('Failed to mark notification as read:', error);
      }
    },
    [storeMarkAsRead]
  );

  // Dismiss (remove) a single notification
  const handleNotificationDismiss = useCallback(
    async (notification: Notification, e: React.MouseEvent) => {
      e.stopPropagation();

      // Optimistic update in store
      storeDismissNotification(notification.id);

      // Sync with server
      try {
        const api = getHttpApiClient();
        await api.notifications.dismiss(notification.projectPath, notification.id);
      } catch (error) {
        logger.error('Failed to dismiss notification:', error);
      }
    },
    [storeDismissNotification]
  );

  // Mark all notifications as read (across all projects)
  const handleNotificationMarkAllAsRead = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      // Optimistic update in store
      storeMarkAllAsRead();

      // Sync with server for each project that has notifications
      try {
        const api = getHttpApiClient();
        const projectPaths = [...new Set(notifications.map((n) => n.projectPath))];
        await Promise.all(
          projectPaths.map((projectPath) => api.notifications.markAsRead(projectPath))
        );
      } catch (error) {
        logger.error('Failed to mark all notifications as read:', error);
      }
    },
    [storeMarkAllAsRead, notifications]
  );

  // Dismiss all notifications (across all projects)
  const handleNotificationDismissAll = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      // Optimistic update in store
      storeDismissAll();

      // Sync with server for each project that has notifications
      try {
        const api = getHttpApiClient();
        const projectPaths = [...new Set(notifications.map((n) => n.projectPath))];
        await Promise.all(
          projectPaths.map((projectPath) => api.notifications.dismiss(projectPath))
        );
      } catch (error) {
        logger.error('Failed to dismiss all notifications:', error);
      }
    },
    [storeDismissAll, notifications]
  );

  // Navigate to a notification's associated feature or the notifications page
  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      // Mark as read on click (optimistic + server sync)
      if (!notification.read) {
        storeMarkAsRead(notification.id);
        const api = getHttpApiClient();
        api.notifications.markAsRead(notification.projectPath, notification.id).catch((error) => {
          logger.error('Failed to mark notification as read on click:', error);
        });
      }

      // Navigate to the project's board view
      const project = projects.find((p) => p.path === notification.projectPath);
      if (project) {
        setShowAllProjects(false);
        setCurrentProject(project);
      }
      onNavigate('/board');
      setIsOpen(false);
    },
    [projects, setCurrentProject, setShowAllProjects, onNavigate, storeMarkAsRead]
  );

  // Size-specific styles
  const sizeStyles = {
    sm: {
      button: 'h-7 px-2',
      iconContainer: 'w-4 h-4',
      icon: 'w-3 h-3',
      badge: 'min-w-4 h-4 px-1 text-[9px]',
      badgeIcon: 'w-2 h-2',
      pulseOuter: 'h-1.5 w-1.5',
      pulseInner: 'h-1.5 w-1.5',
    },
    default: {
      button: 'h-8 px-3',
      iconContainer: 'w-5 h-5',
      icon: 'w-3.5 h-3.5',
      badge: 'min-w-5 h-5 px-1.5 text-[10px]',
      badgeIcon: 'w-2.5 h-2.5',
      pulseOuter: 'h-2 w-2',
      pulseInner: 'h-2 w-2',
    },
  };

  const styles = sizeStyles[size];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'flex items-center gap-2',
            'hover:bg-accent/50 transition-colors duration-150',
            'font-medium text-sm',
            styles.button,
            hasActivity && 'bg-green-500/10',
            className
          )}
          data-testid="running-agents-indicator"
        >
          {/* Activity Icon with animated pulse when agents are running */}
          <div className="relative">
            <div
              className={cn(
                'rounded flex items-center justify-center',
                styles.iconContainer,
                hasActivity ? 'bg-green-500/20' : 'bg-muted'
              )}
            >
              <Activity
                className={cn(
                  styles.icon,
                  hasActivity ? 'text-green-500' : 'text-muted-foreground'
                )}
              />
            </div>
            {/* Animated pulse indicator when agents are running */}
            {runningAgentsCount > 0 && (
              <span className={cn('absolute -top-0.5 -right-0.5 flex', styles.pulseOuter)}>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span
                  className={cn(
                    'relative inline-flex rounded-full bg-green-500',
                    styles.pulseInner
                  )}
                />
              </span>
            )}
          </div>

          {/* Label */}
          {showLabel && <span>Agents</span>}

          {/* Dual status badges */}
          <div className="flex items-center gap-1">
            {/* Running count badge */}
            {runningAgentsCount > 0 && (
              <span
                className={cn(
                  'flex items-center justify-center gap-0.5',
                  'font-bold rounded-full',
                  'bg-green-500 text-white',
                  styles.badge
                )}
                title={`${runningAgentsCount} agent${runningAgentsCount !== 1 ? 's' : ''} running`}
                data-testid="running-count-badge"
              >
                <Bot className={styles.badgeIcon} />
                {runningAgentsCount}
              </span>
            )}

            {/* Waiting approval count badge */}
            {waitingApprovalCount > 0 && (
              <span
                className={cn(
                  'flex items-center justify-center gap-0.5',
                  'font-bold rounded-full',
                  'bg-amber-500 text-white',
                  styles.badge
                )}
                title={`${waitingApprovalCount} agent${waitingApprovalCount !== 1 ? 's' : ''} waiting for approval`}
                data-testid="waiting-approval-count-badge"
              >
                <Clock className={styles.badgeIcon} />
                {waitingApprovalCount}
              </span>
            )}

            {/* Recently completed count badge */}
            {recentlyCompletedFeatures.length > 0 && (
              <span
                className={cn(
                  'flex items-center justify-center gap-0.5',
                  'font-bold rounded-full',
                  'bg-blue-500 text-white',
                  styles.badge
                )}
                title={`${recentlyCompletedFeatures.length} feature${recentlyCompletedFeatures.length !== 1 ? 's' : ''} recently completed`}
                data-testid="recently-completed-count-badge"
              >
                <CheckCircle className={styles.badgeIcon} />
                {recentlyCompletedFeatures.length}
              </span>
            )}

            {/* Unread notifications count badge */}
            {notificationUnreadCount > 0 && (
              <span
                className={cn(
                  'flex items-center justify-center gap-0.5',
                  'font-bold rounded-full',
                  'bg-purple-500 text-white',
                  styles.badge
                )}
                title={`${notificationUnreadCount} unread notification${notificationUnreadCount !== 1 ? 's' : ''}`}
                data-testid="notifications-count-badge"
              >
                <Bell className={styles.badgeIcon} />
                {notificationUnreadCount}
              </span>
            )}
          </div>

          {/* Dropdown chevron */}
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0" data-testid="running-agents-dropdown">
        <div className="flex flex-col">
          {/* Header */}
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-brand-500" />
              <span className="text-sm font-medium">Running Agents</span>
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <Timer className="w-2.5 h-2.5" />
                {secondsUntilRefresh}s
              </span>
            </div>
            <div className="flex items-center gap-1">
              {runningAgentsCount > 0 && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-green-500 text-white">
                  <Bot className="w-2.5 h-2.5" />
                  {runningAgentsCount}
                </span>
              )}
              {waitingApprovalCount > 0 && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-white">
                  <Clock className="w-2.5 h-2.5" />
                  {waitingApprovalCount}
                </span>
              )}
              {notificationUnreadCount > 0 && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-purple-500 text-white">
                  <Bell className="w-2.5 h-2.5" />
                  {notificationUnreadCount}
                </span>
              )}
            </div>
          </div>

          {/* Agent List - Grouped by Project */}
          <ScrollArea className="max-h-80">
            {projectGroups.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No agents currently running</p>
              </div>
            ) : (
              <div className="p-1">
                {projectGroups.map((group, projectIndex) => {
                  const projectAgents = agentsByProject.get(group.projectPath) || [];
                  const isExpanded = expandedProjects.has(group.projectPath);

                  return (
                    <ProjectGroup
                      key={group.projectPath}
                      projectPath={group.projectPath}
                      projectName={group.projectName}
                      agents={projectAgents}
                      isExpanded={isExpanded}
                      onToggle={() => toggleProjectExpanded(group.projectPath)}
                      onNavigateToAgent={handleNavigateToAgent}
                      onStopAgent={handleStopAgent}
                      stoppingAgents={stoppingAgents}
                      showSeparator={projectIndex > 0}
                    />
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Recently Completed Features Section */}
          {recentlyCompletedFeatures.length > 0 && (
            <>
              <div className="px-3 py-2 border-t border-border flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium">Recently Completed</span>
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-500 text-white">
                    {recentlyCompletedFeatures.length}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleCompleteAll}
                  title="Archive all recently completed features"
                  data-testid="complete-all-button"
                >
                  <Archive className="w-3 h-3 mr-1" />
                  Complete All
                </Button>
              </div>
              <ScrollArea className="max-h-40">
                <div className="p-1">
                  {recentlyCompletedFeatures.map((feature) => (
                    <div
                      key={feature.featureId}
                      className={cn(
                        'group flex items-start gap-2 p-2 rounded-md cursor-pointer',
                        'hover:bg-accent/50 transition-colors',
                        'bg-blue-500/5'
                      )}
                      onClick={() => handleNavigateToRecentlyCompleted(feature)}
                      onContextMenu={(e) => handleRecentlyCompletedContextMenu(e, feature)}
                    >
                      {/* Status indicator */}
                      <div className="mt-0.5 shrink-0">
                        <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
                          <CheckCircle className="w-3 h-3 text-blue-500" />
                        </div>
                      </div>

                      {/* Feature info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-medium truncate">
                            {feature.title || 'Untitled Feature'}
                          </span>
                          <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {feature.projectName}
                        </div>
                      </div>

                      {/* Dismiss button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                        onClick={(e) => handleDismissRecentlyCompleted(feature.featureId, e)}
                        title="Dismiss"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}

          {/* Notifications Section */}
          {notifications.length > 0 && (
            <>
              <div className="px-3 py-2 border-t border-border flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-medium">Notifications</span>
                  {notificationUnreadCount > 0 && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-purple-500 text-white">
                      {notificationUnreadCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* Mark all as read button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={handleNotificationMarkAllAsRead}
                    disabled={notificationUnreadCount === 0}
                    title="Mark all as read"
                    data-testid="mark-all-notifications-read-button"
                  >
                    <CheckCheck className="w-3 h-3" />
                  </Button>
                  {/* Dismiss all button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={handleNotificationDismissAll}
                    title="Dismiss all notifications"
                    data-testid="dismiss-all-notifications-button"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <ScrollArea className="max-h-40">
                <div className="p-1">
                  {notifications.slice(0, 5).map((notification) => (
                    <div
                      key={notification.id}
                      className={cn(
                        'group flex items-start gap-2 p-2 rounded-md cursor-pointer',
                        'hover:bg-accent/50 transition-colors',
                        !notification.read && 'bg-purple-500/5'
                      )}
                      onClick={() => handleNotificationClick(notification)}
                      data-testid={`notification-item-${notification.id}`}
                    >
                      {/* Unread indicator */}
                      <div className="mt-0.5 shrink-0">
                        <div
                          className={cn(
                            'w-5 h-5 rounded-full flex items-center justify-center',
                            !notification.read ? 'bg-purple-500/20' : 'bg-muted'
                          )}
                        >
                          <Bell
                            className={cn(
                              'w-3 h-3',
                              !notification.read ? 'text-purple-500' : 'text-muted-foreground'
                            )}
                          />
                        </div>
                      </div>

                      {/* Notification info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span
                            className={cn(
                              'text-sm truncate',
                              !notification.read
                                ? 'font-medium'
                                : 'font-normal text-muted-foreground'
                            )}
                          >
                            {notification.title}
                          </span>
                          {!notification.read && (
                            <span className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0" />
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {notification.message}
                        </div>
                      </div>

                      {/* Per-notification action buttons */}
                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Mark as read button (only show for unread) */}
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-purple-500/20 hover:text-purple-500"
                            onClick={(e) => handleNotificationMarkAsRead(notification, e)}
                            title="Mark as read"
                            data-testid={`notification-mark-read-${notification.id}`}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                        {/* Dismiss button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-muted"
                          onClick={(e) => handleNotificationDismiss(notification, e)}
                          title="Dismiss"
                          data-testid={`notification-dismiss-${notification.id}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}

          {/* Footer */}
          {(projectGroups.length > 0 ||
            recentlyCompletedFeatures.length > 0 ||
            notifications.length > 0) && (
            <div className="px-3 py-2 border-t border-border bg-muted/30">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => {
                  onNavigate('/board');
                  setIsOpen(false);
                }}
              >
                View in Board
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>

      {/* Context menu for recently completed features */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          role="menu"
          aria-label="Recently completed feature options"
          className="fixed z-[100] min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground cursor-default outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            onClick={() => handleContextMenuAction('view')}
          >
            <Eye className="h-4 w-4" />
            <span className="flex-1 text-left">View in Board</span>
          </button>
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground cursor-default outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            onClick={() => handleContextMenuAction('archive')}
          >
            <Archive className="h-4 w-4" />
            <span className="flex-1 text-left">Archive</span>
          </button>
          <div role="separator" className="my-1 h-px bg-border" />
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground cursor-default outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            onClick={() => handleContextMenuAction('dismiss')}
          >
            <X className="h-4 w-4" />
            <span className="flex-1 text-left">Dismiss</span>
          </button>
        </div>
      )}
    </Popover>
  );
}

/**
 * Compact version of RunningAgentsIndicator for space-constrained contexts
 * Shows only badges without the Activity icon when there's activity
 */
export function RunningAgentsIndicatorCompact({
  onNavigate,
  className,
}: Omit<RunningAgentsIndicatorProps, 'showLabel' | 'size' | 'location'>) {
  return (
    <RunningAgentsIndicator
      onNavigate={onNavigate}
      className={className}
      showLabel={false}
      size="sm"
    />
  );
}

export default RunningAgentsIndicator;
