import { useCallback, useMemo, useState } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import { Folder, FolderOpen, FolderPlus, Pencil, Pin, PinOff, Ungroup } from 'lucide-react';
import type { Feature } from '@/store/app-store';
import type { WorktreeSyncStatus } from '@/lib/http-api-client';
import { useWorkbenchStore, type PinGroup } from '@/store/workbench-store';
import { Button } from '@/components/ui/button';
import { ContextMenu, useContextMenu } from '@/components/ui/context-menu';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { SidebarSection } from './sidebar-section';
import { SidebarFeatureRow } from './sidebar-feature-row';
import { SidebarGroupHeader } from './sidebar-group-header';
import { setFeaturePinned } from './pin-actions';

/** MIME type carrying the dragged feature id between pinned rows. */
const PIN_DRAG_TYPE = 'application/x-dmaker-pin';

/** Where a drop would land. */
type DropTarget =
  | { kind: 'feature'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'root' }
  | null;

interface PinnedSectionProps {
  /** Pinned features, already in display order */
  features: Feature[];
  activeFeatureId: string | null;
  selectedFeatureIds: string[];
  runningFeatureIds: Set<string>;
  syncStatusFor: (feature: Feature) => WorktreeSyncStatus | undefined;
  onOpen: (featureId: string, event: MouseEvent) => void;
  /** Right-click on a pinned row — the shared feature menu lives in the sidebar */
  onFeatureContextMenu: (featureId: string, event: MouseEvent<HTMLElement>) => void;
  /** Group currently being renamed inline, if any */
  renamingGroupId: string | null;
  setRenamingGroupId: (groupId: string | null) => void;
}

/**
 * The Pinned section: features the user has pinned, optionally folded into
 * groups.
 *
 * Groups are made by dragging one pin onto another, and are pure sidebar
 * presentation — see `PinGroup` in the workbench store.
 */
