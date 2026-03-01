/**
 * Agent Editor Dialog - Create/Edit agent with view/edit mode toggle
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/overlays';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/forms';
import { Markdown } from '@/components/ui/markdown';
import { cn } from '@/lib/utils';
import { Pencil, Eye, Save, Loader2 } from 'lucide-react';
import type { AgentWithScope } from './hooks/use-agents';
import type { Project } from '@/lib/electron';

interface AgentEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: AgentWithScope | null;
  /** Pre-filled data for new agent (e.g. from AI generation) */
  prefill?: {
    name?: string;
    description?: string;
    prompt?: string;
    tools?: string[];
    model?: string;
  };
  onSave: (data: {
    name: string;
    description: string;
    prompt: string;
    tools?: string[];
    model?: string;
    scope: 'user' | 'project';
    projectPath?: string;
    originalFilePath?: string;
  }) => Promise<boolean>;
  /** All available projects for scope selection */
  projects: Project[];
}

export function AgentEditorDialog({
  open,
  onOpenChange,
  agent,
  prefill,
  onSave,
  projects,
}: AgentEditorDialogProps) {
  const isEditing = !!agent;
  const [mode, setMode] = useState<'view' | 'edit'>(isEditing ? 'view' : 'edit');
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [toolsStr, setToolsStr] = useState('');
  const [allTools, setAllTools] = useState(true);
  const [model, setModel] = useState('sonnet');
  // Scope: 'user' for ~/.claude/agents/, or a project path for <project>/.claude/agents/
  const [scopeValue, setScopeValue] = useState<string>('user');

  // Initialize form when dialog opens
  useEffect(() => {
    if (open) {
      if (agent) {
        setName(agent.name);
        setDescription(agent.definition.description);
        setPrompt(agent.definition.prompt);
        const hasTools = agent.definition.tools && agent.definition.tools.length > 0;
        setToolsStr(hasTools ? agent.definition.tools!.join(', ') : '');
        setAllTools(!hasTools);
        setModel(agent.definition.model || 'inherit');
        // Determine scope from agent source and file path
        if (agent.source === 'user') {
          setScopeValue('user');
        } else {
          // Try to match to a project
          const matchingProject = projects.find((p) => agent.filePath.startsWith(p.path));
          setScopeValue(
            matchingProject
              ? `project:${matchingProject.path}`
              : projects[0]
                ? `project:${projects[0].path}`
                : 'user'
          );
        }
        setMode('view');
      } else if (prefill) {
        setName(prefill.name || '');
        setDescription(prefill.description || '');
        setPrompt(prefill.prompt || '');
        const hasTools = prefill.tools && prefill.tools.length > 0;
        setToolsStr(hasTools ? prefill.tools!.join(', ') : '');
        setAllTools(!hasTools);
        setModel(prefill.model || 'sonnet');
        setScopeValue('user');
        setMode('edit');
      } else {
        setName('');
        setDescription('');
        setPrompt('');
        setToolsStr('');
        setAllTools(true);
        setModel('sonnet');
        setScopeValue('user');
        setMode('edit');
      }
    }
  }, [open, agent, prefill, projects]);

  const handleSave = async () => {
    if (!name.trim() || !description.trim() || !prompt.trim()) return;

    setIsSaving(true);
    const tools = allTools
      ? undefined
      : toolsStr
          .split(/[,\s]+/)
          .map((t) => t.trim())
          .filter(Boolean);

    const isProject = scopeValue.startsWith('project:');
    const projectPath = isProject ? scopeValue.slice('project:'.length) : undefined;

    const success = await onSave({
      name: name.trim(),
      description: description.trim(),
      prompt: prompt.trim(),
      tools,
      scope: isProject ? 'project' : 'user',
      projectPath,
      originalFilePath: agent?.filePath,
    });

    setIsSaving(false);
    if (success) {
      onOpenChange(false);
    }
  };

  /** Get display name for a project path */
  const getProjectDisplayName = (path: string) => {
    return path.split(/[\\/]/).pop() || path;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{isEditing ? `Agent: ${agent.name}` : 'New Agent'}</DialogTitle>
            {isEditing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}
                className="gap-1.5"
              >
                {mode === 'view' ? (
                  <>
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" /> View
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {mode === 'view' ? (
            // View Mode
            <div className="space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Name
                </Label>
                <p className="text-sm font-medium mt-1">{name}</p>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Description
                </Label>
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
              </div>
              <div className="flex gap-4">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Tools
                  </Label>
                  <p className="text-sm mt-1">{allTools ? 'All (unrestricted)' : toolsStr}</p>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Scope
                  </Label>
                  <p className="text-sm mt-1">
                    {scopeValue === 'user'
                      ? 'User'
                      : getProjectDisplayName(scopeValue.slice('project:'.length))}
                  </p>
                </div>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  System Prompt
                </Label>
                <div className="mt-2 rounded-lg border border-border/30 bg-muted/30 p-4 overflow-auto max-h-80">
                  <Markdown className="text-sm prose-sm">{prompt}</Markdown>
                </div>
              </div>
            </div>
          ) : (
            // Edit Mode
            <div className="space-y-4">
              {/* Name */}
              <div>
                <Label htmlFor="agent-name">Name</Label>
                <input
                  id="agent-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-agent-name"
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="agent-description">Description</Label>
                <textarea
                  id="agent-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="When to use this agent..."
                  rows={2}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>

              {/* Scope */}
              <div>
                <Label htmlFor="agent-scope">Scope</Label>
                <select
                  id="agent-scope"
                  value={scopeValue}
                  onChange={(e) => setScopeValue(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="user">User (~/.claude/agents/)</option>
                  {projects.map((project) => (
                    <option key={project.id} value={`project:${project.path}`}>
                      {project.name} (.claude/agents/)
                    </option>
                  ))}
                </select>
              </div>

              {/* Tools */}
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <Label>Tools</Label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allTools}
                      onChange={(e) => setAllTools(e.target.checked)}
                      className="rounded"
                    />
                    All (unrestricted)
                  </label>
                </div>
                {!allTools && (
                  <input
                    type="text"
                    value={toolsStr}
                    onChange={(e) => setToolsStr(e.target.value)}
                    placeholder="Bash, Read, Write, Edit, Glob, Grep"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                )}
              </div>

              {/* System Prompt */}
              <div>
                <Label htmlFor="agent-prompt">System Prompt</Label>
                <textarea
                  id="agent-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="You are a specialized agent that..."
                  rows={12}
                  className="mt-1 w-full px-3 py-2 text-sm font-mono rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                />
              </div>
            </div>
          )}
        </div>

        {mode === 'edit' && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !name.trim() || !description.trim() || !prompt.trim()}
              className="gap-1.5"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
