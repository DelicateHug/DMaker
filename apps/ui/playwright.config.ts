import { defineConfig, devices } from '@playwright/test';
import * as os from 'os';
import * as path from 'path';

/**
 * Ports the suite serves itself on.
 *
 * Deliberately outside the 3007/3009/3017/3019/3029 block `start.ps1` uses, so
 * a test run does not fight the developer's running app for a port — and, more
 * to the point, so it cannot silently attach to it.
 *
 * TEST_PORT is passed down to the Vite webServer below rather than left to
 * defaults. It has to be: `vite.config.mts` reads the same variable but falls
 * back to 3017, while this file used to fall back to 3007, so with the variable
 * unset the two disagreed and Playwright waited out its full timeout on a port
 * Vite was never going to listen on. The whole suite was unrunnable that way.
 */
const port = process.env.TEST_PORT || 3107;
// Keep this default in step with tests/utils/core/constants.ts, which resolves
// the backend URL the same way. The specs talk to it directly, so a mismatch
// here fails them with ECONNREFUSED rather than anything that names the cause.
const serverPort = process.env.TEST_SERVER_PORT || 3008;
const reuseServer = process.env.TEST_REUSE_SERVER === 'true';
const useExternalBackend = !!process.env.VITE_SERVER_URL;
// Always use mock agent for tests (disables rate limiting, uses mock Claude responses)
const mockAgent = true;

/**
 * Throwaway data directory for the test backend.
 *
 * Must match setup-e2e-fixtures.mjs, which seeds settings.json into it. The
 * suite used to run against apps/server/data — the developer's own DMaker
 * data — and overwrote their real settings and project list on every run.
 */
const testDataDir = process.env.DMAKER_E2E_DATA_DIR || path.join(os.tmpdir(), 'dmaker-e2e-data');

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, // Run sequentially to avoid auth conflicts with shared server
  reporter: 'html',
  timeout: 30000,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-failure',
    screenshot: 'only-on-failure',
  },
  // Global setup - authenticate before each test
  globalSetup: require.resolve('./tests/global-setup.ts'),
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(reuseServer
    ? {}
    : {
        webServer: [
          // Backend server - runs with mock agent enabled in CI
          // Uses dev:test (no file watching) to avoid port conflicts from server restarts
          ...(useExternalBackend
            ? []
            : [
                {
                  command: `cd ../server && npm run dev:test`,
                  url: `http://localhost:${serverPort}/api/health`,
                  // Don't reuse existing server to ensure we use the test API key
                  reuseExistingServer: false,
                  timeout: 60000,
                  env: {
                    ...process.env,
                    PORT: String(serverPort),
                    // Keep the suite off the developer's real DMaker data.
                    DATA_DIR: testDataDir,
                    // Enable mock agent in CI to avoid real API calls
                    DMAKER_MOCK_AGENT: mockAgent ? 'true' : 'false',
                    // Set a test API key for web mode authentication
                    DMAKER_API_KEY: process.env.DMAKER_API_KEY || 'test-api-key-for-e2e-tests',
                    // Hide the API key banner to reduce log noise
                    DMAKER_HIDE_API_KEY: 'true',
                    // Explicitly unset ALLOWED_ROOT_DIRECTORY to allow all paths for testing
                    // (prevents inheriting /projects from Docker or other environments)
                    ALLOWED_ROOT_DIRECTORY: '',
                    // Simulate containerized environment to skip sandbox confirmation dialogs
                    IS_CONTAINERIZED: 'true',
                  },
                },
              ]),
          // Frontend Vite dev server
          {
            command: `npm run dev`,
            url: `http://localhost:${port}`,
            reuseExistingServer: false,
            timeout: 120000,
            env: {
              ...process.env,
              VITE_SKIP_SETUP: 'true',
              // Always skip electron plugin during tests - prevents duplicate server spawning
              VITE_SKIP_ELECTRON: 'true',
              // vite.config.mts reads TEST_PORT too, and defaults to 3017 when
              // it is unset. Pass the resolved port down so both halves agree
              // on one number instead of each picking its own default.
              TEST_PORT: String(port),
              // Point the UI at the backend this config just started. Without
              // it the UI falls back to its dev default (port 3019) and talks
              // to nothing, so every spec fails on an app that never loads.
              // Only the vite process sees this — `useExternalBackend` reads
              // process.env, so setting it here does not suppress the backend.
              VITE_SERVER_URL: process.env.VITE_SERVER_URL || `http://localhost:${serverPort}`,
            },
          },
        ],
      }),
});
