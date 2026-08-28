import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ExecutionMetrics, SubagentSummary } from '@dmaker/types';
import { MetricsPanel } from '@/components/ui/metrics-panel';

function makeMetrics(overrides: Partial<ExecutionMetrics> = {}): ExecutionMetrics {
  return {
    inputTokens: 100,
    outputTokens: 200,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    totalCostUSD: 0.12,
    numTurns: 4,
    durationMs: 60_000,
    durationApiMs: 30_000,
    modelUsage: {},
    skillsUsed: [],
    subagentsSpawned: 0,
    skillsLoaded: [],
    agentsLoaded: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSubagent(overrides: Partial<SubagentSummary> = {}): SubagentSummary {
  return {
    agentId: 'toolu_1',
    parentAgentId: 'master',
    depth: 1,
    name: 'general-purpose',
    status: 'completed',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:00:12.000Z',
    toolCallCount: 7,
    ...overrides,
  };
}

describe('MetricsPanel sub-agent roll-up', () => {
  it('renders one row per sub-agent with name, tool calls, duration and status', () => {
    render(
      <MetricsPanel
        metrics={makeMetrics({
          subagentsSpawned: 2,
          subagents: [
            makeSubagent({ agentId: 'toolu_1', name: 'code-reviewer', description: 'Review diff' }),
            makeSubagent({
              agentId: 'toolu_2',
              name: 'explore',
              status: 'failed',
              toolCallCount: 1,
              endedAt: '2026-01-01T00:00:03.500Z',
            }),
          ],
        })}
      />
    );

    const rows = screen.getAllByTestId('metrics-subagent-row');
    expect(rows).toHaveLength(2);

    expect(rows[0]).toHaveAttribute('data-agent-status', 'completed');
    expect(rows[0]).toHaveTextContent('code-reviewer');
    expect(rows[0]).toHaveTextContent('Review diff');
    expect(rows[0]).toHaveTextContent('7 tool calls');
    expect(rows[0]).toHaveTextContent('12.0s');

    expect(rows[1]).toHaveAttribute('data-agent-status', 'failed');
    expect(rows[1]).toHaveTextContent('1 tool call');
    expect(rows[1]).toHaveTextContent('3.5s');
  });

  it('renders no per-agent cost — SDKResultMessage carries no parent_tool_use_id', () => {
    // Deliberate and permanent: usage is whole-run only, so a per-agent cost
    // column could only ever be invented. Guard it so nobody adds one back.
    render(
      <MetricsPanel metrics={makeMetrics({ subagentsSpawned: 1, subagents: [makeSubagent()] })} />
    );
    const row = screen.getByTestId('metrics-subagent-row');
    expect(row.textContent).not.toMatch(/\$/);
    expect(row.textContent).not.toMatch(/token/i);
  });

  it('shows a dash for a sub-agent that never completed', () => {
    render(
      <MetricsPanel
        metrics={makeMetrics({
          subagentsSpawned: 1,
          subagents: [makeSubagent({ status: 'aborted', endedAt: undefined })],
        })}
      />
    );
    expect(screen.getByTestId('metrics-subagent-row')).toHaveTextContent('—');
  });

  it('says the roll-up is missing rather than implying a single-agent run', () => {
    // `subagents` is written on the success path only, so undefined with a
    // non-zero spawn count means "not recorded", never "none ran".
    render(<MetricsPanel metrics={makeMetrics({ subagentsSpawned: 3, subagents: undefined })} />);

    expect(screen.getByTestId('metrics-subagents-unavailable')).toBeInTheDocument();
    expect(screen.queryAllByTestId('metrics-subagent-row')).toHaveLength(0);
    // The count itself is still the truth and still shown.
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('stays silent for a genuine single-agent run', () => {
    render(<MetricsPanel metrics={makeMetrics({ subagentsSpawned: 0, subagents: undefined })} />);
    expect(screen.queryByTestId('metrics-subagents-unavailable')).not.toBeInTheDocument();
    expect(screen.queryByTestId('metrics-subagents')).not.toBeInTheDocument();
  });

  it('stays silent when the run recorded an empty roll-up', () => {
    render(<MetricsPanel metrics={makeMetrics({ subagentsSpawned: 0, subagents: [] })} />);
    expect(screen.queryByTestId('metrics-subagents')).not.toBeInTheDocument();
    expect(screen.queryByTestId('metrics-subagents-unavailable')).not.toBeInTheDocument();
  });

  it('still renders the existing metrics when there are no metrics at all', () => {
    render(<MetricsPanel metrics={null} isRunning />);
    expect(screen.getByText('No metrics available yet')).toBeInTheDocument();
  });
});
