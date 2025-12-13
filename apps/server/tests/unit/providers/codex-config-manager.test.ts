import { describe, it, expect, vi, beforeEach } from "vitest";
import { CodexConfigManager } from "@/providers/codex-config-manager.js";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { tomlConfigFixture } from "../../fixtures/configs.js";

vi.mock("fs/promises");

describe("codex-config-manager.ts", () => {
  let manager: CodexConfigManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new CodexConfigManager();
  });

  describe("constructor", () => {
    it("should initialize with user config path", () => {
      const expectedPath = path.join(os.homedir(), ".codex", "config.toml");
      expect(manager["userConfigPath"]).toBe(expectedPath);
    });

    it("should initialize with null project config path", () => {
      expect(manager["projectConfigPath"]).toBeNull();
    });
  });

  describe("setProjectPath", () => {
    it("should set project config path", () => {
      manager.setProjectPath("/my/project");
      const configPath = manager["projectConfigPath"];
      expect(configPath).toContain("my");
      expect(configPath).toContain("project");
      expect(configPath).toContain(".codex");
      expect(configPath).toContain("config.toml");
    });

    it("should handle paths with special characters", () => {
      manager.setProjectPath("/path with spaces/project");
      expect(manager["projectConfigPath"]).toContain("path with spaces");
    });
  });

  describe("getConfigPath", () => {
    it("should return user config path when no project path set", async () => {
      const result = await manager.getConfigPath();
      expect(result).toBe(manager["userConfigPath"]);
    });

    it("should return project config path when it exists", async () => {
      manager.setProjectPath("/my/project");
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await manager.getConfigPath();
      expect(result).toContain("my");
      expect(result).toContain("project");
      expect(result).toContain(".codex");
      expect(result).toContain("config.toml");
    });

    it("should fall back to user config when project config doesn't exist", async () => {
      manager.setProjectPath("/my/project");
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const result = await manager.getConfigPath();
      expect(result).toBe(manager["userConfigPath"]);
    });

    it("should create user config directory if it doesn't exist", async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await manager.getConfigPath();

      const expectedDir = path.dirname(manager["userConfigPath"]);
      expect(fs.mkdir).toHaveBeenCalledWith(expectedDir, { recursive: true });
    });
  });

  describe("parseToml", () => {
    it("should parse simple key-value pairs", () => {
      const toml = `
        key1 = "value1"
        key2 = "value2"
      `;
      const result = manager.parseToml(toml);

      expect(result.key1).toBe("value1");
      expect(result.key2).toBe("value2");
    });

    it("should parse boolean values", () => {
      const toml = `
        enabled = true
        disabled = false
      `;
      const result = manager.parseToml(toml);

      expect(result.enabled).toBe(true);
      expect(result.disabled).toBe(false);
    });

    it("should parse integer values", () => {
      const toml = `
        count = 42
        negative = -10
      `;
      const result = manager.parseToml(toml);

      expect(result.count).toBe(42);
      expect(result.negative).toBe(-10);
    });

    it("should parse float values", () => {
      const toml = `
        pi = 3.14
        negative = -2.5
      `;
      const result = manager.parseToml(toml);

      expect(result.pi).toBe(3.14);
      expect(result.negative).toBe(-2.5);
    });

    it("should skip comments", () => {
      const toml = `
        # This is a comment
        key = "value"
        # Another comment
      `;
      const result = manager.parseToml(toml);

      expect(result.key).toBe("value");
      expect(Object.keys(result)).toHaveLength(1);
    });

    it("should skip empty lines", () => {
      const toml = `
        key1 = "value1"

        key2 = "value2"


      `;
      const result = manager.parseToml(toml);

      expect(result.key1).toBe("value1");
      expect(result.key2).toBe("value2");
    });

    it("should parse sections", () => {
      const toml = `
        [section1]
        key1 = "value1"
        key2 = "value2"
      `;
      const result = manager.parseToml(toml);

      expect(result.section1).toBeDefined();
      expect(result.section1.key1).toBe("value1");
      expect(result.section1.key2).toBe("value2");
    });

    it("should parse nested sections", () => {
      const toml = `
        [section.subsection]
        key = "value"
      `;
      const result = manager.parseToml(toml);

      expect(result.section).toBeDefined();
      expect(result.section.subsection).toBeDefined();
      expect(result.section.subsection.key).toBe("value");
    });

    it("should parse MCP server configuration", () => {
      const result = manager.parseToml(tomlConfigFixture);

      expect(result.experimental_use_rmcp_client).toBe(true);
      expect(result.mcp_servers).toBeDefined();
      expect(result.mcp_servers["automaker-tools"]).toBeDefined();
      expect(result.mcp_servers["automaker-tools"].command).toBe("node");
    });

    it("should handle quoted strings with spaces", () => {
      const toml = `key = "value with spaces"`;
      const result = manager.parseToml(toml);

      expect(result.key).toBe("value with spaces");
    });

    it("should handle single-quoted strings", () => {
      const toml = `key = 'single quoted'`;
      const result = manager.parseToml(toml);

      expect(result.key).toBe("single quoted");
    });

    it("should return empty object for empty input", () => {
      const result = manager.parseToml("");
      expect(result).toEqual({});
    });
  });

  describe("readConfig", () => {
    it("should read and parse existing config", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(tomlConfigFixture);

      const result = await manager.readConfig("/path/to/config.toml");

      expect(result.experimental_use_rmcp_client).toBe(true);
      expect(result.mcp_servers).toBeDefined();
    });

    it("should return empty object when file doesn't exist", async () => {
      const error: any = new Error("ENOENT");
      error.code = "ENOENT";
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await manager.readConfig("/nonexistent.toml");

      expect(result).toEqual({});
    });

    it("should throw other errors", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("Permission denied"));

      await expect(manager.readConfig("/path.toml")).rejects.toThrow(
        "Permission denied"
      );
    });
  });

  describe("escapeTomlString", () => {
    it("should escape backslashes", () => {
      const result = manager.escapeTomlString("path\\to\\file");
      expect(result).toBe("path\\\\to\\\\file");
    });

    it("should escape double quotes", () => {
      const result = manager.escapeTomlString('say "hello"');
      expect(result).toBe('say \\"hello\\"');
    });

    it("should escape newlines", () => {
      const result = manager.escapeTomlString("line1\nline2");
      expect(result).toBe("line1\\nline2");
    });

    it("should escape carriage returns", () => {
      const result = manager.escapeTomlString("line1\rline2");
      expect(result).toBe("line1\\rline2");
    });

    it("should escape tabs", () => {
      const result = manager.escapeTomlString("col1\tcol2");
      expect(result).toBe("col1\\tcol2");
    });
  });

  describe("formatValue", () => {
    it("should format strings with quotes", () => {
      const result = manager.formatValue("test");
      expect(result).toBe('"test"');
    });

    it("should format booleans as strings", () => {
      expect(manager.formatValue(true)).toBe("true");
      expect(manager.formatValue(false)).toBe("false");
    });

    it("should format numbers as strings", () => {
      expect(manager.formatValue(42)).toBe("42");
      expect(manager.formatValue(3.14)).toBe("3.14");
    });

    it("should escape special characters in strings", () => {
      const result = manager.formatValue('path\\with"quotes');
      expect(result).toBe('"path\\\\with\\"quotes"');
    });
  });

  describe("writeConfig", () => {
    it("should write TOML config to file", async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const config = {
        experimental_use_rmcp_client: true,
        mcp_servers: {
          "test-server": {
            command: "node",
            args: ["server.js"],
          },
        },
      };

      await manager.writeConfig("/path/config.toml", config);

      expect(fs.writeFile).toHaveBeenCalledWith(
        "/path/config.toml",
        expect.stringContaining("experimental_use_rmcp_client = true"),
        "utf-8"
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        "/path/config.toml",
        expect.stringContaining("[mcp_servers.test-server]"),
        "utf-8"
      );
    });

    it("should create config directory if it doesn't exist", async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await manager.writeConfig("/path/to/config.toml", {});

      expect(fs.mkdir).toHaveBeenCalledWith("/path/to", { recursive: true });
    });

    it("should include env section for MCP servers", async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const config = {
        mcp_servers: {
          "test-server": {
            command: "node",
            env: {
              MY_VAR: "value",
            },
          },
        },
      };

      await manager.writeConfig("/path/config.toml", config);

      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(writtenContent).toContain("[mcp_servers.test-server.env]");
      expect(writtenContent).toContain('MY_VAR = "value"');
    });
  });

  describe("configureMcpServer", () => {
    it("should configure automaker-tools MCP server", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(fs.readFile).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await manager.configureMcpServer(
        "/my/project",
        "/path/to/mcp-server.js"
      );

      expect(result).toContain("config.toml");

      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(writtenContent).toContain("[mcp_servers.automaker-tools]");
      expect(writtenContent).toContain('command = "node"');
      expect(writtenContent).toContain("/path/to/mcp-server.js");
      expect(writtenContent).toContain("AUTOMAKER_PROJECT_PATH");
    });

    it("should preserve existing MCP servers", async () => {
      const existingConfig = `
        [mcp_servers.other-server]
        command = "other"
      `;

      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(fs.readFile).mockResolvedValue(existingConfig);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await manager.configureMcpServer("/project", "/server.js");

      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(writtenContent).toContain("[mcp_servers.other-server]");
      expect(writtenContent).toContain("[mcp_servers.automaker-tools]");
    });
  });

  describe("removeMcpServer", () => {
    it("should remove automaker-tools MCP server", async () => {
      const configWithServer = `
        [mcp_servers.automaker-tools]
        command = "node"

        [mcp_servers.other-server]
        command = "other"
      `;

      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(fs.readFile).mockResolvedValue(configWithServer);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await manager.removeMcpServer("/project");

      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(writtenContent).not.toContain("automaker-tools");
      expect(writtenContent).toContain("other-server");
    });

    it("should remove mcp_servers section if empty", async () => {
      const configWithOnlyAutomaker = `
        [mcp_servers.automaker-tools]
        command = "node"
      `;

      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(fs.readFile).mockResolvedValue(configWithOnlyAutomaker);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await manager.removeMcpServer("/project");

      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(writtenContent).not.toContain("mcp_servers");
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("Read error"));

      // Should not throw
      await expect(manager.removeMcpServer("/project")).resolves.toBeUndefined();
    });
  });
});
