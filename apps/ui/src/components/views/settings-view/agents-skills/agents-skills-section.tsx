/**
 * Agents & Skills Section - Main settings section for managing agents
 *
 * Provides:
 * - Enable/disable toggle
 * - Agent list grouped by scope (Global, per-project) with folder nesting
 * - Create new agent
 * - AI-powered agent generation
 * - AI-powered agent evaluation
 */

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/forms';
import { Switch } from '@/components/ui/forms';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  Bot,
  RefreshCw,
  Loader2,
  Users,
  ExternalLink,
  Globe,
  FolderOpen,
  Folder,
  Sparkles,
  Plus,
  ChevronDown,
  ChevronRight,
  FileText,
  Brain,
} from 'lucide-react';
import { useAgents, type AgentWithScope } from './hooks/use-agents';
import { useAgentsSettings } from './hooks/use-agents-settings';
import { useAppStore } from '@/store/app-store';
import { AgentCard } from './agent-card';
import { AgentEditorDialog } from './agent-editor-dialog';
import { GenerateAgentDialog } from './generate-agent-dialog';
import { EvaluateAgentDialog } from './evaluate-agent-dialog';
import { ContextFilesPanel } from './context-files-panel';
import { MemoryFilesPanel } from './memory-files-panel';
import { useContextFiles } from './hooks/use-context-files';
import { useMemoryFiles } from './hooks/use-memory-files';

