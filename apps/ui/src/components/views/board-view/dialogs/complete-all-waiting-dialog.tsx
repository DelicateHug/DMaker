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
import { CheckCircle2 } from 'lucide-react';

interface CompleteAllWaitingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  waitingCount: number;
  onConfirm: () => void;
}

export function CompleteAllWaitingDialog({
  open,
  onOpenChange,
  waitingCount,
  onConfirm,
}: CompleteAllWaitingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="complete-all-waiting-dialog">
        <DialogHeader>
          <DialogTitle>Complete All Waiting Features</DialogTitle>
          <DialogDescription>
            Are you sure you want to complete all features that are waiting for approval? They will
            be moved to the completed list.
            {waitingCount > 0 && (
              <span className="block mt-2 text-yellow-500">
                {waitingCount} feature(s) will be completed.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="default" onClick={onConfirm} data-testid="confirm-complete-all-waiting">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Complete All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
