#!/bin/sh
set -e

# Ensure Claude CLI config directory exists with correct permissions
if [ ! -d "/home/dmaker/.claude" ]; then
    mkdir -p /home/dmaker/.claude
fi

# If CLAUDE_OAUTH_CREDENTIALS is set, write it to the credentials file
# This allows passing OAuth tokens from host (especially macOS where they're in Keychain)
if [ -n "$CLAUDE_OAUTH_CREDENTIALS" ]; then
    echo "$CLAUDE_OAUTH_CREDENTIALS" > /home/dmaker/.claude/.credentials.json
    chmod 600 /home/dmaker/.claude/.credentials.json
fi

# Fix permissions on Claude CLI config directory
chown -R dmaker:dmaker /home/dmaker/.claude
chmod 700 /home/dmaker/.claude

# Ensure Cursor CLI config directory exists with correct permissions
# This handles both: mounted volumes (owned by root) and empty directories
if [ ! -d "/home/dmaker/.cursor" ]; then
    mkdir -p /home/dmaker/.cursor
fi
chown -R dmaker:dmaker /home/dmaker/.cursor
chmod -R 700 /home/dmaker/.cursor

# Ensure OpenCode CLI config directory exists with correct permissions
# OpenCode stores config and auth in ~/.local/share/opencode/
if [ ! -d "/home/dmaker/.local/share/opencode" ]; then
    mkdir -p /home/dmaker/.local/share/opencode
fi
chown -R dmaker:dmaker /home/dmaker/.local/share/opencode
chmod -R 700 /home/dmaker/.local/share/opencode

# OpenCode also uses ~/.config/opencode for configuration
if [ ! -d "/home/dmaker/.config/opencode" ]; then
    mkdir -p /home/dmaker/.config/opencode
fi
chown -R dmaker:dmaker /home/dmaker/.config/opencode
chmod -R 700 /home/dmaker/.config/opencode

# OpenCode also uses ~/.cache/opencode for cache data (version file, etc.)
if [ ! -d "/home/dmaker/.cache/opencode" ]; then
    mkdir -p /home/dmaker/.cache/opencode
fi
chown -R dmaker:dmaker /home/dmaker/.cache/opencode
chmod -R 700 /home/dmaker/.cache/opencode

# Ensure npm cache directory exists with correct permissions
# This is needed for using npx to run MCP servers
if [ ! -d "/home/dmaker/.npm" ]; then
    mkdir -p /home/dmaker/.npm
fi
chown -R dmaker:dmaker /home/dmaker/.npm

# If CURSOR_AUTH_TOKEN is set, write it to the cursor auth file
# On Linux, cursor-agent uses ~/.config/cursor/auth.json for file-based credential storage
# The env var CURSOR_AUTH_TOKEN is also checked directly by cursor-agent
if [ -n "$CURSOR_AUTH_TOKEN" ]; then
    CURSOR_CONFIG_DIR="/home/dmaker/.config/cursor"
    mkdir -p "$CURSOR_CONFIG_DIR"
    # Write auth.json with the access token
    cat > "$CURSOR_CONFIG_DIR/auth.json" << EOF
{
  "accessToken": "$CURSOR_AUTH_TOKEN"
}
EOF
    chmod 600 "$CURSOR_CONFIG_DIR/auth.json"
    chown -R dmaker:dmaker /home/dmaker/.config
fi

# Switch to dmaker user and execute the command
exec gosu dmaker "$@"
