import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogViewer } from '@/components/ui/log-viewer';

/**
 * The seven-line configuration header the server writes before every run. It is
 * nothing but HTML comments and the parser classifies the whole block — header
 * plus the prose that follows it — as a single `info` entry, which is exactly
 * why it lands on the markdown path. react-markdown drops comment nodes, so
 * without `splitHtmlComments` this entry renders as a badge above an empty body.
 */
const DEBUG_HEADER = [
  '<!-- Agent Configuration Debug -->',
  '<!-- Feature: markdown-in-the-transcript | Status: in_progress | Model: claude-opus-4-6 -->',
  '<!-- Selected Agents: ["code-reviewer"] -->',
  '<!-- Agents Discovered: code-reviewer, tester -->',
  '<!-- Planning Phase: false | Agent Prompt Injected: true -->',
  '<!-- SDK System Prompt: preset=claude_code, append=1284 chars -->',
].join('\n');

/**
 * Deliberately carries the three shapes the old JSON splitter destroyed: a
 * markdown link (split at `[the parser]`), a task-list marker (split at `[x]`)
 * and a fenced block containing braces (torn out and re-emitted as
 * pretty-printed JSON).
 */
const PROSE = [
  '## Notes',
  '',
  'Read [the parser](https://example.com/parser).',
  '',
  '- [x] wrote tests',
  '',
  '```json',
  '{ "a": 1 }',
  '```',
  '',
  'Done.',
].join('\n');

const TOOL_CALL = ['🔧 Tool: Read', 'Input:', '{"file_path":"/repo/a.ts"}'].join('\n');

const OUTPUT = `${DEBUG_HEADER}\n\n${PROSE}\n\n${TOOL_CALL}`;

/** Expands every entry; the combined info entry is long enough to collapse by default. */
async function renderExpanded(output = OUTPUT) {
  const user = userEvent.setup();
  const view = render(<LogViewer output={output} />);
  await user.click(screen.getByTestId('log-expand-all'));
  return { ...view, user };
}

describe('LogViewer markdown rendering', () => {
  it('renders agent prose as markdown', async () => {
    await renderExpanded();

    expect(await screen.findByRole('heading', { level: 2, name: 'Notes' })).toBeInTheDocument();

    // A markdown link, not the `[the parser]` fragment the JSON splitter used to
    // carve out of it.
    expect(screen.getByRole('link', { name: 'the parser' })).toHaveAttribute(
      'href',
      'https://example.com/parser'
    );

    // The task-list marker survived rather than being split at `[x]`.
    const markdown = screen.getByTestId('log-entry-markdown');
    expect(within(markdown).getByRole('checkbox')).toBeChecked();
  });

  it('keeps a fenced code block verbatim instead of pretty-printing it as JSON', async () => {
    const { container } = await renderExpanded();
    await screen.findByRole('heading', { level: 2, name: 'Notes' });

    const fenced = container.querySelector('[data-testid="log-entry-markdown"] pre code');
    expect(fenced).not.toBeNull();
    // Reformatted JSON would read `{\n  "a": 1\n}`.
    expect(fenced?.textContent).toContain('{ "a": 1 }');
  });

  it('still shows the HTML-comment debug header, delimiters and line breaks intact', async () => {
    await renderExpanded();
    await screen.findByRole('heading', { level: 2, name: 'Notes' });

    const comment = screen.getByTestId('log-entry-comment');
    expect(comment).toBeVisible();

    // One coalesced block: first and last comment lines are in the same element,
    // with their `<!--`/`-->` delimiters kept.
    expect(comment.textContent).toContain('<!-- Agent Configuration Debug -->');
    expect(comment.textContent).toContain(
      '<!-- SDK System Prompt: preset=claude_code, append=1284 chars -->'
    );
    expect(comment.textContent?.split('\n')).toHaveLength(6);
  });

  it('applies the transcript markdown overrides over the renderer defaults', async () => {
    const { container } = await renderExpanded();
    await screen.findByRole('heading', { level: 2, name: 'Notes' });

    const markdownRoot = container.querySelector('[data-testid="log-entry-markdown"] > div');
    expect(markdownRoot).not.toBeNull();

    // LogViewer is mounted inside a `font-mono text-xs` container in
    // agent-output-modal.tsx, so prose has to opt back out of monospace.
    expect(markdownRoot?.classList.contains('font-sans')).toBe(true);
    expect(markdownRoot?.classList.contains('font-mono')).toBe(false);

    // tailwind-merge has to resolve the overlapping arbitrary variants in favour
    // of the transcript's tighter sizes, not markdown-renderer.tsx's defaults.
    expect(markdownRoot?.classList.contains('[&_h2]:text-sm')).toBe(true);
    expect(markdownRoot?.classList.contains('[&_h2]:text-lg')).toBe(false);
  });
});

describe('LogViewer non-markdown entries', () => {
  it('keeps tool calls on the monospace arm with pretty-printed JSON', async () => {
    await renderExpanded();

    const toolEntry = screen.getByTestId('log-entry-tool_call');
    expect(within(toolEntry).queryByTestId('log-entry-markdown')).not.toBeInTheDocument();

    const pre = toolEntry.querySelector('pre');
    expect(pre?.textContent).toContain('"file_path": "/repo/a.ts"');
  });
});

describe('LogViewer header, filters and search', () => {
  it('still labels badges from entry.title', async () => {
    await renderExpanded();

    const badges = screen.getAllByTestId('log-entry-badge').map((b) => b.textContent);
    expect(badges).toContain('Info');
    expect(badges).toContain('Tool Call: Read');
  });

  it('still counts entries by type in the filter row', async () => {
    await renderExpanded();

    expect(screen.getByTestId('log-type-filter-info')).toHaveTextContent('info: 1');
    expect(screen.getByTestId('log-type-filter-tool_call')).toHaveTextContent('tool_call: 1');
  });

  it('still searches raw entry content, not rendered output', async () => {
    const { user } = await renderExpanded();

    // `file_path` only ever appears in the tool call's raw JSON.
    await user.type(screen.getByTestId('log-search-input'), 'file_path');
    expect(screen.getByTestId('log-entry-tool_call')).toBeInTheDocument();
    expect(screen.queryByTestId('log-entry-info')).not.toBeInTheDocument();

    // `Agents Discovered` only ever appears inside the HTML comments, which the
    // markdown arm renders but never rewrites.
    await user.clear(screen.getByTestId('log-search-input'));
    await user.type(screen.getByTestId('log-search-input'), 'Agents Discovered');
    expect(screen.getByTestId('log-entry-info')).toBeInTheDocument();
    expect(screen.queryByTestId('log-entry-tool_call')).not.toBeInTheDocument();
  });

  it('renders entries appended by a later stream chunk', async () => {
    // LogEntryItem is memoized on entry fields rather than object identity —
    // parseLogOutput rebuilds every entry per streamed token. Over-caching would
    // show up here as a missing new entry or a stale old one.
    const { rerender } = await renderExpanded();
    await screen.findByRole('heading', { level: 2, name: 'Notes' });

    rerender(<LogViewer output={`${OUTPUT}\n\n🔧 Tool: Bash\nInput:\n{"command":"npm test"}`} />);

    expect(await screen.findByRole('heading', { level: 2, name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByTestId('log-entry-comment')).toBeVisible();
    expect(screen.getAllByTestId('log-entry-tool_call')).toHaveLength(2);
    expect(screen.getByTestId('log-type-filter-tool_call')).toHaveTextContent('tool_call: 2');
  });
});
