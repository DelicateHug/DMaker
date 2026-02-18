import { useState, useCallback, useMemo, type ReactNode } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  LogIn,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getElectronAPI } from '@/lib/electron';
import { AnthropicIcon, OpenAIIcon } from '@/components/ui/provider-icon';
import {
  useClaudeUsageTracking,
  useCodexUsageTracking,
  useUsageTracking,
  USAGE_ERROR_CODES,
  type UsageError,
} from '@/hooks/use-usage-tracking';
import { useSetupStore } from '@/store/setup-store';
import type { ClaudeUsage, CodexUsage } from '@/store/app-store';

// ============================================================================
// Status Helpers
// ============================================================================

export type UsageStatus = 'ok' | 'warning' | 'critical';

export interface StatusInfo {
  status: UsageStatus;
  color: string;
  icon: typeof CheckCircle;
  bg: string;
}

/**
 * Get status information based on usage percentage
 */
export function getStatusInfo(percentage: number): StatusInfo {
  if (percentage >= 75) {
    return { status: 'critical', color: 'text-red-500', icon: XCircle, bg: 'bg-red-500' };
  }
  if (percentage >= 50) {
    return {
      status: 'warning',
      color: 'text-orange-500',
      icon: AlertTriangle,
      bg: 'bg-orange-500',
    };
  }
  return { status: 'ok', color: 'text-green-500', icon: CheckCircle, bg: 'bg-green-500' };
}

/**
 * Get progress bar color based on percentage
 */
export function getProgressBarColor(percentage: number): string {
  if (percentage >= 80) return 'bg-red-500';
  if (percentage >= 50) return 'bg-yellow-500';
  return 'bg-green-500';
}

// ============================================================================
// Progress Bar Component
// ============================================================================

export interface ProgressBarProps {
  percentage: number;
  colorClass?: string;
  className?: string;
  showBackground?: boolean;
}

export function ProgressBar({
  percentage,
  colorClass,
  className,
  showBackground = true,
}: ProgressBarProps) {
  const safePercentage = Math.min(Math.max(percentage, 0), 100);
  const bgColor = colorClass ?? getProgressBarColor(safePercentage);

  return (
    <div
      className={cn(
        'h-2 w-full rounded-full overflow-hidden',
        showBackground && 'bg-secondary/50',
        className
      )}
    >
      <div
        className={cn('h-full transition-all duration-500', bgColor)}
        style={{ width: `${safePercentage}%` }}
      />
    </div>
  );
}

// ============================================================================
// Usage Card Component
// ============================================================================

export interface UsageCardProps {
  title: string;
  subtitle: string;
  percentage: number;
  resetText?: string;
  isPrimary?: boolean;
  stale?: boolean;
  className?: string;
}

