import * as React from 'react';
import { useEffect, useCallback, useRef, useMemo } from 'react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, X, Menu, ChevronsUpDown, GitBranch, ArrowUp, ArrowDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/overlays';
import { Badge } from '@/components/ui/layout';
import { wouldCreateCircularDependency } from '@dmaker/dependency-resolver';
import type { Feature } from '@dmaker/types';

// ============================================================================
// AnsiOutput
// ============================================================================

interface AnsiOutputProps {
  text: string;
  className?: string;
}

// ANSI color codes to CSS color mappings
const ANSI_COLORS: Record<number, string> = {
  // Standard colors
  30: '#6b7280', // Black (use gray for visibility on dark bg)
  31: '#ef4444', // Red
  32: '#22c55e', // Green
  33: '#eab308', // Yellow
  34: '#3b82f6', // Blue
  35: '#a855f7', // Magenta
  36: '#06b6d4', // Cyan
  37: '#d1d5db', // White
  // Bright colors
  90: '#9ca3af', // Bright Black (Gray)
  91: '#f87171', // Bright Red
  92: '#4ade80', // Bright Green
  93: '#facc15', // Bright Yellow
  94: '#60a5fa', // Bright Blue
  95: '#c084fc', // Bright Magenta
  96: '#22d3ee', // Bright Cyan
  97: '#ffffff', // Bright White
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: 'transparent',
  41: '#ef4444',
  42: '#22c55e',
  43: '#eab308',
  44: '#3b82f6',
  45: '#a855f7',
  46: '#06b6d4',
  47: '#f3f4f6',
  // Bright backgrounds
  100: '#374151',
  101: '#f87171',
  102: '#4ade80',
  103: '#facc15',
  104: '#60a5fa',
  105: '#c084fc',
  106: '#22d3ee',
  107: '#ffffff',
};

interface TextSegment {
  text: string;
  style: {
    color?: string;
    backgroundColor?: string;
    fontWeight?: string;
    fontStyle?: string;
    textDecoration?: string;
  };
}

/**
 * Strip hyperlink escape sequences (OSC 8)
 * Format: ESC]8;;url ESC\ text ESC]8;; ESC\
 */
