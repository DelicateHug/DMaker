import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import { Bot, FolderLock, Plus, Trash2 } from 'lucide-react';
import type { PhaseModelEntry } from '@dmaker/types';
import { useElectronAgent } from '@/hooks/use-electron-agent';
import { useResearchStore, ISOLATED_PROJECT_ID } from '@/store/research-store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MessageList } from './agent-view/components/message-list';
import { AgentInputArea } from './agent-view/agent-input';
import { useAgentScroll, useFileAttachments } from './agent-view/hooks';

/**
 * Research — an AI chat that belongs to a local research project rather than a
 * repository.
 *
 * A chat in a named project runs in that project's directory and sees its
 * `.claude` skills and memory on top of your global ones, so what one chat
 * learns the next one can read. A chat in **Isolated** runs in a sandbox of its
 * own with global skills only, and takes the sandbox with it when deleted.
 */
export function ResearchView() {
  const projects = useResearchStore((state) => state.projects);
  const chats = useResearchStore((state) => state.chats);
  const activeChatId = useResearchStore((state) => state.activeChatId);
  const refresh = useResearchStore((state) => state.refresh);
  const createChat = useResearchStore((state) => state.createChat);
  const deleteChat = useResearchStore((state) => state.deleteChat);

  const [input, setInput] = useState('');
  const [modelSelection, setModelSelection] = useState<PhaseModelEntry>({ model: 'sonnet' });
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [chats, activeChatId]
  );
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeChat?.projectId) ?? null,
    [projects, activeChat]
  );

  // The sidebar is the usual way in, but the view may be opened first.
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
    // No working directory: the server pins a research chat to its project.
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
    const warning = activeProject?.isolated
      ? 'Delete this chat? Its sandbox is deleted with it.'
      : `Delete this chat? ${activeProject?.name ?? 'The project'} and its memory stay.`;
    if (!confirm(warning)) return;
    await deleteChat(activeChatId);
  }, [activeChatId, activeProject, deleteChat]);

  const handleNewChat = useCallback(() => {
    void createChat(activeChat?.projectId ?? ISOLATED_PROJECT_ID);
  }, [createChat, activeChat]);

  if (!activeChatId) {
    return <EmptyResearchState onCreate={() => void createChat(ISOLATED_PROJECT_ID)} />;
  }

  const isolated = activeProject?.isolated ?? false;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="research-view">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        {isolated ? (
          <FolderLock className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Bot className="size-4 shrink-0 text-brand-500" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {activeChat?.name || 'Research chat'}
        </span>
        <span
          className="shrink-0 rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
          title={
            isolated
              ? 'Sandboxed chat: its own throwaway directory, global skills only'
              : `Runs in ${activeProject?.path ?? 'the project directory'} — global skills plus this project's own .claude skills and memory`
          }
          data-testid="research-scope-badge"
        >
          {isolated ? 'Isolated · global skills' : `${activeProject?.name} · project skills`}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 shrink-0 p-0 text-muted-foreground"
          onClick={handleNewChat}
          title={activeProject ? `New chat in ${activeProject.name}` : 'New chat in this project'}
          data-testid="research-new-chat"
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => void handleDelete()}
          title="Delete this chat"
          data-testid="research-delete-chat"
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

/** Shown when no research chat is selected — one button, one job. */
function EmptyResearchState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center bg-background px-6 text-center"
      data-testid="research-view-empty"
    >
      <div
        className={cn(
          'mb-5 flex size-14 items-center justify-center rounded-2xl',
          'bg-brand-500/10 ring-1 ring-brand-500/20'
        )}
      >
        <Bot className="size-7 text-brand-500" />
      </div>
      <h2 className="mb-2 text-base font-semibold tracking-tight">Research</h2>
      <p className="mb-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Local projects for AI work with no repository attached. Each keeps its own skills and
        memory; Isolated keeps nothing at all.
      </p>
      <Button variant="outline" size="sm" className="gap-2" onClick={onCreate}>
        <Plus className="size-4" />
        New isolated chat
      </Button>
    </div>
  );
}
