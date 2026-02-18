import * as React from 'react';
import { memo, useState, useCallback, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, Minus, Plus, Trash2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getProjectIcon } from '@/lib/icon-registry';
import type { Project } from '@/lib/electron';
import type { StatusTabId, StatusTab } from '../hooks/use-board-status-tabs';

/** Special value representing "All Projects" selection */
const ALL_PROJECTS_ID = '__all_projects__';

/** Base (non-deletable) status IDs */
const BASE_STATUS_IDS = new Set<string>([
  'backlog',
  'in_progress',
  'waiting_approval',
  'completed',
  'all',
]);

/** Color options for new statuses */
const STATUS_COLORS = [
  'bg-blue-500/20',
  'bg-purple-500/20',
  'bg-green-500/20',
  'bg-orange-500/20',
  'bg-red-500/20',
  'bg-pink-500/20',
  'bg-cyan-500/20',
  'bg-amber-500/20',
  'bg-indigo-500/20',
];

type DiffState = 'unchanged' | 'added' | 'removed';

function getItemDiffState(itemId: string, committedIds: string[], stagedIds: string[]): DiffState {
  const isCommitted = committedIds.includes(itemId);
  const isStaged = stagedIds.includes(itemId);

  if (isCommitted && !isStaged) return 'removed';
  if (!isCommitted && isStaged) return 'added';
  return 'unchanged';
}

function CheckboxIndicator({ checked, diffState }: { checked: boolean; diffState: DiffState }) {
  return (
    <span
      className={cn(
        'flex items-center justify-center shrink-0',
        'w-4 h-4 rounded-sm border transition-colors duration-150',
        checked
          ? 'bg-primary border-primary text-primary-foreground'
          : 'border-muted-foreground/40 bg-transparent',
        diffState === 'added' && 'ring-1 ring-emerald-500/60',
        diffState === 'removed' && 'ring-1 ring-red-500/60'
      )}
      aria-hidden="true"
    >
      {checked && <Check className="w-3 h-3" strokeWidth={3} />}
    </span>
  );
}

function DiffBadge({ diffState }: { diffState: DiffState }) {
  if (diffState === 'unchanged') return null;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center shrink-0',
        'w-4 h-4 rounded-full text-[10px] font-bold',
        diffState === 'added' && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        diffState === 'removed' && 'bg-red-500/15 text-red-600 dark:text-red-400'
      )}
      aria-label={diffState === 'added' ? 'Will be selected' : 'Will be deselected'}
    >
      {diffState === 'added' ? (
        <Plus className="w-2.5 h-2.5" strokeWidth={3} />
      ) : (
        <Minus className="w-2.5 h-2.5" strokeWidth={3} />
      )}
    </span>
  );
}

