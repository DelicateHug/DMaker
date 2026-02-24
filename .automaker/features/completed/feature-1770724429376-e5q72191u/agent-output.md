Looking at the image, I can see the "Recently Completed" section shows entries like "Feature completed in 837s" instead of showing the actual feature title. Let me find where this text is generated.

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Find the code that renders 'Recently Completed' items",
"status": "in_progress",
"activeForm": "Finding the recently completed feature rendering code"
},
{
"content": "Update the display to show feature title instead of completion time",
"status": "pending",
"activeForm": "Updating display to show feature title"
}
]
}

🔧 Tool: Grep
Input: {
"pattern": "Feature completed in",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui",
"output_mode": "content",
"-n": true
}

🔧 Tool: Grep
Input: {
"pattern": "Recently Completed",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui",
"output_mode": "content",
"-n": true
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\running-agents-indicator.tsx",
"offset": 650,
"limit": 120
}
Interesting - the code at line 716 already shows `feature.title || 'Untitled Feature'`. So the component code looks correct. The issue must be that the `title` field is being set to something like "Feature completed in 837s" when the feature is added to the recently completed list. Let me check the store to see how recently completed features are populated.

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"offset": 895,
"limit": 30
}

🔧 Tool: Grep
Input: {
"pattern": "recentlyCompletedFeatures",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"output_mode": "content",
"-n": true
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"offset": 4195,
"limit": 80
}
Now let me find where `addRecentlyCompletedFeature` is called to see what `title` is being passed in.

🔧 Tool: Grep
Input: {
"pattern": "addRecentlyCompletedFeature",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src",
"output_mode": "content",
"-n": true
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-auto-mode.ts",
"offset": 185,
"limit": 40
}
Found the issue. On line 209, the title is set from `event.message`, which contains the "Feature completed in Xs" text. It should use the feature's actual title instead. Let me check what data is available in the event and how to get the actual feature title.

🔧 Tool: Grep
Input: {
"pattern": "auto_mode_feature_complete",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src",
"output_mode": "content",
"-n": true
}

🔧 Tool: Grep
Input: {
"pattern": "auto_mode_feature_complete",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\libs\\types\\src",
"output_mode": "content",
"-n": true
}
Let me check a couple of the event emissions to see what data they include:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 780,
"limit": 30
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1125,
"limit": 20
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1620,
"limit": 20
}
Now I understand the full picture. The server sends `auto_mode_feature_complete` events with a `message` like "Feature completed in 837s", and the client code at line 209 in `use-auto-mode.ts` uses `event.message` as the title. The event doesn't include the feature title.

Let me check what events look like and if the feature title is available in the event, or if there's another way to get it on the client side. Let me check what `event` properties are available and what features data is accessible in the hook:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-auto-mode.ts",
"offset": 1,
"limit": 100
}
Now let me check the event type to see if `featureTitle` is available:

🔧 Tool: Grep
Input: {
"pattern": "AutoModeEvent",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\types",
"output_mode": "content",
"-n": true,
"-C": 5
}

🔧 Tool: Grep
Input: {
"pattern": "auto_mode_feature_complete",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\types\\electron.d.ts",
"output_mode": "content",
"-n": true,
"-A": 15
}
Now let me also check the event type in `libs/types`:

🔧 Tool: Grep
Input: {
"pattern": "auto_mode_feature_complete",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\libs\\types\\src\\event.ts",
"output_mode": "content",
"-n": true,
"-A": 10
}
Now I have a clear picture. There are two approaches:

1. **Server-side**: Add a `featureTitle` field to the `auto_mode_feature_complete` event
2. **Client-side**: Look up the feature title from the store when the event is received

The cleanest approach is to add the feature title to the event from the server (since it already has the feature object), and also use it on the client. Let me check what data the server has when emitting:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 760,
"limit": 50
}
The server has `feature` (and therefore `feature.title`) in scope. However, the simplest and most robust fix is on the client side - the client already has feature data available through the store. But actually, looking more carefully, the `use-auto-mode` hook doesn't have direct access to the features list.

