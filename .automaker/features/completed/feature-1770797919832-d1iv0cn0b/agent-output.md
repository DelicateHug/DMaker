I need to analyze the codebase to understand the current board view implementation before generating the specification. Let me explore the relevant files silently first.

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\.dmaker\\features\\feature-1770797919832-d1iv0cn0b\\images\\pasted-image-2026-02-11T08-17-57-423Z-1770797877467.png"
}

🔧 Tool: Task
Input: {
"description": "Explore board view status filtering",
"subagent_type": "Explore",
"prompt": "I need to understand the board view's status filtering/tab system thoroughly. Please explore:\n\n1. The board view list view implementation - especially how statuses are displayed and filtered\n2. Any existing status tab/selector components (look for \"board-status-tabs\", \"board-status-dropdown\", \"status\" in board-view files)\n3. The hooks that manage board state, particularly filtering by status\n4. The constants file for board view (status definitions, column definitions)\n5. The board header and how it currently works\n6. Any existing store for board controls (board-controls-store)\n7. The use-board-column-features hook\n8. The use-board-features hook\n9. The list view components (list-view.tsx, list-header.tsx)\n10. The kanban board component\n\nFocus on understanding:\n- How features are currently grouped/filtered by status\n- Whether there's already a status selector/tab system\n- How the list view vs kanban view works\n- What statuses exist and how they're defined\n\nBe very thorough - read ALL relevant files completely."
}

🔧 Tool: Glob
Input: {
"pattern": "**/board-view/**/\*.{ts,tsx}",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view"
}

🔧 Tool: Glob
Input: {
"pattern": "\*_/board-_.tsx",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views"
}

🔧 Tool: Glob
Input: {
"pattern": "\*\*/board-controls-store.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\constants.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\board-controls-store.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\board-status-tabs.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\board-status-dropdown.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\hooks\\use-board-status-tabs.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\hooks\\use-board-features.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\hooks\\use-board-column-features.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\list-view\\list-view.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx",
"limit": 100
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\board-header.tsx",
"limit": 150
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\kanban-board.tsx",
"limit": 100
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx",
"offset": 100,
"limit": 300
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\list-view\\list-header.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx",
"offset": 400,
"limit": 200
}

🔧 Tool: Grep
Input: {
"pattern": "useBoardStatusTabs|setActiveStatusTab|activeStatusTab|BoardStatusTabs|BoardStatusDropdown",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx",
"output_mode": "content"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\index.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\hooks\\index.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\list-view\\status-badge.tsx"
}
Now let me read the key implementation files to understand the current behavior precisely:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\hooks\\use-board-status-tabs.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\constants.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx",
"limit": 200
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\board-status-tabs.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\board-status-dropdown.tsx"
}
Now let me read the section of `board-view.tsx` that handles status tabs and the top nav bar to understand how they're connected:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx",
"offset": 200,
"limit": 200
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\board-controls-store.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx"
}
Now let me read the remaining sections of board-view.tsx to understand where the status tabs are set up:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx",
"offset": 400,
"limit": 200
}
Let me now find where the board-view pushes status tab data to the board controls store, and the list view rendering:

🔧 Tool: Grep
Input: {
"pattern": "setControls|statusTabs|statusTabCounts|activeStatusTab",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx",
"output_mode": "content",
"-n": true
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\list-view\\list-view.tsx"
}
Now let me check where the board status tabs are rendered in board-view.tsx (around lines 2280):

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx",
"offset": 1520,
"limit": 120
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx",
"offset": 1610,
"limit": 80
}
Now let me check where status tabs / the dropdown is rendered in the board view's JSX:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx",
"offset": 2260,
"limit": 180
}
Now I have a comprehensive understanding of the codebase. I can see:

1. The `BoardStatusDropdown` exists and is rendered at line 2280 but **only when `!isListView`** (Kanban mode)
2. The screenshot shows the list view which doesn't have a status dropdown
3. The `useBoardStatusTabs` hook already has smart defaulting (prefer `in_progress` then `completed`)
4. The list view currently shows ALL status groups

