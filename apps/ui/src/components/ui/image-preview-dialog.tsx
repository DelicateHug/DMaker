import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { LazyImage } from '@/components/ui/lazy-image';

interface ImagePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  imageAlt: string;
  imageFilename?: string;
}

export function ImagePreviewDialog({
  open,
  onOpenChange,
  imageSrc,
  imageAlt,
  imageFilename,
}: ImagePreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-4">
        <DialogHeader className="mb-4">
          <DialogTitle>{imageFilename || 'Image Preview'}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center overflow-auto max-h-[calc(90vh-8rem)]">
          <LazyImage
            src={imageSrc}
            alt={imageAlt}
            className={cn('max-w-full max-h-full object-contain', 'rounded-md')}
            containerClassName="max-w-full max-h-full"
            errorIconSize="w-8 h-8"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
