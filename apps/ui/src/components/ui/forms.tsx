/* eslint-disable @typescript-eslint/no-empty-object-type */
'use client';

import * as React from 'react';
import { useEffect, Fragment, FocusEvent, KeyboardEvent, MouseEvent } from 'react';
import { useState, useRef, useCallback, useMemo } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import * as SliderPrimitive from '@radix-ui/react-slider';
import {
  Check,
  ChevronsUpDown,
  ChevronDown,
  ChevronUp,
  Circle,
  Tag,
  Home,
  ArrowLeft,
  Pencil,
  ArrowRight,
  Search,
  Folder,
  File,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/layout';
import { Kbd } from '@/components/ui/layout';

// ============================================================================
// Input
// ============================================================================

interface InputProps extends React.ComponentProps<'input'> {
  startAddon?: React.ReactNode;
  endAddon?: React.ReactNode;
}

function Input({ className, type, startAddon, endAddon, ...props }: InputProps) {
  const hasAddons = startAddon || endAddon;

  const inputElement = (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground/60 selection:bg-primary selection:text-primary-foreground bg-input border-border h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        // Inner shadow for depth
        'shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]',
        // Animated focus ring
        'transition-[color,box-shadow,border-color] duration-200 ease-out',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
        // Adjust padding for addons
        startAddon && 'pl-0',
        endAddon && 'pr-0',
        hasAddons && 'border-0 shadow-none focus-visible:ring-0',
        className
      )}
      {...props}
    />
  );

  if (!hasAddons) {
    return inputElement;
  }

  return (
    <div
      className={cn(
        'flex items-center h-9 w-full rounded-md border border-border bg-input shadow-xs',
        'shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]',
        'transition-[box-shadow,border-color] duration-200 ease-out',
        'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
        'has-[input:disabled]:opacity-50 has-[input:disabled]:cursor-not-allowed',
        'has-[input[aria-invalid]]:ring-destructive/20 has-[input[aria-invalid]]:border-destructive'
      )}
    >
      {startAddon && (
        <span className="flex items-center justify-center px-3 text-muted-foreground text-sm">
          {startAddon}
        </span>
      )}
      {inputElement}
      {endAddon && (
        <span className="flex items-center justify-center px-3 text-muted-foreground text-sm">
          {endAddon}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Textarea
// ============================================================================

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'placeholder:text-muted-foreground/60 selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-border min-h-[80px] w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none',
        // Inner shadow for depth
        'shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]',
        // Animated focus ring
        'transition-[color,box-shadow,border-color] duration-200 ease-out',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className
      )}
      {...props}
    />
  );
}

// ============================================================================
// Label
// ============================================================================

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

// ============================================================================
// Checkbox
// ============================================================================

interface CheckboxProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'checked' | 'defaultChecked'
> {
  checked?: boolean | 'indeterminate';
  defaultChecked?: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean) => void;
  required?: boolean;
}

const CheckboxRoot = CheckboxPrimitive.Root as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLButtonElement>
>;

const CheckboxIndicator = CheckboxPrimitive.Indicator as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Indicator> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLSpanElement>
>;

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, onCheckedChange, children: _children, ...props }, ref) => (
    <CheckboxRoot
      ref={ref}
      className={cn(
        'peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground hover:border-primary/80',
        className
      )}
      onCheckedChange={(checked) => {
        // Handle indeterminate state by treating it as false for consumers expecting boolean
        if (onCheckedChange) {
          onCheckedChange(checked === true);
        }
      }}
      {...props}
    >
      <CheckboxIndicator className={cn('flex items-center justify-center text-current')}>
        <Check className="h-4 w-4" />
      </CheckboxIndicator>
    </CheckboxRoot>
  )
);
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

// ============================================================================
// RadioGroup
// ============================================================================

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return <RadioGroupPrimitive.Root className={cn('grid gap-2', className)} {...props} ref={ref} />;
});
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        'aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="h-2.5 w-2.5 fill-current text-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

// ============================================================================
// Select
// ============================================================================

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        position === 'popper' &&
          'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          'p-1',
          position === 'popper' &&
            'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('py-1.5 pl-8 pr-2 text-sm font-semibold', className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

// ============================================================================
// Switch
// ============================================================================

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-5 w-5 rounded-full bg-foreground shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0'
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