The better approach is to add `featureTitle` to the server events. But that's more changes. Let me think about which is simplest...

Actually, the simplest approach: the client already receives `auto_mode_feature_start` events which likely contain the feature title. Let me check:

🔧 Tool: Grep
Input: {
"pattern": "auto_mode_feature_start",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\types\\electron.d.ts",
"output_mode": "content",
"-n": true,
"-A": 10
}
The simplest and most reliable fix: add a `featureTitle` field to the `auto_mode_feature_complete` events from the server. The server already has access to the feature object with its title. Then use it on the client side. Let me also check all the emission sites to understand what `feature` variable is available:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1280,
"limit": 30
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1530,
"limit": 20
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1695,
"limit": 20
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1818,
"limit": 20
}
Now I need to understand the context around each emission to see if `feature` is in scope. Let me check the function signatures to determine this:

🔧 Tool: Grep
Input: {
"pattern": "feature\\.title",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"output_mode": "content",
"-n": true
}
Good - `feature` is available in most contexts. Now let me look at the approach. The best solution is two-fold:

1. Add `featureTitle` to the server's `auto_mode_feature_complete` events
2. Use `event.featureTitle` on the client instead of `event.message` for the recently completed title

Let me check how `emitAutoModeEvent` works to understand the event payload structure:

🔧 Tool: Grep
Input: {
"pattern": "emitAutoModeEvent",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"output_mode": "content",
"-n": true,
"head_limit": 5
}

🔧 Tool: Grep
Input: {
"pattern": "private emitAutoModeEvent|emitAutoModeEvent\\(type\"",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"output_mode": "content",
"-n": true,
"-A": 5
}
The event is just an untyped `Record<string, unknown>` passed through. So adding `featureTitle` to the server side is straightforward - just include it in the data object. The client will receive it as part of the event.

Now let me implement the fix. The approach:

1. **Server**: Add `featureTitle` to each `auto_mode_feature_complete` emission (where `feature` is available)
2. **Client type**: Add `featureTitle?: string` to the `auto_mode_feature_complete` event type
3. **Client hook**: Use `event.featureTitle` instead of `event.message` for the recently completed title

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Find the code that renders 'Recently Completed' items",
"status": "completed",
"activeForm": "Finding the recently completed feature rendering code"
},
{
"content": "Add featureTitle to server auto_mode_feature_complete events",
"status": "in_progress",
"activeForm": "Adding featureTitle to server events"
},
{
"content": "Update client type definition for auto_mode_feature_complete",
"status": "pending",
"activeForm": "Updating client type definition"
},
{
"content": "Update use-auto-mode hook to use featureTitle for display",
"status": "pending",
"activeForm": "Updating hook to use featureTitle"
}
]
}
Let me look at all the `auto_mode_feature_complete` emissions and their surrounding context more carefully to determine which ones have `feature` in scope:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 680,
"limit": 15
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1500,
"limit": 10
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1680,
"limit": 10
}
Good - `feature` is available in context for most emissions. For the commit one (line 1705), the `feature` variable might be null. Let me check that code path:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1686,
"limit": 30
}
Now let me check the context around the other emissions to see what `feature` variables are available. Let me look for the function that contains the main one at line 787:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 620,
"limit": 10
}
Let me find the function definition that contains the main emission at line 787:

🔧 Tool: Grep
Input: {
"pattern": "async.*executeFeature|private.*executeFeature\"",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"output_mode": "content",
"-n": true
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 549,
"limit": 20
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 570,
"limit": 50
}
`feature` is loaded at line 610 and available throughout the `executeFeature` method. Now I have all the context I need. Let me now check one more emission site - the one around line 1827 (project analysis):

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1780,
"limit": 60
}
This is a project analysis emission - no `feature` object, but it has a hardcoded "Project analysis completed" message which is fine as the title. Now let me also check the function at ~1240 for the pipeline resume:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1200,
"limit": 15
}
Good, `feature` is in scope for the pipeline resume context too. Now let me also check the `handleFollowUp` function context around line 1540:

