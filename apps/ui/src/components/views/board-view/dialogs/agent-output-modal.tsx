import { useEffect, useRef, useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  List,
  FileText,
  GitBranch,
  ClipboardList,
  ListChecks,
  ChevronDown,
  ChevronUp,
  History,
} from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { LogViewer } from '@/components/ui/log-viewer';
import { GitDiffPanel } from '@/components/ui/git-diff-panel';
import { TaskProgressPanel } from '@/components/ui/task-progress-panel';
import { Markdown } from '@/components/ui/markdown';
import { useAppStore } from '@/store/app-store';
import { extractSummary, extractAllSummaries, type SummaryEntry } from '@/lib/log-parser';
import type { AutoModeEvent } from '@/types/electron';
import type { SummaryHistoryEntry } from '@automaker/types';

/** Generates a timestamp marker in the format recognized by the log-parser: [timestamp:ISO8601] */
function formatTimestamp(): string {
  return `[timestamp:${new Date().toISOString()}]`;
}

/**
 * Formats a summary timestamp for display in the dropdown.
 * Shows relative time for recent summaries and absolute date/time for older ones.
 */
function formatSummaryTimestamp(timestamp: Date | null, index: number): string {
  if (!timestamp) return `Summary ${index + 1}`;

  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  // Build the time portion
  const timeStr = timestamp.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  // Build the date portion
  const dateStr = timestamp.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  if (diffMins < 1) return `Just now`;
  if (diffMins < 60) return `${diffMins}m ago · ${timeStr}`;
  if (diffHours < 24) return `${diffHours}h ago · ${timeStr}`;
  if (diffDays < 7) return `${diffDays}d ago · ${dateStr} ${timeStr}`;
  return `${dateStr} ${timeStr}`;
}

/**
 * Strips the model metadata comment from summary file content.
 * Summary .md files may start with `<!-- model: ... -->` which should not be displayed.
 */
function stripModelMetadata(content: string): string {
  return content.replace(/^<!--\s*model:\s*[^>]*-->\s*\n*/i, '').trim();
}

/**
 * Sanitizes summary content that may contain full agent logs instead of just the summary.
 * This can happen when the server's regex incorrectly matched <summary> tags that appeared
 * in the agent's discussion text rather than the actual summary block.
 *
 * Strategy: If the content looks like it contains raw log entries (timestamps, tool calls),
 * try to extract the actual summary from within it. Otherwise return it as-is.
 */
function sanitizeSummaryContent(rawContent: string): string {
  const content = stripModelMetadata(rawContent);

  // If content is short (< 5000 chars) and doesn't contain log-style timestamps,
  // it's likely already a clean summary
  const hasLogTimestamps = /\[timestamp:\d{4}-\d{2}-\d{2}T/.test(content);
  const hasToolCalls = /🔧 Tool: /.test(content);

  if (!hasLogTimestamps && !hasToolCalls) {
    return content;
  }

  // Content looks like it contains raw agent logs - try to extract the actual summary
  const extracted = extractSummary(content);
  if (extracted) {
    return extracted;
  }

  // No extractable summary found within the corrupted content - return as-is
  return content;
}

/**
 * Converts API summary history entries to the SummaryEntry format used by the UI.
 * SummaryHistoryEntry (from API) has { summary: string, timestamp: string (ISO) }
 * SummaryEntry (from log-parser) has { content: string, timestamp: Date | null, index: number }
 *
 * Sanitizes content to handle cases where summary files contain full agent logs
 * instead of just the extracted summary text.
 */
function apiSummariesToEntries(apiSummaries: SummaryHistoryEntry[]): SummaryEntry[] {
  return apiSummaries.map((entry, index) => ({
    content: sanitizeSummaryContent(entry.summary),
    timestamp: entry.timestamp ? new Date(entry.timestamp) : null,
    index,
  }));
}

/**
 * Merges API-fetched summary files with inline-extracted summaries from log output.
 * Deduplicates by comparing content (trimmed) to avoid showing the same summary twice.
 * API summaries take priority; inline summaries are added only if their content is unique.
 * Returns summaries sorted oldest to newest (matching extractAllSummaries convention).
 */
function mergeSummaries(apiEntries: SummaryEntry[], inlineEntries: SummaryEntry[]): SummaryEntry[] {
  // Start with API entries as the primary source
  const merged = [...apiEntries];
  const existingContents = new Set(apiEntries.map((e) => e.content.trim()));

  // Add inline entries that don't already exist in API entries (backward compatibility)
  for (const inline of inlineEntries) {
    if (!existingContents.has(inline.content.trim())) {
      merged.push(inline);
      existingContents.add(inline.content.trim());
    }
  }

  // Sort by timestamp (oldest first), nulls last
  merged.sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return a.timestamp.getTime() - b.timestamp.getTime();
  });

  // Re-index after sorting
  return merged.map((entry, index) => ({ ...entry, index }));
}