function StatusColorDot({ colorClass, size = 'sm' }: { colorClass: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn('rounded-full shrink-0', size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5', colorClass)}
      aria-hidden="true"
    />
  );
}

function InlineCountBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center',
        'min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-medium',
        'bg-foreground/10 text-foreground/70'
      )}
      aria-label={`${count} items`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export interface BoardFilterDropdownProps {
  /** List of available projects */
  projects: Project[];
  /** Currently selected project IDs (multi-select). Use [ALL_PROJECTS_ID] for "all". */
  selectedProjectIds: string[];
  /** Callback when project selection changes (committed on dropdown close) */
  onProjectSelectionChange: (projectIds: string[]) => void;
  /** Currently active status tab IDs (multi-select) */
  activeTabs: StatusTabId[];
  /** Callback when status selection changes (committed on dropdown close) */
  onTabChange: (tabIds: StatusTabId[]) => void;
  /** Available status tabs to display */
  tabs: StatusTab[];
  /** Optional: Feature counts per tab (keyed by tab ID) */
  tabCounts?: Record<string, number>;
  /** Callback to create a new custom status (pipeline step) */
  onCreateStatus?: (name: string, colorClass: string) => void;
  /** Callback to delete a custom status (pipeline step) */
  onDeleteStatus?: (tabId: StatusTabId) => void;
  /** Callback to create a new project */
  onCreateProject?: () => void;
  /** Additional CSS classes for the trigger button */
  className?: string;
  /** Alignment of the dropdown content relative to the trigger */
  align?: 'start' | 'center' | 'end';
}

/**
 * BoardFilterDropdown - Combined project + status filter dropdown.
 *
 * Displays projects on the left and statuses on the right, separated by a
 * vertical divider. Both sides use the same staged-selection pattern:
 * - On open: copies current selections into local staged state
 * - On item click: toggles in staged state (with "All" deselection logic)
 * - On close: commits staged state to parent via callbacks
 */
export const BoardFilterDropdown = memo(function BoardFilterDropdown({
  projects,
  selectedProjectIds,
  onProjectSelectionChange,
  activeTabs,
  onTabChange,
  tabs,
  tabCounts,
  onCreateStatus,
  onDeleteStatus,
  onCreateProject,
  className,
  align = 'start',
}: BoardFilterDropdownProps) {
  const [open, setOpen] = useState(false);

  // --- Project staged selection state ---
  const [stagedProjectIds, setStagedProjectIds] = useState<string[]>(selectedProjectIds);
  const stagedProjectRef = useRef<string[]>(selectedProjectIds);

  // --- Status staged selection state ---
  const [stagedTabs, setStagedTabs] = useState<StatusTabId[]>(activeTabs);
  const stagedTabRef = useRef<StatusTabId[]>(activeTabs);

  // --- New status input state ---
  const [newStatusName, setNewStatusName] = useState('');
  const [showNewStatusInput, setShowNewStatusInput] = useState(false);
  const newStatusInputRef = useRef<HTMLInputElement>(null);

  // --- Trigger label computation ---
  const primaryProjectId = selectedProjectIds[0];
  const primaryProject = useMemo(
    () => projects.find((p) => p.id === primaryProjectId),
    [projects, primaryProjectId]
  );

  const projectLabel = useMemo(() => {
    if (selectedProjectIds.length === 0) return 'All Projects';
    if (selectedProjectIds.includes(ALL_PROJECTS_ID)) return 'All Projects';
    if (selectedProjectIds.length === 1) {
      return primaryProject?.name ?? 'Project';
    }
    const firstName = primaryProject?.name ?? 'Project';
    return `${firstName} +${selectedProjectIds.length - 1}`;
  }, [selectedProjectIds, primaryProject]);

  const primaryTab = activeTabs[0];
  const activeTabConfig = useMemo(() => tabs.find((t) => t.id === primaryTab), [tabs, primaryTab]);

  const statusLabel = useMemo(() => {
    if (activeTabs.length === 0) return 'All Statuses';
    if (activeTabs.includes('all')) return 'All Statuses';
    if (activeTabs.length === 1) {
      return activeTabConfig?.label ?? 'Status';
    }
    const firstLabel = activeTabConfig?.label ?? 'Status';
    return `${firstLabel} +${activeTabs.length - 1}`;
  }, [activeTabs, activeTabConfig]);

  const TriggerIcon = useMemo(() => {
    if (selectedProjectIds.includes(ALL_PROJECTS_ID) || selectedProjectIds.length !== 1) {
      return Layers;
    }
    return primaryProject ? getProjectIcon(primaryProject.icon) : Layers;
  }, [selectedProjectIds, primaryProject]);

  // Count existing pipeline steps to pick a color for new ones
  const pipelineStepCount = useMemo(
    () => tabs.filter((t) => !BASE_STATUS_IDS.has(t.id)).length,
    [tabs]
  );

  // --- Open/Close handler ---
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        // Opening: snapshot current selections
        setStagedProjectIds(selectedProjectIds);
        stagedProjectRef.current = selectedProjectIds;
        setStagedTabs(activeTabs);
        stagedTabRef.current = activeTabs;
      } else {
        // Closing: commit both selections
        const stagedP = stagedProjectRef.current;
        const projectChanged =
          stagedP.length !== selectedProjectIds.length ||
          stagedP.some((id) => !selectedProjectIds.includes(id));
        if (projectChanged) {
          onProjectSelectionChange(stagedP);
        }

        const stagedT = stagedTabRef.current;
        const tabChanged =
          stagedT.length !== activeTabs.length || stagedT.some((id) => !activeTabs.includes(id));
        if (tabChanged) {
          onTabChange(stagedT);
        }

        // Reset new-status input
        setShowNewStatusInput(false);
        setNewStatusName('');
      }
      setOpen(nextOpen);
    },
    [selectedProjectIds, activeTabs, onProjectSelectionChange, onTabChange]
  );

  // --- Project toggle handler ---
  const handleProjectToggle = useCallback((itemId: string) => {
    setStagedProjectIds((current) => {
      let next: string[];

      if (itemId === ALL_PROJECTS_ID) {
        next = [ALL_PROJECTS_ID];
      } else {
        const isCurrentlyActive = current.includes(itemId);

        if (isCurrentlyActive) {
          const remaining = current.filter((id) => id !== itemId);
          next = remaining.length === 0 ? [ALL_PROJECTS_ID] : remaining;
        } else {
          const withoutAll = current.filter((id) => id !== ALL_PROJECTS_ID);
          next = [...withoutAll, itemId];
        }
      }

      stagedProjectRef.current = next;
      return next;
    });
  }, []);

  // --- Status toggle handler ---
  const handleStatusToggle = useCallback((tabId: StatusTabId) => {
    setStagedTabs((current) => {
      let next: StatusTabId[];

      if (tabId === 'all') {
        next = ['all'];
      } else {
        const isCurrentlyActive = current.includes(tabId);

        if (isCurrentlyActive) {
          const remaining = current.filter((id) => id !== tabId);
          next = remaining.length === 0 ? ['all'] : remaining;
        } else {
          const withoutAll = current.filter((id) => id !== 'all');
          next = [...withoutAll, tabId];
        }
      }

      stagedTabRef.current = next;
      return next;
    });
  }, []);

  // --- Create status handler ---
  const handleCreateStatus = useCallback(() => {
    const name = newStatusName.trim();
    if (!name || !onCreateStatus) return;

    const colorIndex = pipelineStepCount % STATUS_COLORS.length;
    onCreateStatus(name, STATUS_COLORS[colorIndex]);
    setNewStatusName('');
    setShowNewStatusInput(false);
  }, [newStatusName, onCreateStatus, pipelineStepCount]);

  // --- Delete status handler ---
  const handleDeleteStatus = useCallback(
    (e: React.MouseEvent, tabId: StatusTabId) => {
      e.preventDefault();
      e.stopPropagation();
      if (!onDeleteStatus) return;

      setStagedTabs((current) => {
        const remaining = current.filter((id) => id !== tabId);
        const next = remaining.length === 0 ? ['all'] : remaining;
        stagedTabRef.current = next;
        return next;
      });

      onDeleteStatus(tabId);
    },
    [onDeleteStatus]
  );

  // --- Pending changes detection ---
  const hasProjectPendingChanges = useMemo(() => {
    if (stagedProjectIds.length !== selectedProjectIds.length) return true;
    return stagedProjectIds.some((id) => !selectedProjectIds.includes(id));
  }, [stagedProjectIds, selectedProjectIds]);

  const hasStatusPendingChanges = useMemo(() => {
    if (stagedTabs.length !== activeTabs.length) return true;
    return stagedTabs.some((id) => !activeTabs.includes(id));
  }, [stagedTabs, activeTabs]);

  const hasPendingChanges = hasProjectPendingChanges || hasStatusPendingChanges;

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'flex items-center gap-1.5 h-7 px-2',
            'hover:bg-accent/50 transition-colors duration-150',
            'font-medium text-xs',
            className
          )}
          data-testid="board-filter-dropdown-trigger"
        >
          <TriggerIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="max-w-[100px] truncate">{projectLabel}</span>
          <span className="text-muted-foreground/50 mx-0.5">/</span>
          {activeTabConfig && <StatusColorDot colorClass={activeTabConfig.colorClass} size="sm" />}
          <span className="max-w-[100px] truncate">{statusLabel}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        className="p-0 w-auto max-w-[calc(100vw-2rem)] max-h-[min(28rem,70vh)]"
        data-testid="board-filter-dropdown-content"
      >
        <div className="flex">
          {/* Left panel: Projects */}
          <div className="w-52 flex flex-col max-h-[min(28rem,70vh)]">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground sticky top-0 bg-popover z-10">
              Projects
            </div>
            <div className="h-px bg-border mx-2" />

            {/* Scrollable project items with min 6-slot height */}
            <div className="overflow-y-auto min-h-[13.5rem] flex-1">
              {/* Individual projects */}
              {projects.map((project) => {
                const isStaged = stagedProjectIds.includes(project.id);
                const diffState = getItemDiffState(
                  project.id,
                  selectedProjectIds,
                  stagedProjectIds
                );
                const ProjectIcon = getProjectIcon(project.icon);

                return (
                  <ProjectItem
                    key={project.id}
                    id={project.id}
                    label={project.name}
                    icon={<ProjectIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    isStaged={isStaged}
                    diffState={diffState}
                    onToggle={handleProjectToggle}
                    testId={`board-filter-dropdown-project-${project.id}`}
                  />
                );
              })}
            </div>

            <div className="h-px bg-border mx-2" />

            {/* "All Projects" option */}
            <ProjectItem
              id={ALL_PROJECTS_ID}
              label="All Projects"
              icon={<Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              isStaged={stagedProjectIds.includes(ALL_PROJECTS_ID)}
              diffState={getItemDiffState(ALL_PROJECTS_ID, selectedProjectIds, stagedProjectIds)}
              onToggle={handleProjectToggle}
              testId="board-filter-dropdown-project-all"
            />

            {/* New Project button */}
            {onCreateProject && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onCreateProject();
                }}
                className="flex items-center gap-2 cursor-pointer px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors w-full text-left"
                data-testid="board-filter-dropdown-create-project"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">New Project</span>
              </button>
            )}
          </div>

          {/* Vertical separator */}
          <div className="w-px bg-border shrink-0" />

          {/* Right panel: Statuses */}
          <div className="w-52 flex flex-col max-h-[min(28rem,70vh)]">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground sticky top-0 bg-popover z-10">
              Statuses
            </div>
            <div className="h-px bg-border mx-2" />

            {/* Scrollable status items with min 6-slot height */}
            <div className="overflow-y-auto min-h-[13.5rem] flex-1">
              {/* Regular status items (excluding "All Statuses") */}
              {tabs
                .filter((tab) => tab.id !== 'all')
                .map((tab) => {
                  const isStaged = stagedTabs.includes(tab.id);
                  const diffState = getItemDiffState(tab.id, activeTabs, stagedTabs);
                  const count = tabCounts?.[tab.id];
                  const isDeletable = onDeleteStatus && !BASE_STATUS_IDS.has(tab.id);

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        handleStatusToggle(tab.id);
                      }}
                      className={cn(
                        'flex items-center gap-2 cursor-pointer min-h-[2.25rem] w-full px-3 py-1.5',
                        'text-left transition-colors duration-100',
                        'hover:bg-accent/50',
                        isStaged && 'bg-accent',
                        diffState === 'added' && 'bg-emerald-500/5',
                        diffState === 'removed' && 'bg-red-500/5'
                      )}
                      data-testid={`board-filter-dropdown-status-${tab.id}`}
                      role="option"
                      aria-selected={isStaged}
                    >
                      <CheckboxIndicator checked={isStaged} diffState={diffState} />
                      <StatusColorDot colorClass={tab.colorClass} size="md" />
                      <span
                        className={cn(
                          'flex-1 text-sm truncate',
                          diffState === 'removed' && 'text-muted-foreground line-through'
                        )}
                      >
                        {tab.label}
                      </span>
                      {count !== undefined && <InlineCountBadge count={count} />}
                      <DiffBadge diffState={diffState} />
                      {isDeletable && (
                        <button
                          type="button"
                          className={cn(
                            'flex items-center justify-center shrink-0',
                            'w-5 h-5 rounded-sm',
                            'text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10',
                            'transition-colors duration-150'
                          )}
                          onClick={(e) => handleDeleteStatus(e, tab.id)}
                          title={`Delete "${tab.label}" status`}
                          aria-label={`Delete ${tab.label} status`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </button>
                  );
                })}
            </div>

            {/* "All Statuses" option - below separator */}
            {(() => {
              const allTab = tabs.find((tab) => tab.id === 'all');
              if (!allTab) return null;
              const isStaged = stagedTabs.includes('all');
              const diffState = getItemDiffState('all', activeTabs, stagedTabs);
              const count = tabCounts?.['all'];

              return (
                <>
                  <div className="h-px bg-border mx-2" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleStatusToggle('all');
                    }}
                    className={cn(
                      'flex items-center gap-2 cursor-pointer min-h-[2.25rem] w-full px-3 py-1.5',
                      'text-left transition-colors duration-100',
                      'hover:bg-accent/50',
                      isStaged && 'bg-accent',
                      diffState === 'added' && 'bg-emerald-500/5',
                      diffState === 'removed' && 'bg-red-500/5'
                    )}
                    data-testid="board-filter-dropdown-status-all"
                    role="option"
                    aria-selected={isStaged}
                  >
                    <CheckboxIndicator checked={isStaged} diffState={diffState} />
                    <StatusColorDot colorClass={allTab.colorClass} size="md" />
                    <span
                      className={cn(
                        'flex-1 text-sm truncate',
                        diffState === 'removed' && 'text-muted-foreground line-through'
                      )}
                    >
                      {allTab.label}
                    </span>
                    {count !== undefined && <InlineCountBadge count={count} />}
                    <DiffBadge diffState={diffState} />
                  </button>
                </>
              );
            })()}

            {/* Create new status section - no separator, shares the line above "All Statuses" */}
            {onCreateStatus && (
              <>
                {showNewStatusInput ? (
                  <div
                    className="px-3 py-1.5 flex items-center gap-1.5"
                    onClick={(e) => e.preventDefault()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateStatus();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setShowNewStatusInput(false);
                        setNewStatusName('');
                      }
                    }}
                  >
                    <input
                      ref={newStatusInputRef}
                      type="text"
                      value={newStatusName}
                      onChange={(e) => setNewStatusName(e.target.value)}
                      placeholder="Status name..."
                      className={cn(
                        'flex-1 h-7 px-2 text-sm rounded-md',
                        'bg-muted/50 border border-border',
                        'focus:outline-none focus:ring-1 focus:ring-primary',
                        'placeholder:text-muted-foreground/50'
                      )}
                      autoFocus
                    />
                    <button
                      type="button"
                      className={cn(
                        'flex items-center justify-center shrink-0',
                        'h-7 w-7 rounded-md',
                        'bg-primary text-primary-foreground',
                        'hover:bg-primary/90 transition-colors duration-150',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        handleCreateStatus();
                      }}
                      disabled={!newStatusName.trim()}
                      title="Create status"
                      aria-label="Create status"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowNewStatusInput(true);
                      requestAnimationFrame(() => newStatusInputRef.current?.focus());
                    }}
                    className="flex items-center gap-2 cursor-pointer px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors w-full text-left"
                    data-testid="board-filter-dropdown-create-status"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-sm">New Status</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Pending changes hint - full width at bottom */}
        {hasPendingChanges && (
          <div className="border-t border-border px-2 py-1.5 text-[10px] text-muted-foreground text-center select-none">
            Close to apply changes
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

/** Reusable project item row */
function ProjectItem({
  id,
  label,
  icon,
  isStaged,
  diffState,
  onToggle,
  testId,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  isStaged: boolean;
  diffState: DiffState;
  onToggle: (id: string) => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onToggle(id);
      }}
      className={cn(
        'flex items-center gap-2 cursor-pointer min-h-[2.25rem] w-full px-3 py-1.5',
        'text-left transition-colors duration-100',
        'hover:bg-accent/50',
        isStaged && 'bg-accent',
        diffState === 'added' && 'bg-emerald-500/5',
        diffState === 'removed' && 'bg-red-500/5'
      )}
      data-testid={testId}
      role="option"
      aria-selected={isStaged}
    >
      <CheckboxIndicator checked={isStaged} diffState={diffState} />
      {icon}
      <span
        className={cn(
          'flex-1 text-sm truncate',
          diffState === 'removed' && 'text-muted-foreground line-through'
        )}
      >
        {label}
      </span>
      <DiffBadge diffState={diffState} />
    </button>
  );
}

export { ALL_PROJECTS_ID };
export type { StatusTabId, StatusTab };
