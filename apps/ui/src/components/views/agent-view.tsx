import { useState, useCallback, useRef, useEffect } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import { useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import type { PhaseModelEntry } from '@automaker/types';
import { useElectronAgent } from '@/hooks/use-electron-agent';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';

// Extracted hooks
import {
  useAgentScroll,
  useFileAttachments,
  useAgentShortcuts,
  useAgentSession,
} from './agent-view/hooks';

// Extracted components
import { NoProjectState, AgentHeader, ChatArea } from './agent-view/components';
import { AgentInputArea } from './agent-view/input-area';

export function AgentView() {
  const { currentProject, bumpSessionListVersion } = useAppStore(
    useShallow((state) => ({
      currentProject: state.currentProject,
      bumpSessionListVersion: state.bumpSessionListVersion,
    }))
  );
  const [input, setInput] = useState('');
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [modelSelection, setModelSelection] = useState<PhaseModelEntry>({ model: 'sonnet' });

  // Input ref for auto-focus
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Session management hook
  const { currentSessionId, handleSelectSession } = useAgentSession({
    projectPath: currentProject?.path,
  });

  // Create new session with placeholder name (will be auto-renamed on first message)
  const handleCreateSession = useCallback(async () => {
    if (!currentProject?.path) return;

    const api = getElectronAPI();
    if (!api?.sessions) return;

    const sessionName = 'New Session';
    const result = await api.sessions.create(sessionName, currentProject.path, currentProject.path);

    if (result.success && result.session?.id) {
      bumpSessionListVersion();
      handleSelectSession(result.session.id);
    }
  }, [currentProject?.path, handleSelectSession, bumpSessionListVersion]);

  // Use the Electron agent hook (only if we have a session)
  const {
    messages,
    isProcessing,
    isConnected,
    sendMessage,
    clearHistory,
    stopExecution,
    error: agentError,
    serverQueue,
    addToServerQueue,
    removeFromServerQueue,
    clearServerQueue,
  } = useElectronAgent({
    sessionId: currentSessionId || '',
    workingDirectory: currentProject?.path,
    model: modelSelection.model,
    thinkingLevel: modelSelection.thinkingLevel,
    onToolUse: (toolName) => {
      setCurrentTool(toolName);
      setTimeout(() => setCurrentTool(null), 2000);
    },
  });

  // File attachments hook
  const fileAttachments = useFileAttachments({
    isProcessing,
    isConnected,
  });

  // Virtualizer instance — set by MessageList on every render.
  // Stored as a ref because we only read it inside callbacks (scrollToBottom),
  // not during render, so we don't need it to trigger re-renders.
  const virtualizerRef = useRef<Virtualizer<HTMLDivElement, Element> | null>(null);

  const handleVirtualizerReady = useCallback((v: Virtualizer<HTMLDivElement, Element>) => {
    virtualizerRef.current = v;
  }, []);

  // Scroll management hook (now driven by virtualizer.scrollToIndex)
  const { scrollContainerRef, handleScroll } = useAgentScroll({
    messagesLength: messages.length,
    currentSessionId,
    virtualizerRef,
  });

  // Keyboard shortcuts hook (removed quickCreateSessionRef as sessions are now managed via header dropdown)
  // useAgentShortcuts({
  //   currentProject,
  //   quickCreateSessionRef,
  // });

  // Handle send message
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

    // If already processing, add to server queue instead
    if (isProcessing) {
      await addToServerQueue(messageContent, messageImages, messageTextFiles);
    } else {
      await sendMessage(messageContent, messageImages, messageTextFiles);
    }
  }, [input, fileAttachments, isProcessing, sendMessage, addToServerQueue]);

  const handleClearChat = async () => {
    if (!confirm('Are you sure you want to clear this conversation?')) return;
    await clearHistory();
  };

  // Auto-focus input when session is selected/changed
  useEffect(() => {
    if (currentSessionId && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 200);
    }
  }, [currentSessionId]);

  // Show welcome message if no messages yet
  const displayMessages =
    messages.length === 0
      ? [
          {
            id: 'welcome',
            role: 'assistant' as const,
            content:
              "Hello! I'm the Automaker Agent. I can help you build software autonomously. I can read and modify files in this project, run commands, and execute tests. What would you like to create today?",
            timestamp: new Date().toISOString(),
          },
        ]
      : messages;

  if (!currentProject) {
    return <NoProjectState />;
  }

  return (
    <div className={cn('flex-1 flex overflow-hidden', 'bg-background')} data-testid="agent-view">
      {/* Chat Area - now full width without sidebar */}
      <div
        className={cn(
          'flex-1 flex flex-col overflow-hidden',
          'transition-all duration-300 ease-out'
        )}
      >
        {/* Header */}
        <AgentHeader
          projectName={currentProject.name}
          projectPath={currentProject.path}
          currentSessionId={currentSessionId}
          isConnected={isConnected}
          isProcessing={isProcessing}
          currentTool={currentTool}
          messagesCount={messages.length}
          showSessionManager={false}
          onToggleSessionManager={() => {}}
          onSelectSession={handleSelectSession}
          onClearChat={handleClearChat}
          showProjectSelector={true}
        />

        {/* Messages */}
        <ChatArea
          currentSessionId={currentSessionId}
          messages={displayMessages}
          isProcessing={isProcessing}
          showSessionManager={false}
          scrollContainerRef={scrollContainerRef}
          onScroll={handleScroll}
          onShowSessionManager={() => {}}
          onCreateSession={handleCreateSession}
          onVirtualizerReady={handleVirtualizerReady}
        />

        {/* Input Area - with smooth fade-in effect when session is selected */}
        <div
          className={cn(
            'transition-all duration-200 ease-out',
            currentSessionId
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-2 pointer-events-none h-0'
          )}
        >
          {currentSessionId && (
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
          )}
        </div>
      </div>
    </div>
  );
}
