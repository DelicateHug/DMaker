import { useCallback, useEffect, useRef } from 'react';
import { XIcon, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLayerStore, type LayerId } from '@/store/layer-store';

interface LayerProps {
  /** Unique layer identifier */
  id: LayerId;
  /** Title displayed in the layer header */
  title: string;
  /** Whether this layer is the topmost (receives Escape key) */
  isTop: boolean;
  /** z-index offset for stacking */
  zIndex: number;
  /** Content to render inside the layer */
  children: React.ReactNode;
}

/**
 * Layer - A near-full-screen modal overlay inspired by Linear's UI.
 *
 * Renders as a centered overlay with rounded corners, backdrop blur,
 * and the board visible (dimmed) underneath. Supports stacking.
 */
export function Layer({ id, title, isTop, zIndex, children }: LayerProps) {
  const closeLayerById = useLayerStore((s) => s.closeLayerById);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    closeLayerById(id);
  }, [closeLayerById, id]);

  // Handle Escape key - only the topmost layer responds
  useEffect(() => {
    if (!isTop) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Don't close if focus is inside a dialog/popover/dropdown (let those handle Escape first)
        const activeEl = document.activeElement;
        if (activeEl?.closest('[role="dialog"]') && !activeEl?.closest('[data-layer-content]')) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isTop, handleClose]);

  return (
    <div className="fixed inset-0" style={{ zIndex: 60 + zIndex }} data-layer-id={id}>
      {/* Backdrop - click to close */}
      <div
        className={cn(
          'absolute inset-0',
          'bg-black/40 backdrop-blur-[2px]',
          'animate-in fade-in-0 duration-200'
        )}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Layer content */}
      <div
        ref={contentRef}
        data-layer-content
        className={cn(
          // Positioning - near full screen with margin
          'absolute inset-3 sm:inset-4 lg:inset-6',
          // Appearance
          'bg-card border border-border/60 rounded-xl',
          'shadow-[0_25px_60px_-12px_rgba(0,0,0,0.4)]',
          // Layout
          'flex flex-col overflow-hidden',
          // Entry animation
          'animate-in fade-in-0 slide-in-from-bottom-2 zoom-in-[0.98] duration-200'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-12 px-4 border-b border-border/40 shrink-0 bg-card/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 cursor-pointer"
            >
              <ArrowLeft className="size-4" />
              <span className="font-medium">Back</span>
            </button>
            <span className="text-border/60 mx-1">/</span>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          </div>
          <button
            onClick={handleClose}
            className={cn(
              'rounded-lg p-1.5 opacity-60 transition-all duration-150 cursor-pointer',
              'hover:opacity-100 hover:bg-muted',
              'focus:ring-2 focus:ring-ring focus:outline-none'
            )}
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
