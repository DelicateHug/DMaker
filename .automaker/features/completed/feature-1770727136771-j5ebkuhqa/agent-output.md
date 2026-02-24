Looking at the screenshot, I can see the issue: a feature with status "waiting_approval" is showing up in the "Running Agents" section. It should be removed from there once it reaches that status. Let me explore the codebase to understand how running agents are tracked and displayed.

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore how running agents are tracked and displayed",
"status": "in_progress",
"activeForm": "Exploring running agents tracking code"
},
{
"content": "Fix filtering to exclude waiting_approval features from running agents",
"status": "pending",
"activeForm": "Fixing running agents filter"
},
{
"content": "Verify the fix covers both UI and server-side logic",
"status": "pending",
"activeForm": "Verifying fix completeness"
}
]
}

🔧 Tool: Task
Input: {
"description": "Find running agents code",
"prompt": "Search the codebase for how \"running agents\" are determined and displayed. I need to find:\n\n1. The running agents indicator/panel component (likely in apps/ui/src/components/layout/running-agents-indicator.tsx or similar)\n2. The hook that provides running agents data (likely use-running-agents.ts)\n3. Any server-side logic that determines if an agent is \"running\"\n4. How features with status \"waiting_approval\" are handled in these contexts\n\nSearch for:\n- \"running agents\" or \"runningAgents\" in the UI code\n- The use-running-agents hook\n- Any filtering logic that determines what counts as a \"running\" agent\n- References to \"waiting_approval\" status in agent-related code\n\nPlease read the full contents of all relevant files and report back with the file paths, line numbers, and the key logic for how running agents are determined.",
"subagent_type": "Explore"
}

🔧 Tool: Glob
Input: {
"pattern": "\**/*running-agents\*"
}

🔧 Tool: Grep
Input: {
"pattern": "runningAgents",
"output_mode": "files_with_matches"
}

🔧 Tool: Grep
Input: {
"pattern": "running agents",
"output_mode": "files_with_matches",
"glob": "\*_/_.{ts,tsx,js,jsx}"
}

🔧 Tool: Grep
Input: {
"pattern": "waiting_approval",
"output_mode": "files_with_matches"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-running-agents.ts"
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
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\routes\\running-agents\\routes\\index.ts"
}

🔧 Tool: Grep
Input: {
"pattern": "pendingPlanApproval",
"output_mode": "files_with_matches"
}

🔧 Tool: Grep
Input: {
"pattern": "getRunningAgents",
"output_mode": "files_with_matches"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"limit": 150
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"limit": 500,
"offset": 1200
}

🔧 Tool: Grep
Input: {
"pattern": "getRunningAgents\\s\*\\(",
"output_mode": "content",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"head_limit": 20
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"limit": 50,
"offset": 1873
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"limit": 200,
"offset": 1
}

🔧 Tool: Grep
Input: {
"pattern": "pendingPlanApproval._\\?._:",
"output_mode": "content",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"head_limit": 50
}

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" && grep -n \"pendingPlanApproval\" apps/ui/src/store/app-store.ts | head -20"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"limit": 50,
"offset": 808
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"limit": 50,
"offset": 1680
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"limit": 100,
"offset": 3805
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\tests\\unit\\routes\\running-agents.test.ts"
}

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" && grep -n \"recentlyCompletedFeatures\" apps/ui/src/store/app-store.ts | head -20"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"limit": 50,
"offset": 900
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"limit": 100,
"offset": 4200
}
Now let me read the key files in detail to understand the exact fix needed:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-running-agents.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\running-agents-indicator.tsx"
}
Now I understand the issue clearly. Let me also check the running-agents-panel and how `pendingPlanApprovals` (plural) works in the app store, since the screenshot shows a feature with `waiting_approval` status from the feature JSON itself (not just the transient `pendingPlanApproval` state):

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\running-agents-panel.tsx",
"limit": 120
}

🔧 Tool: Grep
Input: {
"pattern": "waiting_approval",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-running-agents.ts",
"output_mode": "content"
}

🔧 Tool: Grep
Input: {
"pattern": "pendingPlanApprovals",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"output_mode": "content",
"-n": true,
"-C": 3
}
Now I have a clear picture of the issue. Let me look at the screenshot again to understand the problem:

The screenshot shows a feature "Research and implement Question Ninja..." with `Status: waiting_approval` appearing in the Running Agents list. Looking at the code:

1. In `use-running-agents.ts` (line 138-142), a feature is considered "running" if its status is `in_progress` OR it's in the `runningTasks` set.
2. The feature in the screenshot has `status: waiting_approval` in its feature JSON, but it's still appearing — meaning it must be in the `runningTasks` set from Zustand.