The user's request is: they want a status selector visible in list view mode, and by default only show one status at a time (preferring `in_progress`, then `waiting_approval`), with a "See All" option to show everything.

Here's my specification:

---

## 1. Problem Statement

When viewing the board in list view mode, there is no status selector/filter visible. The user is forced to see all statuses (Backlog, In Progress, Waiting Approval) at once, which is overwhelming when there are many features (e.g., 49 backlog + 1 in progress + 19 waiting approval). The user wants to see only one status at a time by default, with the ability to opt into viewing all statuses.

## 2. User Story

As a **project manager using the list view**, I want **to see only one status at a time by default (preferring In Progress, then Waiting Approval)**, so that **I can focus on what matters most without scrolling through dozens of irrelevant features**.

## 3. Acceptance Criteria

- **Happy Path (In Progress exists)**: GIVEN features exist with status `in_progress`, WHEN the list view loads, THEN only the `in_progress` features are shown, and the status selector displays "In Progress" as the active filter.
- **Fallback (No In Progress)**: GIVEN no features have status `in_progress` but some are `waiting_approval`, WHEN the list view loads, THEN only the `waiting_approval` features are shown.
- **See All**: GIVEN the user selects "All" from the status selector, WHEN the view updates, THEN all status groups are displayed (same as current behavior).
- **Status Switching**: GIVEN the status selector is visible, WHEN the user selects a different status (e.g., "Backlog"), THEN only features with that status are shown.
- **Consistency**: GIVEN the user switches from list view to kanban view, WHEN the kanban view loads, THEN the same active status tab is reflected.
- **Persistence**: GIVEN the user selects a status tab, WHEN they navigate away and come back, THEN the same tab is restored.

## 4. Technical Context

| Aspect             | Value                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Affected Files     | `apps/ui/src/components/views/board-view.tsx`, `apps/ui/src/components/views/board-view/components/list-view/list-view.tsx`                                                    |
| Dependencies       | Existing `BoardStatusDropdown` component, existing `useBoardStatusTabs` hook                                                                                                   |
| Constraints        | Must work with existing status tab state management and board controls store                                                                                                   |
| Patterns to Follow | The `BoardStatusDropdown` is already used in kanban mode; extend it to list view. The `useBoardColumnFeatures` hook already supports `singleColumnMode` and `activeStatusTab`. |

## 5. Non-Goals

- Changing the kanban view behavior
- Adding new status types
- Changing the smart defaulting priority (already prefers `in_progress`)
- Modifying mobile/tablet layout

## 6. Implementation Tasks

```tasks
## Phase 1: Show status dropdown in list view

- [ ] T001: Remove the `!isListView` guard on BoardStatusDropdown so it renders in both kanban and list view modes | File: apps/ui/src/components/views/board-view.tsx
- [ ] T002: Pass singleColumnMode and activeStatusTab to ListView so it filters to only the active status group when not in "All" mode | File: apps/ui/src/components/views/board-view.tsx
- [ ] T003: Update ListView to accept and respect singleColumnMode/activeStatusTab props, filtering statusGroups to only the active status when singleColumnMode is true | File: apps/ui/src/components/views/board-view/components/list-view/list-view.tsx

## Phase 2: Update smart defaulting for list view

- [ ] T004: Update the smart default priority in useBoardStatusTabs to include `waiting_approval` as a fallback after `in_progress` and before `completed` | File: apps/ui/src/components/views/board-view/hooks/use-board-status-tabs.ts
```

## 7. Success Metrics

- Status dropdown is visible in list view mode
- By default, only one status is shown at a time (In Progress > Waiting Approval > first with features)
- User can select "All" to see all statuses
- Status selection persists across view mode switches and page navigation
- No regressions in kanban view behavior

## 8. Risks & Mitigations

| Risk                                                                  | Mitigation                                                                                           |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Changing single-column mode could affect kanban view                  | Only modifying the guard condition for the dropdown; kanban already uses single-column mode properly |
| Smart default change could surprise users with existing persisted tab | Persisted tab takes priority over smart default, so only new sessions are affected                   |

[SPEC_GENERATED] Please review the comprehensive specification above. Reply with 'approved' to proceed or provide feedback for revisions.

