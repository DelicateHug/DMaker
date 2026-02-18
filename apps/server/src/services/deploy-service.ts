/**
 * Deploy Script Runner Service
 *
 * Simplified deploy service that:
 * - Discovers and runs scripts from the project's .automaker/deploy folder
 * - Executes scripts using spawn with real-time stdout/stderr streaming
 * - Captures all output in memory
 * - Tracks run history for each script execution
 * - Streams output to callers via callback
 *
 * Supported script types: .py, .ps1, .js, .ts, .sh, .bat, .cmd
 */

import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import { getAutomakerDir } from '@automaker/platform';
import { createLogger } from '@automaker/utils';

const logger = createLogger('DeployScriptRunner');

/** Default timeout for script execution (5 minutes) */
const DEFAULT_TIMEOUT_MS = 300_000;

/** Maximum number of history entries to retain in memory */
const MAX_HISTORY_ENTRIES = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported script type identifiers */
export type ScriptType = 'python' | 'powershell' | 'node' | 'shell' | 'batch';

/** Metadata about a deploy script discovered in the deploy folder */
export interface DeployScript {
  /** Script filename (e.g. "deploy-prod.sh") */
  name: string;
  /** Absolute path to the script file */
  path: string;
  /** Inferred script type */
  type: ScriptType;
  /** File extension (e.g. ".sh") */
  extension: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp (ISO string) */
  modifiedAt: string;
  /** Relative folder path within the deploy directory (empty string for root-level scripts) */
  folder: string;
}

/** Streaming event emitted during script execution */
export type ScriptRunEvent =
  | { type: 'start'; script: DeployScript }
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'done'; result: ScriptRunResult };

/** Callback for receiving streaming script execution events */
export type ScriptRunCallback = (event: ScriptRunEvent) => void;

/** Result of a single script execution */
export interface ScriptRunResult {
  /** Whether the script exited successfully (exit code 0) */
  success: boolean;
  /** The script that was executed */
  script: DeployScript;
  /** Captured stdout */
  stdout: string;
  /** Captured stderr */
  stderr: string;
  /** Exit code (null if killed / timed out) */
  exitCode: number | null;
  /** Error message if execution failed */
  error?: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** ISO timestamp when execution started */
  startedAt: string;
}

/** Options for running a script */
export interface RunScriptOptions {
  /** Absolute path to the project directory */
  projectPath: string;
  /** Script filename to execute (must exist in the deploy folder) */
  scriptName: string;
  /** Timeout in milliseconds (defaults to 5 minutes) */
  timeout?: number;
  /** Optional callback for real-time streaming output */
  onEvent?: ScriptRunCallback;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Supported script file extensions */
const SUPPORTED_EXTENSIONS = new Set(['.py', '.ps1', '.js', '.ts', '.sh', '.bat', '.cmd']);

/** Map file extension → script type */
const EXTENSION_TYPE_MAP: Record<string, ScriptType> = {
  '.py': 'python',
  '.ps1': 'powershell',
  '.js': 'node',
  '.ts': 'node',
  '.sh': 'shell',
  '.bat': 'batch',
  '.cmd': 'batch',
};

/**
 * Build the shell and arguments for spawning a script.
 *
 * On Windows, scripts are run via PowerShell (to support .ps1 natively).
 * On Unix, scripts are run via /bin/sh -c.
 */
function buildSpawnArgs(scriptPath: string, extension: string): { shell: string; args: string[] } {
  const isWindows = process.platform === 'win32';

  // Build the raw command string based on extension
  let command: string;
  switch (extension) {
    case '.py':
      command = `python "${scriptPath}"`;
      break;
    case '.ps1':
      if (isWindows) {
        return {
          shell: 'powershell.exe',
          args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
        };
      }
      command = `pwsh -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`;
      break;
    case '.js':
      command = `node "${scriptPath}"`;
      break;
    case '.ts':
      command = `npx tsx "${scriptPath}"`;
      break;
    case '.sh':
      command = `bash "${scriptPath}"`;
      break;
    case '.bat':
    case '.cmd':
      if (isWindows) {
        return {
          shell: 'cmd.exe',
          args: ['/c', scriptPath],
        };
      }
      command = `"${scriptPath}"`;
      break;
    default:
      command = `"${scriptPath}"`;
      break;
  }

  if (isWindows) {
    return {
      shell: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    };
  }

  return {
    shell: '/bin/sh',
    args: ['-c', command],
  };
}

// ---------------------------------------------------------------------------
// DeployScriptRunner
// ---------------------------------------------------------------------------

/**
 * Deploy Script Runner
 *
 * Discovers scripts in a project's `.automaker/deploy` folder, executes them
 * via `spawn`, captures stdout/stderr in memory, streams output through an
 * optional callback, and maintains an in-memory run history.
 */
export class DeployScriptRunner {
  /** In-memory run history (most recent first) */
  private history: ScriptRunResult[] = [];

