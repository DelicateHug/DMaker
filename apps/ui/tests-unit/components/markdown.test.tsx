import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown } from '@/components/ui/markdown';

/**
 * `Markdown` is the only sanitising boundary between agent-authored text and the
 * DOM. Nothing guarded that before this suite: `rehypeSanitize` was wired in and
 * never asserted, so removing it would have been a silent, invisible change.
 */
describe('Markdown', () => {
  /**
   * Must stay the FIRST test in this file. `markdown.tsx` builds its `lazy()`
   * once at module scope, so only the first render in the module's lifetime
   * suspends — later ones resolve synchronously and never show the fallback.
   */
  it('shows the skeleton fallback while the renderer chunk loads', async () => {
    render(<Markdown>{'# Loading'}</Markdown>);

    expect(screen.getByRole('status')).toBeInTheDocument();

    // Settle the lazy boundary so the fallback is gone by the next test.
    expect(await screen.findByRole('heading', { level: 1, name: 'Loading' })).toBeInTheDocument();
  });

  it('renders headings, lists, inline code and links as real elements', async () => {
    const { container } = render(
      <Markdown>
        {[
          '# Title',
          '',
          'Some `inline` code.',
          '',
          '- one',
          '- two',
          '',
          '[docs](https://example.com/docs)',
        ].join('\n')}
      </Markdown>
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(container.querySelector('code')).toHaveTextContent('inline');
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute(
      'href',
      'https://example.com/docs'
    );
  });

  it('renders GFM tables, task lists and strikethrough', async () => {
    // react-markdown is CommonMark-only. Without remark-gfm every one of these
    // renders as literal pipes, brackets and tildes, and agent summaries are
    // full of them.
    const { container } = render(
      <Markdown>
        {[
          '| File | Lines |',
          '| --- | --- |',
          '| a.ts | 12 |',
          '',
          '- [x] wrote tests',
          '- [ ] update docs',
          '',
          '~~dropped~~',
        ].join('\n')}
      </Markdown>
    );

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'File' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'a.ts' })).toBeInTheDocument();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(container.querySelector('del')).toHaveTextContent('dropped');
  });

  it('keeps allowed raw HTML', async () => {
    const { container } = render(
      <Markdown>{'Before\n\n<span><strong>bold</strong></span>'}</Markdown>
    );

    expect(await screen.findByText('Before')).toBeInTheDocument();
    expect(container.querySelector('span strong')).toHaveTextContent('bold');
  });

  it('strips a <script> element', async () => {
    const { container } = render(
      <Markdown>
        {'Before\n\n<script>globalThis.__markdownPwned = true;</script>\n\nAfter'}
      </Markdown>
    );

    expect(await screen.findByText('Before')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect((globalThis as Record<string, unknown>).__markdownPwned).toBeUndefined();
  });

  it('strips an inline event-handler attribute', async () => {
    const { container } = render(
      <Markdown>
        {'<img src="broken.png" alt="broken" onerror="globalThis.__markdownPwned = true">'}
      </Markdown>
    );

    const image = await screen.findByAltText('broken');
    expect(image).not.toHaveAttribute('onerror');
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect((globalThis as Record<string, unknown>).__markdownPwned).toBeUndefined();
  });
});
