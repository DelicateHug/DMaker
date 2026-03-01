/* eslint-disable @typescript-eslint/no-empty-object-type */

import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { Slot } from '@radix-ui/react-slot';
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// ============================================================================
// Accordion
// ============================================================================

type AccordionType = 'single' | 'multiple';

interface AccordionContextValue {
  type: AccordionType;
  value: string | string[];
  onValueChange: (value: string) => void;
  collapsible?: boolean;
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: 'single' | 'multiple';
  value?: string | string[];
  defaultValue?: string | string[];
  onValueChange?: (value: string | string[]) => void;
  collapsible?: boolean;
}

const Accordion = React.forwardRef<HTMLDivElement, AccordionProps>(
  (
    {
      type = 'single',
      value,
      defaultValue,
      onValueChange,
      collapsible = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState<string | string[]>(() => {
      if (value !== undefined) return value;
      if (defaultValue !== undefined) return defaultValue;
      return type === 'single' ? '' : [];
    });

    const currentValue = value !== undefined ? value : internalValue;

    const handleValueChange = React.useCallback(
      (itemValue: string) => {
        let newValue: string | string[];

        if (type === 'single') {
          if (currentValue === itemValue && collapsible) {
            newValue = '';
          } else if (currentValue === itemValue && !collapsible) {
            return;
          } else {
            newValue = itemValue;
          }
        } else {
          const currentArray = Array.isArray(currentValue)
            ? currentValue
            : [currentValue].filter(Boolean);
          if (currentArray.includes(itemValue)) {
            newValue = currentArray.filter((v) => v !== itemValue);
          } else {
            newValue = [...currentArray, itemValue];
          }
        }

        if (value === undefined) {
          setInternalValue(newValue);
        }
        onValueChange?.(newValue);
      },
      [type, currentValue, collapsible, value, onValueChange]
    );

    const contextValue = React.useMemo(
      () => ({
        type,
        value: currentValue,
        onValueChange: handleValueChange,
        collapsible,
      }),
      [type, currentValue, handleValueChange, collapsible]
    );

    return (
      <AccordionContext.Provider value={contextValue}>
        <div ref={ref} data-slot="accordion" className={cn('w-full', className)} {...props}>
          {children}
        </div>
      </AccordionContext.Provider>
    );
  }
);
Accordion.displayName = 'Accordion';

interface AccordionItemContextValue {
  value: string;
  isOpen: boolean;
}

const AccordionItemContext = React.createContext<AccordionItemContextValue | null>(null);

interface AccordionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const AccordionItem = React.forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ className, value, children, ...props }, ref) => {
    const accordionContext = React.useContext(AccordionContext);

    if (!accordionContext) {
      throw new Error('AccordionItem must be used within an Accordion');
    }

    const isOpen = Array.isArray(accordionContext.value)
      ? accordionContext.value.includes(value)
      : accordionContext.value === value;

    const contextValue = React.useMemo(() => ({ value, isOpen }), [value, isOpen]);

    return (
      <AccordionItemContext.Provider value={contextValue}>
        <div
          ref={ref}
          data-slot="accordion-item"
          data-state={isOpen ? 'open' : 'closed'}
          className={cn('border-b border-border', className)}
          {...props}
        >
          {children}
        </div>
      </AccordionItemContext.Provider>
    );
  }
);
AccordionItem.displayName = 'AccordionItem';

interface AccordionTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const AccordionTrigger = React.forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  ({ className, children, ...props }, ref) => {
    const accordionContext = React.useContext(AccordionContext);
    const itemContext = React.useContext(AccordionItemContext);

    if (!accordionContext || !itemContext) {
      throw new Error('AccordionTrigger must be used within an AccordionItem');
    }

    const { onValueChange } = accordionContext;
    const { value, isOpen } = itemContext;

