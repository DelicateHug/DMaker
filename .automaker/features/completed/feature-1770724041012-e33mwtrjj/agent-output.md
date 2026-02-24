I'll start by examining the image and exploring the codebase to understand the current structure of the auto mode configuration and board actions.

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\.dmaker\\features\\feature-1770724041012-e33mwtrjj\\images\\pasted-image-2026-02-10T11-47-05-839Z-1770724025854.png"
}

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore codebase to understand auto-mode modal and board actions structure",
"status": "in_progress",
"activeForm": "Exploring codebase structure"
},
{
"content": "Plan implementation approach for moving max concurrent agents",
"status": "pending",
"activeForm": "Planning implementation approach"
},
{
"content": "Move max concurrent agents slider from auto-mode modal to board actions",
"status": "pending",
"activeForm": "Moving max concurrent agents control"
},
{
"content": "Clean up auto-mode modal after removing the slider",
"status": "pending",
"activeForm": "Cleaning up auto-mode modal"
},
{
"content": "Verify the changes compile correctly",
"status": "pending",
"activeForm": "Verifying changes compile"
}
]
}

🔧 Tool: Task
Input: {
"description": "Explore auto-mode and board actions",
"prompt": "I need to understand the structure of two UI components in this codebase:\n\n1. The \"Auto Mode Configuration\" modal/dialog - which currently contains a \"Max concurrent agents\" slider\n2. The \"Board Actions\" area - where the max concurrent agents slider should be moved to\n\nPlease find and read the following:\n- The auto-mode modal/dialog component (likely in apps/ui/src/components/dialogs/auto-mode-modal.tsx)\n- The board header / board actions components (likely in apps/ui/src/components/views/board-view/)\n- Any hooks related to auto-mode (apps/ui/src/hooks/use-auto-mode.ts)\n- The board header component (apps/ui/src/components/views/board-view/board-header.tsx)\n\nFor each file, provide the FULL content. I need to see every line of code.",
"subagent_type": "Explore"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\dialogs\\auto-mode-modal.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-auto-mode.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\board-header.tsx"
}

🔧 Tool: Glob
Input: {
"pattern": "apps/ui/src/components/views/board-view/board-\*.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\board-controls.tsx"
}

🔧 Tool: Glob
Input: {
"pattern": "apps/ui/src/components/views/board-view/\*.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\kanban-board.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\header-mobile-menu.tsx"
}
Now let me look at the specific board header component in detail to understand the layout, and also examine the app store for max concurrency state:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\board-header.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\dialogs\\auto-mode-modal.tsx"
}
Now let me look at where the board header is used and how the max concurrency flows through:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\header-mobile-menu.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx",
"limit": 100
}
Let me see more of the board-view.tsx to understand how the BoardHeader is used and how maxConcurrency is passed:

🔧 Tool: Grep
Input: {
"pattern": "BoardHeader|maxConcurrency|onConcurrencyChange|board-header",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx",
"output_mode": "content"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx"
}
Now I have a clear picture. The "Board Actions" section is inside the `ToolsButton` component in `top-nav-bar.tsx`. Currently, the Auto Mode collapsible section in Board Actions just shows a "Configure" button that opens the AutoModeModal. The feature request is to move the "Max concurrent agents" slider from inside the AutoModeModal to the Board Actions section (specifically under the Auto Mode collapsible).

Let me now check the app store for `maxConcurrency` to understand how it's managed:

🔧 Tool: Grep
Input: {
"pattern": "maxConcurrency|setMaxConcurrency",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"output_mode": "content",
"-n": true
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\board-controls-store.ts"
}
Now I have a comprehensive understanding. Let me update my plan and start implementing:

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore codebase to understand auto-mode modal and board actions structure",
"status": "completed",
"activeForm": "Exploring codebase structure"
},
{
"content": "Add max concurrent agents slider to Board Actions (Auto Mode collapsible) in top-nav-bar.tsx",
"status": "in_progress",
"activeForm": "Adding slider to Board Actions in top-nav-bar.tsx"
},
{
"content": "Remove per-project max agents slider from auto-mode-modal.tsx",
"status": "pending",
"activeForm": "Removing slider from auto-mode modal"
},
{
"content": "Verify the changes compile correctly",
"status": "pending",
"activeForm": "Verifying changes compile"
}
]
}
Now I understand the architecture clearly. Here's what needs to happen:

