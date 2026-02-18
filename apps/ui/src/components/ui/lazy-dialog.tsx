import { Component, ErrorInfo, ReactNode, Suspense, lazy, ComponentType } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent } from './dialog';
import { Button } from './button';

// ---------------------------------------------------------------------------
// DialogErrorBoundary – catches render / chunk-load errors inside a dialog
// ---------------------------------------------------------------------------

interface DialogErrorBoundaryProps {
  children: ReactNode;
  /** Called when the user clicks "Close" on the error UI */
  onClose?: () => void;
}

interface DialogErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary designed for dialog content.
 * Catches chunk load failures and render errors, displaying a
 * recoverable error UI inside the dialog rather than crashing the app.
 */
export class DialogErrorBoundary extends Component<
  DialogErrorBoundaryProps,
  DialogErrorBoundaryState
> {
  constructor(props: DialogErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): DialogErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[DialogErrorBoundary] Dialog component error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.message?.includes('Failed to fetch') ||
        this.state.error?.message?.includes('Loading chunk') ||
        this.state.error?.message?.includes('dynamically imported module');

      return (
        <div className="flex flex-col items-center justify-center text-center p-6 min-h-[200px] gap-4">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">
              {isChunkError ? 'Failed to Load' : 'Something Went Wrong'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {isChunkError
                ? 'The dialog could not be loaded. Please check your connection and try again.'
                : 'An unexpected error occurred while loading this dialog.'}
            </p>
          </div>
          {this.state.error && (
            <details className="text-xs text-muted-foreground max-w-md">
              <summary className="cursor-pointer hover:text-foreground">Technical details</summary>
              <pre className="mt-2 p-2 bg-muted/50 rounded text-left overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            </details>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={this.handleRetry} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Retry
            </Button>
            {this.props.onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={this.props.onClose}
                className="text-muted-foreground"
              >
                Close
              </Button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// DialogLoadingFallback – spinner shown while the lazy chunk loads
// ---------------------------------------------------------------------------

interface DialogLoadingFallbackProps {
  /** Optional message below the spinner */
  message?: string;
}

function DialogLoadingFallback({ message = 'Loading...' }: DialogLoadingFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] p-6">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      {message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LazyDialog – wraps a lazily-imported dialog with Suspense + ErrorBoundary
// ---------------------------------------------------------------------------

/**
 * Props that every lazy-loaded dialog component must accept.
 */
export interface LazyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LazyDialogWrapperProps<P extends LazyDialogProps> extends LazyDialogProps {
  /** Additional props forwarded to the lazy-loaded dialog component */
  componentProps?: Omit<P, keyof LazyDialogProps>;
  /** Loading message displayed while the dialog chunk is being fetched */
  loadingMessage?: string;
  /** Additional className for the fallback DialogContent */
  className?: string;
}

/**
 * Creates a lazy-loaded dialog component wrapped with Suspense and DialogErrorBoundary.
 *
 * The outer `<Dialog>` shell renders immediately (so the overlay + open/close
 * animation work normally) while the inner content lazy-loads.
 *
 * @example
 * ```tsx
 * // 1. Create the lazy dialog
 * const LazySettingsDialog = lazyDialog(
 *   () => import('./settings-dialog'),
 *   'SettingsDialog',
 * );
 *
 * // 2. Use it like a normal dialog
 * <LazySettingsDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   componentProps={{ projectId: '123' }}
 * />
 * ```
 */
export function lazyDialog<
  P extends LazyDialogProps,
  T extends Record<string, unknown> = Record<string, unknown>,
>(importFn: () => Promise<T>, exportName: keyof T) {
  const LazyComponent = lazy(() =>
    importFn().then((module) => ({
      default: module[exportName] as ComponentType<P>,
    }))
  );

  function LazyDialogWrapper({
    open,
    onOpenChange,
    componentProps,
    loadingMessage,
    className,
  }: LazyDialogWrapperProps<P>) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={className} showCloseButton>
          <DialogErrorBoundary onClose={() => onOpenChange(false)}>
            <Suspense fallback={<DialogLoadingFallback message={loadingMessage} />}>
              <LazyComponent {...({ open, onOpenChange, ...componentProps } as unknown as P)} />
            </Suspense>
          </DialogErrorBoundary>
        </DialogContent>
      </Dialog>
    );
  }

  LazyDialogWrapper.displayName = `LazyDialog(${String(exportName)})`;

  return LazyDialogWrapper;
}

/**
 * Creates a lazy-loaded dialog where the inner component manages its own
 * `<Dialog>` / `<DialogContent>` shell. The wrapper only provides the
 * error boundary + Suspense – no extra `<Dialog>` is rendered around it.
 *
 * Use this variant when the lazy component already renders `<Dialog>` internally
 * (which is the case for most existing dialogs in the codebase).
 *
 * @example
 * ```tsx
 * const LazyAddFeatureDialog = lazyDialogPassthrough(
 *   () => import('../dialogs/add-feature-dialog'),
 *   'AddFeatureDialog',
 * );
 *
 * <LazyAddFeatureDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   componentProps={{ onSubmit: handleSubmit }}
 * />
 * ```
 */
export function lazyDialogPassthrough<
  P extends LazyDialogProps,
  T extends Record<string, unknown> = Record<string, unknown>,
>(importFn: () => Promise<T>, exportName: keyof T) {
  const LazyComponent = lazy(() =>
    importFn().then((module) => ({
      default: module[exportName] as ComponentType<P>,
    }))
  );

  function LazyDialogPassthroughWrapper({
    open,
    onOpenChange,
    componentProps,
    loadingMessage,
  }: LazyDialogWrapperProps<P>) {
    // When not open, don't render anything – avoids loading the chunk
    // until the dialog is actually needed.
    if (!open) return null;

    return (
      <DialogErrorBoundary onClose={() => onOpenChange(false)}>
        <Suspense
          fallback={
            <Dialog open onOpenChange={onOpenChange}>
              <DialogContent showCloseButton>
                <DialogLoadingFallback message={loadingMessage} />
              </DialogContent>
            </Dialog>
          }
        >
          <LazyComponent {...({ open, onOpenChange, ...componentProps } as unknown as P)} />
        </Suspense>
      </DialogErrorBoundary>
    );
  }

  LazyDialogPassthroughWrapper.displayName = `LazyDialogPassthrough(${String(exportName)})`;

  return LazyDialogPassthroughWrapper;
}
