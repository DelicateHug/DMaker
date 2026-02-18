import { useState } from 'react';
import { X, FileText } from 'lucide-react';
import type { ImageAttachment, TextFileAttachment } from '@/store/app-store';
import { formatFileSize } from '@/lib/image-utils';
import { ImagePreviewDialog } from '@/components/ui/image-preview-dialog';
import { LazyImage } from '@/components/ui/lazy-image';

interface FilePreviewProps {
  selectedImages: ImageAttachment[];
  selectedTextFiles: TextFileAttachment[];
  isProcessing: boolean;
  onRemoveImage: (imageId: string) => void;
  onRemoveTextFile: (fileId: string) => void;
  onClearAll: () => void;
}

export function FilePreview({
  selectedImages,
  selectedTextFiles,
  isProcessing,
  onRemoveImage,
  onRemoveTextFile,
  onClearAll,
}: FilePreviewProps) {
  const totalFiles = selectedImages.length + selectedTextFiles.length;
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewImageSrc, setPreviewImageSrc] = useState('');
  const [previewImageAlt, setPreviewImageAlt] = useState('');
  const [previewImageFilename, setPreviewImageFilename] = useState('');

  const handleImageClick = (image: ImageAttachment) => {
    setPreviewImageSrc(image.data);
    setPreviewImageAlt(image.filename);
    setPreviewImageFilename(image.filename);
    setPreviewDialogOpen(true);
  };

  if (totalFiles === 0) {
    return null;
  }

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">
          {totalFiles} file{totalFiles > 1 ? 's' : ''} attached
        </p>
        <button
          onClick={onClearAll}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear all
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Image attachments */}
        {selectedImages.map((image) => (
          <div
            key={image.id}
            className="group relative rounded-lg border border-border bg-muted/30 p-2 flex items-center gap-2 hover:border-primary/30 transition-colors"
          >
            {/* Image thumbnail */}
            <div
              className="w-8 h-8 rounded-md overflow-hidden bg-muted flex-shrink-0 cursor-pointer"
              onClick={() => handleImageClick(image)}
            >
              <LazyImage
                src={image.data}
                alt={image.filename}
                className="w-full h-full object-cover"
                containerClassName="w-full h-full"
                errorIconSize="w-3 h-3"
              />
            </div>
            {/* Image info */}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate max-w-24">
                {image.filename}
              </p>
              {image.size !== undefined && (
                <p className="text-[10px] text-muted-foreground">{formatFileSize(image.size)}</p>
              )}
            </div>
            {/* Remove button */}
            {image.id && (
              <button
                onClick={() => onRemoveImage(image.id!)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                disabled={isProcessing}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {/* Text file attachments */}
        {selectedTextFiles.map((file) => (
          <div
            key={file.id}
            className="group relative rounded-lg border border-border bg-muted/30 p-2 flex items-center gap-2 hover:border-primary/30 transition-colors"
          >
            {/* File icon */}
            <div className="w-8 h-8 rounded-md bg-muted flex-shrink-0 flex items-center justify-center">
              <FileText className="w-4 h-4 text-muted-foreground" />
            </div>
            {/* File info */}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate max-w-24">
                {file.filename}
              </p>
              <p className="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</p>
            </div>
            {/* Remove button */}
            <button
              onClick={() => onRemoveTextFile(file.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              disabled={isProcessing}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Image preview dialog */}
      <ImagePreviewDialog
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        imageSrc={previewImageSrc}
        imageAlt={previewImageAlt}
        imageFilename={previewImageFilename}
      />
    </div>
  );
}
