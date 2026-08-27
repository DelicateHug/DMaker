import { useEffect, useRef, useState } from 'react';
import { getElectronAPI, type AutoModeEvent } from '@/lib/electron';
import { createLogger } from '@dmaker/utils/logger';

const logger = createLogger('useAgentOutputStream');

/** Format an event timestamp the same way the agent output log does. */
function formatTimestamp(timestamp?: string): string {
  const date = timestamp ? new Date(timestamp) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return `[${date.toLocaleTimeString()}] `;
}

/**
 * Render a live auto-mode event as a line of agent output.
 *
 * Returns an empty string for events that carry no user-visible text, so the
 * caller can skip appending.
 */
function eventToText(event: AutoModeEvent): string {
  switch (event.type) {
    case 'auto_mode_progress':
      return event.content || '';
    case 'auto_mode_tool': {
      const input = event.input ? JSON.stringify(event.input, null, 2) : '';
      return `\n${formatTimestamp(event.timestamp)}🔧 Tool: ${event.tool || 'Unknown Tool'}\n${
        input ? `Input: ${input}\n` : ''
      }`;
    }
    case 'auto_mode_error':
      return `\n${formatTimestamp(event.timestamp)}❌ Error: ${event.error}\n`;
    case 'auto_mode_feature_complete':
      return `\n${formatTimestamp(event.timestamp)}${event.passes ? '✅' : '⚠️'} ${event.message}\n`;
    case 'pipeline_step_started':
      return `\n${formatTimestamp(event.timestamp)}▶ Step ${event.stepIndex + 1}/${
        event.totalSteps
      }: ${event.stepName}\n`;
    case 'pipeline_step_complete':
      return `\n${formatTimestamp(event.timestamp)}✔ Completed: ${event.stepName}\n`;
    default:
      return '';
  }
}

interface UseAgentOutputStreamResult {
  output: string;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Loads a feature's persisted agent output and keeps appending live auto-mode
 * events for that same feature.
 *
 * Events that arrive while the historical fetch is still in flight are buffered
 * and concatenated afterwards, so nothing is dropped and nothing is duplicated.
 */
export function useAgentOutputStream(
  projectPath: string | null,
  featureId: string | null
): UseAgentOutputStreamResult {
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Buffers events that land before the historical output resolves.
  const streamBufferRef = useRef('');
  const isLoadingRef = useRef(false);

  // Load historical output.
  useEffect(() => {
    if (!projectPath || !featureId) {
      setOutput('');
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    isLoadingRef.current = true;
    streamBufferRef.current = '';
    setError(null);

    const load = async () => {
      try {
        const api = getElectronAPI();
        if (!api?.features?.getAgentOutput) {
          setOutput('');
          return;
        }

        const result = await api.features.getAgentOutput(projectPath, featureId);
        if (cancelled) return;

        let historical = result.success ? result.content || '' : '';

        // No transcript on disk — fall back to whatever summaries the run left
        // behind. A finished task with nothing to show reads as "the agent did
        // nothing", when in fact it may simply have no transcript: runs from
        // before the output-path fix wrote theirs into the status directory
        // they started in and lost it on the next board refresh. The summary is
        // written through a freshly resolved path, so it usually survived.
        if (!historical && api.features.getSummaryFiles) {
          const summaryResult = await api.features.getSummaryFiles(projectPath, featureId);
          if (cancelled) return;
          const summaries = ('summaries' in summaryResult && summaryResult.summaries) || [];
          if (summaries.length > 0) {
            historical = [
              '_No agent transcript was saved for this run — showing the summaries it left behind._',
              ...summaries
                .slice()
                .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
                .map((entry) => `\n---\n\n### ${entry.timestamp}\n\n${entry.summary}`),
            ].join('\n');
          }
        }

        setOutput(historical + streamBufferRef.current);
        streamBufferRef.current = '';
      } catch (loadError) {
        if (cancelled) return;
        logger.warn('Failed to load agent output', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Failed to load agent output');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      isLoadingRef.current = false;
    };
  }, [projectPath, featureId, refreshCounter]);

  // Append live events for this feature.
  useEffect(() => {
    if (!featureId) return;

    const api = getElectronAPI();
    if (!api?.autoMode?.onEvent) return;

    const unsubscribe = api.autoMode.onEvent((event) => {
      // Events without a featureId are global (e.g. run-level errors); anything
      // carrying a different featureId belongs to another feature's pane.
      if ('featureId' in event && event.featureId !== featureId) return;

      const text = eventToText(event);
      if (!text) return;

      // Still fetching history — buffer so ordering stays correct.
      if (isLoadingRef.current) {
        streamBufferRef.current += text;
        return;
      }
      setOutput((previous) => previous + text);
    });

    return unsubscribe;
  }, [featureId]);

  return {
    output,
    isLoading,
    error,
    refresh: () => setRefreshCounter((count) => count + 1),
  };
}
