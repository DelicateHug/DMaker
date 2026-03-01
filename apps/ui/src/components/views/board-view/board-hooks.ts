import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAppStore, defaultBackgroundSettings, Feature } from '@/store/app-store';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';
import {
  FeatureImagePath as DescriptionImagePath,
  ImagePreviewMap,
} from '@/components/ui/description-image-dropzone';
import type { FollowUpHistoryEntry } from './dialogs/follow-up-dialog';

// --- useBoardBackground ---

interface UseBoardBackgroundProps {
  currentProject: { path: string; id: string } | null;
}

export function useBoardBackground({ currentProject }: UseBoardBackgroundProps) {
  const boardBackgroundByProject = useAppStore((state) => state.boardBackgroundByProject);

  const backgroundSettings = useMemo(() => {
    return (
      (currentProject && boardBackgroundByProject[currentProject.path]) || defaultBackgroundSettings
    );
  }, [currentProject, boardBackgroundByProject]);

  const backgroundImageStyle = useMemo(() => {
    if (!backgroundSettings.imagePath || !currentProject) {
      return {};
    }

    const imageUrl = getAuthenticatedImageUrl(
      backgroundSettings.imagePath,
      currentProject.path,
      backgroundSettings.imageVersion
    );

    return {
      backgroundImage: `url(${imageUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    } as React.CSSProperties;
  }, [backgroundSettings, currentProject]);

  return {
    backgroundSettings,
    backgroundImageStyle,
  };
}

// --- useFollowUpState ---

/**
 * Custom hook for managing follow-up dialog state including prompt history
 */
export function useFollowUpState() {
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [followUpFeature, setFollowUpFeature] = useState<Feature | null>(null);
  const [followUpPrompt, setFollowUpPrompt] = useState('');
  const [followUpImagePaths, setFollowUpImagePaths] = useState<DescriptionImagePath[]>([]);
  const [followUpPreviewMap, setFollowUpPreviewMap] = useState<ImagePreviewMap>(() => new Map());
  const [followUpPromptHistory, setFollowUpPromptHistory] = useState<FollowUpHistoryEntry[]>([]);

  const resetFollowUpState = useCallback(() => {
    setShowFollowUpDialog(false);
    setFollowUpFeature(null);
    setFollowUpPrompt('');
    setFollowUpImagePaths([]);
    setFollowUpPreviewMap(new Map());
    setFollowUpPromptHistory([]);
  }, []);

  const handleFollowUpDialogChange = useCallback(
    (open: boolean) => {
      if (!open) {
        resetFollowUpState();
      } else {
        setShowFollowUpDialog(open);
      }
    },
    [resetFollowUpState]
  );

  /**
   * Adds a new entry to the prompt history
   */
  const addToPromptHistory = useCallback((entry: FollowUpHistoryEntry) => {
    setFollowUpPromptHistory((prev) => [...prev, entry]);
  }, []);

  return {
    // State
    showFollowUpDialog,
    followUpFeature,
    followUpPrompt,
    followUpImagePaths,
    followUpPreviewMap,
    followUpPromptHistory,
    // Setters
    setShowFollowUpDialog,
    setFollowUpFeature,
    setFollowUpPrompt,
    setFollowUpImagePaths,
    setFollowUpPreviewMap,
    setFollowUpPromptHistory,
    // Helpers
    resetFollowUpState,
    handleFollowUpDialogChange,
    addToPromptHistory,
  };
}

// --- useSelectionMode ---

export type SelectionTarget = 'backlog' | 'waiting_approval' | null;

interface UseSelectionModeReturn {
  isSelectionMode: boolean;
  selectionTarget: SelectionTarget;
  selectedFeatureIds: Set<string>;
  selectedCount: number;
  toggleSelectionMode: (target?: SelectionTarget) => void;
  toggleFeatureSelection: (featureId: string) => void;
  selectAll: (featureIds: string[]) => void;
  clearSelection: () => void;
  isFeatureSelected: (featureId: string) => boolean;
  exitSelectionMode: () => void;
}

export function useSelectionMode(): UseSelectionModeReturn {
  const [selectionTarget, setSelectionTarget] = useState<SelectionTarget>(null);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<Set<string>>(new Set());

  const isSelectionMode = selectionTarget !== null;

  const toggleSelectionMode = useCallback((target: SelectionTarget = 'backlog') => {
    setSelectionTarget((prev) => {
      if (prev === target) {
        setSelectedFeatureIds(new Set());
        return null;
      }
      setSelectedFeatureIds(new Set());
      return target;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionTarget(null);
    setSelectedFeatureIds(new Set());
  }, []);

  const toggleFeatureSelection = useCallback((featureId: string) => {
    setSelectedFeatureIds((prev) => {
      const next = new Set(prev);
      if (next.has(featureId)) {
        next.delete(featureId);
      } else {
        next.add(featureId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((featureIds: string[]) => {
    setSelectedFeatureIds(new Set(featureIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFeatureIds(new Set());
  }, []);

  const isFeatureSelected = useCallback(
    (featureId: string) => selectedFeatureIds.has(featureId),
    [selectedFeatureIds]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSelectionMode) {
        exitSelectionMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelectionMode, exitSelectionMode]);

  return {
    isSelectionMode,
    selectionTarget,
    selectedFeatureIds,
    selectedCount: selectedFeatureIds.size,
    toggleSelectionMode,
    toggleFeatureSelection,
    selectAll,
    clearSelection,
    isFeatureSelected,
    exitSelectionMode,
  };
}
