/**
 * Re-export PhaseModelSelector in compact mode for use in agent chat view.
 * This ensures we have a single source of truth for model selection logic.
 */

import { PhaseModelSelector } from '@/components/views/settings-view/model-defaults/phase-model-selector';
import type { PhaseModelEntry } from '@dmaker/types';

// Re-export types for convenience
export type { PhaseModelEntry };

// --- Agent Constants ---

export const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant' as const,
  content:
    "Hello! I'm the DMaker Agent. I can help you build software autonomously. I can read and modify files in this project, run commands, and execute tests. What would you like to create today?",
  timestamp: new Date().toISOString(),
};

// --- AgentModelSelector ---

interface AgentModelSelectorProps {
  /** Current model selection (model + optional thinking level) */
  value: PhaseModelEntry;
  /** Callback when model is selected */
  onChange: (entry: PhaseModelEntry) => void;
  /** Disabled state */
  disabled?: boolean;
}

export function AgentModelSelector({ value, onChange, disabled }: AgentModelSelectorProps) {
  return (
    <PhaseModelSelector value={value} onChange={onChange} disabled={disabled} compact align="end" />
  );
}