🔧 Tool: Grep
Input: {
"pattern": "async.*handleFollowUp|private.*handleFollowUp\"",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"output_mode": "content",
"-n": true
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1440,
"limit": 20
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1400,
"limit": 20
}
Let me find the method signature for this follow-up function:

🔧 Tool: Grep
Input: {
"pattern": "followUp.*feature.*projectPath|executeFollowUp|runFollowUp\"",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"output_mode": "content",
"-n": true
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1340,
"limit": 30
}
Good. `feature` is in scope at line 1342 for the follow-up flow too.

Now I have all the information I need. Let me implement the changes. The strategy:

1. Add `featureTitle` to all `auto_mode_feature_complete` emissions in the server where `feature` is available
2. Add `featureTitle?: string` to the client type
3. On the client, use `event.featureTitle` instead of `event.message` for the title

Let me start with the server changes:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"old_string": " this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n passes: true,\n message: `Feature completed in ${Math.round(\n          (Date.now() - tempRunningFeature.startTime) / 1000\n        )}s${finalStatus === 'verified' ? ' - auto-verified' : ''}`,\n projectPath,\n model: tempRunningFeature.model,\n provider: tempRunningFeature.provider,\n });",
"new_string": " this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n featureTitle: feature.title || '',\n passes: true,\n message: `Feature completed in ${Math.round(\n          (Date.now() - tempRunningFeature.startTime) / 1000\n        )}s${finalStatus === 'verified' ? ' - auto-verified' : ''}`,\n projectPath,\n model: tempRunningFeature.model,\n provider: tempRunningFeature.provider,\n });"
}
Now the abort case at line ~804:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 800,
"limit": 15
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"old_string": " if (errorInfo.isAbort) {\n this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n passes: false,\n message: 'Feature stopped by user',\n projectPath,\n });",
"new_string": " if (errorInfo.isAbort) {\n this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n featureTitle: feature.title || '',\n passes: false,\n message: 'Feature stopped by user',\n projectPath,\n });"
}
Now the pipeline step missing case at ~1133:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1130,
"limit": 15
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"old_string": " this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n passes: true,\n message:\n 'Pipeline step no longer exists - feature completed without remaining pipeline steps',\n projectPath,\n });",
"new_string": " this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n featureTitle: feature.title || '',\n passes: true,\n message:\n 'Pipeline step no longer exists - feature completed without remaining pipeline steps',\n projectPath,\n });"
}
Now the pipeline resume success at ~1290:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1288,
"limit": 25
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"old_string": " this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n passes: true,\n message: 'Pipeline resumed and completed successfully',\n projectPath,\n });\n\n // Trigger auto-deploy if enabled for this feature\n await this.triggerAutoDeployIfEnabled(projectPath, feature);\n } catch (error) {\n const errorInfo = classifyError(error);\n\n if (errorInfo.isAbort) {\n this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n passes: false,\n message: 'Pipeline resume stopped by user',\n projectPath,\n });",
"new_string": " this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n featureTitle: feature.title || '',\n passes: true,\n message: 'Pipeline resumed and completed successfully',\n projectPath,\n });\n\n // Trigger auto-deploy if enabled for this feature\n await this.triggerAutoDeployIfEnabled(projectPath, feature);\n } catch (error) {\n const errorInfo = classifyError(error);\n\n if (errorInfo.isAbort) {\n this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n featureTitle: feature.title || '',\n passes: false,\n message: 'Pipeline resume stopped by user',\n projectPath,\n });"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1288,
"limit": 25
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"old_string": " this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n passes: true,\n message: 'Pipeline resumed and completed successfully',\n projectPath,\n });\n\n // Trigger auto-deploy if enabled for this feature\n await this.triggerAutoDeployIfEnabled(projectPath, feature);\n } catch (error) {\n const errorInfo = classifyError(error);\n\n if (errorInfo.isAbort) {\n this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n passes: false,\n message: 'Pipeline resume stopped by user',\n projectPath,\n });",
"new_string": " this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n featureTitle: feature.title || '',\n passes: true,\n message: 'Pipeline resumed and completed successfully',\n projectPath,\n });\n\n // Trigger auto-deploy if enabled for this feature\n await this.triggerAutoDeployIfEnabled(projectPath, feature);\n } catch (error) {\n const errorInfo = classifyError(error);\n\n if (errorInfo.isAbort) {\n this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n featureTitle: feature.title || '',\n passes: false,\n message: 'Pipeline resume stopped by user',\n projectPath,\n });"
}
Now the follow-up completion at ~1542:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1540,
"limit": 15
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"old_string": " this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n passes: true,\n message: `Follow-up completed successfully${finalStatus === 'verified' ? ' - auto-verified' : ''}`,\n projectPath,\n model,\n provider,\n });",
"new_string": " this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n featureTitle: feature?.title || '',\n passes: true,\n message: `Follow-up completed successfully${finalStatus === 'verified' ? ' - auto-verified' : ''}`,\n projectPath,\n model,\n provider,\n });"
}
Now the verification result at ~1633:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1596,
"limit": 50
}
Let me find the method signature for this verification method to see if it has a `feature` in scope:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1575,
"limit": 15
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1587,
"limit": 10
}
This `verifyFeature` method doesn't have a `feature` object - it only receives `projectPath` and `featureId`. I can load the feature to get the title here:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"old_string": " async verifyFeature(projectPath: string, featureId: string): Promise<boolean> {\n // Worktrees are in project dir\n const worktreePath = path.join(projectPath, '.worktrees', featureId);\n let workDir = projectPath;",
"new_string": " async verifyFeature(projectPath: string, featureId: string): Promise<boolean> {\n // Load feature for title\n const feature = await this.loadFeature(projectPath, featureId);\n\n // Worktrees are in project dir\n const worktreePath = path.join(projectPath, '.worktrees', featureId);\n let workDir = projectPath;"
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"old_string": " this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n passes: allPassed,\n message: allPassed\n ? 'All verification checks passed'\n : `Verification failed: ${results.find((r) => !r.passed)?.check || 'Unknown'}`,\n projectPath,\n });",
"new_string": " this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n featureTitle: feature?.title || '',\n passes: allPassed,\n message: allPassed\n ? 'All verification checks passed'\n : `Verification failed: ${results.find((r) => !r.passed)?.check || 'Unknown'}`,\n projectPath,\n });"
}
Now the commit one at ~1710:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1707,
"limit": 10
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1715,
"limit": 8
}
This method has `feature` available (loaded at line ~1697). Let me add it:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"old_string": " this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n passes: true,\n message: `Changes committed: ${hash.trim().substring(0, 8)}`,\n projectPath,\n });",
"new_string": " this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId,\n featureTitle: feature?.title || '',\n passes: true,\n message: `Changes committed: ${hash.trim().substring(0, 8)}`,\n projectPath,\n });"
}
Now the project analysis one at ~1837:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"offset": 1835,
"limit": 10
}
This is a project analysis (not a regular feature), so there's no feature title to include. I'll use the message as the title here:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"old_string": " this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId: analysisFeatureId,\n passes: true,\n message: 'Project analysis completed',\n projectPath,\n });",
"new_string": " this.emitAutoModeEvent('auto_mode_feature_complete', {\n featureId: analysisFeatureId,\n featureTitle: 'Project analysis',\n passes: true,\n message: 'Project analysis completed',\n projectPath,\n });"
}
Now let me update the client-side type definition:

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Find the code that renders 'Recently Completed' items",
"status": "completed",
"activeForm": "Finding the recently completed feature rendering code"
},
{
"content": "Add featureTitle to server auto_mode_feature_complete events",
"status": "completed",
"activeForm": "Adding featureTitle to server events"
},
{
"content": "Update client type definition for auto_mode_feature_complete",
"status": "in_progress",
"activeForm": "Updating client type definition"
},
{
"content": "Update use-auto-mode hook to use featureTitle for display",
"status": "pending",
"activeForm": "Updating hook to use featureTitle"
}
]
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\types\\electron.d.ts",
"offset": 193,
"limit": 10
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\types\\electron.d.ts",
"old_string": " type: 'auto_mode_feature_complete';\n featureId: string;\n projectId?: string;\n projectPath?: string;\n passes: boolean;\n message: string;",
"new_string": " type: 'auto_mode_feature_complete';\n featureId: string;\n featureTitle?: string;\n projectId?: string;\n projectPath?: string;\n passes: boolean;\n message: string;"
}

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Find the code that renders 'Recently Completed' items",
"status": "completed",
"activeForm": "Finding the recently completed feature rendering code"
},
{
"content": "Add featureTitle to server auto_mode_feature_complete events",
"status": "completed",
"activeForm": "Adding featureTitle to server events"
},
{
"content": "Update client type definition for auto_mode_feature_complete",
"status": "completed",
"activeForm": "Updating client type definition"
},
{
"content": "Update use-auto-mode hook to use featureTitle for display",
"status": "in_progress",
"activeForm": "Updating hook to use featureTitle"
}
]
}
Now update the client hook to use `featureTitle` instead of `event.message`:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-auto-mode.ts",
"offset": 200,
"limit": 15
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-auto-mode.ts",
"old_string": " title: event.message || 'Untitled Feature',",
"new_string": " title: event.featureTitle || 'Untitled Feature',"
}

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Find the code that renders 'Recently Completed' items",
"status": "completed",
"activeForm": "Finding the recently completed feature rendering code"
},
{
"content": "Add featureTitle to server auto_mode_feature_complete events",
"status": "completed",
"activeForm": "Adding featureTitle to server events"
},
{
"content": "Update client type definition for auto_mode_feature_complete",
"status": "completed",
"activeForm": "Updating client type definition"
},
{
"content": "Update use-auto-mode hook to use featureTitle for display",
"status": "completed",
"activeForm": "Updating hook to use featureTitle"
}
]
}
Now let me verify the changes are correct by checking if there are any other places where `auto_mode_feature_complete` events are emitted that I might have missed:

