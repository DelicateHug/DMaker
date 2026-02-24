import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { ProviderToggle } from './provider-toggle';
import { GcpIcon } from '@/components/ui/provider-icon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, RefreshCw, Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import { createLogger } from '@dmaker/utils/logger';

const logger = createLogger('GcpSettings');

interface GcpStatus {
  installed: boolean;
  authenticated: boolean;
  hasCredentials: boolean;
  hasProject: boolean;
  projectId?: string;
}

export function GcpSettingsTab() {
  const [isChecking, setIsChecking] = useState(false);
  const [gcpStatus, setGcpStatus] = useState<GcpStatus | null>(null);

  const checkGcpStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const api = getElectronAPI();
      if (api?.setup?.getGcpStatus) {
        const result = await api.setup.getGcpStatus();
        setGcpStatus({
          installed: result.installed ?? false,
          authenticated: result.authenticated ?? false,
          hasCredentials: result.hasCredentials ?? false,
          hasProject: result.hasProject ?? false,
          projectId: result.projectId,
        });
      } else {
        // Fallback: check environment variables directly
        setGcpStatus({
          installed: true,
          authenticated: false,
          hasCredentials: false,
          hasProject: false,
        });
      }
    } catch (error) {
      logger.error('Failed to check GCP status:', error);
      setGcpStatus({
        installed: false,
        authenticated: false,
        hasCredentials: false,
        hasProject: false,
      });
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkGcpStatus();
  }, [checkGcpStatus]);

  const handleRefresh = useCallback(async () => {
    await checkGcpStatus();
    toast.success('GCP status refreshed');
  }, [checkGcpStatus]);

  return (
    <div className="space-y-6">
      {/* Provider Visibility Toggle */}
      <ProviderToggle provider="gcp" providerLabel="GCP Vertex AI" />

      {/* GCP Status Card */}
      <div
        className={cn(
          'rounded-2xl overflow-hidden',
          'border border-border/50',
          'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
          'shadow-sm shadow-black/5'
        )}
      >
        <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center border border-blue-500/20">
                <GcpIcon className="w-5 h-5 text-blue-500" />
              </div>
              <h2 className="text-lg font-semibold text-foreground tracking-tight">
                GCP Vertex AI
              </h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isChecking}
              title="Refresh GCP status"
              className={cn(
                'h-9 w-9 rounded-lg',
                'hover:bg-accent/50 hover:scale-105',
                'transition-all duration-200'
              )}
            >
              <RefreshCw className={cn('w-4 h-4', isChecking && 'animate-spin')} />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground/80 ml-12">
            Google Cloud Vertex AI provides access to Gemini models for AI-powered development.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {gcpStatus?.authenticated ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center border border-emerald-500/20 shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald-400">GCP Authenticated</p>
                  <div className="text-xs text-emerald-400/70 mt-1.5 space-y-0.5">
                    {gcpStatus.hasCredentials && (
                      <p>
                        Credentials: <span className="font-mono">Application Default</span>
                      </p>
                    )}
                    {gcpStatus.projectId && (
                      <p>
                        Project: <span className="font-mono">{gcpStatus.projectId}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Available Models */}
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center border border-emerald-500/20 shrink-0">
                  <Cloud className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald-400">Gemini Models Available</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[
                      'Gemini 2.5 Pro',
                      'Gemini 2.5 Flash',
                      'Gemini 2.0 Flash',
                      'Gemini 1.5 Pro',
                      'Gemini 1.5 Flash',
                    ].map((model) => (
                      <Badge
                        key={model}
                        variant="outline"
                        className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      >
                        {model}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center border border-amber-500/20 shrink-0 mt-0.5">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-400">GCP Not Configured</p>
                  <p className="text-xs text-amber-400/70 mt-1">
                    Set up Google Cloud authentication to use Gemini models via Vertex AI.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium text-foreground/80">Setup Commands:</p>
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-accent/30 border border-border/50">
                    <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">
                      Authenticate
                    </p>
                    <code className="text-xs text-foreground/80 font-mono break-all">
                      gcloud auth application-default login
                    </code>
                  </div>
                  <div className="p-3 rounded-xl bg-accent/30 border border-border/50">
                    <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">
                      Set Project
                    </p>
                    <code className="text-xs text-foreground/80 font-mono break-all">
                      export GOOGLE_CLOUD_PROJECT=your-project-id
                    </code>
                  </div>
                  <div className="p-3 rounded-xl bg-accent/30 border border-border/50">
                    <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">
                      Service Account (Alternative)
                    </p>
                    <code className="text-xs text-foreground/80 font-mono break-all">
                      export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
                    </code>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GcpSettingsTab;
