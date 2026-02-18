import { CircleDot, RefreshCw } from 'lucide-react';
import { Button } from './button';

interface ErrorStateProps {
  /** Error message to display */
  error: string;
  /** Title for the error state (default: "Failed to Load") */
  title?: string;
  /** Callback when retry button is clicked */
  onRetry?: () => void;
  /** Text for the retry button (default: "Try Again") */
  retryText?: string;
  /** Optional detailed error info (e.g. stack trace) shown in a collapsible section */
  errorDetails?: string;
}

export function ErrorState({
  error,
  title = 'Failed to Load',
  onRetry,
  retryText = 'Try Again',
  errorDetails,
}: ErrorStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
      <div className="p-4 rounded-full bg-destructive/10 mb-4">
        <CircleDot className="h-12 w-12 text-destructive" />
      </div>
      <h2 className="text-lg font-medium mb-2">{title}</h2>
      <p className="text-muted-foreground max-w-md mb-4">{error}</p>
      {errorDetails && (
        <details className="max-w-2xl w-full mb-4 text-left">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            Show error details
          </summary>
          <pre className="mt-2 p-3 rounded-md bg-muted text-xs text-muted-foreground overflow-auto max-h-64 whitespace-pre-wrap break-words">
            {errorDetails}
          </pre>
        </details>
      )}
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {retryText}
        </Button>
      )}
    </div>
  );
}
