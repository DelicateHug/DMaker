import { describe, expect, it } from 'vitest';
import { MASTER_AGENT_ID, MASTER_AGENT_NAME } from '@dmaker/types';
import {
  isMarkdownEntryType,
  parseLogOutput,
  splitHtmlComments,
  type LogEntryType,
} from '@/lib/log-parser';

/**
 * The agent configuration debug header, exactly as auto-mode-service.ts builds
 * it: one HTML comment per line and nothing else. It is classified `info`, so it
 * goes down the markdown path — where react-markdown and rehype-sanitize would
 * between them erase every line of it.
 */
const AGENT_DEBUG_BLOCK = [
  '<!-- Agent Configuration Debug -->',
  '<!-- Feature: 27-08-2026-example | Status: in_progress | Model: claude-opus-4-6 -->',
  '<!-- Selected Agents: ["code-reviewer"] -->',
  '<!-- Agents Discovered: code-reviewer, test-writer -->',
  '<!-- Planning Phase: false | Agent Prompt Injected: true -->',
  '<!-- Agent System Prompt (120 chars): You are a careful reviewer. -->',
  '<!-- SDK System Prompt: preset=claude_code, append=940 chars -->',
].join('\n');

describe('splitHtmlComments', () => {
  it('turns the agent debug header into one comment segment and no markdown', () => {
    const segments = splitHtmlComments(AGENT_DEBUG_BLOCK);

    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe('comment');
    expect(segments[0].text).toBe(AGENT_DEBUG_BLOCK);
    expect(segments.filter((segment) => segment.kind === 'markdown')).toHaveLength(0);
  });

  it('keeps an inline comment and its surrounding prose in source order', () => {
    const segments = splitHtmlComments('Before <!-- hidden --> after');

    expect(segments).toEqual([
      { kind: 'markdown', text: 'Before ' },
      { kind: 'comment', text: '<!-- hidden -->' },
      { kind: 'markdown', text: ' after' },
    ]);
  });

  it('returns comment-free prose as a single markdown segment', () => {
    const prose = '## Heading\n\nSome prose with a [link](https://example.com).';

    expect(splitHtmlComments(prose)).toEqual([{ kind: 'markdown', text: prose }]);
  });

  it('treats a comment still being streamed as a comment, not as prose', () => {
    // The transcript is written as it streams, so the closing --> may not have
    // landed yet. Falling through to markdown would blank the entry mid-run.
    const segments = splitHtmlComments('prose\n<!-- Agent Configuration Debug');

    expect(segments).toEqual([
      { kind: 'markdown', text: 'prose\n' },
      { kind: 'comment', text: '<!-- Agent Configuration Debug' },
    ]);
  });

  it('returns nothing for empty content', () => {
    expect(splitHtmlComments('')).toEqual([]);
  });
});

describe('isMarkdownEntryType', () => {
  it('is true only for the prose entry types', () => {
    const markdownTypes: LogEntryType[] = ['info', 'success', 'prompt'];
    const monospaceTypes: LogEntryType[] = [
      'tool_call',
      'tool_result',
      'debug',
      'error',
      'warning',
      'thinking',
      'phase',
    ];

    for (const type of markdownTypes) {
      expect(isMarkdownEntryType(type)).toBe(true);
    }
    for (const type of monospaceTypes) {
      expect(isMarkdownEntryType(type)).toBe(false);
    }
  });
});