function stripHyperlinks(text: string): string {
  // Remove OSC 8 hyperlink sequences
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

/**
 * Strip other OSC sequences (title, etc.)
 */
function stripOtherOSC(text: string): string {
  // Remove OSC sequences (ESC ] ... BEL or ESC ] ... ST)
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

function parseAnsi(text: string): TextSegment[] {
  // Pre-process: strip hyperlinks and other OSC sequences
  let processedText = stripHyperlinks(text);
  processedText = stripOtherOSC(processedText);

  const segments: TextSegment[] = [];

  // Match ANSI escape sequences: ESC[...m (SGR - Select Graphic Rendition)
  // Also handle ESC[K (erase line) and other CSI sequences by stripping them
  // The ESC character can be \x1b, \033, \u001b
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /\x1b\[([0-9;]*)([a-zA-Z])/g;

  let currentStyle: TextSegment['style'] = {};
  let lastIndex = 0;
  let match;

  while ((match = ansiRegex.exec(processedText)) !== null) {
    // Add text before this escape sequence
    if (match.index > lastIndex) {
      const content = processedText.slice(lastIndex, match.index);
      if (content) {
        segments.push({ text: content, style: { ...currentStyle } });
      }
    }

    const params = match[1];
    const command = match[2];

    // Only process 'm' command (SGR - graphics/color)
    // Ignore other commands like K (erase), H (cursor), J (clear), etc.
    if (command === 'm') {
      // Parse the escape sequence codes
      const codes = params ? params.split(';').map((c) => parseInt(c, 10) || 0) : [0];

      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];

        if (code === 0) {
          // Reset all attributes
          currentStyle = {};
        } else if (code === 1) {
          // Bold
          currentStyle.fontWeight = 'bold';
        } else if (code === 2) {
          // Dim/faint
          currentStyle.color = 'var(--muted-foreground)';
        } else if (code === 3) {
          // Italic
          currentStyle.fontStyle = 'italic';
        } else if (code === 4) {
          // Underline
          currentStyle.textDecoration = 'underline';
        } else if (code === 22) {
          // Normal intensity (not bold, not dim)
          currentStyle.fontWeight = undefined;
        } else if (code === 23) {
          // Not italic
          currentStyle.fontStyle = undefined;
        } else if (code === 24) {
          // Not underlined
          currentStyle.textDecoration = undefined;
        } else if (code === 38) {
          // Extended foreground color
          if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
            // 256 color mode: 38;5;n
            const colorIndex = codes[i + 2];
            currentStyle.color = get256Color(colorIndex);
            i += 2;
          } else if (codes[i + 1] === 2 && codes[i + 4] !== undefined) {
            // RGB mode: 38;2;r;g;b
            const r = codes[i + 2];
            const g = codes[i + 3];
            const b = codes[i + 4];
            currentStyle.color = `rgb(${r}, ${g}, ${b})`;
            i += 4;
          }
        } else if (code === 48) {
          // Extended background color
          if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
            // 256 color mode: 48;5;n
            const colorIndex = codes[i + 2];
            currentStyle.backgroundColor = get256Color(colorIndex);
            i += 2;
          } else if (codes[i + 1] === 2 && codes[i + 4] !== undefined) {
            // RGB mode: 48;2;r;g;b
            const r = codes[i + 2];
            const g = codes[i + 3];
            const b = codes[i + 4];
            currentStyle.backgroundColor = `rgb(${r}, ${g}, ${b})`;
            i += 4;
          }
        } else if (ANSI_COLORS[code]) {
          // Standard foreground color (30-37, 90-97)
          currentStyle.color = ANSI_COLORS[code];
        } else if (ANSI_BG_COLORS[code]) {
          // Standard background color (40-47, 100-107)
          currentStyle.backgroundColor = ANSI_BG_COLORS[code];
        } else if (code === 39) {
          // Default foreground
          currentStyle.color = undefined;
        } else if (code === 49) {
          // Default background
          currentStyle.backgroundColor = undefined;
        }
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last escape sequence
  if (lastIndex < processedText.length) {
    const content = processedText.slice(lastIndex);
    if (content) {
      segments.push({ text: content, style: { ...currentStyle } });
    }
  }

  // If no segments were created (no ANSI codes), return the whole text
  if (segments.length === 0 && processedText) {
    segments.push({ text: processedText, style: {} });
  }

  return segments;
}

/**
 * Convert 256-color palette index to CSS color
 */
function get256Color(index: number): string {
  // 0-15: Standard colors
  if (index < 16) {
    const standardColors = [
      '#000000',
      '#cd0000',
      '#00cd00',
      '#cdcd00',
      '#0000ee',
      '#cd00cd',
      '#00cdcd',
      '#e5e5e5',
      '#7f7f7f',
      '#ff0000',
      '#00ff00',
      '#ffff00',
      '#5c5cff',
      '#ff00ff',
      '#00ffff',
      '#ffffff',
    ];
    return standardColors[index];
  }

  // 16-231: 6x6x6 color cube
  if (index < 232) {
    const n = index - 16;
    const b = n % 6;
    const g = Math.floor(n / 6) % 6;
    const r = Math.floor(n / 36);
    const toHex = (v: number) => (v === 0 ? 0 : 55 + v * 40);
    return `rgb(${toHex(r)}, ${toHex(g)}, ${toHex(b)})`;
  }

  // 232-255: Grayscale
  const gray = 8 + (index - 232) * 10;
  return `rgb(${gray}, ${gray}, ${gray})`;
}

function AnsiOutput({ text, className }: AnsiOutputProps) {
  const segments = useMemo(() => parseAnsi(text), [text]);

  return (
    <pre
      className={cn(
        'font-mono text-xs whitespace-pre-wrap break-words text-muted-foreground',
        className
      )}
    >
      {segments.map((segment, index) => (
        <span
          key={index}
          style={{
            color: segment.style.color,
            backgroundColor: segment.style.backgroundColor,
            fontWeight: segment.style.fontWeight,
            fontStyle: segment.style.fontStyle,
            textDecoration: segment.style.textDecoration,
          }}
        >
          {segment.text}
        </span>
      ))}
    </pre>
  );
}

// ============================================================================
// CountUpTimer
// ============================================================================

interface CountUpTimerProps {
  startedAt: string; // ISO timestamp string
  className?: string;
}

/**
 * Formats elapsed time in MM:SS format
 * @param seconds - Total elapsed seconds
 * @returns Formatted string like "00:00", "01:30", "59:59", etc.
 */
function formatElapsedTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  const paddedMinutes = minutes.toString().padStart(2, '0');
  const paddedSeconds = remainingSeconds.toString().padStart(2, '0');

  return `${paddedMinutes}:${paddedSeconds}`;
}

/**
 * CountUpTimer component that displays elapsed time since a given start time
 * Updates every second to show the current elapsed time in MM:SS format
 */
function CountUpTimer({ startedAt, className = '' }: CountUpTimerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    // Calculate initial elapsed time
    const startTime = new Date(startedAt).getTime();

    const calculateElapsed = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);
      return Math.max(0, elapsed); // Ensure non-negative
    };

    // Set initial value
    setElapsedSeconds(calculateElapsed());

    // Update every second
    const interval = setInterval(() => {
      setElapsedSeconds(calculateElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <div
      className={`flex items-center gap-1 text-xs text-muted-foreground ${className}`}
      data-testid="count-up-timer"
    >
      <Clock className="w-3 h-3" />
      <span data-testid="timer-display">{formatElapsedTime(elapsedSeconds)}</span>
    </div>
  );
}

// ============================================================================
// HotkeyButton
// ============================================================================

export interface HotkeyConfig {
  /** The key to trigger the hotkey (e.g., "Enter", "s", "n") */
  key: string;
  /** Whether the Cmd/Ctrl modifier is required */
  cmdCtrl?: boolean;
  /** Whether the Shift modifier is required */
  shift?: boolean;
  /** Whether the Alt/Option modifier is required */
  alt?: boolean;
  /** Custom display label for the hotkey (overrides auto-generated label) */
  label?: string;
}

export interface HotkeyButtonProps
  extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Hotkey configuration - can be a simple key string or a full config object */
  hotkey?: string | HotkeyConfig;
  /** Whether to show the hotkey indicator badge */
  showHotkeyIndicator?: boolean;
  /** Whether the hotkey listener is active (registers keyboard listener). Set to false if hotkey is already handled elsewhere. */
  hotkeyActive?: boolean;
  /** Optional scope element ref - hotkey will only work when this element is visible */
  scopeRef?: React.RefObject<HTMLElement | null>;
  /** Callback when hotkey is triggered */
  onHotkeyTrigger?: () => void;
  /** Whether to use the Slot component for composition */
  asChild?: boolean;
}