I'll start by finding the relevant code where `BoardStatusDropdown` is rendered with the `!isListView` guard.I found the guard. Let me read the full context around the `BoardStatusDropdown` rendering to understand the complete block:Now I have the full picture. I need to:

1. Remove the `!isListView &&` guard so `BoardStatusDropdown` renders in both view modes
2. Update the comment to reflect the new behaviorLet me verify the edit looks correct:The edit is clean and correct. Let me also verify there are no other `!isListView` guards related to `BoardStatusDropdown` elsewhere in the file that might need attention:The remaining `!isListView` guards at lines 1527-1529 are for **keyboard shortcut tab navigation**, not for rendering the `BoardStatusDropdown` component. Those are separate concerns and outside the scope of this task.

## Summary — Task T001 Complete

**What was changed:**

- **File:** `apps/ui/src/components/views/board-view.tsx` (line ~2280)
- **Change:** Removed the `{!isListView && ( ... )}` conditional wrapper around the `<BoardStatusDropdown>` component, so it now renders unconditionally in both kanban and list view modes.
- **Comment updated:** Changed from `"Status dropdown - only show in Kanban view mode"` to `"Status dropdown - shown in both Kanban and List view modes"` to reflect the new behavior.

The `BoardStatusDropdown` (with its `activeTab`, `onTabChange`, `tabs`, and `tabCounts` props) is now visible in both view modes, allowing users to filter/navigate by status regardless of whether they're using kanban or list view.The remaining `!isListView` guards at lines 1527-1529 are for **keyboard shortcut tab navigation**, not for rendering the `BoardStatusDropdown` component. Those are separate concerns and outside the scope of this task.

## Summary — Task T001 Complete

**What was changed:**

- **File:** `apps/ui/src/components/views/board-view.tsx` (line ~2280)
- **Change:** Removed the `{!isListView && ( ... )}` conditional wrapper around the `<BoardStatusDropdown>` component, so it now renders unconditionally in both kanban and list view modes.
- **Comment updated:** Changed from `"Status dropdown - only show in Kanban view mode"` to `"Status dropdown - shown in both Kanban and List view modes"` to reflect the new behavior.

The `BoardStatusDropdown` (with its `activeTab`, `onTabChange`, `tabs`, and `tabCounts` props) is now visible in both view modes, allowing users to filter/navigate by status regardless of whether they're using kanban or list view.

I'll start by understanding the codebase to implement T002. Let me explore the relevant files to understand the current structure.Now I have a comprehensive understanding of the codebase. Let me read the key files to implement the changes.The exact paths from the exploration may not be correct. Let me find the actual files:Now let me find where ListView is rendered in board-view.tsx:Now let me see the full context around both ListView render locations to see what props come after the ones shown:Now let me also check the StatusTabId import path:Now I have all the information I need. Let me implement the three changes:

1. **Add the new props to `ListViewProps`** in `list-view.tsx`
2. **Update the filtering logic** in the `statusGroups` useMemo
3. **Pass the new props** at both ListView render locations in `board-view.tsx`

Let's start:Now update the component destructuring to include the new props:Now update the `statusGroups` useMemo to filter when in single-column mode, following the same pattern used in KanbanBoard:Now update both ListView render locations in `board-view.tsx` to pass the new props. First, the mobile view (around line 1933):Now the desktop view (around line 2347). Let me read the context to make a unique match:The second ListView location uses extra indentation (10 spaces vs 6 spaces for the first). Let me match this precisely:Now let me verify all changes are correct by reading the final state of both files:Now let me verify the board-view.tsx changes:All four locations now have the props. Lines 1986 and 2402 are the KanbanBoard instances (already existing), and lines 1934 and 2350 are the two ListView instances (newly added by my changes). Let me verify TypeScript compilation:Let me find the correct tsconfig:The 3 TypeScript errors are all pre-existing (in `completed-features-list-view.tsx` and `use-project-settings-loader.ts`) — none are related to my changes. My changes compile cleanly.## Summary of T002 Implementation

I successfully implemented task T002: **Pass `singleColumnMode` and `activeStatusTab` to ListView so it filters to only the active status group when not in "All" mode.**

