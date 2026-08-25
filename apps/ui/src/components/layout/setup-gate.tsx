/**
 * Setup gate — replaces the first-run wizard with a detection check.
 *
 * The wizard used to be unconditional: every fresh `DATA_DIR` had
 * `setupComplete: false`, so a five-step flow ran before the board even
 * appeared. That is pure ceremony on a machine that already has Claude and
 * `gh` signed in, and it got noticeably worse once `start.ps1` split dev and
 * prod into their own data directories — one machine, one set of credentials,
 * two wizards.
 *
 * So: ask the server what it can actually detect. Everything found means setup
 * is silently marked complete and nothing is shown, theme included (the default
 * theme is a fine default; Settings can change it). Something missing means a
 * dialog that names it and gives the command to fix it.
 *
 * The dialog only blocks while setup has never been completed AND Claude is
 * missing, because without a Claude credential no agent can run and the board
 * is decorative. GitHub alone missing is worth saying, but PR and issue
 * features are the only things it gates, so it never holds the app hostage.
 * After setup is complete, a later regression downgrades to a toast — a
 * notification, not a wall.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Copy, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { getHttpApiClient, type SetupReadinessResponse } from '@/lib/http-api-client';
import { useSetupStore } from '@/store/setup-store';
import { createLogger } from '@dmaker/utils/logger';

const logger = createLogger('SetupGate');

/** Detection shells out to `where`/`gh`; let the app paint before probing. */
const INITIAL_CHECK_DELAY_MS = 400;

interface RequirementRowProps {
  name: string;
  ok: boolean;
  detail: string;
  fix: string;
  optional?: boolean;
}

function RequirementRow({ name, ok, detail, fix, optional }: RequirementRowProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-start gap-2.5">
        {ok ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{name}</span>
            {optional && !ok && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                optional
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>

          {/* The fix is the whole point of showing the row, so it is one click
              away rather than something to retype from a screenshot. */}
          {!ok && (
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">
                {fix}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  void navigator.clipboard.writeText(fix);
                  toast.success('Command copied');
                }}
                aria-label={`Copy command to fix ${name}`}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SetupGate({ enabled }: { enabled: boolean }) {
  const setupComplete = useSetupStore((state) => state.setupComplete);
  const completeSetup = useSetupStore((state) => state.completeSetup);

  const [readiness, setReadiness] = useState<SetupReadinessResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const checkedOnce = useRef(false);
  const warnedOnce = useRef(false);

  const check = useCallback(async (refresh: boolean): Promise<SetupReadinessResponse | null> => {
    setChecking(true);
    try {
      const result = await getHttpApiClient().setup.getReadiness(refresh);
      setReadiness(result);
      return result;
    } catch (error) {
      // A probe that cannot even run is not evidence of a broken install, so
      // it must not raise a wall in front of a working app. Log and move on.
      logger.error('Setup readiness check failed:', error);
      return null;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || checkedOnce.current) return;
    checkedOnce.current = true;

    const timeoutId = setTimeout(() => {
      void check(false).then((result) => {
        // The probe itself failed, which says nothing about the install. Fail
        // open: a broken detector must not leave `setupComplete` false forever,
        // because other startup work (auto-opening the last project) waits on it.
        if (!result?.success) {
          if (!setupComplete) completeSetup();
          return;
        }

        // Everything detected: record it and never ask again. This is the path
        // that removes the wizard for a machine that was already set up.
        if (result.ready) {
          if (!setupComplete) {
            logger.info('Claude and GitHub detected — skipping setup');
            completeSetup();
          }
          return;
        }

        // Already past setup: a regression is a notification, not a blocker.
        if (setupComplete && !warnedOnce.current) {
          warnedOnce.current = true;
          const missing = [
            !result.claude.ok ? 'Claude' : null,
            !result.github.ok ? 'GitHub CLI' : null,
          ]
            .filter(Boolean)
            .join(' and ');
          toast.warning(`${missing} not detected`, {
            description: result.claude.ok ? result.github.detail : result.claude.detail,
            duration: 8000,
          });
        }
      });
    }, INITIAL_CHECK_DELAY_MS);

    return () => clearTimeout(timeoutId);
  }, [enabled, check, setupComplete, completeSetup]);

  const handleRecheck = useCallback(() => {
    void check(true).then((result) => {
      if (result?.success && result.ready) {
        completeSetup();
        toast.success('All set — Claude and GitHub detected');
      }
    });
  }, [check, completeSetup]);

  // Accepting the gaps is a decision, so it is recorded like finishing setup
  // was: the dialog does not come back on the next boot.
  const handleContinue = useCallback(() => {
    setDismissed(true);
    completeSetup();
  }, [completeSetup]);

  const open =
    enabled &&
    !setupComplete &&
    !dismissed &&
    readiness !== null &&
    readiness.success &&
    !readiness.ready;

  if (!readiness) return null;

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent
        className="max-w-lg"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        data-testid="setup-gate-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Finish connecting DMaker
          </DialogTitle>
          <DialogDescription>
            {readiness.blocking
              ? 'DMaker runs agents through Claude, so it needs a Claude credential before it can do any work.'
              : 'DMaker is ready to run agents. One optional integration is not connected.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <RequirementRow
            name="Claude"
            ok={readiness.claude.ok}
            detail={readiness.claude.detail}
            fix={readiness.claude.fix}
          />
          <RequirementRow
            name="GitHub CLI"
            ok={readiness.github.ok}
            detail={readiness.github.detail}
            fix={readiness.github.fix}
            optional
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Run the command in a terminal, then recheck. Nothing here is stored by DMaker — it reads
          the credentials the CLIs already keep.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={handleContinue} data-testid="setup-gate-continue">
            Continue anyway
          </Button>
          <Button onClick={handleRecheck} disabled={checking} data-testid="setup-gate-recheck">
            {checking ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
            )}
            Recheck
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