🔧 Tool: Grep
Input: {
"pattern": "auto_mode_feature_complete",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"output_mode": "content",
"-n": true
}
Let me verify each one has `featureTitle`:

🔧 Tool: Grep
Input: {
"pattern": "featureTitle",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\auto-mode-service.ts",
"output_mode": "content",
"-n": true
}
All 9 emission sites now include `featureTitle`. Let me also verify the rendering component is still properly showing the title (it was already using `feature.title` from the store, just the data was wrong):

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\running-agents-indicator.tsx",
"offset": 713,
"limit": 10
}
The rendering component at line 716 already correctly uses `feature.title`. The problem was only that the wrong value ("Feature completed in Xs") was being stored as `title` from the event's `message` field. Now it uses `event.featureTitle` which is the actual feature title.

Let me also check if there's a WebSocket-based event path that might also need the type update (for the web/non-electron flow):

🔧 Tool: Grep
Input: {
"pattern": "auto_mode_feature_complete",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src",
"output_mode": "content",
"-n": true
}
Let me check the `electron.ts` events too - these look like mock/emulation events for non-electron contexts:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"offset": 2135,
"limit": 15
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"offset": 2310,
"limit": 15
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"offset": 2382,
"limit": 15
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"offset": 2525,
"limit": 15
}
These are mock/emulation events used in the web dev mode. Let me check context around line 2529 to see if there's a feature title available:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"offset": 2470,
"limit": 20
}
Let me find the function signature:

