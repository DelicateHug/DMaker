import { create } from 'zustand';
import { toast } from 'sonner';
import { getElectronAPI } from '@/lib/electron';
import { createLogger } from '@dmaker/utils/logger';

const logger = createLogger('ScratchStore');

/** Where the last-opened chat is remembered, so a reload lands where you left. */
const ACTIVE_CHAT_KEY = 'dmaker:scratch-active-chat';

/** Placeholder name a fresh chat carries until the server renames it. */
export const NEW_SCRATCH_CHAT_NAME = 'New Session';

/**
 * A Scratchpad chat.
 *
 * Backed by an ordinary agent session flagged `scratch` on the server, which
 * gives it a sandbox directory of its own and restricts it to global skills.
 */
export interface ScratchChat {
  id: string;
  name: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
}

interface ScratchState {
  /** Chats, most recently used first */
  chats: ScratchChat[];
  /** Chat showing in the Scratchpad view; null shows the empty state */
  activeChatId: string | null;
  isLoading: boolean;

  /** Re-read the chat list from the server */
  refresh: () => Promise<void>;
  /** Create a chat and make it active. Returns its id, or null on failure. */
  createChat: () => Promise<string | null>;
  /** Delete a chat and its sandbox; falls to a neighbour if it was active */
  deleteChat: (chatId: string) => Promise<void>;
  renameChat: (chatId: string, name: string) => Promise<void>;
  setActiveChat: (chatId: string | null) => void;
}

function readActiveChatId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CHAT_KEY);
  } catch {
    return null;
  }
}

function writeActiveChatId(chatId: string | null): void {
  try {
    if (chatId) localStorage.setItem(ACTIVE_CHAT_KEY, chatId);
    else localStorage.removeItem(ACTIVE_CHAT_KEY);
  } catch {
    // Storage unavailable — the selection just will not survive a reload.
  }
}

/** After deleting a chat, fall to its neighbour — the one below, else above. */
function neighbourOf(chats: ScratchChat[], removedIndex: number): string | null {
  if (chats.length === 0) return null;
  return chats[Math.min(removedIndex, chats.length - 1)]?.id ?? null;
}

export const useScratchStore = create<ScratchState>((set, get) => ({
  chats: [],
  activeChatId: readActiveChatId(),
  isLoading: false,

  refresh: async () => {
    const api = getElectronAPI();
    if (!api?.sessions) return;

    set({ isLoading: true });
    try {
      const result = await api.sessions.list(false);
      if (!result.success || !result.sessions) return;

      const chats: ScratchChat[] = result.sessions
        .filter((session) => session.scratch)
        .map((session) => ({
          id: session.id,
          name: session.name,
          updatedAt: session.updatedAt,
          messageCount: session.messageCount,
          preview: session.preview,
        }));

      // A chat deleted elsewhere must not stay selected.
      const { activeChatId } = get();
      const stillExists = activeChatId && chats.some((chat) => chat.id === activeChatId);
      if (activeChatId && !stillExists) writeActiveChatId(null);

      set({ chats, activeChatId: stillExists ? activeChatId : null });
    } catch (error) {
      logger.error('Failed to load scratch chats:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  createChat: async () => {
    const api = getElectronAPI();
    if (!api?.sessions) return null;

    try {
      // projectPath is ignored for scratch sessions — the server hands the chat
      // a sandbox of its own — but the API signature still requires a string.
      const result = await api.sessions.create(NEW_SCRATCH_CHAT_NAME, '', undefined, {
        scratch: true,
      });

      const session = result.session as { id?: string; scratch?: boolean } | undefined;
      if (!result.success || !session?.id) {
        logger.error('Failed to create scratch chat:', result.error);
        toast.error(result.error || 'Could not create a scratch chat');
        return null;
      }

      // An older server accepts the request but ignores `scratch`, which would
      // hand back an ordinary session pointed at a real directory. Say so
      // rather than silently opening a chat that is not sandboxed.
      if (!session.scratch) {
        logger.error('Server created a session without the scratch flag', session);
        toast.error('The server does not support Scratchpad yet — restart it and try again.');
        return null;
      }

      get().setActiveChat(session.id);
      await get().refresh();
      return session.id;
    } catch (error) {
      logger.error('Failed to create scratch chat:', error);
      toast.error(error instanceof Error ? error.message : 'Could not create a scratch chat');
      return null;
    }
  },

  deleteChat: async (chatId) => {
    const api = getElectronAPI();
    if (!api?.sessions) return;

    const { chats, activeChatId } = get();
    const removedIndex = chats.findIndex((chat) => chat.id === chatId);
    const remaining = chats.filter((chat) => chat.id !== chatId);

    // Drop it locally first so the row disappears on click.
    const nextActive =
      activeChatId === chatId ? neighbourOf(remaining, Math.max(removedIndex, 0)) : activeChatId;
    writeActiveChatId(nextActive);
    set({ chats: remaining, activeChatId: nextActive });

    try {
      await api.sessions.delete(chatId);
    } catch (error) {
      logger.error('Failed to delete scratch chat:', error);
    }
    await get().refresh();
  },

  renameChat: async (chatId, name) => {
    const api = getElectronAPI();
    if (!api?.sessions) return;

    set((state) => ({
      chats: state.chats.map((chat) => (chat.id === chatId ? { ...chat, name } : chat)),
    }));

    try {
      await api.sessions.update(chatId, name);
    } catch (error) {
      logger.error('Failed to rename scratch chat:', error);
      await get().refresh();
    }
  },

  setActiveChat: (chatId) => {
    writeActiveChatId(chatId);
    set({ activeChatId: chatId });
  },
}));
