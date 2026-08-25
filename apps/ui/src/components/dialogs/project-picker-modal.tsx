import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays';
import { ProjectPicker } from '@/components/projects/project-picker';

interface ProjectPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Switch to (or create) a project without leaving the board. This is the only
 * way to reach the project list now that the `/dashboard` screen is gone.
 */
export function ProjectPickerModal({ open, onOpenChange }: ProjectPickerModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" data-testid="project-picker-modal">
        <DialogHeader>
          <DialogTitle>Projects</DialogTitle>
          <DialogDescription>Open a recent project, or start a new one.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <ProjectPicker compact onOpened={() => onOpenChange(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