    return (
      <div data-slot="accordion-header" className="flex">
        <button
          ref={ref}
          type="button"
          data-slot="accordion-trigger"
          data-state={isOpen ? 'open' : 'closed'}
          aria-expanded={isOpen}
          onClick={() => onValueChange(value)}
          className={cn(
            'flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180',
            className
          )}
          {...props}
        >
          {children}
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
        </button>
      </div>
    );
  }
);
AccordionTrigger.displayName = 'AccordionTrigger';

interface AccordionContentProps extends React.HTMLAttributes<HTMLDivElement> {}

const AccordionContent = React.forwardRef<HTMLDivElement, AccordionContentProps>(
  ({ className, children, ...props }, ref) => {
    const itemContext = React.useContext(AccordionItemContext);
    const contentRef = React.useRef<HTMLDivElement>(null);
    const [height, setHeight] = React.useState<number | undefined>(undefined);

    if (!itemContext) {
      throw new Error('AccordionContent must be used within an AccordionItem');
    }

    const { isOpen } = itemContext;

    React.useEffect(() => {
      if (contentRef.current) {
        const resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            setHeight(entry.contentRect.height);
          }
        });
        resizeObserver.observe(contentRef.current);
        return () => resizeObserver.disconnect();
      }
    }, []);

    return (
      <div
        data-slot="accordion-content"
        data-state={isOpen ? 'open' : 'closed'}
        className="overflow-hidden text-sm transition-all duration-200 ease-out"
        style={{
          height: isOpen ? (height !== undefined ? `${height}px` : 'auto') : 0,
          opacity: isOpen ? 1 : 0,
        }}
        {...props}
      >
        <div ref={contentRef}>
          <div ref={ref} className={cn('pb-4 pt-0', className)}>
            {children}
          </div>
        </div>
      </div>
    );
  }
);
AccordionContent.displayName = 'AccordionContent';

// ============================================================================
// Card
// ============================================================================

interface CardProps extends React.ComponentProps<'div'> {
  gradient?: boolean;
}

function Card({ className, gradient = false, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        'bg-card text-card-foreground flex flex-col gap-1 rounded-xl border border-white/10 backdrop-blur-md py-6',
        // Premium layered shadow
        'shadow-[0_1px_2px_rgba(0,0,0,0.05),0_4px_6px_rgba(0,0,0,0.05),0_10px_20px_rgba(0,0,0,0.04)]',
        // Gradient border option
        gradient &&
          'relative before:absolute before:inset-0 before:rounded-xl before:p-[1px] before:bg-gradient-to-br before:from-white/20 before:to-transparent before:pointer-events-none before:-z-10',
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('leading-none font-semibold tracking-tight', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm leading-relaxed', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-6', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-3 px-6 [.border-t]:pt-6', className)}
      {...props}
    />
  );
}

// ============================================================================
// Breadcrumb
// ============================================================================

function Breadcrumb({ ...props }: React.ComponentProps<'nav'>) {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />;
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<'ol'>) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        'text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm break-words sm:gap-2.5',
        className
      )}
      {...props}
    />
  );
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn('inline-flex items-center gap-1.5', className)}
      {...props}
    />
  );
}

function BreadcrumbLink({
  asChild,
  className,
  ...props
}: React.ComponentProps<'a'> & {
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : 'a';

  return (
    <Comp
      data-slot="breadcrumb-link"
      className={cn('hover:text-foreground transition-colors', className)}
      {...props}
    />
  );
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn('text-foreground font-normal', className)}
      {...props}
    />
  );
}

function BreadcrumbSeparator({ children, className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn('[&>svg]:size-3.5', className)}
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  );
}

