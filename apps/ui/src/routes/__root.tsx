import { createRootRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, useCallback, useDeferredValue } from 'react';
import { createLogger } from '@dmaker/utils/logger';
import { loadFontByFamily } from '@/lib/font-loader';
import { loadTheme } from '@/lib/theme-loader';
import {
  FileBrowserProvider,
  useFileBrowser,
  setGlobalFileBrowser,
} from '@/contexts/file-browser-context';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, getStoredTheme, DEFAULT_THEME, type ThemeMode } from '@/store/app-store';
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
import { Button } from '@/components/ui/button';
import { AppSidebar } from '@/components/layout/sidebar/app-sidebar';
import { EnvironmentBar } from '@/components/layout/environment-bar';
import { SetupGate } from '@/components/layout/setup-gate';
import { CommandPalette } from '@/components/layout/command-palette';
import { CenterTabs } from '@/components/center/center-tabs';
import { CenterPanes } from '@/components/center/center-panes';
import { useBoardControlsStore, type AddFeatureContext } from '@/store/board-controls-store';
import { useProjectSettingsLoader } from '@/hooks/use-project-settings-loader';
import { openLayer, type LayerId } from '@/store/layer-store';
import type { Project } from '@/lib/electron';
import type { GlobalSettings } from '@dmaker/types';

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

function getCachedSettings(): GlobalSettings | null {
  try {
    const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!cached) return null;
    const parsed: unknown = JSON.parse(cached);
    // The cache is our own write, but it survives upgrades and can be edited
    // by hand, so check it is at least an object before hydrating the store
    // from it. Anything else is treated as no cache at all.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as GlobalSettings;
  } catch {
    // Corrupted cache — ignore
  }
  return null;
}

function setCachedSettings(settings: GlobalSettings): void {
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
  // Fall back to the shipped default so a fresh install doesn't flash light
  const storedTheme = getStoredTheme() || DEFAULT_THEME;
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
  // Set when the health check gives up, so the loading gate can say what is
  // wrong instead of spinning forever. See `initialize`.
  const [serverOffline, setServerOffline] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const { openFileBrowser } = useFileBrowser();

  // Workspace-centric shell: everything that can fill the centre — the board,
  // tasks, the project workspace, tools — is a tab, so opening a second thing
  // never displaces the first. See `center-store`.

  // Board-view publishes these callbacks into board-controls-store. Read them
  // imperatively rather than subscribing: this component is the app shell, and
  // re-rendering it whenever the board republishes its controls would remount
  // the board's subtree (and re-trigger the publish, looping).
  const handleCreateFeature = useCallback((context?: AddFeatureContext) => {
    useBoardControlsStore.getState().onOpenAddFeature?.(context);
  }, []);

  const handleCreateWorktree = useCallback(() => {
    useBoardControlsStore.getState().onCreateWorktree?.();
  }, []);

  // Load project settings when switching projects
  useProjectSettingsLoader();

  const isSetupRoute = location.pathname === '/setup';
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
          // Nothing downstream can work without the backend, so stop here —
          // but surface it. This used to `return` with `appReady` still false,
          // leaving the app on its spinner with no message and no way out.
          handleServerOffline();
          setServerOffline(true);
          return;
        }
        setServerOffline(false);

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
    // `retryCount` re-runs the whole bootstrap when the offline screen's Retry
    // is pressed, so a backend started after the UI no longer needs a reload.
  }, [retryCount]);

  // Map of old routes to layer IDs for redirect handling
  const routeToLayerMap: Record<string, string> = {
    '/settings': 'settings',
    '/terminal': 'terminal',
    '/ideation': 'ideation',
    '/spec': 'spec',
    '/memory': 'memory',
    '/github-prs': 'github-prs',
    '/project-settings': 'project-settings',
    '/interview': 'interview',
  };

  // Routes for views that no longer exist. GitHub issues are board tasks now,
  // so the old standalone page just lands on the board.
  const RETIRED_ROUTES = ['/github-issues'];

  // Routing has no gates at all now. Setup used to sit in front of the board
  // for every fresh DATA_DIR; SetupGate detects Claude and gh instead and only
  // interrupts when something is genuinely missing. /setup still renders if you
  // navigate to it deliberately, so the wizard remains available.
  useEffect(() => {
    if (!appReady || !settingsReady) return;

    // The standalone project dashboard is gone — the board is the only home.
    if (location.pathname === '/dashboard') {
      navigate({ to: '/board' });
      return;
    }

    // A retired view's route just goes home — there is no layer to open.
    if (RETIRED_ROUTES.includes(location.pathname)) {
      navigate({ to: '/board' });
      return;
    }

    // Redirect old routes to board + open their layer
    const layerId = routeToLayerMap[location.pathname];
    if (layerId) {
      openLayer(layerId as LayerId);
      navigate({ to: '/board' });
    }
  }, [appReady, settingsReady, location.pathname, navigate]);

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
      // The board is the only home now; it shows the project picker when no
      // project is open.
      navigate({ to: '/board' });
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
            navigate({ to: '/board' });
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
          navigate({ to: '/board' });
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

  // The backend never answered. Say so, and name the URL that was tried — the
  // usual cause is that only half the dev stack is running, and the port in
  // the message is what tells you which half.
  if (serverOffline) {
    return (
      <main
        className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center"
        data-testid="app-container"
      >
        <div data-testid="server-offline" className="max-w-md space-y-2">
          <h1 className="text-lg font-semibold">Can&apos;t reach the DMaker server</h1>
          <p className="text-sm text-muted-foreground">
            No response from{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              {getServerUrlSync()}
            </code>
            . Start the backend (<code className="font-mono text-xs">npm run dev:full</code>), then
            retry.
          </p>
        </div>
        <Button
          variant="outline"
          data-testid="server-offline-retry"
          onClick={() => {
            setServerOffline(false);
            setRetryCount((count) => count + 1);
          }}
        >
          Retry
        </Button>
      </main>
    );
  }

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

  return (
    <>
      <main className="flex h-screen flex-col overflow-hidden" data-testid="app-container">
        {/* Full-width titlebar drag region for Electron window dragging */}
        {isElectron() && (
          <div
            className={`fixed top-0 left-0 right-0 h-6 titlebar-drag-region z-40 pointer-events-none ${isMac ? 'pl-20' : ''}`}
            aria-hidden="true"
          />
        )}
        {/* Sidebar + main column */}
        <div
          className="flex-1 flex min-h-0 overflow-hidden transition-[margin-right] duration-300"
          style={{ marginRight: streamerPanelOpen ? '250px' : '0' }}
        >
          <AppSidebar
            onCreateFeature={handleCreateFeature}
            onCreateWorktree={handleCreateWorktree}
          />

          {/* The sidebar owns the app chrome — filters, tools, refresh, agents. */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Only renders when start.ps1 launched this as one half of a
                dev/prod pair; otherwise it is invisible. */}
            <EnvironmentBar />
            <CenterTabs />
            <CenterPanes />
          </div>
        </div>

        {/* Global command palette (Ctrl/Cmd+K) */}
        <CommandPalette onCreateFeature={handleCreateFeature} />

        {/* Hidden streamer panel - opens with "\" key, pushes content */}
        <div
          className={`fixed top-0 right-0 h-full w-[250px] bg-background border-l border-border transition-transform duration-300 ${
            streamerPanelOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        />
        {/* Silent when Claude and gh are both detected; a blocking dialog
            only when something the app actually needs is missing. */}
        <SetupGate enabled={appReady && settingsReady} />

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
