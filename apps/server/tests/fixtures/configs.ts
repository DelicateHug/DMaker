/**
 * Configuration fixtures for testing Codex config manager
 */

export const tomlConfigFixture = `
experimental_use_rmcp_client = true

[mcp_servers.automaker-tools]
command = "node"
args = ["/path/to/server.js"]
startup_timeout_sec = 10
tool_timeout_sec = 60
enabled_tools = ["UpdateFeatureStatus"]

[mcp_servers.automaker-tools.env]
AUTOMAKER_PROJECT_PATH = "/path/to/project"
`;

export const codexAuthJsonFixture = {
  token: {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    id_token: "test-id-token",
  },
};
