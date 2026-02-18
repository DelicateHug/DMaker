import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Wand2, ClipboardCheck, Zap, CheckCircle2, RefreshCw } from 'lucide-react';
import { UsagePopover } from '@/components/usage-popover';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { useIsTablet } from '@/hooks/use-media-query';
import { AutoModeModal } from '@/components/dialogs/auto-mode-modal';
import { PlanSettingsPopover } from './dialogs/plan-settings-popover';
import { BoardSearchBar } from './board-search-bar';
import { BoardControls } from './board-controls';
import { ViewToggle, type ViewMode } from './components';
import { HeaderMobileMenu } from './header-mobile-menu';
import { VoiceButton } from '@/components/ui/voice-button';

export type { ViewMode };

/**
 * BoardHeader - Board-specific toolbar controls (Row 2 of the 2-row toolbar layout)
 *
 * This component provides board-specific controls:
 * - Search bar for filtering features
 * - View toggle (Kanban/List)
 * - Completed features button
 * - Board background settings
 * - Usage popover (Claude/Codex usage tracking)
 * - Auto Mode button with modal
 * - Plan button with settings
 *
 * Note: Global navigation controls (Project, Tasks, GitHub, Tools, Settings, Git)
 * are located in TopNavigationBar (Row 1) for a consolidated 2-row toolbar layout.
 * Branch/worktree controls (including Worktree Bar toggle) are in the Git dropdown in TopNavigationBar.
 *
 * Phase 2: T005 - Consolidated toolbar row with Usage, Auto Mode, Plan
 * Phase 2: T007 - Integration with TopNavigationBar for 2-row layout
 */
