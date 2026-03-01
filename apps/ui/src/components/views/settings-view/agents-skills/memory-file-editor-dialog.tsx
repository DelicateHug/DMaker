/**
 * Memory File Editor Dialog - Create/Edit memory files with view/edit mode
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/overlays';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/forms';
import { Markdown } from '@/components/ui/markdown';
import { Pencil, Eye, Save, Loader2 } from 'lucide-react';
import type { MemoryFile } from './hooks/use-memory-files';

interface MemoryFileEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file?: MemoryFile | null;
  initialContent?: string;
  onSave: (name: string, content: string, description?: string) => Promise<boolean>;
}

export function MemoryFileEditorDialog({
  open,
  onOpenChange,
  file,
  initialContent,
  onSave,
}: MemoryFileEditorDialogProps) {
  const isEditing = !!file;
  const [mode, setMode] = useState<'view' | 'edit'>('edit');
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (open) {
      if (file) {
        setName(file.name);
        setDescription(file.description || '');
        setContent(initialContent || '');
        setMode('view');
      } else {
        setName('');
        setDescription('');
        setContent('');
        setMode('edit');
      }
    }
  }, [open, file, initialContent]);

  const handleSave = async () => {
    if (!name.trim() || !content.trim()) return;

    setIsSaving(true);
    const success = await onSave(name.trim(), content.trim(), description.trim() || undefined);
    setIsSaving(false);

    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{isEditing ? `Memory: ${file.name}` : 'New Memory File'}</DialogTitle>
            {isEditing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}
                className="gap-1.5"
              >
                {mode === 'view' ? (
                  <>
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" /> View
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {mode === 'view' ? (
            <div className="space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  File Name
                </Label>
                <p className="text-sm font-medium mt-1">{name}</p>
              </div>
              {description && (
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Description
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">{description}</p>
                </div>
              )}
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Content
                </Label>
                <div className="mt-2 rounded-lg border border-border/30 bg-muted/30 p-4 overflow-auto max-h-80">
                  <Markdown className="text-sm prose-sm">{content}</Markdown>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* File Name */}
              <div>
                <Label htmlFor="memory-filename">File Name</Label>
                <input
                  id="memory-filename"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="authentication-decisions.md"
                  disabled={isEditing}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                />
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="memory-description">
                  Description <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <input
                  id="memory-description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this memory file is about..."
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Content */}
              <div>
                <Label htmlFor="memory-content">Content</Label>
                <textarea
                  id="memory-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Enter learnings, decisions, patterns, or gotchas for AI agents to remember..."
                  rows={14}
                  className="mt-1 w-full px-3 py-2 text-sm font-mono rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                />
              </div>
            </div>
          )}
        </div>

        {mode === 'edit' && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !name.trim() || !content.trim()}
              className="gap-1.5"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
