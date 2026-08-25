/**
 * Deploy Script Runner Service
 *
 * Simplified deploy service that:
 * - Discovers and runs scripts from the project's .dmaker/deploy folder
 * - Executes scripts using spawn with real-time stdout/stderr streaming
 * - Captures all output in memory
 * - Tracks run history for each script execution
 * - Streams output to callers via callback
 *
 * Supported script types: .py, .ps1, .js, .ts, .sh, .bat, .cmd
 */

import { spawn, type ChildProcess } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import { getDmakerDir, secureFs } from '@dmaker/platform';
import { createLogger } from '@dmaker/utils';
import { ensureFrontmatter, generateScriptId, type ScriptMeta } from './deploy-script-meta.js';

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
  /**
   * Stable script id, read from (or stamped into) the script's frontmatter.
   * Run history binds to this, so renaming a script keeps its runs.
   */
  id: string;
  /** Display name from frontmatter, when the script declares one */
  title?: string;
  /** Description from frontmatter, when the script declares one */
  description?: string;
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

/**
 * Streaming event emitted during script execution.
 *
 * Every event carries the `runId` of the execution that produced it, so a
 * client watching several concurrent runs can route output to the right one.
 */
export type ScriptRunEvent =
  | { type: 'start'; runId: string; script: DeployScript }
  | { type: 'stdout'; runId: string; data: string }
  | { type: 'stderr'; runId: string; data: string }
  | { type: 'done'; runId: string; result: ScriptRunResult };

/** Callback for receiving streaming script execution events */
export type ScriptRunCallback = (event: ScriptRunEvent) => void;

/** Result of a single script execution */
export interface ScriptRunResult {
  /** Unique id for this execution */
  runId: string;
  /** Id of the script that was run (from its frontmatter) */
  scriptId: string;
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
  /**
   * Id for this execution. Callers pass their own so they can correlate
   * streamed events with the run they started; one is generated otherwise.
   */
  runId?: string;
  /** Timeout in milliseconds (defaults to 5 minutes) */
  timeout?: number;
  /** Optional callback for real-time streaming output */
  onEvent?: ScriptRunCallback;
}

/** A run currently in flight */
interface ActiveRun {
  runId: string;
  scriptId: string;
  scriptName: string;
  projectPath: string;
  startedAt: string;
  child: ChildProcess;
}

/** Public view of a run in flight */
export interface ActiveRunInfo {
  runId: string;
  scriptId: string;
  scriptName: string;
  projectPath: string;
  startedAt: string;
}

/** Filters for querying run history */
export interface HistoryQuery {
  /** Maximum number of entries to return */
  limit?: number;
  /** Only return runs of this script */
  scriptId?: string;
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
 * Discovers scripts in a project's `.dmaker/deploy` folder, executes them
 * via `spawn`, captures stdout/stderr in memory, streams output through an
 * optional callback, and maintains an in-memory run history.
 */
export class DeployScriptRunner {
  /** In-memory run history (most recent first) */
  private history: ScriptRunResult[] = [];

  /**
   * Runs currently in flight, keyed by runId. Keying by run rather than by
   * script is what lets several scripts — or the same script twice — run at
   * once, each with its own output stream and stop button.
   */
  private activeRuns = new Map<string, ActiveRun>();

  /** Runs the caller asked to stop, so their result can say so */
  private cancelledRuns = new Set<string>();

  // -------------------------------------------------------------------------
  // Script discovery
  // -------------------------------------------------------------------------

  /**
   * Get the deploy folder path for a project.
   *
   * @param projectPath - Absolute path to the project directory
   * @returns Absolute path to `{projectPath}/.dmaker/deploy`
   */
  getDeployFolderPath(projectPath: string): string {
    return path.join(getDmakerDir(projectPath), 'deploy');
  }