interface BoardHeaderProps {
  projectPath: string;
  runningAgentsCount: number;
  isAutoModeRunning: boolean;
  onAutoModeToggle: (enabled: boolean) => void;
  onOpenPlanDialog: () => void;
  hasPendingPlan?: boolean;
  onOpenPendingPlan?: () => void;
  isMounted: boolean;
  // Search bar props
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isCreatingSpec: boolean;
  creatingSpecProjectPath?: string;
  // Favorites filter props
  showFavoritesOnly: boolean;
  onShowFavoritesOnlyChange: (show: boolean) => void;
  // Board controls props
  onShowBoardBackground: () => void;
  // View toggle props
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  // Completed features props
  onShowCompletedModal?: () => void;
  completedCount?: number;
  // Auto mode modal control (optional, for keyboard shortcut support)
  isAutoModeModalOpen?: boolean;
  onAutoModeModalOpenChange?: (open: boolean) => void;
  // Refresh button props
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

// Shared styles for header control containers
const controlContainerClass =
  'flex items-center gap-1.5 px-3 h-8 rounded-md bg-secondary border border-border';

export function BoardHeader({
  projectPath,
  runningAgentsCount,
  isAutoModeRunning,
  onAutoModeToggle,
  onOpenPlanDialog,
  hasPendingPlan,
  onOpenPendingPlan,
  isMounted,
  searchQuery,
  onSearchChange,
  isCreatingSpec,
  creatingSpecProjectPath,
  showFavoritesOnly,
  onShowFavoritesOnlyChange,
  onShowBoardBackground,
  viewMode,
  onViewModeChange,
  onShowCompletedModal,
  completedCount = 0,
  isAutoModeModalOpen: externalAutoModeModalOpen,
  onAutoModeModalOpenChange: externalAutoModeModalOpenChange,
  onRefresh,
  isRefreshing = false,
}: BoardHeaderProps) {
  const claudeAuthStatus = useSetupStore((state) => state.claudeAuthStatus);
  const planUseSelectedWorktreeBranch = useAppStore((state) => state.planUseSelectedWorktreeBranch);
  const setPlanUseSelectedWorktreeBranch = useAppStore(
    (state) => state.setPlanUseSelectedWorktreeBranch
  );
  const codexAuthStatus = useSetupStore((state) => state.codexAuthStatus);

  const isClaudeCliVerified = !!claudeAuthStatus?.authenticated;
  const showClaudeUsage = isClaudeCliVerified;

  // Codex usage tracking visibility logic
  // Show if Codex is authenticated (CLI or API key)
  const showCodexUsage = !!codexAuthStatus?.authenticated;

  // State for mobile actions panel
  const [showActionsPanel, setShowActionsPanel] = useState(false);

  // State for auto mode modal - use external control if provided, otherwise use local state
  const [localAutoModeModalOpen, setLocalAutoModeModalOpen] = useState(false);
  const isAutoModeModalOpen = externalAutoModeModalOpen ?? localAutoModeModalOpen;
  const setIsAutoModeModalOpen = externalAutoModeModalOpenChange ?? setLocalAutoModeModalOpen;

  const isTablet = useIsTablet();

  return (
    <div
      className="flex items-center justify-between gap-5 p-4 border-b border-border bg-glass backdrop-blur-md"
      data-testid="board-header"
    >
      <div className="flex items-center gap-4">
        <BoardSearchBar
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          isCreatingSpec={isCreatingSpec}
          creatingSpecProjectPath={creatingSpecProjectPath}
          currentProjectPath={projectPath}
          showFavoritesOnly={showFavoritesOnly}
          onShowFavoritesOnlyChange={onShowFavoritesOnlyChange}
        />
        {isMounted && <ViewToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />}
        {/* Completed Features Toggle Button */}
        {isMounted && onShowCompletedModal && (
          <Button
            variant="outline"
            size="sm"
            onClick={onShowCompletedModal}
            className="h-8 px-3 gap-2 relative"
            title={`View Completed Features (${completedCount})`}
            data-testid="completed-toggle-button"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-medium">Completed</span>
            {completedCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-brand-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {completedCount > 99 ? '99+' : completedCount}
              </span>
            )}
          </Button>
        )}
        <BoardControls isMounted={isMounted} onShowBoardBackground={onShowBoardBackground} />
        {/* Refresh Button */}
        {isMounted && onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-8 w-8 p-0"
            title="Refresh Features"
            data-testid="refresh-features-button"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>

      {/* Tablet/Mobile view: show hamburger menu with all controls */}
      {isMounted && isTablet && (
        <>
          <HeaderMobileMenu
            isOpen={showActionsPanel}
            onToggle={() => setShowActionsPanel(!showActionsPanel)}
            runningAgentsCount={runningAgentsCount}
            isAutoModeRunning={isAutoModeRunning}
            onOpenAutoModeModal={() => setIsAutoModeModalOpen(true)}
            onOpenPlanDialog={onOpenPlanDialog}
            showClaudeUsage={showClaudeUsage}
            showCodexUsage={showCodexUsage}
            onShowCompletedModal={onShowCompletedModal}
            completedCount={completedCount}
          />
          <AutoModeModal open={isAutoModeModalOpen} onOpenChange={setIsAutoModeModalOpen} />
        </>
      )}

      {/* Desktop view: Consolidated toolbar row with Usage, Auto Mode, Plan */}
      {isMounted && !isTablet && (
        <div className="flex items-center gap-2" data-testid="toolbar-row">
          {/* Usage Popover */}
          {(showClaudeUsage || showCodexUsage) && <UsagePopover />}

          {/* Auto Mode Button */}
          <Button
            variant={isAutoModeRunning ? 'default' : 'outline'}
            size="sm"
            onClick={() => setIsAutoModeModalOpen(true)}
            className={
              isAutoModeRunning
                ? 'bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-600 text-white border-0'
                : ''
            }
            data-testid="auto-mode-button"
          >
            <Zap className="w-4 h-4 mr-1.5" />
            <span className="text-xs font-medium whitespace-nowrap">Auto Mode</span>
            {isAutoModeRunning && runningAgentsCount > 0 && (
              <span className="ml-1.5 flex items-center gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                </span>
                <span className="text-xs">{runningAgentsCount}</span>
              </span>
            )}
          </Button>
          <AutoModeModal open={isAutoModeModalOpen} onOpenChange={setIsAutoModeModalOpen} />

          {/* Voice Mode Button */}
          <VoiceButton variant="outline" size="sm" />

          {/* Plan Button with Settings */}
          <div className={controlContainerClass} data-testid="plan-button-container">
            {hasPendingPlan && (
              <button
                onClick={onOpenPendingPlan || onOpenPlanDialog}
                className="flex items-center gap-1.5 text-emerald-500 hover:text-emerald-400 transition-colors"
                data-testid="plan-review-button"
              >
                <ClipboardCheck className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onOpenPlanDialog}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              data-testid="plan-backlog-button"
            >
              <Wand2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Plan</span>
            </button>
            <PlanSettingsPopover
              planUseSelectedWorktreeBranch={planUseSelectedWorktreeBranch}
              onPlanUseSelectedWorktreeBranchChange={setPlanUseSelectedWorktreeBranch}
            />
          </div>
        </div>
      )}
    </div>
  );
}
