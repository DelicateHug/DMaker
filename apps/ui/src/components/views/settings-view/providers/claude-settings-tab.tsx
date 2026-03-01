// @ts-nocheck
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { useCliStatus } from '../hooks/use-cli-status';
import { ClaudeCliStatus } from '../cli-status/claude-cli-status';
import { ClaudeMdSettings } from '../claude/claude-md-settings';
import { ClaudeUsageSection } from '../api-keys/claude-usage-section';
import { ProviderToggle } from './provider-toggle';
import { Info, Bot, ArrowRight } from 'lucide-react';

export function ClaudeSettingsTab() {
  const { apiKeys, autoLoadClaudeMd, setAutoLoadClaudeMd } = useAppStore();
  const { claudeAuthStatus } = useSetupStore();

  // Use CLI status hook
  const { claudeCliStatus, isCheckingClaudeCli, handleRefreshClaudeCli } = useCliStatus();

  // Hide usage tracking when using API key (only show for Claude Code CLI users)
  // Also hide on Windows for now (CLI usage command not supported)
  const isWindows =
    typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('win');
  const showUsageTracking = !apiKeys.anthropic && !isWindows;

  return (
    <div className="space-y-6">
      {/* Provider Visibility Toggle */}
      <ProviderToggle provider="claude" providerLabel="Claude" />

      {/* Usage Info */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-400/90">
          <span className="font-medium">Primary Provider</span>
          <p className="text-xs text-blue-400/70 mt-1">
            Claude is used throughout the app including chat, analysis, and agent tasks.
          </p>
        </div>
      </div>

      <ClaudeCliStatus
        status={claudeCliStatus}
        authStatus={claudeAuthStatus}
        isChecking={isCheckingClaudeCli}
        onRefresh={handleRefreshClaudeCli}
      />
      <ClaudeMdSettings
        autoLoadClaudeMd={autoLoadClaudeMd}
        onAutoLoadClaudeMdChange={setAutoLoadClaudeMd}
      />

      {/* Agents & Skills Link Card */}
      <div className="rounded-2xl border border-border/50 bg-linear-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl shadow-sm shadow-black/5 p-5">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-violet-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">Agents & Skills</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage custom agents, generate with AI, and configure skills in the dedicated settings
              section
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </div>

      {showUsageTracking && <ClaudeUsageSection />}
    </div>
  );
}

export default ClaudeSettingsTab;
