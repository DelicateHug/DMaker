import { useState, useCallback, useEffect, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';

const logger = createLogger('AgentSession');

interface UseAgentSessionOptions {
  projectPath: string | undefined;
}

interface UseAgentSessionResult {
  currentSessionId: string | null;
  handleSelectSession: (sessionId: string | null) => void;
}

export function useAgentSession({ projectPath }: UseAgentSessionOptions): UseAgentSessionResult {
  const { setLastSelectedSession, getLastSelectedSession } = useAppStore(
    useShallow((state) => ({
      setLastSelectedSession: state.setLastSelectedSession,
      getLastSelectedSession: state.getLastSelectedSession,
    }))
  );
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Track the previous project path to detect changes
  const prevProjectPathRef = useRef<string | undefined>(undefined);

  // Handle session selection with persistence
  const handleSelectSession = useCallback(
    (sessionId: string | null) => {
      setCurrentSessionId(sessionId);
      // Persist the selection for this project
      if (projectPath) {
        setLastSelectedSession(projectPath, sessionId);
      }
    },
    [projectPath, setLastSelectedSession]
  );

  // Reset session and restore last selected session when project changes
  useEffect(() => {
    const previousPath = prevProjectPathRef.current;
    const isProjectChange = previousPath !== undefined && previousPath !== projectPath;

    // Update ref for next comparison
    prevProjectPathRef.current = projectPath;

    if (!projectPath) {
      // No project, reset session
      logger.info('No project path, resetting session');
      setCurrentSessionId(null);
      return;
    }

    if (isProjectChange) {
      // Project changed - reset session first, then restore last selected
      logger.info('Project changed from', previousPath, 'to', projectPath, '- resetting session');
      setCurrentSessionId(null);
    }

    // Restore last selected session for this project (on mount or project change)
    const lastSessionId = getLastSelectedSession(projectPath);
    if (lastSessionId) {
      logger.info(
        'Restoring last selected session for project:',
        projectPath,
        '- session:',
        lastSessionId
      );
      setCurrentSessionId(lastSessionId);
    } else if (isProjectChange) {
      // Project changed but no saved session - ensure we stay at null
      logger.info('No saved session for project:', projectPath);
    }
  }, [projectPath, getLastSelectedSession]);

  return {
    currentSessionId,
    handleSelectSession,
  };
}
