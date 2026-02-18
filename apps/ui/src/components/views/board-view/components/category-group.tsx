import { memo, useCallback } from 'react';
import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Feature } from '@/store/app-store';
import type { ReactNode } from 'react';

/** Label used for features with no category */
export const UNCATEGORIZED_LABEL = 'Uncategorized';

/** Label used for features with no project name */
const UNKNOWN_PROJECT_LABEL = 'Unknown Project';

/**
 * Group features by their `category` field.
 * Returns an array of { category, features } sorted alphabetically,
 * with uncategorized items appearing last.
 */
export function groupFeaturesByCategory(
  features: Feature[]
): Array<{ category: string; features: Feature[] }> {
  if (features.length === 0) return [];

  const categoryMap = new Map<string, Feature[]>();

  for (const feature of features) {
    const category = feature.category?.trim() || UNCATEGORIZED_LABEL;
    const list = categoryMap.get(category);
    if (list) {
      list.push(feature);
    } else {
      categoryMap.set(category, [feature]);
    }
  }

  // If there's only one category (or zero), skip grouping - no sub-headers needed
  if (categoryMap.size <= 1) {
    return [];
  }

  // Sort: alphabetical, with Uncategorized last
  return Array.from(categoryMap.entries())
    .sort(([a], [b]) => {
      if (a === UNCATEGORIZED_LABEL) return 1;
      if (b === UNCATEGORIZED_LABEL) return -1;
      return a.localeCompare(b);
    })
    .map(([category, features]) => ({ category, features }));
}

/**
 * Group features by their `projectName` field.
 * Returns an array of { projectName, projectPath, features } sorted alphabetically.
 * Unlike category grouping, project grouping is always applied when there are
 * multiple projects (no single-group suppression).
 */
export function groupFeaturesByProject(
  features: Feature[]
): Array<{ projectName: string; projectPath: string; features: Feature[] }> {
  if (features.length === 0) return [];

  const projectMap = new Map<string, { projectPath: string; features: Feature[] }>();

  for (const feature of features) {
    const projectName = (feature as any).projectName?.trim() || UNKNOWN_PROJECT_LABEL;
    const projectPath = (feature as any).projectPath || '';
    const existing = projectMap.get(projectName);
    if (existing) {
      existing.features.push(feature);
    } else {
      projectMap.set(projectName, { projectPath, features: [feature] });
    }
  }

  // If there's only one project, skip grouping - no sub-headers needed
  if (projectMap.size <= 1) {
    return [];
  }

  // Sort alphabetically, with Unknown Project last
  return Array.from(projectMap.entries())
    .sort(([a], [b]) => {
      if (a === UNKNOWN_PROJECT_LABEL) return 1;
      if (b === UNKNOWN_PROJECT_LABEL) return -1;
      return a.localeCompare(b);
    })
    .map(([projectName, { projectPath, features }]) => ({ projectName, projectPath, features }));
}

interface ProjectGroupHeaderProps {
  projectName: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * Collapsible project header displayed within a Kanban column or list view.
 * Uses a folder icon to distinguish from category headers.
 */
export const ProjectGroupHeader = memo(function ProjectGroupHeader({
  projectName,
  count,
  isExpanded,
  onToggle,
}: ProjectGroupHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center gap-1.5 w-full px-2 py-1.5 text-left rounded-md',
        'bg-accent/30 hover:bg-accent/50 transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        'group/project'
      )}
      aria-expanded={isExpanded}
      data-testid={`project-group-header-${projectName}`}
    >
      <span className="text-muted-foreground shrink-0">
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
      </span>
      <FolderOpen className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
      <span className="text-xs font-semibold text-foreground/80 truncate flex-1">
        {projectName}
      </span>
      <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">{count}</span>
    </button>
  );
});

interface ProjectGroupProps {
  projectName: string;
  isExpanded: boolean;
  onToggle: (projectName: string) => void;
  children: ReactNode;
  featureCount: number;
}

/**
 * Wraps a group of cards/rows with a collapsible project header.
 */
export const ProjectGroup = memo(function ProjectGroup({
  projectName,
  isExpanded,
  onToggle,
  children,
  featureCount,
}: ProjectGroupProps) {
  const handleToggle = useCallback(() => {
    onToggle(projectName);
  }, [onToggle, projectName]);

  return (
    <div data-testid={`project-group-${projectName}`}>
      <ProjectGroupHeader
        projectName={projectName}
        count={featureCount}
        isExpanded={isExpanded}
        onToggle={handleToggle}
      />
      {isExpanded && <div className="space-y-2 pl-1">{children}</div>}
    </div>
  );
});

interface CategoryGroupHeaderProps {
  category: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * Collapsible category header displayed within a Kanban column.
 * Compact design that fits naturally between cards.
 */
export const CategoryGroupHeader = memo(function CategoryGroupHeader({
  category,
  count,
  isExpanded,
  onToggle,
}: CategoryGroupHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center gap-1.5 w-full px-2 py-1 text-left rounded-md',
        'hover:bg-accent/50 transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        'group/category'
      )}
      aria-expanded={isExpanded}
      data-testid={`category-group-header-${category}`}
    >
      <span className="text-muted-foreground shrink-0">
        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </span>
      <span className="text-[11px] font-medium text-muted-foreground/80 truncate flex-1">
        {category}
      </span>
      <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">{count}</span>
    </button>
  );
});

interface CategoryGroupProps {
  category: string;
  isExpanded: boolean;
  onToggle: (category: string) => void;
  children: ReactNode;
  featureCount: number;
}

/**
 * Wraps a group of KanbanCards with a collapsible category header.
 */
export const CategoryGroup = memo(function CategoryGroup({
  category,
  isExpanded,
  onToggle,
  children,
  featureCount,
}: CategoryGroupProps) {
  const handleToggle = useCallback(() => {
    onToggle(category);
  }, [onToggle, category]);

  return (
    <div data-testid={`category-group-${category}`}>
      <CategoryGroupHeader
        category={category}
        count={featureCount}
        isExpanded={isExpanded}
        onToggle={handleToggle}
      />
      {isExpanded && <div className="space-y-2">{children}</div>}
    </div>
  );
});