The core issue is in the `useRunningAgents` hook: features with `status === 'waiting_approval'` should be excluded from the running agents list. Even if a feature ID is still in the `runningTasks` set, once its actual status becomes `waiting_approval`, it should not appear as a running agent.

Let me also check if there's a `pendingPlanApprovals` (plural) being used in the indicator, since the current code only checks `pendingPlanApproval` (singular):

🔧 Tool: Grep
Input: {
"pattern": "pendingPlanApprovals",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\running-agents-indicator.tsx",
"output_mode": "content"
}

🔧 Tool: Grep
Input: {
"pattern": "pendingPlanApprovals",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\running-agents-panel.tsx",
"output_mode": "content"
}
Good. Now let me also check the `runningTasks` cleanup logic — when does a feature get removed from `runningTasks`:

🔧 Tool: Grep
Input: {
"pattern": "runningTasks",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"output_mode": "content",
"-n": true,
"-C": 3,
"head_limit": 80
}

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore how running agents are tracked and displayed",
"status": "completed",
"activeForm": "Exploring running agents tracking code"
},
{
"content": "Fix filtering to exclude waiting_approval features from running agents",
"status": "in_progress",
"activeForm": "Fixing running agents filter"
},
{
"content": "Apply same fix to running-agents-panel.tsx",
"status": "pending",
"activeForm": "Applying fix to running agents panel"
},
{
"content": "Verify the fix covers both components",
"status": "pending",
"activeForm": "Verifying fix completeness"
}
]
}
Now I understand the full picture. The fix needs to happen in two places:

1. **`use-running-agents.ts`** (line 138-142): The filter should also exclude features with `status === 'waiting_approval'`. Currently, a feature stays in the list if its ID is in `runningTasks` even after its status changes to `waiting_approval`.

2. **Both `running-agents-indicator.tsx` and `running-agents-panel.tsx`**: These currently only check the singular `pendingPlanApproval` for UI status. But more importantly, the root cause is in the hook — if we filter them out there, they won't appear in either component.

Let me make the fix:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-running-agents.ts",
"old_string": " // Filter to features that are running:\n // 1. Feature status is 'in_progress'\n // 2. OR feature ID is in the Zustand runningTasks (event-based tracking from useAutoMode)\n const runningFeatures = allFeatures.filter((f) => {\n const isInProgress = f.status === 'in_progress';\n const isInRunningTasks = currentRunningTaskIds.has(f.id);\n return isInProgress || isInRunningTasks;\n });",
"new_string": " // Filter to features that are actively running:\n // 1. Feature status is 'in_progress'\n // 2. OR feature ID is in the Zustand runningTasks (event-based tracking from useAutoMode)\n // BUT exclude features that have reached 'waiting_approval' status — they are no longer\n // actively running and should appear in \"Recently Completed\" instead.\n const runningFeatures = allFeatures.filter((f) => {\n if (f.status === 'waiting_approval') return false;\n const isInProgress = f.status === 'in_progress';\n const isInRunningTasks = currentRunningTaskIds.has(f.id);\n return isInProgress || isInRunningTasks;\n });"
}

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore how running agents are tracked and displayed",
"status": "completed",
"activeForm": "Exploring running agents tracking code"
},
{
"content": "Fix filtering to exclude waiting_approval features from running agents",
"status": "completed",
"activeForm": "Fixing running agents filter"
},
{
"content": "Apply same fix to running-agents-panel.tsx",
"status": "in_progress",
"activeForm": "Applying fix to running agents panel"
},
{
"content": "Verify the fix covers both components",
"status": "pending",
"activeForm": "Verifying fix completeness"
}
]
}
The `running-agents-panel.tsx` and `running-agents-indicator.tsx` both consume data from `useRunningAgents()` — since the filtering happens in the hook, both components will automatically stop showing `waiting_approval` features. No changes needed in those components for the core fix.

However, I should also check if the `runningTasks` in the Zustand store should be cleaned up when a feature transitions to `waiting_approval`. Let me check how the auto-mode events handle this:

🔧 Tool: Grep
Input: {
"pattern": "waiting_approval|removeRunningTask",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-auto-mode.ts",
"output_mode": "content",
"-n": true,
"-C": 5
}
I can see that on `auto_mode_feature_complete` (line 190), `removeRunningTask` is called, which should remove the feature from the `runningTasks` set. The feature also gets added to `recentlyCompletedFeatures` at that point. So the `runningTasks` cleanup does happen on the event side.

