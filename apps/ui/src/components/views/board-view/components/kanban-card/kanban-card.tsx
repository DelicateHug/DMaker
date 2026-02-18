// @ts-nocheck
import React, { memo, useLayoutEffect, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react';
import { Feature, useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import { CardBadges, PriorityBadges, BranchBadge } from './card-badges';
import { CardHeaderSection } from './card-header';
import { CardContentSections } from './card-content-sections';
import { AgentInfoPanel } from './agent-info-panel';
import { CardActions } from './card-actions';

function getCardBorderStyle(enabled: boolean, opacity: number): React.CSSProperties {
  if (!enabled) {
    return { borderWidth: '0px', borderColor: 'transparent' };
  }
  if (opacity !== 100) {
    return {
      borderWidth: '1px',
      borderColor: `color-mix(in oklch, var(--border) ${opacity}%, transparent)`,
    };
  }
  return {};
}

function getCursorClass(
  isOverlay: boolean | undefined,
  isDraggable: boolean,
  isSelectionMode: boolean
): string {
  if (isSelectionMode) return 'cursor-pointer';
  if (isOverlay) return 'cursor-grabbing';
  if (isDraggable) return 'cursor-grab active:cursor-grabbing';
  return 'cursor-default';
}

interface KanbanCardProps {
  feature: Feature;
  onEdit: () => void;
  onDelete: () => void;
  onViewOutput?: () => void;
  onVerify?: () => void;
  onResume?: () => void;
  onForceStop?: () => void;
  onManualVerify?: () => void;
  onMoveBackToInProgress?: () => void;
  onMoveBackToBacklog?: () => void;
  onFollowUp?: () => void;
  onImplement?: () => void;
  onViewPlan?: () => void;
  onApprovePlan?: () => void;
  onSpawnTask?: () => void;
  onToggleFavorite?: () => void;
  hasContext?: boolean;
  isCurrentAutoTask?: boolean;
  shortcutKey?: string;
  contextContent?: string;
  summary?: string;
  opacity?: number;
  glassmorphism?: boolean;
  cardBorderEnabled?: boolean;
  cardBorderOpacity?: number;
  isOverlay?: boolean;
  // Selection mode props
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  selectionTarget?: 'backlog' | 'waiting_approval' | null;
  // All-projects mode props
  showAllProjects?: boolean;
  projectDefaultBranch?: string;
  /** Whether full feature data has been loaded (Phase 2 complete).
   *  When false, description and agent info sections show skeleton placeholders. */
  isFullyLoaded?: boolean;
}

export const KanbanCard = memo(function KanbanCard({
  feature,
  onEdit,
  onDelete,
  onViewOutput,
  onVerify,
  onResume,
  onForceStop,
  onManualVerify,
  onMoveBackToInProgress: _onMoveBackToInProgress,
  onMoveBackToBacklog,
  onFollowUp,
  onImplement,
  onViewPlan,
  onApprovePlan,
  onSpawnTask,
  onToggleFavorite,
  hasContext,
  isCurrentAutoTask,
  shortcutKey,
  contextContent,
  summary,
  opacity = 100,
  glassmorphism = true,
  cardBorderEnabled = true,
  cardBorderOpacity = 100,
  isOverlay,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
  selectionTarget = null,
  showAllProjects = false,
  projectDefaultBranch,
  isFullyLoaded = true,
}: KanbanCardProps) {
  const { useWorktrees } = useAppStore(
    useShallow((state) => ({
      useWorktrees: state.useWorktrees,
    }))
  );
  const [isLifted, setIsLifted] = useState(false);

  useLayoutEffect(() => {
    if (isOverlay) {
      requestAnimationFrame(() => {
        setIsLifted(true);
      });
    }
  }, [isOverlay]);

  const isDraggable =
    !isSelectionMode &&
    (feature.status === 'backlog' ||
      feature.status === 'started' ||
      feature.status === 'waiting_approval' ||
      (feature.status === 'in_progress' && !isCurrentAutoTask));
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: feature.id,
    disabled: !isDraggable || isOverlay || isSelectionMode,
  });

  const dndStyle = {
    opacity: isDragging ? 0.5 : undefined,
  };

  const cardStyle = getCardBorderStyle(cardBorderEnabled, cardBorderOpacity);

  // Only allow selection for features matching the selection target
  const isSelectable = isSelectionMode && feature.status === selectionTarget;

  const wrapperClasses = cn(
    'relative select-none outline-none touch-none transition-transform duration-200 ease-out',
    getCursorClass(isOverlay, isDraggable, isSelectable),
    isOverlay && isLifted && 'scale-105 rotate-1 z-50'
  );

  const isInteractive = !isDragging && !isOverlay;
  const hasError = feature.error && !isCurrentAutoTask;

  const innerCardClasses = cn(
    'kanban-card-content h-full relative shadow-sm',
    'transition-all duration-200 ease-out',
    isInteractive && 'hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/10 bg-transparent',
    !glassmorphism && 'backdrop-blur-[0px]!',
    !isCurrentAutoTask &&
      cardBorderEnabled &&
      (cardBorderOpacity === 100 ? 'border-border/50' : 'border'),
    hasError && 'border-[var(--status-error)] border-2 shadow-[var(--status-error-bg)] shadow-lg',
    isSelected && isSelectable && 'ring-2 ring-brand-500 ring-offset-1 ring-offset-background'
  );

  const handleCardClick = (e: React.MouseEvent) => {
    if (isSelectable && onToggleSelect) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect();
    }
  };

  const renderCardContent = () => (
    <Card
      style={isCurrentAutoTask ? undefined : cardStyle}
      className={innerCardClasses}
      onDoubleClick={isSelectionMode ? undefined : onEdit}
      onClick={handleCardClick}
    >
      {/* Background overlay with opacity */}
      {(!isDragging || isOverlay) && (
        <div
          className={cn(
            'absolute inset-0 rounded-xl bg-card -z-10',
            glassmorphism && 'backdrop-blur-sm'
          )}
          style={{ opacity: opacity / 100 }}
        />
      )}

      {/* Status Badges Row */}
      <CardBadges feature={feature} />

      {/* Category row with selection checkbox and favorite toggle */}
      <div className="px-2.5 pt-2 flex items-center gap-1.5">
        {isSelectable && !isOverlay && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect?.()}
            className="h-4 w-4 border-2 data-[state=checked]:bg-brand-500 data-[state=checked]:border-brand-500 shrink-0"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <span className="text-[11px] text-muted-foreground/70 font-medium flex-1">
          {feature.category}
        </span>
        {/* Branch badge for all-projects mode */}
        <BranchBadge
          feature={feature}
          showAllProjects={showAllProjects}
          projectDefaultBranch={projectDefaultBranch}
        />
        {/* Favorite toggle button */}
        {onToggleFavorite && !isOverlay && !isSelectionMode && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-5 w-5 p-0 hover:bg-transparent',
              feature.isFavorite
                ? 'text-yellow-500 hover:text-yellow-600'
                : 'text-muted-foreground/40 hover:text-yellow-500'
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            data-testid={`favorite-toggle-${feature.id}`}
            title={feature.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star className={cn('w-3.5 h-3.5', feature.isFavorite && 'fill-current')} />
          </Button>
        )}
      </div>

      {/* Priority and Manual Verification badges */}
      <PriorityBadges feature={feature} />

      {/* Card Header */}
      <CardHeaderSection
        feature={feature}
        isDraggable={isDraggable}
        isCurrentAutoTask={!!isCurrentAutoTask}
        isSelectionMode={isSelectionMode}
        isFullyLoaded={isFullyLoaded}
        onEdit={onEdit}
        onDelete={onDelete}
        onViewOutput={onViewOutput}
        onSpawnTask={onSpawnTask}
        onMoveBackToBacklog={onMoveBackToBacklog}
      />

      <CardContent className="px-2.5 pt-0 pb-1.5">
        {/* Content Sections */}
        <CardContentSections feature={feature} useWorktrees={useWorktrees} />

        {/* Agent Info Panel */}
        <AgentInfoPanel
          feature={feature}
          contextContent={contextContent}
          summary={summary}
          isCurrentAutoTask={isCurrentAutoTask}
          showAllProjects={showAllProjects}
          isFullyLoaded={isFullyLoaded}
        />

        {/* Actions */}
        <CardActions
          feature={feature}
          isCurrentAutoTask={!!isCurrentAutoTask}
          hasContext={hasContext}
          shortcutKey={shortcutKey}
          isSelectionMode={isSelectionMode}
          onEdit={onEdit}
          onViewOutput={onViewOutput}
          onVerify={onVerify}
          onResume={onResume}
          onForceStop={onForceStop}
          onManualVerify={onManualVerify}
          onFollowUp={onFollowUp}
          onImplement={onImplement}
          onViewPlan={onViewPlan}
          onApprovePlan={onApprovePlan}
        />
      </CardContent>
    </Card>
  );

  return (
    <div
      ref={setNodeRef}
      style={dndStyle}
      {...attributes}
      {...(isDraggable ? listeners : {})}
      className={wrapperClasses}
      data-testid={`kanban-card-${feature.id}`}
    >
      {isCurrentAutoTask ? (
        <div className="animated-border-wrapper">{renderCardContent()}</div>
      ) : (
        renderCardContent()
      )}
    </div>
  );
});