### Changes Made

#### 1. `list-view.tsx` — ListView component (3 changes)

- **Added import** for `StatusTabId` type from `../../hooks/use-board-status-tabs`

- **Added two new optional props** to `ListViewProps` interface:
  - `singleColumnMode?: boolean` — When true, only display the status group matching `activeStatusTab`
  - `activeStatusTab?: StatusTabId` — The currently active status tab ID for single-column mode

- **Updated the `statusGroups` useMemo** to filter columns when in single-column mode, following the exact same pattern used in `KanbanBoard`:
  ```typescript
  const columns =
    singleColumnMode && activeStatusTab
      ? allColumns.filter((col) => col.id === activeStatusTab)
      : allColumns;
  ```
  Also added `singleColumnMode` and `activeStatusTab` to the dependency array.

#### 2. `board-view.tsx` — Parent component (2 changes)

- **Passed the new props** at both `<ListView>` render locations (mobile view ~line 1934 and desktop view ~line 2350):
  ```tsx
  singleColumnMode={activeStatusTab !== 'all'}
  activeStatusTab={activeStatusTab}
  ```
  This matches the exact same pattern already used for `<KanbanBoard>` in the same file.

### How It Works

When the user selects a specific status tab (e.g., "Backlog", "In Progress"), `singleColumnMode` becomes `true` and `activeStatusTab` is set to that tab ID. The ListView then filters its status groups to only show features from that specific status, instead of showing all status groups. When the user selects "All", `singleColumnMode` is `false` and all status groups are shown as before.## Summary of T002 Implementation

I successfully implemented task T002: **Pass `singleColumnMode` and `activeStatusTab` to ListView so it filters to only the active status group when not in "All" mode.**

### Changes Made

#### 1. `list-view.tsx` — ListView component (3 changes)

- **Added import** for `StatusTabId` type from `../../hooks/use-board-status-tabs`

- **Added two new optional props** to `ListViewProps` interface:
  - `singleColumnMode?: boolean` — When true, only display the status group matching `activeStatusTab`
  - `activeStatusTab?: StatusTabId` — The currently active status tab ID for single-column mode

- **Updated the `statusGroups` useMemo** to filter columns when in single-column mode, following the exact same pattern used in `KanbanBoard`:
  ```typescript
  const columns =
    singleColumnMode && activeStatusTab
      ? allColumns.filter((col) => col.id === activeStatusTab)
      : allColumns;
  ```
  Also added `singleColumnMode` and `activeStatusTab` to the dependency array.

#### 2. `board-view.tsx` — Parent component (2 changes)

- **Passed the new props** at both `<ListView>` render locations (mobile view ~line 1934 and desktop view ~line 2350):
  ```tsx
  singleColumnMode={activeStatusTab !== 'all'}
  activeStatusTab={activeStatusTab}
  ```
  This matches the exact same pattern already used for `<KanbanBoard>` in the same file.

### How It Works

When the user selects a specific status tab (e.g., "Backlog", "In Progress"), `singleColumnMode` becomes `true` and `activeStatusTab` is set to that tab ID. The ListView then filters its status groups to only show features from that specific status, instead of showing all status groups. When the user selects "All", `singleColumnMode` is `false` and all status groups are shown as before.

I'll start by understanding the existing codebase structure, particularly the ListView component and related types.The exploration reveals that the ListView component already has `singleColumnMode` and `activeStatusTab` props defined and implemented. Let me read the actual current file to verify the exact state of the implementation.The files aren't at that path. Let me find the actual project root and file locations.Now let me read the actual files:Now let me also check the KanbanBoard to see its singleColumnMode pattern and how the parent board-view passes these props, to make sure everything is consistent:Now let me check how the parent board-view passes these props to ListView to see if it's already passing `singleColumnMode` and `activeStatusTab`:Let me see the full ListView rendering sections in board-view.tsx to check if `singleColumnMode` and `activeStatusTab` are already being passed:Now I have a complete picture. Let me verify by checking the components index to ensure StatusTabId is exported:After thorough investigation, I can now provide a complete summary of the findings.

## Task T003 Summary: Already Implemented ✅

