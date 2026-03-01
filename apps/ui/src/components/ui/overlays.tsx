import * as React from 'react';
import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Command as CommandPrimitive } from 'cmdk';
import { XIcon, SearchIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/feedback';

// ============================================================================
// Dialog
// ============================================================================

// Type-safe wrappers for Radix UI primitives (React 19 compatibility)
const DialogContentPrimitive = DialogPrimitive.Content as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
>;

const DialogClosePrimitive = DialogPrimitive.Close as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLButtonElement>
>;

const DialogTitlePrimitive = DialogPrimitive.Title as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLHeadingElement>
>;

const DialogDescriptionPrimitive = DialogPrimitive.Description as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> & {
    children?: React.ReactNode;
    className?: string;
    title?: string;
  } & React.RefAttributes<HTMLParagraphElement>
>;

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

const DialogOverlayPrimitive = DialogPrimitive.Overlay as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & {
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
>;

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay> & {
  className?: string;
}) {
  return (
    <DialogOverlayPrimitive
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'duration-200',
        className
      )}
      {...props}
    />
  );
}

export type DialogContentProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Content>,
  'ref'
> & {
  showCloseButton?: boolean;
  compact?: boolean;
};

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, showCloseButton = true, compact = false, ...props }, ref) => {
    // Check if className contains a custom max-width
    const hasCustomMaxWidth = typeof className === 'string' && className.includes('max-w-');

    return (
      <DialogPortal data-slot="dialog-portal">
        <DialogOverlay />
        <DialogContentPrimitive
          ref={ref}
          data-slot="dialog-content"
          className={cn(
            'fixed top-[50%] left-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
            'flex flex-col w-full max-w-[calc(100%-2rem)] max-h-[calc(100vh-4rem)]',
            'bg-card border border-border rounded-xl shadow-2xl',
            // Premium shadow
            'shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]',
            // Animations - smoother with scale
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-top-[2%] data-[state=open]:slide-in-from-top-[2%]',
            'duration-200',
            compact ? 'max-w-4xl p-4' : !hasCustomMaxWidth ? 'sm:max-w-2xl p-6' : 'p-6',
            className
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogClosePrimitive
              data-slot="dialog-close"
              className={cn(
                'absolute rounded-lg opacity-60 transition-all duration-200 cursor-pointer',
                'hover:opacity-100 hover:bg-muted',
                'focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none',
                'disabled:pointer-events-none disabled:cursor-not-allowed',
                '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4',
                'p-1.5',
                compact ? 'top-2 right-3' : 'top-4 right-4'
              )}
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogClosePrimitive>
          )}
        </DialogContentPrimitive>
      </DialogPortal>
    );
  }
);

DialogContent.displayName = 'DialogContent';

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-6', className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title> & {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogTitlePrimitive
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold tracking-tight', className)}
      {...props}
    >
      {children}
    </DialogTitlePrimitive>
  );
}

function DialogDescription({
  className,
  children,
  title,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description> & {
  children?: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <DialogDescriptionPrimitive
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm leading-relaxed', className)}
      title={title}
      {...props}
    >
      {children}
    </DialogDescriptionPrimitive>
  );
}

// ============================================================================
// Sheet
// ============================================================================

/* eslint-disable @typescript-eslint/no-empty-object-type */

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

interface SheetOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  forceMount?: true;
}

const SheetOverlay = ({ className, ...props }: SheetOverlayProps) => {
  const Overlay = SheetPrimitive.Overlay as React.ComponentType<
    SheetOverlayProps & { 'data-slot': string }
  >;
  return (
    <Overlay
      data-slot="sheet-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50',
        className
      )}
      {...props}
    />
  );
};

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: 'top' | 'right' | 'bottom' | 'left';
  forceMount?: true;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: PointerEvent) => void;
  onInteractOutside?: (event: Event) => void;
}

const SheetContent = ({ className, children, side = 'right', ...props }: SheetContentProps) => {
  const Content = SheetPrimitive.Content as React.ComponentType<
    SheetContentProps & { 'data-slot': string }
  >;
  const Close = SheetPrimitive.Close as React.ComponentType<{
    className: string;
    children: React.ReactNode;
  }>;

  return (
    <SheetPortal>
      <SheetOverlay />
      <Content
        data-slot="sheet-content"
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
          side === 'right' &&
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
          side === 'left' &&
            'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
          side === 'top' &&
            'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b',
          side === 'bottom' &&
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t',
          className
        )}
        {...props}
      >
        {children}
        <Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </Close>
      </Content>
    </SheetPortal>
  );
};

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1.5 p-4', className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  );
}

interface SheetTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

