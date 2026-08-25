/**
 * Global GitHub defaults.
 *
 * Nothing here targets a repository — these are the values every project
 * inherits when it has not set its own (see the GitHub pane in Project
 * Settings, which shows what each field falls back to).
 */

import { useCallback, useEffect, useState } from 'react';
import { Github, Loader2 } from 'lucide-react';
import { GITHUB_SETTINGS_DEFAULTS } from '@dmaker/types';
import { Input, Label, Checkbox } from '@/components/ui/forms';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';

interface GlobalGitHubSettings {
  githubDefaultOwner: string;
  githubRemoteName: string;
  githubBaseBranch: string;
  githubDraftPRs: boolean;
  githubAutoCreateIssues: boolean;
}

const EMPTY: GlobalGitHubSettings = {
  githubDefaultOwner: '',
  githubRemoteName: '',
  githubBaseBranch: '',
  githubDraftPRs: false,
  // On unless the user turns it off — an unset setting means "yes".
  githubAutoCreateIssues: true,
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function GitHubSection() {
  const [values, setValues] = useState<GlobalGitHubSettings>(EMPTY);
  const [saved, setSaved] = useState<GlobalGitHubSettings>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const api = getElectronAPI();
        const result = await api.settings?.getGlobal();
        if (cancelled) return;
        if (result?.success && result.settings) {
          const loaded: GlobalGitHubSettings = {
            githubDefaultOwner: asString(result.settings.githubDefaultOwner),
            githubRemoteName: asString(result.settings.githubRemoteName),
            githubBaseBranch: asString(result.settings.githubBaseBranch),
            githubDraftPRs: result.settings.githubDraftPRs === true,
            githubAutoCreateIssues: result.settings.githubAutoCreateIssues !== false,
          };
          setValues(loaded);
          setSaved(loaded);
        }
      } catch (error) {
        if (!cancelled) console.error('Failed to load global GitHub settings:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (updates: Partial<GlobalGitHubSettings>) => {
    try {
      const api = getElectronAPI();
      if (!api.settings) throw new Error('Settings API not available');
      // Empty string means "no global default" — store it as undefined so the
      // resolver falls through to detection rather than to an empty value.
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updates)) {
        payload[key] = typeof value === 'string' && value.trim() === '' ? null : value;
      }
      await api.settings.updateGlobal(payload);
      setSaved((prev) => ({ ...prev, ...updates }));
    } catch (error) {
      console.error('Failed to save GitHub settings:', error);
      toast.error('Failed to save GitHub settings');
    }
  }, []);

  // Text fields save on blur; a keystroke-per-write would spam the settings file.
  const commitText = (key: keyof GlobalGitHubSettings) => () => {
    const value = (values[key] as string).trim();
    setValues((prev) => ({ ...prev, [key]: value }));
    if (value === saved[key]) return;
    persist({ [key]: value } as Partial<GlobalGitHubSettings>);
  };

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
      data-testid="github-section"
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <Github className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">GitHub</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Defaults every project inherits. A project can override any of these in its own GitHub
          settings.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="github-default-owner" className="text-foreground font-medium">
              Default owner / organisation
            </Label>
            <Input
              id="github-default-owner"
              value={values.githubDefaultOwner}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, githubDefaultOwner: e.target.value }))
              }
              onBlur={commitText('githubDefaultOwner')}
              placeholder="e.g. your-org"
              data-testid="github-default-owner-input"
            />
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Used when a project names its repository without an owner, so{' '}
              <code className="font-mono">my-repo</code> resolves to{' '}
              <code className="font-mono">owner/my-repo</code>.
            </p>
          </div>

          <div className="border-t border-border/30" />

          <div className="space-y-2">
            <Label htmlFor="github-remote-name" className="text-foreground font-medium">
              Remote name
            </Label>
            <Input
              id="github-remote-name"
              value={values.githubRemoteName}
              onChange={(e) => setValues((prev) => ({ ...prev, githubRemoteName: e.target.value }))}
              onBlur={commitText('githubRemoteName')}
              placeholder={GITHUB_SETTINGS_DEFAULTS.remoteName}
              data-testid="github-remote-name-input"
            />
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              The git remote GitHub operations push to and read from. Leave blank to use the
              project&apos;s own remote, falling back to{' '}
              <code className="font-mono">{GITHUB_SETTINGS_DEFAULTS.remoteName}</code>.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="github-base-branch" className="text-foreground font-medium">
              Base branch for pull requests
            </Label>
            <Input
              id="github-base-branch"
              value={values.githubBaseBranch}
              onChange={(e) => setValues((prev) => ({ ...prev, githubBaseBranch: e.target.value }))}
              onBlur={commitText('githubBaseBranch')}
              placeholder={GITHUB_SETTINGS_DEFAULTS.baseBranch}
              data-testid="github-base-branch-input"
            />
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Leave blank to use whatever each project&apos;s remote reports as its trunk.
            </p>
          </div>

          <div className="border-t border-border/30" />

          <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
            <Checkbox
              id="github-draft-prs"
              checked={values.githubDraftPRs}
              onCheckedChange={(checked) => {
                const value = checked === true;
                setValues((prev) => ({ ...prev, githubDraftPRs: value }));
                persist({ githubDraftPRs: value });
              }}
              className="mt-1"
              data-testid="github-draft-prs-checkbox"
            />
            <div className="space-y-1.5">
              <Label
                htmlFor="github-draft-prs"
                className="text-foreground cursor-pointer font-medium"
              >
                Open pull requests as drafts
              </Label>
              <p className="text-xs text-muted-foreground/80 leading-relaxed">
                New pull requests start as drafts unless a project says otherwise.
              </p>
            </div>
          </div>

          <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
            <Checkbox
              id="github-auto-create-issues"
              checked={values.githubAutoCreateIssues}
              onCheckedChange={(checked) => {
                const value = checked === true;
                setValues((prev) => ({ ...prev, githubAutoCreateIssues: value }));
                persist({ githubAutoCreateIssues: value });
              }}
              className="mt-1"
              data-testid="github-auto-create-issues-checkbox"
            />
            <div className="space-y-1.5">
              <Label
                htmlFor="github-auto-create-issues"
                className="text-foreground cursor-pointer font-medium"
              >
                File an issue for every new task
              </Label>
              <p className="text-xs text-muted-foreground/80 leading-relaxed">
                Written by Haiku in the background as soon as a task is added. The task still
                starts, plans and branches straight away — only its first commit waits for the
                issue. Projects with no GitHub repository are skipped either way.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
