import { createRootRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useState, useCallback, useDeferredValue } from 'react';
import { createLogger } from '@dmaker/utils/logger';
import { loadFontByFamily } from '@/lib/font-loader';
import { loadTheme } from '@/lib/theme-loader';
import { TopNavigationBar } from '@/components/layout/top-nav-bar';
import {
  FileBrowserProvider,
  useFileBrowser,
  setGlobalFileBrowser,
} from '@/contexts/file-browser-context';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, getStoredTheme, type ThemeMode } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { useAuthStore } from '@/store/auth-store';
import { getElectronAPI, isElectron } from '@/lib/electron';
import { isMac } from '@/lib/utils';
import { initializeProject } from '@/lib/project-init';
import {
  getServerUrlSync,
  getHttpApiClient,
  handleServerOffline,
  initServerUrl,
} from '@/lib/http-api-client';
import {
  hydrateStoreFromSettings,
  signalMigrationComplete,
  performSettingsMigration,
} from '@/hooks/use-settings-migration';
import { Toaster } from 'sonner';
import { ThemeOption, themeOptions } from '@/config';
import { LoadingState } from '@/components/ui/loading-state';
import { LayerStack } from '@/components/ui/layer-stack';
import { RouteErrorBoundary } from '@/components/ui/route-error-boundary';
import { useProjectSettingsLoader } from '@/hooks/use-project-settings-loader';
import { useLayerStore, type LayerId } from '@/store/layer-store';
import type { Project } from '@/lib/electron';

// Lazy-load the board view (also eagerly preloaded below)
const LazyBoardView = lazy(() =>
  import('@/components/views/board-view').then((m) => ({ default: m.BoardView }))
);

// Eagerly preload the board view chunk so it's ready when gates clear.
// This runs at module evaluation time (before any component renders).
void import('@/components/views/board-view');

const logger = createLogger('RootLayout');
const SERVER_READY_MAX_ATTEMPTS = 4;
const SERVER_READY_BACKOFF_BASE_MS = 250;
const SERVER_READY_MAX_DELAY_MS = 1500;
const SERVER_READY_TIMEOUT_MS = 2000;
const NO_STORE_CACHE_MODE: RequestCache = 'no-store';
const AUTO_OPEN_HISTORY_INDEX = 0;
const SINGLE_PROJECT_COUNT = 1;
const DEFAULT_LAST_OPENED_TIME_MS = 0;

// --- Settings Cache ---
// Caches the last successfully loaded settings so subsequent app loads can
// hydrate the store instantly and render the board without waiting for the
// server settings fetch. The cache is refreshed every time settings load.
const SETTINGS_CACHE_KEY = 'dmaker:settings-cache';
const AUTO_OPEN_DONE_CACHE_KEY = 'dmaker:auto-open-done';

function getCachedSettings(): unknown | null {
  try {
    const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {
    // Corrupted cache — ignore
  }
  return null;
}

function setCachedSettings(settings: unknown): void {
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

function clearCachedSettings(): void {
  try {
    localStorage.removeItem(SETTINGS_CACHE_KEY);
    localStorage.removeItem(AUTO_OPEN_DONE_CACHE_KEY);
  } catch {
    // ignore
  }
}
const AUTO_OPEN_STATUS = {
  idle: 'idle',
  opening: 'opening',
  done: 'done',
} as const;
type AutoOpenStatus = (typeof AUTO_OPEN_STATUS)[keyof typeof AUTO_OPEN_STATUS];

// Apply stored theme immediately on page load (before React hydration)
// This prevents flash of default theme on setup pages
function applyStoredTheme(): void {
  const storedTheme = getStoredTheme();
  if (storedTheme) {
    const root = document.documentElement;
    // Remove all theme classes (themeOptions doesn't include 'system' which is only in ThemeMode)
    const themeClasses = themeOptions.map((option) => option.value);
    root.classList.remove(...themeClasses);

    // Apply the stored theme
    if (storedTheme === 'dark') {
      root.classList.add('dark');
    } else if (storedTheme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.add(isDark ? 'dark' : 'light');
    } else if (storedTheme !== 'light') {
      root.classList.add(storedTheme);
    } else {
      root.classList.add('light');
    }
  }
}

// Apply stored theme immediately (runs synchronously before render)
applyStoredTheme();

async function waitForServerReady(): Promise<boolean> {
  const serverUrl = getServerUrlSync();

  for (let attempt = 1; attempt <= SERVER_READY_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${serverUrl}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(SERVER_READY_TIMEOUT_MS),
        cache: NO_STORE_CACHE_MODE,
      });

      if (response.ok) {
        return true;
      }
    } catch (error) {
      logger.warn(`Server readiness check failed (attempt ${attempt})`, error);
    }

    const delayMs = Math.min(SERVER_READY_MAX_DELAY_MS, SERVER_READY_BACKOFF_BASE_MS * attempt);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return false;
}

