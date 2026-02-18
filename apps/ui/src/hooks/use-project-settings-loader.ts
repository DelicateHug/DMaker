import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { loadFontByFamily } from '@/lib/font-loader';

/**
 * Selector for project settings loader state and actions
 */
const selectProjectSettingsLoader = (state: ReturnType<typeof useAppStore.getState>) => ({
  currentProject: state.currentProject,
  setBoardBackground: state.setBoardBackground,
  setCardOpacity: state.setCardOpacity,
  setColumnOpacity: state.setColumnOpacity,
  setColumnBorderEnabled: state.setColumnBorderEnabled,
  setCardGlassmorphism: state.setCardGlassmorphism,
  setCardBorderEnabled: state.setCardBorderEnabled,
  setCardBorderOpacity: state.setCardBorderOpacity,
  setHideScrollbar: state.setHideScrollbar,
  setWorktreePanelVisible: state.setWorktreePanelVisible,
  setShowInitScriptIndicator: state.setShowInitScriptIndicator,
  setDefaultDeleteBranch: state.setDefaultDeleteBranch,
  setAutoDismissInitScriptIndicator: state.setAutoDismissInitScriptIndicator,
  setProjectFontSans: state.setProjectFontSans,
  setProjectFontMono: state.setProjectFontMono,
});

/**
 * Hook that loads project settings from the server when the current project changes.
 * This ensures that settings like board backgrounds are properly restored when
 * switching between projects or restarting the app.
 */
export function useProjectSettingsLoader() {
  const {
    currentProject,
    setBoardBackground,
    setCardOpacity,
    setColumnOpacity,
    setColumnBorderEnabled,
    setCardGlassmorphism,
    setCardBorderEnabled,
    setCardBorderOpacity,
    setHideScrollbar,
    setWorktreePanelVisible,
    setShowInitScriptIndicator,
    setDefaultDeleteBranch,
    setAutoDismissInitScriptIndicator,
    setProjectFontSans,
    setProjectFontMono,
  } = useAppStore(useShallow(selectProjectSettingsLoader));

  const loadingRef = useRef<string | null>(null);
  const currentProjectRef = useRef<string | null>(null);

  useEffect(() => {
    currentProjectRef.current = currentProject?.path ?? null;

    if (!currentProject?.path) {
      return;
    }

    // Prevent loading the same project multiple times
    if (loadingRef.current === currentProject.path) {
      return;
    }

    loadingRef.current = currentProject.path;
    const requestedProjectPath = currentProject.path;

    const loadProjectSettings = async () => {
      try {
        const httpClient = getHttpApiClient();
        const result = await httpClient.settings.getProject(requestedProjectPath);

        // Race condition protection: ignore stale results if project changed
        if (currentProjectRef.current !== requestedProjectPath) {
          return;
        }

        if (result.success && result.settings) {
          const bg = result.settings.boardBackground;

          // Apply boardBackground if present
          if (bg?.imagePath) {
            setBoardBackground(requestedProjectPath, bg.imagePath);
          }

          // Settings map for cleaner iteration
          const settingsMap = {
            cardOpacity: setCardOpacity,
            columnOpacity: setColumnOpacity,
            columnBorderEnabled: setColumnBorderEnabled,
            cardGlassmorphism: setCardGlassmorphism,
            cardBorderEnabled: setCardBorderEnabled,
            cardBorderOpacity: setCardBorderOpacity,
            hideScrollbar: setHideScrollbar,
          } as const;

          // Apply all settings that are defined
          for (const [key, setter] of Object.entries(settingsMap)) {
            const value = bg?.[key as keyof typeof bg];
            if (value !== undefined) {
              (setter as (path: string, val: typeof value) => void)(requestedProjectPath, value);
            }
          }

          // Apply worktreePanelVisible if present
          if (result.settings.worktreePanelVisible !== undefined) {
            setWorktreePanelVisible(requestedProjectPath, result.settings.worktreePanelVisible);
          }

          // Apply showInitScriptIndicator if present
          if (result.settings.showInitScriptIndicator !== undefined) {
            setShowInitScriptIndicator(
              requestedProjectPath,
              result.settings.showInitScriptIndicator
            );
          }

          // Apply defaultDeleteBranch if present
          if (result.settings.defaultDeleteBranchWithWorktree !== undefined) {
            setDefaultDeleteBranch(
              requestedProjectPath,
              result.settings.defaultDeleteBranchWithWorktree
            );
          }

          // Apply autoDismissInitScriptIndicator if present
          if (result.settings.autoDismissInitScriptIndicator !== undefined) {
            setAutoDismissInitScriptIndicator(
              requestedProjectPath,
              result.settings.autoDismissInitScriptIndicator
            );
          }

          // Apply project-specific font overrides and preload bundled font assets.
          // Setting these in the store triggers __root.tsx's font effect to apply
          // CSS variables. We also eagerly call loadFontByFamily here so that
          // bundled fonts (e.g. Zed Sans/Mono) start loading in parallel.
          // Use getState() to read the latest project ID after the async gap.
          const projectId = useAppStore.getState().currentProject?.id;
          if (projectId) {
            const { fontFamilySans, fontFamilyMono } = result.settings;

            if (fontFamilySans !== undefined) {
              setProjectFontSans(projectId, fontFamilySans || null);
              // Start loading bundled font assets immediately
              if (fontFamilySans) {
                loadFontByFamily(fontFamilySans).catch(() => {});
              }
            }

            if (fontFamilyMono !== undefined) {
              setProjectFontMono(projectId, fontFamilyMono || null);
              // Start loading bundled font assets immediately
              if (fontFamilyMono) {
                loadFontByFamily(fontFamilyMono).catch(() => {});
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to load project settings:', error);
        // Don't show error toast - just log it
      }
    };

    loadProjectSettings();
  }, [currentProject?.path]);
}