  /** Currently running child process (if any), keyed by projectPath:scriptName */
  private activeRuns = new Map<string, ChildProcess>();

  // -------------------------------------------------------------------------
  // Script discovery
  // -------------------------------------------------------------------------

  /**
   * Get the deploy folder path for a project.
   *
   * @param projectPath - Absolute path to the project directory
   * @returns Absolute path to `{projectPath}/.automaker/deploy`
   */
  getDeployFolderPath(projectPath: string): string {
    return path.join(getAutomakerDir(projectPath), 'deploy');
  }

  /**
   * List available deploy scripts in the project's deploy folder.
   *
   * Recursively scans subdirectories so scripts can be organized in nested
   * folders (e.g. `.automaker/deploy/infra/setup.sh`). Returns an empty
   * array if the folder does not exist. Scripts are sorted alphabetically,
   * root-level scripts first, then by folder path and name.
   *
   * @param projectPath - Absolute path to the project directory
   * @returns Array of discovered deploy scripts
   */
  async listScripts(projectPath: string): Promise<DeployScript[]> {
    const deployFolder = this.getDeployFolderPath(projectPath);

    // Check if deploy folder exists
    try {
      const stat = await secureFs.stat(deployFolder);
      if (!stat.isDirectory()) {
        return [];
      }
    } catch {
      return [];
    }

    const scripts: DeployScript[] = [];
    await this.scanDirectory(deployFolder, deployFolder, scripts);

    // Sort: root-level scripts first (folder === ''), then by folder, then by name
    scripts.sort((a, b) => {
      if (a.folder === '' && b.folder !== '') return -1;
      if (a.folder !== '' && b.folder === '') return 1;
      const folderCmp = a.folder.localeCompare(b.folder);
      if (folderCmp !== 0) return folderCmp;
      return a.name.localeCompare(b.name);
    });

    return scripts;
  }