1. **In `top-nav-bar.tsx`**: Add a max concurrent agents slider to the "Auto Mode" collapsible section under "Board Actions" in the ToolsButton. The `boardControls` already has `maxConcurrency` and `onConcurrencyChange` available.

2. **In `auto-mode-modal.tsx`**: The per-project "Max agents" slider should be removed from the modal since it's moving to board actions.

Let me implement the changes:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx",
"old_string": "import { useState, useCallback, useMemo, useEffect } from 'react';\nimport { useNavigate, useLocation } from '@tanstack/react-router';\nimport { Folder, ChevronDown, ChevronRight, Check, LucideIcon, Layers, Github, CircleDot, GitPullRequest, GitBranch, Wrench, Lightbulb, FileText, Brain, Terminal, Settings, Menu, X, Plus, RefreshCw, PanelTop, Settings2, Archive, Zap, Wand2, ClipboardCheck } from 'lucide-react';",
"new_string": "import { useState, useCallback, useMemo, useEffect } from 'react';\nimport { useNavigate, useLocation } from '@tanstack/react-router';\nimport { Folder, ChevronDown, ChevronRight, Check, LucideIcon, Layers, Github, CircleDot, GitPullRequest, GitBranch, Wrench, Lightbulb, FileText, Brain, Terminal, Settings, Menu, X, Plus, RefreshCw, PanelTop, Settings2, Archive, Zap, Wand2, ClipboardCheck, Bot } from 'lucide-react';"
}
Now I need to add the Slider import:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx",
"old_string": "import { Button } from '@/components/ui/button';\nimport { Switch } from '@/components/ui/switch';\nimport { Label } from '@/components/ui/label';",
"new_string": "import { Button } from '@/components/ui/button';\nimport { Slider } from '@/components/ui/slider';\nimport { Switch } from '@/components/ui/switch';\nimport { Label } from '@/components/ui/label';"
}
Now let me add `maxConcurrency` and `onConcurrencyChange` to the `ExtendedToolsButtonProps` boardControls interface (which is what the ToolsButton receives):

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx",
"old_string": "// Extended ToolsButton props to include board actions\ninterface ExtendedToolsButtonProps extends ToolsButtonProps {\n boardControls?: {\n onShowCompletedModal: () => void;\n completedCount: number;\n isAutoModeRunning: boolean;\n runningAgentsCount: number;\n onAutoModeModalOpenChange: (open: boolean) => void;\n onOpenPlanDialog: () => void;\n hasPendingPlan: boolean;\n onOpenPendingPlan?: () => void;\n isMounted: boolean;\n } | null;",
"new_string": "// Extended ToolsButton props to include board actions\ninterface ExtendedToolsButtonProps extends ToolsButtonProps {\n boardControls?: {\n onShowCompletedModal: () => void;\n completedCount: number;\n isAutoModeRunning: boolean;\n runningAgentsCount: number;\n maxConcurrency: number;\n onConcurrencyChange: (value: number) => void;\n onAutoModeModalOpenChange: (open: boolean) => void;\n onOpenPlanDialog: () => void;\n hasPendingPlan: boolean;\n onOpenPendingPlan?: () => void;\n isMounted: boolean;\n } | null;"
}
Now let me update the Auto Mode collapsible section in the ToolsButton to include the max concurrent agents slider:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx",
"old_string": " <CollapsibleContent>\n <div className=\"ml-6 px-2 py-2 space-y-2\">\n <p className=\"text-xs text-muted-foreground\">\n {boardControls.isAutoModeRunning\n ? `Running with ${boardControls.runningAgentsCount} active agent${boardControls.runningAgentsCount === 1 ? '' : 's'}`\n : 'Automatically processes features from backlog'}\n </p>\n <Button\n onClick={() => {\n boardControls.onAutoModeModalOpenChange(true);\n setOpen(false);\n }}\n size=\"sm\"\n variant=\"secondary\"\n className=\"w-full\"\n >\n Configure\n </Button>\n </div>\n </CollapsibleContent>\n </Collapsible>",
"new_string": " <CollapsibleContent>\n <div className=\"ml-6 px-2 py-2 space-y-3\">\n <p className=\"text-xs text-muted-foreground\">\n {boardControls.isAutoModeRunning\n ? `Running with ${boardControls.runningAgentsCount} active agent${boardControls.runningAgentsCount === 1 ? '' : 's'}`\n : 'Automatically processes features from backlog'}\n </p>\n {/_ Max Concurrent Agents Slider _/}\n <div\n className=\"p-2.5 rounded-md border border-border/50 bg-muted/30\"\n data-testid=\"board-actions-concurrency-control\"\n >\n <div className=\"flex items-center gap-2 mb-2\">\n <Bot className=\"w-3.5 h-3.5 text-muted-foreground\" />\n <span className=\"text-xs font-medium\">Max Agents</span>\n <span className=\"text-xs text-muted-foreground ml-auto\" data-testid=\"board-actions-concurrency-value\">\n {boardControls.runningAgentsCount}/{boardControls.maxConcurrency}\n </span>\n </div>\n <Slider\n value={[boardControls.maxConcurrency]}\n onValueChange={(value) => boardControls.onConcurrencyChange(value[0])}\n min={1}\n max={10}\n step={1}\n className=\"w-full\"\n data-testid=\"board-actions-concurrency-slider\"\n />\n </div>\n <Button\n onClick={() => {\n boardControls.onAutoModeModalOpenChange(true);\n setOpen(false);\n }}\n size=\"sm\"\n variant=\"secondary\"\n className=\"w-full\"\n >\n Configure\n </Button>\n </div>\n </CollapsibleContent>\n </Collapsible>"
}

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore codebase to understand auto-mode modal and board actions structure",
"status": "completed",
"activeForm": "Exploring codebase structure"
},
{
"content": "Add max concurrent agents slider to Board Actions (Auto Mode collapsible) in top-nav-bar.tsx",
"status": "completed",
"activeForm": "Adding slider to Board Actions in top-nav-bar.tsx"
},
{
"content": "Remove per-project max agents slider from auto-mode-modal.tsx",
"status": "in_progress",
"activeForm": "Removing slider from auto-mode modal"
},
{
"content": "Verify the changes compile correctly",
"status": "pending",
"activeForm": "Verifying changes compile"
}
]
}
Now let me remove the per-project max agents slider from the auto-mode modal. Looking at the image and the feature request, the "Max agents" slider per project inside the AutoModeModal should be removed since it's now accessible from Board Actions:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\dialogs\\auto-mode-modal.tsx",
"old_string": " {/_ Per-project settings (shown when selected) _/}\n {isSelected && (\n <div className=\"px-3 pb-2 pt-1 border-t border-border/50 space-y-2\">\n {/_ Max agents slider _/}\n <div className=\"flex items-center gap-3\">\n <Bot className=\"w-3.5 h-3.5 text-muted-foreground shrink-0\" />\n <span className=\"text-xs text-muted-foreground whitespace-nowrap\">\n Max agents:\n </span>\n <Slider\n value={[config.maxAgents]}\n onValueChange={(value) =>\n handleProjectMaxAgentsChange(project.id, value[0])\n }\n min={1}\n max={10}\n step={1}\n className=\"flex-1\"\n onClick={(e) => e.stopPropagation()}\n data-testid={`max-agents-slider-${project.id}`}\n />\n <span className=\"text-xs font-medium min-w-[1.5ch] text-right\">\n {config.maxAgents}\n </span>\n </div>\n {/_ Require verification toggle _/}\n <div\n className=\"flex items-center gap-3 cursor-pointer\"\n onClick={(e) => {\n e.stopPropagation();\n handleProjectVerificationToggle(project.id);\n }}\n >\n <ShieldCheck className=\"w-3.5 h-3.5 text-muted-foreground shrink-0\" />\n <span className=\"text-xs text-muted-foreground flex-1\">\n Require verification\n </span>\n <Switch\n checked={config.requireVerification}\n onCheckedChange={() => handleProjectVerificationToggle(project.id)}\n onClick={(e) => e.stopPropagation()}\n className=\"scale-75 origin-right\"\n data-testid={`require-verification-toggle-${project.id}`}\n />\n </div>\n </div>\n )}",
"new_string": " {/_ Per-project settings (shown when selected) _/}\n {isSelected && (\n <div className=\"px-3 pb-2 pt-1 border-t border-border/50 space-y-2\">\n {/_ Require verification toggle _/}\n <div\n className=\"flex items-center gap-3 cursor-pointer\"\n onClick={(e) => {\n e.stopPropagation();\n handleProjectVerificationToggle(project.id);\n }}\n >\n <ShieldCheck className=\"w-3.5 h-3.5 text-muted-foreground shrink-0\" />\n <span className=\"text-xs text-muted-foreground flex-1\">\n Require verification\n </span>\n <Switch\n checked={config.requireVerification}\n onCheckedChange={() => handleProjectVerificationToggle(project.id)}\n onClick={(e) => e.stopPropagation()}\n className=\"scale-75 origin-right\"\n data-testid={`require-verification-toggle-${project.id}`}\n />\n </div>\n </div>\n )}"
}
Now let me also remove the "Agent Summary" section from the auto-mode modal since the max agents info is now shown in board actions. Actually, let me reconsider - the Agent Summary shows total running/max across all selected projects. That's still useful information in the modal. But the description says "Configure max agents per project above" which no longer applies. Let me update that text:

