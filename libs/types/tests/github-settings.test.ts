import { describe, it, expect } from 'vitest';
import {
  GITHUB_SETTINGS_DEFAULTS,
  qualifyRepo,
  ownerOf,
  resolveGitHubSettings,
} from '../src/github-settings.js';

describe('qualifyRepo', () => {
  it('leaves an already-qualified repo alone', () => {
    expect(qualifyRepo('acme/widgets', 'someone-else')).toBe('acme/widgets');
  });

  it('completes a bare name with the default owner', () => {
    expect(qualifyRepo('widgets', 'acme')).toBe('acme/widgets');
  });

  it('leaves a bare name bare when there is no default owner', () => {
    expect(qualifyRepo('widgets', undefined)).toBe('widgets');
  });

  it('treats blank and whitespace as unset', () => {
    expect(qualifyRepo('   ', 'acme')).toBeNull();
    expect(qualifyRepo(undefined, 'acme')).toBeNull();
  });
});

describe('ownerOf', () => {
  it('returns the owner half', () => {
    expect(ownerOf('acme/widgets')).toBe('acme');
  });

  it('returns null for an unqualified or missing repo', () => {
    expect(ownerOf('widgets')).toBeNull();
    expect(ownerOf(null)).toBeNull();
  });
});

describe('resolveGitHubSettings', () => {
  it('falls back to built-in defaults when nothing is configured', () => {
    const { effective, sources } = resolveGitHubSettings(null, null, null);

    expect(effective).toEqual({
      repo: null,
      owner: null,
      remoteName: GITHUB_SETTINGS_DEFAULTS.remoteName,
      baseBranch: GITHUB_SETTINGS_DEFAULTS.baseBranch,
      draftPRs: GITHUB_SETTINGS_DEFAULTS.draftPRs,
    });
    expect(sources).toEqual({
      repo: 'default',
      remoteName: 'default',
      baseBranch: 'default',
      draftPRs: 'default',
    });
  });

  it('uses git detection when neither layer overrides', () => {
    const { effective, sources } = resolveGitHubSettings(null, null, {
      owner: 'acme',
      repo: 'widgets',
      remoteName: 'upstream',
      defaultBranch: 'trunk',
    });

    expect(effective.repo).toBe('acme/widgets');
    expect(effective.owner).toBe('acme');
    expect(effective.remoteName).toBe('upstream');
    expect(effective.baseBranch).toBe('trunk');
    expect(sources).toEqual({
      repo: 'detected',
      remoteName: 'detected',
      baseBranch: 'detected',
      draftPRs: 'default',
    });
  });

  it('prefers global settings over detection for remote and base branch', () => {
    const { effective, sources } = resolveGitHubSettings(
      { githubRemoteName: 'fork', githubBaseBranch: 'develop', githubDraftPRs: true },
      null,
      { owner: 'acme', repo: 'widgets', remoteName: 'origin', defaultBranch: 'main' }
    );

    expect(effective.remoteName).toBe('fork');
    expect(effective.baseBranch).toBe('develop');
    expect(effective.draftPRs).toBe(true);
    // The repo still comes from git — globals hold no repository.
    expect(sources.repo).toBe('detected');
    expect(sources.remoteName).toBe('global');
    expect(sources.baseBranch).toBe('global');
    expect(sources.draftPRs).toBe('global');
  });

  it('prefers project overrides over everything else', () => {
    const { effective, sources } = resolveGitHubSettings(
      { githubRemoteName: 'fork', githubBaseBranch: 'develop', githubDraftPRs: true },
      {
        githubRepo: 'acme/upstream',
        githubRemoteName: 'origin',
        githubBaseBranch: 'release',
        githubDraftPRs: false,
      },
      { owner: 'someone', repo: 'their-fork', remoteName: 'origin', defaultBranch: 'main' }
    );

    expect(effective).toEqual({
      repo: 'acme/upstream',
      owner: 'acme',
      remoteName: 'origin',
      baseBranch: 'release',
      draftPRs: false,
    });
    expect(sources).toEqual({
      repo: 'project',
      remoteName: 'project',
      baseBranch: 'project',
      draftPRs: 'project',
    });
  });

  it('completes a bare project repo with the global default owner', () => {
    const { effective } = resolveGitHubSettings(
      { githubDefaultOwner: 'acme' },
      { githubRepo: 'widgets' },
      null
    );

    expect(effective.repo).toBe('acme/widgets');
    expect(effective.owner).toBe('acme');
  });

  it('treats a blank project override as unset, not as a value', () => {
    const { effective, sources } = resolveGitHubSettings(
      { githubBaseBranch: 'develop' },
      { githubRepo: '  ', githubBaseBranch: '' },
      { owner: 'acme', repo: 'widgets', remoteName: 'origin', defaultBranch: 'main' }
    );

    expect(effective.repo).toBe('acme/widgets');
    expect(sources.repo).toBe('detected');
    expect(effective.baseBranch).toBe('develop');
    expect(sources.baseBranch).toBe('global');
  });

  it('honours an explicit false for draft PRs rather than inheriting', () => {
    const { effective, sources } = resolveGitHubSettings(
      { githubDraftPRs: true },
      { githubDraftPRs: false },
      null
    );

    expect(effective.draftPRs).toBe(false);
    expect(sources.draftPRs).toBe('project');
  });

  it('falls back to the legacy project defaultBranch for the PR base', () => {
    const { effective, sources } = resolveGitHubSettings(
      null,
      { defaultBranch: 'master' },
      { owner: 'acme', repo: 'widgets', remoteName: 'origin', defaultBranch: 'main' }
    );

    expect(effective.baseBranch).toBe('master');
    expect(sources.baseBranch).toBe('project');
  });
});
