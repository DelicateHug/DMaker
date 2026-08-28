import {
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Loader2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { AgentNode, AgentNodeStatus } from '@dmaker/types';
import { cn } from '@/lib/utils';

/**
 * Presentation vocabulary for one agent node, kept beside the sidebar's
 * `status-meta.ts` in spirit: the status names themselves are left alone and
 * only the glyph, colour and label are derived here, so the chain, the header
 * and the spawn strip cannot disagree about what "failed" looks like.
 *
 * Every status carries its own glyph rather than a shared dot, so a row reads
 * without decoding colour alone.
 */
export interface AgentStatusMeta {
  label: string;
  Icon: LucideIcon;
  /** CSS colour expression, using the same `--status-*` tokens as the sidebar. */
  color: string;
  /** The agent is still working — the icon spins. */
  isWorking: boolean;
}

const AGENT_STATUS_META: Record<AgentNodeStatus, AgentStatusMeta> = {
  running: {
    label: 'Running',
    Icon: Loader2,
    color: 'var(--status-in-progress)',
    isWorking: true,
  },
  completed: {
    label: 'Completed',
    Icon: CircleCheck,
    color: 'var(--status-completed)',
    isWorking: false,
  },
  failed: { label: 'Failed', Icon: TriangleAlert, color: 'var(--status-error)', isWorking: false },
  aborted: {
    label: 'Aborted',
    Icon: CircleSlash,
    color: 'var(--status-backlog)',
    isWorking: false,
  },
};

/**
 * The meta for a node, with two corrections the raw status cannot make:
 *
 * - A `tool_result` carrying `is_error` closes the node as 'completed' with
 *   `isError` set — the Task call returned, it just returned a failure. Showing
 *   that as a green tick is the one reading a user would call a lie.
 * - A background Task returns `{status:"async_launched"}` and never receives an
 *   in-turn `tool_result`, so its node stays 'running' for the rest of the run.
 *   A permanent spinner would read as hung; it is detached, which is different.
 */
export function getAgentStatusMeta(node: AgentNode): AgentStatusMeta {
  if (node.status === 'completed' && node.isError) return AGENT_STATUS_META.failed;
  if (node.status === 'running' && node.background) {
    return {
      label: 'Detached',
      Icon: CircleDashed,
      color: 'var(--status-backlog)',
      isWorking: false,
    };
  }
  return AGENT_STATUS_META[node.status] ?? AGENT_STATUS_META.aborted;
}

/** The status glyph on its own, coloured and spun to match `getAgentStatusMeta`. */
export function AgentStatusIcon({ node, className }: { node: AgentNode; className?: string }) {
  const { Icon, isWorking, label, color } = getAgentStatusMeta(node);
  return (
    <Icon
      className={cn('size-3.5 shrink-0', isWorking && 'animate-spin', className)}
      style={{ color }}
      aria-label={label}
    />
  );
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.max(milliseconds, 0)}ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds - minutes * 60)}s`;
}

/**
 * How long the agent ran, or null while it is still running.
 *
 * Deliberately not a live-ticking figure: the chain re-renders on every
 * streamed event as it is, and a per-second timer on every row would keep the
 * whole column repainting for a number nobody is reading.
 */
export function formatAgentDuration(node: AgentNode): string | null {
  if (!node.endedAt) return null;
  const started = Date.parse(node.startedAt);
  const ended = Date.parse(node.endedAt);
  if (Number.isNaN(started) || Number.isNaN(ended)) return null;
  return formatDuration(ended - started);
}

/** `N tools`, or null when nothing was attributed to this agent. */
export function formatAgentToolCount(node: AgentNode): string | null {
  if (!node.toolCallCount) return null;
  return `${node.toolCallCount} tool${node.toolCallCount === 1 ? '' : 's'}`;
}

/**
 * The one-line subtitle: the Task call's 3-5 word description when there is
 * one, otherwise nothing. Master has no description and needs none.
 */
export function agentSubtitle(node: AgentNode): string | null {
  return node.description?.trim() || null;
}