export function PinnedSection({
  features,
  activeFeatureId,
  selectedFeatureIds,
  runningFeatureIds,
  syncStatusFor,
  onOpen,
  onFeatureContextMenu,
  renamingGroupId,
  setRenamingGroupId,
}: PinnedSectionProps) {
  const pinGroups = useWorkbenchStore((state) => state.pinGroups);
  const createPinGroup = useWorkbenchStore((state) => state.createPinGroup);
  const renamePinGroup = useWorkbenchStore((state) => state.renamePinGroup);
  const deletePinGroup = useWorkbenchStore((state) => state.deletePinGroup);
  const togglePinGroupCollapsed = useWorkbenchStore((state) => state.togglePinGroupCollapsed);
  const movePinnedFeature = useWorkbenchStore((state) => state.movePinnedFeature);
  const groupPinnedFeatures = useWorkbenchStore((state) => state.groupPinnedFeatures);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);

  const groupMenu = useContextMenu<PinGroup>();
  const sectionMenu = useContextMenu<'section'>();

  const featuresById = useMemo(
    () => new Map(features.map((feature) => [feature.id, feature])),
    [features]
  );

  /** Which group each pinned feature sits in — pins in no group are absent. */
  const groupIdByFeature = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of pinGroups) {
      for (const featureId of group.featureIds) {
        if (featuresById.has(featureId)) map.set(featureId, group.id);
      }
    }
    return map;
  }, [pinGroups, featuresById]);

  /**
   * Groups paired with their visible members. Empty groups still render — a
   * freshly made one has to stay on screen until something is dropped in.
   */
  const renderedGroups = useMemo(
    () =>
      pinGroups.map((group) => ({
        group,
        members: group.featureIds
          .map((featureId) => featuresById.get(featureId))
          .filter((feature): feature is Feature => feature !== undefined),
      })),
    [pinGroups, featuresById]
  );

  const ungrouped = useMemo(
    () => features.filter((feature) => !groupIdByFeature.has(feature.id)),
    [features, groupIdByFeature]
  );

  // --- Drag and drop ----------------------------------------------------

  const readDraggedId = useCallback(
    (event: DragEvent<HTMLElement>): string | null =>
      draggingId ?? event.dataTransfer.getData(PIN_DRAG_TYPE) ?? null,
    [draggingId]
  );

  const handleDragStart = useCallback((featureId: string, event: DragEvent<HTMLElement>) => {
    event.dataTransfer.setData(PIN_DRAG_TYPE, featureId);
    event.dataTransfer.setData('text/plain', featureId);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingId(featureId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTarget(null);
  }, []);

  /** Accept the drop and mark this element as the landing spot. */
  const allowDrop = useCallback((event: DragEvent<HTMLElement>, target: DropTarget) => {
    if (!event.dataTransfer.types.includes(PIN_DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(target);
  }, []);

  /** Dropping a pin on another pin folds the pair into a new group. */
  const handleDropOnFeature = useCallback(
    (targetId: string, event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const draggedId = readDraggedId(event);
      handleDragEnd();
      if (!draggedId || draggedId === targetId) return;

      const targetGroupId = groupIdByFeature.get(targetId);
      if (targetGroupId) {
        // The target already lives in a group — join it, landing just above.
        movePinnedFeature(draggedId, targetGroupId, targetId);
        return;
      }

      setRenamingGroupId(groupPinnedFeatures([targetId, draggedId]));
    },
    [
      readDraggedId,
      handleDragEnd,
      groupIdByFeature,
      movePinnedFeature,
      groupPinnedFeatures,
      setRenamingGroupId,
    ]
  );

  const handleDropOnGroup = useCallback(
    (groupId: string, event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const draggedId = readDraggedId(event);
      handleDragEnd();
      if (draggedId) movePinnedFeature(draggedId, groupId);
    },
    [readDraggedId, handleDragEnd, movePinnedFeature]
  );

  /** Dropping on the section background lifts a pin back out of its group. */
  const handleDropOnRoot = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const draggedId = readDraggedId(event);
      handleDragEnd();
      if (draggedId) movePinnedFeature(draggedId, null);
    },
    [readDraggedId, handleDragEnd, movePinnedFeature]
  );

  // --- Rendering --------------------------------------------------------

  const renderRow = useCallback(
    (feature: Feature, indented: boolean) => (
      <SidebarFeatureRow
        key={feature.id}
        feature={feature}
        isActive={activeFeatureId === feature.id}
        isSelected={selectedFeatureIds.includes(feature.id)}
        syncStatus={syncStatusFor(feature)}
        isRunning={runningFeatureIds.has(feature.id)}
        onOpen={onOpen}
        onContextMenu={onFeatureContextMenu}
        indented={indented}
        draggable
        isDragging={draggingId === feature.id}
        isDropTarget={dropTarget?.kind === 'feature' && dropTarget.id === feature.id}
        onDragStart={(event) => handleDragStart(feature.id, event)}
        onDragEnd={handleDragEnd}
        onDragOver={(event) => {
          if (draggingId === feature.id) return;
          allowDrop(event, { kind: 'feature', id: feature.id });
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(event) => handleDropOnFeature(feature.id, event)}
      />
    ),
    [
      activeFeatureId,
      selectedFeatureIds,
      syncStatusFor,
      runningFeatureIds,
      onOpen,
      onFeatureContextMenu,
      draggingId,
      dropTarget,
      handleDragStart,
      handleDragEnd,
      allowDrop,
      handleDropOnFeature,
    ]
  );

  return (
    <>
      <SidebarSection
        id="pinned"
        label="Pinned"
        icon={Pin}
        iconClassName="text-amber-400"
        count={features.length}
        emptyMessage="Nothing pinned yet. Right-click a feature to pin it."
        // An empty group still has to render, or a group made from the header
        // button would be invisible the moment there is nothing pinned yet.
        isEmpty={features.length === 0 && renderedGroups.length === 0}
        onContextMenu={(event) => sectionMenu.openAt(event, 'section')}
        isDropTarget={dropTarget?.kind === 'root'}
        onDragOver={(event) => allowDrop(event, { kind: 'root' })}
        onDragLeave={() => setDropTarget(null)}
        onDrop={handleDropOnRoot}
        action={
          <Button
            variant="ghost"
            size="sm"
            className="size-5 p-0"
            onClick={() => setRenamingGroupId(createPinGroup())}
            title="New pin group"
            data-testid="sidebar-new-pin-group"
          >
            <FolderPlus className="size-3" />
          </Button>
        }
      >
        {renderedGroups.map(({ group, members }) => (
          <div key={group.id} className="flex flex-col gap-px">
            <SidebarGroupHeader
              groupId={group.id}
              name={group.name}
              collapsed={group.collapsed}
              memberCount={members.length}
              isRenaming={renamingGroupId === group.id}
              isDropTarget={dropTarget?.kind === 'group' && dropTarget.id === group.id}
              testId="sidebar-pin-group"
              onCommitRename={(name) => {
                renamePinGroup(group.id, name);
                setRenamingGroupId(null);
              }}
              onCancelRename={() => setRenamingGroupId(null)}
              onToggle={() => togglePinGroupCollapsed(group.id)}
              onContextMenu={(event) => groupMenu.openAt(event, group)}
              onDragOver={(event) => allowDrop(event, { kind: 'group', id: group.id })}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(event) => handleDropOnGroup(group.id, event)}
            />

            {!group.collapsed &&
              (members.length > 0 ? (
                members.map((feature) => renderRow(feature, true))
              ) : (
                <p className="px-3 py-1 pl-7 text-[11px] text-muted-foreground/70">
                  Drag pins here.
                </p>
              ))}
          </div>
        ))}

        {ungrouped.map((feature) => renderRow(feature, false))}
      </SidebarSection>

      {/* Right-click on a group header */}
      <ContextMenu controller={groupMenu}>
        {groupMenu.target && (
          <>
            <DropdownMenuLabel className="truncate text-[11px] text-muted-foreground">
              {groupMenu.target.name}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => setRenamingGroupId(groupMenu.target?.id ?? null)}
            >
              <Pencil className="size-3.5" />
              Rename group
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => {
                const group = groupMenu.target;
                if (group) togglePinGroupCollapsed(group.id);
              }}
            >
              {groupMenu.target.collapsed ? (
                <FolderOpen className="size-3.5" />
              ) : (
                <Folder className="size-3.5" />
              )}
              {groupMenu.target.collapsed ? 'Expand group' : 'Collapse group'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => {
                const group = groupMenu.target;
                if (group) deletePinGroup(group.id);
              }}
            >
              <Ungroup className="size-3.5" />
              Ungroup (keep pins)
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-destructive focus:text-destructive"
              onSelect={() => {
                const group = groupMenu.target;
                if (!group) return;
                for (const featureId of group.featureIds) {
                  const feature = featuresById.get(featureId);
                  if (feature) void setFeaturePinned(feature, false);
                }
                deletePinGroup(group.id);
              }}
            >
              <PinOff className="size-3.5" />
              Unpin all in group
            </DropdownMenuItem>
          </>
        )}
      </ContextMenu>

      {/* Right-click on empty space in the Pinned section */}
      <ContextMenu controller={sectionMenu}>
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">Pinned</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2" onSelect={() => setRenamingGroupId(createPinGroup())}>
          <FolderPlus className="size-3.5" />
          New group
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          disabled={features.length === 0}
          onSelect={() => {
            for (const feature of features) void setFeaturePinned(feature, false);
          }}
        >
          <PinOff className="size-3.5" />
          Unpin all
        </DropdownMenuItem>
      </ContextMenu>
    </>
  );
}
