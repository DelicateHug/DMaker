I'll help you implement this feature to change the window title to "DMaker-Dev" when running in dev mode. Let me start by exploring the codebase to understand how the window title is currently set.

[timestamp:2026-02-17T07:32:45.758Z] 🔧 Tool: Glob
Input: {
"pattern": "\*\*/index.html"
}

[timestamp:2026-02-17T07:32:46.014Z] 🔧 Tool: Glob
Input: {
"pattern": "\*\*/main.ts"
}

[timestamp:2026-02-17T07:32:46.311Z] 🔧 Tool: Glob
Input: {
"pattern": "\*\*/electron.ts"
}

[timestamp:2026-02-17T07:33:05.240Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\index.html"
}

[timestamp:2026-02-17T07:33:06.244Z] 🔧 Tool: Grep
Input: {
"pattern": "BrowserWindow",
"glob": "\*_/_.ts",
"path": "apps/ui"
}

[timestamp:2026-02-17T07:33:27.228Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\main.ts"
}
Perfect! I found where the window title is set. Now let me check the package.json to understand the dev environment better:

[timestamp:2026-02-17T07:33:36.232Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\package.json"
}
Now I understand the setup. I can see that:

1. In `apps/ui/index.html` (line 5), the title is set to "DMaker"
2. In `apps/ui/src/main.ts` (lines 883-886), the window title is explicitly set to "DMaker" when the page loads
3. The variable `isDev` is defined on line 43 to check if it's development mode

I need to update both locations to show "DMaker-Dev" when running in dev mode. Let me make the changes:

[timestamp:2026-02-17T07:33:48.381Z] 🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\main.ts",
"old_string": " // Set window title explicitly\n mainWindow.webContents.on('did-finish-load', () => {\n if (mainWindow && !mainWindow.isDestroyed()) {\n mainWindow.setTitle('DMaker');\n }\n });",
"new_string": " // Set window title explicitly\n mainWindow.webContents.on('did-finish-load', () => {\n if (mainWindow && !mainWindow.isDestroyed()) {\n mainWindow.setTitle(isDev ? 'DMaker-Dev' : 'DMaker');\n }\n });"
}
Good! Now let me also update the HTML title for consistency, even though the Electron window title will override it. But for web mode, this will be useful:

[timestamp:2026-02-17T07:33:56.913Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\vite.config.mts"
}
I see that Vite can inject environment variables. Let me check if there's a way to dynamically set the HTML title. Let me look at the renderer entry point:

[timestamp:2026-02-17T07:34:08.309Z] 🔧 Tool: Glob
Input: {
"pattern": "\*\*/renderer.tsx",
"path": "apps/ui"
}

[timestamp:2026-02-17T07:34:15.437Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\renderer.tsx"
}
Let me update the vite config to define a development mode variable, and then update the HTML to use it:

[timestamp:2026-02-17T07:34:28.335Z] 🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\vite.config.mts",
"old_string": " define: {\n **APP_VERSION**: JSON.stringify(appVersion),\n },",
"new_string": " define: {\n **APP_VERSION**: JSON.stringify(appVersion),\n **DEV_MODE**: JSON.stringify(command === 'serve'),\n },"
}
Now let me update the renderer to set the title dynamically when the app loads:

[timestamp:2026-02-17T07:34:47.074Z] 🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\renderer.tsx",
"old_string": "import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './app';\n\ncreateRoot(document.getElementById('app')!).render(\n <StrictMode>\n <App />\n </StrictMode>\n);",
"new_string": "import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './app';\n\n// Set window title based on dev mode\ndeclare const **DEV_MODE**: boolean;\nif (typeof **DEV_MODE** !== 'undefined' && **DEV_MODE**) {\n document.title = 'DMaker-Dev';\n}\n\ncreateRoot(document.getElementById('app')!).render(\n <StrictMode>\n <App />\n </StrictMode>\n);"
}
Now let me verify the changes by reading the files back:

