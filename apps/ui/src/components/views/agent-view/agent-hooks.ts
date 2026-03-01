import { useState, useCallback, useMemo } from 'react';
import { createLogger } from '@dmaker/utils/logger';
import type { ImageAttachment, TextFileAttachment } from '@/store/app-store';
import {
  useKeyboardShortcuts,
  useKeyboardShortcutsConfig,
  type KeyboardShortcut,
} from '@/hooks/use-keyboard-shortcuts';
import {
  fileToBase64,
  generateImageId,
  generateFileId,
  validateImageFile,
  validateTextFile,
  isTextFile,
  isImageFile,
  fileToText,
  getTextFileMimeType,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_FILES,
} from '@/lib/image-utils';

// --- useAgentShortcuts ---

interface UseAgentShortcutsOptions {
  currentProject: { path: string; name: string } | null;
  quickCreateSessionRef: React.MutableRefObject<(() => Promise<void>) | null>;
}

export function useAgentShortcuts({
  currentProject,
  quickCreateSessionRef,
}: UseAgentShortcutsOptions): void {
  const shortcuts = useKeyboardShortcutsConfig();

  const agentShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcutsList: KeyboardShortcut[] = [];

    if (currentProject) {
      shortcutsList.push({
        key: shortcuts.newSession,
        action: () => {
          if (quickCreateSessionRef.current) {
            quickCreateSessionRef.current();
          }
        },
        description: 'Create new session',
      });
    }

    return shortcutsList;
  }, [currentProject, shortcuts, quickCreateSessionRef]);

  useKeyboardShortcuts(agentShortcuts);
}

// --- useFileAttachments ---

const logger = createLogger('FileAttachments');

interface UseFileAttachmentsOptions {
  isProcessing: boolean;
  isConnected: boolean;
}

interface UseFileAttachmentsResult {
  selectedImages: ImageAttachment[];
  selectedTextFiles: TextFileAttachment[];
  showImageDropZone: boolean;
  isDragOver: boolean;
  handleImagesSelected: (images: ImageAttachment[]) => void;
  toggleImageDropZone: () => void;
  processDroppedFiles: (files: FileList) => Promise<void>;
  removeImage: (imageId: string) => void;
  removeTextFile: (fileId: string) => void;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => Promise<void>;
  handlePaste: (e: React.ClipboardEvent) => Promise<void>;
  clearAllFiles: () => void;
  setSelectedImages: React.Dispatch<React.SetStateAction<ImageAttachment[]>>;
  setSelectedTextFiles: React.Dispatch<React.SetStateAction<TextFileAttachment[]>>;
  setShowImageDropZone: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useFileAttachments({
  isProcessing,
  isConnected,
}: UseFileAttachmentsOptions): UseFileAttachmentsResult {
  const [selectedImages, setSelectedImages] = useState<ImageAttachment[]>([]);
  const [selectedTextFiles, setSelectedTextFiles] = useState<TextFileAttachment[]>([]);
  const [showImageDropZone, setShowImageDropZone] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleImagesSelected = useCallback((images: ImageAttachment[]) => {
    setSelectedImages(images);
  }, []);

  const toggleImageDropZone = useCallback(() => {
    setShowImageDropZone((prev) => !prev);
  }, []);

  const processDroppedFiles = useCallback(
    async (files: FileList) => {
      if (isProcessing) return;

      const newImages: ImageAttachment[] = [];
      const newTextFiles: TextFileAttachment[] = [];
      const errors: string[] = [];

      for (const file of Array.from(files)) {
        if (isTextFile(file)) {
          const validation = validateTextFile(file);
          if (!validation.isValid) {
            errors.push(validation.error!);
            continue;
          }

          const totalFiles =
            newImages.length +
            selectedImages.length +
            newTextFiles.length +
            selectedTextFiles.length;
          if (totalFiles >= DEFAULT_MAX_FILES) {
            errors.push(`Maximum ${DEFAULT_MAX_FILES} files allowed.`);
            break;
          }

          try {
            const content = await fileToText(file);
            const textFileAttachment: TextFileAttachment = {
              id: generateFileId(),
              content,
              mimeType: getTextFileMimeType(file.name),
              filename: file.name,
              size: file.size,
            };
            newTextFiles.push(textFileAttachment);
          } catch {
            errors.push(`${file.name}: Failed to read text file.`);
          }
        } else if (isImageFile(file)) {
          const validation = validateImageFile(file, DEFAULT_MAX_FILE_SIZE);
          if (!validation.isValid) {
            errors.push(validation.error!);
            continue;
          }

          const totalFiles =
            newImages.length +
            selectedImages.length +
            newTextFiles.length +
            selectedTextFiles.length;
          if (totalFiles >= DEFAULT_MAX_FILES) {
            errors.push(`Maximum ${DEFAULT_MAX_FILES} files allowed.`);
            break;
          }

          try {
            const base64 = await fileToBase64(file);
            const imageAttachment: ImageAttachment = {
              id: generateImageId(),
              data: base64,
              mimeType: file.type,
              filename: file.name,
              size: file.size,
            };
            newImages.push(imageAttachment);
          } catch {
            errors.push(`${file.name}: Failed to process image.`);
          }
        } else {
          errors.push(`${file.name}: Unsupported file type. Use images, .txt, or .md files.`);
        }
      }

      if (errors.length > 0) {
        logger.warn('File upload errors:', errors);
      }

      if (newImages.length > 0) {
        setSelectedImages((prev) => [...prev, ...newImages]);
      }

      if (newTextFiles.length > 0) {
        setSelectedTextFiles((prev) => [...prev, ...newTextFiles]);
      }
    },
    [isProcessing, selectedImages, selectedTextFiles]
  );

  const removeImage = useCallback((imageId: string) => {
    setSelectedImages((prev) => prev.filter((img) => img.id !== imageId));
  }, []);

  const removeTextFile = useCallback((fileId: string) => {
    setSelectedTextFiles((prev) => prev.filter((file) => file.id !== fileId));
  }, []);

  const clearAllFiles = useCallback(() => {
    setSelectedImages([]);
    setSelectedTextFiles([]);
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isProcessing || !isConnected) return;

      if (e.dataTransfer.types.includes('Files')) {
        setIsDragOver(true);
      }
    },
    [isProcessing, isConnected]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (isProcessing || !isConnected) return;

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        processDroppedFiles(files);
        return;
      }

      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) {
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(file);
              processDroppedFiles(dataTransfer.files);
            }
          }
        }
      }
    },
    [isProcessing, isConnected, processDroppedFiles]
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (items) {
        const files: File[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];

          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file && file.type.startsWith('image/')) {
              e.preventDefault();
              files.push(file);
            }
          }
        }

        if (files.length > 0) {
          const dataTransfer = new DataTransfer();
          files.forEach((file) => dataTransfer.items.add(file));
          await processDroppedFiles(dataTransfer.files);
        }
      }
    },
    [processDroppedFiles]
  );

  return {
    selectedImages,
    selectedTextFiles,
    showImageDropZone,
    isDragOver,
    handleImagesSelected,
    toggleImageDropZone,
    processDroppedFiles,
    removeImage,
    removeTextFile,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handlePaste,
    clearAllFiles,
    setSelectedImages,
    setSelectedTextFiles,
    setShowImageDropZone,
  };
}
