/**
 * Project GitHub settings.
 *
 * Every field is an override. Left blank, a field inherits — from the global
 * GitHub defaults first, then from what git and `gh` report about the checkout,
 * then from the built-in default. The value actually in force is shown under
 * each field with where it came from, so nothing has to be guessed at.
 */

import { useCallback, useEffect, useState } from 'react';
import { Github, Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import { GITHUB_SETTINGS_DEFAULTS } from '@dmaker/types';
import type {
  DetectedGitHubRemote,
  EffectiveGitHubSettings,
  GitHubSettingSource,
  GitHubSettingSources,
} from '@dmaker/types';
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/forms';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import type { Project } from '@/lib/electron';

interface ProjectGitHubSectionProps {
  project: Project;
}

/** The project's own overrides, as edited in this pane. '' means "inherit". */
interface Overrides {
  githubRepo: string;
  githubRemoteName: string;
  githubBaseBranch: string;
  /** 'inherit' keeps the global value; the others pin it for this project. */
  githubDraftPRs: 'inherit' | 'on' | 'off';
}

const EMPTY_OVERRIDES: Overrides = {
  githubRepo: '',
  githubRemoteName: '',
  githubBaseBranch: '',
  githubDraftPRs: 'inherit',
};

/**
 * People paste what GitHub gives them - a browser URL, a clone URL, an SSH
 * remote. Every one of those means the same repo, so reduce them all to the
 * `owner/repo` the API layer expects. A bare name is left alone: the resolver
 * completes it with the default owner.
 */
export function normalizeRepoInput(raw: string): string {
  const value = raw.trim();
  if (!value) return '';

  const withoutScheme = value
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^git@/i, '')
    .replace(/^github\.com[:/]/i, '');

  const parts = withoutScheme.split('/').filter(Boolean);
  if (parts.length >= 2) {
    const repo = parts[1].replace(/\.git$/i, '');
    return `${parts[0]}/${repo}`;
  }

  return withoutScheme.replace(/\.git$/i, '');
}

const SOURCE_LABELS: Record<GitHubSettingSource, string> = {
  project: 'Set for this project',
  global: 'From global settings',
  detected: 'Detected from git',
  default: 'Built-in default',
};

/** The line under each field: what is in force, and which layer set it. */
function EffectiveHint({
  value,
  source,
}: {
  value: string | null;
  source: GitHubSettingSource | undefined;
}) {
  if (!source) return null;
  return (
    <p className="text-xs text-muted-foreground/80 leading-relaxed">
      In use: <span className="font-mono text-foreground/90">{value ?? 'none'}</span>
      <span className="text-muted-foreground/60"> · {SOURCE_LABELS[source]}</span>
    </p>
  );
}

