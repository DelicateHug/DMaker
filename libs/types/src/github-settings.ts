/**
 * GitHub settings resolution
 *
 * A project's GitHub configuration is layered. Anything the project sets wins;
 * anything it leaves blank falls back to the global setting, then to what git
 * and `gh` report about the checkout, then to a built-in default.
 *
 * Both the server and the UI resolve through here so the value shown in the
 * settings pane is the value operations actually use.
 */

import type { GlobalSettings, ProjectSettings } from './settings.js';

/** Built-in defaults, used when neither the project, the globals, nor git say. */
export const GITHUB_SETTINGS_DEFAULTS = {
  remoteName: 'origin',
  baseBranch: 'main',
  draftPRs: false,
} as const;

/** Where an effective value came from — the UI labels fields with this. */
export type GitHubSettingSource = 'project' | 'global' | 'detected' | 'default';

/** What git/`gh` reports about the project's checkout. */
export interface DetectedGitHubRemote {
  /** Repo owner, e.g. 'DelicateHug' */
  owner?: string | null;
  /** Repo name, e.g. 'DMaker' */
  repo?: string | null;
  /** Remote the repo was read from, e.g. 'origin' */
  remoteName?: string | null;
  /** The remote's trunk, e.g. what origin/HEAD points at */
  defaultBranch?: string | null;
}

/** The values GitHub operations should use for a project. */
export interface EffectiveGitHubSettings {
  /** 'owner/repo', or null when nothing identifies a repo */
  repo: string | null;
  owner: string | null;
  remoteName: string;
  baseBranch: string;
  draftPRs: boolean;
}

/** Which layer supplied each effective value. */
export interface GitHubSettingSources {
  repo: GitHubSettingSource;
  remoteName: GitHubSettingSource;
  baseBranch: GitHubSettingSource;
  draftPRs: GitHubSettingSource;
}

export interface ResolvedGitHubSettings {
  effective: EffectiveGitHubSettings;
  sources: GitHubSettingSources;
}

function trimmed(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return clean.length > 0 ? clean : undefined;
}

/**
 * Qualify a repo the user typed as a bare name using the default owner, so
 * 'DMaker' plus owner 'DelicateHug' resolves to 'DelicateHug/DMaker'.
 * A value that already carries an owner is returned untouched.
 */
export function qualifyRepo(repo: string | undefined, owner: string | undefined): string | null {
  const cleanRepo = trimmed(repo);
  if (!cleanRepo) return null;
  if (cleanRepo.includes('/')) return cleanRepo;
  const cleanOwner = trimmed(owner);
  return cleanOwner ? `${cleanOwner}/${cleanRepo}` : cleanRepo;
}

/** Owner half of an 'owner/repo' string, or null when it has none. */
export function ownerOf(repo: string | null): string | null {
  if (!repo) return null;
  const [owner, name] = repo.split('/');
  return owner && name ? owner : null;
}

/**
 * Collapse project overrides, global defaults and git detection into the
 * values GitHub operations should use, plus where each one came from.
 */
export function resolveGitHubSettings(
  global: Partial<GlobalSettings> | null | undefined,
  project: Partial<ProjectSettings> | null | undefined,
  detected?: DetectedGitHubRemote | null
): ResolvedGitHubSettings {
  const defaultOwner = trimmed(global?.githubDefaultOwner);

  // Repo: the project override wins even over a real remote, because that is
  // the point of the override (a fork pointing issues at upstream, say).
  const projectRepo = qualifyRepo(trimmed(project?.githubRepo), defaultOwner);
  const detectedRepo =
    detected?.owner && detected?.repo ? `${detected.owner}/${detected.repo}` : null;

  let repo: string | null;
  let repoSource: GitHubSettingSource;
  if (projectRepo) {
    repo = projectRepo;
    repoSource = 'project';
  } else if (detectedRepo) {
    repo = detectedRepo;
    repoSource = 'detected';
  } else {
    repo = null;
    repoSource = 'default';
  }

  const projectRemote = trimmed(project?.githubRemoteName);
  const globalRemote = trimmed(global?.githubRemoteName);
  const detectedRemote = trimmed(detected?.remoteName);
  const remoteName =
    projectRemote ?? globalRemote ?? detectedRemote ?? GITHUB_SETTINGS_DEFAULTS.remoteName;
  const remoteSource: GitHubSettingSource = projectRemote
    ? 'project'
    : globalRemote
      ? 'global'
      : detectedRemote
        ? 'detected'
        : 'default';

  const projectBase = trimmed(project?.githubBaseBranch) ?? trimmed(project?.defaultBranch);
  const globalBase = trimmed(global?.githubBaseBranch);
  const detectedBase = trimmed(detected?.defaultBranch);
  const baseBranch =
    projectBase ?? globalBase ?? detectedBase ?? GITHUB_SETTINGS_DEFAULTS.baseBranch;
  const baseSource: GitHubSettingSource = projectBase
    ? 'project'
    : globalBase
      ? 'global'
      : detectedBase
        ? 'detected'
        : 'default';

  const draftPRs =
    project?.githubDraftPRs ?? global?.githubDraftPRs ?? GITHUB_SETTINGS_DEFAULTS.draftPRs;
  const draftSource: GitHubSettingSource =
    project?.githubDraftPRs !== undefined
      ? 'project'
      : global?.githubDraftPRs !== undefined
        ? 'global'
        : 'default';

  return {
    effective: {
      repo,
      owner: ownerOf(repo) ?? defaultOwner ?? null,
      remoteName,
      baseBranch,
      draftPRs,
    },
    sources: {
      repo: repoSource,
      remoteName: remoteSource,
      baseBranch: baseSource,
      draftPRs: draftSource,
    },
  };
}