/**
 * Get the modifier key symbol based on platform
 */
function getModifierSymbol(isMac: boolean): string {
  return isMac ? '\u2318' : 'Ctrl';
}

/**
 * Parse hotkey config into a normalized format
 */
function parseHotkeyConfig(hotkey: string | HotkeyConfig): HotkeyConfig {
  if (typeof hotkey === 'string') {
    return { key: hotkey };
  }
  return hotkey;
}

/**
 * Generate the display label for the hotkey
 */
function getHotkeyDisplayLabel(config: HotkeyConfig, isMac: boolean): React.ReactNode {
  if (config.label) {
    return config.label;
  }

  const parts: React.ReactNode[] = [];

  if (config.cmdCtrl) {
    parts.push(
      <span key="mod" className="leading-none flex items-center justify-center">
        {getModifierSymbol(isMac)}
      </span>
    );
  }

  if (config.shift) {
    parts.push(
      <span key="shift" className="leading-none flex items-center justify-center">
        {'\u21E7'}
      </span>
    );
  }

  if (config.alt) {
    parts.push(
      <span key="alt" className="leading-none flex items-center justify-center">
        {isMac ? '\u2325' : 'Alt'}
      </span>
    );
  }

  // Convert key to display format
  let keyDisplay = config.key;
  switch (config.key.toLowerCase()) {
    case 'enter':
      keyDisplay = '\u21B5';
      break;
    case 'escape':
    case 'esc':
      keyDisplay = 'Esc';
      break;
    case 'arrowup':
      keyDisplay = '\u2191';
      break;
    case 'arrowdown':
      keyDisplay = '\u2193';
      break;
    case 'arrowleft':
      keyDisplay = '\u2190';
      break;
    case 'arrowright':
      keyDisplay = '\u2192';
      break;
    case 'backspace':
      keyDisplay = '\u232B';
      break;
    case 'delete':
      keyDisplay = '\u2326';
      break;
    case 'tab':
      keyDisplay = '\u21E5';
      break;
    case ' ':
      keyDisplay = 'Space';
      break;
    default:
      // Capitalize single letters
      if (config.key.length === 1) {
        keyDisplay = config.key.toUpperCase();
      }
  }

  parts.push(
    <span key="key" className="leading-none flex items-center justify-center">
      {keyDisplay}
    </span>
  );

  return <span className="inline-flex items-center gap-1.5">{parts}</span>;
}

