import { useState, useEffect } from 'react';
import { createLogger } from '@dmaker/utils/logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/forms';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { Github, Loader2, Lock, Globe } from 'lucide-react';

const logger = createLogger('CreateGitHubRepoDialog');

/** GitHub accepts letters, numbers, hyphens, underscores and periods. */
const VALID_REPO_NAME = /^[A-Za-z0-9._-]+$/;

/** Derive a usable default repo name from a project folder path. */
export function suggestRepoName(projectPath: string): string {
  const leaf =
    projectPath
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() || '';
  return leaf.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

export interface CreateGitHubRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Project the repository will be created for. */
  projectPath: string | null;
  /** Why we're asking — shown above the form. */
  reason?: string;
  /** Called once the repo exists and `origin` is wired up. */
  onCreated: (nameWithOwner?: string) => void;
}

export function CreateGitHubRepoDialog({
  open,
  onOpenChange,
  projectPath,
  reason,
  onCreated,
}: CreateGitHubRepoDialogProps) {
  const [repoName, setRepoName] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRepoName(projectPath ? suggestRepoName(projectPath) : '');
      setVisibility('private');
      setError(null);
    }
  }, [open, projectPath]);

  const handleCreate = async () => {
    const name = repoName.trim();
    if (!projectPath || !name) return;

    if (!VALID_REPO_NAME.test(name)) {
      setError('Use only letters, numbers, hyphens, underscores and periods.');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const api = getElectronAPI();
      if (!api?.github?.createRepo) {
        setError('GitHub API not available');
        return;
      }

      const result = await api.github.createRepo(projectPath, name, visibility);

      if (result.success) {
        toast.success(`Created ${result.nameWithOwner || name} on GitHub`);
        onOpenChange(false);
        onCreated(result.nameWithOwner);
      } else {
        setError(result.error || 'Failed to create repository');
      }
    } catch (err) {
      logger.error('Create GitHub repo failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to create repository');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]" data-testid="create-github-repo-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="w-5 h-5" />
            Create GitHub repository
          </DialogTitle>
          <DialogDescription>
            {reason ||
              "This project has no GitHub repository behind it, so issues can't be created for it."}{' '}
            Create one now and DMaker will set it as <span className="font-mono">origin</span> and
            push the current branch.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="repo-name">Repository name</Label>
            <Input
              id="repo-name"
              placeholder="my-project"
              value={repoName}
              onChange={(e) => {
                setRepoName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && repoName.trim() && !isCreating) {
                  handleCreate();
                }
              }}
              disabled={isCreating}
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label>Visibility</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={visibility === 'private' ? 'default' : 'outline'}
                onClick={() => setVisibility('private')}
                disabled={isCreating}
                data-testid="repo-visibility-private"
              >
                <Lock className="w-4 h-4 mr-2" />
                Private
              </Button>
              <Button
                type="button"
                variant={visibility === 'public' ? 'default' : 'outline'}
                onClick={() => setVisibility('public')}
                disabled={isCreating}
                data-testid="repo-visibility-public"
              >
                <Globe className="w-4 h-4 mr-2" />
                Public
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!repoName.trim() || isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create repository'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateGitHubRepoDialog;
