import type { useVirtualizer } from '@tanstack/react-virtual';
import type { ImageAttachment } from '@/store/app-store';
import { MessageList } from './message-list';
import { NoSessionState } from './empty-states';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isError?: boolean;
  images?: ImageAttachment[];
}

interface ChatAreaProps {
  currentSessionId: string | null;
  messages: Message[];
  isProcessing: boolean;
  showSessionManager: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onShowSessionManager: () => void;
  /** Callback to create a new session directly */
  onCreateSession?: () => void;
  /** Callback that receives the virtualizer instance once created */
  onVirtualizerReady: (
    virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>
  ) => void;
}

export function ChatArea({
  currentSessionId,
  messages,
  isProcessing,
  showSessionManager,
  scrollContainerRef,
  onScroll,
  onShowSessionManager,
  onCreateSession,
  onVirtualizerReady,
}: ChatAreaProps) {
  if (!currentSessionId) {
    return (
      <NoSessionState
        showSessionManager={showSessionManager}
        onShowSessionManager={onShowSessionManager}
        onCreateSession={onCreateSession}
      />
    );
  }

  return (
    <MessageList
      messages={messages}
      isProcessing={isProcessing}
      scrollContainerRef={scrollContainerRef}
      onScroll={onScroll}
      onVirtualizerReady={onVirtualizerReady}
    />
  );
}
