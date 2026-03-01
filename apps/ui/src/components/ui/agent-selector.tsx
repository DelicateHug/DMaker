import * as React from 'react';
import { ChevronsUpDown, X, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/overlays';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays';
import { Badge } from '@/components/ui/layout';
import {
  useAgents,
  type AgentWithScope,
} from '@/components/views/settings-view/agents-skills/hooks/use-agents';

interface AgentSelectorProps {
  /** Selected agent names */
  value: string[];
  /** Callback when selection changes */
  onChange: (names: string[]) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Compact inline chip style */
  compact?: boolean;
  /** Filter agents to this project name (shows global + matching project agents) */
  projectName?: string;
}

export function AgentSelector({
  value,
  onChange,
  placeholder = 'Select agents...',
  disabled = false,
  compact = false,
  projectName,
}: AgentSelectorProps) {
  const { agents } = useAgents();
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const [triggerWidth, setTriggerWidth] = React.useState<number>(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (triggerRef.current) {
      const updateWidth = () => {
        setTriggerWidth(triggerRef.current?.offsetWidth || 0);
      };
      updateWidth();
      const resizeObserver = new ResizeObserver(updateWidth);
      resizeObserver.observe(triggerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, [value]);

  // Filter agents by project scope: show global agents + agents from the current project
  const projectFilteredAgents = React.useMemo(() => {
    if (!projectName) return agents;
    return agents.filter((a) => a.scope === 'global' || a.projectName === projectName);
  }, [agents, projectName]);

  // Filter out already selected agents
  const availableAgents = React.useMemo(() => {
    return projectFilteredAgents.filter((a) => !value.includes(a.name));
  }, [projectFilteredAgents, value]);

  // Filter by search input
  const filteredAgents = React.useMemo(() => {
    if (!inputValue) return availableAgents;
    const lower = inputValue.toLowerCase();
    return availableAgents.filter(
      (a) =>
        a.name.toLowerCase().includes(lower) ||
        a.definition.description.toLowerCase().includes(lower)
    );
  }, [availableAgents, inputValue]);

  // Get selected agent objects for display
  const selectedAgents = React.useMemo(() => {
    return value
      .map((name) => agents.find((a) => a.name === name))
      .filter((a): a is AgentWithScope => a !== undefined);
  }, [value, agents]);

  const handleSelect = (agentName: string) => {
    if (!value.includes(agentName)) {
      onChange([...value, agentName]);
    }
    setInputValue('');
  };

  const handleRemove = (agentName: string) => {
    onChange(value.filter((n) => n !== agentName));
  };

  const compactLabel =
    value.length > 0 ? `${value.length} Agent${value.length !== 1 ? 's' : ''}` : 'Agents';

  const popoverContent = (
    <PopoverContent
      className="p-0"
      style={{ width: Math.max(triggerWidth, 300) }}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search agents..."
          className="h-9"
          value={inputValue}
          onValueChange={setInputValue}
        />
        <CommandList>
          <CommandEmpty>No agents found.</CommandEmpty>
          <CommandGroup>
            {/* Selected agents at top with remove option */}
            {compact &&
              selectedAgents.map((agent) => (
                <CommandItem
                  key={`selected-${agent.source}-${agent.name}`}
                  value={`remove-${agent.name}`}
                  onSelect={() => handleRemove(agent.name)}
                >
                  <Bot className="w-4 h-4 mr-2 text-violet-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{agent.name}</span>
                  </div>
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </CommandItem>
              ))}
            {filteredAgents.map((agent) => {
              return (
                <CommandItem
                  key={`${agent.source}-${agent.name}`}
                  value={agent.name}
                  onSelect={() => handleSelect(agent.name)}
                >
                  <Bot className="w-4 h-4 mr-2 text-violet-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{agent.name}</span>
                    {agent.definition.description && (
                      <span className="block text-xs text-muted-foreground truncate">
                        {agent.definition.description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  );

  if (compact) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors border bg-background',
              value.length > 0
                ? 'border-violet-500/50 text-violet-500'
                : 'border-border text-muted-foreground'
            )}
          >
            <Bot className="w-3 h-3" />
            {compactLabel}
          </button>
        </PopoverTrigger>
        {popoverContent}
      </Popover>
    );
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn('w-full justify-between min-h-[40px]')}
          >
            <span className="flex items-center gap-2 truncate text-muted-foreground">
              <Bot className="w-4 h-4 shrink-0" />
              {value.length > 0
                ? `${value.length} agent${value.length !== 1 ? 's' : ''} selected`
                : placeholder}
            </span>
            <ChevronsUpDown className="opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        {popoverContent}
      </Popover>

      {/* Selected agents as badges */}
      {selectedAgents.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedAgents.map((agent) => (
            <Badge
              key={agent.name}
              variant="secondary"
              className="flex items-center gap-1 pr-1 text-xs"
            >
              <Bot className="w-3 h-3 text-violet-500" />
              <span className="truncate max-w-[150px]">{agent.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRemove(agent.name);
                }}
                className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                disabled={disabled}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
