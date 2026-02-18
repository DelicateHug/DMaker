import { memo, useState } from 'react';
import { Bot, User, ImageIcon, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Markdown } from '@/components/ui/markdown';
import type { ImageAttachment } from '@/store/app-store';
import { ImagePreviewDialog } from '@/components/ui/image-preview-dialog';
import { LazyImage } from '@/components/ui/lazy-image';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  images?: ImageAttachment[];
  isError?: boolean;
}

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  const isError = message.isError && message.role === 'assistant';
  const isUser = message.role === 'user';
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewImageSrc, setPreviewImageSrc] = useState('');
  const [previewImageAlt, setPreviewImageAlt] = useState('');
  const [previewImageFilename, setPreviewImageFilename] = useState('');

  const handleImageClick = (image: ImageAttachment, index: number) => {
    const dataUrl = image.data.startsWith('data:')
      ? image.data
      : `data:${image.mimeType || 'image/png'};base64,${image.data}`;

    setPreviewImageSrc(dataUrl);
    setPreviewImageAlt(image.filename || `Attached image ${index + 1}`);
    setPreviewImageFilename(image.filename || `Image ${index + 1}`);
    setPreviewDialogOpen(true);
  };

  return (
    <div
      className={cn(
        'flex gap-3 max-w-3xl',
        // User messages aligned to the right with proper spacing
        isUser && 'flex-row-reverse ml-auto'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
          'transition-all duration-200',
          isError
            ? 'bg-red-500/10 ring-1 ring-red-500/20 shadow-sm'
            : isUser
              ? // User avatar with modern gradient styling
                'bg-gradient-to-br from-primary to-primary/80 shadow-md shadow-primary/20 ring-1 ring-primary/30'
              : // Assistant avatar with refined subtle styling
                'bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/25 shadow-sm shadow-primary/5'
        )}
      >
        {isError ? (
          <AlertCircle className="w-4 h-4 text-red-500" />
        ) : isUser ? (
          <User className="w-4 h-4 text-primary-foreground" />
        ) : (
          <Bot className="w-4 h-4 text-primary" />
        )}
      </div>

      {/* Message Bubble */}
      <div
        className={cn(
          'flex-1 max-w-[85%] rounded-2xl px-4 py-3',
          'transition-all duration-200',
          isError
            ? 'bg-red-500/10 border border-red-500/30 shadow-sm'
            : isUser
              ? // User message bubble - modern gradient with enhanced shadows
                [
                  'bg-gradient-to-br from-primary via-primary to-primary/90',
                  'text-primary-foreground',
                  'shadow-lg shadow-primary/25',
                  'ring-1 ring-primary/20',
                  // Subtle inner highlight for depth
                  'relative overflow-hidden',
                ]
              : // Assistant message bubble - refined card with subtle depth
                [
                  'bg-card/95 backdrop-blur-sm',
                  'border border-border/60',
                  'shadow-sm shadow-black/5',
                  'ring-1 ring-border/30',
                  // Subtle left accent for visual distinction
                  'border-l-2 border-l-primary/40',
                ]
        )}
      >
        {message.role === 'assistant' ? (
          <Markdown
            className={cn(
              // Base typography with improved readability
              'text-sm leading-relaxed',
              // Enhanced prose styling for better content structure
              'prose-p:leading-relaxed prose-p:mb-3 prose-p:last:mb-0',
              'prose-headings:text-foreground prose-headings:font-semibold prose-headings:tracking-tight',
              'prose-strong:text-foreground prose-strong:font-semibold',
              // Refined code styling with better visibility
              'prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-medium prose-code:text-[13px]',
              // List styling improvements
              'prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5',
              // Link styling
              'prose-a:text-primary prose-a:font-medium prose-a:underline-offset-2 hover:prose-a:text-primary/80',
              isError
                ? 'text-red-600 dark:text-red-400 prose-code:text-red-600 dark:prose-code:text-red-400 prose-code:bg-red-500/10'
                : 'text-foreground/90 prose-code:text-primary prose-code:bg-primary/5 prose-code:ring-1 prose-code:ring-primary/10'
            )}
          >
            {message.content}
          </Markdown>
        ) : (
          <p className="text-sm whitespace-pre-wrap leading-relaxed font-medium tracking-tight selection:bg-white/30 selection:text-primary-foreground">
            {message.content}
          </p>
        )}

        {/* Display attached images for user messages */}
        {isUser && message.images && message.images.length > 0 && (
          <div className="mt-3 pt-3 border-t border-primary-foreground/15 space-y-2.5">
            <div className="flex items-center gap-2 text-xs text-primary-foreground/85 font-medium">
              <div className="p-1 rounded-md bg-primary-foreground/15">
                <ImageIcon className="w-3 h-3" />
              </div>
              <span>
                {message.images.length} image
                {message.images.length > 1 ? 's' : ''} attached
              </span>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {message.images.map((image, index) => {
                // Construct proper data URL from base64 data and mime type
                const dataUrl = image.data.startsWith('data:')
                  ? image.data
                  : `data:${image.mimeType || 'image/png'};base64,${image.data}`;
                return (
                  <div
                    key={image.id || `img-${index}`}
                    className={cn(
                      'relative group rounded-xl overflow-hidden cursor-pointer',
                      'border-2 border-primary-foreground/25 bg-primary-foreground/10',
                      'transition-all duration-200 ease-out',
                      'hover:border-primary-foreground/50 hover:shadow-lg hover:shadow-black/20',
                      'hover:scale-[1.02] active:scale-[0.98]'
                    )}
                    onClick={() => handleImageClick(image, index)}
                  >
                    <LazyImage
                      src={dataUrl}
                      alt={image.filename || `Attached image ${index + 1}`}
                      className="w-20 h-20 object-cover"
                      containerClassName="w-20 h-20"
                      errorIconSize="w-4 h-4"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-2 py-1 text-[9px] text-white truncate font-medium">
                      {image.filename || `Image ${index + 1}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p
          className={cn(
            'text-[11px] mt-3 font-medium tabular-nums tracking-wide',
            isError
              ? 'text-red-500/70'
              : isUser
                ? 'text-primary-foreground/65'
                : // Assistant timestamp with subtle separator
                  'text-muted-foreground/60 pt-1 border-t border-border/30'
          )}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
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
});
