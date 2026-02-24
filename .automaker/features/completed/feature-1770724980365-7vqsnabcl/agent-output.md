Let me start by understanding the feature request and exploring the codebase.

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore the codebase to understand resume button and tag/timestamp logic",
"status": "in_progress",
"activeForm": "Exploring codebase for resume button and tag logic"
},
{
"content": "Implement logic to hide resume button when tag has activity within past 5 minutes",
"status": "pending",
"activeForm": "Implementing resume button visibility logic"
},
{
"content": "Verify the implementation follows existing patterns",
"status": "pending",
"activeForm": "Verifying implementation"
}
]
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\.dmaker\\features\\feature-1770724980365-7vqsnabcl\\images\\pasted-image-2026-02-10T12-02-39-688Z-1770724959813.png"
}
I can see the screenshot shows a Kanban board in list view with "In Progress" features. There's a "Resume" button visible on one of the items. The feature request is: if a feature has had activity within the past 5 minutes, the Resume button should be hidden because it means the agent is already running.

Let me explore the relevant components to understand the resume button logic.

🔧 Tool: Task
Input: {
"description": "Find resume button in codebase",
"prompt": "Search the codebase for where the \"Resume\" button is rendered in the board/kanban/list view components. I need to find:\n1. Where the Resume button is defined/rendered\n2. What data/props determine when it's shown\n3. How feature timestamps/activity tracking works (particularly any \"lastEvent\" or similar timestamp fields)\n4. The Feature type definition to understand available fields\n\nFocus on:\n- apps/ui/src/components/views/board-view/ directory\n- libs/types/src/feature.ts\n- Any hooks or services related to running agents\n\nPlease provide the full content of the relevant files/sections.",
"subagent_type": "Explore"
}

🔧 Tool: Glob
Input: {
"pattern": "apps/ui/src/components/views/board-view/\*_/_.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\libs\\types\\src\\feature.ts"
}

🔧 Tool: Grep
Input: {
"pattern": "Resume",
"glob": "apps/ui/src/components/views/board-view/\*_/_.tsx",
"output_mode": "files_with_matches"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\kanban-card\\card-actions.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\list-view\\row-actions.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\kanban-board.tsx"
}

🔧 Tool: Grep
Input: {
"pattern": "onResume|resumeFeature",
"glob": "apps/ui/src/components/views/board-view/\*_/_.tsx",
"output_mode": "files_with_matches"
}

🔧 Tool: Grep
Input: {
"pattern": "lastEvent|completedAt|startedAt",
"type": "ts",
"output_mode": "files_with_matches"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\hooks\\use-board-actions.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\kanban-board.tsx",
"offset": 1,
"limit": 50
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\kanban-card\\kanban-card.tsx"
}

🔧 Tool: Grep
Input: {
"pattern": "feature\\.status === 'in_progress'",
"glob": "apps/ui/src/components/views/board-view/\*_/_.tsx",
"output_mode": "content",
"head_limit": 30
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\kanban-card\\card-actions.tsx",
"offset": 117,
"limit": 90
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\list-view\\row-actions.tsx",
"offset": 150,
"limit": 12
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\hooks\\use-board-features.ts"
}
Excellent. Now I have a thorough understanding of the codebase. Let me also check if there's any running agents tracking that could help identify if an agent is currently active.

🔧 Tool: Task
Input: {
"description": "Find running agents tracking",
"prompt": "Search the codebase for how running agents are tracked. I need to understand:\n\n1. How `isCurrentAutoTask` is determined - what makes a feature \"currently running\"\n2. The `use-running-agents.ts` hook in `apps/ui/src/hooks/`\n3. The `running-agents-indicator.tsx` or `running-agents-panel.tsx` components\n4. Any WebSocket events or state that tracks which features have active agents\n5. How `isCurrentAutoTask` is passed to card-actions.tsx and row-actions.tsx\n\nFocus on understanding what data is available to determine if a feature's agent is actively running right now.\n\nPlease provide full file contents for the key files.",
"subagent_type": "Explore"
}

🔧 Tool: Bash
Input: {
"command": "find \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" -type f -name \"use-running-agents.ts\" 2>/dev/null"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-running-agents.ts"
}

🔧 Tool: Glob
Input: {
"pattern": "apps/ui/src/components/layout/running-agents-indicator.tsx"
}

🔧 Tool: Glob
Input: {
"pattern": "apps/ui/src/components/views/board-view/components/running-agents-panel.tsx"
}

🔧 Tool: Grep
Input: {
"pattern": "isCurrentAutoTask",
"type": "tsx"
}

🔧 Tool: Grep
Input: {
"pattern": "isCurrentAutoTask",
"output_mode": "content"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\running-agents-indicator.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\running-agents-panel.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\kanban-card\\card-actions.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\list-view\\row-actions.tsx",
"limit": 300
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\kanban-board.tsx",
"limit": 400
}

