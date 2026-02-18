import { createRootRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useState, useCallback, useDeferredValue, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
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
  initApiKey,
  verifySession,
  checkSandboxEnvironment,
  getServerUrlSync,
  getHttpApiClient,
  handleServerOffline,
} from '@/lib/http-api-client';
import {
  hydrateStoreFromSettings,
  signalMigrationComplete,
  performSettingsMigration,
} from '@/hooks/use-settings-migration';
import { Toaster } from 'sonner';
import { ThemeOption, themeOptions } from '@/config/theme-options';
import { LoadingState } from '@/components/ui/loading-state';
import { useProjectSettingsLoader } from '@/hooks/use-project-settings-loader';
import {
  useVoiceMode,
  useGlobalVoiceModeShortcut,
  useGlobalRecordingToggleShortcut,
} from '@/hooks/use-voice-mode';
import type { Project } from '@/lib/electron';

// Lazy-load heavy, conditionally-rendered components to reduce initial bundle size.
// VoiceWidget is only shown when voice mode is enabled in settings.
// Sandbox dialogs are only shown on first run or when not containerized.
const VoiceWidget = lazy(() =>
  import('@/components/voice/voice-widget').then((m) => ({ default: m.VoiceWidget }))
);
const SandboxRiskDialog = lazy(() =>
  import('@/components/dialogs/sandbox-risk-dialog').then((m) => ({ default: m.SandboxRiskDialog }))
);
const SandboxRejectionScreen = lazy(() =>
  import('@/components/dialogs/sandbox-rejection-screen').then((m) => ({
    default: m.SandboxRejectionScreen,
  }))
);

const logger = createLogger('RootLayout');
const SERVER_READY_MAX_ATTEMPTS = 8;
const SERVER_READY_BACKOFF_BASE_MS = 250;
const SERVER_READY_MAX_DELAY_MS = 1500;
const SERVER_READY_TIMEOUT_MS = 2000;
const NO_STORE_CACHE_MODE: RequestCache = 'no-store';
const AUTO_OPEN_HISTORY_INDEX = 0;
const SINGLE_PROJECT_COUNT = 1;
const DEFAULT_LAST_OPENED_TIME_MS = 0;

// --- Optimistic Auth Cache ---
// Caches successful auth+settings state so subsequent app loads can skip
// the "Loading..." screens and render the app immediately while verifying
// in the background. The cache is invalidated on logout or auth failure.
const AUTH_CACHE_KEY = 'automaker:auth-cached';
const SETUP_COMPLETE_CACHE_KEY = 'automaker:setup-complete-cached';

function getCachedAuthState(): boolean {
  try {
    return localStorage.getItem(AUTH_CACHE_KEY) === 'true';
  } catch {
    return false;
  }
}

function getCachedSetupComplete(): boolean {
  try {
    return localStorage.getItem(SETUP_COMPLETE_CACHE_KEY) === 'true';
  } catch {
    return false;
  }
}

function setCachedAuthState(authenticated: boolean, setupComplete: boolean): void {
  try {
    if (authenticated) {
      localStorage.setItem(AUTH_CACHE_KEY, 'true');
    } else {
      localStorage.removeItem(AUTH_CACHE_KEY);
    }
    if (setupComplete) {
      localStorage.setItem(SETUP_COMPLETE_CACHE_KEY, 'true');
    } else {
      localStorage.removeItem(SETUP_COMPLETE_CACHE_KEY);
    }
  } catch {
    // localStorage unavailable — ignore
  }
}