🔧 Tool: Grep
Input: {
"pattern": "async function simulateFeatureExecution|function simulateFeatureExecution\"",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"output_mode": "content",
"-n": true
}

🔧 Tool: Grep
Input: {
"pattern": "simulateFeature\"",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"output_mode": "content",
"-n": true
}

🔧 Tool: Grep
Input: {
"pattern": "mockFeature\"",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"output_mode": "content",
"-n": true
}

🔧 Tool: Grep
Input: {
"pattern": "mockFeature",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"output_mode": "content",
"-n": true
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"offset": 2430,
"limit": 20
}
Good - `mockFeature` is available. Let me update the mock events in `electron.ts` too. These are used in development/testing mode:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"old_string": " emitAutoModeEvent({\n type: 'auto_mode_feature_complete',\n featureId,\n passes: false,\n message: 'Feature stopped by user',\n });",
"new_string": " emitAutoModeEvent({\n type: 'auto_mode_feature_complete',\n featureId,\n featureTitle: mockRunningFeatures.get(featureId) || '',\n passes: false,\n message: 'Feature stopped by user',\n });"
}
Let me check what `mockRunningFeatures` stores - it might just be a Set, not a Map with title:

🔧 Tool: Grep
Input: {
"pattern": "mockRunningFeatures",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"output_mode": "content",
"-n": true,
"head_limit": 5
}
It's a `Set<string>`, not a Map. Let me revert that change since we can't get the title from it. For mock events, I'll just use a placeholder:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"offset": 2138,
"limit": 12
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"old_string": " featureTitle: mockRunningFeatures.get(featureId) || '',",
"new_string": " featureTitle: 'Sample Feature',"
}
Now update the other mock events:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"offset": 2314,
"limit": 8
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"old_string": " emitAutoModeEvent({\n type: 'auto_mode_feature_complete',\n featureId: analysisId,\n passes: true,\n message: 'Project analyzed successfully',\n });",
"new_string": " emitAutoModeEvent({\n type: 'auto_mode_feature_complete',\n featureId: analysisId,\n featureTitle: 'Project analysis',\n passes: true,\n message: 'Project analyzed successfully',\n });"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"offset": 2386,
"limit": 10
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"old_string": " emitAutoModeEvent({\n type: 'auto_mode_feature_complete',\n featureId,\n passes: true,\n message: 'Changes committed successfully',\n });",
"new_string": " emitAutoModeEvent({\n type: 'auto_mode_feature_complete',\n featureId,\n featureTitle: 'Sample Feature',\n passes: true,\n message: 'Changes committed successfully',\n });"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"offset": 2528,
"limit": 10
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"old_string": " // Feature complete\n emitAutoModeEvent({\n type: 'auto_mode_feature_complete',\n featureId,\n passes: true,\n message: 'Feature implemented successfully',\n });",
"new_string": " // Feature complete\n emitAutoModeEvent({\n type: 'auto_mode_feature_complete',\n featureId,\n featureTitle: mockFeature.description,\n passes: true,\n message: 'Feature implemented successfully',\n });"
}
Now let me verify all changes are consistent. Let me also check if `emitAutoModeEvent` is typed and might reject the new field:

🔧 Tool: Grep
Input: {
"pattern": "function emitAutoModeEvent",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"output_mode": "content",
"-n": true,
"-A": 5
}
It uses `AutoModeEvent` type. Since I already added `featureTitle?: string` to the type definition, this should type-check correctly.

Let me also check if there's a second definition of `emitAutoModeEvent`:

🔧 Tool: Grep
Input: {
"pattern": "emitAutoModeEvent",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"output_mode": "content",
"-n": true,
"head_limit": 3
}
Wait, there's another one at 2226. Let me check:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\lib\\electron.ts",
"offset": 2222,
"limit": 25
}
Those are `auto_mode_feature_start` and `auto_mode_phase` events, not `auto_mode_feature_complete`. All good.

Let me now also check if there's a WebSocket-based event handler in the board-view or elsewhere that also processes `auto_mode_feature_complete`:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\hooks\\use-board-features.ts",
"offset": 300,
"limit": 15
}
This just reloads features and plays a sound - doesn't use `featureTitle`, so no changes needed.

Let me check the board-view.tsx handler:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx",
"offset": 1193,
"limit": 15
}
No title usage here. And the agent-output-modal:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\dialogs\\agent-output-modal.tsx",
"offset": 293,
"limit": 15
}
This uses `event.message` for the agent output modal log, which is fine - that's a different context where the completion message (with timing info) is appropriate.