function FolderGroup({
  path: folderPath,
  agents,
  defaultAgents,
  onEdit,
  onDelete,
  onEvaluate,
  onToggleDefault,
}: {
  path: string;
  agents: AgentWithScope[];
  defaultAgents: string[];
  onEdit: (agent: AgentWithScope) => void;
  onDelete: (agent: AgentWithScope) => void;
  onEvaluate: (agent: AgentWithScope) => void;
  onToggleDefault: (agent: AgentWithScope) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left',
          'hover:bg-accent/30 transition-colors cursor-pointer'
        )}
      >
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <Folder className="w-3.5 h-3.5 text-violet-500/70 shrink-0" />
        <span className="text-sm font-medium text-foreground/80 truncate">{folderPath}</span>
        <span className="text-xs text-muted-foreground/60 ml-auto shrink-0">{agents.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 ml-5 mt-1">
          {agents.map((agent) => (
            <AgentCard
              key={`${agent.source}-${agent.name}`}
              agent={agent}
              isDefault={defaultAgents.includes(agent.name)}
              onEdit={onEdit}
              onDelete={onDelete}
              onEvaluate={onEvaluate}
              onToggleDefault={onToggleDefault}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface AgentGroup {
  key: string;
  label: string;
  Icon: typeof Globe;
  agents: AgentWithScope[];
  folders: { path: string; agents: AgentWithScope[] }[];
}

function groupByFolder(agentsList: AgentWithScope[]) {
  const folderMap = new Map<string, AgentWithScope[]>();
  for (const agent of agentsList) {
    const f = agent.folder || '';
    if (!folderMap.has(f)) folderMap.set(f, []);
    folderMap.get(f)!.push(agent);
  }

  return Array.from(folderMap.entries())
    .sort(([a], [b]) => {
      if (a === '' && b !== '') return -1;
      if (a !== '' && b === '') return 1;
      return a.localeCompare(b);
    })
    .map(([folderPath, folderAgents]) => ({
      path: folderPath,
      agents: folderAgents.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

type SectionTab = 'agents' | 'context' | 'memory';

export function AgentsSkillsSection() {
  const {
    agents,
    isLoading: isLoadingAgents,
    projectPath,
    refresh,
    saveAgent,
    deleteAgent,
  } = useAgents();
  const allProjects = useAppStore((state) => state.projects);
  const defaultAgents = useAppStore((state) => state.defaultAgents);
  const setDefaultAgents = useAppStore((state) => state.setDefaultAgents);
  const { enabled, updateEnabled, isLoading: isLoadingSettings } = useAgentsSettings();

  const isLoading = isLoadingAgents || isLoadingSettings;

  // Lift data hooks so they stay alive across tab switches
  const contextFilesData = useContextFiles();
  const memoryFilesData = useMemoryFiles();

  // Section tab state
  const [activeTab, setActiveTab] = useState<SectionTab>('agents');

  // Scope filter state: 'all', 'global', or 'project-<name>'
  const [scopeFilter, setScopeFilter] = useState<string>('all');

  // Group agents: Global first, then per-project groups
  const groupedAgents = useMemo(() => {
    const groups: AgentGroup[] = [];

    // Global (user) agents
    const globalAgents = agents.filter((a) => a.scope === 'global');
    if (globalAgents.length > 0) {
      groups.push({
        key: 'global',
        label: 'User Agents',
        Icon: Globe,
        agents: globalAgents,
        folders: groupByFolder(globalAgents),
      });
    }

    // Project agents — group by projectName
    const projectAgents = agents.filter((a) => a.scope === 'project');
    if (projectAgents.length > 0) {
      const byProject = new Map<string, AgentWithScope[]>();
      for (const agent of projectAgents) {
        const pName = agent.projectName || 'Project';
        if (!byProject.has(pName)) byProject.set(pName, []);
        byProject.get(pName)!.push(agent);
      }

      // Sort projects alphabetically
      const sortedProjects = Array.from(byProject.entries()).sort(([a], [b]) => a.localeCompare(b));

      for (const [projectName, pAgents] of sortedProjects) {
        groups.push({
          key: `project-${projectName}`,
          label: projectName,
          Icon: FolderOpen,
          agents: pAgents,
          folders: groupByFolder(pAgents),
        });
      }
    }

    return groups;
  }, [agents]);

  // Filter options derived from groups
  const filterOptions = useMemo(() => {
    const opts: { key: string; label: string; Icon: typeof Globe; count: number }[] = [
      { key: 'all', label: 'All', Icon: Bot, count: agents.length },
    ];
    for (const group of groupedAgents) {
      opts.push({
        key: group.key,
        label: group.label,
        Icon: group.Icon,
        count: group.agents.length,
      });
    }
    return opts;
  }, [groupedAgents, agents.length]);

  // Apply filter
  const filteredGroups = useMemo(() => {
    if (scopeFilter === 'all') return groupedAgents;
    return groupedAgents.filter((g) => g.key === scopeFilter);
  }, [groupedAgents, scopeFilter]);

  // Reset filter if current filter no longer valid
  useMemo(() => {
    if (scopeFilter !== 'all' && !groupedAgents.some((g) => g.key === scopeFilter)) {
      setScopeFilter('all');
    }
  }, [groupedAgents, scopeFilter]);

  // Dialog state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentWithScope | null>(null);
  const [editorPrefill, setEditorPrefill] = useState<
    | {
        name?: string;
        description?: string;
        prompt?: string;
        tools?: string[];
        model?: string;
      }
    | undefined
  >();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [evaluateOpen, setEvaluateOpen] = useState(false);
  const [evaluatingAgent, setEvaluatingAgent] = useState<AgentWithScope | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AgentWithScope | null>(null);

  const handleNewAgent = () => {
    setEditingAgent(null);
    setEditorPrefill(undefined);
    setEditorOpen(true);
  };

  const handleEditAgent = (agent: AgentWithScope) => {
    setEditingAgent(agent);
    setEditorPrefill(undefined);
    setEditorOpen(true);
  };

  const handleDeleteAgent = (agent: AgentWithScope) => {
    setDeleteConfirm(agent);
  };

  const confirmDelete = async () => {
    if (deleteConfirm) {
      await deleteAgent(deleteConfirm.filePath, deleteConfirm.name);
      setDeleteConfirm(null);
    }
  };

  const handleEvaluateAgent = (agent: AgentWithScope) => {
    setEvaluatingAgent(agent);
    setEvaluateOpen(true);
  };

  const handleGenerated = (agent: {
    name: string;
    description: string;
    prompt: string;
    tools?: string[];
    model?: string;
  }) => {
    setEditingAgent(null);
    setEditorPrefill(agent);
    setEditorOpen(true);
  };

  const handleToggleDefault = (agent: AgentWithScope) => {
    if (defaultAgents.includes(agent.name)) {
      setDefaultAgents(defaultAgents.filter((n) => n !== agent.name));
    } else {
      setDefaultAgents([...defaultAgents, agent.name]);
    }
  };

  const handleApplySuggestions = (agent: AgentWithScope, improvedPrompt: string) => {
    setEditingAgent(agent);
    setEditorPrefill({
      name: agent.name,
      description: agent.definition.description,
      prompt: improvedPrompt,
      tools: agent.definition.tools,
      model: agent.definition.model,
    });
    setEditorOpen(true);
  };

  const handleSave = useCallback(
    async (data: {
      name: string;
      description: string;
      prompt: string;
      tools?: string[];
      model?: string;
      scope: 'user' | 'project';
      projectPath?: string;
      originalFilePath?: string;
    }) => {
      return saveAgent(data);
    },
    [saveAgent]
  );

  const renderAgentList = (folder: { path: string; agents: AgentWithScope[] }) =>
    folder.agents.map((agent) => (
      <AgentCard
        key={`${agent.source}-${agent.name}-${agent.filePath}`}
        agent={agent}
        isDefault={defaultAgents.includes(agent.name)}
        onEdit={handleEditAgent}
        onDelete={handleDeleteAgent}
        onEvaluate={handleEvaluateAgent}
        onToggleDefault={handleToggleDefault}
      />
    ));

  return (
    <>
      <div
        className={cn(
          'rounded-2xl overflow-hidden',
          'border border-border/50',
          'bg-linear-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
          'shadow-sm shadow-black/5'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/30">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                Agents & Skills
                {enabled && agents.length > 0 && (
                  <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-500">
                    {agents.length} agent{agents.length !== 1 ? 's' : ''}
                  </span>
                )}
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Specialized agents Claude delegates to automatically
              </p>
            </div>
          </div>
          <Switch
            id="enable-agents"
            checked={enabled}
            onCheckedChange={updateEnabled}
            disabled={isLoading}
          />
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Section Tabs */}
          {enabled && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setActiveTab('agents')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  activeTab === 'agents'
                    ? 'bg-violet-500/20 text-violet-500 border border-violet-500/30'
                    : 'bg-accent/30 text-muted-foreground hover:bg-accent/50 border border-transparent'
                )}
              >
                <Bot className="w-3.5 h-3.5" />
                Agents
                {agents.length > 0 && (
                  <span className="text-[10px] opacity-60">{agents.length}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('context')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  activeTab === 'context'
                    ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                    : 'bg-accent/30 text-muted-foreground hover:bg-accent/50 border border-transparent'
                )}
              >
                <FileText className="w-3.5 h-3.5" />
                Context
                {contextFilesData.files.length > 0 && (
                  <span className="text-[10px] opacity-60">{contextFilesData.files.length}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('memory')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  activeTab === 'memory'
                    ? 'bg-purple-500/20 text-purple-500 border border-purple-500/30'
                    : 'bg-accent/30 text-muted-foreground hover:bg-accent/50 border border-transparent'
                )}
              >
                <Brain className="w-3.5 h-3.5" />
                Memory
                {memoryFilesData.files.length > 0 && (
                  <span className="text-[10px] opacity-60">{memoryFilesData.files.length}</span>
                )}
              </button>
            </div>
          )}

          {/* Agents Tab */}
          {enabled && activeTab === 'agents' && (
            <>
              {/* Action Bar */}
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Discovered Agents
                </Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNewAgent}
                    className="gap-1.5 h-7 px-2 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setGenerateOpen(true)}
                    className="gap-1.5 h-7 px-2 text-xs text-violet-500 hover:text-violet-400"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    AI Generate
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={refresh}
                    disabled={isLoading}
                    title="Refresh agents from disk"
                    className="gap-1.5 h-7 px-2 text-xs"
                  >
                    {isLoadingAgents ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Refresh
                  </Button>
                </div>
              </div>

              {/* Scope filter pills */}
              {filterOptions.length > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {filterOptions.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setScopeFilter(opt.key)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                        scopeFilter === opt.key
                          ? 'bg-violet-500/20 text-violet-500 border border-violet-500/30'
                          : 'bg-accent/30 text-muted-foreground hover:bg-accent/50 border border-transparent'
                      )}
                    >
                      <opt.Icon className="w-3 h-3" />
                      {opt.label}
                      <span className="text-[10px] opacity-60">{opt.count}</span>
                    </button>
                  ))}
                </div>
              )}

              {agents.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border border-dashed border-border/50 rounded-xl">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No agents found</p>
                  <p className="text-xs mt-1 max-w-sm mx-auto">
                    Create agents manually or use AI Generate to get started
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredGroups.map((group) => (
                    <div key={group.key} className="space-y-2">
                      {/* Group header — show when multiple groups visible */}
                      {filteredGroups.length > 1 && (
                        <div className="flex items-center gap-2 pt-1">
                          <group.Icon className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {group.label}
                          </span>
                          <span className="text-xs text-muted-foreground/60">
                            ({group.agents.length})
                          </span>
                        </div>
                      )}

                      {group.folders.map((folder) =>
                        folder.path === '' ? (
                          <div key="__root__" className="space-y-2">
                            {renderAgentList(folder)}
                          </div>
                        ) : (
                          <FolderGroup
                            key={folder.path}
                            path={folder.path}
                            agents={folder.agents}
                            defaultAgents={defaultAgents}
                            onEdit={handleEditAgent}
                            onDelete={handleDeleteAgent}
                            onEvaluate={handleEvaluateAgent}
                            onToggleDefault={handleToggleDefault}
                          />
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Help Text */}
              <div className="rounded-xl border border-border/30 bg-muted/30 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-md bg-brand-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground/80">Auto-Discovery</p>
                    <p>
                      Agents are automatically discovered when features run. Define agents as{' '}
                      <code className="text-xs bg-muted px-1 rounded">AGENT.md</code> files or{' '}
                      <code className="text-xs bg-muted px-1 rounded">agent-name.md</code> files.
                    </p>
                  </div>
                </div>
                <a
                  href="https://code.claude.com/docs/en/agents"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-brand-500 hover:text-brand-400 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View Agents documentation
                </a>
              </div>
            </>
          )}

          {/* Context Files Tab */}
          {enabled && activeTab === 'context' && <ContextFilesPanel data={contextFilesData} />}

          {/* Memory Files Tab */}
          {enabled && activeTab === 'memory' && <MemoryFilesPanel data={memoryFilesData} />}

          {/* Disabled State */}
          {!enabled && (
            <div className="text-center py-6 text-muted-foreground">
              <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Agents are disabled</p>
              <p className="text-xs mt-1">Enable to manage and use custom agent definitions</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="font-semibold text-base">Delete Agent</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This will
              remove the file from disk.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <AgentEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        agent={editingAgent}
        prefill={editorPrefill}
        onSave={handleSave}
        projects={allProjects}
      />

      <GenerateAgentDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        projectPath={projectPath}
        onGenerated={handleGenerated}
      />

      <EvaluateAgentDialog
        open={evaluateOpen}
        onOpenChange={setEvaluateOpen}
        agent={evaluatingAgent}
        projectPath={projectPath}
        onApplySuggestions={handleApplySuggestions}
      />
    </>
  );
}
