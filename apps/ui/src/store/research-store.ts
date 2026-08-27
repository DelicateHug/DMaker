import { create } from 'zustand';
import { toast } from 'sonner';
import { getElectronAPI } from '@/lib/electron';
import { createLogger } from '@dmaker/utils/logger';

const logger = createLogger('ResearchStore');

/** Where the last-opened chat is remembered, so a reload lands where you left. */
const ACTIVE_CHAT_KEY = 'dmaker:research-active-chat';

/** Placeholder name a fresh chat carries until the server renames it. */
export const NEW_RESEARCH_CHAT_NAME = 'New Session';

/** The sandboxed project. Its chats leave nothing behind. */
export const ISOLATED_PROJECT_ID = 'isolated';

/**
 * A research project — a local workspace for AI chats that belong to no repo.
 *
 * Every project sees your global (`~/.claude`) skills. A named project adds a
 * `.claude` of its own on top, giving it skills and memory that persist across
 * its chats. **Isolated** is the exception: each of its chats runs in a
 * throwaway sandbox with global skills only.
 */
export interface ResearchProject {
  id: string;
  name: string;
  /** Absolute path of the project directory, shown as its subtitle */
  path: string;
  isolated: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One chat inside a research project. */
export interface ResearchChat {
  id: string;
  name: string;
  projectId: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
}

interface ResearchState {
  projects: ResearchProject[];
  /** Chats across every project, most recently used first */
  chats: ResearchChat[];
  /** Chat showing in the Research view; null shows the empty state */
  activeChatId: string | null;
  isLoading: boolean;

  /** Re-read projects and chats from the server */
  refresh: () => Promise<void>;
  /** Start a chat in a project and make it active. Returns its id, or null. */
  createChat: (projectId: string) => Promise<string | null>;
  deleteChat: (chatId: string) => Promise<void>;
  renameChat: (chatId: string, name: string) => Promise<void>;
  setActiveChat: (chatId: string | null) => void;

  /** Create a project and scaffold its `.claude`. Returns its id, or null. */
  createProject: (name: string) => Promise<string | null>;
  renameProject: (projectId: string, name: string) => Promise<void>;
  /** Delete a project, its `.claude` and every chat that ran in it */
  deleteProject: (projectId: string) => Promise<void>;
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
function neighbourOf(chats: ResearchChat[], removedIndex: number): string | null {
  if (chats.length === 0) return null;
  return chats[Math.min(removedIndex, chats.length - 1)]?.id ?? null;
}

export const useResearchStore = create<ResearchState>((set, get) => ({
  projects: [],
  chats: [],
  activeChatId: readActiveChatId(),
  isLoading: false,

  refresh: async () => {
    const api = getElectronAPI();
    if (!api?.sessions || !api?.research) return;

    set({ isLoading: true });
    try {
      const [projectsResult, sessionsResult] = await Promise.all([
        api.research.list(),
        api.sessions.list(false),
      ]);

      const projects = projectsResult.success ? (projectsResult.projects ?? []) : [];

      const chats: ResearchChat[] = (sessionsResult.sessions ?? [])
        .filter((session) => !!session.researchProjectId)
        .map((session) => ({
          id: session.id,
          name: session.name,
          projectId: session.researchProjectId as string,
          updatedAt: session.updatedAt,
          messageCount: session.messageCount,
          preview: session.preview,
        }));

      // A chat deleted elsewhere must not stay selected.
      const { activeChatId } = get();
      const stillExists = activeChatId && chats.some((chat) => chat.id === activeChatId);
      if (activeChatId && !stillExists) writeActiveChatId(null);

      set({ projects, chats, activeChatId: stillExists ? activeChatId : null });
    } catch (error) {
      logger.error('Failed to load research projects:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  createChat: async (projectId) => {
    const api = getElectronAPI();
    if (!api?.sessions) return null;

    try {
      // projectPath is ignored for research chats — the server pins the chat to
      // its project's directory — but the API signature still requires a string.
      const result = await api.sessions.create(NEW_RESEARCH_CHAT_NAME, '', undefined, {
        researchProjectId: projectId,
      });

      const session = result.session as { id?: string; researchProjectId?: string } | undefined;
      if (!result.success || !session?.id) {
        logger.error('Failed to create research chat:', result.error);
        toast.error(result.error || 'Could not start a research chat');
        return null;
      }

      // An older server accepts the request but ignores the project, which would
      // hand back an ordinary session pointed at a real directory. Say so rather
      // than silently opening a chat that is not in the project it claims.
      if (session.researchProjectId !== projectId) {
        logger.error('Server created a session outside the research project', session);
        toast.error('The server does not support research projects yet — restart it and retry.');
        return null;
      }

      get().setActiveChat(session.id);
      await get().refresh();
      return session.id;
    } catch (error) {
      logger.error('Failed to create research chat:', error);
      toast.error(error instanceof Error ? error.message : 'Could not start a research chat');
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
      logger.error('Failed to delete research chat:', error);
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
      logger.error('Failed to rename research chat:', error);
      await get().refresh();
    }
  },

  setActiveChat: (chatId) => {
    writeActiveChatId(chatId);
    set({ activeChatId: chatId });
  },

  createProject: async (name) => {
    const api = getElectronAPI();
    if (!api?.research) return null;

    try {
      const result = await api.research.create(name);
      if (!result.success || !result.project) {
        toast.error(result.error || 'Could not create the research project');
        return null;
      }

      await get().refresh();
      return result.project.id;
    } catch (error) {
      logger.error('Failed to create research project:', error);
      toast.error(error instanceof Error ? error.message : 'Could not create the project');
      return null;
    }
  },

  renameProject: async (projectId, name) => {
    const api = getElectronAPI();
    if (!api?.research) return;

    set((state) => ({
      projects: state.projects.map((project) =>
        project.id === projectId ? { ...project, name } : project
      ),
    }));

    try {
      const result = await api.research.rename(projectId, name);
      if (!result.success) toast.error(result.error || 'Could not rename the project');
    } catch (error) {
      logger.error('Failed to rename research project:', error);
    }
    await get().refresh();
  },

  deleteProject: async (projectId) => {
    const api = getElectronAPI();
    if (!api?.research) return;

    try {
      const result = await api.research.delete(projectId);
      if (!result.success) {
        toast.error(result.error || 'Could not delete the research project');
        return;
      }
      toast.success('Research project deleted');
    } catch (error) {
      logger.error('Failed to delete research project:', error);
      toast.error(error instanceof Error ? error.message : 'Could not delete the project');
    }

    // The chats went with it, so the active one may be gone — refresh decides.
    await get().refresh();
  },
}));

/** Chats belonging to one project, newest first. */
export function chatsForProject(chats: ResearchChat[], projectId: string): ResearchChat[] {
  return chats.filter((chat) => chat.projectId === projectId);
}
