import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  HeaderActionsPanel,
  HeaderActionsPanelTrigger,
} from '@/components/ui/header-actions-panel';
import { Bot, Wand2, Zap, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MobileUsageBar } from './mobile-usage-bar';
import { useAppStore } from '@/store/app-store';

interface HeaderMobileMenuProps {
  // Panel visibility
  isOpen: boolean;
  onToggle: () => void;
  // Running agents info
  runningAgentsCount: number;
  // Auto mode
  isAutoModeRunning: boolean;
  onOpenAutoModeModal: () => void;
  // Plan button
  onOpenPlanDialog: () => void;
  // Usage bar visibility
  showClaudeUsage: boolean;
  showCodexUsage: boolean;
  // Completed features
  onShowCompletedModal?: () => void;
  completedCount?: number;
}

export function HeaderMobileMenu({
  isOpen,
  onToggle,
  runningAgentsCount,
  isAutoModeRunning,
  onOpenAutoModeModal,
  onOpenPlanDialog,
  showClaudeUsage,
  showCodexUsage,
  onShowCompletedModal,
  completedCount = 0,
}: HeaderMobileMenuProps) {
  const agentMultiplier = useAppStore((state) => state.agentMultiplier);
  const setAgentMultiplier = useAppStore((state) => state.setAgentMultiplier);

  return (
    <>
      <HeaderActionsPanelTrigger isOpen={isOpen} onToggle={onToggle} />
      <HeaderActionsPanel isOpen={isOpen} onClose={onToggle} title="Board Controls">
        {/* Usage Bar - show if either provider is authenticated */}
        {(showClaudeUsage || showCodexUsage) && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Usage
            </span>
            <MobileUsageBar showClaudeUsage={showClaudeUsage} showCodexUsage={showCodexUsage} />
          </div>
        )}

        {/* Controls Section */}
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Controls
          </span>

          {/* Auto Mode Button */}
          <Button
            variant={isAutoModeRunning ? 'default' : 'outline'}
            className={cn(
              'w-full justify-between',
              isAutoModeRunning &&
                'bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-600 text-white border-0'
            )}
            onClick={() => {
              onOpenAutoModeModal();
              onToggle();
            }}
            data-testid="mobile-auto-mode-button"
          >
            <div className="flex items-center gap-2">
              <Zap
                className={cn(
                  'w-4 h-4',
                  isAutoModeRunning ? 'text-white' : 'text-muted-foreground'
                )}
              />
              <span className="text-sm font-medium">Auto Mode</span>
            </div>
            {isAutoModeRunning && runningAgentsCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </span>
                <span className="text-xs">{runningAgentsCount} running</span>
              </div>
            )}
          </Button>

          {/* Concurrency Control */}
          <div
            className="p-3 rounded-lg border border-border/50"
            data-testid="mobile-concurrency-control"
          >
            <div className="flex items-center gap-2 mb-3">
              <Bot className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Max Agents</span>
              <span
                className="text-sm text-muted-foreground ml-auto"
                data-testid="mobile-concurrency-value"
              >
                {runningAgentsCount}/{agentMultiplier}
              </span>
            </div>
            <Slider
              value={[agentMultiplier]}
              onValueChange={(value) => {
                setAgentMultiplier(value[0]);
              }}
              min={1}
              max={20}
              step={1}
              className="w-full"
              data-testid="mobile-concurrency-slider"
            />
            <p className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
              Maximum number of concurrent agents across all projects.
            </p>
          </div>

          {/* Plan Button */}
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              onOpenPlanDialog();
              onToggle();
            }}
            data-testid="mobile-plan-button"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            Plan
          </Button>

          {/* Completed Features Button */}
          {onShowCompletedModal && (
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => {
                onShowCompletedModal();
                onToggle();
              }}
              data-testid="mobile-completed-button"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Completed Features</span>
              </div>
              {completedCount > 0 && (
                <span className="bg-brand-500 text-white text-xs font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1.5">
                  {completedCount > 99 ? '99+' : completedCount}
                </span>
              )}
            </Button>
          )}
        </div>
      </HeaderActionsPanel>
    </>
  );
}
