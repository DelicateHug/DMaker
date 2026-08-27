import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Unit tests for apps/ui.
 *
 * Deliberately a separate config from vite.config.mts: that one loads the
 * Electron and TanStack Router plugins, which build main.js/preload.js and
 * regenerate routeTree.gen.ts as a side effect of starting up. A test run must
 * not rewrite generated source.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'ui',
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests-unit/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests-unit/**/*.test.{ts,tsx}'],
    // `tests/` is Playwright's testDir. Its files import @playwright/test, which
    // throws the moment vitest loads it ("Playwright Test did not expect
    // test() to be called here"), so keep the two suites strictly apart.
    exclude: ['tests/**', 'node_modules/**', 'dist/**', 'dist-electron/**', 'release/**'],
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Resolve shared packages to source so a clean checkout can run tests
      // before `npm run build:packages` has produced any libs/*/dist.
      //
      // The subpath entry must come first: vite alias keys are matched in
      // insertion order by prefix, so a bare '@dmaker/utils' rule would rewrite
      // '@dmaker/utils/logger' to '.../src/index.ts/logger'. 100+ UI files
      // import that subpath.
      '@dmaker/utils/logger': path.resolve(__dirname, '../../libs/utils/src/logger.ts'),
      '@dmaker/utils': path.resolve(__dirname, '../../libs/utils/src/index.ts'),
      '@dmaker/platform': path.resolve(__dirname, '../../libs/platform/src/index.ts'),
      '@dmaker/types': path.resolve(__dirname, '../../libs/types/src/index.ts'),
      '@dmaker/prompts': path.resolve(__dirname, '../../libs/prompts/src/index.ts'),
      '@dmaker/model-resolver': path.resolve(__dirname, '../../libs/model-resolver/src/index.ts'),
      '@dmaker/dependency-resolver': path.resolve(
        __dirname,
        '../../libs/dependency-resolver/src/index.ts'
      ),
      '@dmaker/git-utils': path.resolve(__dirname, '../../libs/git-utils/src/index.ts'),
    },
  },
});
