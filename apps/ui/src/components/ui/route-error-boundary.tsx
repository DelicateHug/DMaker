import { Component, ErrorInfo, ReactNode, Suspense, lazy } from 'react';
import { LoadingState } from './loading-state';
import { ErrorState } from './error-state';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary for lazy-loaded route components.
 * Catches chunk load failures and render errors, providing a retry mechanism.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[RouteErrorBoundary] Route component error:', {
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

      const errorMessage = this.state.error?.message || 'Unknown error';
      const errorStack = this.state.error?.stack;

      return (
        <ErrorState
          title={isChunkError ? 'Failed to Load Page' : 'Something Went Wrong'}
          error={
            isChunkError
              ? 'The page could not be loaded. Please check your connection and try again.'
              : `An unexpected error occurred while rendering this page: ${errorMessage}`
          }
          errorDetails={errorStack}
          onRetry={this.handleRetry}
          retryText="Retry"
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Creates a lazy-loaded route component wrapped with Suspense and RouteErrorBoundary.
 * Handles named exports by converting them to default exports for React.lazy.
 */
export function lazyRouteComponent<T extends Record<string, unknown>>(
  importFn: () => Promise<T>,
  exportName: keyof T
) {
  const LazyComponent = lazy(() =>
    importFn().then((module) => ({
      default: module[exportName] as React.ComponentType,
    }))
  );

  return function LazyRouteWrapper() {
    return (
      <RouteErrorBoundary>
        <Suspense fallback={<LoadingState message="Loading page..." />}>
          <LazyComponent />
        </Suspense>
      </RouteErrorBoundary>
    );
  };
}
