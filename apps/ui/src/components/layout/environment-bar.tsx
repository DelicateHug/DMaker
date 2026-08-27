/**
 * Environment bar — the strip that says which DMaker you are looking at.
 *
 * `start.ps1` runs two of these side by side against one checkout: a read-only
 * dev on 3017 and an executing prod on 3007. Without a marker they are
 * indistinguishable, and "why won't it run anything" becomes a five-minute
 * mystery. The bar names the environment, links to the other one, opens the
 * task runner's status (what it is working on, how many runners it may use),
 * and — on prod — offers Update Prod.
 *
 * It renders nothing at all unless the server reports a launcher-managed
 * environment, so the ordinary `npm run dev:web` experience is untouched.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/overlays';
import { RunnerPopover } from '@/components/layout/runner-popover';
import {
  fetchEnvironmentInfo,
  startSelfUpdate,
  subscribeSelfUpdate,
  waitForServerBack,
  type EnvironmentInfo,
  type SelfUpdateEvent,
  type SelfUpdateResult,
} from '@/lib/environment-api';

/** Console-style tail shown while the update runs. */
const MAX_LOG_LINES = 400;

function EnvBadge({ info }: { info: EnvironmentInfo }) {
  const isDev = info.env === 'dev';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${
        isDev
          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
          : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
      }`}
      data-testid="environment-badge"
    >
      {isDev ? <Eye className="size-3" /> : <Zap className="size-3" />}
      {isDev ? 'Dev · read-only' : 'Prod'}
    </span>
  );
}

export function EnvironmentBar() {
  const [info, setInfo] = useState<EnvironmentInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [phaseMessage, setPhaseMessage] = useState('');
  const [result, setResult] = useState<SelfUpdateResult | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchEnvironmentInfo().then((next) => {
      if (!cancelled) setInfo(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the runner dot honest without a socket: cheap poll, only while a
  // launcher-managed environment is on screen.
  useEffect(() => {
    if (!info?.launcherManaged) return;
    const timer = setInterval(() => {
      void fetchEnvironmentInfo().then((next) => {
        if (next) setInfo(next);
      });
    }, 15_000);
    return () => clearInterval(timer);
  }, [info?.launcherManaged]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [log]);

  // The API client announces every refusal from the read-only environment here,
  // so a click on any run button lands as one explanatory toast with a way out
  // rather than as a generic failure message from whichever view fired it.
  useEffect(() => {
    const onBlocked = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; peerUrl?: string }>).detail;
      const peerUrl = detail?.peerUrl ?? info?.peerUrl;
      toast.warning(
        detail?.message ?? 'That action is disabled on the read-only dev environment.',
        {
          description: 'Run tasks on the prod environment instead.',
          action: peerUrl
            ? {
                label: 'Open prod',
                onClick: () => window.open(peerUrl, '_blank', 'noopener,noreferrer'),
              }
            : undefined,
        }
      );
    };
    window.addEventListener('dmaker:read-only-blocked', onBlocked);
    return () => window.removeEventListener('dmaker:read-only-blocked', onBlocked);
  }, [info?.peerUrl]);

  const appendLog = useCallback((text: string) => {
    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length === 0) return;
    setLog((prev) => [...prev, ...lines].slice(-MAX_LOG_LINES));
  }, []);

  const runUpdate = useCallback(async () => {
    setUpdating(true);
    setResult(null);
    setConflicts([]);
    setLog([]);
    setPhaseMessage('Starting…');

    const unsubscribe = subscribeSelfUpdate((event: SelfUpdateEvent) => {
      if (event.output) appendLog(event.output);
      if (event.message) {
        setPhaseMessage(event.message);
        appendLog(`— ${event.message}`);
      }
      if (event.conflicts?.length) setConflicts(event.conflicts);
    });

    try {
      const updateResult = await startSelfUpdate();
      setResult(updateResult);
      if (updateResult.conflicts?.length) setConflicts(updateResult.conflicts);

      if (updateResult.success && updateResult.restarting) {
        setPhaseMessage('Prod is restarting — waiting for it to come back…');
        const back = await waitForServerBack();
        if (back) {
          setPhaseMessage('Prod is back on the new build. Reloading…');
          setTimeout(() => window.location.reload(), 800);
        } else {
          setPhaseMessage('Prod did not come back in time — check the launcher window.');
        }
      }
    } catch (error) {
      // The server exits on success, so a dropped connection here usually means
      // the restart beat the response home. Confirm by waiting for health.
      setPhaseMessage('Connection dropped — checking whether prod restarted…');
      const back = await waitForServerBack(60_000);
      if (back) {
        setPhaseMessage('Prod is back. Reloading…');
        setTimeout(() => window.location.reload(), 800);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        setResult({ success: false, phase: 'failed', message });
        setPhaseMessage(message);
      }
    } finally {
      unsubscribe();
      setUpdating(false);
    }
  }, [appendLog]);

  if (!info || !info.launcherManaged) return null;

  const openPeer = () => {
    window.open(info.peerUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div
        className="flex h-8 shrink-0 items-center gap-3 border-b border-border bg-muted/40 px-3 text-xs"
        data-testid="environment-bar"
      >
        <EnvBadge info={info} />

        {info.readOnly && (
          <span className="hidden text-muted-foreground sm:inline">
            Browsing and editing only — run tasks on prod.
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {info.runner.configured && <RunnerPopover info={info} />}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={openPeer}
                data-testid="switch-environment"
              >
                Open {info.peerEnv}
                <ArrowUpRight className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {info.peerEnv === 'prod'
                ? `Open the prod environment (${info.peerUrl}), which can run tasks.`
                : `Open the read-only dev environment (${info.peerUrl}).`}
            </TooltipContent>
          </Tooltip>

          {info.selfUpdateEnabled && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[11px]"
                  onClick={() => setDialogOpen(true)}
                  data-testid="update-prod"
                >
                  <Download className="size-3" />
                  Update Prod
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Pull origin, reapply your local changes, rebuild and restart prod. Running tasks
                keep going in the runner daemon.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          // Closing mid-update would only hide the log; the update itself runs
          // server-side and cannot be cancelled from here.
          if (!updating) setDialogOpen(open);
          else if (!open)
            toast.info('The update is still running — leave this open until it ends.');
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Update Prod</DialogTitle>
            <DialogDescription>
              Stashes your local changes, pulls <code>origin</code> with a rebase, reapplies the
              stash, rebuilds, and restarts the prod server. If anything conflicts the repo is put
              back exactly as it was and nothing is rebuilt. Features already running are unaffected
              — they live in the runner daemon.
            </DialogDescription>
          </DialogHeader>

          {phaseMessage && (
            <div className="flex items-center gap-2 text-sm">
              {updating ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
              ) : result?.success ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              ) : (
                <AlertTriangle className="size-4 shrink-0 text-amber-500" />
              )}
              <span className="min-w-0 truncate">{phaseMessage}</span>
            </div>
          )}

          {conflicts.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <p className="mb-1 font-medium">
                Conflicting files — the update was rolled back, resolve these and try again:
              </p>
              <ul className="max-h-32 list-inside list-disc overflow-y-auto font-mono">
                {conflicts.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            </div>
          )}

          {log.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
              {log.map((line, index) => (
                <div key={`${index}-${line.slice(0, 24)}`}>{line}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" disabled={updating} onClick={() => setDialogOpen(false)}>
              Close
            </Button>
            <Button disabled={updating} onClick={() => void runUpdate()} data-testid="run-update">
              {updating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Updating…
                </>
              ) : (
                <>
                  <RefreshCw className="size-4" />
                  {result ? 'Run again' : 'Start update'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
