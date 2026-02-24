[timestamp:2026-02-14T21:04:51.288Z] 🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "View the context image to understand the bug",
"status": "completed",
"activeForm": "Viewing context image"
},
{
"content": "Explore how 'checking' status works in the codebase",
"status": "in_progress",
"activeForm": "Exploring checking status logic"
},
{
"content": "Identify the root cause of the stuck checking state",
"status": "pending",
"activeForm": "Identifying root cause"
},
{
"content": "Implement the fix",
"status": "pending",
"activeForm": "Implementing the fix"
}
]
}
Let me explore the codebase to understand how the "checking" status works and what could cause it to get stuck.

[timestamp:2026-02-14T21:04:59.988Z] 🔧 Tool: Task
Input: {
"description": "Explore checking status logic",
"prompt": "I need to understand how the \"checking\" status works in this codebase. A feature is getting stuck in \"checking...\" state and never transitioning out of it. \n\nSearch for:\n1. Where \"checking\" status is set on features\n2. How the checking process works (what triggers it, what resolves it)\n3. The agent service or pipeline service logic that handles checking\n4. Any timeout or error handling around the checking state\n5. The running agents panel logic that displays checking status\n\nLook in apps/server/src/ and apps/ui/src/ for relevant code. Focus on:\n- services/agent-service.ts\n- services/pipeline-service.ts\n- services/auto-mode-service.ts\n- The feature status types and transitions\n- Any \"checking\" related logic in the UI components\n\nBe very thorough - read all relevant files and provide detailed findings about the complete checking flow.",
"subagent_type": "Explore"
}

[timestamp:2026-02-14T21:05:02.388Z] 🔧 Tool: Grep
Input: {
"pattern": "checking",
"type": "ts",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr"
}

[timestamp:2026-02-14T21:05:02.756Z] 🔧 Tool: Grep
Input: {
"pattern": "checking",
"type": "tsx",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr"
}

[timestamp:2026-02-14T21:05:03.044Z] 🔧 Tool: Glob
Input: {
"pattern": "apps/server/src/services/{agent-service,pipeline-service,auto-mode-service}.ts"
}

[timestamp:2026-02-14T21:05:03.230Z] 🔧 Tool: Glob
Input: {
"pattern": "apps/server/src/lib/events.ts"
}

[timestamp:2026-02-14T21:05:28.055Z] 🔧 Tool: Grep
Input: {
"pattern": "checking",
"type": "ts",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr"
}

[timestamp:2026-02-14T21:05:28.263Z] 🔧 Tool: Glob
Input: {
"pattern": "libs/types/src/feature.ts"
}

[timestamp:2026-02-14T21:05:28.466Z] 🔧 Tool: Glob
Input: {
"pattern": "apps/server/src/routes/features/\*.ts"
}

[timestamp:2026-02-14T21:05:41.548Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\libs\\types\\src\\feature.ts"
}

[timestamp:2026-02-14T21:05:41.806Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\pipeline-service.ts"
}

[timestamp:2026-02-14T21:05:42.058Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\agent-service.ts"
}

[timestamp:2026-02-14T21:05:54.424Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"limit": 500
}

[timestamp:2026-02-14T21:05:59.613Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 500,
"limit": 600
}

[timestamp:2026-02-14T21:06:00.079Z] 🔧 Tool: Grep
Input: {
"pattern": "checking",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"output_mode": "content"
}

[timestamp:2026-02-14T21:06:09.179Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\running-agents-indicator.tsx"
}

[timestamp:2026-02-14T21:06:09.604Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\running-agents-panel.tsx",
"limit": 200
}

[timestamp:2026-02-14T21:06:18.963Z] 🔧 Tool: Grep
Input: {
"pattern": "titleGenerating",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr",
"output_mode": "files_with_matches"
}

[timestamp:2026-02-14T21:06:19.342Z] 🔧 Tool: Grep
Input: {
"pattern": "status.\*checking",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr",
"output_mode": "files_with_matches"
}

[timestamp:2026-02-14T21:06:19.702Z] 🔧 Tool: Grep
Input: {
"pattern": "Untitled Feature",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr",
"output_mode": "files_with_matches"
}