However, the issue could be a timing problem: the feature's status in the JSON file gets updated to `waiting_approval` before the event fully propagates, or the polling fetches the feature with its new `waiting_approval` status before the event removes it from `runningTasks`. This is exactly why the filter in the hook is the right place to fix it — it acts as a safety net regardless of timing.

Let me also check if there's a `plan_approval_requested` event that keeps the feature in running tasks:

🔧 Tool: Grep
Input: {
"pattern": "plan_approval|pending.*plan|approval.*request",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-auto-mode.ts",
"output_mode": "content",
"-n": true,
"-C": 10
}

🔧 Tool: Grep
Input: {
"pattern": "plan_approval_required",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-auto-mode.ts",
"output_mode": "content",
"-n": true,
"-C": 20
}
Now I see an important detail. When `plan_approval_required` fires (line 293-308), the feature is NOT removed from `runningTasks`. It stays in `runningTasks` while waiting for approval. This is likely the source of the bug shown in the screenshot — the feature's status has changed to `waiting_approval` in the feature JSON, but it's still in the `runningTasks` set, so it appears in the running agents list.

My fix in the hook correctly handles this: even if the feature is still in `runningTasks`, if its actual status is `waiting_approval`, it will be filtered out from the running agents list.

Now let me verify the fix is comprehensive by looking at the running-agents-panel more closely to see if it needs changes too:

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore how running agents are tracked and displayed",
"status": "completed",
"activeForm": "Exploring running agents tracking code"
},
{
"content": "Fix filtering to exclude waiting_approval features from running agents",
"status": "completed",
"activeForm": "Fixing running agents filter"
},
{
"content": "Apply same fix to running-agents-panel.tsx",
"status": "completed",
"activeForm": "Applying fix to running agents panel"
},
{
"content": "Verify the fix covers both components",
"status": "in_progress",
"activeForm": "Verifying fix completeness"
}
]
}
The running-agents-panel also uses `useRunningAgents()` hook (line 76), so the fix applies to both components automatically.

Let me verify the final state of the changed file:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-running-agents.ts",
"offset": 133,
"limit": 20
}
The fix looks correct. Let me also verify that the build compiles correctly:

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" && npx tsc --noEmit --project apps/ui/tsconfig.json 2>&1 | head -30",
"description": "Type-check the UI project",
"timeout": 60000
}

🔧 Tool: TaskOutput
Input: {
"task_id": "bb6460c",
"block": true,
"timeout": 60000
}

🔧 Tool: TaskOutput
Input: {
"task_id": "bb6460c",
"block": true,
"timeout": 120000
}
The type errors are all pre-existing (missing module declarations for `@dmaker/types`, `@dmaker/utils/logger`, etc. — likely need `npm run build:packages` first). None of them are related to my change. My change is purely a logic filter addition that doesn't affect types at all.

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore how running agents are tracked and displayed",
"status": "completed",
"activeForm": "Exploring running agents tracking code"
},
{
"content": "Fix filtering to exclude waiting_approval features from running agents",
"status": "completed",
"activeForm": "Fixing running agents filter"
},
{
"content": "Apply same fix to running-agents-panel.tsx",
"status": "completed",
"activeForm": "Applying fix to running agents panel"
},
{
"content": "Verify the fix covers both components",
"status": "completed",
"activeForm": "Verifying fix completeness"
}
]
}

<summary>
## Summary: Exclude waiting_approval features from Running Agents

### Changes Implemented

- Added a filter in the `useRunningAgents` hook to exclude features with `status === 'waiting_approval'` from the running agents list. Previously, a feature could remain in the "Running Agents" panel even after reaching `waiting_approval` status because it was still tracked in the Zustand `runningTasks` set (the `plan_approval_required` event does not remove the feature from `runningTasks`). Now, regardless of the `runningTasks` state, any feature whose actual status is `waiting_approval` will be excluded from the running agents list.

### Files Modified

- `apps/ui/src/hooks/use-running-agents.ts` (line 140-141): Added early return `if (f.status === 'waiting_approval') return false;` to the running features filter

### Notes for Developer

- This fix applies to both the `RunningAgentsIndicator` (top nav popover) and the `RunningAgentsPanel` (board view embedded panel) since both consume data from the same `useRunningAgents()` hook.
- Features that reach `waiting_approval` status will still appear in the "Recently Completed" section of the running agents popover (tracked separately via `recentlyCompletedFeatures` in the Zustand store, which gets populated on the `auto_mode_feature_complete` event).
- The pre-existing type errors in the build output are unrelated to this change — they come from missing module declarations for shared packages that need `npm run build:packages` first.
</summary>
