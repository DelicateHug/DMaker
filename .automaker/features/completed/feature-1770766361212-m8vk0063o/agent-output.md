Let me verify the current state of the implementation by reading the key file that was modified.

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\hooks\\use-electron-agent.ts"
}
The fix from the previous implementation is already applied. Let me verify the downstream components to make sure the data flow is correct end-to-end.

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\agent-view\\hooks\\use-agent-session.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\agent-view\\components\\thinking-indicator.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\agent-view\\components\\message-list.tsx"
}
Now let me verify how `useElectronAgent` is consumed in the agent view to confirm `isProcessing` flows through correctly:

🔧 Tool: Grep
Input: {
"pattern": "useElectronAgent|isProcessing",
"path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\agent-view",
"output_mode": "content",
"-n": true
}
Let me check the main agent-view component to confirm the full wiring from `useElectronAgent` down to `MessageList`:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\DylanSmart\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\agent-view.tsx"
}
The implementation is verified and complete. The full data flow is correct:

1. **`use-electron-agent.ts:194-232`** — The `initialize()` function runs `start()` and `getHistory()` in parallel via `Promise.all`. The `isProcessing` state is set from `historyResult.isRunning` in the same render batch as the messages.

2. **`agent-view.tsx:52`** — `isProcessing` is destructured from `useElectronAgent` and passed down to `ChatArea` (line 185) and `AgentHeader` (line 171).

3. **`chat-area.tsx:49`** — `isProcessing` is forwarded to `MessageList`.

4. **`message-list.tsx:38`** — When `isProcessing` is `true`, the `ThinkingIndicator` component renders with the animated blue bouncing dots and "Thinking..." text.

The fix correctly addresses the root cause: previously, `start()` and `getHistory()` were called sequentially, creating a window where messages were loaded but `isProcessing` was still `false`. Now both calls resolve simultaneously, and the running state is applied atomically alongside the messages.

No additional changes are needed.

<summary>
## Summary: Fix thinking indicator not showing when switching back to active session

### Changes Implemented

- Fixed a race condition in session initialization where `isProcessing` remained `false` during the gap between sequential `start()` and `getHistory()` async calls
- Changed the two sequential API calls to run in parallel using `Promise.all`, so both results are available in the same render batch
- The `isProcessing` state is now set correctly from the `getHistory` result at the same time as messages are loaded, eliminating the "frozen UI" appearance

### Root Cause

When switching back to an active session (e.g., navigating to "New Chat" then back), the `initialize()` function in `useElectronAgent` called `api.agent.start()` first (to load messages), then separately called `api.agent.getHistory()` (to check if the agent was still running). Between these two async calls, `isProcessing` remained at its initial value of `false`, so the `ThinkingIndicator` component (animated blue dots with "Thinking..." text) did not render. The UI appeared frozen until the AI eventually responded with a stream event.

### Files Modified

- `apps/ui/src/hooks/use-electron-agent.ts:194-232` — Restructured `initialize()` to call `start()` and `getHistory()` in parallel via `Promise.all`, applying both results atomically

### Notes for Developer

- All edge cases handled: session already completed, `getHistory` failure (falls back to `false`), `start` failure (error state set), rapid session switching (guarded by `mounted` flag), and concurrent stream events
- The `ThinkingIndicator` component and `MessageList` component required no changes — the fix is purely in state timing
- The data flow is verified end-to-end: `useElectronAgent` → `AgentView` → `ChatArea` → `MessageList` → `ThinkingIndicator`
</summary>