// ============================================================================
// Slider
// ============================================================================

// Type-safe wrappers for Radix UI primitives (React 19 compatibility)
const SliderRootPrimitive = SliderPrimitive.Root as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLSpanElement>
>;

const SliderTrackPrimitive = SliderPrimitive.Track as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Track> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLSpanElement>
>;

const SliderRangePrimitive = SliderPrimitive.Range as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Range> & {
    className?: string;
  } & React.RefAttributes<HTMLSpanElement>
>;

const SliderThumbPrimitive = SliderPrimitive.Thumb as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Thumb> & {
    className?: string;
  } & React.RefAttributes<HTMLSpanElement>
>;

interface SliderProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'defaultValue' | 'dir'> {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  onValueCommit?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  orientation?: 'horizontal' | 'vertical';
  dir?: 'ltr' | 'rtl';
  inverted?: boolean;
  minStepsBetweenThumbs?: number;
}

const Slider = React.forwardRef<HTMLSpanElement, SliderProps>(({ className, ...props }, ref) => (
  <SliderRootPrimitive
    ref={ref}
    className={cn('relative flex w-full touch-none select-none items-center', className)}
    {...props}
  >
    <SliderTrackPrimitive className="slider-track relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted cursor-pointer">
      <SliderRangePrimitive className="slider-range absolute h-full bg-primary" />
    </SliderTrackPrimitive>
    <SliderThumbPrimitive className="slider-thumb block h-4 w-4 rounded-full border border-border bg-card shadow transition-colors cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent" />
  </SliderRootPrimitive>
));
Slider.displayName = SliderPrimitive.Root.displayName;

// ============================================================================
// Autocomplete
// ============================================================================

export interface AutocompleteOption {
  value: string;
  label?: string;
  badge?: string;
  isDefault?: boolean;
}

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  options: (string | AutocompleteOption)[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  icon?: LucideIcon;
  allowCreate?: boolean;
  createLabel?: (value: string) => string;
  compact?: boolean;
  'data-testid'?: string;
  itemTestIdPrefix?: string;
}

function normalizeOption(opt: string | AutocompleteOption): AutocompleteOption {
  if (typeof opt === 'string') {
    return { value: opt, label: opt };
  }
  return { ...opt, label: opt.label ?? opt.value };
}