**Task T003** — "Update ListView to accept and respect `singleColumnMode`/`activeStatusTab` props, filtering `statusGroups` to only the active status when `singleColumnMode` is true" — is **already fully implemented** in the codebase.

Here's what's already in place:

### 1. Props are defined in `ListViewProps` (list-view.tsx, lines 80-84)

```typescript
// Single-column mode props
/** When true, only display the status group matching activeStatusTab */
singleColumnMode?: boolean;
/** The currently active status tab ID for single-column mode */
activeStatusTab?: StatusTabId;
```

### 2. Props are destructured in the component (lines 207-208)

```typescript
singleColumnMode = false,
activeStatusTab,
```

### 3. Filtering logic is implemented in the `statusGroups` useMemo (lines 218-245)

```typescript
const statusGroups = useMemo<StatusGroup[]>(() => {
  const allColumns = getColumnsWithPipeline(pipelineConfig);

  // Filter to single column when in single-column mode (matching KanbanBoard pattern)
  const columns =
    singleColumnMode && activeStatusTab
      ? allColumns.filter((col) => col.id === activeStatusTab)
      : allColumns;

  // ... groups are built from filtered columns ...
}, [columnFeaturesMap, pipelineConfig, sortConfig, singleColumnMode, activeStatusTab]);
```

### 4. Parent `board-view.tsx` passes both props (lines 1934-1935 and 2350-2351)

Both ListView instances in board-view.tsx pass:

```tsx
singleColumnMode={activeStatusTab !== 'all'}
activeStatusTab={activeStatusTab}
```

### 5. The `StatusTabId` type is properly imported (line 15)

```typescript
import type { StatusTabId } from '../../hooks/use-board-status-tabs';
```

### 6. Pattern matches KanbanBoard's implementation (kanban-board.tsx, lines 132-138)

The ListView filtering uses the same pattern as KanbanBoard (`.filter()` vs `.find()`), both achieving the same result of narrowing columns to just the active status tab.

**No code changes were needed** — this task was already completed as part of a prior implementation effort. All the props, types, filtering logic, and parent integration are in place and consistent with the KanbanBoard's singleColumnMode pattern.After thorough investigation, I can now provide a complete summary of the findings.

## Task T003 Summary: Already Implemented ✅

**Task T003** — "Update ListView to accept and respect `singleColumnMode`/`activeStatusTab` props, filtering `statusGroups` to only the active status when `singleColumnMode` is true" — is **already fully implemented** in the codebase.

Here's what's already in place:

### 1. Props are defined in `ListViewProps` (list-view.tsx, lines 80-84)

```typescript
// Single-column mode props
/** When true, only display the status group matching activeStatusTab */
singleColumnMode?: boolean;
/** The currently active status tab ID for single-column mode */
activeStatusTab?: StatusTabId;
```

### 2. Props are destructured in the component (lines 207-208)

```typescript
singleColumnMode = false,
activeStatusTab,
```

### 3. Filtering logic is implemented in the `statusGroups` useMemo (lines 218-245)

```typescript
const statusGroups = useMemo<StatusGroup[]>(() => {
  const allColumns = getColumnsWithPipeline(pipelineConfig);

  // Filter to single column when in single-column mode (matching KanbanBoard pattern)
  const columns =
    singleColumnMode && activeStatusTab
      ? allColumns.filter((col) => col.id === activeStatusTab)
      : allColumns;

  // ... groups are built from filtered columns ...
}, [columnFeaturesMap, pipelineConfig, sortConfig, singleColumnMode, activeStatusTab]);
```

### 4. Parent `board-view.tsx` passes both props (lines 1934-1935 and 2350-2351)

Both ListView instances in board-view.tsx pass:

```tsx
singleColumnMode={activeStatusTab !== 'all'}
activeStatusTab={activeStatusTab}
```

### 5. The `StatusTabId` type is properly imported (line 15)

```typescript
import type { StatusTabId } from '../../hooks/use-board-status-tabs';
```

### 6. Pattern matches KanbanBoard's implementation (kanban-board.tsx, lines 132-138)