[timestamp:2026-02-17T07:34:56.923Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\main.ts",
"offset": 880,
"limit": 10
}

[timestamp:2026-02-17T07:34:57.470Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\renderer.tsx"
}
Perfect! Now let me also check if there are TypeScript declarations for the global variables. Let me look for any vite-env.d.ts or similar files:

[timestamp:2026-02-17T07:35:10.027Z] 🔧 Tool: Glob
Input: {
"pattern": "\*_/_.d.ts",
"path": "apps/ui/src"
}

[timestamp:2026-02-17T07:35:20.265Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\vite-env.d.ts"
}
Perfect! I need to add the `__DEV_MODE__` declaration here:

[timestamp:2026-02-17T07:35:33.605Z] 🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\vite-env.d.ts",
"old_string": "// Global constants defined in vite.config.mts\ndeclare const **APP_VERSION**: string;",
"new_string": "// Global constants defined in vite.config.mts\ndeclare const **APP_VERSION**: string;\ndeclare const **DEV_MODE**: boolean;"
}
Now I can remove the duplicate declaration in renderer.tsx:

[timestamp:2026-02-17T07:35:44.174Z] 🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\renderer.tsx",
"old_string": "import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './app';\n\n// Set window title based on dev mode\ndeclare const **DEV_MODE**: boolean;\nif (typeof **DEV_MODE** !== 'undefined' && **DEV_MODE**) {\n document.title = 'DMaker-Dev';\n}\n\ncreateRoot(document.getElementById('app')!).render(\n <StrictMode>\n <App />\n </StrictMode>\n);",
"new_string": "import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './app';\n\n// Set window title based on dev mode\nif (typeof **DEV_MODE** !== 'undefined' && **DEV_MODE**) {\n document.title = 'DMaker-Dev';\n}\n\ncreateRoot(document.getElementById('app')!).render(\n <StrictMode>\n <App />\n </StrictMode>\n);"
}
Excellent! Now let me verify all the changes are correct by reading the modified files:

[timestamp:2026-02-17T07:35:51.234Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\renderer.tsx"
}

[timestamp:2026-02-17T07:35:52.179Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\vite-env.d.ts"
}

[timestamp:2026-02-17T07:35:52.433Z] 🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\vite.config.mts",
"offset": 90,
"limit": 10
}
Perfect! All changes look good. Let me create a summary of what was implemented:

<summary>
## Summary: Window Title Shows "DMaker-Dev" in Development Mode

### Changes Implemented

- Modified Electron main process to set window title to "DMaker-Dev" when running in development mode
- Added `__DEV_MODE__` global constant in Vite config to detect development mode
- Updated renderer to set HTML document title to "DMaker-Dev" in development mode (for web mode)
- Added TypeScript declaration for the new `__DEV_MODE__` global constant

### Files Modified

- `apps/ui/src/main.ts` - Updated `mainWindow.setTitle()` call to use conditional title based on `isDev` flag (line 885)
- `apps/ui/vite.config.mts` - Added `__DEV_MODE__` constant definition to detect when running in dev server mode (line 96)
- `apps/ui/src/renderer.tsx` - Added logic to set `document.title` to "DMaker-Dev" when in dev mode (lines 5-8)
- `apps/ui/src/vite-env.d.ts` - Added TypeScript declaration for `__DEV_MODE__` global constant (line 15)

### Notes for Developer

- The window title will now display "DMaker-Dev" when running `npm run dev`, `npm run dev:electron`, or `npm run dev:web`
- In production builds and non-dev modes, the title remains "DMaker"
- The implementation handles both Electron desktop mode (via `isDev` in main.ts) and web browser mode (via `__DEV_MODE__` in renderer.tsx)
- The `isDev` check in Electron uses `!app.isPackaged`, while `__DEV_MODE__` in the web app uses Vite's `command === 'serve'`
</summary>