export function ProjectGitHubSection({ project }: ProjectGitHubSectionProps) {
  const [overrides, setOverrides] = useState<Overrides>(EMPTY_OVERRIDES);
  const [saved, setSaved] = useState<Overrides>(EMPTY_OVERRIDES);
  const [detected, setDetected] = useState<DetectedGitHubRemote | null>(null);
  const [effective, setEffective] = useState<EffectiveGitHubSettings | null>(null);
  const [sources, setSources] = useState<GitHubSettingSources | null>(null);
  const [globalDefaults, setGlobalDefaults] = useState<{
    githubDefaultOwner: string | null;
    githubRemoteName: string | null;
    githubBaseBranch: string | null;
    githubDraftPRs: boolean | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  /** Why the resolve failed. Set means "we do not know", which is not the same
   *  as "there is no remote" - the panel below has to say which. */
  const [loadError, setLoadError] = useState<string | null>(null);

  const projectPath = project.path;

  /**
   * One call answers the whole pane: git detection, the project's overrides,
   * the global defaults and the resolved result, all from the same resolver
   * the server uses for real GitHub operations.
   */
  const load = useCallback(
    async (options: { refresh?: boolean } = {}) => {
      if (options.refresh) setIsRefreshing(true);
      try {
        const result = await getHttpApiClient().github.getConfig(projectPath);
        if (!result.success) {
          setLoadError(result.error ?? 'The server could not resolve this project.');
          toast.error('Failed to read GitHub settings', { description: result.error });
          return;
        }

        setLoadError(null);
        setDetected(result.detected ?? null);
        setEffective(result.effective ?? null);
        setSources(result.sources ?? null);
        setGlobalDefaults(result.global ?? null);

        const loaded: Overrides = {
          githubRepo: result.project?.githubRepo ?? '',
          githubRemoteName: result.project?.githubRemoteName ?? '',
          githubBaseBranch: result.project?.githubBaseBranch ?? '',
          githubDraftPRs:
            result.project?.githubDraftPRs === true
              ? 'on'
              : result.project?.githubDraftPRs === false
                ? 'off'
                : 'inherit',
        };
        setOverrides(loaded);
        setSaved(loaded);
      } catch (error) {
        console.error('Failed to load GitHub settings:', error);
        setLoadError(error instanceof Error ? error.message : 'Could not reach the server.');
        toast.error('Failed to read GitHub settings');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [projectPath]
  );

  useEffect(() => {
    setIsLoading(true);
    load();
  }, [load]);

  const persist = useCallback(
    async (updates: Record<string, unknown>) => {
      try {
        const api = getElectronAPI();
        if (!api.settings?.updateProject) throw new Error('Settings API not available');
        await api.settings.updateProject(projectPath, updates);
        // Re-resolve rather than guessing: clearing an override changes what is
        // inherited, and only the server knows what that resolves to.
        await load();
      } catch (error) {
        console.error('Failed to save GitHub settings:', error);
        toast.error('Failed to save GitHub settings');
      }
    },
    [load, projectPath]
  );

  // Text fields save on blur - a write per keystroke would thrash settings.json.
  const commitText = (key: 'githubRepo' | 'githubRemoteName' | 'githubBaseBranch') => () => {
    const value = key === 'githubRepo' ? normalizeRepoInput(overrides[key]) : overrides[key].trim();
    setOverrides((prev) => ({ ...prev, [key]: value }));
    if (value === saved[key]) return;
    // null clears the override, putting the field back to inheriting.
    persist({ [key]: value === '' ? null : value });
  };

  const repoUrl = effective?.repo ? `https://github.com/${effective.repo}` : null;
  const inheritedDraftLabel = globalDefaults?.githubDraftPRs
    ? 'on'
    : globalDefaults?.githubDraftPRs === false
      ? 'off'
      : GITHUB_SETTINGS_DEFAULTS.draftPRs
        ? 'on'
        : 'off';

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
      data-testid="project-github-section"
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
              <Github className="w-5 h-5 text-brand-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">GitHub</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load({ refresh: true })}
            disabled={isRefreshing}
            className="gap-1.5"
            data-testid="project-github-refresh"
          >
            {isRefreshing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Re-detect
          </Button>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Overrides for this project. Leave a field blank to inherit it from your global GitHub
          settings, or from the project&apos;s git remote.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="p-6 space-y-5">
          {/* What git actually says about this checkout */}
          <div
            className="rounded-xl bg-accent/20 p-4 space-y-2"
            data-testid="project-github-detected"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Detected remote
            </div>
            {detected?.owner && detected?.repo ? (
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-foreground">
                    {detected.owner}/{detected.repo}
                  </span>
                  <a
                    href={`https://github.com/${detected.owner}/${detected.repo}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    title="Open on GitHub"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <div className="text-xs text-muted-foreground/80">
                  remote <span className="font-mono">{detected.remoteName ?? 'unknown'}</span>
                  {detected.defaultBranch ? (
                    <>
                      {' · trunk '}
                      <span className="font-mono">{detected.defaultBranch}</span>
                    </>
                  ) : null}
                </div>
              </div>
            ) : loadError ? (
              <p className="text-sm text-destructive/90" data-testid="project-github-detect-error">
                Could not read this project&apos;s remote: {loadError} Detection is unavailable
                until that is fixed - a repository set below is still used.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No GitHub remote found for this project. Set a repository below to use GitHub
                features anyway.
              </p>
            )}
          </div>

          <div className="border-t border-border/30" />

          <div className="space-y-2">
            <Label htmlFor="project-github-repo" className="text-foreground font-medium">
              Repository
            </Label>
            <Input
              id="project-github-repo"
              value={overrides.githubRepo}
              onChange={(e) => setOverrides((prev) => ({ ...prev, githubRepo: e.target.value }))}
              onBlur={commitText('githubRepo')}
              placeholder={
                detected?.owner && detected?.repo
                  ? `${detected.owner}/${detected.repo}`
                  : 'owner/repo'
              }
              data-testid="project-github-repo-input"
            />
            <EffectiveHint value={effective?.repo ?? null} source={sources?.repo} />
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Where issues and pull requests are read from. Blank uses the detected remote. A bare
              name is completed with the global default owner
              {globalDefaults?.githubDefaultOwner ? (
                <>
                  {' ('}
                  <span className="font-mono">{globalDefaults.githubDefaultOwner}</span>
                  {')'}
                </>
              ) : null}
              .
            </p>
            {repoUrl && (
              <a
                href={repoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-brand-500 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                {repoUrl}
              </a>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-github-remote" className="text-foreground font-medium">
              Remote name
            </Label>
            <Input
              id="project-github-remote"
              value={overrides.githubRemoteName}
              onChange={(e) =>
                setOverrides((prev) => ({ ...prev, githubRemoteName: e.target.value }))
              }
              onBlur={commitText('githubRemoteName')}
              placeholder={
                globalDefaults?.githubRemoteName ??
                detected?.remoteName ??
                GITHUB_SETTINGS_DEFAULTS.remoteName
              }
              data-testid="project-github-remote-input"
            />
            <EffectiveHint value={effective?.remoteName ?? null} source={sources?.remoteName} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-github-base-branch" className="text-foreground font-medium">
              Base branch for pull requests
            </Label>
            <Input
              id="project-github-base-branch"
              value={overrides.githubBaseBranch}
              onChange={(e) =>
                setOverrides((prev) => ({ ...prev, githubBaseBranch: e.target.value }))
              }
              onBlur={commitText('githubBaseBranch')}
              placeholder={
                globalDefaults?.githubBaseBranch ??
                detected?.defaultBranch ??
                GITHUB_SETTINGS_DEFAULTS.baseBranch
              }
              data-testid="project-github-base-branch-input"
            />
            <EffectiveHint value={effective?.baseBranch ?? null} source={sources?.baseBranch} />
          </div>

          <div className="border-t border-border/30" />

          <div className="space-y-2">
            <Label htmlFor="project-github-draft-prs" className="text-foreground font-medium">
              Open pull requests as drafts
            </Label>
            <Select
              value={overrides.githubDraftPRs}
              onValueChange={(value: string) => {
                const next = value as Overrides['githubDraftPRs'];
                setOverrides((prev) => ({ ...prev, githubDraftPRs: next }));
                persist({ githubDraftPRs: next === 'inherit' ? null : next === 'on' });
              }}
            >
              <SelectTrigger id="project-github-draft-prs" data-testid="project-github-draft-prs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">Inherit ({inheritedDraftLabel})</SelectItem>
                <SelectItem value="on">Always draft</SelectItem>
                <SelectItem value="off">Never draft</SelectItem>
              </SelectContent>
            </Select>
            <EffectiveHint
              value={effective ? (effective.draftPRs ? 'on' : 'off') : null}
              source={sources?.draftPRs}
            />
          </div>
        </div>
      )}
    </div>
  );
}