function getProjectLastOpenedMs(project: Project): number {
  if (!project.lastOpened) return DEFAULT_LAST_OPENED_TIME_MS;
  const parsed = Date.parse(project.lastOpened);
  return Number.isNaN(parsed) ? DEFAULT_LAST_OPENED_TIME_MS : parsed;
}

function selectAutoOpenProject(
  currentProject: Project | null,
  projects: Project[],
  projectHistory: string[]
): Project | null {
  if (currentProject) return currentProject;

  if (projectHistory.length > 0) {
    const historyProjectId = projectHistory[AUTO_OPEN_HISTORY_INDEX];
    const historyProject = projects.find((project) => project.id === historyProjectId);
    if (historyProject) {
      return historyProject;
    }
  }

  if (projects.length === SINGLE_PROJECT_COUNT) {
    return projects[AUTO_OPEN_HISTORY_INDEX] ?? null;
  }

  if (projects.length > SINGLE_PROJECT_COUNT) {
    let latestProject: Project | null = projects[AUTO_OPEN_HISTORY_INDEX] ?? null;
    let latestTimestamp = latestProject
      ? getProjectLastOpenedMs(latestProject)
      : DEFAULT_LAST_OPENED_TIME_MS;

    for (const project of projects) {
      const openedAt = getProjectLastOpenedMs(project);
      if (openedAt > latestTimestamp) {
        latestTimestamp = openedAt;
        latestProject = project;
      }
    }

    return latestProject;
  }

  return null;
}