/**
 * Check if an element is a form input
 */
function isInputElement(element: Element | null): boolean {
  if (!element) return false;

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  if (element.getAttribute('contenteditable') === 'true') {
    return true;
  }

  const role = element.getAttribute('role');
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
    return true;
  }

  return false;
}

/**
 * A button component that supports keyboard hotkeys
 *
 * Features:
 * - Automatic hotkey listening when mounted
 * - Visual hotkey indicator badge
 * - Support for modifier keys (Cmd/Ctrl, Shift, Alt)
 * - Respects focus context (doesn't trigger when typing in inputs)
 * - Scoped activation via scopeRef
 */
function HotkeyButton({
  hotkey,
  showHotkeyIndicator = true,
  hotkeyActive = true,
  scopeRef,
  onHotkeyTrigger,
  onClick,
  disabled,
  children,
  className,
  variant,
  size,
  asChild = false,
  ...props
}: HotkeyButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isMac, setIsMac] = React.useState(true);

  // Detect platform on mount
  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes('mac'));
  }, []);

  const config = hotkey ? parseHotkeyConfig(hotkey) : null;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!config || !hotkeyActive || disabled) return;

      // Don't trigger when typing in inputs (unless explicitly scoped or using cmdCtrl modifier)
      // cmdCtrl shortcuts like Cmd+Enter should work even in inputs as they're intentional submit actions
      if (!scopeRef && !config.cmdCtrl && isInputElement(document.activeElement)) {
        return;
      }

      // Check modifier keys
      const cmdCtrlPressed = event.metaKey || event.ctrlKey;
      const shiftPressed = event.shiftKey;
      const altPressed = event.altKey;

      // Validate modifier requirements
      if (config.cmdCtrl && !cmdCtrlPressed) return;
      if (!config.cmdCtrl && cmdCtrlPressed) return;
      if (config.shift && !shiftPressed) return;
      if (!config.shift && shiftPressed) return;
      if (config.alt && !altPressed) return;
      if (!config.alt && altPressed) return;

      // Check if the key matches
      if (event.key.toLowerCase() !== config.key.toLowerCase()) return;

      // If scoped, check that the scope element is visible
      if (scopeRef && scopeRef.current) {
        const scopeEl = scopeRef.current;
        const isVisible =
          scopeEl.offsetParent !== null || getComputedStyle(scopeEl).display !== 'none';
        if (!isVisible) return;
      }

      event.preventDefault();
      event.stopPropagation();

      // Trigger the click handler or custom onHotkeyTrigger
      if (onHotkeyTrigger) {
        onHotkeyTrigger();
      } else if (onClick) {
        onClick(event as unknown as React.MouseEvent<HTMLButtonElement>);
      } else if (buttonRef.current) {
        buttonRef.current.click();
      }
    },
    [config, hotkeyActive, disabled, scopeRef, onHotkeyTrigger, onClick]
  );

  // Set up global key listener
  useEffect(() => {
    if (!config || !hotkeyActive) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [config, hotkeyActive, handleKeyDown]);

  // Render the hotkey indicator
  const hotkeyIndicator =
    config && showHotkeyIndicator ? (
      <span
        className="px-2 py-0.5 text-[10px] font-mono rounded bg-primary-foreground/10 border border-primary-foreground/20 inline-flex items-center gap-1.5"
        data-testid="hotkey-indicator"
      >
        {getHotkeyDisplayLabel(config, isMac)}
      </span>
    ) : null;

  return (
    <Button
      ref={buttonRef}
      variant={variant}
      size={size}
      disabled={disabled}
      onClick={onClick}
      className={cn(className)}
      asChild={asChild}
      {...props}
    >
      {typeof children === 'string' ? (
        <>
          {children}
          {hotkeyIndicator}
        </>
      ) : (
        <>
          {children}
          {hotkeyIndicator}
        </>
      )}
    </Button>
  );
}