[timestamp:2026-02-14T21:06:32.915Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-running-agents.ts",
"limit": 300
}

[timestamp:2026-02-14T21:06:33.300Z] 🔧 Tool: Grep
Input: {
"pattern": "titleGenerating.\*true",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr",
"output_mode": "content"
}

[timestamp:2026-02-14T21:06:42.368Z] 🔧 Tool: Grep
Input: {
"pattern": "titleGenerating\\s\*=",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src",
"output_mode": "content",
"head_limit": 50
}

[timestamp:2026-02-14T21:06:42.696Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\feature-loader.ts",
"limit": 150
}

[timestamp:2026-02-14T21:06:50.840Z] 🔧 Tool: Bash
Input: {
"command": "grep -r \"titleGenerating\" \"C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\" --include=\"_.ts\" --include=\"_.tsx\" -n | head -40",
"description": "Find all titleGenerating references with line numbers"
}

[timestamp:2026-02-14T21:08:55.282Z] 🔧 Tool: Bash
Input: {
"command": "cat \"C:\\Users\\DYLANS~1\\AppData\\Local\\Temp\\claude\\C--Users-DylanSmart-Downloads-dmaker-pr\\tasks\\b28a6b3.output\"",
"description": "Read the grep output"
}

[timestamp:2026-02-14T21:09:01.095Z] 🔧 Tool: Grep
Input: {
"pattern": "titleGenerating",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\services",
"output_mode": "content",
"head_limit": 100
}

[timestamp:2026-02-14T21:09:06.441Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\feature-loader.ts",
"offset": 260,
"limit": 100
}

[timestamp:2026-02-14T21:09:06.968Z] 🔧 Tool: Grep
Input: {
"pattern": "titleGenerating.*false|titleGenerating.*true",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr",
"output_mode": "content"
}

[timestamp:2026-02-14T21:09:15.740Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\hooks\\use-board-actions.ts",
"limit": 300
}

[timestamp:2026-02-14T21:09:21.351Z] 🔧 Tool: Glob
Input: {
"pattern": "apps/server/src/routes/features/routes/\*.ts"
}

[timestamp:2026-02-14T21:09:22.052Z] 🔧 Tool: Bash
Input: {
"command": "ls \"C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\routes\\features\\routes\\\*\" 2>/dev/null | head -20",
"description": "List feature routes"
}

[timestamp:2026-02-14T21:09:30.596Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\routes\\features\\routes\\generate-title.ts"
}

[timestamp:2026-02-14T21:09:37.642Z] 🔧 Tool: Grep
Input: {
"pattern": "generateTitle|titleGenerating",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib",
"output_mode": "content"
}

[timestamp:2026-02-14T21:09:37.838Z] 🔧 Tool: Grep
Input: {
"pattern": "generateTitle|titleGenerating",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\store",
"output_mode": "content"
}

[timestamp:2026-02-14T21:10:11.617Z] 🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "View the context image to understand the bug",
"status": "completed",
"activeForm": "Viewing context image"
},
{
"content": "Explore how 'checking' status works in the codebase",
"status": "completed",
"activeForm": "Exploring checking status logic"
},
{
"content": "Identify the root cause of the stuck checking state",
"status": "in_progress",
"activeForm": "Identifying root cause"
},
{
"content": "Implement the fix",
"status": "pending",
"activeForm": "Implementing the fix"
}
]
}
Now let me read the key files to understand the exact code and identify what needs to be fixed.

[timestamp:2026-02-14T21:10:15.600Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\running-agents-indicator.tsx"
}

[timestamp:2026-02-14T21:10:16.080Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\hooks\\use-board-actions.ts"
}

[timestamp:2026-02-14T21:10:16.655Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-running-agents.ts"
}
Now let me check what `FeatureListSummary` includes and how the server returns `titleGenerating`:

[timestamp:2026-02-14T21:10:32.966Z] 🔧 Tool: Grep
Input: {
"pattern": "FeatureListSummary",
"output_mode": "files_with_matches"
}

