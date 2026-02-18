import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface JsonSyntaxEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  readOnly?: boolean;
  'data-testid'?: string;
}

const LazyJsonSyntaxEditor = lazy(() => import('./json-syntax-editor-impl'));

/**
 * Lazy-loaded JSON syntax editor wrapper.
 * Defers loading of CodeMirror and its dependencies until the editor is rendered,
 * showing a lightweight placeholder during loading.
 */
export function JsonSyntaxEditor(props: JsonSyntaxEditorProps) {
  const { className, minHeight = '300px', 'data-testid': testId } = props;

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
      <LazyJsonSyntaxEditor {...props} />
    </Suspense>
  );
}
