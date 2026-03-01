import * as React from 'react';
import { ChevronsUpDown, X, FileText } from 'lucide-react';
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
  useContextFiles,
  type ContextFile,
} from '@/components/views/settings-view/agents-skills/hooks/use-context-files';

interface ContextFileSelectorProps {
  /** Selected context file names */
  value: string[];
  /** Callback when selection changes */
  onChange: (names: string[]) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
}

export function ContextFileSelector({
  value,
  onChange,
  placeholder = 'All enabled context files',
  disabled = false,
}: ContextFileSelectorProps) {
  const { files } = useContextFiles();
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

  // Only show enabled files in the selector
  const enabledFiles = React.useMemo(() => files.filter((f) => f.enabled), [files]);

  // Filter out already selected
  const availableFiles = React.useMemo(() => {
    return enabledFiles.filter((f) => !value.includes(f.name));
  }, [enabledFiles, value]);

  // Filter by search input
  const filteredFiles = React.useMemo(() => {
    if (!inputValue) return availableFiles;
    const lower = inputValue.toLowerCase();
    return availableFiles.filter(
      (f) =>
        f.name.toLowerCase().includes(lower) ||
        (f.description && f.description.toLowerCase().includes(lower))
    );
  }, [availableFiles, inputValue]);

  // Get selected file objects for display
  const selectedFiles = React.useMemo(() => {
    return value
      .map((name) => files.find((f) => f.name === name))
      .filter((f): f is ContextFile => f !== undefined);
  }, [value, files]);

  const handleSelect = (fileName: string) => {
    if (!value.includes(fileName)) {
      onChange([...value, fileName]);
    }
    setInputValue('');
  };

  const handleRemove = (fileName: string) => {
    onChange(value.filter((n) => n !== fileName));
  };

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
              <FileText className="w-4 h-4 shrink-0" />
              {value.length > 0
                ? `${value.length} context file${value.length !== 1 ? 's' : ''} selected`
                : placeholder}
            </span>
            <ChevronsUpDown className="opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0"
          style={{ width: Math.max(triggerWidth, 300) }}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search context files..."
              className="h-9"
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandList>
              <CommandEmpty>No context files found.</CommandEmpty>
              <CommandGroup>
                {filteredFiles.map((file) => (
                  <CommandItem
                    key={file.name}
                    value={file.name}
                    onSelect={() => handleSelect(file.name)}
                  >
                    <FileText className="w-4 h-4 mr-2 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{file.name}</span>
                      {file.description && (
                        <span className="block text-xs text-muted-foreground truncate">
                          {file.description}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected files as badges */}
      {selectedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedFiles.map((file) => (
            <Badge
              key={file.name}
              variant="secondary"
              className="flex items-center gap-1 pr-1 text-xs"
            >
              <FileText className="w-3 h-3 text-amber-500" />
              <span className="truncate max-w-[150px]">{file.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRemove(file.name);
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