[timestamp:2026-02-14T21:10:33.638Z] 🔧 Tool: Grep
Input: {
"pattern": "titleGenerating",
"output_mode": "files_with_matches"
}

[timestamp:2026-02-14T21:10:44.710Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\feature-loader.ts",
"offset": 250,
"limit": 120
}

[timestamp:2026-02-14T21:10:45.229Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\routes\\features\\routes\\list-summaries.ts"
}

[timestamp:2026-02-14T21:10:46.345Z] 🔧 Tool: Grep
Input: {
"pattern": "titleGenerating",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\libs\\types\\src\\feature.ts",
"output_mode": "content",
"-C": 3
}
Now let me look at how the card header displays the "checking" state in the board view to get the full picture:

[timestamp:2026-02-14T21:11:00.845Z] 🔧 Tool: Grep
Input: {
"pattern": "titleGenerating",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\kanban-card\\card-header.tsx",
"output_mode": "content",
"-C": 5
}

[timestamp:2026-02-14T21:11:01.750Z] 🔧 Tool: Grep
Input: {
"pattern": "titleGenerating",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"output_mode": "content",
"-C": 5
}
Now let me check the `featuresCache` to understand caching behavior and understand whether there's a `generateTitle` endpoint:

[timestamp:2026-02-14T21:11:11.859Z] 🔧 Tool: Grep
Input: {
"pattern": "generateTitle|generate-title",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src",
"output_mode": "files_with_matches"
}

[timestamp:2026-02-14T21:11:12.867Z] 🔧 Tool: Grep
Input: {
"pattern": "featuresCache",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\routes\\features\\common.ts",
"output_mode": "content",
"-C": 5
}

[timestamp:2026-02-14T21:11:23.321Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\routes\\features\\routes\\generate-title.ts"
}
Now let me check how features are loaded from disk on app reload to understand the persistence issue:

[timestamp:2026-02-14T21:11:31.147Z] 🔧 Tool: Grep
Input: {
"pattern": "titleGenerating",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\hooks\\use-board-features.ts",
"output_mode": "content",
"-C": 10
}
Now I have a clear understanding of the problem. Let me also check how `generateTitle` is wired in the electron API:

[timestamp:2026-02-14T21:11:38.153Z] 🔧 Tool: Grep
Input: {
"pattern": "generateTitle",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"output_mode": "content",
"-C": 5
}

[timestamp:2026-02-14T21:11:45.557Z] 🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "View the context image to understand the bug",
"status": "completed",
"activeForm": "Viewing context image"
},
{
"content": "Explore how 'checking' status works in the codebase",
"status": "completed",
"activeForm": "Exploring checking status logic"
},
{
"content": "Identify the root cause of the stuck checking state",
"status": "completed",
"activeForm": "Identifying root cause"
},
{
"content": "Implement the fix",
"status": "in_progress",
"activeForm": "Implementing the fix"
}
]
}
I've identified the root cause. Here's the problem:

1. When a feature is created without a title, `titleGenerating` is set to `true` and persisted to disk
2. The `generateTitle` API call is fire-and-forget — it calls the AI to generate a title
3. If the API call fails (network error, timeout, provider issue), the catch handler clears `titleGenerating` in memory AND attempts to persist
4. **However**, if the `generateTitle` API fails because the server can't reach the AI provider (no API key configured, rate limiting, etc.), the promise resolves with `success: false` - this path does clear the flag correctly
5. The **real issue** is that if the app is reloaded/closed during title generation, or if `persistFeatureUpdate` fails silently, the `titleGenerating: true` flag remains stuck on disk forever
6. There is **no recovery mechanism** — when features are loaded from disk with `titleGenerating: true`, nothing re-triggers the title generation or clears the stale flag

The fix needs to address multiple aspects:

1. Add a timeout to prevent long-running title generation calls from blocking
2. Add a recovery mechanism when loading features that have `titleGenerating: true` stuck on disk
3. Ensure the UI has a way to clear the stuck state

Let me implement the fixes:

[timestamp:2026-02-14T21:11:56.391Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\hooks\\use-board-features.ts",
"offset": 1,
"limit": 120
}
Now I have a thorough understanding of the issue. Let me implement the fixes:

**Fix 1**: In `use-board-features.ts` — when features are loaded from disk and have `titleGenerating: true`, clear the stale flag since the generation process is no longer running.

**Fix 2**: In `use-board-actions.ts` — add a timeout wrapper around the title generation API call to prevent it from hanging indefinitely.

**Fix 3**: In `running-agents-indicator.tsx` — make the "(checking...)" text show even when the title isn't "Untitled Feature" (edge case), and provide a fallback timeout display.

Let me implement these:

[timestamp:2026-02-14T21:12:05.893Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\hooks\\use-board-features.ts",
"offset": 120,
"limit": 200
}

[timestamp:2026-02-14T21:12:11.850Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\hooks\\use-board-features.ts",
"offset": 319,
"limit": 200
}
Now I have the full picture. Let me implement the fixes. The approach will be:

1. **Server-side fix**: When features are loaded from disk, clear `titleGenerating` if it's stale (the generation is no longer running since the server restarted)
2. **Client-side fix in `use-board-actions.ts`**: Add a timeout around the title generation call
3. **Client-side fix in `use-board-features.ts`**: When loading features, clear `titleGenerating` for features that have been stuck (i.e., features loaded from disk that still have `titleGenerating: true`)

The most robust fix is on the server side — when features are loaded, clear the `titleGenerating` flag since it's a transient client-side state that should never persist across reloads.

[timestamp:2026-02-14T21:12:22.794Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\feature-loader.ts",
"offset": 1,
"limit": 50
}

[timestamp:2026-02-14T21:12:28.777Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\feature-loader.ts",
"offset": 50,
"limit": 80
}
Now let me see the `getAll` method and `getAllSummaries` to understand where to add the fix:

[timestamp:2026-02-14T21:12:35.479Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\feature-loader.ts",
"offset": 200,
"limit": 70
}
Now I have all the context I need. Let me implement the fixes. The strategy is multi-layered:

1. **Server side (`feature-loader.ts`)**: When loading features from disk, always clear `titleGenerating` flag — it's a transient in-memory state that should not survive across server/app restarts.

2. **Client side (`use-board-actions.ts`)**: Add a 30-second timeout around the `generateTitle` API call.

3. **Client side (`use-board-features.ts`)**: When features are loaded from the server with `titleGenerating: true`, clear it since the original generation process is no longer running.

[timestamp:2026-02-14T21:12:46.401Z] 🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\feature-loader.ts",
"old_string": " if (!feature.id) {\n logger.warn(`Feature ${featureId} missing required 'id' field, skipping`);\n return null;\n }\n\n return feature;\n });",
"new_string": " if (!feature.id) {\n logger.warn(`Feature ${featureId} missing required 'id' field, skipping`);\n return null;\n }\n\n // Clear stale titleGenerating flag — this is a transient client-side state\n // that should not survive across server/app restarts. If it's still true on\n // disk, the original generation process is no longer running.\n if (feature.titleGenerating) {\n feature.titleGenerating = false;\n }\n\n return feature;\n });"
}
Now do the same in `getAllSummaries` (the other path that reads directly from disk):

[timestamp:2026-02-14T21:12:53.206Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\feature-loader.ts",
"offset": 326,
"limit": 50
}

[timestamp:2026-02-14T21:13:00.338Z] 🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\feature-loader.ts",
"old_string": " // Extract only lightweight summary fields\n const summary: FeatureListSummary = {\n id: feature.id,\n title: feature.title,\n titleGenerating: feature.titleGenerating,",
"new_string": " // Extract only lightweight summary fields\n // Always clear titleGenerating — it's a transient state that doesn't survive restarts\n const summary: FeatureListSummary = {\n id: feature.id,\n title: feature.title,\n titleGenerating: false,"
}
Also fix the `getAllListSummaries` method (which wraps `getAll`):

