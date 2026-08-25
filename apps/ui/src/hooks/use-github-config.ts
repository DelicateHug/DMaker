/**
 * The GitHub settings in force for a project.
 *
 * Project overrides, global defaults and git detection are collapsed on the
 * server (see /api/github/config), so every caller here agrees with the
 * settings pane and with what GitHub operations actually do.
 */

import { useCallback, useEffect, useState } from 'react';
import type { EffectiveGitHubSettings } from '@dmaker/types';
import { getHttpApiClient } from '@/lib/http-api-client';

export interface UseGitHubConfigResult {
  /** Resolved settings, or null until the first load finishes (or if it fails) */
  config: EffectiveGitHubSettings | null;
  /** 'owner/repo' to pass to the issue/PR endpoints, or undefined to let them detect */
  repo: string | undefined;
  isLoading: boolean;
  refresh: () => void;
}

export function useGitHubConfig(projectPath: string | null | undefined): UseGitHubConfigResult {
  const [config, setConfig] = useState<EffectiveGitHubSettings | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(projectPath));

  const load = useCallback(async () => {
    if (!projectPath) {
      setConfig(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const result = await getHttpApiClient().github.getConfig(projectPath);
      setConfig(result.success ? (result.effective ?? null) : null);
    } catch {
      // A missing config is not worth interrupting the caller over — they fall
      // back to whatever the server detects on its own.
      setConfig(null);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await load();
      if (cancelled) return;
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return {
    config,
    repo: config?.repo ?? undefined,
    isLoading,
    refresh: () => {
      void load();
    },
  };
}
