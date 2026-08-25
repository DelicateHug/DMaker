import { useMemo } from 'react';
import { useAppStore } from '@/store/app-store';

/**
 * Feature IDs whose agent is running right now, across every project.
 *
 * The live source is `autoModeByProject[*].runningTasks`: it is written
 * optimistically the moment a run/resume/follow-up is kicked off and cleared on
 * the server's completion event, so it flips instantly rather than waiting for
 * a poll or for the persisted feature status to catch up.
 */
export function useRunningFeatureIds(): Set<string> {
  const autoModeByProject = useAppStore((state) => state.autoModeByProject);

  return useMemo(() => {
    const ids = new Set<string>();
    for (const projectState of Object.values(autoModeByProject)) {
      for (const taskId of projectState?.runningTasks ?? []) {
        ids.add(taskId);
      }
    }
    return ids;
  }, [autoModeByProject]);
}