function RootLayoutContent() {
  const location = useLocation();
  const {
    setIpcConnected,
    projects,
    currentProject,
    projectHistory,
    upsertAndSetCurrentProject,
    getEffectiveTheme,
    getEffectiveFontSans,
    getEffectiveFontMono,
    // Subscribe to theme and font state to trigger re-renders when they change
    theme,
    fontFamilySans,
    fontFamilyMono,
    fetchCodexModels,
  } = useAppStore(
    useShallow((state) => ({
      setIpcConnected: state.setIpcConnected,
      projects: state.projects,
      currentProject: state.currentProject,
      projectHistory: state.projectHistory,
      upsertAndSetCurrentProject: state.upsertAndSetCurrentProject,
      getEffectiveTheme: state.getEffectiveTheme,
      getEffectiveFontSans: state.getEffectiveFontSans,
      getEffectiveFontMono: state.getEffectiveFontMono,
      theme: state.theme,
      fontFamilySans: state.fontFamilySans,
      fontFamilyMono: state.fontFamilyMono,
      fetchCodexModels: state.fetchCodexModels,
    }))
  );
  const { setupComplete, codexCliStatus } = useSetupStore();
  const navigate = useNavigate();
  const [isMounted, setIsMounted] = useState(false);
  const [streamerPanelOpen, setStreamerPanelOpen] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const { openFileBrowser } = useFileBrowser();

  // Load project settings when switching projects
  useProjectSettingsLoader();

  const isSetupRoute = location.pathname === '/setup';
  const isDashboardRoute = location.pathname === '/dashboard';
  const isRootRoute = location.pathname === '/';
  const [autoOpenStatus, setAutoOpenStatus] = useState<AutoOpenStatus>(AUTO_OPEN_STATUS.idle);
  const autoOpenCandidate = selectAutoOpenProject(currentProject, projects, projectHistory);
  const canAutoOpen = settingsReady && setupComplete && !isSetupRoute && !!autoOpenCandidate;
  const shouldAutoOpen = canAutoOpen && autoOpenStatus !== AUTO_OPEN_STATUS.done;

  // Hidden streamer panel - opens with "\" key
  const handleStreamerPanelShortcut = useCallback((event: KeyboardEvent) => {
    const activeElement = document.activeElement;
    if (activeElement) {
      const tagName = activeElement.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        return;
      }
      if (activeElement.getAttribute('contenteditable') === 'true') {
        return;
      }
      const role = activeElement.getAttribute('role');
      if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
        return;
      }
      // Don't intercept when focused inside a terminal
      if (activeElement.closest('.xterm') || activeElement.closest('[data-terminal-container]')) {
        return;
      }
    }

    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    if (event.key === '\\') {
      event.preventDefault();
      setStreamerPanelOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleStreamerPanelShortcut);
    return () => {
      window.removeEventListener('keydown', handleStreamerPanelShortcut);
    };
  }, [handleStreamerPanelShortcut]);

  const effectiveTheme = getEffectiveTheme();
  // Defer the theme value to keep UI responsive during rapid hover changes
  const deferredTheme = useDeferredValue(effectiveTheme);

  // Get effective theme and fonts for the current project
  // Note: theme/fontFamilySans/fontFamilyMono are destructured above to ensure re-renders when they change
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void theme; // Used for subscription
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void fontFamilySans; // Used for subscription
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void fontFamilyMono; // Used for subscription
  const effectiveFontSans = getEffectiveFontSans();
  const effectiveFontMono = getEffectiveFontMono();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Global listener for server offline/connection errors.
  // Logs the event since there is no login page to redirect to.
  useEffect(() => {
    const handleOffline = () => {
      logger.warn('dmaker:server-offline event received — server appears to be offline');
      clearCachedSettings();
    };

    window.addEventListener('dmaker:server-offline', handleOffline);
    return () => {
      window.removeEventListener('dmaker:server-offline', handleOffline);
    };
  }, []);

  // Initialize: wait for server, load settings, render app.
  // No authentication required.
  useEffect(() => {
    const initialize = async () => {
      // Populate the server URL from Electron IPC before any fetch calls
      await initServerUrl();

      // Use cached settings for instant render if available
      const cachedSettings = getCachedSettings();
      if (cachedSettings) {
        hydrateStoreFromSettings(cachedSettings);
        signalMigrationComplete();
        setSettingsReady(true);
      }

      try {
        const serverReady = await waitForServerReady();
        if (!serverReady) {
          handleServerOffline();
          return;
        }

        // Load settings from server
        const api = getHttpApiClient();
        const maxAttempts = 4;
        const baseDelayMs = 250;
        let lastError: unknown = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const settingsResult = await api.settings.getGlobal();
            if (settingsResult.success && settingsResult.settings) {
              const { settings: finalSettings, migrated } = await performSettingsMigration(
                settingsResult.settings as unknown as Parameters<typeof performSettingsMigration>[0]
              );

              if (migrated) {
                logger.info('Settings migration from localStorage completed');
              }

              hydrateStoreFromSettings(finalSettings);
              setCachedSettings(finalSettings);
              await new Promise((resolve) => setTimeout(resolve, 0));
              signalMigrationComplete();

              // Set auth store state for compatibility with use-settings-sync.ts
              useAuthStore.getState().setAuthState({
                authChecked: true,
                isAuthenticated: true,
                settingsLoaded: true,
              });

              setSettingsReady(true);
              setAppReady(true);
              return;
            }
            lastError = settingsResult;
          } catch (error) {
            lastError = error;
          }

          const delayMs = Math.min(1500, baseDelayMs * attempt);
          logger.warn(
            `Settings not ready (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs}ms...`,
            lastError
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        // Failed to load settings but server is up - still allow access
        logger.error('Failed to load settings after all attempts');
        signalMigrationComplete();
        setAppReady(true);
      } catch (error) {
        logger.error('Failed to initialize:', error);
        signalMigrationComplete();
        setAppReady(true);
      }
    };

    initialize();
  }, []);

  // Map of old routes to layer IDs for redirect handling
  const routeToLayerMap: Record<string, string> = {
    '/settings': 'settings',
    '/terminal': 'terminal',
    '/ideation': 'ideation',
    '/spec': 'spec',
    '/memory': 'memory',
    '/github-issues': 'github-issues',
    '/github-prs': 'github-prs',
    '/project-settings': 'project-settings',
    '/interview': 'interview',
  };

  // Simplified routing: no auth gates, just setup check
  // Also redirects old view routes to board + layer
  useEffect(() => {
    if (!appReady || !settingsReady) return;

    if (!setupComplete && location.pathname !== '/setup') {
      navigate({ to: '/setup' });
      return;
    }

    if (setupComplete && location.pathname === '/setup') {
      navigate({ to: '/dashboard' });
      return;
    }

    // Redirect old routes to board + open their layer
    const layerId = routeToLayerMap[location.pathname];
    if (layerId) {
      useLayerStore.getState().openLayer(layerId as LayerId);
      navigate({ to: '/board' });
    }
  }, [appReady, settingsReady, setupComplete, location.pathname, navigate]);

  useEffect(() => {
    setGlobalFileBrowser(openFileBrowser);
  }, [openFileBrowser]);

  // Test IPC connection on mount
  useEffect(() => {
    const testConnection = async () => {
      try {
        if (isElectron()) {
          const api = getElectronAPI();
          const result = await api.ping();
          setIpcConnected(result === 'pong');
          return;
        }

        // Web mode: check backend availability without instantiating the full HTTP client
        const response = await fetch(`${getServerUrlSync()}/api/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000),
        });
        setIpcConnected(response.ok);
      } catch (error) {
        logger.error('IPC connection failed:', error);
        setIpcConnected(false);
      }
    };

    testConnection();
  }, [setIpcConnected]);

  // Redirect from welcome page based on project state
  useEffect(() => {
    if (isMounted && isRootRoute) {
      if (!settingsReady || shouldAutoOpen) {
        return;
      }
      if (currentProject) {
        // Project is selected, go to board
        navigate({ to: '/board' });
      } else {
        // No project selected, go to dashboard
        navigate({ to: '/dashboard' });
      }
    }
  }, [isMounted, currentProject, isRootRoute, navigate, shouldAutoOpen, settingsReady]);

  // Auto-open the most recent project on startup
  useEffect(() => {
    if (!canAutoOpen) return;
    if (autoOpenStatus !== AUTO_OPEN_STATUS.idle) return;

    if (!autoOpenCandidate) return;

    setAutoOpenStatus(AUTO_OPEN_STATUS.opening);

    const openProject = async () => {
      try {
        const initResult = await initializeProject(autoOpenCandidate.path);
        if (!initResult.success) {
          logger.warn('Auto-open project failed:', initResult.error);
          if (isRootRoute) {
            navigate({ to: '/dashboard' });
          }
          return;
        }

        if (!currentProject || currentProject.id !== autoOpenCandidate.id) {
          upsertAndSetCurrentProject(
            autoOpenCandidate.path,
            autoOpenCandidate.name,
            autoOpenCandidate.theme as ThemeMode | undefined
          );
        }

        if (isRootRoute) {
          navigate({ to: '/board' });
        }
      } catch (error) {
        logger.error('Auto-open project crashed:', error);
        if (isRootRoute) {
          navigate({ to: '/dashboard' });
        }
      } finally {
        setAutoOpenStatus(AUTO_OPEN_STATUS.done);
      }
    };

    void openProject();
  }, [
    canAutoOpen,
    autoOpenStatus,
    autoOpenCandidate,
    currentProject,
    navigate,
    upsertAndSetCurrentProject,
    isRootRoute,
  ]);

  // Bootstrap Codex models on app startup (after settings are ready)
  useEffect(() => {
    if (!settingsReady) return;

    const isCodexAvailable = codexCliStatus?.installed && codexCliStatus?.hasApiKey;
    if (!isCodexAvailable) return;

    // Fetch models in the background
    fetchCodexModels().catch((error) => {
      logger.warn('Failed to bootstrap Codex models:', error);
    });
  }, [settingsReady, codexCliStatus, fetchCodexModels]);

  // Apply theme class to document - use deferred value to avoid blocking UI
  // Dynamically loads the theme CSS on demand before applying the class.
  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes dynamically from themeOptions
    const themeClasses = themeOptions
      .map((option) => option.value)
      .filter((theme) => theme !== ('system' as ThemeOption['value']));

    const applyClass = (className: string) => {
      root.classList.remove(...themeClasses);
      root.classList.add(className);
    };

    if (deferredTheme === 'dark') {
      applyClass('dark');
    } else if (deferredTheme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyClass(isDark ? 'dark' : 'light');
    } else if (deferredTheme && deferredTheme !== 'light') {
      // Dynamically load the theme CSS, then apply the class
      void loadTheme(deferredTheme).then(() => {
        applyClass(deferredTheme);
      });
      return; // Don't apply synchronously — loadTheme callback will do it
    } else {
      applyClass('light');
    }
  }, [deferredTheme]);

  // Load font assets and apply CSS variables when effective fonts change.
  // This ensures bundled fonts (e.g. Zed Sans/Mono) have their CSS loaded
  // before being applied, while system fonts are applied immediately.
  useEffect(() => {
    const root = document.documentElement;

    const applyFonts = async () => {
      // Load font assets in parallel for any bundled fonts that need it.
      // loadFontByFamily is a no-op for already-loaded or system fonts.
      await Promise.all([
        effectiveFontSans ? loadFontByFamily(effectiveFontSans) : null,
        effectiveFontMono ? loadFontByFamily(effectiveFontMono) : null,
      ]);

      if (effectiveFontSans) {
        root.style.setProperty('--font-sans', effectiveFontSans);
      } else {
        root.style.removeProperty('--font-sans');
      }

      if (effectiveFontMono) {
        root.style.setProperty('--font-mono', effectiveFontMono);
      } else {
        root.style.removeProperty('--font-mono');
      }
    };

    applyFonts().catch((error) => {
      logger.error('Failed to load fonts:', error);
      // Still apply the CSS variables even if loading fails — the browser
      // will fall back to the next font in the font-family stack.
      if (effectiveFontSans) {
        root.style.setProperty('--font-sans', effectiveFontSans);
      } else {
        root.style.removeProperty('--font-sans');
      }

      if (effectiveFontMono) {
        root.style.setProperty('--font-mono', effectiveFontMono);
      } else {
        root.style.removeProperty('--font-mono');
      }
    });
  }, [effectiveFontSans, effectiveFontMono]);

  // Single loading gate: wait for app to be ready
  if (!appReady) {
    return (
      <main className="flex h-screen items-center justify-center" data-testid="app-container">
        <LoadingState message="Loading..." />
      </main>
    );
  }

  // Show setup page (full screen, no sidebar)
  if (isSetupRoute) {
    return (
      <main className="h-screen overflow-hidden" data-testid="app-container">
        <Outlet />
      </main>
    );
  }

  // Show dashboard page (full screen, no sidebar)
  if (isDashboardRoute) {
    return (
      <main className="h-screen overflow-hidden" data-testid="app-container">
        <Outlet />
        <Toaster richColors position="bottom-right" />
      </main>
    );
  }

  return (
    <>
      <main className="flex flex-col h-screen overflow-hidden" data-testid="app-container">
        {/* Full-width titlebar drag region for Electron window dragging */}
        {isElectron() && (
          <div
            className={`fixed top-0 left-0 right-0 h-6 titlebar-drag-region z-40 pointer-events-none ${isMac ? 'pl-20' : ''}`}
            aria-hidden="true"
          />
        )}
        {/* Top Navigation Bar - simplified single row */}
        <div className="relative z-50 shrink-0">
          <TopNavigationBar />
        </div>
        {/* Board View - always mounted as the base layer */}
        <div
          className="flex-1 flex flex-col overflow-hidden transition-all duration-300"
          style={{ marginRight: streamerPanelOpen ? '250px' : '0' }}
        >
          <RouteErrorBoundary>
            <Suspense fallback={<LoadingState message="Loading board..." />}>
              <LazyBoardView />
            </Suspense>
          </RouteErrorBoundary>
        </div>

        {/* Layer stack - renders tool/settings overlays on top of the board */}
        <LayerStack />

        {/* Hidden streamer panel - opens with "\" key, pushes content */}
        <div
          className={`fixed top-0 right-0 h-full w-[250px] bg-background border-l border-border transition-transform duration-300 ${
            streamerPanelOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        />
        <Toaster richColors position="bottom-right" />
      </main>
    </>
  );
}

function RootLayout() {
  return (
    <FileBrowserProvider>
      <RootLayoutContent />
    </FileBrowserProvider>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
