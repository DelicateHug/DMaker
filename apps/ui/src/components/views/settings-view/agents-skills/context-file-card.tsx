/**
 * Context File Card - Display card for a single context file with actions
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/forms';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Pencil,
  MoreVertical,
  Trash2,
  Type,
} from 'lucide-react';
import type { ContextFile } from './hooks/use-context-files';

interface ContextFileCardProps {
  file: ContextFile;
  onEdit: (file: ContextFile) => void;
  onDelete: (file: ContextFile) => void;
  onRename: (file: ContextFile) => void;
  onToggleEnabled: (file: ContextFile, enabled: boolean) => void;
  loadFileContent: (file: ContextFile) => Promise<string>;
}

export function ContextFileCard({
  file,
  onEdit,
  onDelete,
  onRename,
  onToggleEnabled,
  loadFileContent,
}: ContextFileCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const handleToggleExpand = useCallback(
    async (open: boolean) => {
      setIsExpanded(open);
      if (open && previewContent === null) {
        setIsLoadingPreview(true);
        const content = await loadFileContent(file);
        setPreviewContent(content);
        setIsLoadingPreview(false);
      }
    },
    [file, previewContent, loadFileContent]
  );

  return (
    <Collapsible open={isExpanded} onOpenChange={handleToggleExpand}>
      <div
        className={cn(
          'rounded-xl border transition-all duration-200',
          'border-border/50 bg-accent/20',
          'hover:bg-accent/30 hover:border-border/70',
          !file.enabled && 'opacity-50'
        )}
      >
        {/* Main Card Content */}
        <div className="flex items-start gap-3 p-4">
          {/* File Icon */}
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
            <FileText className="w-4 h-4 text-amber-500" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm">{file.name}</h4>
            {file.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{file.description}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <Switch
              checked={file.enabled}
              onCheckedChange={(checked) => onToggleEnabled(file, checked)}
              className="scale-75"
              title={file.enabled ? 'Disable context file' : 'Enable context file'}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(file)}
              className="h-8 w-8 p-0"
              title="Edit file"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="More actions">
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onRename(file)}>
                  <Type className="w-4 h-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(file)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Expand Button */}
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  'hover:bg-muted/50 text-muted-foreground hover:text-foreground',
                  'cursor-pointer'
                )}
                title={isExpanded ? 'Hide content' : 'Preview content'}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </CollapsibleTrigger>
          </div>
        </div>

        {/* Expandable Preview */}
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0">
            <div className="ml-12 rounded-lg border border-border/30 bg-muted/30 p-4 overflow-auto max-h-64">
              {isLoadingPreview ? (
                <p className="text-xs text-muted-foreground">Loading...</p>
              ) : (
                <Markdown className="text-xs prose-sm">{previewContent || ''}</Markdown>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