[timestamp:2026-02-14T21:13:06.440Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\feature-loader.ts",
"offset": 267,
"limit": 20
}
The `getAll` method now clears `titleGenerating` in memory (via the fix I added to the loop), so `getAllListSummaries` will already get `false`. But let me also make it explicit here for clarity since it maps from the already-cleared feature:

The `getAll` fix handles this since `feature.titleGenerating` is already cleared to `false` before being returned. The `getAllListSummaries` maps from those, so `titleGenerating` will be `false`. Good.

Now let me add a timeout to the client-side title generation:

[timestamp:2026-02-14T21:13:25.493Z] 🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\hooks\\use-board-actions.ts",
"old_string": " // Generate title in the background if needed (non-blocking)\n if (needsTitleGeneration) {\n const api = getElectronAPI();\n if (api?.features?.generateTitle) {\n api.features\n .generateTitle(featureData.description)\n .then((result) => {\n if (result.success && result.title) {\n const titleUpdates = {\n title: result.title,\n titleGenerating: false,\n };\n updateFeature(createdFeature.id, titleUpdates);\n persistFeatureUpdate(createdFeature.id, titleUpdates);\n } else {\n // Clear generating flag even if failed\n const titleUpdates = { titleGenerating: false };\n updateFeature(createdFeature.id, titleUpdates);\n persistFeatureUpdate(createdFeature.id, titleUpdates);\n }\n })\n .catch((error) => {\n logger.error('Error generating title:', error);\n // Clear generating flag on error\n const titleUpdates = { titleGenerating: false };\n updateFeature(createdFeature.id, titleUpdates);\n persistFeatureUpdate(createdFeature.id, titleUpdates);\n });\n }\n }",
"new_string": " // Generate title in the background if needed (non-blocking)\n if (needsTitleGeneration) {\n const api = getElectronAPI();\n if (api?.features?.generateTitle) {\n // Wrap in a timeout to prevent hanging indefinitely\n const TITLE_GENERATION_TIMEOUT_MS = 30000;\n const titlePromise = api.features.generateTitle(featureData.description);\n const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) =>\n setTimeout(() => resolve({ success: false, error: 'Title generation timed out' }), TITLE_GENERATION_TIMEOUT_MS)\n );\n\n Promise.race([titlePromise, timeoutPromise])\n .then((result) => {\n if (result.success && 'title' in result && result.title) {\n const titleUpdates = {\n title: result.title,\n titleGenerating: false,\n };\n updateFeature(createdFeature.id, titleUpdates);\n persistFeatureUpdate(createdFeature.id, titleUpdates);\n } else {\n // Clear generating flag even if failed or timed out\n const titleUpdates = { titleGenerating: false };\n updateFeature(createdFeature.id, titleUpdates);\n persistFeatureUpdate(createdFeature.id, titleUpdates);\n }\n })\n .catch((error) => {\n logger.error('Error generating title:', error);\n // Clear generating flag on error\n const titleUpdates = { titleGenerating: false };\n updateFeature(createdFeature.id, titleUpdates);\n persistFeatureUpdate(createdFeature.id, titleUpdates);\n });\n } else {\n // API not available — clear the flag immediately\n const titleUpdates = { titleGenerating: false };\n updateFeature(createdFeature.id, titleUpdates);\n persistFeatureUpdate(createdFeature.id, titleUpdates);\n }\n }"
}
Now let me add a client-side recovery in `use-board-features.ts`. When features are loaded from the server and still have `titleGenerating: true`, clear it since the server should have already done so. This is a defense-in-depth measure:

[timestamp:2026-02-14T21:13:35.211Z] 🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\hooks\\use-board-features.ts",
"old_string": "function summaryToFeature(\n summary: FeatureListSummary,\n projectPath?: string,\n projectName?: string\n): Feature {\n return {\n id: summary.id,\n title: summary.title,\n titleGenerating: summary.titleGenerating,",
"new_string": "function summaryToFeature(\n summary: FeatureListSummary,\n projectPath?: string,\n projectName?: string\n): Feature {\n return {\n id: summary.id,\n title: summary.title,\n // titleGenerating is a transient client-side state; if it's still true when\n // loaded from the server it means the original generation process is gone.\n // The server clears it on load, but we also clear it here as defense-in-depth.\n titleGenerating: false,"
}
Now let me verify the tests still pass. Let me run the server tests that are related to feature-loader:

