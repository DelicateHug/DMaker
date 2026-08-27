import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

/**
 * jsdom ships none of the layout/observer APIs the UI reaches for on mount.
 * Every one of these is absent rather than broken, so a component that calls it
 * dies with "matchMedia is not a function" long before any assertion runs.
 */

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })) as unknown as typeof window.matchMedia;
}

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

// Reached through globalThis rather than as bare identifiers: eslint's browser
// globals list in eslint.config.mjs has ResizeObserver but not
// IntersectionObserver, and a bare reference trips no-undef.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = NoopObserver as unknown as typeof globalThis.ResizeObserver;
}

if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver =
    NoopObserver as unknown as typeof globalThis.IntersectionObserver;
}

// jsdom implements no scrolling at all. The transcript panes call these on
// every append to keep the view pinned to the bottom.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
}

beforeEach(() => {
  // Zustand stores persist to localStorage. Without this a store hydrated in
  // one test leaks its state into the next and the failure looks like a bug in
  // whatever ran second.
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});
