import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays';
import { Check } from 'lucide-react';
import { useState } from 'react';

interface PrioritySelectorProps {
  selectedPriority: number;
  onPrioritySelect: (priority: number) => void;
  testIdPrefix?: string;
}

const priorities = [
  { value: 3, label: 'Low', short: 'L', color: 'blue' },
  { value: 2, label: 'Medium', short: 'M', color: 'yellow' },
  { value: 1, label: 'High', short: 'H', color: 'red' },
] as const;

const colorMap = {
  blue: {
    trigger: 'border-blue-500/50 text-blue-500',
    option: 'hover:bg-blue-500/10 text-blue-500',
    dot: 'bg-blue-500',
  },
  yellow: {
    trigger: 'border-yellow-500/50 text-yellow-500',
    option: 'hover:bg-yellow-500/10 text-yellow-500',
    dot: 'bg-yellow-500',
  },
  red: {
    trigger: 'border-red-500/50 text-red-500',
    option: 'hover:bg-red-500/10 text-red-500',
    dot: 'bg-red-500',
  },
} as const;

export function PrioritySelector({
  selectedPriority,
  onPrioritySelect,
  testIdPrefix = 'priority',
}: PrioritySelectorProps) {
  const [open, setOpen] = useState(false);
  const selected = priorities.find((p) => p.value === selectedPriority) ?? priorities[1];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors border bg-background',
            colorMap[selected.color].trigger
          )}
          data-testid={`${testIdPrefix}-trigger`}
        >
          <span className={cn('w-1.5 h-1.5 rounded-full', colorMap[selected.color].dot)} />
          {selected.short}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1" align="start">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Priority</div>
        <div className="flex flex-col gap-0.5">
          {/* Selected priority first */}
          <button
            type="button"
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-default',
              `${colorMap[selected.color].option} bg-muted/50`
            )}
            data-testid={`${testIdPrefix}-${selected.label.toLowerCase()}-button`}
          >
            <span className={cn('w-2 h-2 rounded-full', colorMap[selected.color].dot)} />
            <span className="flex-1 text-left">{selected.label}</span>
            <Check className="w-3.5 h-3.5 text-foreground" />
          </button>
          {/* Other priorities */}
          {priorities
            .filter((p) => p.value !== selectedPriority)
            .map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => {
                  onPrioritySelect(p.value);
                  setOpen(false);
                }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm text-muted-foreground hover:bg-accent cursor-pointer"
                data-testid={`${testIdPrefix}-${p.label.toLowerCase()}-button`}
              >
                <span className={cn('w-2 h-2 rounded-full', colorMap[p.color].dot)} />
                <span className="flex-1 text-left">{p.label}</span>
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
