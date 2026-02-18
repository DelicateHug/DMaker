import { useMemo, useRef, useEffect } from 'react';
import {
  useKeyboardShortcuts,
  useKeyboardShortcutsConfig,
  KeyboardShortcut,
} from '@/hooks/use-keyboard-shortcuts';
import { Feature } from '@/store/app-store';
import type { StatusTabId } from './use-board-status-tabs';

interface UseBoardKeyboardShortcutsProps {
  features: Feature[];
  runningAutoTasks: string[];
  onAddFeature: () => void;
  onStartNextFeatures: () => void;
  onViewOutput: (feature: Feature) => void;
  onToggleAutoMode?: () => void;
  /** Callback to navigate to the next status tab */
  onNextTab?: () => void;
  /** Callback to navigate to the previous status tab */
  onPreviousTab?: () => void;
  /** Callback to navigate to a specific tab by index (0-based) */
  onGoToTab?: (tabId: StatusTabId) => void;
  /** Available tabs for direct navigation */
  tabs?: Array<{ id: StatusTabId }>;
  /** Callback to toggle file explorer panel */
  onToggleFileExplorer?: () => void;
  /** Callback to toggle kanban board panel */
  onToggleKanbanPanel?: () => void;
  /** Callback to toggle agent chat panel */
  onToggleAgentChat?: () => void;
  /** Callback to toggle deploy panel */
  onToggleDeployPanel?: () => void;
}

export function useBoardKeyboardShortcuts({
  features,
  runningAutoTasks,
  onAddFeature,
  onStartNextFeatures,
  onViewOutput,
  onToggleAutoMode,
  onNextTab,
  onPreviousTab,
  onGoToTab,
  tabs,
  onToggleFileExplorer,
  onToggleKanbanPanel,
  onToggleAgentChat,
  onToggleDeployPanel,
}: UseBoardKeyboardShortcutsProps) {
  const shortcuts = useKeyboardShortcutsConfig();

  // Get in-progress features for keyboard shortcuts (memoized for shortcuts)
  const inProgressFeaturesForShortcuts = useMemo(() => {
    return features.filter((f) => {
      const isRunning = runningAutoTasks.includes(f.id);
      return isRunning || f.status === 'in_progress';
    });
  }, [features, runningAutoTasks]);

  // Ref to hold the start next callback (to avoid dependency issues)
  const startNextFeaturesRef = useRef<() => void>(() => {});

  // Update ref when callback changes
  useEffect(() => {
    startNextFeaturesRef.current = onStartNextFeatures;
  }, [onStartNextFeatures]);

  // Keyboard shortcuts for this view
  const boardShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcutsList: KeyboardShortcut[] = [
      {
        key: shortcuts.addFeature,
        action: onAddFeature,
        description: 'Add new feature',
      },
      {
        key: shortcuts.startNext,
        action: () => startNextFeaturesRef.current(),
        description: 'Start next features from backlog',
      },
    ];

    // Add auto mode shortcut if callback is provided
    if (onToggleAutoMode) {
      shortcutsList.push({
        key: shortcuts.autoMode,
        action: onToggleAutoMode,
        description: 'Open auto mode settings modal',
      });
    }

    // Add shortcuts for in-progress cards (1-9 and 0 for 10th)
    inProgressFeaturesForShortcuts.slice(0, 10).forEach((feature, index) => {
      // Keys 1-9 for first 9 cards, 0 for 10th card
      const key = index === 9 ? '0' : String(index + 1);
      shortcutsList.push({
        key,
        action: () => {
          onViewOutput(feature);
        },
        description: `View output for in-progress card ${index + 1}`,
      });
    });

    // Add tab navigation shortcuts
    if (onNextTab) {
      shortcutsList.push({
        key: ']',
        action: onNextTab,
        description: 'Go to next status tab',
      });
    }

    if (onPreviousTab) {
      shortcutsList.push({
        key: '[',
        action: onPreviousTab,
        description: 'Go to previous status tab',
      });
    }

    // Add direct tab navigation shortcuts (Shift+1, Shift+2, Shift+3, etc.)
    if (onGoToTab && tabs && tabs.length > 0) {
      tabs.slice(0, 9).forEach((tab, index) => {
        shortcutsList.push({
          key: `Shift+${index + 1}`,
          action: () => onGoToTab(tab.id),
          description: `Go to ${tab.id} tab`,
        });
      });
    }

    // Board panel toggle shortcuts
    if (onToggleFileExplorer) {
      shortcutsList.push({
        key: shortcuts.toggleFileExplorer,
        action: onToggleFileExplorer,
        description: 'Toggle file explorer panel',
      });
    }

    if (onToggleKanbanPanel) {
      shortcutsList.push({
        key: shortcuts.toggleKanbanPanel,
        action: onToggleKanbanPanel,
        description: 'Toggle kanban board panel',
      });
    }

    if (onToggleAgentChat) {
      shortcutsList.push({
        key: shortcuts.toggleAgentChat,
        action: onToggleAgentChat,
        description: 'Toggle agent chat panel',
      });
    }

    if (onToggleDeployPanel) {
      shortcutsList.push({
        key: shortcuts.toggleDeployPanel,
        action: onToggleDeployPanel,
        description: 'Toggle deploy panel',
      });
    }

    return shortcutsList;
  }, [
    inProgressFeaturesForShortcuts,
    shortcuts,
    onAddFeature,
    onViewOutput,
    onToggleAutoMode,
    onNextTab,
    onPreviousTab,
    onGoToTab,
    tabs,
    onToggleFileExplorer,
    onToggleKanbanPanel,
    onToggleAgentChat,
    onToggleDeployPanel,
  ]);

  useKeyboardShortcuts(boardShortcuts);

  return {
    inProgressFeaturesForShortcuts,
  };
}