🔧 Tool: Grep
Input: {
"pattern": "runningAutoTasks.\*=",
"output_mode": "content",
"head_limit": 20
}

🔧 Tool: Bash
Input: {
"command": "grep -r \"autoModeByProject\\|runningTasks\" \"C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\" --include=\"_.ts\" --include=\"_.tsx\" | head -20"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"limit": 400
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-auto-mode.ts",
"limit": 250
}

🔧 Tool: Bash
Input: {
"command": "grep -n \"autoModeByProject\\|addRunningTask\\|removeRunningTask\\|pendingPlanApproval\" \"C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts\" | head -50"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"offset": 630,
"limit": 50
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"offset": 2320,
"limit": 80
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"offset": 810,
"limit": 20
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx",
"offset": 490,
"limit": 50
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\list-view\\list-view.tsx",
"offset": 410,
"limit": 30
}
Now I have a clear picture. Let me look at the specific files I'll need to modify:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\kanban-card\\card-actions.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\list-view\\row-actions.tsx"
}
Now I understand the problem well. The `startedAt` timestamp is set when a feature starts or resumes, and it represents the most recent activation time. The issue is that when a feature's `startedAt` is within the last 5 minutes, the Resume button should be hidden because the agent is likely still running (even though `isCurrentAutoTask` might be false due to state tracking gaps).

Let me also check how `startedAt` flows through to the components:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\libs\\types\\src\\feature.ts"
}
Good, I can see the `startedAt` field on the Feature type. Now I understand the full picture:

**The Problem:** When a feature has `status === 'in_progress'` and `startedAt` is within the last 5 minutes, the agent is likely still running. However, if `isCurrentAutoTask` is false (e.g., after a page refresh or reconnection), the Resume button still shows up even though the agent is actively working. The user wants to suppress the Resume button in this case.

**The Solution:** Add a check: if `startedAt` is within the past 5 minutes (and the feature isn't tracked as a current auto task), treat it as recently started and hide the Resume button. This applies to both the kanban card actions and the list view row actions.

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore the codebase to understand resume button and tag/timestamp logic",
"status": "completed",
"activeForm": "Exploring codebase for resume button and tag logic"
},
{
"content": "Add recently-started check to card-actions.tsx (kanban view)",
"status": "in_progress",
"activeForm": "Adding recently-started check to card-actions.tsx"
},
{
"content": "Add recently-started check to row-actions.tsx (list view)",
"status": "pending",
"activeForm": "Adding recently-started check to row-actions.tsx"
},
{
"content": "Verify the implementation follows existing patterns",
"status": "pending",
"activeForm": "Verifying implementation"
}
]
}
Now let me implement the changes. The approach is straightforward: create a helper function to check if `startedAt` is within the last 5 minutes, and use it to suppress the Resume button in both views.