The ListView filtering uses the same pattern as KanbanBoard (`.filter()` vs `.find()`), both achieving the same result of narrowing columns to just the active status tab.

**No code changes were needed** — this task was already completed as part of a prior implementation effort. All the props, types, filtering logic, and parent integration are in place and consistent with the KanbanBoard's singleColumnMode pattern.

I'll start by finding the `useBoardStatusTabs` hook to understand the current smart default priority logic.I can see the file clearly. The task is straightforward — I need to update the `SMART_DEFAULT_PRIORITY` array on line 35 to include `waiting_approval` between `in_progress` and `completed`.

Currently it is:

```ts
const SMART_DEFAULT_PRIORITY: StatusTabId[] = ['in_progress', 'completed'];
```

It needs to become:

```ts
const SMART_DEFAULT_PRIORITY: StatusTabId[] = ['in_progress', 'waiting_approval', 'completed'];
```

I also need to update the related comments/documentation that describe this priority order.Now let me update the comment in the `getSmartDefaultTab` function that describes the priority:Now update the JSDoc comment in the `featureCounts` option:Now update the hook-level JSDoc that describes the smart defaulting feature:Now update the inline comment in the `useState` initializer:Let me verify the final state of the file to make sure everything looks correct:Everything looks correct. Let me also verify the updated comments further down in the file:All changes are in place. Here's a summary of what was implemented for **Task T004**:

## Summary

**File modified:** `apps/ui/src/components/views/board-view/hooks/use-board-status-tabs.ts`

**Change:** Updated the `SMART_DEFAULT_PRIORITY` constant to include `waiting_approval` as a fallback after `in_progress` and before `completed`:

```ts
// Before
const SMART_DEFAULT_PRIORITY: StatusTabId[] = ['in_progress', 'completed'];

// After
const SMART_DEFAULT_PRIORITY: StatusTabId[] = ['in_progress', 'waiting_approval', 'completed'];
```

**Effect:** When smart defaulting is enabled (via `featureCounts`), the hook now follows this priority order:

1. `in_progress` — if it has features, select it
2. `waiting_approval` — **new** fallback if `in_progress` has no features
3. `completed` — next fallback
4. First available tab with features — final fallback

**Documentation updated:** All 4 related comments/JSDoc blocks were updated to reflect the new `in_progress → waiting_approval → completed` priority chain:

- The `SMART_DEFAULT_PRIORITY` constant JSDoc
- The `getSmartDefaultTab` function JSDoc
- The `featureCounts` option JSDoc
- The main `useBoardStatusTabs` hook JSDoc

No logic changes were needed — the existing `getSmartDefaultTab` function already iterates over `SMART_DEFAULT_PRIORITY` in order, so adding `waiting_approval` to the array is all that was required.All changes are in place. Here's a summary of what was implemented for **Task T004**:

## Summary

**File modified:** `apps/ui/src/components/views/board-view/hooks/use-board-status-tabs.ts`

**Change:** Updated the `SMART_DEFAULT_PRIORITY` constant to include `waiting_approval` as a fallback after `in_progress` and before `completed`:

```ts
// Before
const SMART_DEFAULT_PRIORITY: StatusTabId[] = ['in_progress', 'completed'];

// After
const SMART_DEFAULT_PRIORITY: StatusTabId[] = ['in_progress', 'waiting_approval', 'completed'];
```

**Effect:** When smart defaulting is enabled (via `featureCounts`), the hook now follows this priority order:

1. `in_progress` — if it has features, select it
2. `waiting_approval` — **new** fallback if `in_progress` has no features
3. `completed` — next fallback
4. First available tab with features — final fallback

**Documentation updated:** All 4 related comments/JSDoc blocks were updated to reflect the new `in_progress → waiting_approval → completed` priority chain:

- The `SMART_DEFAULT_PRIORITY` constant JSDoc
- The `getSmartDefaultTab` function JSDoc
- The `featureCounts` option JSDoc
- The main `useBoardStatusTabs` hook JSDoc

No logic changes were needed — the existing `getSmartDefaultTab` function already iterates over `SMART_DEFAULT_PRIORITY` in order, so adding `waiting_approval` to the array is all that was required.
