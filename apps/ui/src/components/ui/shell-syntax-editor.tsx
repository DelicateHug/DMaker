import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ShellSyntaxEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  'data-testid'?: string;
}

const LazyShellSyntaxEditor = lazy(() => import('./shell-syntax-editor-impl'));

/**
 * Lazy-loaded shell syntax editor wrapper.
 * Defers loading of CodeMirror and its dependencies until the editor is rendered,
 * showing a lightweight placeholder during loading.
 */
export function ShellSyntaxEditor(props: ShellSyntaxEditorProps) {
  const { className, minHeight = '200px', 'data-testid': testId } = props;

  return (
    <Suspense
      fallback={
        <div
          className={cn(
            'w-full rounded-lg border border-border bg-muted/30 flex items-center justify-center',
            className
          )}
          style={{ minHeight }}
          data-testid={testId}
        >
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading editor...</span>
          </div>
        </div>
      }
    >
      <LazyShellSyntaxEditor {...props} />
    </Suspense>
  );
}