All changes are complete. Let me do a final review of all the modifications:

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" && git diff --stat",
"description": "Check git diff stats"
}
There are a lot of pre-existing changes. Let me verify my specific changes are correct by checking only the files I modified:

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" && git diff apps/server/src/services/auto-mode-service.ts | head -200",
"description": "Check auto-mode-service changes"
}

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" && git diff apps/server/src/services/auto-mode-service.ts | grep \"featureTitle\" ",
"description": "Verify featureTitle additions"
}
All 9 emission sites have `featureTitle` added. Let me verify the client-side changes:

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" && git diff apps/ui/src/hooks/use-auto-mode.ts | grep -A2 -B2 \"featureTitle\"",
"description": "Verify client hook changes"
}

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" && git diff apps/ui/src/types/electron.d.ts | grep -A2 -B2 \"featureTitle\"",
"description": "Verify type definition changes"
}

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" && git diff apps/ui/src/lib/electron.ts | grep -A2 -B2 \"featureTitle\"",
"description": "Verify mock event changes"
}
All changes look correct. Let me verify the build passes for the type changes:

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" && npx tsc --noEmit --project apps/ui/tsconfig.json 2>&1 | head -30",
"description": "Type-check UI changes",
"timeout": 60000
}

🔧 Tool: TaskOutput
Input: {
"task_id": "b75ea7e",
"block": true,
"timeout": 120000
}
The errors are all pre-existing (missing module declarations for `@dmaker/types`, `@dmaker/utils/logger`, etc.), not related to my changes. These are workspace build order issues -- the shared packages haven't been built. My changes don't introduce any new type errors.

<summary>
## Summary: Show feature title instead of completion time in Recently Completed

### Changes Implemented

- Added `featureTitle` field to all `auto_mode_feature_complete` event emissions on the server, carrying the actual feature title from the feature object
- Updated the client-side `AutoModeEvent` type to include the optional `featureTitle` field
- Changed `use-auto-mode.ts` to use `event.featureTitle` instead of `event.message` when populating the "Recently Completed" feature notification title
- Updated mock event emissions in `electron.ts` to include `featureTitle` for consistency in dev mode

### Root Cause

The "Recently Completed" panel was displaying "Feature completed in 837s" because the code at `use-auto-mode.ts:209` used `event.message` (which contains the completion timing info) as the feature title. The actual feature title was never included in the event payload.

### Files Modified

- `apps/server/src/services/auto-mode-service.ts` - Added `featureTitle` to all 9 `auto_mode_feature_complete` event emissions
- `apps/ui/src/types/electron.d.ts` - Added `featureTitle?: string` to the `auto_mode_feature_complete` event type
- `apps/ui/src/hooks/use-auto-mode.ts` - Changed from `event.message` to `event.featureTitle` for the recently completed feature title
- `apps/ui/src/lib/electron.ts` - Added `featureTitle` to 4 mock event emissions for dev mode

### Notes for Developer

- The `event.message` field still contains the completion details (timing, status, etc.) and is still used in the agent output modal log view (`agent-output-modal.tsx:298`), which is the appropriate place for that info
- The rendering component (`running-agents-indicator.tsx:716`) was already correctly using `feature.title` -- the issue was only in the data source
- The `featureTitle` field is optional (`?`) for backward compatibility; the fallback is `'Untitled Feature'`
</summary>