function clearCachedAuthState(): void {
  try {
    localStorage.removeItem(AUTH_CACHE_KEY);
    localStorage.removeItem(SETUP_COMPLETE_CACHE_KEY);
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
// This prevents flash of default theme on login/setup pages
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
    skipSandboxWarning,
    setSkipSandboxWarning,
    fetchCodexModels,
    voiceSettings,
    voiceWidgetPosition,
    setVoiceWidgetPosition,
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
      skipSandboxWarning: state.skipSandboxWarning,
      setSkipSandboxWarning: state.setSkipSandboxWarning,
      fetchCodexModels: state.fetchCodexModels,
      voiceSettings: state.voiceSettings,
      voiceWidgetPosition: state.voiceWidgetPosition,
      setVoiceWidgetPosition: state.setVoiceWidgetPosition,
    }))
  );
  const { setupComplete, codexCliStatus } = useSetupStore();
  const navigate = useNavigate();
  const [isMounted, setIsMounted] = useState(false);
  const [streamerPanelOpen, setStreamerPanelOpen] = useState(false);
  const authChecked = useAuthStore((s) => s.authChecked);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const settingsLoaded = useAuthStore((s) => s.settingsLoaded);
  const { openFileBrowser } = useFileBrowser();

  // Load project settings when switching projects
  useProjectSettingsLoader();

  // Voice mode hook - provides voice session state and controls
  const voiceMode = useVoiceMode();

  // Register global Alt+M keyboard shortcut for voice mode toggle
  // This shortcut bypasses input focus check for hands-free voice control
  useGlobalVoiceModeShortcut(voiceMode);

  // Register global Alt+N keyboard shortcut for recording toggle
  // This shortcut only works when voice mode is visible (per acceptance criteria:
  // "GIVEN voice mode is closed, WHEN user presses Alt+N, THEN nothing happens")
  useGlobalRecordingToggleShortcut(voiceMode);

  const isSetupRoute = location.pathname === '/setup';
  const isLoginRoute = location.pathname === '/login';
  const isLoggedOutRoute = location.pathname === '/logged-out';
  const isDashboardRoute = location.pathname === '/dashboard';
  const isBoardRoute = location.pathname === '/board';
  const isRootRoute = location.pathname === '/';
  const [autoOpenStatus, setAutoOpenStatus] = useState<AutoOpenStatus>(AUTO_OPEN_STATUS.idle);
  const autoOpenCandidate = selectAutoOpenProject(currentProject, projects, projectHistory);
  const canAutoOpen =
    authChecked &&
    isAuthenticated &&
    settingsLoaded &&
    setupComplete &&
    !isLoginRoute &&
    !isLoggedOutRoute &&
    !isSetupRoute &&
    !!autoOpenCandidate;
  const shouldAutoOpen = canAutoOpen && autoOpenStatus !== AUTO_OPEN_STATUS.done;
  const shouldBlockForSettings =
    authChecked && isAuthenticated && !settingsLoaded && !isLoginRoute && !isLoggedOutRoute;

  // Sandbox environment check state
  type SandboxStatus = 'pending' | 'containerized' | 'needs-confirmation' | 'denied' | 'confirmed';
  // Always start from pending on a fresh page load so the user sees the prompt
  // each time the app is launched/refreshed (unless running in a container).
  const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus>('pending');

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

  // Check sandbox environment only after user is authenticated, setup is complete, and settings are loaded
  useEffect(() => {
    // Skip if already decided
    if (sandboxStatus !== 'pending') {
      return;
    }

    // Don't check sandbox until user is authenticated, has completed setup, and settings are loaded
    // CRITICAL: settingsLoaded must be true to ensure skipSandboxWarning has been hydrated from server
    if (!authChecked || !isAuthenticated || !setupComplete || !settingsLoaded) {
      return;
    }

    const checkSandbox = async () => {
      try {
        const result = await checkSandboxEnvironment();

        if (result.isContainerized) {
          // Running in a container, no warning needed
          setSandboxStatus('containerized');
        } else if (result.skipSandboxWarning || skipSandboxWarning) {
          // Skip if env var is set OR if user preference is set
          setSandboxStatus('confirmed');
        } else {
          // Not containerized, show warning dialog
          setSandboxStatus('needs-confirmation');
        }
      } catch (error) {
        logger.error('Failed to check environment:', error);
        // On error, assume not containerized and show warning
        if (skipSandboxWarning) {
          setSandboxStatus('confirmed');
        } else {
          setSandboxStatus('needs-confirmation');
        }
      }
    };

    checkSandbox();
  }, [
    sandboxStatus,
    skipSandboxWarning,
    authChecked,
    isAuthenticated,
    setupComplete,
    settingsLoaded,
  ]);

  // Handle sandbox risk confirmation
  const handleSandboxConfirm = useCallback(
    (skipInFuture: boolean) => {
      if (skipInFuture) {
        setSkipSandboxWarning(true);
      }
      setSandboxStatus('confirmed');
    },
    [setSkipSandboxWarning]
  );

  // Handle sandbox risk denial
  const handleSandboxDeny = useCallback(async () => {
    if (isElectron()) {
      // In Electron mode, quit the application
      // Use window.electronAPI directly since getElectronAPI() returns the HTTP client
      try {
        const electronAPI = window.electronAPI;
        if (electronAPI?.quit) {
          await electronAPI.quit();
        } else {
          logger.error('quit() not available on electronAPI');
        }
      } catch (error) {
        logger.error('Failed to quit app:', error);
      }
    } else {
      // In web mode, show rejection screen
      setSandboxStatus('denied');
    }
  }, []);

  // Ref to prevent concurrent auth checks from running
  const authCheckRunning = useRef(false);

  // Global listener for 401/403 responses during normal app usage.
  // This is triggered by the HTTP client whenever an authenticated request returns 401/403.
  // Works for ALL modes (unified flow)
  useEffect(() => {
    const handleLoggedOut = () => {
      logger.warn('automaker:logged-out event received!');
      clearCachedAuthState();
      useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });

      // Navigate directly to /login instead of /logged-out
      // This removes the unnecessary intermediate screen
      if (location.pathname !== '/login' && location.pathname !== '/logged-out') {
        logger.warn('Navigating to /login due to logged-out event');
        navigate({ to: '/login' });
      }
    };

    window.addEventListener('automaker:logged-out', handleLoggedOut);
    return () => {
      window.removeEventListener('automaker:logged-out', handleLoggedOut);
    };
  }, [location.pathname, navigate]);

  // Global listener for server offline/connection errors.
  // This is triggered when a connection error is detected (e.g., server stopped).
  // Redirects to login page which will detect server is offline and show error UI.
  useEffect(() => {
    const handleServerOffline = () => {
      logger.warn('automaker:server-offline event received!');
      clearCachedAuthState();
      useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });

      // Navigate to login - the login page will detect server is offline and show appropriate UI
      if (location.pathname !== '/login' && location.pathname !== '/logged-out') {
        navigate({ to: '/login' });
      }
    };

    window.addEventListener('automaker:server-offline', handleServerOffline);
    return () => {
      window.removeEventListener('automaker:server-offline', handleServerOffline);
    };
  }, [location.pathname, navigate]);

  // Initialize authentication
  // - Electron mode: Uses API key from IPC (header-based auth)
  // - Web mode: Uses HTTP-only session cookie
  //
  // OPTIMIZATION: If we have a cached auth state from a previous successful session,
  // we optimistically mark auth as checked so the app renders immediately.
  // The actual verification still runs in the background and will redirect
  // to login if the session has expired.
  useEffect(() => {
    // Prevent concurrent auth checks
    if (authCheckRunning.current) {
      return;
    }

    const initAuth = async () => {
      authCheckRunning.current = true;

      // --- Optimistic fast path ---
      // If we previously completed auth+settings successfully, use cached state
      // to immediately mark auth as checked so the app doesn't show a blank
      // "Loading..." screen while we wait for the server readiness check.
      // We still need to verify the session and load settings, but at least
      // the auth check gate is lifted instantly.
      const hasCachedAuth = getCachedAuthState();
      const hasCachedSetup = getCachedSetupComplete();

      if (hasCachedAuth && hasCachedSetup) {
        logger.info('Using cached auth state for instant render');
        // Mark authChecked + isAuthenticated so the router doesn't show "Loading..."
        // settingsLoaded stays false — the settings will be hydrated below.
        useAuthStore.getState().setAuthState({
          authChecked: true,
          isAuthenticated: true,
        });
      }

      try {
        // Initialize API key for Electron mode
        await initApiKey();

        const serverReady = await waitForServerReady();
        if (!serverReady) {
          clearCachedAuthState();
          handleServerOffline();
          return;
        }

        // 1. Verify session (Single Request, ALL modes)
        let isValid = false;
        try {
          isValid = await verifySession();
        } catch (error) {
          logger.warn('Session verification failed (likely network/server issue):', error);
          isValid = false;
        }

        if (isValid) {
          // 2. Load settings (and hydrate stores) before marking auth as checked.
          // This prevents useSettingsSync from pushing default/empty state to the server
          // when the backend is still starting up or temporarily unavailable.
          const api = getHttpApiClient();
          try {
            const maxAttempts = 8;
            const baseDelayMs = 250;
            let lastError: unknown = null;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              try {
                const settingsResult = await api.settings.getGlobal();
                if (settingsResult.success && settingsResult.settings) {
                  const { settings: finalSettings, migrated } = await performSettingsMigration(
                    settingsResult.settings as unknown as Parameters<
                      typeof performSettingsMigration
                    >[0]
                  );

                  if (migrated) {
                    logger.info('Settings migration from localStorage completed');
                  }

                  // Hydrate store with the final settings (merged if migration occurred)
                  hydrateStoreFromSettings(finalSettings);

                  // CRITICAL: Wait for React to render the hydrated state before
                  // signaling completion. Zustand updates are synchronous, but React
                  // hasn't necessarily re-rendered yet. This prevents race conditions
                  // where useSettingsSync reads state before the UI has updated.
                  await new Promise((resolve) => setTimeout(resolve, 0));

                  // Signal that settings hydration is complete FIRST.
                  // This ensures useSettingsSync's waitForMigrationComplete() will resolve
                  // immediately when it starts after auth state change, preventing it from
                  // syncing default empty state to the server.
                  signalMigrationComplete();

                  // Now mark auth as checked AND settings as loaded.
                  // The settingsLoaded flag ensures useSettingsSync won't start syncing
                  // until settings have been properly hydrated, even if authChecked was
                  // set earlier by login-view.
                  useAuthStore.getState().setAuthState({
                    isAuthenticated: true,
                    authChecked: true,
                    settingsLoaded: true,
                  });

                  // Cache successful auth state for next startup
                  setCachedAuthState(true, true);

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

            throw lastError ?? new Error('Failed to load settings');
          } catch (error) {
            logger.error('Failed to fetch settings after valid session:', error);
            // If we can't load settings, we must NOT start syncing defaults to the server.
            // Treat as not authenticated for now (backend likely unavailable) and unblock sync hook.
            clearCachedAuthState();
            useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });
            signalMigrationComplete();
            if (location.pathname !== '/login') {
              navigate({ to: '/login' });
            }
            return;
          }
        } else {
          // Session is invalid or expired - treat as not authenticated
          clearCachedAuthState();
          useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });
          // Signal migration complete so sync hook doesn't hang (nothing to sync when not authenticated)
          signalMigrationComplete();

          // Redirect to login
          if (location.pathname !== '/login') {
            navigate({ to: '/login' });
          }
        }
      } catch (error) {
        logger.error('Failed to initialize auth:', error);
        // On error, treat as not authenticated
        clearCachedAuthState();
        useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });
        // Signal migration complete so sync hook doesn't hang
        signalMigrationComplete();
        if (location.pathname !== '/login') {
          navigate({ to: '/login' });
        }
      } finally {
        authCheckRunning.current = false;
      }
    };

    initAuth();
  }, []); // Runs once per load; auth state drives routing rules

  // Note: Settings are now loaded in __root.tsx after successful session verification
  // This ensures a unified flow across all modes (Electron, web, external server)

  // Routing rules (ALL modes - unified flow):
  // - If not authenticated: force /logged-out (even /setup is protected)
  // - If authenticated but setup incomplete: force /setup
  // - If authenticated and setup complete: allow access to app
  useEffect(() => {
    logger.debug('Routing effect triggered:', {
      authChecked,
      isAuthenticated,
      settingsLoaded,
      setupComplete,
      pathname: location.pathname,
    });

    // Wait for auth check to complete before enforcing any redirects
    if (!authChecked) {
      logger.debug('Auth not checked yet, skipping routing');
      return;
    }

    // Unauthenticated -> force /login
    if (!isAuthenticated) {
      logger.warn('Not authenticated, redirecting to /login. Auth state:', {
        authChecked,
        isAuthenticated,
        settingsLoaded,
        currentPath: location.pathname,
      });
      if (location.pathname !== '/login') {
        navigate({ to: '/login' });
      }
      return;
    }

    // Wait for settings to be loaded before making setupComplete-based routing decisions
    // This prevents redirecting to /setup before we know the actual setupComplete value
    if (!settingsLoaded) return;

    // Authenticated -> determine whether setup is required
    if (!setupComplete && location.pathname !== '/setup') {
      navigate({ to: '/setup' });
      return;
    }

    // Setup complete but user is still on /setup -> go to dashboard
    if (setupComplete && location.pathname === '/setup') {
      navigate({ to: '/dashboard' });
    }
  }, [authChecked, isAuthenticated, settingsLoaded, setupComplete, location.pathname, navigate]);

  // Fallback: If auth is checked and authenticated but settings not loaded,
  // it means login-view or another component set auth state before __root.tsx's
  // auth flow completed. Load settings now to prevent sync with empty state.
  useEffect(() => {
    // Only trigger if auth is valid but settings aren't loaded yet
    // This handles the case where login-view sets authChecked=true before we finish our auth flow
    if (!authChecked || !isAuthenticated || settingsLoaded) {
      logger.debug('Fallback skipped:', { authChecked, isAuthenticated, settingsLoaded });
      return;
    }

    logger.info('Auth valid but settings not loaded - triggering fallback load');

    const loadSettings = async () => {
      const api = getHttpApiClient();
      try {
        logger.debug('Fetching settings in fallback...');
        const settingsResult = await api.settings.getGlobal();
        logger.debug('Settings fetched:', settingsResult.success ? 'success' : 'failed');
        if (settingsResult.success && settingsResult.settings) {
          const { settings: finalSettings } = await performSettingsMigration(
            settingsResult.settings as unknown as Parameters<typeof performSettingsMigration>[0]
          );
          logger.debug('Settings migrated, hydrating stores...');
          hydrateStoreFromSettings(finalSettings);
          await new Promise((resolve) => setTimeout(resolve, 0));
          signalMigrationComplete();
          logger.debug('Setting settingsLoaded=true');
          useAuthStore.getState().setAuthState({ settingsLoaded: true });
          logger.info('Fallback settings load completed successfully');
        }
      } catch (error) {
        logger.error('Failed to load settings in fallback:', error);
      }
    };

    loadSettings();
  }, [authChecked, isAuthenticated, settingsLoaded]);

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
      if (!settingsLoaded || shouldAutoOpen) {
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
  }, [isMounted, currentProject, isRootRoute, navigate, shouldAutoOpen, settingsLoaded]);

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

  // Bootstrap Codex models on app startup (after auth completes)
  useEffect(() => {
    // Only fetch if authenticated and Codex CLI is available
    if (!authChecked || !isAuthenticated) return;

    const isCodexAvailable = codexCliStatus?.installed && codexCliStatus?.hasApiKey;
    if (!isCodexAvailable) return;

    // Fetch models in the background
    fetchCodexModels().catch((error) => {
      logger.warn('Failed to bootstrap Codex models:', error);
    });
  }, [authChecked, isAuthenticated, codexCliStatus, fetchCodexModels]);

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

  // Show sandbox rejection screen if user denied the risk warning
  if (sandboxStatus === 'denied') {
    return (
      <Suspense fallback={null}>
        <SandboxRejectionScreen />
      </Suspense>
    );
  }

  // Show sandbox risk dialog if not containerized and user hasn't confirmed
  // The dialog is rendered as an overlay while the main content is blocked
  const showSandboxDialog = sandboxStatus === 'needs-confirmation';

  // Show login page (full screen, no sidebar)
  // Note: No sandbox dialog here - it only shows after login and setup complete
  if (isLoginRoute || isLoggedOutRoute) {
    return (
      <main className="h-screen overflow-hidden" data-testid="app-container">
        <Outlet />
      </main>
    );
  }

  // Wait for auth check before rendering protected routes (ALL modes - unified flow)
  if (!authChecked) {
    return (
      <main className="flex h-screen items-center justify-center" data-testid="app-container">
        <LoadingState message="Loading..." />
      </main>
    );
  }

  // Redirect to logged-out if not authenticated (ALL modes - unified flow)
  // Show loading state while navigation is in progress
  if (!isAuthenticated) {
    return (
      <main className="flex h-screen items-center justify-center" data-testid="app-container">
        <LoadingState message="Redirecting..." />
      </main>
    );
  }

  if (shouldBlockForSettings) {
    return (
      <main className="flex h-screen items-center justify-center" data-testid="app-container">
        <LoadingState message="Loading settings..." />
      </main>
    );
  }

  if (shouldAutoOpen) {
    return (
      <main className="flex h-screen items-center justify-center" data-testid="app-container">
        <LoadingState message="Opening project..." />
      </main>
    );
  }

  // Show setup page (full screen, no sidebar) - authenticated only
  if (isSetupRoute) {
    return (
      <main className="h-screen overflow-hidden" data-testid="app-container">
        <Outlet />
      </main>
    );
  }

  // Show dashboard page (full screen, no sidebar) - authenticated only
  if (isDashboardRoute) {
    return (
      <>
        <main className="h-screen overflow-hidden" data-testid="app-container">
          <Outlet />
          <Toaster richColors position="bottom-right" />
        </main>
        {showSandboxDialog && (
          <Suspense fallback={null}>
            <SandboxRiskDialog
              open={showSandboxDialog}
              onConfirm={handleSandboxConfirm}
              onDeny={handleSandboxDeny}
            />
          </Suspense>
        )}
      </>
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
        {/* Top Navigation Bar - replaces sidebar, relative for mobile dropdown positioning */}
        <div className="relative z-50 shrink-0">
          <TopNavigationBar />
        </div>
        <div
          className="flex-1 flex flex-col overflow-hidden transition-all duration-300"
          style={{ marginRight: streamerPanelOpen ? '250px' : '0' }}
        >
          <Outlet />
        </div>

        {/* Hidden streamer panel - opens with "\" key, pushes content */}
        <div
          className={`fixed top-0 right-0 h-full w-[250px] bg-background border-l border-border transition-transform duration-300 ${
            streamerPanelOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        />
        <Toaster richColors position="bottom-right" />

        {/* Voice Widget - Floating voice chat widget for hands-free voice commands
            Rendered when voice mode is enabled in settings.
            Uses Alt+M shortcut to toggle recording (bypasses input focus check) */}
        {voiceSettings.enabled && (
          <Suspense fallback={null}>
            <VoiceWidget
              isVisible={voiceMode.isSessionActive}
              messages={voiceMode.messages}
              isProcessing={voiceMode.isProcessing}
              statusText={
                voiceMode.sessionStatus === 'transcribing'
                  ? 'Transcribing...'
                  : voiceMode.sessionStatus === 'responding'
                    ? 'Thinking...'
                    : 'Processing...'
              }
              isRecording={voiceMode.isRecording}
              audioLevel={voiceMode.audioLevel}
              recordingDurationMs={voiceMode.recordingDuration}
              sessionStatus={voiceMode.sessionStatus}
              onToggleRecording={voiceMode.toggleRecording}
              error={voiceMode.error}
              onClearError={voiceMode.clearError}
              position={voiceWidgetPosition}
              onPositionChange={setVoiceWidgetPosition}
            />
          </Suspense>
        )}
      </main>
      {showSandboxDialog && (
        <Suspense fallback={null}>
          <SandboxRiskDialog
            open={showSandboxDialog}
            onConfirm={handleSandboxConfirm}
            onDeny={handleSandboxDeny}
          />
        </Suspense>
      )}
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
