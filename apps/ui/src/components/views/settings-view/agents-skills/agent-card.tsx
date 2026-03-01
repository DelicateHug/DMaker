/**
 * Agent Card - Display card for a single agent with edit/delete actions
 */

import { useState } from 'react';
import { Badge } from '@/components/ui/layout';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  Globe,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Bot,
  Wrench,
  FileCode,
  Pencil,
  MoreVertical,
  Trash2,
  Sparkles,
  Star,
} from 'lucide-react';
import type { AgentWithScope } from './hooks/use-agents';

interface AgentCardProps {
  agent: AgentWithScope;
  isDefault?: boolean;
  onEdit: (agent: AgentWithScope) => void;
  onDelete: (agent: AgentWithScope) => void;
  onEvaluate: (agent: AgentWithScope) => void;
  onToggleDefault?: (agent: AgentWithScope) => void;
}

export function AgentCard({
  agent,
  isDefault,
  onEdit,
  onDelete,
  onEvaluate,
  onToggleDefault,
}: AgentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { name, definition, scope, filePath } = agent;

  const toolCount = definition.tools?.length ?? 'all';

  const ScopeIcon = scope === 'global' ? Globe : FolderOpen;
  const scopeLabel = scope === 'global' ? 'User' : 'Project';

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div
        className={cn(
          'rounded-xl border transition-all duration-200',
          'border-border/50 bg-accent/20',
          'hover:bg-accent/30 hover:border-border/70'
        )}
      >
        {/* Main Card Content */}
        <div className="flex items-start gap-3 p-4">
          {/* Agent Icon */}
          <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0 mt-0.5">
            <Bot className="w-4 h-4 text-violet-500" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header Row */}
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-sm">{name}</h4>
              <Badge variant="muted" size="sm" className="flex items-center gap-1">
                <Wrench className="h-3 w-3" />
                {toolCount === 'all' ? 'All' : toolCount} tools
              </Badge>
              <Badge variant="muted" size="sm" className="flex items-center gap-1">
                <ScopeIcon className="h-3 w-3" />
                {scopeLabel}
              </Badge>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
              {definition.description}
            </p>

            {/* File Path */}
            {filePath && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground/60">
                <FileCode className="h-3 w-3" />
                <span className="font-mono truncate">{filePath}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {onToggleDefault && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleDefault(agent)}
                className={cn('h-8 w-8 p-0', isDefault && 'text-amber-500 hover:text-amber-400')}
                title={isDefault ? 'Remove from defaults' : 'Set as default for new features'}
              >
                <Star className={cn('w-3.5 h-3.5', isDefault && 'fill-current')} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(agent)}
              className="h-8 w-8 p-0"
              title="Edit agent"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="More actions">
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEvaluate(agent)}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Evaluate with AI
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(agent)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Expand Button */}
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  'hover:bg-muted/50 text-muted-foreground hover:text-foreground',
                  'cursor-pointer'
                )}
                title={isExpanded ? 'Hide prompt' : 'View prompt'}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </CollapsibleTrigger>
          </div>
        </div>

        {/* Expandable Prompt Section */}
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0">
            <div className="ml-12 rounded-lg border border-border/30 bg-muted/30 p-4 overflow-auto max-h-64">
              <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                System Prompt
              </div>
              <Markdown className="text-xs prose-sm">{definition.prompt}</Markdown>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
