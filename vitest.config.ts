import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use projects instead of deprecated workspace
    projects: [
      'libs/utils',
      'libs/platform',
      'libs/prompts',
      'libs/model-resolver',
      'libs/dependency-resolver',
      'libs/git-utils',
      'apps/server',
    ],
  },
});
