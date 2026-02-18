'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Play, GitBranch } from 'lucide-react';
import type { Feature } from '@/store/app-store';
import { truncateDescription } from '@/lib/utils';

interface BlockingDependency {
  id: string;
  title?: string;
  description: string;
  status: string;
}

interface UnsatisfiedDependenciesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: Feature | null;
  blockingDependencies: BlockingDependency[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function UnsatisfiedDependenciesDialog({
  open,
  onOpenChange,
  feature,
  blockingDependencies,
  onConfirm,
  onCancel,
}: UnsatisfiedDependenciesDialogProps) {
  if (!feature) return null;

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'backlog':
        return 'Backlog';
      case 'in_progress':
        return 'In Progress';
      case 'waiting_approval':
        return 'Waiting Approval';
      case 'failed':
        return 'Failed';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'backlog':
        return 'text-muted-foreground';
      case 'in_progress':
        return 'text-blue-500';
      case 'waiting_approval':
        return 'text-yellow-500';
      case 'failed':
        return 'text-red-500';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-popover border-border max-w-lg"
        data-testid="unsatisfied-dependencies-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Unsatisfied Dependencies
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            This feature has &quot;Wait for dependencies&quot; enabled, but some dependencies are
            not yet complete. Starting it now may cause issues.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Feature to start:</h4>
            <div className="p-3 rounded-md bg-muted/50 border border-border">
              <p className="text-sm">
                {feature.title || truncateDescription(feature.description, 60)}
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <GitBranch className="w-4 h-4" />
              Incomplete dependencies ({blockingDependencies.length}):
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {blockingDependencies.map((dep) => (
                <div
                  key={dep.id}
                  className="p-2 rounded-md bg-muted/30 border border-border flex items-center justify-between gap-2"
                >
                  <span className="text-sm truncate flex-1">
                    {dep.title || truncateDescription(dep.description, 40)}
                  </span>
                  <span className={`text-xs font-medium ${getStatusColor(dep.status)}`}>
                    {getStatusLabel(dep.status)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={handleCancel} data-testid="cancel-start-button">
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handleConfirm}
            data-testid="confirm-start-anyway-button"
          >
            <Play className="w-4 h-4 mr-2" />
            Start Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
