import { useState, useEffect, useCallback, useRef } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  LogIn,
  ChevronDown,
  Check,
  X,
  UserPlus,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import type { ClaudeAccountRef } from '@automaker/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';

// Error codes for distinguishing failure modes
const ERROR_CODES = {
  API_BRIDGE_UNAVAILABLE: 'API_BRIDGE_UNAVAILABLE',
  AUTH_ERROR: 'AUTH_ERROR',
  TRUST_PROMPT: 'TRUST_PROMPT',
  UNKNOWN: 'UNKNOWN',
} as const;

type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

type UsageError = {
  code: ErrorCode;
  message: string;
};

// Fixed refresh interval (30 seconds)
const REFRESH_INTERVAL_SECONDS = 30;

// Staleness threshold (2 minutes)
const STALE_THRESHOLD_MS = 2 * 60 * 1000;

// Helper to calculate staleness - used for both initial check and periodic updates
function calculateIsStale(lastUpdated: number | null): boolean {
  return !lastUpdated || Date.now() - lastUpdated > STALE_THRESHOLD_MS;
}

export function ClaudeUsagePopover() {
  const {
    claudeUsage,
    claudeUsageLastUpdated,
    setClaudeUsage,
    claudeAccounts,
    removeClaudeAccount,
  } = useAppStore();
  const claudeAuthStatus = useSetupStore((state) => state.claudeAuthStatus);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UsageError | null>(null);
  const [isRelogging, setIsRelogging] = useState(false);

  // Track staleness with state to allow periodic updates
  const [isStale, setIsStale] = useState(() => calculateIsStale(claudeUsageLastUpdated));

  // Track if initial fetch has been done to prevent duplicate fetches
  const initialFetchDone = useRef(false);

  // Check if CLI is verified/authenticated
  const isCliVerified =
    claudeAuthStatus?.authenticated && claudeAuthStatus?.method === 'cli_authenticated';

  // Update staleness when lastUpdated changes
  useEffect(() => {
    setIsStale(calculateIsStale(claudeUsageLastUpdated));
  }, [claudeUsageLastUpdated]);

  // Periodically recalculate staleness (every 30 seconds) to update UI
  useEffect(() => {
    const checkStaleness = () => {
      setIsStale(calculateIsStale(claudeUsageLastUpdated));
    };

    const intervalId = setInterval(checkStaleness, 30000);
    return () => clearInterval(intervalId);
  }, [claudeUsageLastUpdated]);

  const fetchUsage = useCallback(
    async (isAutoRefresh = false) => {
      if (!isAutoRefresh) setLoading(true);
      setError(null);
      try {
        const api = getElectronAPI();
        if (!api.claude) {
          setError({
            code: ERROR_CODES.API_BRIDGE_UNAVAILABLE,
            message: 'Claude API bridge not available',
          });
          return;
        }
        const data = await api.claude.getUsage();
        if ('error' in data) {
          // Detect trust prompt error
          const isTrustPrompt =
            data.error === 'Trust prompt pending' ||
            (data.message && data.message.includes('folder permission'));
          setError({
            code: isTrustPrompt ? ERROR_CODES.TRUST_PROMPT : ERROR_CODES.AUTH_ERROR,
            message: data.message || data.error,
          });
          return;
        }
        setClaudeUsage(data);
      } catch (err) {
        setError({
          code: ERROR_CODES.UNKNOWN,
          message: err instanceof Error ? err.message : 'Failed to fetch usage',
        });
      } finally {
        if (!isAutoRefresh) setLoading(false);
      }
    },
    [setClaudeUsage]
  );

  // Re-login handler for Claude with authClaude + verifyClaudeAuth flow
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
        fetchUsage(false);
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
        fetchUsage(false);
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
  }, [fetchUsage, setClaudeAuthStatus]);

  // Account switch handler - instructs user to switch in CLI, then re-verifies
  const handleAccountSwitch = useCallback(
    (email: string) => {
      toast.info('Switch Account', {
        description: `To switch to ${email}, run "claude login" in your terminal and sign in with that account. Then click Re-login to verify.`,
        duration: 8000,
      });
      handleRelogin();
    },
    [handleRelogin]
  );

  // Auto-fetch on mount if data is stale (only if CLI is verified)
  // Use ref to prevent multiple initial fetches
  useEffect(() => {
    if (isStale && isCliVerified && !initialFetchDone.current) {
      initialFetchDone.current = true;
      fetchUsage(true);
    }
  }, [isStale, isCliVerified, fetchUsage]);

  // Fetch when popover opens (if stale or no data)
  useEffect(() => {
    if (!open || !isCliVerified) return;

    // Only fetch on open if stale or no data
    if (!claudeUsage || isStale) {
      fetchUsage();
    }
    // Note: We intentionally only check this when `open` changes to true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isCliVerified]);

  // Countdown timer for next refresh
  const [refreshCountdown, setRefreshCountdown] = useState(REFRESH_INTERVAL_SECONDS);

  // Auto-refresh interval with countdown (only when popover is open)
  useEffect(() => {
    if (!open || !isCliVerified) return;

    setRefreshCountdown(REFRESH_INTERVAL_SECONDS);

    const countdownId = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          fetchUsage(true);
          return REFRESH_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownId);
  }, [open, isCliVerified, fetchUsage]);

  // Derived status color/icon helper
  const getStatusInfo = (percentage: number) => {
    if (percentage >= 75) return { color: 'text-red-500', icon: XCircle, bg: 'bg-red-500' };
    if (percentage >= 50)
      return { color: 'text-orange-500', icon: AlertTriangle, bg: 'bg-orange-500' };
    return { color: 'text-green-500', icon: CheckCircle, bg: 'bg-green-500' };
  };

  // Helper component for the progress bar
  const ProgressBar = ({ percentage, colorClass }: { percentage: number; colorClass: string }) => (
    <div className="h-2 w-full bg-secondary/50 rounded-full overflow-hidden">
      <div
        className={cn('h-full transition-all duration-500', colorClass)}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );

  const UsageCard = ({
    title,
    subtitle,
    percentage,
    resetText,
    resetTime,
    isPrimary = false,
    stale = false,
  }: {
    title: string;
    subtitle: string;
    percentage: number;
    resetText?: string;
    resetTime?: string;
    isPrimary?: boolean;
    stale?: boolean;
  }) => {
    // Check if percentage is valid (not NaN, not undefined, is a finite number)
    const isValidPercentage =
      typeof percentage === 'number' && !isNaN(percentage) && isFinite(percentage);
    const safePercentage = isValidPercentage ? percentage : 0;

    const status = getStatusInfo(safePercentage);
    const StatusIcon = status.icon;

    // State to track the countdown text
    const [countdownText, setCountdownText] = useState<string>('');

    // Function to calculate time remaining from ISO timestamp
    const calculateCountdown = useCallback((isoTime: string): string => {
      const resetDate = new Date(isoTime);
      const now = new Date();
      const diffMs = resetDate.getTime() - now.getTime();

      if (diffMs <= 0) {
        return 'Resetting soon';
      }

      const totalMinutes = Math.floor(diffMs / (1000 * 60));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      if (hours > 0) {
        return `Resets in ${hours}h ${minutes}m`;
      } else {
        return `Resets in ${minutes}m`;
      }
    }, []);

    // Update countdown every minute
    useEffect(() => {
      if (!resetTime) {
        setCountdownText(resetText || '');
        return;
      }

      // Initial calculation
      setCountdownText(calculateCountdown(resetTime));

      // Update every minute
      const intervalId = setInterval(() => {
        setCountdownText(calculateCountdown(resetTime));
      }, 60000); // 60 seconds

      return () => clearInterval(intervalId);
    }, [resetTime, resetText, calculateCountdown]);

    return (
      <div
        className={cn(
          'rounded-xl border bg-card/50 p-4 transition-opacity',
          isPrimary ? 'border-border/60 shadow-sm' : 'border-border/40',
          (stale || !isValidPercentage) && 'opacity-50'
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
        {countdownText && (
          <div className="mt-2 flex justify-end">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {title === 'Session Usage' && <Clock className="w-3 h-3" />}
              {countdownText}
            </p>
          </div>
        )}
      </div>
    );
  };

  // Header Button
  const maxPercentage = claudeUsage
    ? Math.max(claudeUsage.sessionPercentage || 0, claudeUsage.weeklyPercentage || 0)
    : 0;

  const getProgressBarColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-red-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const trigger = (
    <Button variant="ghost" size="sm" className="h-9 gap-3 bg-secondary border border-border px-3">
      <span className="text-sm font-medium">Usage</span>
      {claudeUsage && (
        <div
          className={cn(
            'h-1.5 w-16 bg-muted-foreground/20 rounded-full overflow-hidden transition-opacity',
            isStale && 'opacity-60'
          )}
        >
          <div
            className={cn('h-full transition-all duration-500', getProgressBarColor(maxPercentage))}
            style={{ width: `${Math.min(maxPercentage, 100)}%` }}
          />
        </div>
      )}
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border shadow-2xl"
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-secondary/10">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">Claude Usage</span>
            {claudeUsage?.accountEmail && (
              <AccountSwitcherDropdown
                currentEmail={claudeUsage.accountEmail}
                accounts={claudeAccounts}
                onSwitch={handleAccountSwitch}
                onRemove={removeClaudeAccount}
                onAddNew={handleRelogin}
                isRelogging={isRelogging}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            {open && claudeUsage && !error && (
              <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                {refreshCountdown}s
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-6 w-6', loading && 'opacity-50')}
              onClick={() => {
                if (!loading) {
                  fetchUsage(false);
                  setRefreshCountdown(REFRESH_INTERVAL_SECONDS);
                }
              }}
              disabled={loading}
              title="Refresh usage data"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {error ? (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-yellow-500/80" />
              <div className="space-y-1 flex flex-col items-center">
                <p className="text-sm font-medium">{error.message}</p>
                <p className="text-xs text-muted-foreground">
                  {error.code === ERROR_CODES.API_BRIDGE_UNAVAILABLE ? (
                    'Ensure the Electron bridge is running or restart the app'
                  ) : error.code === ERROR_CODES.TRUST_PROMPT ? (
                    <>
                      Run <code className="font-mono bg-muted px-1 rounded">claude</code> in your
                      terminal and approve access to continue
                    </>
                  ) : (
                    <>
                      Make sure Claude CLI is installed and authenticated via{' '}
                      <code className="font-mono bg-muted px-1 rounded">claude login</code>
                    </>
                  )}
                </p>
              </div>
            </div>
          ) : !claudeUsage ? (
            // Loading state
            <div className="flex flex-col items-center justify-center py-8 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">Loading usage data...</p>
            </div>
          ) : (
            <>
              {/* Primary Card */}
              <UsageCard
                title="Session Usage"
                subtitle="5-hour rolling window"
                percentage={claudeUsage.sessionPercentage}
                resetText={claudeUsage.sessionResetText}
                resetTime={claudeUsage.sessionResetTime}
                isPrimary={true}
                stale={isStale}
              />

              {/* Secondary Cards Grid */}
              <div className="grid grid-cols-2 gap-3">
                <UsageCard
                  title="Weekly"
                  subtitle="All models"
                  percentage={claudeUsage.weeklyPercentage}
                  resetText={claudeUsage.weeklyResetText}
                  resetTime={claudeUsage.weeklyResetTime}
                  stale={isStale}
                />
                <UsageCard
                  title="Sonnet"
                  subtitle="Weekly"
                  percentage={claudeUsage.sonnetWeeklyPercentage}
                  resetText={claudeUsage.sonnetResetText}
                  resetTime={claudeUsage.weeklyResetTime}
                  stale={isStale}
                />
              </div>

              {/* Extra Usage / Cost */}
              {claudeUsage.costLimit && claudeUsage.costLimit > 0 && (
                <UsageCard
                  title="Extra Usage"
                  subtitle={`${claudeUsage.costUsed ?? 0} / ${claudeUsage.costLimit} ${claudeUsage.costCurrency ?? ''}`}
                  percentage={
                    claudeUsage.costLimit > 0
                      ? ((claudeUsage.costUsed ?? 0) / claudeUsage.costLimit) * 100
                      : 0
                  }
                  stale={isStale}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-secondary/10 border-t border-border/50">
          <a
            href="https://status.claude.com"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            Claude Status <ExternalLink className="w-2.5 h-2.5" />
          </a>

          <div className="flex items-center gap-3">
            {open && claudeUsage && !error && (
              <span className="text-[10px] text-muted-foreground font-mono tabular-nums flex items-center gap-1">
                <RefreshCw className="w-2.5 h-2.5" />
                {refreshCountdown}s
              </span>
            )}
            <button
              onClick={handleRelogin}
              disabled={isRelogging}
              className={cn(
                'text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors',
                isRelogging && 'opacity-50 cursor-not-allowed'
              )}
              title="Re-authenticate Claude CLI"
            >
              <LogIn className={cn('w-2.5 h-2.5', isRelogging && 'animate-pulse')} />
              {isRelogging ? 'Re-logging in...' : 'Re-login'}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Dropdown for switching between saved Claude accounts.
 * Shows current account with checkmark, other accounts with delete buttons,
 * and an "Add new account" action at the bottom.
 */
function AccountSwitcherDropdown({
  currentEmail,
  accounts,
  onSwitch,
  onRemove,
  onAddNew,
  isRelogging,
}: {
  currentEmail: string;
  accounts: ClaudeAccountRef[];
  onSwitch: (email: string) => void;
  onRemove: (email: string) => void;
  onAddNew: () => void;
  isRelogging: boolean;
}) {
  // Sort accounts: current first, then by lastSeenAt descending
  const sortedAccounts = [...accounts].sort((a, b) => {
    if (a.email === currentEmail) return -1;
    if (b.email === currentEmail) return 1;
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="text-[10px] text-muted-foreground hover:text-foreground truncate max-w-[140px] flex items-center gap-0.5 transition-colors cursor-pointer"
          title="Switch Claude account"
        >
          {currentEmail}
          <ChevronDown className="w-2.5 h-2.5 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="w-64">
        <DropdownMenuLabel className="text-[10px] text-muted-foreground font-normal">
          Claude Accounts
        </DropdownMenuLabel>
        {sortedAccounts.length > 0 ? (
          sortedAccounts.map((account) => {
            const isCurrent = account.email === currentEmail;
            return (
              <DropdownMenuItem
                key={account.email}
                className="flex items-center justify-between gap-2 text-xs"
                onSelect={(e) => {
                  if (isCurrent) {
                    e.preventDefault();
                    return;
                  }
                  onSwitch(account.email);
                }}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {isCurrent ? (
                    <Check className="w-3 h-3 text-green-500 shrink-0" />
                  ) : (
                    <div className="w-3 h-3 shrink-0" />
                  )}
                  <span className={cn('truncate', isCurrent && 'font-medium')}>
                    {account.email}
                  </span>
                </div>
                {!isCurrent && (
                  <button
                    className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(account.email);
                    }}
                    title={`Remove ${account.email}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </DropdownMenuItem>
            );
          })
        ) : (
          <div className="px-2 py-1.5 text-[10px] text-muted-foreground">No saved accounts</div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-xs gap-2"
          onSelect={() => onAddNew()}
          disabled={isRelogging}
        >
          <UserPlus className="w-3 h-3" />
          {isRelogging ? 'Logging in...' : 'Add new account'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