// ============================================================================
// HeaderActionsPanel
// ============================================================================

interface HeaderActionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

/**
 * A slide-out panel for header actions on tablet and below.
 * Shows as a right-side panel that slides in from the right edge.
 * On desktop (lg+), this component is hidden and children should be rendered inline.
 */
function HeaderActionsPanel({
  isOpen,
  onClose,
  title = 'Actions',
  children,
}: HeaderActionsPanelProps) {
  // Use portal to render outside parent stacking contexts (backdrop-blur creates stacking context)
  const panelContent = (
    <>
      {/* Mobile backdrop overlay - only shown when isOpen is true on tablet/mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[60] lg:hidden"
          onClick={onClose}
          data-testid="header-actions-backdrop"
        />
      )}

      {/* Actions panel */}
      <div
        className={cn(
          // Mobile: fixed position overlay with slide transition from right
          'fixed inset-y-0 right-0 w-72 z-[70]',
          'transition-transform duration-200 ease-out',
          // Hide on mobile when closed, show when open
          isOpen ? 'translate-x-0' : 'translate-x-full',
          // Desktop: hidden entirely (actions shown inline in header)
          'lg:hidden',
          'flex flex-col',
          'border-l border-border/50',
          'bg-gradient-to-b from-card/95 via-card/90 to-card/85 backdrop-blur-xl'
        )}
      >
        {/* Panel header with close button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Close actions panel"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">{children}</div>
      </div>
    </>
  );

  // Render to document.body to escape stacking context
  if (typeof document !== 'undefined') {
    return createPortal(panelContent, document.body);
  }

  return panelContent;
}

interface HeaderActionsPanelTriggerProps {
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Toggle button for the HeaderActionsPanel.
 * Only visible on tablet and below (lg:hidden).
 */
function HeaderActionsPanelTrigger({
  isOpen,
  onToggle,
  className,
}: HeaderActionsPanelTriggerProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onToggle}
      className={cn('h-8 w-8 p-0 text-muted-foreground hover:text-foreground lg:hidden', className)}
      aria-label={isOpen ? 'Close actions menu' : 'Open actions menu'}
    >
      {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
    </Button>
  );
}

// ============================================================================
// DependencySelector
// ============================================================================

interface DependencySelectorProps {
  /** The current feature being edited (null for add mode) */
  currentFeatureId?: string;
  /** Selected feature IDs */
  value: string[];
  /** Callback when selection changes */
  onChange: (ids: string[]) => void;
  /** All available features to select from */
  features: Feature[];
  /** Type of dependency - 'parent' means features this depends on, 'child' means features that depend on this */
  type: 'parent' | 'child';
  /** Placeholder text */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Test ID for testing */
  'data-testid'?: string;
}

function DependencySelector({
  currentFeatureId,
  value,
  onChange,
  features,
  type,
  placeholder,
  disabled = false,
  'data-testid': testId,
}: DependencySelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const [triggerWidth, setTriggerWidth] = React.useState<number>(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // Update trigger width when component mounts or value changes
  React.useEffect(() => {
    if (triggerRef.current) {
      const updateWidth = () => {
        setTriggerWidth(triggerRef.current?.offsetWidth || 0);
      };

      updateWidth();

      const resizeObserver = new ResizeObserver(updateWidth);
      resizeObserver.observe(triggerRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [value]);

  // Get display label for a feature
  const getFeatureLabel = (feature: Feature): string => {
    if (feature.title && feature.title.trim()) {
      return feature.title;
    }
    // Truncate description to 50 chars
    const desc = feature.description || '';
    return desc.length > 50 ? desc.slice(0, 47) + '...' : desc;
  };

  // Filter out current feature and already selected features from options
  const availableFeatures = React.useMemo(() => {
    return features.filter((f) => {
      // Don't show current feature
      if (currentFeatureId && f.id === currentFeatureId) return false;
      // Don't show already selected features
      if (value.includes(f.id)) return false;
      return true;
    });
  }, [features, currentFeatureId, value]);

  // Filter by search input
  const filteredFeatures = React.useMemo(() => {
    if (!inputValue) return availableFeatures;
    const lower = inputValue.toLowerCase();
    return availableFeatures.filter((f) => {
      const label = getFeatureLabel(f).toLowerCase();
      return label.includes(lower) || f.id.toLowerCase().includes(lower);
    });
  }, [availableFeatures, inputValue]);

  // Check if selecting a feature would create a circular dependency
  const wouldCreateCycle = React.useCallback(
    (featureId: string): boolean => {
      if (!currentFeatureId) return false;

      // For parent dependencies: we're adding featureId to currentFeature.dependencies
      // This would create a cycle if featureId already depends on currentFeatureId
      if (type === 'parent') {
        return wouldCreateCircularDependency(features, featureId, currentFeatureId);
      }

      // For child dependencies: we're adding currentFeatureId to featureId.dependencies
      // This would create a cycle if currentFeatureId already depends on featureId
      return wouldCreateCircularDependency(features, currentFeatureId, featureId);
    },
    [features, currentFeatureId, type]
  );

  // Get selected features for display
  const selectedFeatures = React.useMemo(() => {
    return value
      .map((id) => features.find((f) => f.id === id))
      .filter((f): f is Feature => f !== undefined);
  }, [value, features]);

  const handleSelect = (featureId: string) => {
    if (!value.includes(featureId)) {
      onChange([...value, featureId]);
    }
    setInputValue('');
  };

  const handleRemove = (featureId: string) => {
    onChange(value.filter((id) => id !== featureId));
  };

  const defaultPlaceholder =
    type === 'parent' ? 'Select parent dependencies...' : 'Select child dependencies...';

  const Icon = type === 'parent' ? ArrowUp : ArrowDown;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn('w-full justify-between min-h-[40px]')}
            data-testid={testId}
          >
            <span className="flex items-center gap-2 truncate text-muted-foreground">
              <Icon className="w-4 h-4 shrink-0" />
              {placeholder || defaultPlaceholder}
            </span>
            <ChevronsUpDown className="opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0"
          style={{
            width: Math.max(triggerWidth, 300),
          }}
          data-testid={testId ? `${testId}-list` : undefined}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search features..."
              className="h-9"
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandList>
              <CommandEmpty>No features found.</CommandEmpty>
              <CommandGroup>
                {filteredFeatures.map((feature) => {
                  const willCreateCycle = wouldCreateCycle(feature.id);
                  const label = getFeatureLabel(feature);

                  return (
                    <CommandItem
                      key={feature.id}
                      value={feature.id}
                      onSelect={() => {
                        if (!willCreateCycle) {
                          handleSelect(feature.id);
                        }
                      }}
                      disabled={willCreateCycle}
                      className={cn(willCreateCycle && 'opacity-50 cursor-not-allowed')}
                      data-testid={`${testId}-option-${feature.id}`}
                    >
                      <GitBranch className="w-4 h-4 mr-2 text-muted-foreground" />
                      <span className="flex-1 truncate">{label}</span>
                      {willCreateCycle && (
                        <span className="ml-2 text-xs text-destructive">(circular)</span>
                      )}
                      {feature.status && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          {feature.status}
                        </Badge>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected items as badges */}
      {selectedFeatures.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedFeatures.map((feature) => (
            <Badge
              key={feature.id}
              variant="secondary"
              className="flex items-center gap-1 pr-1 text-xs"
            >
              <span className="truncate max-w-[150px]">{getFeatureLabel(feature)}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRemove(feature.id);
                }}
                className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                disabled={disabled}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export {
  AnsiOutput,
  CountUpTimer,
  HotkeyButton,
  getHotkeyDisplayLabel,
  parseHotkeyConfig,
  HeaderActionsPanel,
  HeaderActionsPanelTrigger,
  DependencySelector,
};
