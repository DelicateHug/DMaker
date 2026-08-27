import { describe, it, expect } from 'vitest';
import { createMockRunningAgentsAPI } from '@/lib/electron';

describe('mock RunningAgentsAPI.getTree', () => {
  it('answers with a null tree, which is what puts callers on the fallback path', async () => {
    const api = createMockRunningAgentsAPI();

    const result = await api.getTree('/mock/project', 'feature-1');

    // `tree: null` is the real server's answer for every run recorded before
    // agent-tree tracking landed, and for any provider that never sets
    // parent_tool_use_id. If this mock ever starts returning a fabricated tree,
    // the synthesised one-node "Master" fallback stops being exercised
    // anywhere — so this assertion is the guard on that, not a tautology.
    expect(result).toEqual({ success: true, tree: null });
  });

  it('reports success rather than an error, so callers do not render a failure state', async () => {
    const api = createMockRunningAgentsAPI();

    const result = await api.getTree('/mock/project', 'feature-1');

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
