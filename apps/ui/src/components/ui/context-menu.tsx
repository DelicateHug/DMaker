import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './dropdown-menu';

/**
 * Right-click context menus, built on the existing dropdown menu so items,
 * separators, labels and submenus all look and behave identically to the rest
 * of the app.
 *
 * Radix has no context-menu package installed here, so instead of pulling one
 * in we anchor a zero-size trigger at the pointer and open the dropdown against
 * it. One controller drives one menu, and the target it was opened for is
 * carried along so a list can share a single menu across all of its rows.
 */

export interface ContextMenuController<T> {
  /** What the menu is open for; `null` when the menu is closed. */
  target: T | null;
  /** Viewport coordinates the menu is anchored to. */
  position: { x: number; y: number };
  /** Open the menu at the pointer for `target`. Suppresses the native menu. */
  openAt: (event: MouseEvent, target: T) => void;
  close: () => void;
}

export function useContextMenu<T>(): ContextMenuController<T> {
  const [target, setTarget] = useState<T | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const frameRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  const close = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setTarget(null);
  }, []);

  const openAt = useCallback((event: MouseEvent, next: T) => {
    event.preventDefault();
    event.stopPropagation();

    const x = event.clientX;
    const y = event.clientY;

    // The dropdown measures its anchor when it opens, so moving the anchor
    // under an already-open menu would leave the menu behind. Close first and
    // reopen on the next frame at the new spot.
    setTarget(null);
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setPosition({ x, y });
      setTarget(next);
    });
  }, []);

  return { target, position, openAt, close };
}

interface ContextMenuProps<T> {
  controller: ContextMenuController<T>;
  /** Menu body — `DropdownMenuItem` and friends. */
  children: ReactNode;
  className?: string;
}

export function ContextMenu<T>({ controller, children, className }: ContextMenuProps<T>) {
  const isOpen = controller.target !== null;

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) controller.close();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none fixed size-0 opacity-0"
          style={{ left: controller.position.x, top: controller.position.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={2}
        className={cn('w-56', className)}
        // Focus would otherwise snap back to the invisible anchor.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
