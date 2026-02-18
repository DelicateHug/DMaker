import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface XmlSyntaxEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  'data-testid'?: string;
}

const LazyXmlSyntaxEditor = lazy(() => import('./xml-syntax-editor-impl'));

/**
 * Lazy-loaded XML syntax editor wrapper.
 * Defers loading of CodeMirror and its dependencies until the editor is rendered,
 * showing a lightweight placeholder during loading.
 */
export function XmlSyntaxEditor(props: XmlSyntaxEditorProps) {
  const { className, 'data-testid': testId } = props;

  return (
    <Suspense
      fallback={
        <div
          className={cn('w-full h-full flex items-center justify-center', className)}
          data-testid={testId}
        >
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading editor...</span>
          </div>
        </div>
      }
    >
      <LazyXmlSyntaxEditor {...props} />
    </Suspense>
  );
}
