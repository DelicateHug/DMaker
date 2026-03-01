import { useState, useRef, useCallback, useEffect } from 'react';
import { X, FileText, Send, Paperclip, Square, ListOrdered } from 'lucide-react';
import { ImageDropZone } from '@/components/ui/image-drop-zone';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/forms';
import { ImagePreviewDialog } from '@/components/ui/image-preview-dialog';
import { LazyImage } from '@/components/ui/lazy-image';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/image-utils';
import type { ImageAttachment, TextFileAttachment } from '@/store/app-store';
import type { PhaseModelEntry } from '@dmaker/types';
import { AgentModelSelector } from './agent-shared';

// --- QueueDisplay ---

interface QueueItem {
  id: string;
  message: string;
  imagePaths?: string[];
}

interface QueueDisplayProps {
  serverQueue: QueueItem[];
  onRemoveFromQueue: (id: string) => void;
  onClearQueue: () => void;
}

export function QueueDisplay({ serverQueue, onRemoveFromQueue, onClearQueue }: QueueDisplayProps) {
  if (serverQueue.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          {serverQueue.length} prompt{serverQueue.length > 1 ? 's' : ''} queued
        </p>
        <button
          onClick={onClearQueue}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear all
        </button>
      </div>
      <div className="space-y-1.5">
        {serverQueue.map((item, index) => (
          <div
            key={item.id}
            className="group flex items-center gap-2 text-sm bg-muted/50 rounded-lg px-3 py-2 border border-border"
          >
            <span className="text-xs text-muted-foreground font-medium min-w-[1.5rem]">
              {index + 1}.
            </span>
            <span className="flex-1 truncate text-foreground">{item.message}</span>
            {item.imagePaths && item.imagePaths.length > 0 && (
              <span className="text-xs text-muted-foreground">
                +{item.imagePaths.length} file{item.imagePaths.length > 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={() => onRemoveFromQueue(item.id)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-all"
              title="Remove from queue"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- FilePreview ---

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
        {selectedImages.map((image) => (
          <div
            key={image.id}
            className="group relative rounded-lg border border-border bg-muted/30 p-2 flex items-center gap-2 hover:border-primary/30 transition-colors"
          >
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
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate max-w-24">
                {image.filename}
              </p>
              {image.size !== undefined && (
                <p className="text-[10px] text-muted-foreground">{formatFileSize(image.size)}</p>
              )}
            </div>
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
        {selectedTextFiles.map((file) => (
          <div
            key={file.id}
            className="group relative rounded-lg border border-border bg-muted/30 p-2 flex items-center gap-2 hover:border-primary/30 transition-colors"
          >
            <div className="w-8 h-8 rounded-md bg-muted flex-shrink-0 flex items-center justify-center">
              <FileText className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate max-w-24">
                {file.filename}
              </p>
              <p className="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</p>
            </div>
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

// --- InputControls ---

interface InputControlsProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onToggleImageDropZone: () => void;
  onPaste: (e: React.ClipboardEvent) => Promise<void>;
  modelSelection: PhaseModelEntry;
  onModelSelect: (entry: PhaseModelEntry) => void;
  isProcessing: boolean;
  isConnected: boolean;
  hasFiles: boolean;
  isDragOver: boolean;
  showImageDropZone: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => Promise<void>;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function InputControls({
  input,
  onInputChange,
  onSend,
  onStop,
  onToggleImageDropZone,
  onPaste,
  modelSelection,
  onModelSelect,
  isProcessing,
  isConnected,
  hasFiles,
  isDragOver,
  showImageDropZone,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  inputRef: externalInputRef,
}: InputControlsProps) {
  const internalInputRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = externalInputRef || internalInputRef;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [inputRef]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  const canSend = (input.trim() || hasFiles) && isConnected;

  return (
    <>
      <div
        className={cn(
          'flex flex-col gap-2 transition-all duration-200 rounded-xl p-1',
          isDragOver && 'bg-primary/5 ring-2 ring-primary/30'
        )}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div className="relative w-full">
          <Textarea
            ref={inputRef}
            placeholder={
              isDragOver
                ? 'Drop your files here...'
                : isProcessing
                  ? 'Type to queue another prompt...'
                  : 'Describe what you want to build...'
            }
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={onPaste}
            disabled={!isConnected}
            data-testid="agent-input"
            rows={1}
            className={cn(
              'min-h-11 w-full bg-background border-border rounded-xl pl-4 pr-4 sm:pr-20 text-sm transition-all resize-none max-h-36 overflow-y-auto py-2.5',
              'focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
              hasFiles && 'border-primary/30',
              isDragOver && 'border-primary bg-primary/5'
            )}
          />
          {hasFiles && !isDragOver && (
            <div className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-medium">
              files attached
            </div>
          )}
          {isDragOver && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-primary font-medium">
              <Paperclip className="w-3 h-3" />
              Drop here
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <AgentModelSelector
            value={modelSelection}
            onChange={onModelSelect}
            disabled={!isConnected}
          />

          <Button
            variant="outline"
            size="icon"
            onClick={onToggleImageDropZone}
            disabled={!isConnected}
            className={cn(
              'h-11 w-11 rounded-xl border-border shrink-0',
              showImageDropZone && 'bg-primary/10 text-primary border-primary/30',
              hasFiles && 'border-primary/30 text-primary'
            )}
            title="Attach files (images, .txt, .md)"
          >
            <Paperclip className="w-4 h-4" />
          </Button>

          <div className="flex-1" />

          {isProcessing && (
            <Button
              onClick={onStop}
              disabled={!isConnected}
              className="h-11 px-4 rounded-xl shrink-0"
              variant="destructive"
              data-testid="stop-agent"
              title="Stop generation"
            >
              <Square className="w-4 h-4 fill-current" />
            </Button>
          )}

          <Button
            onClick={onSend}
            disabled={!canSend}
            className="h-11 px-4 rounded-xl shrink-0"
            variant={isProcessing ? 'outline' : 'default'}
            data-testid="send-message"
            title={isProcessing ? 'Add to queue' : 'Send message'}
          >
            {isProcessing ? <ListOrdered className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground mt-2 text-center hidden sm:block">
        Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-medium">Enter</kbd> to
        send,{' '}
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-medium">Shift+Enter</kbd>{' '}
        for new line
      </p>
    </>
  );
}

// --- AgentInputArea ---

interface AgentInputAreaProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  modelSelection: PhaseModelEntry;
  onModelSelect: (entry: PhaseModelEntry) => void;
  isProcessing: boolean;
  isConnected: boolean;
  selectedImages: ImageAttachment[];
  selectedTextFiles: TextFileAttachment[];
  showImageDropZone: boolean;
  isDragOver: boolean;
  onImagesSelected: (images: ImageAttachment[]) => void;
  onToggleImageDropZone: () => void;
  onRemoveImage: (imageId: string) => void;
  onRemoveTextFile: (fileId: string) => void;
  onClearAllFiles: () => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => Promise<void>;
  onPaste: (e: React.ClipboardEvent) => Promise<void>;
  serverQueue: QueueItem[];
  onRemoveFromQueue: (id: string) => void;
  onClearQueue: () => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function AgentInputArea({
  input,
  onInputChange,
  onSend,
  onStop,
  modelSelection,
  onModelSelect,
  isProcessing,
  isConnected,
  selectedImages,
  selectedTextFiles,
  showImageDropZone,
  isDragOver,
  onImagesSelected,
  onToggleImageDropZone,
  onRemoveImage,
  onRemoveTextFile,
  onClearAllFiles,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onPaste,
  serverQueue,
  onRemoveFromQueue,
  onClearQueue,
  inputRef,
}: AgentInputAreaProps) {
  const hasFiles = selectedImages.length > 0 || selectedTextFiles.length > 0;

  return (
    <div className="border-t border-border p-4 bg-card/50 backdrop-blur-sm">
      {showImageDropZone && (
        <ImageDropZone
          onImagesSelected={onImagesSelected}
          images={selectedImages}
          maxFiles={5}
          className="mb-4"
          disabled={!isConnected}
        />
      )}

      <QueueDisplay
        serverQueue={serverQueue}
        onRemoveFromQueue={onRemoveFromQueue}
        onClearQueue={onClearQueue}
      />

      {!showImageDropZone && (
        <FilePreview
          selectedImages={selectedImages}
          selectedTextFiles={selectedTextFiles}
          isProcessing={isProcessing}
          onRemoveImage={onRemoveImage}
          onRemoveTextFile={onRemoveTextFile}
          onClearAll={onClearAllFiles}
        />
      )}

      <InputControls
        input={input}
        onInputChange={onInputChange}
        onSend={onSend}
        onStop={onStop}
        onToggleImageDropZone={onToggleImageDropZone}
        onPaste={onPaste}
        modelSelection={modelSelection}
        onModelSelect={onModelSelect}
        isProcessing={isProcessing}
        isConnected={isConnected}
        hasFiles={hasFiles}
        isDragOver={isDragOver}
        showImageDropZone={showImageDropZone}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        inputRef={inputRef}
      />
    </div>
  );
}