**card-actions.tsx** - Add the check to hide the Resume button when the feature was recently started:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\kanban-card\\card-actions.tsx",
"old_string": "// @ts-nocheck\nimport { Feature } from '@/store/app-store';\nimport { Button } from '@/components/ui/button';\nimport {\n Edit,\n PlayCircle,\n RotateCcw,\n StopCircle,\n CheckCircle2,\n FileText,\n Eye,\n Wand2,\n} from 'lucide-react';",
"new_string": "// @ts-nocheck\nimport { Feature } from '@/store/app-store';\nimport { Button } from '@/components/ui/button';\nimport {\n Edit,\n PlayCircle,\n RotateCcw,\n StopCircle,\n CheckCircle2,\n FileText,\n Eye,\n Wand2,\n} from 'lucide-react';\n\nconst RECENTLY_STARTED_THRESHOLD_MS = 5 _ 60 _ 1000; // 5 minutes\n\nfunction isRecentlyStarted(feature: Feature): boolean {\n if (!feature.startedAt) return false;\n const elapsed = Date.now() - new Date(feature.startedAt).getTime();\n return elapsed < RECENTLY_STARTED_THRESHOLD_MS;\n}"
}
Now update the Resume button rendering in the kanban card to check `isRecentlyStarted`:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\kanban-card\\card-actions.tsx",
"old_string": " {feature.skipTests && onManualVerify ? (\n <Button\n variant=\"default\"\n size=\"sm\"\n className=\"flex-1 h-7 text-[11px]\"\n onClick={(e) => {\n e.stopPropagation();\n onManualVerify();\n }}\n onPointerDown={(e) => e.stopPropagation()}\n data-testid={`manual-verify-${feature.id}`}\n >\n <CheckCircle2 className=\"w-3 h-3 mr-1\" />\n Verify\n </Button>\n ) : onResume ? (\n <Button\n variant=\"default\"\n size=\"sm\"\n className=\"flex-1 h-7 text-[11px] bg-[var(--status-success)] hover:bg-[var(--status-success)]/90\"\n onClick={(e) => {\n e.stopPropagation();\n onResume();\n }}\n onPointerDown={(e) => e.stopPropagation()}\n data-testid={`resume-feature-${feature.id}`}\n >\n <RotateCcw className=\"w-3 h-3 mr-1\" />\n Resume\n </Button>\n ) : onVerify ? (",
"new_string": " {feature.skipTests && onManualVerify ? (\n <Button\n variant=\"default\"\n size=\"sm\"\n className=\"flex-1 h-7 text-[11px]\"\n onClick={(e) => {\n e.stopPropagation();\n onManualVerify();\n }}\n onPointerDown={(e) => e.stopPropagation()}\n data-testid={`manual-verify-${feature.id}`}\n >\n <CheckCircle2 className=\"w-3 h-3 mr-1\" />\n Verify\n </Button>\n ) : onResume && !isRecentlyStarted(feature) ? (\n <Button\n variant=\"default\"\n size=\"sm\"\n className=\"flex-1 h-7 text-[11px] bg-[var(--status-success)] hover:bg-[var(--status-success)]/90\"\n onClick={(e) => {\n e.stopPropagation();\n onResume();\n }}\n onPointerDown={(e) => e.stopPropagation()}\n data-testid={`resume-feature-${feature.id}`}\n >\n <RotateCcw className=\"w-3 h-3 mr-1\" />\n Resume\n </Button>\n ) : onVerify ? ("
}

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore the codebase to understand resume button and tag/timestamp logic",
"status": "completed",
"activeForm": "Exploring codebase for resume button and tag logic"
},
{
"content": "Add recently-started check to card-actions.tsx (kanban view)",
"status": "completed",
"activeForm": "Adding recently-started check to card-actions.tsx"
},
{
"content": "Add recently-started check to row-actions.tsx (list view)",
"status": "in_progress",
"activeForm": "Adding recently-started check to row-actions.tsx"
},
{
"content": "Verify the implementation follows existing patterns",
"status": "pending",
"activeForm": "Verifying implementation"
}
]
}
Now update **row-actions.tsx** for the list view. I need to add the same helper and apply it in `getPrimaryAction` and the dropdown menu:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\list-view\\row-actions.tsx",
"old_string": "import { cn } from '@/lib/utils';\nimport { Button } from '@/components/ui/button';\nimport {\n DropdownMenu,\n DropdownMenuContent,\n DropdownMenuItem,\n DropdownMenuSeparator,\n DropdownMenuTrigger,\n} from '@/components/ui/dropdown-menu';\nimport type { Feature } from '@/store/app-store';",
"new_string": "import { cn } from '@/lib/utils';\nimport { Button } from '@/components/ui/button';\nimport {\n DropdownMenu,\n DropdownMenuContent,\n DropdownMenuItem,\n DropdownMenuSeparator,\n DropdownMenuTrigger,\n} from '@/components/ui/dropdown-menu';\nimport type { Feature } from '@/store/app-store';\n\nconst RECENTLY_STARTED_THRESHOLD_MS = 5 _ 60 _ 1000; // 5 minutes\n\nfunction isRecentlyStarted(feature: Feature): boolean {\n if (!feature.startedAt) return false;\n const elapsed = Date.now() - new Date(feature.startedAt).getTime();\n return elapsed < RECENTLY_STARTED_THRESHOLD_MS;\n}"
}
Now update the `getPrimaryAction` function to hide Resume when recently started:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\list-view\\row-actions.tsx",
"old_string": " // In progress - resume is primary\n if (feature.status === 'in_progress' && handlers.onResume) {\n return {\n icon: RotateCcw,\n label: 'Resume',\n onClick: handlers.onResume,\n variant: 'success',\n };\n }",
"new_string": " // In progress - resume is primary (but not if recently started, agent is likely still running)\n if (feature.status === 'in_progress' && handlers.onResume && !isRecentlyStarted(feature)) {\n return {\n icon: RotateCcw,\n label: 'Resume',\n onClick: handlers.onResume,\n variant: 'success',\n };\n }"
}
Now update the dropdown menu's Resume item in the "In Progress" section:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\list-view\\row-actions.tsx",
"old_string": " {feature.skipTests && handlers.onManualVerify ? (\n <MenuItem\n icon={CheckCircle2}\n label=\"Verify\"\n onClick={withClose(handlers.onManualVerify)}\n variant=\"success\"\n />\n ) : handlers.onResume ? (\n <MenuItem\n icon={RotateCcw}\n label=\"Resume\"\n onClick={withClose(handlers.onResume)}\n variant=\"success\"\n />\n ) : null}",
"new_string": " {feature.skipTests && handlers.onManualVerify ? (\n <MenuItem\n icon={CheckCircle2}\n label=\"Verify\"\n onClick={withClose(handlers.onManualVerify)}\n variant=\"success\"\n />\n ) : handlers.onResume && !isRecentlyStarted(feature) ? (\n <MenuItem\n icon={RotateCcw}\n label=\"Resume\"\n onClick={withClose(handlers.onResume)}\n variant=\"success\"\n />\n ) : null}"
}

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore the codebase to understand resume button and tag/timestamp logic",
"status": "completed",
"activeForm": "Exploring codebase for resume button and tag logic"
},
{
"content": "Add recently-started check to card-actions.tsx (kanban view)",
"status": "completed",
"activeForm": "Adding recently-started check to card-actions.tsx"
},
{
"content": "Add recently-started check to row-actions.tsx (list view)",
"status": "completed",
"activeForm": "Adding recently-started check to row-actions.tsx"
},
{
"content": "Verify the implementation follows existing patterns",
"status": "in_progress",
"activeForm": "Verifying implementation"
}
]
}
Let me verify the final state of both files to make sure the changes look correct:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\kanban-card\\card-actions.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\list-view\\row-actions.tsx",
"offset": 1,
"limit": 30
}
Both files look correct. Let me now verify the build compiles:

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore the codebase to understand resume button and tag/timestamp logic",
"status": "completed",
"activeForm": "Exploring codebase for resume button and tag logic"
},
{
"content": "Add recently-started check to card-actions.tsx (kanban view)",
"status": "completed",
"activeForm": "Adding recently-started check to card-actions.tsx"
},
{
"content": "Add recently-started check to row-actions.tsx (list view)",
"status": "completed",
"activeForm": "Adding recently-started check to row-actions.tsx"
},
{
"content": "Verify the implementation compiles and follows existing patterns",
"status": "in_progress",
"activeForm": "Verifying implementation compiles"
}
]
}

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" && npx tsc --noEmit --project apps/ui/tsconfig.json 2>&1 | head -30",
"description": "Type-check UI project",
"timeout": 60000
}