function BreadcrumbEllipsis({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn('flex size-9 items-center justify-center', className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">More</span>
    </span>
  );
}

// ============================================================================
// ScrollArea
// ============================================================================

// Type-safe wrappers for Radix UI primitives (React 19 compatibility)
const ScrollAreaRootPrimitive = ScrollAreaPrimitive.Root as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
>;

const ScrollAreaViewportPrimitive = ScrollAreaPrimitive.Viewport as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Viewport> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
>;

const ScrollAreaScrollbarPrimitive =
  ScrollAreaPrimitive.Scrollbar as React.ForwardRefExoticComponent<
    React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Scrollbar> & {
      children?: React.ReactNode;
      className?: string;
    } & React.RefAttributes<HTMLDivElement>
  >;

const ScrollAreaThumbPrimitive = ScrollAreaPrimitive.Thumb as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Thumb> & {
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
>;

const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaRootPrimitive
    ref={ref}
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    <ScrollAreaViewportPrimitive className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaViewportPrimitive>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaRootPrimitive>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Scrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaScrollbarPrimitive
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors',
      orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
      orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
      className
    )}
    {...props}
  >
    <ScrollAreaThumbPrimitive className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaScrollbarPrimitive>
));
ScrollBar.displayName = ScrollAreaPrimitive.Scrollbar.displayName;

// ============================================================================
// Tabs
// ============================================================================

// Type-safe wrappers for Radix UI primitives (React 19 compatibility)
const TabsRootPrimitive = TabsPrimitive.Root as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
>;

const TabsListPrimitive = TabsPrimitive.List as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
>;

const TabsTriggerPrimitive = TabsPrimitive.Trigger as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLButtonElement>
>;

const TabsContentPrimitive = TabsPrimitive.Content as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
>;

function Tabs({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsRootPrimitive data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props}>
      {children}
    </TabsRootPrimitive>
  );
}

function TabsList({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsListPrimitive
      data-slot="tabs-list"
      className={cn(
        'bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px] border border-border',
        className
      )}
      {...props}
    >
      {children}
    </TabsListPrimitive>
  );
}

function TabsTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsTriggerPrimitive
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-all duration-200 cursor-pointer',
        'text-foreground/70 hover:text-foreground hover:bg-accent',
        'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:border-primary/50',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:outline-1',
        'disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
    </TabsTriggerPrimitive>
  );
}

function TabsContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content> & {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsContentPrimitive
      data-slot="tabs-content"
      className={cn('flex-1 outline-none', className)}
      {...props}
    >
      {children}
    </TabsContentPrimitive>
  );
}

// ============================================================================
// Badge
// ============================================================================

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 shadow-sm',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-white hover:bg-destructive/90',
        outline: 'text-foreground border-border bg-background/50 backdrop-blur-sm',
        // Semantic status variants using CSS variables
        success:
          'border-transparent bg-[var(--status-success-bg)] text-[var(--status-success)] border border-[var(--status-success)]/30',
        warning:
          'border-transparent bg-[var(--status-warning-bg)] text-[var(--status-warning)] border border-[var(--status-warning)]/30',
        error:
          'border-transparent bg-[var(--status-error-bg)] text-[var(--status-error)] border border-[var(--status-error)]/30',
        info: 'border-transparent bg-[var(--status-info-bg)] text-[var(--status-info)] border border-[var(--status-info)]/30',
        // Muted variants for subtle indication
        muted: 'border-border/50 bg-muted/50 text-muted-foreground',
        brand: 'border-transparent bg-brand-500/15 text-brand-500 border border-brand-500/30',
      },
      size: {
        default: 'px-2.5 py-0.5 text-xs',
        sm: 'px-2 py-0.5 text-[10px]',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

// ============================================================================
// Kbd
// ============================================================================

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'bg-muted text-muted-foreground pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm px-1 font-sans text-xs font-medium select-none',
        "[&_svg:not([class*='size-'])]:size-3",
        'in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10',
        className
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="kbd-group"
      className={cn('inline-flex items-center gap-1', className)}
      {...props}
    />
  );
}

export {
  // Accordion
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  // Card
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  // Breadcrumb
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
  // ScrollArea
  ScrollArea,
  ScrollBar,
  // Tabs
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  // Badge
  Badge,
  badgeVariants,
  // Kbd
  Kbd,
  KbdGroup,
};
