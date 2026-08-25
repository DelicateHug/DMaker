import { memo, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface BranchRefreshCountdownProps {
  /** Epoch ms the next automatic remote check is due; absent means unscheduled */
  dueAt?: number;
  /** A check is running right now, so the countdown is momentarily meaningless */
  isChecking?: boolean;
  className?: string;
}

/** `m:ss`, or `now` once the branch is due (or overdue). */
function formatRemaining(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds === 0) return 'now';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * How long until this branch next checks itself against the remote.
 *
 * Each branch gets its own randomised delay, so the sidebar cannot show one
 * shared timer — and without a per-branch number there is no way to tell a
 * branch that is about to refresh from one that just did. It ticks its own
 * clock rather than taking `now` from a parent, so a second passing re-renders
 * this one span instead of the whole sidebar.
 */
export const BranchRefreshCountdown = memo(function BranchRefreshCountdown({
  dueAt,
  isChecking,
  className,
}: BranchRefreshCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (dueAt === undefined) return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [dueAt]);

  if (dueAt === undefined) return null;

  const remaining = dueAt - now;
  const label = isChecking ? '···' : formatRemaining(remaining);

  return (
    <span
      className={cn(
        'shrink-0 select-none font-mono text-[9px] leading-none tabular-nums',
        'text-muted-foreground/40 transition-colors duration-150',
        'group-hover/section:text-muted-foreground/70',
        className
      )}
      title={
        isChecking
          ? 'Checking this branch against its remote…'
          : `Next automatic remote check in ${formatRemaining(remaining)} — refreshing restarts it`
      }
      data-testid="branch-refresh-countdown"
    >
      {label}
    </span>
  );
});