🔧 Tool: TaskOutput
Input: {
"task_id": "b89dfea",
"block": true,
"timeout": 60000
}
The type errors are all pre-existing (missing module declarations for `@dmaker/utils/logger`, `@dmaker/types`, etc. - these are shared packages that need to be built first). None of the errors are related to my changes. The two files I modified (`card-actions.tsx` and `row-actions.tsx`) have no type errors.

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore the codebase to understand resume button and tag/timestamp logic",
"status": "completed",
"activeForm": "Exploring codebase for resume button and tag logic"
},
{
"content": "Add recently-started check to card-actions.tsx (kanban view)",
"status": "completed",
"activeForm": "Adding recently-started check to card-actions.tsx"
},
{
"content": "Add recently-started check to row-actions.tsx (list view)",
"status": "completed",
"activeForm": "Adding recently-started check to row-actions.tsx"
},
{
"content": "Verify the implementation compiles and follows existing patterns",
"status": "completed",
"activeForm": "Verifying implementation compiles"
}
]
}

<summary>
## Summary: Hide Resume Button When Feature Recently Started (Within 5 Minutes)

### Changes Implemented

- Added an `isRecentlyStarted()` helper function that checks if a feature's `startedAt` timestamp is within the last 5 minutes
- When `startedAt` is within 5 minutes, the Resume button is hidden because the agent is likely still running (even if the WebSocket tracking via `isCurrentAutoTask` hasn't caught up)
- Applied this check in both the **kanban card view** and the **list view** (primary action button + dropdown menu)

### Files Modified

- `apps/ui/src/components/views/board-view/components/kanban-card/card-actions.tsx` — Added `isRecentlyStarted()` helper and gated the Resume button with `!isRecentlyStarted(feature)` check
- `apps/ui/src/components/views/board-view/components/list-view/row-actions.tsx` — Added same `isRecentlyStarted()` helper, applied check to `getPrimaryAction()` Resume return and to the dropdown menu Resume item

### Notes for Developer

- The 5-minute threshold is defined as `RECENTLY_STARTED_THRESHOLD_MS = 5 * 60 * 1000` in both files
- The check uses the existing `feature.startedAt` field which is already set when a feature moves to `in_progress`, resumes, or gets a follow-up
- When the 5-minute window expires, the Resume button will naturally reappear (on the next re-render triggered by any state update or user interaction)
- The `isCurrentAutoTask` check (WebSocket-based running agent tracking) still takes priority — if the agent is tracked as running, the card shows running-specific UI (Logs, Force Stop) instead of the Resume button
</summary>