function Autocomplete({
  value,
  onChange,
  options,
  placeholder = 'Select an option...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  className,
  disabled = false,
  error = false,
  icon: Icon,
  allowCreate = false,
  createLabel = (v) => `Create "${v}"`,
  compact = false,
  'data-testid': testId,
  itemTestIdPrefix = 'option',
}: AutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const [triggerWidth, setTriggerWidth] = React.useState<number>(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const normalizedOptions = React.useMemo(() => options.map(normalizeOption), [options]);

  // Update trigger width when component mounts or value changes
  React.useEffect(() => {
    if (triggerRef.current) {
      const updateWidth = () => {
        setTriggerWidth(triggerRef.current?.offsetWidth || 0);
      };

      updateWidth();

      const resizeObserver = new ResizeObserver(updateWidth);
      resizeObserver.observe(triggerRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [value]);

  // Filter options based on input
  const filteredOptions = React.useMemo(() => {
    if (!inputValue) return normalizedOptions;
    const lower = inputValue.toLowerCase();
    return normalizedOptions.filter(
      (opt) => opt.value.toLowerCase().includes(lower) || opt.label?.toLowerCase().includes(lower)
    );
  }, [normalizedOptions, inputValue]);

  // Check if user typed a new value that doesn't exist
  const isNewValue =
    allowCreate &&
    inputValue.trim() &&
    !normalizedOptions.some((opt) => opt.value.toLowerCase() === inputValue.toLowerCase());

  // Get display value
  const displayValue = React.useMemo(() => {
    if (!value) return null;
    const found = normalizedOptions.find((opt) => opt.value === value);
    return found?.label ?? value;
  }, [value, normalizedOptions]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            compact ? 'w-auto h-auto px-2 py-1.5 text-xs gap-1.5' : 'w-full justify-between',
            Icon && !compact && 'font-mono text-sm',
            error && 'border-destructive focus-visible:ring-destructive',
            className
          )}
          data-testid={testId}
        >
          <span className={cn('flex items-center truncate', compact ? 'gap-1.5' : 'gap-2')}>
            {Icon && (
              <Icon
                className={cn('shrink-0 text-muted-foreground', compact ? 'w-3 h-3' : 'w-4 h-4')}
              />
            )}
            {displayValue || placeholder}
          </span>
          {!compact && <ChevronsUpDown className="opacity-50 shrink-0" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{
          width: Math.max(triggerWidth, 200),
        }}
        data-testid={testId ? `${testId}-list` : undefined}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-9"
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
            <CommandEmpty>
              {isNewValue ? (
                <div className="py-2 px-3 text-sm">
                  Press enter to create <code className="bg-muted px-1 rounded">{inputValue}</code>
                </div>
              ) : (
                emptyMessage
              )}
            </CommandEmpty>
            <CommandGroup>
              {/* Show "Create new" option if typing a new value */}
              {isNewValue && (
                <CommandItem
                  value={inputValue}
                  onSelect={() => {
                    onChange(inputValue);
                    setInputValue('');
                    setOpen(false);
                  }}
                  className="text-[var(--status-success)]"
                  data-testid={`${itemTestIdPrefix}-create-new`}
                >
                  {Icon && <Icon className="w-4 h-4 mr-2" />}
                  {createLabel(inputValue)}
                  <span className="ml-auto text-xs text-muted-foreground">(new)</span>
                </CommandItem>
              )}
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(currentValue) => {
                    onChange(currentValue === value ? '' : currentValue);
                    setInputValue('');
                    setOpen(false);
                  }}
                  data-testid={`${itemTestIdPrefix}-${option.value.toLowerCase().replace(/[\s/\\]+/g, '-')}`}
                >
                  {Icon && <Icon className="w-4 h-4 mr-2" />}
                  {option.label}
                  <Check
                    className={cn('ml-auto', value === option.value ? 'opacity-100' : 'opacity-0')}
                  />
                  {option.badge && (
                    <span className="ml-2 text-xs text-muted-foreground">({option.badge})</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// CategoryAutocomplete
// ============================================================================

interface CategoryAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  compact?: boolean;
  'data-testid'?: string;
}

function CategoryAutocomplete({
  value,
  onChange,
  suggestions,
  placeholder = 'Select or type a category...',
  className,
  disabled = false,
  error = false,
  compact = false,
  'data-testid': testId,
}: CategoryAutocompleteProps) {
  return (
    <Autocomplete
      value={value}
      onChange={onChange}
      options={suggestions}
      placeholder={placeholder}
      searchPlaceholder="Search or type new category..."
      emptyMessage="No category found."
      className={className}
      disabled={disabled}
      error={error}
      icon={Tag}
      allowCreate
      compact={compact}
      createLabel={(v) => `Create "${v}"`}
      data-testid={testId}
      itemTestIdPrefix="category-option"
    />
  );
}

// ============================================================================
// PathInput
// ============================================================================

interface BreadcrumbSegment {
  name: string;
  path: string;
  isLast: boolean;
}

function parseBreadcrumbs(path: string): BreadcrumbSegment[] {
  if (!path) return [];

  // Handle root path on Unix-like systems
  if (path === '/') {
    return [{ name: '/', path: '/', isLast: true }];
  }

  const segments = path.split(/[/\\]/).filter(Boolean);
  const isWindows = segments[0]?.includes(':');

  return segments.map((segment, index) => {
    let fullPath: string;

    if (isWindows) {
      const pathParts = segments.slice(0, index + 1);
      if (index === 0) {
        fullPath = `${pathParts[0]}\\`;
      } else {
        fullPath = pathParts.join('\\');
      }
    } else {
      fullPath = '/' + segments.slice(0, index + 1).join('/');
    }

    return {
      name: segment,
      path: fullPath,
      isLast: index === segments.length - 1,
    };
  });
}

interface FileSystemEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface PathInputProps {
  /** Current resolved path */
  currentPath: string;
  /** Parent path for back navigation (null if at root) */
  parentPath: string | null;
  /** Whether the component is in a loading state */
  loading?: boolean;
  /** Whether there's an error (shows input mode and red border when true) */
  error?: boolean;
  /** Placeholder text for the input field */
  placeholder?: string;
  /** Placeholder text for the search input field */
  searchPlaceholder?: string;
  /** Called when user navigates to a path (via breadcrumb click, enter key, or navigation buttons) */
  onNavigate: (path: string) => void;
  /** Called when user clicks home button (navigates to home directory) */
  onHome: () => void;
  /** Additional className for the container */
  className?: string;
  /** List of files and directories in current path for search functionality */
  entries?: FileSystemEntry[];
  /** Called when user selects an entry from search results */
  onSelectEntry?: (entry: FileSystemEntry) => void;
}

function PathInput({
  currentPath,
  parentPath,
  loading = false,
  error,
  placeholder = 'Paste or type a full path (e.g., /home/user/projects/myapp)',
  searchPlaceholder = 'Search...',
  onNavigate,
  onHome,
  className,
  entries = [],
  onSelectEntry,
}: PathInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [pathInput, setPathInput] = useState(currentPath);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync pathInput with currentPath when it changes externally
  useEffect(() => {
    if (!isEditing) {
      setPathInput(currentPath);
    }
  }, [currentPath, isEditing]);

  // Focus input when error occurs or entering edit mode
  useEffect(() => {
    if ((error || isEditing) && inputRef.current) {
      inputRef.current.focus();
      if (error) {
        inputRef.current.select();
      }
    }
  }, [error, isEditing]);

  const handleGoToParent = useCallback(() => {
    if (parentPath) {
      onNavigate(parentPath);
    }
  }, [parentPath, onNavigate]);

  const handleBreadcrumbClick = useCallback(
    (path: string) => {
      onNavigate(path);
    },
    [onNavigate]
  );

  const handleStartEditing = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleInputBlur = useCallback(
    (e: FocusEvent) => {
      // Check if focus is moving to another element within this component
      if (containerRef.current?.contains(e.relatedTarget)) {
        return;
      }
      if (pathInput !== currentPath) {
        setPathInput(currentPath);
      }
      setIsEditing(false);
    },
    [pathInput, currentPath]
  );

  const handleGoToPath = useCallback(() => {
    const trimmedPath = pathInput.trim();
    if (trimmedPath) {
      onNavigate(trimmedPath);
      setIsEditing(false);
    }
  }, [pathInput, onNavigate]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleGoToPath();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPathInput(currentPath);
        setIsEditing(false);
        inputRef.current?.blur();
      }
    },
    [handleGoToPath, currentPath]
  );

  // Handle click on the path container to start editing
  const handleContainerClick = useCallback(
    (e: MouseEvent) => {
      // Don't trigger if clicking on a button or already editing
      if (
        isEditing ||
        isSearchOpen ||
        (e.target as HTMLElement).closest('button') ||
        (e.target as HTMLElement).closest('a')
      ) {
        return;
      }
      setIsEditing(true);
    },
    [isEditing, isSearchOpen]
  );

  const handleSelectEntry = useCallback(
    (entry: FileSystemEntry) => {
      if (onSelectEntry) {
        onSelectEntry(entry);
      }
      setIsSearchOpen(false);
    },
    [onSelectEntry]
  );

  // Global keyboard shortcut to activate search (/)
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      // Activate search with '/' key (unless in an input field or contenteditable)
      if (
        e.key === '/' &&
        !isEditing &&
        !isSearchOpen &&
        entries.length > 0 &&
        !(e.target as HTMLElement).matches('input, textarea, [contenteditable="true"]')
      ) {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      // Close search with Escape key
      if (e.key === 'Escape' && isSearchOpen) {
        e.preventDefault();
        e.stopPropagation(); // Stop propagation so parent modal doesn't close
        setIsSearchOpen(false);
      }
    };

    // Use capture phase to intercept ESC before parent modal handlers
    // This allows us to close search first, then let ESC bubble to close modal on second press
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [isEditing, isSearchOpen, entries.length]);

  // Close search when clicking outside
  useEffect(() => {
    if (!isSearchOpen) return;

    const handleClickOutside = (e: globalThis.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSearchOpen]);

  const breadcrumbs = useMemo(() => parseBreadcrumbs(currentPath), [currentPath]);

  const entryItems = useMemo(
    () =>
      entries.map((entry) => (
        <CommandItem key={entry.path} value={entry.name} onSelect={() => handleSelectEntry(entry)}>
          {entry.isDirectory ? (
            <Folder className="w-3.5 h-3.5 text-brand-500 mr-2" />
          ) : (
            <File className="w-3.5 h-3.5 text-muted-foreground mr-2" />
          )}
          <span className="flex-1 truncate font-mono text-xs">{entry.name}</span>
        </CommandItem>
      )),
    [entries, handleSelectEntry]
  );

  const showBreadcrumbs = currentPath && !isEditing && !loading && !error;

  return (
    <div
      ref={containerRef}
      className={cn('flex items-center gap-2', className)}
      role="navigation"
      aria-label="Path navigation"
    >
      {/* Navigation buttons */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onHome}
          className="h-7 w-7"
          disabled={loading}
          aria-label="Go to home directory"
        >
          <Home className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleGoToParent}
          className="h-7 w-7"
          disabled={loading || !parentPath}
          aria-label="Go to parent directory"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
      </div>

      {/* Path display / input */}
      <div className="flex-1 relative min-w-0">
        {/* Search Popover - positioned to overlap the input */}
        {isSearchOpen && (
          <div className="absolute inset-0 z-50">
            <div className="relative w-full h-full">
              <div className="absolute inset-0 bg-popover border border-border rounded-md shadow-lg">
                <Command className="h-auto max-h-[300px]">
                  <div className="flex items-center gap-2 px-3 **:data-[slot=command-input-wrapper]:border-0 **:data-[slot=command-input-wrapper]:px-0">
                    <CommandInput
                      autoFocus
                      placeholder={searchPlaceholder}
                      className="h-8 flex-1"
                    />
                    <div className="flex items-center gap-1 shrink-0 ml-auto">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsSearchOpen(false)}
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        aria-label="Close search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                      <Kbd className="hidden py-0.5 sm:inline-block">ESC</Kbd>
                    </div>
                  </div>
                  <CommandList className="scrollbar-styled">
                    <CommandEmpty>No files or directories found</CommandEmpty>
                    <CommandGroup>{entryItems}</CommandGroup>
                  </CommandList>
                </Command>
              </div>
            </div>
          </div>
        )}

        <div
          onClick={handleContainerClick}
          className={cn(
            'flex items-center gap-2 min-w-0 h-8 px-3 rounded-md border bg-background/50 transition-colors',
            error
              ? 'border-destructive focus-within:border-destructive'
              : 'border-input focus-within:border-ring focus-within:ring-1 focus-within:ring-ring',
            !isEditing && !error && 'cursor-text hover:border-ring/50'
          )}
        >
          {showBreadcrumbs ? (
            <>
              <Breadcrumb className="flex-1 min-w-0 overflow-hidden">
                <BreadcrumbList className="flex-nowrap overflow-x-auto scrollbar-none">
                  {breadcrumbs.map((crumb) => (
                    <Fragment key={crumb.path}>
                      <BreadcrumbItem className="shrink-0">
                        {crumb.isLast ? (
                          <BreadcrumbPage className="font-mono text-xs font-medium truncate max-w-[200px]">
                            {crumb.name}
                          </BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              handleBreadcrumbClick(crumb.path);
                            }}
                            className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors truncate max-w-[150px]"
                          >
                            {crumb.name}
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {!crumb.isLast && (
                        <BreadcrumbSeparator className="[&>svg]:size-3.5 shrink-0" />
                      )}
                    </Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSearchOpen(true)}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  aria-label="Search files and directories"
                  title="Search files and directories"
                  disabled={loading || entries.length === 0}
                >
                  <Search className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleStartEditing}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  aria-label="Edit path"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <Input
                ref={inputRef}
                type="text"
                placeholder={placeholder}
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleInputBlur}
                className="flex-1 font-mono text-xs h-7 px-0 border-0 shadow-none focus-visible:ring-0 bg-transparent"
                data-testid="path-input"
                disabled={loading}
                aria-label="Path input"
                aria-invalid={error}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleGoToPath}
                disabled={!pathInput.trim() || loading}
                className="h-6 w-6 shrink-0"
                aria-label="Go to path"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export {
  Input,
  Textarea,
  Label,
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
  Switch,
  Slider,
  Autocomplete,
  CategoryAutocomplete,
  PathInput,
  parseBreadcrumbs,
};
export type { PathInputProps, BreadcrumbSegment, FileSystemEntry };
