import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  User,
  Code2,
  RefreshCw,
  ChevronDown,
  Check,
  X,
  UserPlus,
  LogIn,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import {
  useAvailableEditors,
  useEffectiveDefaultEditor,
} from '@/components/views/board-view/worktree-panel/hooks/use-available-editors';
import { getEditorIcon } from '@/components/icons/editor-icons';
import { getElectronAPI } from '@/lib/electron';

export function AccountSection() {
  // Editor settings
  const { editors, isLoading: isLoadingEditors, isRefreshing, refresh } = useAvailableEditors();
  const defaultEditorCommand = useAppStore((s) => s.defaultEditorCommand);
  const setDefaultEditorCommand = useAppStore((s) => s.setDefaultEditorCommand);

  // Claude account settings
  const claudeUsage = useAppStore((s) => s.claudeUsage);
  const claudeAccounts = useAppStore((s) => s.claudeAccounts);
  const removeClaudeAccount = useAppStore((s) => s.removeClaudeAccount);
  const setClaudeUsage = useAppStore((s) => s.setClaudeUsage);
  const claudeAuthStatus = useSetupStore((s) => s.claudeAuthStatus);
  const setClaudeAuthStatus = useSetupStore((s) => s.setClaudeAuthStatus);

  const [isRelogging, setIsRelogging] = useState(false);

  const currentEmail = claudeUsage?.accountEmail ?? null;
  const isCliVerified =
    claudeAuthStatus?.authenticated && claudeAuthStatus?.method === 'cli_authenticated';

  // Use shared hook for effective default editor
  const effectiveEditor = useEffectiveDefaultEditor(editors);

  // Normalize Select value: if saved editor isn't found, show 'auto'
  const hasSavedEditor =
    !!defaultEditorCommand && editors.some((e) => e.command === defaultEditorCommand);
  const selectValue = hasSavedEditor ? defaultEditorCommand : 'auto';

  // Get icon component for the effective editor
  const EffectiveEditorIcon = effectiveEditor ? getEditorIcon(effectiveEditor.command) : null;

  const handleRefreshEditors = async () => {
    await refresh();
    toast.success('Editor list refreshed');
  };

  // Add new account / re-login handler
  const handleAddAccount = useCallback(async () => {
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

      // Verify the authentication worked
      if (api.setup?.verifyClaudeAuth) {
        const verifyResult = await api.setup.verifyClaudeAuth('cli');

        const hasLimitReachedError =
          verifyResult.error?.toLowerCase().includes('limit reached') ||
          verifyResult.error?.toLowerCase().includes('rate limit');

        if (verifyResult.authenticated && !hasLimitReachedError) {
          const currentAuthStatus = useSetupStore.getState().claudeAuthStatus;
          setClaudeAuthStatus({
            authenticated: true,
            method: 'cli_authenticated',
            hasCredentialsFile: currentAuthStatus?.hasCredentialsFile || false,
          });
          toast.success('Signed In', {
            description: 'Successfully authenticated Claude CLI. Refresh usage to see account.',
          });
          // Refresh usage to pick up new account email
          try {
            const usageData = await api.claude?.getUsage();
            if (usageData && !('error' in usageData)) {
              setClaudeUsage(usageData);
            }
          } catch {
            // Usage refresh is best-effort
          }
        } else if (hasLimitReachedError) {
          toast.error('Rate Limited', {
            description: 'Authentication succeeded but rate limit reached.',
          });
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
      } else {
        toast.success('Signed In', {
          description: 'Successfully authenticated Claude CLI',
        });
      }
    } catch (error) {
      toast.error('Authentication Failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsRelogging(false);
    }
  }, [setClaudeAuthStatus, setClaudeUsage]);

  // Account switch handler
  const handleAccountSwitch = useCallback(
    (email: string) => {
      toast.info('Switch Account', {
        description: `To switch to ${email}, run "claude login" in your terminal and sign in with that account.`,
        duration: 8000,
      });
      handleAddAccount();
    },
    [handleAddAccount]
  );

  // Sort accounts: current first, then by lastSeenAt descending
  const sortedAccounts = [...claudeAccounts].sort((a, b) => {
    if (currentEmail && a.email === currentEmail) return -1;
    if (currentEmail && b.email === currentEmail) return 1;
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
  });

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/80 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm'
      )}
    >
      <div className="p-6 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
            <User className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Account</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Manage your Claude account and local preferences.
        </p>
      </div>
      <div className="p-6 space-y-4">
        {/* Claude Account Switcher */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-muted/30 border border-border/30">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground">Claude Account</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                {isCliVerified
                  ? 'Switch between Claude accounts or add a new one'
                  : 'Sign in to Claude CLI to manage accounts'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-[220px] shrink-0 justify-between"
                  disabled={isRelogging}
                >
                  <span className="truncate text-left">
                    {currentEmail || (isCliVerified ? 'Unknown account' : 'Not signed in')}
                  </span>
                  {isRelogging ? (
                    <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                  ) : (
                    <ChevronDown className="w-4 h-4 shrink-0 opacity-50" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[260px]">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  Claude Accounts
                </DropdownMenuLabel>
                {sortedAccounts.length > 0 ? (
                  sortedAccounts.map((account) => {
                    const isCurrent = currentEmail === account.email;
                    return (
                      <DropdownMenuItem
                        key={account.email}
                        className="flex items-center justify-between gap-2"
                        onSelect={(e) => {
                          if (isCurrent) {
                            e.preventDefault();
                            return;
                          }
                          handleAccountSwitch(account.email);
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {isCurrent ? (
                            <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          ) : (
                            <div className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span className={cn('truncate text-sm', isCurrent && 'font-medium')}>
                            {account.email}
                          </span>
                        </div>
                        {!isCurrent && (
                          <button
                            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeClaudeAccount(account.email);
                              toast.success(`Removed ${account.email}`);
                            }}
                            title={`Remove ${account.email}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </DropdownMenuItem>
                    );
                  })
                ) : (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    {isCliVerified
                      ? 'No saved accounts yet. Usage data will detect your account automatically.'
                      : 'Sign in below to get started.'}
                  </div>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2"
                  onSelect={() => handleAddAccount()}
                  disabled={isRelogging}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{isRelogging ? 'Signing in...' : 'Add new account'}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {!isCliVerified && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleAddAccount}
                      disabled={isRelogging}
                      className="shrink-0"
                    >
                      {isRelogging ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <LogIn className="w-4 h-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Sign in to Claude CLI</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* Default IDE */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-muted/30 border border-border/30">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-muted/50 to-muted/30 border border-border/30 flex items-center justify-center shrink-0">
              <Code2 className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground">Default IDE</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Default IDE to use when opening branches or worktrees
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={selectValue}
              onValueChange={(value) => setDefaultEditorCommand(value === 'auto' ? null : value)}
              disabled={isLoadingEditors || isRefreshing || editors.length === 0}
            >
              <SelectTrigger className="w-[180px] shrink-0">
                <SelectValue placeholder="Select editor">
                  {effectiveEditor ? (
                    <span className="flex items-center gap-2">
                      {EffectiveEditorIcon && <EffectiveEditorIcon className="w-4 h-4" />}
                      {effectiveEditor.name}
                      {selectValue === 'auto' && (
                        <span className="text-muted-foreground text-xs">(Auto)</span>
                      )}
                    </span>
                  ) : (
                    'Select editor'
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  <span className="flex items-center gap-2">
                    <Code2 className="w-4 h-4" />
                    Auto-detect
                  </span>
                </SelectItem>
                {editors.map((editor) => {
                  const Icon = getEditorIcon(editor.command);
                  return (
                    <SelectItem key={editor.command} value={editor.command}>
                      <span className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {editor.name}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRefreshEditors}
                    disabled={isRefreshing || isLoadingEditors}
                    className="shrink-0 h-9 w-9"
                  >
                    <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Refresh available editors</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
