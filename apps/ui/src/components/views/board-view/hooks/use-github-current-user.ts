import { useEffect, useState } from 'react';
import { createLogger } from '@dmaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';

const logger = createLogger('GitHubCurrentUser');

/**
 * Who `gh` is logged in as, per project. The server answers this by running
 * `gh api user`, so the result is the same account that would be used to
 * assign or claim an issue — which is exactly what the board's "Me" filter
 * needs to mean.
 *
 * Answers are cached for the session: the login does not change while the app
 * is open, and the board asks for it on every project switch.
 */
const userByProject = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

/**
 * The `gh` login for a project, outside of React.
 *
 * Exported for actions (assigning, unassigning) that need to know who "me" is
 * before they can update a task optimistically, and which run from event
 * handlers rather than from a component body.
 */
export async function resolveCurrentUser(projectPath: string): Promise<string | null> {
  const cached = userByProject.get(projectPath);
  if (cached !== undefined) return cached;

  const pending = inFlight.get(projectPath);
  if (pending) return pending;

  const request = (async () => {
    try {
      const githubApi = getElectronAPI().github;
      if (!githubApi) return null;

      const result = await githubApi.getCurrentUser(projectPath);
      const login = result.success ? (result.username ?? null) : null;
      userByProject.set(projectPath, login);
      return login;
    } catch (error) {
      logger.warn('Could not resolve the gh CLI user:', error);
      // Not cached: a failure here is usually `gh` being briefly unavailable,
      // and the next project switch should get another chance.
      return null;
    } finally {
      inFlight.delete(projectPath);
    }
  })();

  inFlight.set(projectPath, request);
  return request;
}

/**
 * The GitHub login of the authenticated `gh` user for `projectPath`, or null
 * while it is loading, when `gh` is not authenticated, or when no project is
 * selected.
 */
export function useGithubCurrentUser(projectPath: string | null | undefined): string | null {
  const [login, setLogin] = useState<string | null>(() =>
    projectPath ? (userByProject.get(projectPath) ?? null) : null
  );

  useEffect(() => {
    if (!projectPath) {
      setLogin(null);
      return;
    }

    let active = true;
    void resolveCurrentUser(projectPath).then((resolved) => {
      if (active) setLogin(resolved);
    });

    return () => {
      active = false;
    };
  }, [projectPath]);

  return login;
}