[timestamp:2026-02-14T21:13:42.810Z] 🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\" && npm run test:server -- tests/unit/services/feature-loader.test.ts 2>&1 | tail -30",
"description": "Run feature-loader unit tests",
"timeout": 60000
}
All 64 tests pass. Now let me also check the `running-agents-indicator.tsx` and the `list-row.tsx` for the other places that display "checking" to see if there are similar issues:

[timestamp:2026-02-14T21:13:57.379Z] 🔧 Tool: Grep
Input: {
"pattern": "titleGenerating",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\list-view\\list-row.tsx",
"output_mode": "content",
"-C": 5
}
The list row also uses `titleGenerating` but it's purely visual (animate-pulse) — since we're clearing the flag server-side on load and adding timeout client-side, this will also be fixed.

Let me also check the `running-agents-panel.tsx` for completeness:

[timestamp:2026-02-14T21:14:06.005Z] 🔧 Tool: Grep
Input: {
"pattern": "titleGenerating",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\components\\running-agents-panel.tsx",
"output_mode": "content",
"-C": 5
}
All three display points for the "(checking...)" text will be fixed by the server-side + client-side changes. The `titleGenerating` flag will now be properly cleaned up.

Let me update the todos and verify the complete set of changes:

[timestamp:2026-02-14T21:14:14.761Z] 🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "View the context image to understand the bug",
"status": "completed",
"activeForm": "Viewing context image"
},
{
"content": "Explore how 'checking' status works in the codebase",
"status": "completed",
"activeForm": "Exploring checking status logic"
},
{
"content": "Identify the root cause of the stuck checking state",
"status": "completed",
"activeForm": "Identifying root cause"
},
{
"content": "Implement the fix",
"status": "completed",
"activeForm": "Implementing the fix"
},
{
"content": "Verify tests pass",
"status": "completed",
"activeForm": "Verifying tests pass"
}
]
}

<summary>
## Summary: Fix feature stuck on "checking..." state

### Root Cause

The `titleGenerating` flag is a transient client-side state set when a feature is created without a title. When the AI generates a title, the flag should be cleared. However, if the app is restarted/reloaded during title generation, or the API call hangs indefinitely, the `titleGenerating: true` flag persists on disk and is never cleared — causing the feature to permanently display "(checking...)" in the Running Agents panel and board views.

### Changes Implemented

1. **Server-side recovery** (`feature-loader.ts`): Clear `titleGenerating` flag when loading features from disk. This flag is transient — if it's still `true` on disk, the original generation process is no longer running and the flag is stale.

2. **Client-side timeout** (`use-board-actions.ts`): Added a 30-second timeout wrapper around the `generateTitle` API call using `Promise.race`. If the API call doesn't respond within 30 seconds, the `titleGenerating` flag is cleared. Also handles the case where the `generateTitle` API is not available at all.

3. **Client-side defense-in-depth** (`use-board-features.ts`): In `summaryToFeature()`, always set `titleGenerating: false` when converting server summaries to feature objects. Features loaded from the server should never retain the transient flag.

### Files Modified

- `apps/server/src/services/feature-loader.ts` — Clear `titleGenerating` in `getAll()` and `getAllSummaries()` when loading from disk
- `apps/ui/src/components/views/board-view/hooks/use-board-actions.ts` — Add 30s timeout to title generation, handle missing API gracefully
- `apps/ui/src/components/views/board-view/hooks/use-board-features.ts` — Always clear `titleGenerating` in `summaryToFeature()`

### Notes for Developer

- All 64 existing feature-loader tests pass
- The fix is layered: server-side clears stale flags on disk read, client-side prevents future stuck states via timeout, and summary conversion provides defense-in-depth
- The `titleGenerating` flag only remains `true` during the active in-memory title generation process within a single session — it is now properly cleared across all restart/reload scenarios
</summary>
