import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, FolderMinus } from 'lucide-react';
import type { Project } from '@/lib/electron';

interface DeleteProjectDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSoftDelete: () => void;
  onHardDelete: () => void;
}

export function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
  onSoftDelete,
  onHardDelete,
}: DeleteProjectDialogProps) {
  const [confirmName, setConfirmName] = useState('');
  const isNameMatch = confirmName === project?.name;

  // Reset confirmation input when dialog opens/closes or project changes
  useEffect(() => {
    if (!open) {
      setConfirmName('');
    }
  }, [open]);

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="delete-project-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-5 h-5" />
            Delete Project
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3">
              <p>Are you sure you want to delete this project?</p>
              {/* Project name - selectable and copyable */}
              <div className="bg-muted rounded-md p-3 border border-border">
                <p
                  className="font-medium text-foreground select-text cursor-text break-all"
                  title="Select and press Ctrl+C to copy"
                >
                  {project.name}
                </p>
                <p className="text-xs text-muted-foreground mt-1 truncate">{project.path}</p>
              </div>
              <p className="text-sm">To confirm, type the project name below:</p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <Label htmlFor="confirm-project-name" className="sr-only">
            Project Name
          </Label>
          <Input
            id="confirm-project-name"
            placeholder={`Type "${project.name}" to confirm`}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            data-testid="confirm-project-name-input"
            autoComplete="off"
          />
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {/* Soft Delete - Remove from projects (move to trash) */}
          <Button
            variant="outline"
            onClick={onSoftDelete}
            disabled={!isNameMatch}
            className="w-full justify-start gap-2"
            data-testid="soft-delete-project-button"
          >
            <FolderMinus className="w-4 h-4" />
            Remove from Projects
            <span className="text-xs text-muted-foreground ml-auto">(can be restored)</span>
          </Button>

          {/* Hard Delete - Permanent deletion */}
          <Button
            variant="destructive"
            onClick={onHardDelete}
            disabled={!isNameMatch}
            className="w-full justify-start gap-2"
            data-testid="hard-delete-project-button"
          >
            <Trash2 className="w-4 h-4" />
            Delete Permanently
            <span className="text-xs ml-auto opacity-80">(cannot be undone)</span>
          </Button>

          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full"
            data-testid="cancel-delete-project-button"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
