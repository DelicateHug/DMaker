import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createLogger } from '@dmaker/utils/logger';

/**
 * Proves the harness itself, not any application code: jsdom, TSX, React
 * Testing Library, the jest-dom matchers, and the '@dmaker/utils/logger'
 * subpath alias. Delete this only when real UI tests cover all five.
 */
describe('ui unit-test harness', () => {
  it('renders a component into jsdom with jest-dom matchers available', () => {
    render(<p data-testid="harness">ready</p>);
    expect(screen.getByTestId('harness')).toBeInTheDocument();
    expect(screen.getByTestId('harness')).toHaveTextContent('ready');
  });

  it('resolves the @dmaker/utils/logger subpath', () => {
    expect(typeof createLogger('harness').info).toBe('function');
  });
});