const SheetTitle = ({ className, ...props }: SheetTitleProps) => {
  const Title = SheetPrimitive.Title as React.ComponentType<
    SheetTitleProps & { 'data-slot': string }
  >;
  return (
    <Title
      data-slot="sheet-title"
      className={cn('text-foreground font-semibold', className)}
      {...props}
    />
  );
};

interface SheetDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

const SheetDescription = ({ className, ...props }: SheetDescriptionProps) => {
  const Description = SheetPrimitive.Description as React.ComponentType<
    SheetDescriptionProps & { 'data-slot': string }
  >;
  return (
    <Description
      data-slot="sheet-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
};

// ============================================================================
// Popover
// ============================================================================

// Type-safe wrappers for Radix UI primitives (React 19 compatibility)
const PopoverTriggerPrimitive = PopoverPrimitive.Trigger as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger> & {
    children?: React.ReactNode;
    asChild?: boolean;
  } & React.RefAttributes<HTMLButtonElement>
>;

const PopoverContentPrimitive = PopoverPrimitive.Content as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
>;

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  children,
  asChild,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger> & {
  children?: React.ReactNode;
  asChild?: boolean;
}) {
  return (
    <PopoverTriggerPrimitive data-slot="popover-trigger" asChild={asChild} {...props}>
      {children}
    </PopoverTriggerPrimitive>
  );
}

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  className?: string;
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverContentPrimitive
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden',
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

// ============================================================================
// Tooltip
// ============================================================================

// Type-safe wrappers for Radix UI primitives (React 19 compatibility)
const TooltipTriggerPrimitive = TooltipPrimitive.Trigger as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger> & {
    children?: React.ReactNode;
    asChild?: boolean;
  } & React.RefAttributes<HTMLButtonElement>
>;

const TooltipContentPrimitive = TooltipPrimitive.Content as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
>;

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

function TooltipTrigger({
  children,
  asChild,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger> & {
  children?: React.ReactNode;
  asChild?: boolean;
}) {
  return (
    <TooltipTriggerPrimitive asChild={asChild} {...props}>
      {children}
    </TooltipTriggerPrimitive>
  );
}

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
    className?: string;
  }
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipContentPrimitive
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-lg border border-border bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground',
        // Premium shadow
        'shadow-lg shadow-black/10',
        // Faster, snappier animations
        'animate-in fade-in-0 zoom-in-95 duration-150',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-100',
        // Slide from edge
        'data-[side=bottom]:slide-in-from-top-1',
        'data-[side=left]:slide-in-from-right-1',
        'data-[side=right]:slide-in-from-left-1',
        'data-[side=top]:slide-in-from-bottom-1',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// ============================================================================
// Command
// ============================================================================

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        'bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md',
        className
      )}
      {...props}
    />
  );
}

function CommandDialog({
  title = 'Command Palette',
  description = 'Search for a command to run...',
  children,
  className,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn('overflow-hidden p-0', className)}
        showCloseButton={showCloseButton}
      >
        <Command className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="flex h-9 items-center gap-2 border-b px-3">
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          'placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        'max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto',
        // Mobile touch scrolling support
        'touch-pan-y overscroll-contain',
        // iOS Safari momentum scrolling
        '[&]:[-webkit-overflow-scrolling:touch]',
        className
      )}
      {...props}
    />
  );
}

function CommandEmpty({ ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm"
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        'text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium',
        className
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn('bg-border -mx-1 h-px', className)}
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn('text-muted-foreground ml-auto text-xs tracking-widest', className)}
      {...props}
    />
  );
}

// ============================================================================
// ConfirmDialog
// ============================================================================

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  /** Optional icon to show in the title */
  icon?: LucideIcon;
  /** Icon color class. Defaults to "text-primary" */
  iconClassName?: string;
  /** Optional content to show between description and buttons */
  children?: ReactNode;
  /** Text for the confirm button. Defaults to "Confirm" */
  confirmText?: string;
  /** Text for the cancel button. Defaults to "Cancel" */
  cancelText?: string;
  /** Variant for the confirm button. Defaults to "default" */
  confirmVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
}

function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  icon: Icon,
  iconClassName = 'text-primary',
  children,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'default',
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {Icon && <Icon className={`w-5 h-5 ${iconClassName}`} />}
            {title}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>

        {children}

        <DialogFooter className="gap-2 sm:gap-2 pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="px-4">
            {cancelText}
          </Button>
          <HotkeyButton
            variant={confirmVariant}
            onClick={handleConfirm}
            hotkey={{ key: 'Enter', cmdCtrl: true }}
            hotkeyActive={open}
            className="px-4"
          >
            {Icon && <Icon className="w-4 h-4 mr-2" />}
            {confirmText}
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export {
  // Dialog
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  // Sheet
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  // Popover
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  // Tooltip
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  // Command
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
  // ConfirmDialog
  ConfirmDialog,
};
