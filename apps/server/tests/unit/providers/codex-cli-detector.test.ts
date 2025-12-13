import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CodexCliDetector } from "@/providers/codex-cli-detector.js";
import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

vi.mock("child_process");
vi.mock("fs");

describe("codex-cli-detector.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  describe("getConfigDir", () => {
    it("should return .codex directory in user home", () => {
      const homeDir = os.homedir();
      const configDir = CodexCliDetector.getConfigDir();
      expect(configDir).toBe(path.join(homeDir, ".codex"));
    });
  });

  describe("getAuthPath", () => {
    it("should return auth.json path in config directory", () => {
      const authPath = CodexCliDetector.getAuthPath();
      expect(authPath).toContain(".codex");
      expect(authPath).toContain("auth.json");
    });
  });

  describe("checkAuth", () => {
    const mockAuthPath = "/home/user/.codex/auth.json";

    beforeEach(() => {
      vi.spyOn(CodexCliDetector, "getAuthPath").mockReturnValue(mockAuthPath);
      vi.spyOn(CodexCliDetector, "detectCodexInstallation").mockReturnValue({
        installed: false,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should detect token object authentication", () => {
      vi.spyOn(CodexCliDetector, "detectCodexInstallation").mockReturnValue({
        installed: false,
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          token: {
            access_token: "test_access",
            refresh_token: "test_refresh",
          },
        })
      );

      const result = CodexCliDetector.checkAuth();

      expect(result.authenticated).toBe(true);
      expect(result.method).toBe("cli_tokens");
      expect(result.hasAuthFile).toBe(true);
    });

    it("should detect token with Id_token field", () => {
      vi.spyOn(CodexCliDetector, "detectCodexInstallation").mockReturnValue({
        installed: false,
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          token: {
            Id_token: "test_id_token",
          },
        })
      );

      const result = CodexCliDetector.checkAuth();

      expect(result.authenticated).toBe(true);
      expect(result.method).toBe("cli_tokens");
    });

    it("should detect root-level tokens", () => {
      vi.spyOn(CodexCliDetector, "detectCodexInstallation").mockReturnValue({
        installed: false,
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          access_token: "test_access",
          refresh_token: "test_refresh",
        })
      );

      const result = CodexCliDetector.checkAuth();

      expect(result.authenticated).toBe(true);
      expect(result.method).toBe("cli_tokens");
    });

    it("should detect API key in auth file", () => {
      vi.spyOn(CodexCliDetector, "detectCodexInstallation").mockReturnValue({
        installed: false,
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          api_key: "test-api-key",
        })
      );

      const result = CodexCliDetector.checkAuth();

      expect(result.authenticated).toBe(true);
      expect(result.method).toBe("auth_file");
    });

    it("should detect openai_api_key field", () => {
      vi.spyOn(CodexCliDetector, "detectCodexInstallation").mockReturnValue({
        installed: false,
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          openai_api_key: "test-key",
        })
      );

      const result = CodexCliDetector.checkAuth();

      expect(result.authenticated).toBe(true);
      expect(result.method).toBe("auth_file");
    });

    it("should detect environment variable authentication", () => {
      vi.spyOn(CodexCliDetector, "detectCodexInstallation").mockReturnValue({
        installed: false,
      });
      vi.mocked(fs.existsSync).mockReturnValue(false);
      process.env.OPENAI_API_KEY = "env-api-key";

      const result = CodexCliDetector.checkAuth();

      expect(result.authenticated).toBe(true);
      expect(result.method).toBe("env");
      expect(result.hasEnvKey).toBe(true);
      expect(result.hasAuthFile).toBe(false);
    });

    it("should return not authenticated when no auth found", () => {
      vi.spyOn(CodexCliDetector, "detectCodexInstallation").mockReturnValue({
        installed: false,
      });
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = CodexCliDetector.checkAuth();

      expect(result.authenticated).toBe(false);
      expect(result.method).toBe("none");
      expect(result.hasAuthFile).toBe(false);
      expect(result.hasEnvKey).toBe(false);
    });

    it("should handle malformed auth file", () => {
      vi.spyOn(CodexCliDetector, "detectCodexInstallation").mockReturnValue({
        installed: false,
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("invalid json");

      const result = CodexCliDetector.checkAuth();

      expect(result.authenticated).toBe(false);
      expect(result.method).toBe("none");
    });

    it("should return auth result with required fields", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = CodexCliDetector.checkAuth();

      expect(result).toHaveProperty("authenticated");
      expect(result).toHaveProperty("method");
      expect(typeof result.authenticated).toBe("boolean");
      expect(typeof result.method).toBe("string");
    });
  });

  describe("detectCodexInstallation", () => {
    // Note: Full detection logic involves OS-specific commands (which/where, npm, brew)
    // and is better tested in integration tests. Here we test the basic structure.

    it("should return hasApiKey when OPENAI_API_KEY is set and CLI not found", () => {
      vi.mocked(cp.execSync).mockImplementation(() => {
        throw new Error("command not found");
      });
      vi.mocked(fs.existsSync).mockReturnValue(false);
      process.env.OPENAI_API_KEY = "test-key";

      const result = CodexCliDetector.detectCodexInstallation();

      expect(result.installed).toBe(false);
      expect(result.hasApiKey).toBe(true);
    });

    it("should return not installed when nothing found", () => {
      vi.mocked(cp.execSync).mockImplementation(() => {
        throw new Error("command failed");
      });
      vi.mocked(fs.existsSync).mockReturnValue(false);
      delete process.env.OPENAI_API_KEY;

      const result = CodexCliDetector.detectCodexInstallation();

      expect(result.installed).toBe(false);
      expect(result.hasApiKey).toBeUndefined();
    });

    it("should return installation status object with installed boolean", () => {
      vi.mocked(cp.execSync).mockImplementation(() => {
        throw new Error();
      });
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = CodexCliDetector.detectCodexInstallation();

      expect(result).toHaveProperty("installed");
      expect(typeof result.installed).toBe("boolean");
    });
  });

  describe("getCodexVersion", () => {
    // Note: Testing execSync calls is difficult in unit tests and better suited for integration tests
    // The method structure and error handling can be verified indirectly through other tests

    it("should return null when given invalid path", () => {
      const version = CodexCliDetector.getCodexVersion("/nonexistent/path");
      expect(version).toBeNull();
    });
  });

  describe("getInstallationInfo", () => {
    it("should return installed status when CLI is detected", () => {
      vi.spyOn(CodexCliDetector, "detectCodexInstallation").mockReturnValue({
        installed: true,
        path: "/usr/bin/codex",
        version: "0.5.0",
        method: "cli",
      });

      const info = CodexCliDetector.getInstallationInfo();

      expect(info.status).toBe("installed");
      expect(info.method).toBe("cli");
      expect(info.version).toBe("0.5.0");
      expect(info.path).toBe("/usr/bin/codex");
      expect(info.recommendation).toContain("ready for GPT-5.1/5.2");
    });

    it("should return api_key_only when API key is set but CLI not installed", () => {
      vi.spyOn(CodexCliDetector, "detectCodexInstallation").mockReturnValue({
        installed: false,
        hasApiKey: true,
      });

      const info = CodexCliDetector.getInstallationInfo();

      expect(info.status).toBe("api_key_only");
      expect(info.method).toBe("api-key-only");
      expect(info.recommendation).toContain("OPENAI_API_KEY detected");
      expect(info.recommendation).toContain("Install Codex CLI");
      expect(info.installCommands).toBeDefined();
    });

    it("should return not_installed when nothing detected", () => {
      vi.spyOn(CodexCliDetector, "detectCodexInstallation").mockReturnValue({
        installed: false,
      });

      const info = CodexCliDetector.getInstallationInfo();

      expect(info.status).toBe("not_installed");
      expect(info.recommendation).toContain("Install OpenAI Codex CLI");
      expect(info.installCommands).toBeDefined();
    });

    it("should include install commands for all platforms", () => {
      vi.spyOn(CodexCliDetector, "detectCodexInstallation").mockReturnValue({
        installed: false,
      });

      const info = CodexCliDetector.getInstallationInfo();

      expect(info.installCommands).toHaveProperty("npm");
      expect(info.installCommands).toHaveProperty("macos");
      expect(info.installCommands).toHaveProperty("linux");
      expect(info.installCommands).toHaveProperty("windows");
    });
  });

  describe("getInstallCommands", () => {
    it("should return installation commands for all platforms", () => {
      const commands = CodexCliDetector.getInstallCommands();

      expect(commands.npm).toContain("npm install");
      expect(commands.npm).toContain("@openai/codex");
      expect(commands.macos).toContain("brew install");
      expect(commands.linux).toContain("npm install");
      expect(commands.windows).toContain("npm install");
    });
  });

  describe("isModelSupported", () => {
    it("should return true for supported models", () => {
      expect(CodexCliDetector.isModelSupported("gpt-5.1-codex-max")).toBe(true);
      expect(CodexCliDetector.isModelSupported("gpt-5.1-codex")).toBe(true);
      expect(CodexCliDetector.isModelSupported("gpt-5.1-codex-mini")).toBe(true);
      expect(CodexCliDetector.isModelSupported("gpt-5.1")).toBe(true);
      expect(CodexCliDetector.isModelSupported("gpt-5.2")).toBe(true);
    });

    it("should return false for unsupported models", () => {
      expect(CodexCliDetector.isModelSupported("gpt-4")).toBe(false);
      expect(CodexCliDetector.isModelSupported("claude-opus")).toBe(false);
      expect(CodexCliDetector.isModelSupported("unknown-model")).toBe(false);
    });
  });

  describe("getDefaultModel", () => {
    it("should return gpt-5.2 as default", () => {
      const defaultModel = CodexCliDetector.getDefaultModel();
      expect(defaultModel).toBe("gpt-5.2");
    });
  });

  describe("getFullStatus", () => {
    it("should include installation, auth, and info", () => {
      vi.spyOn(CodexCliDetector, "detectCodexInstallation").mockReturnValue({
        installed: true,
        path: "/usr/bin/codex",
      });
      vi.spyOn(CodexCliDetector, "checkAuth").mockReturnValue({
        authenticated: true,
        method: "cli_verified",
        hasAuthFile: true,
        hasEnvKey: false,
      });

      const status = CodexCliDetector.getFullStatus();

      expect(status).toHaveProperty("status");
      expect(status).toHaveProperty("auth");
      expect(status).toHaveProperty("installation");
      expect(status.auth.authenticated).toBe(true);
      expect(status.installation.installed).toBe(true);
    });
  });
});
