import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Bot, FolderLock, FolderPlus, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  useResearchStore,
  chatsForProject,
  type ResearchChat,
  type ResearchProject,
} from '@/store/research-store';
import { openLayer, useIsLayerShowing } from '@/store/layer-store';
import { ContextMenu, useContextMenu } from '@/components/ui/context-menu';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { SidebarSection } from './sidebar-section';

/**
 * The sidebar in research mode: local projects instead of the repository tree.
 *
 * Each project is a directory of its own under the data directory, with a
 * `.claude` holding the skills and memory that only its chats see — on top of
 * the global `~/.claude` every chat gets. **Isolated** is the exception and
 * leads the list: its chats each run in a throwaway sandbox with global skills
 * only, and take that sandbox with them when deleted.
 */
export function ResearchSidebar() {
  const projects = useResearchStore((state) => state.projects);
  const chats = useResearchStore((state) => state.chats);
  const activeChatId = useResearchStore((state) => state.activeChatId);
  const refresh = useResearchStore((state) => state.refresh);
  const createChat = useResearchStore((state) => state.createChat);
  const deleteChat = useResearchStore((state) => state.deleteChat);
  const setActiveChat = useResearchStore((state) => state.setActiveChat);
  const createProject = useResearchStore((state) => state.createProject);
  const renameProject = useResearchStore((state) => state.renameProject);
  const deleteProject = useResearchStore((state) => state.deleteProject);

  const isShowing = useIsLayerShowing('research');

  const chatMenu = useContextMenu<ResearchChat>();
  const projectMenu = useContextMenu<ResearchProject>();

  /** Project awaiting delete confirmation — it takes its chats with it. */
  const [projectToDelete, setProjectToDelete] = useState<ResearchProject | null>(null);
  /** Set while a new project's name is being typed in the inline row. */
  const [isNamingProject, setIsNamingProject] = useState(false);
  /** Project being renamed inline, or null. */
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleOpenChat = useCallback(
    (chatId: string) => {
      setActiveChat(chatId);
      openLayer('research');
    },
    [setActiveChat]
  );

  const handleCreateChat = useCallback(
    async (projectId: string) => {
      const chatId = await createChat(projectId);
      if (chatId) openLayer('research');
    },
    [createChat]
  );

  const handleCreateProject = useCallback(
    async (name: string) => {
      setIsNamingProject(false);
      const trimmed = name.trim();
      if (trimmed) await createProject(trimmed);
    },
    [createProject]
  );

  return (
    <>
      <div className="flex items-center gap-1 px-2 py-1.5">
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Research projects
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="size-5 p-0"
          onClick={() => setIsNamingProject(true)}
          title="New research project — its own skills and memory"
          data-testid="research-new-project"
        >
          <FolderPlus className="size-3" />
        </Button>
      </div>

      {isNamingProject && (
        <NameInput
          placeholder="Project name"
          onCommit={(name) => void handleCreateProject(name)}
          onCancel={() => setIsNamingProject(false)}
          testId="research-new-project-input"
        />
      )}

      {projects.length === 0 && !isNamingProject && (
        <p className="px-3 py-1.5 text-[11px] leading-relaxed text-muted-foreground/70">
          Loading projects…
        </p>
      )}

      {projects.map((project) => {
        const projectChats = chatsForProject(chats, project.id);

        if (renamingProjectId === project.id) {
          return (
            <NameInput
              key={project.id}
              initialValue={project.name}
              placeholder="Project name"
              onCommit={(name) => {
                setRenamingProjectId(null);
                if (name.trim() && name.trim() !== project.name) {
                  void renameProject(project.id, name.trim());
                }
              }}
              onCancel={() => setRenamingProjectId(null)}
              testId={`research-rename-project-${project.id}`}
            />
          );
        }

        return (
          <SidebarSection
            key={project.id}
            id={`research:${project.id}`}
            label={project.name}
            icon={project.isolated ? FolderLock : Bot}
            iconClassName={project.isolated ? 'text-muted-foreground/60' : 'text-brand-500'}
            count={projectChats.length}
            emptyMessage={
              project.isolated
                ? 'No isolated chats. Start one for a question that should leave nothing behind.'
                : 'No chats yet. This project keeps its own skills and memory between them.'
            }
            onContextMenu={(event) => projectMenu.openAt(event, project)}
            action={
              <Button
                variant="ghost"
                size="sm"
                className="size-5 p-0"
                onClick={() => void handleCreateChat(project.id)}
                title={`New chat in ${project.name}`}
                data-testid={`research-new-chat-${project.id}`}
              >
                <Plus className="size-3" />
              </Button>
            }
          >
            {projectChats.map((chat) => {
              const isActive = isShowing && chat.id === activeChatId;
              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => handleOpenChat(chat.id)}
                  onContextMenu={(event: MouseEvent<HTMLElement>) => chatMenu.openAt(event, chat)}
                  className={cn(
                    'group/row flex w-full items-center gap-1.5 rounded-md px-2 py-1 pl-5 text-left cursor-pointer',
                    'text-[12px] transition-colors duration-100',
                    isActive
                      ? 'bg-brand-500/10 text-brand-500'
                      : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                  )}
                  data-testid={`research-chat-${chat.id}`}
                >
                  <MessageSquare className="size-3 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{chat.name}</span>
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Delete ${chat.name}`}
                    title="Delete chat"
                    onClick={(event) => {
                      event.stopPropagation();
                      void deleteChat(chat.id);
                    }}
                    className={cn(
                      'shrink-0 rounded p-0.5 opacity-0 transition-opacity duration-100',
                      'group-hover/row:opacity-60 hover:!opacity-100 hover:bg-muted'
                    )}
                  >
                    <Trash2 className="size-3" />
                  </span>
                </button>
              );
            })}
          </SidebarSection>
        );
      })}

      {/* Right-click a chat */}
      <ContextMenu controller={chatMenu}>
        {chatMenu.target && (
          <>
            <DropdownMenuLabel className="truncate text-[11px] text-muted-foreground">
              {chatMenu.target.name}
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => void handleCreateChat(chatMenu.target!.projectId)}>
              <Plus className="mr-2 size-4" />
              New chat here
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                const chatId = chatMenu.target?.id;
                if (chatId) void deleteChat(chatId);
              }}
            >
              <Trash2 className="mr-2 size-4" />
              Delete chat
            </DropdownMenuItem>
          </>
        )}
      </ContextMenu>

      {/* Right-click a project. Isolated is fixed: it cannot be renamed or
          deleted, because it is the sandbox itself rather than a project the
          user made. */}
      <ContextMenu controller={projectMenu}>
        {projectMenu.target && (
          <>
            <DropdownMenuLabel className="truncate text-[11px] text-muted-foreground">
              {projectMenu.target.name}
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => void handleCreateChat(projectMenu.target!.id)}>
              <Plus className="mr-2 size-4" />
              New chat
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setIsNamingProject(true)}>
              <FolderPlus className="mr-2 size-4" />
              New project…
            </DropdownMenuItem>
            {!projectMenu.target.isolated && (
              <>
                <DropdownMenuItem
                  onSelect={() => setRenamingProjectId(projectMenu.target!.id)}
                  data-testid="research-project-rename"
                >
                  <Bot className="mr-2 size-4" />
                  Rename…
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setProjectToDelete(projectMenu.target ?? null)}
                  data-testid="research-project-delete"
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete project…
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </ContextMenu>

      <DeleteConfirmDialog
        open={projectToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setProjectToDelete(null);
        }}
        title={`Delete ${projectToDelete?.name ?? 'project'}?`}
        description={
          projectToDelete
            ? `Its directory goes with it — the ${chatsForProject(chats, projectToDelete.id).length} chat(s) in it, and everything under ${projectToDelete.path}, including its own skills and memory. This cannot be undone.`
            : ''
        }
        confirmText="Delete project"
        // Reached from a right-click menu — there is no delete icon to shift-click.
        showShiftTip={false}
        testId="research-delete-project-dialog"
        onConfirm={() => {
          const projectId = projectToDelete?.id;
          setProjectToDelete(null);
          if (projectId) void deleteProject(projectId);
        }}
      />
    </>
  );
}

interface NameInputProps {
  initialValue?: string;
  placeholder: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
  testId: string;
}

/** One-line inline input for naming or renaming a project. */
function NameInput({ initialValue = '', placeholder, onCommit, onCancel, testId }: NameInputProps) {
  const [draft, setDraft] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // The row exists only to be typed into, so it takes the caret on appearing —
  // and selects any existing name, which is what makes a rename type-over.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  return (
    <div className="px-2 py-1">
      <input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onCommit(draft);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        className={cn(
          'w-full rounded border border-brand-500/60 bg-background px-1.5 py-0.5',
          'text-[12px] outline-none'
        )}
        data-testid={testId}
      />
    </div>
  );
}
