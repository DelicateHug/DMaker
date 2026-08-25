/**
 * Global setup for all e2e tests
 * This runs once before all tests start
 */

import * as fs from 'fs';
import { API_BASE_URL } from './utils/core/constants';

/**
 * Drop projects whose directory no longer exists from the test backend.
 *
 * Specs register throwaway projects and delete their temp directories in
 * afterAll, but nothing deregisters them. The backend's data directory
 * survives between runs, so the list grows every time — every stale entry is
 * then polled for features, worktrees and branches, filling the log with
 * ENOENT and slowing every spec that follows.
 */
async function pruneDeadProjects(): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/settings/global`);
    if (!response.ok) return;

    const settings = ((await response.json()) as { settings?: Record<string, unknown> })?.settings;
    if (!settings) return;

    const projects = Array.isArray(settings.projects)
      ? (settings.projects as Array<{ path?: string }>)
      : [];
    const alive = projects.filter((project) => {
      if (!project?.path) return false;
      try {
        return fs.statSync(project.path).isDirectory();
      } catch {
        return false;
      }
    });

    if (alive.length === projects.length) return;

    await fetch(`${API_BASE_URL}/api/settings/global`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, projects: alive }),
    });
    console.log(`[GlobalSetup] Pruned ${projects.length - alive.length} dead project(s)`);
  } catch {
    // The backend not being reachable yet is not a setup failure — the specs
    // that need it report it far more clearly than this would.
  }
}

async function globalSetup() {
  // Note: Server killing is handled by the pretest script in package.json
  // GlobalSetup runs AFTER webServer starts, so we can't kill the server here
  await pruneDeadProjects();
  console.log('[GlobalSetup] Setup complete');
}

export default globalSetup;
