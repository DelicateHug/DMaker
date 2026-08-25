/**
 * Registers the DMaker checkout this server was launched from as one of its own
 * projects.
 *
 * When `start.ps1` brings up the dev/prod pair it passes `DMAKER_SELF_PROJECT`,
 * pointing at the repo root. Both halves then show DMaker on their own board
 * without anyone having to add it by hand — which matters because dev and prod
 * keep separate data directories (`data-dev/` and `data/`), so a project added
 * in one is invisible to the other.
 *
 * Registration is idempotent and never clobbers an existing entry: if the user
 * has already added DMaker (under any name, icon or favourite state), that entry
 * is left exactly as it is.
 */

import path from 'path';
import { createLogger } from '@dmaker/utils';
import type { ProjectRef } from '@dmaker/types';
import type { SettingsService } from './settings-service.js';
import { getEnvName, getSelfProjectPath } from '../lib/runtime-env.js';

const logger = createLogger('SelfProject');

/** Stable id so dev and prod agree on which entry is the self-project. */
const SELF_PROJECT_ID = 'dmaker-self';

/** Compare two paths the way the OS does — Windows is case-insensitive. */
function samePath(a: string, b: string): boolean {
  const normA = path.resolve(a);
  const normB = path.resolve(b);
  if (process.platform === 'win32') {
    return normA.toLowerCase() === normB.toLowerCase();
  }
  return normA === normB;
}

/**
 * Ensure the launching checkout is present in the project list.
 *
 * Returns the project entry that represents it, or `null` when self-management
 * is off (a hand-started server, Electron, or the test suite).
 */
export async function ensureSelfProjectRegistered(
  settingsService: SettingsService
): Promise<ProjectRef | null> {
  const selfPath = getSelfProjectPath();
  if (!selfPath) return null;

  try {
    const settings = await settingsService.getGlobalSettings();
    const projects: ProjectRef[] = Array.isArray(settings.projects) ? settings.projects : [];

    const existing = projects.find((p) => p?.path && samePath(p.path, selfPath));
    if (existing) {
      logger.info(`DMaker already registered as a project: ${existing.name}`);
      // Still make it the active project on a cold start with nothing selected.
      if (!settings.currentProjectId) {
        await settingsService.updateGlobalSettings({ currentProjectId: existing.id });
      }
      return existing;
    }

    const entry: ProjectRef = {
      id: SELF_PROJECT_ID,
      name: path.basename(selfPath),
      path: selfPath,
      lastOpened: new Date().toISOString(),
      icon: 'Hammer',
    };

    await settingsService.updateGlobalSettings({
      projects: [...projects, entry],
      currentProjectId: settings.currentProjectId || entry.id,
    });

    logger.info(`Registered DMaker (${getEnvName()}) as a project: ${selfPath}`);
    return entry;
  } catch (error) {
    // Never let this stop the server booting — it is a convenience, not a
    // dependency. Worst case the user adds the folder themselves.
    logger.warn('Could not self-register the DMaker project:', error);
    return null;
  }
}
