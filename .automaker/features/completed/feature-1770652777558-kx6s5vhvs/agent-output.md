I'll help you implement this feature to reduce the logging level from INFO to something less verbose. Let me start by exploring the codebase to understand the logging configuration.

🔧 Tool: Glob
Input: {
"pattern": "\**/*log\*.{ts,js,json}"
}

🔧 Tool: Glob
Input: {
"pattern": "\*\*/dev-restart.ps1"
}

🔧 Tool: Grep
Input: {
"pattern": "INFO|log.\*level|LOG_LEVEL",
"output_mode": "files_with_matches"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\dev-restart.ps1"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\libs\\utils\\src\\logger.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\index.ts"
}
Now let me check if there are any environment configuration files:

🔧 Tool: Glob
Input: {
"pattern": "\*_/.env_"
}

🔧 Tool: Grep
Input: {
"pattern": "LOG_LEVEL",
"output_mode": "content",
"-C": 2
}
Now let me check the .env files and the package.json dev scripts:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\.env"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\.env.example"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\package.json"
}
Perfect! Now I understand the issue. The user wants to reduce the logging level from INFO to something less verbose (like WARN or ERROR) when running the dev-restart.ps1 script. I can see that:

1. The logger supports environment variable `LOG_LEVEL` (error, warn, info, debug)
2. The default log level is INFO (line 60 in logger.ts)
3. The dev script can be configured via .env file

Let me add the `LOG_LEVEL` environment variable to reduce logging verbosity:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\.env",
"old_string": "# Development Environment Configuration\n# Dev uses port 3019 to avoid conflicts with production instance on 3009\nPORT=3019",
"new_string": "# Development Environment Configuration\n# Dev uses port 3019 to avoid conflicts with production instance on 3009\nPORT=3019\n\n# Log Level: error, warn, info, debug (default: info)\n# Set to 'warn' to reduce verbosity in development\nLOG_LEVEL=warn"
}
Now let me also update the .env.example file to document this option:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\.env.example",
"old_string": "# ============================================\n# OPTIONAL - Debugging\n# ============================================\n\n# Enable raw output logging for agent streams (default: false)\n# When enabled, saves unprocessed stream events to raw-output.jsonl\n# in each feature's directory (.dmaker/features/{id}/raw-output.jsonl)\n# Useful for debugging provider streaming issues, improving log parsing,\n# or analyzing how different providers (Claude, Cursor) stream responses\n# Note: This adds disk I/O overhead, only enable when debugging\nDMAKER_DEBUG_RAW_OUTPUT=false",
"new_string": "# ============================================\n# OPTIONAL - Debugging\n# ============================================\n\n# Log level for server output (default: info)\n# Options: error, warn, info, debug\n# Set to 'warn' or 'error' to reduce log verbosity\nLOG_LEVEL=info\n\n# Enable raw output logging for agent streams (default: false)\n# When enabled, saves unprocessed stream events to raw-output.jsonl\n# in each feature's directory (.dmaker/features/{id}/raw-output.jsonl)\n# Useful for debugging provider streaming issues, improving log parsing,\n# or analyzing how different providers (Claude, Cursor) stream responses\n# Note: This adds disk I/O overhead, only enable when debugging\nDMAKER_DEBUG_RAW_OUTPUT=false"
}
Perfect! Let me verify the changes:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\.env"
}
Excellent! The changes are complete. Let me create a summary of what was done:

<summary>
## Summary: Reduce INFO Level Logging in Development

### Changes Implemented

- Added `LOG_LEVEL=warn` environment variable to the development `.env` file to reduce logging verbosity from INFO to WARN level
- Updated `.env.example` to document the `LOG_LEVEL` configuration option for future reference

### Files Modified

- `apps/server/.env` - Added LOG_LEVEL=warn configuration
- `apps/server/.env.example` - Documented LOG_LEVEL option in the debugging section

### Notes for Developer

- The logging level has been changed from `info` (default) to `warn` for development
- This will reduce the amount of console output by filtering out informational messages and only showing warnings, errors, and critical messages
- The next time you run `dev-restart.ps1`, the server will start with the reduced logging level
- You can further reduce logging by setting `LOG_LEVEL=error` if you want even less output, or increase it to `LOG_LEVEL=debug` for more detailed debugging when needed
- Available log levels: `error` (least verbose), `warn`, `info` (default), `debug` (most verbose)
</summary>
