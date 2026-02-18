/**
 * Re-export PhaseModelSelector for use in board-view dialogs.
 * This ensures board-view components can import all selectors from '../shared'
 * instead of reaching into the settings-view directory.
 */

import { PhaseModelSelector } from '@/components/views/settings-view/model-defaults/phase-model-selector';
import type { PhaseModelEntry } from '@automaker/types';

// Re-export for convenience
export { PhaseModelSelector };
export type { PhaseModelEntry };

interface BoardModelSelectorProps {
  /** Label shown above the selector */
  label?: string;
  /** Description shown below the label */
  description?: string;
  /** Current model selection (model + optional thinking level / reasoning effort) */
  value: PhaseModelEntry;
  /** Callback when model is selected */
  onChange: (entry: PhaseModelEntry) => void;
  /** Compact mode - just shows the button trigger without label/description wrapper */
  compact?: boolean;
  /** Custom trigger class name */
  triggerClassName?: string;
  /** Popover alignment */
  align?: 'start' | 'end';
  /** Disabled state */
  disabled?: boolean;
}

/**
 * BoardModelSelector - Model selector wrapper for board-view dialogs.
 *
 * Wraps PhaseModelSelector with board-view-appropriate defaults.
 * Use this in feature dialogs (add, edit, mass-edit) for consistent
 * model selection across the board view.
 *
 * @example
 * ```tsx
 * <BoardModelSelector
 *   label="AI Model"
 *   description="Select the model for this feature"
 *   value={{ model: 'sonnet', thinkingLevel: 'none' }}
 *   onChange={(entry) => setModelEntry(entry)}
 * />
 * ```
 */
export function BoardModelSelector({
  label,
  description,
  value,
  onChange,
  compact = false,
  triggerClassName,
  align = 'end',
  disabled = false,
}: BoardModelSelectorProps) {
  return (
    <PhaseModelSelector
      label={label}
      description={description}
      value={value}
      onChange={onChange}
      compact={compact}
      triggerClassName={triggerClassName}
      align={align}
      disabled={disabled}
    />
  );
}