  /**
   * List available deploy scripts in the project's deploy folder.
   *
   * Recursively scans subdirectories so scripts can be organized in nested
   * folders (e.g. `.dmaker/deploy/infra/setup.sh`). Returns an empty
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
        const meta = await this.ensureScriptId(fullPath, ext);
        const stats = await secureFs.stat(fullPath);
        scripts.push({
          id: meta.id,
          title: meta.name,
          description: meta.description,
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
  // Script identity
  // -------------------------------------------------------------------------

  /**
   * Read a script's frontmatter, stamping a fresh id into the file when it
   * has none.
   *
   * Discovery is where ids get assigned, so every script the UI ever shows
   * already has a stable identity for its run history to hang off. A file we
   * cannot write (permissions, read-only checkout) still gets an id for this
   * process's lifetime — it just will not persist.
   *
   * @param scriptPath - Absolute path to the script file
   * @param extension - Script extension, which decides the comment prefix
   * @returns The script's frontmatter
   */
  private async ensureScriptId(scriptPath: string, extension: string): Promise<ScriptMeta> {
    let content: string;
    try {
      content = String(await secureFs.readFile(scriptPath, 'utf-8'));
    } catch (error) {
      logger.warn(`Could not read script for frontmatter ${scriptPath}:`, error);
      return { id: generateScriptId() };
    }

    const { meta, updatedContent } = ensureFrontmatter(content, extension);
    if (updatedContent === null) return meta;

    try {
      await secureFs.writeFile(scriptPath, updatedContent, 'utf-8');
      logger.info(`Stamped script id ${meta.id} into ${scriptPath}`);
    } catch (error) {
      logger.warn(`Could not stamp script id into ${scriptPath}:`, error);
    }
    return meta;
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
    const runId = options.runId || `run_${crypto.randomBytes(8).toString('hex')}`;

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

    const meta = await this.ensureScriptId(scriptPath, ext);

    const script: DeployScript = {
      id: meta.id,
      title: meta.name,
      description: meta.description,
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

    onEvent?.({ type: 'start', runId, script });

    const result = await this.spawnScript(runId, script, projectPath, startedAt, timeout, onEvent);
    result.startedAt = startedAt;
    result.duration = Date.now() - startTime;

    onEvent?.({ type: 'done', runId, result });

    // Store in history
    this.addToHistory(result);

    return result;
  }

  /**
   * Spawn a script process and capture its output.
   */
  private spawnScript(
    runId: string,
    script: DeployScript,
    projectPath: string,
    startedAt: string,
    timeout: number,
    onEvent?: ScriptRunCallback
  ): Promise<ScriptRunResult> {
    return new Promise<ScriptRunResult>((resolve) => {
      const { shell, args } = buildSpawnArgs(script.path, script.extension);

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

      this.activeRuns.set(runId, {
        runId,
        scriptId: script.id,
        scriptName: script.name,
        projectPath,
        startedAt,
        child,
      });

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
        onEvent?.({ type: 'stdout', runId, data: text });
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        onEvent?.({ type: 'stderr', runId, data: text });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        this.activeRuns.delete(runId);
        resolve({
          runId,
          scriptId: script.id,
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
        const wasCancelled = this.cancelledRuns.delete(runId);
        this.activeRuns.delete(runId);

        if (timedOut) {
          resolve({
            runId,
            scriptId: script.id,
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

        if (wasCancelled) {
          resolve({
            runId,
            scriptId: script.id,
            success: false,
            script,
            stdout,
            stderr,
            exitCode: code,
            error: 'Run cancelled',
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
          runId,
          scriptId: script.id,
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
  // Run control
  // -------------------------------------------------------------------------

  /**
   * Cancel a run in flight.
   *
   * Sends SIGTERM, escalating to SIGKILL if the process is still alive five
   * seconds later. The run still completes normally through `runScript`, but
   * its result is marked as cancelled.
   *
   * @param runId - Id of the run to stop
   * @returns Whether a matching run was found
   */
  cancelRun(runId: string): boolean {
    const run = this.activeRuns.get(runId);
    if (!run) return false;

    logger.info(`Cancelling deploy run ${runId} (${run.scriptName})`);
    this.cancelledRuns.add(runId);
    run.child.kill('SIGTERM');
    setTimeout(() => {
      if (!run.child.killed) {
        run.child.kill('SIGKILL');
      }
    }, 5000);
    return true;
  }

  /**
   * List the runs currently in flight.
   *
   * @param scriptId - Optionally narrow to one script
   */
  getActiveRuns(scriptId?: string): ActiveRunInfo[] {
    const runs: ActiveRunInfo[] = [];
    for (const run of this.activeRuns.values()) {
      if (scriptId && run.scriptId !== scriptId) continue;
      runs.push({
        runId: run.runId,
        scriptId: run.scriptId,
        scriptName: run.scriptName,
        projectPath: run.projectPath,
        startedAt: run.startedAt,
      });
    }
    return runs;
  }

  // -------------------------------------------------------------------------
  // Run history
  // -------------------------------------------------------------------------

  /**
   * Get the run history, most recent first.
   *
   * @param query - A plain number is treated as a limit; an object may also
   *   narrow the results to a single script.
   * @returns Array of past script run results
   */
  getHistory(query?: number | HistoryQuery): ScriptRunResult[] {
    const { limit, scriptId } = typeof query === 'number' ? { limit: query } : (query ?? {});

    const entries = scriptId
      ? this.history.filter((run) => run.scriptId === scriptId)
      : this.history;

    if (limit !== undefined && limit > 0) {
      return entries.slice(0, limit);
    }
    return [...entries];
  }

  /**
   * Clear run history.
   *
   * @param scriptId - Clear only this script's runs; omit to clear all
   * @returns How many entries were removed
   */
  clearHistory(scriptId?: string): number {
    if (!scriptId) {
      const cleared = this.history.length;
      this.history = [];
      return cleared;
    }
    const before = this.history.length;
    this.history = this.history.filter((run) => run.scriptId !== scriptId);
    return before - this.history.length;
  }

  /**
   * Remove a single run from the history.
   *
   * @param runId - Id of the run to drop
   * @returns Whether a matching run was found
   */
  deleteRun(runId: string): boolean {
    const before = this.history.length;
    this.history = this.history.filter((run) => run.runId !== runId);
    return this.history.length < before;
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
    for (const run of this.activeRuns.values()) {
      logger.info(`Killing active deploy script: ${run.scriptName} (${run.runId})`);
      run.child.kill('SIGTERM');
    }
    this.activeRuns.clear();
    this.cancelledRuns.clear();
    this.history = [];
  }
}

// Singleton instance
export const deployScriptRunner = new DeployScriptRunner();
