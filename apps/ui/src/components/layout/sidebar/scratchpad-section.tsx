import { useCallback, useEffect } from 'react';
import type { MouseEvent } from 'react';
import { MessageSquare, Plus, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useScratchStore, type ScratchChat } from '@/store/scratch-store';
import { openLayer, useIsLayerShowing } from '@/store/layer-store';
import { ContextMenu, useContextMenu } from '@/components/ui/context-menu';
import { DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { SidebarSection } from './sidebar-section';

/**
 * Scratchpad: throwaway AI chats that belong to no project.
 *
 * Each chat runs in its own sandbox and sees only global skills, so this
 * section sits apart from the project/branch/status tree below it — nothing
 * here is tied to a repository.
 */
export function ScratchpadSection() {
  const chats = useScratchStore((state) => state.chats);
  const activeChatId = useScratchStore((state) => state.activeChatId);
  const refresh = useScratchStore((state) => state.refresh);
  const createChat = useScratchStore((state) => state.createChat);
  const deleteChat = useScratchStore((state) => state.deleteChat);
  const setActiveChat = useScratchStore((state) => state.setActiveChat);

  const isShowing = useIsLayerShowing('scratch');

  const chatMenu = useContextMenu<ScratchChat>();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleOpen = useCallback(
    (chatId: string) => {
      setActiveChat(chatId);
      openLayer('scratch');
    },
    [setActiveChat]
  );

  const handleCreate = useCallback(async () => {
    const chatId = await createChat();
    if (chatId) openLayer('scratch');
  }, [createChat]);

  return (
    <>
      <SidebarSection
        id="scratchpad"
        label="Scratchpad"
        icon={Sparkles}
        count={chats.length}
        emptyMessage="No scratch chats. Start one for a question that has nothing to do with a repo."
        action={
          <Button
            variant="ghost"
            size="sm"
            className="size-5 p-0"
            onClick={() => void handleCreate()}
            title="New scratch chat"
            data-testid="sidebar-new-scratch-chat"
          >
            <Plus className="size-3" />
          </Button>
        }
      >
        {chats.map((chat) => {
          const isActive = isShowing && chat.id === activeChatId;
          return (
            <button
              key={chat.id}
              type="button"
              onClick={() => handleOpen(chat.id)}
              onContextMenu={(event: MouseEvent<HTMLElement>) => chatMenu.openAt(event, chat)}
              className={cn(
                'group/row flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left cursor-pointer',
                'text-[12px] transition-colors duration-100',
                isActive
                  ? 'bg-brand-500/10 text-brand-500'
                  : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
              )}
              data-testid={`sidebar-scratch-chat-${chat.id}`}
            >
              <MessageSquare className="size-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{chat.name}</span>
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Discard ${chat.name}`}
                title="Discard chat"
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

      <ContextMenu controller={chatMenu}>
        {chatMenu.target && (
          <>
            <DropdownMenuLabel className="truncate text-[11px] text-muted-foreground">
              {chatMenu.target.name}
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => void handleCreate()}>
              <Plus className="mr-2 size-4" />
              New scratch chat
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                const chatId = chatMenu.target?.id;
                if (chatId) void deleteChat(chatId);
              }}
            >
              <Trash2 className="mr-2 size-4" />
              Discard chat
            </DropdownMenuItem>
          </>
        )}
      </ContextMenu>
    </>
  );
}
