import { useCallback, useEffect, useRef, useState } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import type { PhaseModelEntry } from '@dmaker/types';
import { useElectronAgent } from '@/hooks/use-electron-agent';
import { useScratchStore } from '@/store/scratch-store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MessageList } from './agent-view/components/message-list';
import { AgentInputArea } from './agent-view/agent-input';
import { useAgentScroll, useFileAttachments } from './agent-view/hooks';

/**
 * Scratchpad — a throwaway AI chat that belongs to no repository.
 *
 * Each chat runs in a sandbox directory of its own under DATA_DIR and sees only
 * global (`~/.claude`) skills: no project files, no project CLAUDE.md, no
 * project skills. Use it for one-off questions and side errands you do not want
 * anywhere near a codebase. Deleting a chat deletes its sandbox with it.
 */
export function ScratchView() {
  const chats = useScratchStore((state) => state.chats);
  const activeChatId = useScratchStore((state) => state.activeChatId);
  const refresh = useScratchStore((state) => state.refresh);
  const createChat = useScratchStore((state) => state.createChat);
  const deleteChat = useScratchStore((state) => state.deleteChat);

  const [input, setInput] = useState('');
  const [modelSelection, setModelSelection] = useState<PhaseModelEntry>({ model: 'sonnet' });
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;

  // The sidebar section is the usual way in, but the view may be opened first.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const {
    messages,
    isProcessing,
    isConnected,
    sendMessage,
    stopExecution,
    serverQueue,
    addToServerQueue,
    removeFromServerQueue,
    clearServerQueue,
  } = useElectronAgent({
    // No working directory: the server pins a scratch chat to its own sandbox.
    sessionId: activeChatId || '',
    model: modelSelection.model,
    thinkingLevel: modelSelection.thinkingLevel,
  });

  const fileAttachments = useFileAttachments({ isProcessing, isConnected });

  const virtualizerRef = useRef<Virtualizer<HTMLDivElement, Element> | null>(null);
  const handleVirtualizerReady = useCallback((v: Virtualizer<HTMLDivElement, Element>) => {
    virtualizerRef.current = v;
  }, []);

  const { scrollContainerRef, handleScroll } = useAgentScroll({
    messagesLength: messages.length,
    currentSessionId: activeChatId,
    virtualizerRef,
  });

  // The server renames a chat from its first message, so the list needs a
  // re-read once a turn finishes.
  const wasProcessingRef = useRef(false);
  useEffect(() => {
    if (wasProcessingRef.current && !isProcessing) void refresh();
    wasProcessingRef.current = isProcessing;
  }, [isProcessing, refresh]);

  useEffect(() => {
    if (!activeChatId) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(timer);
  }, [activeChatId]);

  const handleSend = useCallback(async () => {
    const {
      selectedImages,
      selectedTextFiles,
      setSelectedImages,
      setSelectedTextFiles,
      setShowImageDropZone,
    } = fileAttachments;

    if (!input.trim() && selectedImages.length === 0 && selectedTextFiles.length === 0) return;

    const messageContent = input;
    const messageImages = selectedImages;
    const messageTextFiles = selectedTextFiles;

    setInput('');
    setSelectedImages([]);
    setSelectedTextFiles([]);
    setShowImageDropZone(false);

    if (isProcessing) {
      await addToServerQueue(messageContent, messageImages, messageTextFiles);
    } else {
      await sendMessage(messageContent, messageImages, messageTextFiles);
    }
  }, [input, fileAttachments, isProcessing, sendMessage, addToServerQueue]);

  const handleDelete = useCallback(async () => {
    if (!activeChatId) return;
    if (!confirm('Discard this scratch chat? Its sandbox is deleted with it.')) return;
    await deleteChat(activeChatId);
  }, [activeChatId, deleteChat]);

  if (!activeChatId) {
    return <EmptyScratchState onCreate={() => void createChat()} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="scratch-view">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <Sparkles className="size-4 shrink-0 text-brand-500" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {activeChat?.name || 'Scratch chat'}
        </span>
        <span
          className="shrink-0 rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
          title="Sandboxed chat: no project files, global skills only"
        >
          Sandboxed · global skills
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 shrink-0 p-0 text-muted-foreground"
          onClick={() => void createChat()}
          title="New scratch chat"
          data-testid="scratch-new-chat"
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => void handleDelete()}
          title="Discard this chat"
          data-testid="scratch-delete-chat"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </header>

      <MessageList
        messages={messages}
        isProcessing={isProcessing}
        scrollContainerRef={scrollContainerRef}
        onScroll={handleScroll}
        onVirtualizerReady={handleVirtualizerReady}
      />

      <AgentInputArea
        input={input}
        onInputChange={setInput}
        onSend={handleSend}
        onStop={stopExecution}
        modelSelection={modelSelection}
        onModelSelect={setModelSelection}
        isProcessing={isProcessing}
        isConnected={isConnected}
        selectedImages={fileAttachments.selectedImages}
        selectedTextFiles={fileAttachments.selectedTextFiles}
        showImageDropZone={fileAttachments.showImageDropZone}
        isDragOver={fileAttachments.isDragOver}
        onImagesSelected={fileAttachments.handleImagesSelected}
        onToggleImageDropZone={fileAttachments.toggleImageDropZone}
        onRemoveImage={fileAttachments.removeImage}
        onRemoveTextFile={fileAttachments.removeTextFile}
        onClearAllFiles={fileAttachments.clearAllFiles}
        onDragEnter={fileAttachments.handleDragEnter}
        onDragLeave={fileAttachments.handleDragLeave}
        onDragOver={fileAttachments.handleDragOver}
        onDrop={fileAttachments.handleDrop}
        onPaste={fileAttachments.handlePaste}
        serverQueue={serverQueue}
        onRemoveFromQueue={removeFromServerQueue}
        onClearQueue={clearServerQueue}
        inputRef={inputRef}
      />
    </div>
  );
}

/** Shown when no scratch chat is selected — one button, one job. */
function EmptyScratchState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center bg-background px-6 text-center"
      data-testid="scratch-view-empty"
    >
      <div
        className={cn(
          'mb-5 flex size-14 items-center justify-center rounded-2xl',
          'bg-brand-500/10 ring-1 ring-brand-500/20'
        )}
      >
        <Sparkles className="size-7 text-brand-500" />
      </div>
      <h2 className="mb-2 text-base font-semibold tracking-tight">Scratchpad</h2>
      <p className="mb-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
        A throwaway chat with no project attached. It runs in a sandbox of its own and sees only
        your global skills — nothing from any repository.
      </p>
      <Button variant="outline" size="sm" className="gap-2" onClick={onCreate}>
        <Plus className="size-4" />
        New scratch chat
      </Button>
    </div>
  );
}