  /**
   * Recursively scan a directory for deploy scripts.
   *
   * @param dir - Current directory to scan
   * @param deployFolder - Root deploy folder (used to compute relative paths)
   * @param scripts - Accumulator array for discovered scripts
   */
  private async scanDirectory(
    dir: string,
    deployFolder: string,
    scripts: DeployScript[]
  ): Promise<void> {
    const entries = await secureFs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recurse into subdirectories
        await this.scanDirectory(fullPath, deployFolder, scripts);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      // Compute relative folder path from the deploy root
      const relativeDir = path.relative(deployFolder, dir);
      // Use forward slashes for consistency across platforms
      const folder = relativeDir === '.' ? '' : relativeDir.replace(/\\/g, '/');
      // The script name includes the relative path for nested scripts
      const scriptName = folder ? `${folder}/${entry.name}` : entry.name;

      try {
        const stats = await secureFs.stat(fullPath);
        scripts.push({
          name: scriptName,
          path: fullPath,
          type: EXTENSION_TYPE_MAP[ext] || 'node',
          extension: ext,
          size: Number(stats.size),
          modifiedAt: stats.mtime.toISOString(),
          folder,
        });
      } catch (statError) {
        logger.warn(`Could not stat script file ${fullPath}:`, statError);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Script execution
  // -------------------------------------------------------------------------

  /**
   * Run a deploy script by name.
   *
   * Spawns the script in the project directory, captures stdout/stderr, and
   * optionally streams output via `onEvent`. The result is stored in the
   * run history.
   *
   * @param options - Run options (projectPath, scriptName, timeout, onEvent)
   * @returns The result of the script execution
   */
  async runScript(options: RunScriptOptions): Promise<ScriptRunResult> {
    const { projectPath, scriptName, timeout = DEFAULT_TIMEOUT_MS, onEvent } = options;

    const deployFolder = this.getDeployFolderPath(projectPath);
    const scriptPath = path.join(deployFolder, scriptName);

    // --- Validate script exists and is within deploy folder ---
    const normalizedScript = path.normalize(scriptPath);
    const normalizedFolder = path.normalize(deployFolder);
    if (
      !normalizedScript.startsWith(normalizedFolder + path.sep) &&
      normalizedScript !== normalizedFolder
    ) {
      throw new Error('Script path must be within the deploy folder');
    }

    let stats;
    try {
      stats = await secureFs.stat(scriptPath);
    } catch {
      throw new Error(`Script not found: ${scriptName}`);
    }

    if (!stats.isFile()) {
      throw new Error(`Not a file: ${scriptName}`);
    }

    const ext = path.extname(scriptName).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      throw new Error(
        `Unsupported script type: ${ext}. Supported: ${[...SUPPORTED_EXTENSIONS].join(', ')}`
      );
    }

    // Derive folder from the scriptName (e.g. "test/hello.sh" → "test")
    const lastSlash = scriptName.replace(/\\/g, '/').lastIndexOf('/');
    const folder = lastSlash >= 0 ? scriptName.replace(/\\/g, '/').substring(0, lastSlash) : '';

    const script: DeployScript = {
      name: scriptName,
      path: scriptPath,
      type: EXTENSION_TYPE_MAP[ext] || 'node',
      extension: ext,
      size: Number(stats.size),
      modifiedAt: stats.mtime.toISOString(),
      folder,
    };

    // --- Execute ---
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    onEvent?.({ type: 'start', script });

    const result = await this.spawnScript(script, projectPath, timeout, onEvent);
    result.startedAt = startedAt;
    result.duration = Date.now() - startTime;

    onEvent?.({ type: 'done', result });

    // Store in history
    this.addToHistory(result);

    return result;
  }

  /**
   * Spawn a script process and capture its output.
   */
  private spawnScript(
    script: DeployScript,
    projectPath: string,
    timeout: number,
    onEvent?: ScriptRunCallback
  ): Promise<ScriptRunResult> {
    return new Promise<ScriptRunResult>((resolve) => {
      const { shell, args } = buildSpawnArgs(script.path, script.extension);
      const runKey = `${projectPath}:${script.name}`;

      logger.info(`Running deploy script: ${script.name} (${shell} ${args.join(' ')})`);

      const child = spawn(shell, args, {
        cwd: projectPath,
        env: {
          ...process.env,
          // Force UTF-8 output encoding on Windows to avoid garbled text
          ...(process.platform === 'win32' ? { PYTHONIOENCODING: 'utf-8' } : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        // On Windows, don't create a visible window for the child process
        ...(process.platform === 'win32' ? { windowsHide: true } : {}),
      });

      this.activeRuns.set(runKey, child);

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Timeout handling
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        // Force kill after 5 seconds if still alive
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        onEvent?.({ type: 'stdout', data: text });
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        onEvent?.({ type: 'stderr', data: text });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        this.activeRuns.delete(runKey);
        resolve({
          success: false,
          script,
          stdout,
          stderr,
          exitCode: null,
          error: error.message,
          duration: 0,
          startedAt: '',
        });
      });

      child.on('close', (code) => {
        clearTimeout(timeoutHandle);
        this.activeRuns.delete(runKey);

        if (timedOut) {
          resolve({
            success: false,
            script,
            stdout,
            stderr,
            exitCode: null,
            error: `Script timed out after ${timeout}ms`,
            duration: 0,
            startedAt: '',
          });
          return;
        }

        const success = code === 0;
        // Build a concise error summary (not the full stderr dump).
        // The full stderr is available in the `stderr` field.
        let error: string | undefined;
        if (!success) {
          if (stderr) {
            // Take the first meaningful line of stderr as the error summary
            const firstLine = stderr
              .split('\n')
              .find((l) => l.trim().length > 0)
              ?.trim();
            error = firstLine
              ? firstLine.length > 200
                ? firstLine.slice(0, 200) + '...'
                : firstLine
              : `Process exited with code ${code}`;
          } else {
            error = `Process exited with code ${code}`;
          }
        }
        resolve({
          success,
          script,
          stdout,
          stderr,
          exitCode: code,
          error,
          duration: 0,
          startedAt: '',
        });
      });
    });
  }

  // -------------------------------------------------------------------------
  // Run history
  // -------------------------------------------------------------------------

  /**
   * Get the run history, most recent first.
   *
   * @param limit - Maximum number of entries to return (default: all)
   * @returns Array of past script run results
   */
  getHistory(limit?: number): ScriptRunResult[] {
    if (limit !== undefined && limit > 0) {
      return this.history.slice(0, limit);
    }
    return [...this.history];
  }

  /**
   * Clear all run history.
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Add a result to the history, trimming if over the cap.
   */
  private addToHistory(result: ScriptRunResult): void {
    this.history.unshift(result);
    if (this.history.length > MAX_HISTORY_ENTRIES) {
      this.history = this.history.slice(0, MAX_HISTORY_ENTRIES);
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Kill all active script runs and clear history.
   */
  destroy(): void {
    for (const [key, child] of this.activeRuns) {
      logger.info(`Killing active deploy script: ${key}`);
      child.kill('SIGTERM');
    }
    this.activeRuns.clear();
    this.history = [];
  }
}

// Singleton instance
export const deployScriptRunner = new DeployScriptRunner();