describe('parseLogOutput agent attribution', () => {
  it('attributes a marker-free transcript entirely to master', () => {
    const transcript = [
      'Master is planning the change.',
      '',
      '[timestamp:2026-08-27T10:00:00.000Z] 🔧 Tool: Read',
      'Input: {"file_path":"/tmp/a.ts"}',
      '',
      '[timestamp:2026-08-27T10:00:01.000Z] ✅ Task T001 completed',
    ].join('\n');

    const entries = parseLogOutput(transcript);

    expect(entries.length).toBeGreaterThan(1);
    expect(entries.every((entry) => entry.metadata?.agentId === MASTER_AGENT_ID)).toBe(true);
    expect(entries.every((entry) => entry.metadata?.agentName === MASTER_AGENT_NAME)).toBe(true);
  });

  it('leaves existing tool metadata intact', () => {
    const entries = parseLogOutput(
      [
        '[timestamp:2026-08-27T10:00:00.000Z] 🔧 Tool: Read',
        'Input: {"file_path":"/tmp/a.ts"}',
      ].join('\n')
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('tool_call');
    expect(entries[0].metadata?.toolName).toBe('Read');
    expect(entries[0].metadata?.toolCategory).toBe('read');
    expect(entries[0].metadata?.filePath).toBe('/tmp/a.ts');
    expect(entries[0].metadata?.agentId).toBe(MASTER_AGENT_ID);
  });

  it('switches owner on a marker and switches back', () => {
    const transcript = [
      'Master is planning the change.',
      '',
      '[timestamp:2026-08-27T10:00:00.000Z] [agent:toolu_01ABC] ▶ code-reviewer',
      '',
      'Reviewed the diff and found two issues.',
      '',
      '[timestamp:2026-08-27T10:00:05.000Z] [agent:master] ▶ Master',
      '',
      'Applying the review feedback.',
    ].join('\n');

    const entries = parseLogOutput(transcript);

    expect(entries).toHaveLength(3);

    expect(entries[0].metadata?.agentId).toBe(MASTER_AGENT_ID);
    expect(entries[0].content).toBe('Master is planning the change.');

    expect(entries[1].metadata?.agentId).toBe('toolu_01ABC');
    expect(entries[1].metadata?.agentName).toBe('code-reviewer');
    expect(entries[1].content).toContain('Reviewed the diff and found two issues.');
    // The raw tool_use id is metadata, never display content
    expect(entries[1].content).not.toContain('[agent:');
    expect(entries[1].content).toContain('▶ code-reviewer');

    expect(entries[2].metadata?.agentId).toBe(MASTER_AGENT_ID);
    expect(entries[2].metadata?.agentName).toBe(MASTER_AGENT_NAME);
    expect(entries[2].content).toContain('Applying the review feedback.');
  });

  it('keeps a marked sub-agent handover on the markdown path', () => {
    const entries = parseLogOutput(
      [
        '[timestamp:2026-08-27T10:00:00.000Z] [agent:toolu_01ABC] ▶ code-reviewer',
        '',
        '## Findings',
        '',
        '- one',
      ].join('\n')
    );

    expect(entries).toHaveLength(1);
    expect(isMarkdownEntryType(entries[0].type)).toBe(true);
  });

  it('attributes a sub-agent tool call to the sub-agent', () => {
    const entries = parseLogOutput(
      [
        'Master is delegating.',
        '',
        '[timestamp:2026-08-27T10:00:00.000Z] [agent:toolu_01ABC] ▶ code-reviewer',
        '',
        '[timestamp:2026-08-27T10:00:02.000Z] 🔧 Tool: Grep',
        'Input: {"pattern":"TODO"}',
      ].join('\n')
    );

    const toolEntry = entries.find((entry) => entry.type === 'tool_call');
    expect(toolEntry?.metadata?.toolName).toBe('Grep');
    expect(toolEntry?.metadata?.agentId).toBe('toolu_01ABC');
  });

  it('does not merge consecutive prose entries across a change of author', () => {
    const entries = parseLogOutput(
      [
        'Master prose.',
        '',
        '[timestamp:2026-08-27T10:00:00.000Z] [agent:toolu_01ABC] ▶ code-reviewer',
        '',
        'Sub-agent prose.',
      ].join('\n')
    );

    expect(entries).toHaveLength(2);
    expect(entries[0].content).toBe('Master prose.');
    expect(entries[0].metadata?.agentId).toBe(MASTER_AGENT_ID);
    expect(entries[1].content).toContain('Sub-agent prose.');
    expect(entries[1].metadata?.agentId).toBe('toolu_01ABC');
  });

  it('attributes a Cursor NDJSON event too, so no consumer sees a missing agentId', () => {
    const event = JSON.stringify({
      type: 'system',
      session_id: 'cursor-1',
      model: 'composer-1',
      apiKeySource: 'login',
      cwd: '/repo',
    });

    const entries = parseLogOutput(event);

    expect(entries).toHaveLength(1);
    expect(entries[0].metadata?.agentId).toBe(MASTER_AGENT_ID);
    expect(entries[0].metadata?.agentName).toBe(MASTER_AGENT_NAME);
    // The Cursor normaliser's own metadata survives
    expect(entries[0].metadata?.phase).toBe('init');
  });

  it('does not read prose that merely opens with [agent:...] as a handover', () => {
    const transcript = [
      'Master explains the marker format:',
      '',
      '[agent:not-a-real-marker] ▶ impostor',
      '',
      'and carries on.',
    ].join('\n');

    const entries = parseLogOutput(transcript);

    expect(entries.every((entry) => entry.metadata?.agentId === MASTER_AGENT_ID)).toBe(true);
    expect(entries.map((entry) => entry.content).join('\n')).toContain('[agent:not-a-real-marker]');
  });
});