interface AgentOutputModalProps {
  open: boolean;
  onClose: () => void;
  featureDescription: string;
  featureId: string;
  /** The status of the feature - used to determine if spinner should be shown */
  featureStatus?: string;
  /** Called when a number key (0-9) is pressed while the modal is open */
  onNumberKeyPress?: (key: string) => void;
  /** Project path - if not provided, falls back to window.__currentProject for backward compatibility */
  projectPath?: string;
  /** Optional feature data from the store to display plan tasks immediately */
  feature?: {
    planSpec?: {
      tasks?: Array<{
        id: string;
        description: string;
        filePath?: string;
        phase?: string;
        status: string;
      }>;
      tasksCompleted?: number;
      currentTaskId?: string;
    };
  };
}

type ViewMode = 'summary' | 'plan' | 'parsed' | 'raw' | 'changes';

/** Character limit for truncated description */
const DESCRIPTION_TRUNCATE_LENGTH = 200;

export function AgentOutputModal({
  open,
  onClose,
  featureDescription,
  featureId,
  featureStatus,
  onNumberKeyPress,
  projectPath: projectPathProp,
  feature: featureProp,
}: AgentOutputModalProps) {
  const isBacklogPlan = featureId.startsWith('backlog-plan:');
  const [output, setOutput] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);
  const [projectPath, setProjectPath] = useState<string>('');
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [selectedSummaryIndex, setSelectedSummaryIndex] = useState<number>(-1); // -1 means most recent
  const [apiSummaries, setApiSummaries] = useState<SummaryHistoryEntry[]>([]);

  // Extract inline summaries from output (backward compatibility)
  const inlineSummaries = useMemo(() => extractAllSummaries(output), [output]);

  // Convert API summaries to SummaryEntry format and merge with inline summaries:
  // 1. Summary .md files from disk (apiSummaries) - sanitized to extract actual summary content
  // 2. Inline summaries extracted from raw agent output (inlineSummaries)
  const allSummaries = useMemo(() => {
    const apiEntries = apiSummariesToEntries(apiSummaries);
    return mergeSummaries(apiEntries, inlineSummaries);
  }, [apiSummaries, inlineSummaries]);

  // Get the currently selected summary (default to most recent)
  const selectedSummary = useMemo(() => {
    if (allSummaries.length === 0) return null;
    const idx = selectedSummaryIndex === -1 ? allSummaries.length - 1 : selectedSummaryIndex;
    return allSummaries[idx] || null;
  }, [allSummaries, selectedSummaryIndex]);

  // For backward compatibility - extract single summary from output if no API summaries exist
  const summary = useMemo(() => {
    if (selectedSummary) return selectedSummary.content;
    return extractSummary(output);
  }, [selectedSummary, output]);

  // Reset selected summary index when summaries change (new summaries may be added)
  useEffect(() => {
    setSelectedSummaryIndex(-1);
  }, [allSummaries.length]);

  // Determine if description should be truncatable and compute truncated text
  const descriptionInfo = useMemo(() => {
    const shouldTruncate = featureDescription.length > DESCRIPTION_TRUNCATE_LENGTH;
    const truncatedText = shouldTruncate
      ? featureDescription.slice(0, DESCRIPTION_TRUNCATE_LENGTH).trimEnd() + '...'
      : featureDescription;
    return { shouldTruncate, truncatedText };
  }, [featureDescription]);

  // Determine the effective view mode - default to summary if available, otherwise parsed (logs)
  const effectiveViewMode = viewMode ?? (summary ? 'summary' : output ? 'parsed' : 'summary');
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  /** Reactive mirror of autoScrollRef so the status indicator re-renders on change */
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const projectPathRef = useRef<string>('');
  /** Tracks whether loadOutput() is currently in-flight so streaming handlers know to buffer */
  const isLoadingRef = useRef(false);
  /** Buffers streaming events that arrive while loadOutput() is fetching historical output */
  const streamBufferRef = useRef<string>('');
  const useWorktrees = useAppStore((state) => state.useWorktrees);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  // Load existing output from file and fetch summary files from API.
  // Uses isLoadingRef + streamBufferRef to avoid a race condition where streaming
  // events received during the async fetch would be lost when setOutput replaces state.
  useEffect(() => {
    if (!open) return;

    const loadOutput = async () => {
      const api = getElectronAPI();
      if (!api) return;

      // Signal that loading is in-flight so streaming handlers buffer instead of setState
      isLoadingRef.current = true;
      streamBufferRef.current = '';
      setIsLoading(true);

      try {
        // Use projectPath prop if provided, otherwise fall back to window.__currentProject for backward compatibility
        const resolvedProjectPath = projectPathProp || (window as any).__currentProject?.path;
        if (!resolvedProjectPath) {
          console.warn('[AgentOutputModal] No project path available, cannot load output');
          return;
        }

        projectPathRef.current = resolvedProjectPath;
        setProjectPath(resolvedProjectPath);

        if (isBacklogPlan) {
          setOutput('');
          setApiSummaries([]);
          return;
        }

        // Fetch agent output and summary files in parallel
        if (api.features) {
          // Fetch output and summaries independently so one failure doesn't affect the other
          const outputPromise = api.features
            .getAgentOutput(resolvedProjectPath, featureId)
            .catch((err: unknown) => {
              console.warn('[AgentOutputModal] Failed to fetch agent output:', err);
              return { success: false as const, content: null };
            });
          const summariesPromise =
            api.features.getSummaries?.(resolvedProjectPath, featureId).catch((err: unknown) => {
              console.warn('[AgentOutputModal] Failed to fetch summaries from API:', err);
              return { success: false as const, summaries: [] as SummaryHistoryEntry[] };
            }) ??
            Promise.resolve({ success: false as const, summaries: [] as SummaryHistoryEntry[] });

          const [outputResult, summariesResult] = await Promise.all([
            outputPromise,
            summariesPromise,
          ]);

          // Merge historical output with any streaming events buffered during the fetch
          const historicalContent = outputResult.success ? outputResult.content || '' : '';
          const buffered = streamBufferRef.current;
          setOutput(historicalContent + buffered);

          if (
            summariesResult &&
            'summaries' in summariesResult &&
            summariesResult.success &&
            summariesResult.summaries
          ) {
            setApiSummaries(summariesResult.summaries);
          } else {
            setApiSummaries([]);
          }
        } else {
          setOutput('');
          setApiSummaries([]);
        }
      } catch (error) {
        console.error('Failed to load output:', error);
        setOutput('');
        setApiSummaries([]);
      } finally {
        // Mark loading as complete so streaming handlers switch back to direct setState
        isLoadingRef.current = false;
        streamBufferRef.current = '';
        setIsLoading(false);
      }
    };

    loadOutput();
  }, [open, featureId, projectPathProp, isBacklogPlan]);

  // Listen to auto mode events and update output
  useEffect(() => {
    if (!open) return;

    const api = getElectronAPI();
    if (!api?.autoMode || isBacklogPlan) return;

    console.log('[AgentOutputModal] Subscribing to events for featureId:', featureId);

    const unsubscribe = api.autoMode.onEvent((event) => {
      console.log(
        '[AgentOutputModal] Received event:',
        event.type,
        'featureId:',
        'featureId' in event ? event.featureId : 'none',
        'modalFeatureId:',
        featureId
      );

      // Filter events for this specific feature only (skip events without featureId)
      if ('featureId' in event && event.featureId !== featureId) {
        console.log('[AgentOutputModal] Skipping event - featureId mismatch');
        return;
      }

      let newContent = '';

      switch (event.type) {
        case 'auto_mode_progress':
          newContent = event.content || '';
          break;
        case 'auto_mode_tool': {
          const toolName = event.tool || 'Unknown Tool';
          const toolInput = event.input ? JSON.stringify(event.input, null, 2) : '';
          newContent = `\n${formatTimestamp()}🔧 Tool: ${toolName}\n${toolInput ? `Input: ${toolInput}\n` : ''}`;
          break;
        }
        case 'auto_mode_phase': {
          const phaseEmoji =
            event.phase === 'planning' ? '📋' : event.phase === 'action' ? '⚡' : '✅';
          newContent = `\n${formatTimestamp()}${phaseEmoji} ${event.message}\n`;
          break;
        }
        case 'auto_mode_error':
          newContent = `\n${formatTimestamp()}❌ Error: ${event.error}\n`;
          break;
        case 'auto_mode_ultrathink_preparation': {
          // Format thinking level preparation information
          let prepContent = `\n${formatTimestamp()}🧠 Ultrathink Preparation\n`;

          if (event.warnings && event.warnings.length > 0) {
            prepContent += `\n⚠️ Warnings:\n`;
            event.warnings.forEach((warning: string) => {
              prepContent += `  • ${warning}\n`;
            });
          }

          if (event.recommendations && event.recommendations.length > 0) {
            prepContent += `\n💡 Recommendations:\n`;
            event.recommendations.forEach((rec: string) => {
              prepContent += `  • ${rec}\n`;
            });
          }

          if (event.estimatedCost !== undefined) {
            prepContent += `\n💰 Estimated Cost: ~$${event.estimatedCost.toFixed(
              2
            )} per execution\n`;
          }

          if (event.estimatedTime) {
            prepContent += `\n⏱️ Estimated Time: ${event.estimatedTime}\n`;
          }

          newContent = prepContent;
          break;
        }
        case 'planning_started': {
          // Show when planning mode begins
          if ('mode' in event && 'message' in event) {
            const modeLabel =
              event.mode === 'lite' ? 'Lite' : event.mode === 'spec' ? 'Spec' : 'Full';
            newContent = `\n${formatTimestamp()}📋 Planning Mode: ${modeLabel}\n${event.message}\n`;
          }
          break;
        }
        case 'plan_approval_required':
          // Show when plan requires approval
          if ('planningMode' in event) {
            newContent = `\n${formatTimestamp()}⏸️ Plan generated - waiting for your approval...\n`;
          }
          break;
        case 'plan_approved':
          // Show when plan is manually approved
          if ('hasEdits' in event) {
            newContent = event.hasEdits
              ? `\n${formatTimestamp()}✅ Plan approved (with edits) - continuing to implementation...\n`
              : `\n${formatTimestamp()}✅ Plan approved - continuing to implementation...\n`;
          }
          break;
        case 'plan_auto_approved':
          // Show when plan is auto-approved
          newContent = `\n${formatTimestamp()}✅ Plan auto-approved - continuing to implementation...\n`;
          break;
        case 'plan_revision_requested': {
          // Show when user requests plan revision
          if ('planVersion' in event) {
            const revisionEvent = event as Extract<
              AutoModeEvent,
              { type: 'plan_revision_requested' }
            >;
            newContent = `\n${formatTimestamp()}🔄 Revising plan based on your feedback (v${revisionEvent.planVersion})...\n`;
          }
          break;
        }
        case 'auto_mode_task_started': {
          // Show when a task starts
          if ('taskId' in event && 'taskDescription' in event) {
            const taskEvent = event as Extract<AutoModeEvent, { type: 'auto_mode_task_started' }>;
            newContent = `\n${formatTimestamp()}▶ Starting ${taskEvent.taskId}: ${taskEvent.taskDescription}\n`;
          }
          break;
        }
        case 'auto_mode_task_complete': {
          // Show task completion progress
          if ('taskId' in event && 'tasksCompleted' in event && 'tasksTotal' in event) {
            const taskEvent = event as Extract<AutoModeEvent, { type: 'auto_mode_task_complete' }>;
            newContent = `\n${formatTimestamp()}✓ ${taskEvent.taskId} completed (${taskEvent.tasksCompleted}/${taskEvent.tasksTotal})\n`;
          }
          break;
        }
        case 'auto_mode_phase_complete': {
          // Show phase completion for full mode
          if ('phaseNumber' in event) {
            const phaseEvent = event as Extract<
              AutoModeEvent,
              { type: 'auto_mode_phase_complete' }
            >;
            newContent = `\n${formatTimestamp()}🏁 Phase ${phaseEvent.phaseNumber} complete\n`;
          }
          break;
        }
        case 'auto_mode_feature_complete': {
          const emoji = event.passes ? '✅' : '⚠️';
          newContent = `\n${formatTimestamp()}${emoji} Task completed: ${event.message}\n`;

          // Close the modal when the feature is verified (passes = true)
          if (event.passes) {
            // Small delay to show the completion message before closing
            setTimeout(() => {
              onClose();
            }, 1500);
          }
          break;
        }
      }

      if (newContent) {
        if (isLoadingRef.current) {
          // Buffer streaming events while loadOutput() is in-flight to avoid them
          // being overwritten when setOutput replaces state with historical content
          streamBufferRef.current += newContent;
        } else {
          // Loading complete - append directly to state
          setOutput((prev) => prev + newContent);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [open, featureId, isBacklogPlan]);

  // Listen to backlog plan events and update output
  useEffect(() => {
    if (!open || !isBacklogPlan) return;

    const api = getElectronAPI();
    if (!api?.backlogPlan) return;

    const unsubscribe = api.backlogPlan.onEvent((event: any) => {
      if (!event?.type) return;

      let newContent = '';
      switch (event.type) {
        case 'backlog_plan_progress':
          newContent = `\n${formatTimestamp()}🧭 ${event.content || 'Backlog plan progress update'}\n`;
          break;
        case 'backlog_plan_error':
          newContent = `\n${formatTimestamp()}❌ Backlog plan error: ${event.error || 'Unknown error'}\n`;
          break;
        case 'backlog_plan_complete':
          newContent = `\n${formatTimestamp()}✅ Backlog plan completed\n`;
          break;
        default:
          newContent = `\n${formatTimestamp()}ℹ️ ${event.type}\n`;
          break;
      }

      if (newContent) {
        if (isLoadingRef.current) {
          // Buffer streaming events while loadOutput() is in-flight to avoid them
          // being overwritten when setOutput replaces state with historical content
          streamBufferRef.current += newContent;
        } else {
          // Loading complete - append directly to state
          setOutput((prev) => `${prev}${newContent}`);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [open, isBacklogPlan]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    autoScrollRef.current = isAtBottom;
    setIsAutoScrolling(isAtBottom);
  };

  // Handle number key presses while modal is open
  useEffect(() => {
    if (!open || !onNumberKeyPress) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if a number key (0-9) was pressed without modifiers
      if (!event.ctrlKey && !event.altKey && !event.metaKey && /^[0-9]$/.test(event.key)) {
        event.preventDefault();
        onNumberKeyPress(event.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onNumberKeyPress]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="w-full h-full max-w-full max-h-full sm:w-[90vw] sm:max-w-[90vw] md:w-[85vw] md:max-w-[85vw] lg:w-[80vw] lg:max-w-[80vw] xl:w-[75vw] xl:max-w-[75vw] 2xl:w-[70vw] 2xl:max-w-[70vw] sm:max-h-[85vh] sm:h-auto sm:rounded-xl rounded-none flex flex-col"
        data-testid="agent-output-modal"
      >
        <DialogHeader className="shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pr-8">
            <DialogTitle className="flex items-center gap-2">
              {featureStatus !== 'completed' && featureStatus !== 'waiting_approval' && (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              )}
              Agent Output
            </DialogTitle>
            <div className="flex items-center gap-0.5 bg-muted rounded-lg p-[3px] border border-border overflow-x-auto">
              <div className="flex items-center">
                <button
                  onClick={() => setViewMode('summary')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap border ${
                    effectiveViewMode === 'summary'
                      ? 'bg-primary text-primary-foreground shadow-md border-primary/50'
                      : 'text-foreground/70 hover:text-foreground hover:bg-accent border-transparent'
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`}
                  data-testid="view-mode-summary"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Summary
                  {allSummaries.length > 1 && (
                    <span className="ml-0.5 px-1.5 py-0.5 bg-primary/20 text-primary rounded-full text-[10px] leading-none font-bold">
                      {allSummaries.length}
                    </span>
                  )}
                </button>
                {allSummaries.length >= 1 && effectiveViewMode === 'summary' && (
                  <Select
                    value={selectedSummaryIndex.toString()}
                    onValueChange={(value) => setSelectedSummaryIndex(parseInt(value))}
                  >
                    <SelectTrigger
                      className="h-7 w-auto min-w-[140px] ml-1 border-border/50 text-xs"
                      data-testid="summary-history-dropdown"
                    >
                      <History className="w-3 h-3 mr-1" />
                      <SelectValue placeholder="Latest" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="-1">
                        Newest{allSummaries.length > 1 ? ` (of ${allSummaries.length})` : ''}
                      </SelectItem>
                      {allSummaries.map((s, idx) => (
                        <SelectItem key={idx} value={idx.toString()}>
                          {idx === allSummaries.length - 1 ? '★ ' : ''}
                          {formatSummaryTimestamp(s.timestamp, idx)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {!isBacklogPlan && (
                <button
                  onClick={() => setViewMode('plan')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap border ${
                    effectiveViewMode === 'plan'
                      ? 'bg-primary text-primary-foreground shadow-md border-primary/50'
                      : 'text-foreground/70 hover:text-foreground hover:bg-accent border-transparent'
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`}
                  data-testid="view-mode-plan"
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  Plan
                </button>
              )}
              <button
                onClick={() => setViewMode('parsed')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap border ${
                  effectiveViewMode === 'parsed'
                    ? 'bg-primary text-primary-foreground shadow-md border-primary/50'
                    : 'text-foreground/70 hover:text-foreground hover:bg-accent border-transparent'
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`}
                data-testid="view-mode-parsed"
              >
                <List className="w-3.5 h-3.5" />
                Logs
              </button>
              <button
                onClick={() => setViewMode('changes')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap border ${
                  effectiveViewMode === 'changes'
                    ? 'bg-primary text-primary-foreground shadow-md border-primary/50'
                    : 'text-foreground/70 hover:text-foreground hover:bg-accent border-transparent'
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`}
                data-testid="view-mode-changes"
              >
                <GitBranch className="w-3.5 h-3.5" />
                Changes
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap border ${
                  effectiveViewMode === 'raw'
                    ? 'bg-primary text-primary-foreground shadow-md border-primary/50'
                    : 'text-foreground/70 hover:text-foreground hover:bg-accent border-transparent'
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`}
                data-testid="view-mode-raw"
              >
                <FileText className="w-3.5 h-3.5" />
                Raw
              </button>
            </div>
          </div>
          <DialogDescription
            className="mt-2 wrap-break-word text-sm text-muted-foreground/90"
            data-testid="agent-output-description"
          >
            <div
              className={`leading-relaxed tracking-normal ${descriptionInfo.shouldTruncate && !isDescriptionExpanded ? '' : 'max-h-32 overflow-y-auto pr-1'}`}
            >
              <span>
                {descriptionInfo.shouldTruncate && !isDescriptionExpanded
                  ? descriptionInfo.truncatedText
                  : featureDescription}
              </span>
              {featureId && (
                <span
                  className="inline-block ml-2 font-mono text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded align-middle"
                  data-testid="agent-output-feature-id"
                >
                  {featureId}
                </span>
              )}
            </div>
            {descriptionInfo.shouldTruncate && (
              <button
                onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                data-testid="description-toggle"
              >
                {isDescriptionExpanded ? (
                  <>
                    Show less
                    <ChevronUp className="w-3 h-3" />
                  </>
                ) : (
                  <>
                    Show more
                    <ChevronDown className="w-3 h-3" />
                  </>
                )}
              </button>
            )}
          </DialogDescription>
        </DialogHeader>

        {effectiveViewMode === 'plan' ? (
          <div className="flex-1 min-h-0 sm:min-h-[200px] sm:max-h-[60vh] overflow-y-auto scrollbar-visible px-3 py-2">
            <TaskProgressPanel
              featureId={featureId}
              projectPath={projectPath}
              defaultExpanded={true}
              fullHeight={true}
              initialFeature={featureProp}
            />
          </div>
        ) : effectiveViewMode === 'changes' ? (
          <div className="flex-1 min-h-0 sm:min-h-[200px] sm:max-h-[60vh] overflow-y-auto scrollbar-visible">
            {projectPath ? (
              <GitDiffPanel
                projectPath={projectPath}
                featureId={featureId}
                compact={false}
                useWorktrees={useWorktrees}
                className="border-0 rounded-lg"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading...
              </div>
            )}
          </div>
        ) : effectiveViewMode === 'summary' ? (
          <div className="flex-1 min-h-[200px] sm:max-h-[60vh] overflow-y-auto bg-card border border-border/50 rounded-lg p-4 scrollbar-visible">
            {summary ? (
              <Markdown>{summary}</Markdown>
            ) : (
              <div className="flex items-center justify-center min-h-[150px] text-muted-foreground">
                No summary available yet.
              </div>
            )}
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 min-h-[200px] sm:max-h-[60vh] overflow-y-auto bg-popover border border-border/50 rounded-lg p-4 font-mono text-xs scrollbar-visible"
            >
              {isLoading && !output ? (
                <div className="flex items-center justify-center min-h-[150px] text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  Loading output...
                </div>
              ) : !output ? (
                <div className="flex items-center justify-center min-h-[150px] text-muted-foreground">
                  No output yet. The agent will stream output here as it works.
                </div>
              ) : effectiveViewMode === 'parsed' ? (
                <LogViewer output={output} scrollContainerRef={scrollRef} />
              ) : (
                <div className="whitespace-pre-wrap wrap-break-word text-foreground/80">
                  {output}
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground text-center shrink-0">
              {isAutoScrolling
                ? 'Auto-scrolling enabled'
                : 'Scroll to bottom to enable auto-scroll'}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
