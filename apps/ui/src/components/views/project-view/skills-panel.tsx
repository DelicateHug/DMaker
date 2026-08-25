import { useCallback, useEffect, useState } from 'react';
import { Globe, Loader2, Plus, RefreshCw, Save, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { apiPost } from '@/lib/api-fetch';
import { Button } from '@/components/ui/button';
import { createLogger } from '@dmaker/utils/logger';

const logger = createLogger('SkillsPanel');

/** Matches the server's SkillSummary. */
interface Skill {
  name: string;
  description: string;
  body: string;
  source: 'user' | 'project';
  filePath: string;
  isDmaker: boolean;
}

const STARTER_BODY = `# What this skill does

Describe the workflow Claude should follow when this skill is invoked.

## Steps

1. …
`;

interface SkillsPanelProps {
  projectPath: string | null;
  className?: string;
}

/**
 * Skill authoring for the project view.
 *
 * Claude only discovers skills one level under a skills root, so DMaker-created
 * skills are namespaced by name (`dmaker-<name>`) rather than by folder — the
 * server applies the prefix on save.
 */
export function SkillsPanel({ projectPath, className }: SkillsPanelProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [selected, setSelected] = useState<Skill | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [scope, setScope] = useState<'user' | 'project'>('project');
  const [isCreating, setIsCreating] = useState(false);

  const fetchSkills = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiPost<{ success: boolean; skills?: Skill[]; error?: string }>(
        '/api/skills/list',
        { projectPath: projectPath ?? undefined, sources: ['user', 'project'] }
      );
      setSkills(data.success && data.skills ? data.skills : []);
    } catch (error) {
      logger.error('Failed to list skills:', error);
      setSkills([]);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    void fetchSkills();
  }, [fetchSkills]);

  const startCreate = useCallback(() => {
    setSelected(null);
    setIsCreating(true);
    setName('');
    setDescription('');
    setBody(STARTER_BODY);
    setScope(projectPath ? 'project' : 'user');
  }, [projectPath]);

  const openSkill = useCallback((skill: Skill) => {
    setIsCreating(false);
    setSelected(skill);
    setName(skill.name);
    setDescription(skill.description);
    setBody(skill.body);
    setScope(skill.source);
  }, []);

  const closeEditor = useCallback(() => {
    setIsCreating(false);
    setSelected(null);
  }, []);

  const saveSkill = useCallback(async () => {
    if (!name.trim()) {
      toast.error('Enter a skill name');
      return;
    }
    if (!description.trim()) {
      toast.error('Enter a description — Claude uses it to decide when to load the skill');
      return;
    }
    if (scope === 'project' && !projectPath) {
      toast.error('No project selected for a project-scoped skill');
      return;
    }

    setIsSaving(true);
    try {
      const data = await apiPost<{ success: boolean; name?: string; error?: string }>(
        '/api/skills/save',
        {
          name: name.trim(),
          description: description.trim(),
          body,
          scope,
          projectPath: scope === 'project' ? projectPath : undefined,
          originalFilePath: selected?.filePath,
        }
      );
      if (!data.success) {
        toast.error('Failed to save skill', { description: data.error });
        return;
      }
      toast.success(`Saved skill ${data.name}`);
      setIsCreating(false);
      await fetchSkills();
    } catch (error) {
      logger.error('Failed to save skill:', error);
      toast.error('Failed to save skill');
    } finally {
      setIsSaving(false);
    }
  }, [name, description, body, scope, projectPath, selected, fetchSkills]);

  const deleteSkill = useCallback(
    async (skill: Skill) => {
      try {
        const data = await apiPost<{ success: boolean; error?: string }>('/api/skills/delete', {
          filePath: skill.filePath,
        });
        if (!data.success) {
          toast.error('Failed to delete skill', { description: data.error });
          return;
        }
        toast.success(`Deleted ${skill.name}`);
        if (selected?.filePath === skill.filePath) closeEditor();
        await fetchSkills();
      } catch (error) {
        logger.error('Failed to delete skill:', error);
        toast.error('Failed to delete skill');
      }
    },
    [selected, closeEditor, fetchSkills]
  );

  const isEditing = isCreating || !!selected;

  return (
    <div
      className={cn('flex h-full min-h-0 flex-col', className)}
      data-testid="project-skills-panel"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/60 px-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-brand-500" />
          <span className="text-xs font-medium">Skills</span>
          <span className="text-[10px] text-muted-foreground">{skills.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={() => void fetchSkills()}
            title="Refresh"
          >
            <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={isEditing ? closeEditor : startCreate}
            title={isEditing ? 'Close editor' : 'New skill'}
            data-testid="new-skill"
          >
            {isEditing ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          </Button>
        </div>
      </div>

      {isEditing ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="skill-name"
                disabled={!!selected}
                className={cn(
                  'min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs',
                  'focus:border-brand-500/50 focus:outline-none disabled:opacity-60'
                )}
                data-testid="skill-name"
              />
              <div className="flex shrink-0 items-center gap-1">
                {(['project', 'user'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setScope(option)}
                    disabled={!!selected || (option === 'project' && !projectPath)}
                    className={cn(
                      'rounded px-2 py-1 text-[10px] cursor-pointer transition-colors duration-100',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      scope === option
                        ? 'bg-brand-500/15 text-brand-500'
                        : 'text-muted-foreground hover:bg-accent/50'
                    )}
                  >
                    {option === 'project' ? 'Project' : 'Global'}
                  </button>
                ))}
              </div>
            </div>

            {!selected && (
              <p className="text-[11px] text-muted-foreground">
                Saved as{' '}
                <span className="font-mono">
                  {scope === 'project' ? '.claude' : '~/.claude'}/skills/dmaker-
                  {name.trim() || 'name'}/SKILL.md
                </span>
              </p>
            )}

            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="When should Claude use this skill?"
              className={cn(
                'w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs',
                'focus:border-brand-500/50 focus:outline-none'
              )}
              data-testid="skill-description"
            />

            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              spellCheck={false}
              rows={16}
              className={cn(
                'w-full resize-y rounded-md border border-border/60 bg-background p-2',
                'font-mono text-xs leading-relaxed focus:border-brand-500/50 focus:outline-none'
              )}
              data-testid="skill-body"
            />

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={closeEditor}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={isSaving}
                onClick={() => void saveSkill()}
                data-testid="save-skill"
              >
                {isSaving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Save skill
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {skills.length === 0 && !isLoading && (
            <p className="px-2 py-3 text-[11px] leading-relaxed text-muted-foreground/70">
              No skills found. Create one — DMaker names it{' '}
              <span className="font-mono">dmaker-…</span> so it is clear where it came from.
            </p>
          )}

          {skills.map((skill) => (
            <div
              key={skill.filePath}
              className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
            >
              <button
                type="button"
                onClick={() => openSkill(skill)}
                className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left cursor-pointer"
                title={skill.filePath}
              >
                <span className="flex min-w-0 max-w-full items-center gap-1.5">
                  <span className="truncate text-[12px] font-medium">{skill.name}</span>
                  {skill.isDmaker && (
                    <span className="shrink-0 rounded bg-brand-500/15 px-1 text-[9px] text-brand-500">
                      DMaker
                    </span>
                  )}
                  {skill.source === 'user' && (
                    <Globe className="size-3 shrink-0 text-muted-foreground" />
                  )}
                </span>
                {skill.description && (
                  <span className="line-clamp-2 text-[11px] text-muted-foreground">
                    {skill.description}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => void deleteSkill(skill)}
                className="mt-0.5 shrink-0 opacity-0 transition-opacity duration-100 group-hover:opacity-100 cursor-pointer"
                title="Delete skill"
              >
                <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
