import { memo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ImageAttachment } from '@/store/app-store';
import { MessageBubble } from './message-bubble';
import { ThinkingIndicator } from './thinking-indicator';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  images?: ImageAttachment[];
}

/** A virtual item is either a message or the thinking-indicator sentinel */
type VirtualItem = { type: 'message'; message: Message } | { type: 'thinking' };

interface MessageListProps {
  messages: Message[];
  isProcessing: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  /** Callback that receives the virtualizer instance once created */
  onVirtualizerReady: (
    virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>
  ) => void;
}

export const MessageList = memo(function MessageList({
  messages,
  isProcessing,
  scrollContainerRef,
  onScroll,
  onVirtualizerReady,
}: MessageListProps) {
  // Build the flat list of virtual items: messages + optional thinking indicator
  const items: VirtualItem[] = [
    ...messages.map((message): VirtualItem => ({ type: 'message', message })),
    ...(isProcessing ? [{ type: 'thinking' } as VirtualItem] : []),
  ];

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollContainerRef.current,
    // Dynamic sizing — each row measures itself after render
    estimateSize: () => 120,
    overscan: 5,
    // Unique key for each item to help virtualizer track them across re-renders
    getItemKey: (index) => {
      const item = items[index];
      return item.type === 'message' ? item.message.id : '__thinking__';
    },
  });

  // Expose virtualizer to parent via callback ref (runs on every render
  // but the parent should guard with a ref to avoid unnecessary work)
  const virtualizerRef = useCallback(
    (node: HTMLDivElement | null) => {
      // We piggy-back on the inner container ref callback to notify the parent
      // once the virtualizer is ready. The virtualizer itself is stable per render.
      if (node) {
        onVirtualizerReady(virtualizer);
      }
    },
    [virtualizer, onVirtualizerReady]
  );

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto px-4 py-4 scroll-smooth"
      data-testid="message-list"
      onScroll={onScroll}
    >
      {/* Inner container sized to the total virtual height */}
      <div
        ref={virtualizerRef}
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {/* Add spacing between items via padding */}
              <div className="pb-4">
                {item.type === 'message' ? (
                  <MessageBubble message={item.message} />
                ) : (
                  <ThinkingIndicator />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