export function UsageCard({
  title,
  subtitle,
  percentage,
  resetText,
  isPrimary = false,
  stale = false,
  className,
}: UsageCardProps) {
  const isValidPercentage =
    typeof percentage === 'number' && !isNaN(percentage) && isFinite(percentage);
  const safePercentage = isValidPercentage ? percentage : 0;

  const status = getStatusInfo(safePercentage);
  const StatusIcon = status.icon;

  return (
    <div
      className={cn(
        'rounded-xl border bg-card/50 p-4 transition-opacity',
        isPrimary ? 'border-border/60 shadow-sm' : 'border-border/40',
        (stale || !isValidPercentage) && 'opacity-50',
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className={cn('font-semibold', isPrimary ? 'text-sm' : 'text-xs')}>{title}</h4>
          <p className="text-[10px] text-muted-foreground">{subtitle}</p>
        </div>
        {isValidPercentage ? (
          <div className="flex items-center gap-1.5">
            <StatusIcon className={cn('w-3.5 h-3.5', status.color)} />
            <span
              className={cn(
                'font-mono font-bold',
                status.color,
                isPrimary ? 'text-base' : 'text-sm'
              )}
            >
              {Math.round(safePercentage)}%
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">N/A</span>
        )}
      </div>
      <ProgressBar
        percentage={safePercentage}
        colorClass={isValidPercentage ? status.bg : 'bg-muted-foreground/30'}
      />
      {resetText && (
        <div className="mt-2 flex justify-end">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {resetText}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Error Display Component
// ============================================================================

export interface UsageErrorDisplayProps {
  error: UsageError;
  provider: 'claude' | 'codex';
  onRelogin?: () => void;
  isRelogging?: boolean;
  className?: string;
}

export function UsageErrorDisplay({
  error,
  provider,
  onRelogin,
  isRelogging = false,
  className,
}: UsageErrorDisplayProps) {
  const getErrorMessage = () => {
    if (error.code === USAGE_ERROR_CODES.API_BRIDGE_UNAVAILABLE) {
      return 'Ensure the Electron bridge is running or restart the app';
    }
    if (error.code === USAGE_ERROR_CODES.TRUST_PROMPT) {
      return (
        <>
          Run <code className="font-mono bg-muted px-1 rounded">claude</code> in your terminal and
          approve access to continue
        </>
      );
    }
    if (error.code === USAGE_ERROR_CODES.NOT_AVAILABLE && provider === 'codex') {
      return (
        <>
          Codex CLI doesn't provide usage statistics. Check{' '}
          <a
            href="https://platform.openai.com/usage"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            OpenAI dashboard
          </a>{' '}
          for usage details.
        </>
      );
    }
    if (provider === 'claude') {
      return (
        <>
          Make sure Claude CLI is installed and authenticated via{' '}
          <code className="font-mono bg-muted px-1 rounded">claude login</code>
        </>
      );
    }
    return (
      <>
        Make sure Codex CLI is installed and authenticated via{' '}
        <code className="font-mono bg-muted px-1 rounded">codex login</code>
      </>
    );
  };

  const showReloginButton = error.code === USAGE_ERROR_CODES.AUTH_ERROR && onRelogin;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-6 text-center space-y-3',
        className
      )}
    >
      <AlertTriangle className="w-8 h-8 text-yellow-500/80" />
      <div className="space-y-1 flex flex-col items-center">
        <p className="text-sm font-medium">
          {error.code === USAGE_ERROR_CODES.NOT_AVAILABLE ? 'Usage not available' : error.message}
        </p>
        <p className="text-xs text-muted-foreground">{getErrorMessage()}</p>
      </div>
      {showReloginButton && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRelogin}
          disabled={isRelogging}
          className="mt-2 h-8 text-xs gap-1.5"
        >
          <LogIn className={cn('w-3.5 h-3.5', isRelogging && 'animate-pulse')} />
          {isRelogging ? 'Re-logging in...' : 'Re-login'}
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Loading Display Component
// ============================================================================

export interface UsageLoadingDisplayProps {
  message?: string;
  className?: string;
}

export function UsageLoadingDisplay({
  message = 'Loading usage data...',
  className,
}: UsageLoadingDisplayProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-8 space-y-2', className)}>
      <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

// ============================================================================
// Claude Usage Display Component
// ============================================================================

export interface ClaudeUsageDisplayProps {
  usage: ClaudeUsage | null;
  isStale?: boolean;
  loading?: boolean;
  error?: UsageError | null;
  onRefresh?: () => void;
  onRelogin?: () => void;
  isRelogging?: boolean;
  showHeader?: boolean;
  showFooter?: boolean;
  compact?: boolean;
  refreshCountdown?: number | null;
  className?: string;
}

export function ClaudeUsageDisplay({
  usage,
  isStale = false,
  loading = false,
  error = null,
  onRefresh,
  onRelogin,
  isRelogging = false,
  showHeader = true,
  showFooter = true,
  compact = false,
  refreshCountdown,
  className,
}: ClaudeUsageDisplayProps) {
  if (error) {
    return (
      <div className={className}>
        {showHeader && (
          <UsageDisplayHeader
            title="Claude Usage"
            subtitle={usage?.accountEmail}
            icon={<AnthropicIcon className="w-4 h-4" />}
            onRefresh={onRefresh}
            loading={loading}
          />
        )}
        <UsageErrorDisplay
          error={error}
          provider="claude"
          onRelogin={onRelogin}
          isRelogging={isRelogging}
        />
      </div>
    );
  }

  if (!usage) {
    return (
      <div className={className}>
        {showHeader && (
          <UsageDisplayHeader title="Claude Usage" icon={<AnthropicIcon className="w-4 h-4" />} />
        )}
        <UsageLoadingDisplay />
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {showHeader && (
        <UsageDisplayHeader
          title="Claude Usage"
          subtitle={usage.accountEmail}
          icon={<AnthropicIcon className="w-4 h-4" />}
          onRefresh={onRefresh}
          loading={loading}
          refreshCountdown={refreshCountdown}
        />
      )}

      <div className={cn('space-y-4', compact ? 'p-0' : 'p-4')}>
        {/* Primary Card: Session Usage */}
        <UsageCard
          title="Session Usage"
          subtitle="5-hour rolling window"
          percentage={usage.sessionPercentage}
          resetText={usage.sessionResetText}
          isPrimary={true}
          stale={isStale}
        />

        {/* Secondary Cards Grid */}
        <div className="grid grid-cols-2 gap-3">
          <UsageCard
            title="Weekly"
            subtitle="All models"
            percentage={usage.weeklyPercentage}
            resetText={usage.weeklyResetText}
            stale={isStale}
          />
          <UsageCard
            title="Sonnet"
            subtitle="Weekly"
            percentage={usage.sonnetWeeklyPercentage}
            resetText={usage.sonnetResetText}
            stale={isStale}
          />
        </div>

        {/* Extra Usage / Cost */}
        {usage.costLimit && usage.costLimit > 0 && (
          <UsageCard
            title="Extra Usage"
            subtitle={`${usage.costUsed ?? 0} / ${usage.costLimit} ${usage.costCurrency ?? ''}`}
            percentage={usage.costLimit > 0 ? ((usage.costUsed ?? 0) / usage.costLimit) * 100 : 0}
            stale={isStale}
          />
        )}
      </div>

      {showFooter && (
        <UsageDisplayFooter
          statusLink="https://status.claude.com"
          statusLabel="Claude Status"
          refreshCountdown={refreshCountdown}
          updateInterval="Refreshes every 30s"
        />
      )}
    </div>
  );
}

// ============================================================================
// Codex Usage Display Component
// ============================================================================

/**
 * Helper to format reset time for Codex
 */
function formatCodexResetTime(unixTimestamp: number): string {
  const date = new Date(unixTimestamp * 1000);
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff < 3600000) {
    const mins = Math.ceil(diff / 60000);
    return `Resets in ${mins}m`;
  }
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    const mins = Math.ceil((diff % 3600000) / 60000);
    return `Resets in ${hours}h${mins > 0 ? ` ${mins}m` : ''}`;
  }
  return `Resets ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Helper to format window duration for Codex
 */
function getCodexWindowLabel(durationMins: number): { title: string; subtitle: string } {
  if (durationMins < 60) {
    return { title: `${durationMins}min Window`, subtitle: 'Rate limit' };
  }
  if (durationMins < 1440) {
    const hours = Math.round(durationMins / 60);
    return { title: `${hours}h Window`, subtitle: 'Rate limit' };
  }
  const days = Math.round(durationMins / 1440);
  return { title: `${days}d Window`, subtitle: 'Rate limit' };
}

export interface CodexUsageDisplayProps {
  usage: CodexUsage | null;
  isStale?: boolean;
  loading?: boolean;
  error?: UsageError | null;
  onRefresh?: () => void;
  onRelogin?: () => void;
  isRelogging?: boolean;
  showHeader?: boolean;
  showFooter?: boolean;
  compact?: boolean;
  refreshCountdown?: number | null;
  className?: string;
}

export function CodexUsageDisplay({
  usage,
  isStale = false,
  loading = false,
  error = null,
  onRefresh,
  onRelogin,
  isRelogging = false,
  showHeader = true,
  showFooter = true,
  compact = false,
  refreshCountdown,
  className,
}: CodexUsageDisplayProps) {
  // Don't show refresh button for NOT_AVAILABLE error
  const showRefresh = !error || error.code !== USAGE_ERROR_CODES.NOT_AVAILABLE;

  if (error) {
    return (
      <div className={className}>
        {showHeader && (
          <UsageDisplayHeader
            title="Codex Usage"
            icon={<OpenAIIcon className="w-4 h-4" />}
            onRefresh={showRefresh ? onRefresh : undefined}
            loading={loading}
          />
        )}
        <UsageErrorDisplay
          error={error}
          provider="codex"
          onRelogin={onRelogin}
          isRelogging={isRelogging}
        />
      </div>
    );
  }

  if (!usage) {
    return (
      <div className={className}>
        {showHeader && (
          <UsageDisplayHeader title="Codex Usage" icon={<OpenAIIcon className="w-4 h-4" />} />
        )}
        <UsageLoadingDisplay />
      </div>
    );
  }

  if (!usage.rateLimits) {
    return (
      <div className={className}>
        {showHeader && (
          <UsageDisplayHeader
            title="Codex Usage"
            icon={<OpenAIIcon className="w-4 h-4" />}
            onRefresh={onRefresh}
            loading={loading}
          />
        )}
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <AlertTriangle className="w-8 h-8 text-yellow-500/80" />
          <p className="text-sm font-medium mt-3">No usage data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {showHeader && (
        <UsageDisplayHeader
          title="Codex Usage"
          icon={<OpenAIIcon className="w-4 h-4" />}
          onRefresh={onRefresh}
          loading={loading}
          refreshCountdown={refreshCountdown}
        />
      )}

      <div className={cn('space-y-4', compact ? 'p-0' : 'p-4')}>
        {/* Primary Rate Limit */}
        {usage.rateLimits.primary && (
          <UsageCard
            title={getCodexWindowLabel(usage.rateLimits.primary.windowDurationMins).title}
            subtitle={getCodexWindowLabel(usage.rateLimits.primary.windowDurationMins).subtitle}
            percentage={usage.rateLimits.primary.usedPercent}
            resetText={formatCodexResetTime(usage.rateLimits.primary.resetsAt)}
            isPrimary={true}
            stale={isStale}
          />
        )}

        {/* Secondary Rate Limit */}
        {usage.rateLimits.secondary && (
          <UsageCard
            title={getCodexWindowLabel(usage.rateLimits.secondary.windowDurationMins).title}
            subtitle={getCodexWindowLabel(usage.rateLimits.secondary.windowDurationMins).subtitle}
            percentage={usage.rateLimits.secondary.usedPercent}
            resetText={formatCodexResetTime(usage.rateLimits.secondary.resetsAt)}
            stale={isStale}
          />
        )}

        {/* Plan Type */}
        {usage.rateLimits.planType && (
          <div className="rounded-xl border border-border/40 bg-secondary/20 p-3">
            <p className="text-xs text-muted-foreground">
              Plan:{' '}
              <span className="text-foreground font-medium">
                {usage.rateLimits.planType.charAt(0).toUpperCase() +
                  usage.rateLimits.planType.slice(1)}
              </span>
            </p>
          </div>
        )}
      </div>

      {showFooter && (
        <UsageDisplayFooter
          statusLink="https://platform.openai.com/usage"
          statusLabel="OpenAI Dashboard"
          refreshCountdown={refreshCountdown}
          updateInterval="Refreshes every 30s"
        />
      )}
    </div>
  );
}

// ============================================================================
// Header Component
// ============================================================================

export interface UsageDisplayHeaderProps {
  title: string;
  subtitle?: string | null;
  icon?: ReactNode;
  onRefresh?: () => void;
  loading?: boolean;
  refreshCountdown?: number | null;
  className?: string;
}

export function UsageDisplayHeader({
  title,
  subtitle,
  icon,
  onRefresh,
  loading = false,
  refreshCountdown,
  className,
}: UsageDisplayHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-3 border-b border-border/50 bg-secondary/10',
        className
      )}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {subtitle && <span className="text-xs text-muted-foreground ml-6">{subtitle}</span>}
      </div>
      <div className="flex items-center gap-2">
        {refreshCountdown != null && refreshCountdown > 0 && (
          <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
            {refreshCountdown}s
          </span>
        )}
        {onRefresh && (
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-6 w-6', loading && 'opacity-50')}
            onClick={onRefresh}
            disabled={loading}
            title="Refresh usage data"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Footer Component
// ============================================================================

export interface UsageDisplayFooterProps {
  statusLink: string;
  statusLabel: string;
  updateInterval?: string;
  refreshCountdown?: number | null;
  className?: string;
}

export function UsageDisplayFooter({
  statusLink,
  statusLabel,
  updateInterval,
  refreshCountdown,
  className,
}: UsageDisplayFooterProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-2 bg-secondary/10 border-t border-border/50',
        className
      )}
    >
      <a
        href={statusLink}
        target="_blank"
        rel="noreferrer"
        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
      >
        {statusLabel} <ExternalLink className="w-2.5 h-2.5" />
      </a>
      {refreshCountdown != null && refreshCountdown > 0 ? (
        <span className="text-[10px] text-muted-foreground font-mono tabular-nums flex items-center gap-1">
          <RefreshCw className="w-2.5 h-2.5" />
          {refreshCountdown}s
        </span>
      ) : updateInterval ? (
        <span className="text-[10px] text-muted-foreground">{updateInterval}</span>
      ) : null}
    </div>
  );
}

// ============================================================================
// Compact Usage Badge Component (for header/nav bar)
// ============================================================================

export interface UsageBadgeProps {
  percentage: number;
  isStale?: boolean;
  provider?: 'claude' | 'codex';
  showIcon?: boolean;
  className?: string;
}

export function UsageBadge({
  percentage,
  isStale = false,
  provider,
  showIcon = true,
  className,
}: UsageBadgeProps) {
  const status = getStatusInfo(percentage);
  const ProviderIcon = provider === 'codex' ? OpenAIIcon : AnthropicIcon;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {showIcon && provider && <ProviderIcon className={cn('w-4 h-4', status.color)} />}
      <div
        className={cn(
          'h-1.5 w-16 bg-muted-foreground/20 rounded-full overflow-hidden transition-opacity',
          isStale && 'opacity-60'
        )}
      >
        <div
          className={cn('h-full transition-all duration-500', getProgressBarColor(percentage))}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Hooks Integration Components
// ============================================================================

/**
 * Self-contained Claude usage display that uses the hook internally
 */
export interface ConnectedClaudeUsageDisplayProps {
  isActive?: boolean;
  showHeader?: boolean;
  showFooter?: boolean;
  compact?: boolean;
  className?: string;
}

export function ConnectedClaudeUsageDisplay({
  isActive = false,
  showHeader = true,
  showFooter = true,
  compact = false,
  className,
}: ConnectedClaudeUsageDisplayProps) {
  const { usage, isStale, loading, error, refresh, refreshCountdown } = useClaudeUsageTracking({
    isActive,
  });
  const [isRelogging, setIsRelogging] = useState(false);
  const setClaudeAuthStatus = useSetupStore((state) => state.setClaudeAuthStatus);

  const handleRelogin = useCallback(async () => {
    setIsRelogging(true);
    try {
      const api = getElectronAPI();
      const authResult = await api.setup.authClaude();

      if (!authResult.success) {
        toast.error('Authentication Failed', {
          description: authResult.error || 'Could not initiate authentication',
        });
        return;
      }

      // Verify the authentication actually worked
      if (!api.setup?.verifyClaudeAuth) {
        // Fallback: if verify not available, trust authClaude result
        toast.success('Signed In', {
          description: 'Successfully re-authenticated Claude CLI',
        });
        refresh();
        return;
      }

      const verifyResult = await api.setup.verifyClaudeAuth('cli');

      const hasLimitReachedError =
        verifyResult.error?.toLowerCase().includes('limit reached') ||
        verifyResult.error?.toLowerCase().includes('rate limit');

      if (verifyResult.authenticated && !hasLimitReachedError) {
        // Update auth status in the store
        const currentAuthStatus = useSetupStore.getState().claudeAuthStatus;
        setClaudeAuthStatus({
          authenticated: true,
          method: 'cli_authenticated',
          hasCredentialsFile: currentAuthStatus?.hasCredentialsFile || false,
        });
        toast.success('Signed In', {
          description: 'Successfully re-authenticated Claude CLI',
        });
        // Refresh usage data after successful re-login
        refresh();
      } else if (hasLimitReachedError) {
        toast.error('Rate Limited', {
          description:
            'Authentication succeeded but rate limit reached. Usage will update shortly.',
        });
        // Still update auth status since auth itself succeeded
        const currentAuthStatus = useSetupStore.getState().claudeAuthStatus;
        setClaudeAuthStatus({
          authenticated: true,
          method: 'cli_authenticated',
          hasCredentialsFile: currentAuthStatus?.hasCredentialsFile || false,
        });
      } else {
        toast.error('Verification Failed', {
          description: verifyResult.error || 'Authentication could not be verified',
        });
      }
    } catch (error) {
      toast.error('Authentication Failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsRelogging(false);
    }
  }, [refresh, setClaudeAuthStatus]);

  return (
    <ClaudeUsageDisplay
      usage={usage}
      isStale={isStale}
      loading={loading}
      error={error}
      onRefresh={refresh}
      onRelogin={handleRelogin}
      isRelogging={isRelogging}
      showHeader={showHeader}
      showFooter={showFooter}
      compact={compact}
      refreshCountdown={refreshCountdown}
      className={className}
    />
  );
}

/**
 * Self-contained Codex usage display that uses the hook internally
 */
export interface ConnectedCodexUsageDisplayProps {
  isActive?: boolean;
  showHeader?: boolean;
  showFooter?: boolean;
  compact?: boolean;
  className?: string;
}

export function ConnectedCodexUsageDisplay({
  isActive = false,
  showHeader = true,
  showFooter = true,
  compact = false,
  className,
}: ConnectedCodexUsageDisplayProps) {
  const { usage, isStale, loading, error, refresh, refreshCountdown } = useCodexUsageTracking({
    isActive,
  });
  const [isRelogging, setIsRelogging] = useState(false);
  const setCodexAuthStatus = useSetupStore((state) => state.setCodexAuthStatus);

  const handleRelogin = useCallback(async () => {
    setIsRelogging(true);
    try {
      const api = getElectronAPI();
      const authResult = await api.setup.authCodex();

      if (!authResult.success) {
        toast.error('Authentication Failed', {
          description: authResult.error || 'Could not initiate authentication',
        });
        return;
      }

      // Verify the authentication actually worked
      if (!api.setup?.verifyCodexAuth) {
        // Fallback: if verify not available, trust authCodex result
        toast.success('Signed In', {
          description: 'Successfully re-authenticated Codex CLI',
        });
        refresh();
        return;
      }

      const verifyResult = await api.setup.verifyCodexAuth('cli');

      if (verifyResult.authenticated) {
        // Update auth status in the store
        const currentAuthStatus = useSetupStore.getState().codexAuthStatus;
        setCodexAuthStatus({
          authenticated: true,
          method: 'cli_authenticated',
          hasAuthFile: currentAuthStatus?.hasAuthFile || false,
        });
        toast.success('Signed In', {
          description: 'Successfully re-authenticated Codex CLI',
        });
        // Refresh usage data after successful re-login
        refresh();
      } else {
        toast.error('Verification Failed', {
          description: verifyResult.error || 'Authentication could not be verified',
        });
      }
    } catch (error) {
      toast.error('Authentication Failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsRelogging(false);
    }
  }, [refresh, setCodexAuthStatus]);

  return (
    <CodexUsageDisplay
      usage={usage}
      isStale={isStale}
      loading={loading}
      error={error}
      onRefresh={refresh}
      onRelogin={handleRelogin}
      isRelogging={isRelogging}
      showHeader={showHeader}
      showFooter={showFooter}
      compact={compact}
      refreshCountdown={refreshCountdown}
      className={className}
    />
  );
}

/**
 * Combined usage display showing the current primary provider
 */
export interface ConnectedUsageDisplayProps {
  isActive?: boolean;
  showHeader?: boolean;
  showFooter?: boolean;
  compact?: boolean;
  className?: string;
}

export function ConnectedUsageDisplay({
  isActive = false,
  showHeader = true,
  showFooter = true,
  compact = false,
  className,
}: ConnectedUsageDisplayProps) {
  const { claude, codex, primaryProvider } = useUsageTracking({ isActive });
  const [isRelogging, setIsRelogging] = useState(false);
  const setClaudeAuthStatus = useSetupStore((state) => state.setClaudeAuthStatus);
  const setCodexAuthStatus = useSetupStore((state) => state.setCodexAuthStatus);

  const handleClaudeRelogin = useCallback(async () => {
    setIsRelogging(true);
    try {
      const api = getElectronAPI();
      const authResult = await api.setup.authClaude();

      if (!authResult.success) {
        toast.error('Authentication Failed', {
          description: authResult.error || 'Could not initiate authentication',
        });
        return;
      }

      // Verify the authentication actually worked
      if (!api.setup?.verifyClaudeAuth) {
        // Fallback: if verify not available, trust authClaude result
        toast.success('Signed In', {
          description: 'Successfully re-authenticated Claude CLI',
        });
        claude.refresh();
        return;
      }

      const verifyResult = await api.setup.verifyClaudeAuth('cli');

      const hasLimitReachedError =
        verifyResult.error?.toLowerCase().includes('limit reached') ||
        verifyResult.error?.toLowerCase().includes('rate limit');

      if (verifyResult.authenticated && !hasLimitReachedError) {
        // Update auth status in the store
        const currentAuthStatus = useSetupStore.getState().claudeAuthStatus;
        setClaudeAuthStatus({
          authenticated: true,
          method: 'cli_authenticated',
          hasCredentialsFile: currentAuthStatus?.hasCredentialsFile || false,
        });
        toast.success('Signed In', {
          description: 'Successfully re-authenticated Claude CLI',
        });
        // Refresh usage data after successful re-login
        claude.refresh();
      } else if (hasLimitReachedError) {
        toast.error('Rate Limited', {
          description:
            'Authentication succeeded but rate limit reached. Usage will update shortly.',
        });
        // Still update auth status since auth itself succeeded
        const currentAuthStatus = useSetupStore.getState().claudeAuthStatus;
        setClaudeAuthStatus({
          authenticated: true,
          method: 'cli_authenticated',
          hasCredentialsFile: currentAuthStatus?.hasCredentialsFile || false,
        });
      } else {
        toast.error('Verification Failed', {
          description: verifyResult.error || 'Authentication could not be verified',
        });
      }
    } catch (error) {
      toast.error('Authentication Failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsRelogging(false);
    }
  }, [claude, setClaudeAuthStatus]);

  const handleCodexRelogin = useCallback(async () => {
    setIsRelogging(true);
    try {
      const api = getElectronAPI();
      const authResult = await api.setup.authCodex();

      if (!authResult.success) {
        toast.error('Authentication Failed', {
          description: authResult.error || 'Could not initiate authentication',
        });
        return;
      }

      // Verify the authentication actually worked
      if (!api.setup?.verifyCodexAuth) {
        // Fallback: if verify not available, trust authCodex result
        toast.success('Signed In', {
          description: 'Successfully re-authenticated Codex CLI',
        });
        codex.refresh();
        return;
      }

      const verifyResult = await api.setup.verifyCodexAuth('cli');

      if (verifyResult.authenticated) {
        // Update auth status in the store
        const currentAuthStatus = useSetupStore.getState().codexAuthStatus;
        setCodexAuthStatus({
          authenticated: true,
          method: 'cli_authenticated',
          hasAuthFile: currentAuthStatus?.hasAuthFile || false,
        });
        toast.success('Signed In', {
          description: 'Successfully re-authenticated Codex CLI',
        });
        // Refresh usage data after successful re-login
        codex.refresh();
      } else {
        toast.error('Verification Failed', {
          description: verifyResult.error || 'Authentication could not be verified',
        });
      }
    } catch (error) {
      toast.error('Authentication Failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsRelogging(false);
    }
  }, [codex, setCodexAuthStatus]);

  if (primaryProvider === 'codex') {
    return (
      <CodexUsageDisplay
        usage={codex.usage}
        isStale={codex.isStale}
        loading={codex.loading}
        error={codex.error}
        onRefresh={codex.refresh}
        onRelogin={handleCodexRelogin}
        isRelogging={isRelogging}
        showHeader={showHeader}
        showFooter={showFooter}
        compact={compact}
        refreshCountdown={codex.refreshCountdown}
        className={className}
      />
    );
  }

  return (
    <ClaudeUsageDisplay
      usage={claude.usage}
      isStale={claude.isStale}
      loading={claude.loading}
      error={claude.error}
      onRefresh={claude.refresh}
      onRelogin={handleClaudeRelogin}
      isRelogging={isRelogging}
      showHeader={showHeader}
      showFooter={showFooter}
      compact={compact}
      refreshCountdown={claude.refreshCountdown}
      className={className}
    />
  );
}

/**
 * Hook to get usage badge props for the current primary provider
 */
export function useUsageBadgeProps(isActive = false) {
  const { claude, codex, primaryProvider, maxPercentage, isAnyStale } = useUsageTracking({
    isActive,
  });

  return useMemo(
    () => ({
      percentage: maxPercentage,
      isStale: isAnyStale,
      provider: primaryProvider,
      hasData: !!(claude.usage || codex.usage),
    }),
    [maxPercentage, isAnyStale, primaryProvider, claude.usage, codex.usage]
  );
}
