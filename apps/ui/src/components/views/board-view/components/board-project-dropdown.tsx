import { memo, useState, useCallback, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, Minus, Plus, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getProjectIcon } from '@/lib/icon-registry';
import type { Project } from '@/lib/electron';

/** Special value representing "All Projects" selection */
const ALL_PROJECTS_ID = '__all_projects__';

export interface BoardProjectDropdownProps {
  /** List of available projects */
  projects: Project[];
  /** Currently selected project IDs (multi-select). Use [ALL_PROJECTS_ID] for "all". */
  selectedProjectIds: string[];
  /** Callback when selection changes (committed on dropdown close) */
  onSelectionChange: (projectIds: string[]) => void;
  /** Callback to create a new project */
  onCreateProject?: () => void;
  /** Additional CSS classes for the trigger button */
  className?: string;
  /** Alignment of the dropdown content relative to the trigger */
  align?: 'start' | 'center' | 'end';
  /** Label displayed at the top of the dropdown */
  dropdownLabel?: string;
}

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

/**
 * BoardProjectDropdown - Multi-select dropdown for filtering board by project.
 *
 * Follows the same staged-selection pattern as BoardStatusDropdown:
 * - On open: copies current selection into local staged state
 * - On item click: toggles in staged state (with "All" deselection logic)
 * - On close: commits staged state to parent via onSelectionChange
 *
 * "All Projects" behaves like "All" in the status dropdown:
 * - Selecting "All" clears individual selections
 * - Selecting an individual project removes "All"
 * - Deselecting the last project falls back to "All"
 */
export const BoardProjectDropdown = memo(function BoardProjectDropdown({
  projects,
  selectedProjectIds,
  onSelectionChange,
  onCreateProject,
  className,
  align = 'start',
  dropdownLabel = 'Switch Project',
}: BoardProjectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [stagedIds, setStagedIds] = useState<string[]>(selectedProjectIds);
  const stagedRef = useRef<string[]>(selectedProjectIds);

  // Resolve display info for the trigger
  const primaryId = selectedProjectIds[0];
  const primaryProject = useMemo(
    () => projects.find((p) => p.id === primaryId),
    [projects, primaryId]
  );

  const triggerLabel = useMemo(() => {
    if (selectedProjectIds.length === 0) return 'Project';
    if (selectedProjectIds.includes(ALL_PROJECTS_ID)) return 'All Projects';
    if (selectedProjectIds.length === 1) {
      return primaryProject?.name ?? 'Project';
    }
    const firstName = primaryProject?.name ?? 'Project';
    return `${firstName} +${selectedProjectIds.length - 1}`;
  }, [selectedProjectIds, primaryProject]);

  const TriggerIcon = useMemo(() => {
    if (selectedProjectIds.includes(ALL_PROJECTS_ID) || selectedProjectIds.length !== 1) {
      return Layers;
    }
    return primaryProject ? getProjectIcon(primaryProject.icon) : Layers;
  }, [selectedProjectIds, primaryProject]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setStagedIds(selectedProjectIds);
        stagedRef.current = selectedProjectIds;
      } else {
        const staged = stagedRef.current;
        const changed =
          staged.length !== selectedProjectIds.length ||
          staged.some((id) => !selectedProjectIds.includes(id));
        if (changed) {
          onSelectionChange(staged);
        }
      }
      setOpen(nextOpen);
    },
    [selectedProjectIds, onSelectionChange]
  );

  const handleToggle = useCallback((itemId: string) => {
    setStagedIds((current) => {
      let next: string[];

      if (itemId === ALL_PROJECTS_ID) {
        // Selecting "All" always results in only ["all"]
        next = [ALL_PROJECTS_ID];
      } else {
        const isCurrentlyActive = current.includes(itemId);

        if (isCurrentlyActive) {
          const remaining = current.filter((id) => id !== itemId);
          // If nothing remains, fall back to "All"
          next = remaining.length === 0 ? [ALL_PROJECTS_ID] : remaining;
        } else {
          // Selecting a project removes "All"
          const withoutAll = current.filter((id) => id !== ALL_PROJECTS_ID);
          next = [...withoutAll, itemId];
        }
      }

      stagedRef.current = next;
      return next;
    });
  }, []);

  const hasPendingChanges = useMemo(() => {
    if (stagedIds.length !== selectedProjectIds.length) return true;
    return stagedIds.some((id) => !selectedProjectIds.includes(id));
  }, [stagedIds, selectedProjectIds]);

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
          data-testid="board-project-dropdown-trigger"
        >
          <TriggerIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="max-w-[120px] truncate">{triggerLabel}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        className="w-56 max-w-[calc(100vw-2rem)] max-h-[min(24rem,70vh)] overflow-y-auto"
        data-testid="board-project-dropdown-content"
      >
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {dropdownLabel}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Individual project options */}
        {projects.map((project) => {
          const isStaged = stagedIds.includes(project.id);
          const diffState = getItemDiffState(project.id, selectedProjectIds, stagedIds);
          const ProjectIcon = getProjectIcon(project.icon);

          return (
            <DropdownMenuItem
              key={project.id}
              onClick={(e) => {
                e.preventDefault();
                handleToggle(project.id);
              }}
              className={cn(
                'flex items-center gap-2 cursor-pointer min-h-[2.25rem]',
                isStaged && 'bg-accent',
                diffState === 'added' && 'bg-emerald-500/5',
                diffState === 'removed' && 'bg-red-500/5'
              )}
              data-testid={`board-project-dropdown-option-${project.id}`}
              role="option"
              aria-selected={isStaged}
            >
              <CheckboxIndicator checked={isStaged} diffState={diffState} />
              <ProjectIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span
                className={cn(
                  'flex-1 text-sm truncate',
                  diffState === 'removed' && 'text-muted-foreground line-through'
                )}
              >
                {project.name}
              </span>
              <DiffBadge diffState={diffState} />
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        {/* "All Projects" option */}
        {(() => {
          const isStaged = stagedIds.includes(ALL_PROJECTS_ID);
          const diffState = getItemDiffState(ALL_PROJECTS_ID, selectedProjectIds, stagedIds);

          return (
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                handleToggle(ALL_PROJECTS_ID);
              }}
              className={cn(
                'flex items-center gap-2 cursor-pointer min-h-[2.25rem]',
                isStaged && 'bg-accent',
                diffState === 'added' && 'bg-emerald-500/5',
                diffState === 'removed' && 'bg-red-500/5'
              )}
              data-testid="board-project-dropdown-option-all"
              role="option"
              aria-selected={isStaged}
            >
              <CheckboxIndicator checked={isStaged} diffState={diffState} />
              <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span
                className={cn(
                  'flex-1 text-sm truncate',
                  diffState === 'removed' && 'text-muted-foreground line-through'
                )}
              >
                All Projects
              </span>
              <DiffBadge diffState={diffState} />
            </DropdownMenuItem>
          );
        })()}

        {/* New Project button */}
        {onCreateProject && (
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              onCreateProject();
            }}
            className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground"
            data-testid="board-project-dropdown-create-project"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">New Project</span>
          </DropdownMenuItem>
        )}

        {/* Pending changes hint */}
        {hasPendingChanges && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-[10px] text-muted-foreground text-center select-none">
              Close to apply changes
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

export { ALL_PROJECTS_ID };