🔧 Tool: Edit
Input: {
"file*path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\dialogs\\auto-mode-modal.tsx",
"old_string": " {/* Max Agents Info */}\n {selectedProjectIds.size > 0 && (\n <div className=\"p-3 rounded-lg bg-secondary/50\">\n <div className=\"flex items-center gap-2\">\n <Bot className=\"w-4 h-4 text-brand-500 shrink-0\" />\n <Label className=\"text-sm font-medium\">Agent Summary</Label>\n <span className=\"ml-auto text-sm text-muted-foreground\">\n {totalRunningAgents} running / {\n Object.entries(projectConfigs)\n .filter(([*, c]) => c.selected)\n .reduce((sum, [_, c]) => sum + c.maxAgents, 0)\n } max total\n </span>\n </div>\n <p className=\"text-xs text-muted-foreground mt-2\">\n Configure max agents per project above. Higher values process more features in parallel but use more API resources.\n </p>\n </div>\n )}",
"new_string": " {/_ Agent Summary _/}\n {selectedProjectIds.size > 0 && (\n <div className=\"p-3 rounded-lg bg-secondary/50\">\n <div className=\"flex items-center gap-2\">\n <Bot className=\"w-4 h-4 text-brand-500 shrink-0\" />\n <Label className=\"text-sm font-medium\">Agent Summary</Label>\n <span className=\"ml-auto text-sm text-muted-foreground\">\n {totalRunningAgents} running\n </span>\n </div>\n <p className=\"text-xs text-muted-foreground mt-2\">\n Max concurrent agents can be configured from Board Actions in the toolbar.\n </p>\n </div>\n )}"
}
Now let me clean up unused imports in the auto-mode-modal. The `Slider` import and `Bot` import from lucide-react may no longer be needed. Let me check:

🔧 Tool: Grep
Input: {
"pattern": "Slider|Bot",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\dialogs\\auto-mode-modal.tsx",
"output_mode": "content"
}
`Bot` is still used in the Agent Summary section. `Slider` is no longer used. Let me remove the unused `Slider` import:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\dialogs\\auto-mode-modal.tsx",
"old_string": "import { Slider } from '@/components/ui/slider';",
"new_string": ""
}
Now let me also check if `handleProjectMaxAgentsChange` is still used:

🔧 Tool: Grep
Input: {
"pattern": "handleProjectMaxAgentsChange",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\dialogs\\auto-mode-modal.tsx",
"output_mode": "content"
}
The function is only defined but never called anymore. Let me remove it:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\dialogs\\auto-mode-modal.tsx",
"old_string": " const handleProjectMaxAgentsChange = (projectId: string, value: number) => {\n setProjectConfigs((prev) => ({\n ...prev,\n [projectId]: {\n ...prev[projectId],\n maxAgents: value,\n },\n }));\n };\n\n const handleProjectVerificationToggle",
"new_string": " const handleProjectVerificationToggle"
}

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore codebase to understand auto-mode modal and board actions structure",
"status": "completed",
"activeForm": "Exploring codebase structure"
},
{
"content": "Add max concurrent agents slider to Board Actions (Auto Mode collapsible) in top-nav-bar.tsx",
"status": "completed",
"activeForm": "Adding slider to Board Actions in top-nav-bar.tsx"
},
{
"content": "Remove per-project max agents slider from auto-mode-modal.tsx",
"status": "completed",
"activeForm": "Removing slider from auto-mode modal"
},
{
"content": "Verify the changes compile correctly",
"status": "in_progress",
"activeForm": "Verifying changes compile"
}
]
}
Let me now build to verify the changes compile:

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" && npm run build:packages 2>&1 | tail -20",
"description": "Build shared packages",
"timeout": 120000
}
There's a pre-existing JSON parse error in the root package.json (not related to my changes). Let me try building just the UI to check for TypeScript compilation:

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\" && npx tsc --noEmit 2>&1 | head -50",
"description": "TypeScript check UI app",
"timeout": 120000
}
The root package.json has a pre-existing issue. Let me use tsc directly without npx to avoid the npm resolution:

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\" && node ../../node_modules/.bin/tsc --noEmit 2>&1 | head -50",
"description": "TypeScript check using node_modules tsc",
"timeout": 120000
}

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\" && node ../../node_modules/typescript/bin/tsc --noEmit 2>&1 | head -80",
"description": "TypeScript check direct tsc path",
"timeout": 120000
}
TypeScript compilation passes with no errors. Let me also do a quick verify on the auto-mode-modal to make sure the file is clean:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\dialogs\\auto-mode-modal.tsx",
"limit": 20
}
Good - the Slider import is removed. Let me do one final verification to make sure the modified files look correct:

🔧 Tool: Grep
Input: {
"pattern": "board-actions-concurrency",
"path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx",
"output_mode": "content",
"-C": 2
}

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore codebase to understand auto-mode modal and board actions structure",
"status": "completed",
"activeForm": "Exploring codebase structure"
},
{
"content": "Add max concurrent agents slider to Board Actions (Auto Mode collapsible) in top-nav-bar.tsx",
"status": "completed",
"activeForm": "Adding slider to Board Actions in top-nav-bar.tsx"
},
{
"content": "Remove per-project max agents slider from auto-mode-modal.tsx",
"status": "completed",
"activeForm": "Removing slider from auto-mode modal"
},
{
"content": "Verify the changes compile correctly",
"status": "completed",
"activeForm": "Verifying changes compile"
}
]
}
All changes compile successfully. Here's the complete summary:

<summary>
## Summary: Max concurrent agent should be under board actions not under auto mode configuration

### Changes Implemented

- Added a "Max Agents" slider with running/max count display to the **Board Actions** section (under the Auto Mode collapsible) in the Tools dropdown of the top navigation bar
- Removed the per-project "Max agents" slider from the **Auto Mode Configuration** modal
- Updated the "Agent Summary" section in the Auto Mode modal to remove the now-irrelevant "max total" count and updated the description text to point users to Board Actions
- Cleaned up unused imports (`Slider`) and unused handler function (`handleProjectMaxAgentsChange`) from the auto-mode modal

### Files Modified

- `apps/ui/src/components/layout/top-nav-bar.tsx` — Added `Bot` icon and `Slider` component imports; added `maxConcurrency` and `onConcurrencyChange` to the `ExtendedToolsButtonProps` interface; added a max concurrent agents slider control inside the Auto Mode collapsible section under Board Actions
- `apps/ui/src/components/dialogs/auto-mode-modal.tsx` — Removed the per-project max agents slider, removed unused `Slider` import, removed unused `handleProjectMaxAgentsChange` handler, updated Agent Summary section text

### Notes for Developer

- The max concurrent agents slider is now accessible directly from **Tools > Board Actions > Auto Mode** in the top navigation bar, making it quicker to adjust without opening the full Auto Mode Configuration modal
- The Auto Mode Configuration modal still has the "Configure" button for access to project selection, verification settings, and start/stop controls
- The mobile view already had a max agents slider in `HeaderMobileMenu` — that remains unchanged
- TypeScript compilation passes with no errors
</summary>
