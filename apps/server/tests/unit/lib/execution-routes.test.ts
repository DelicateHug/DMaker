import { describe, it, expect } from 'vitest';
import {
  findReadOnlyRule,
  normalizePath,
  shouldProxyToRunner,
  READ_ONLY_BLOCKED,
} from '@/lib/execution-routes.js';

describe('execution-routes.ts', () => {
  describe('normalizePath', () => {
    it('strips the query string', () => {
      expect(normalizePath('/api/auto-mode/run-feature?x=1&y=2')).toBe(
        '/api/auto-mode/run-feature'
      );
    });

    it('leaves a bare path alone', () => {
      expect(normalizePath('/api/features/list')).toBe('/api/features/list');
    });
  });

  describe('findReadOnlyRule', () => {
    it('blocks starting a feature', () => {
      const rule = findReadOnlyRule('POST', '/api/auto-mode/run-feature');
      expect(rule?.what).toBe('Running a feature');
    });

    it('blocks starting an agent', () => {
      expect(findReadOnlyRule('POST', '/api/agent/start')).not.toBeNull();
    });

    it('blocks opening a terminal', () => {
      expect(findReadOnlyRule('POST', '/api/terminal/sessions')).not.toBeNull();
    });

    it('blocks a request that carries a query string', () => {
      expect(findReadOnlyRule('POST', '/api/deploy/run?featureId=abc')).not.toBeNull();
    });

    it('matches case-insensitively on the method', () => {
      expect(findReadOnlyRule('post', '/api/auto-mode/run-feature')).not.toBeNull();
    });

    // Read-only means "cannot start things", not "cannot touch anything" — the
    // whole point of the dev half is that you can still browse and edit.
    it('allows reading the feature list', () => {
      expect(findReadOnlyRule('POST', '/api/features/list')).toBeNull();
    });

    it('allows deleting a feature', () => {
      expect(findReadOnlyRule('POST', '/api/features/delete')).toBeNull();
    });

    it('allows changing settings', () => {
      expect(findReadOnlyRule('POST', '/api/settings/global')).toBeNull();
    });

    it('allows stopping something that is already running', () => {
      expect(findReadOnlyRule('POST', '/api/auto-mode/stop-feature')).toBeNull();
      expect(findReadOnlyRule('POST', '/api/agent/stop')).toBeNull();
    });

    it('allows every status read', () => {
      expect(findReadOnlyRule('POST', '/api/auto-mode/status')).toBeNull();
      expect(findReadOnlyRule('GET', '/api/self-update/status')).toBeNull();
    });

    it('blocks the whole self-update prefix on POST', () => {
      expect(findReadOnlyRule('POST', '/api/self-update/start')).not.toBeNull();
      expect(findReadOnlyRule('POST', '/api/self-update')).not.toBeNull();
    });

    it('does not treat a longer path as a prefix match', () => {
      // `/api/deploy/runs` is a history read, not `/api/deploy/run`.
      expect(findReadOnlyRule('POST', '/api/deploy/runs')).toBeNull();
    });

    it('every rule names what it blocks, for the refusal message', () => {
      for (const rule of READ_ONLY_BLOCKED) {
        expect(rule.what.length).toBeGreaterThan(0);
        expect(rule.path.startsWith('/api/')).toBe(true);
        expect(rule.methods.length).toBeGreaterThan(0);
      }
    });
  });

  describe('shouldProxyToRunner', () => {
    it('proxies the execution routers', () => {
      expect(shouldProxyToRunner('/api/auto-mode/run-feature')).toBe(true);
      expect(shouldProxyToRunner('/api/agent/start')).toBe(true);
      expect(shouldProxyToRunner('/api/sessions/list')).toBe(true);
      expect(shouldProxyToRunner('/api/running-agents')).toBe(true);
    });

    it('proxies the running-features read that pairs with them', () => {
      expect(shouldProxyToRunner('/api/features/running')).toBe(true);
    });

    it('leaves the rest of the features router local', () => {
      expect(shouldProxyToRunner('/api/features/list')).toBe(false);
      expect(shouldProxyToRunner('/api/features/get')).toBe(false);
    });

    it('leaves terminals local — a pty belongs to its own process', () => {
      expect(shouldProxyToRunner('/api/terminal/sessions')).toBe(false);
    });

    it('leaves deploy script editing local but proxies deploy runs', () => {
      expect(shouldProxyToRunner('/api/deploy/script')).toBe(false);
      expect(shouldProxyToRunner('/api/deploy/folder-scripts')).toBe(false);
      expect(shouldProxyToRunner('/api/deploy/run')).toBe(true);
    });

    it('leaves settings and git local', () => {
      expect(shouldProxyToRunner('/api/settings/global')).toBe(false);
      expect(shouldProxyToRunner('/api/git/status')).toBe(false);
      expect(shouldProxyToRunner('/api/worktree/list')).toBe(false);
    });

    it('ignores the query string when deciding', () => {
      expect(shouldProxyToRunner('/api/auto-mode/status?projectPath=x')).toBe(true);
    });

    it('does not match a router whose name merely starts the same', () => {
      expect(shouldProxyToRunner('/api/agents')).toBe(false);
    });
  });
});
