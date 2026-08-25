/**
 * Update Prod — pull the latest DMaker, keep local work, rebuild, restart.
 *
 * The flow is deliberately conservative about the working tree, because the
 * checkout being updated is the same one the user is actively developing in:
 *
 *   1. stash local changes (including untracked)
 *   2. `git pull --rebase` the tracking branch
 *   3. pop the stash back on top
 *   4. rebuild packages, UI and server
 *   5. exit with RESTART_EXIT_CODE so the launcher brings prod back up
 *
 * Any conflict in steps 2 or 3 aborts cleanly: the repo is reset to the exact
 * commit and working tree it had before the update started, prod keeps running
 * the build it already has, and the conflicting paths are reported so the user
 * can resolve them by hand.
 *
 * Running features are unaffected throughout — they live in the runner daemon,
 * a separate process that the restart in step 5 never touches.
 */

import { spawn } from 'child_process';
import { createLogger } from '@dmaker/utils';
import type { EventEmitter } from '../lib/events.js';
import { RESTART_EXIT_CODE, getSelfProjectPath, isSelfUpdateEnabled } from '../lib/runtime-env.js';

const logger = createLogger('SelfUpdate');

/** Long enough for a cold `npm install` on a slow disk. */
const COMMAND_TIMEOUT_MS = 20 * 60 * 1000;

/** Grace period so the HTTP response and final event flush before we exit. */
const RESTART_DELAY_MS = 750;

export type SelfUpdatePhase =
  | 'preflight'
  | 'stash'
  | 'pull'
  | 'unstash'
  | 'install'
  | 'build'
  | 'restart'
  | 'done'
  | 'failed';

export interface SelfUpdateEvent {
  type: 'self-update';
  phase: SelfUpdatePhase;
  status: 'running' | 'ok' | 'error';
  message: string;
  /** Command output, streamed line by line while a step runs. */
  output?: string;
  /** Paths git reported as conflicting, when the update aborted on a conflict. */
  conflicts?: string[];
}

export interface SelfUpdateResult {
  success: boolean;
  phase: SelfUpdatePhase;
  message: string;
  conflicts?: string[];
  /** Commit the repo was on before the update, and after it. */
  fromCommit?: string;
  toCommit?: string;
  /** True when the server is about to exit for the launcher to restart it. */
  restarting?: boolean;
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class SelfUpdateService {
  private running = false;
  private lastResult: SelfUpdateResult | null = null;

  constructor(private readonly events: EventEmitter) {}

  isRunning(): boolean {
    return this.running;
  }

  getLastResult(): SelfUpdateResult | null {
    return this.lastResult;
  }

  // -------------------------------------------------------------------------
  // Command plumbing
  // -------------------------------------------------------------------------

  private emit(event: SelfUpdateEvent): void {
    this.events.emit('self-update:event', event);
  }

  /**
   * Run a command in the checkout, streaming its output to the UI.
   *
   * `npm` on Windows is a `.cmd` shim, which `spawn` can only launch through a
   * shell — the same rule `@dmaker/platform`'s subprocess helper follows.
   */
  private runCommand(
    command: string,
    args: string[],
    cwd: string,
    phase: SelfUpdatePhase
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const needsShell =
        process.platform === 'win32' &&
        (command.toLowerCase().endsWith('.cmd') || command === 'npm' || command === 'npx');

      logger.info(`$ ${command} ${args.join(' ')}`);
      const child = spawn(command, args, {
        cwd,
        shell: needsShell,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
      }, COMMAND_TIMEOUT_MS);

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        this.emit({ type: 'self-update', phase, status: 'running', message: '', output: text });
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        this.emit({ type: 'self-update', phase, status: 'running', message: '', output: text });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({ code: -1, stdout, stderr: `${stderr}${error.message}` });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, stdout, stderr });
      });
    });
  }

  private async git(args: string[], cwd: string, phase: SelfUpdatePhase): Promise<CommandResult> {
    return this.runCommand('git', args, cwd, phase);
  }

  /** Read-only git call whose output we want but whose noise we don't. */
  private async gitQuiet(args: string[], cwd: string): Promise<CommandResult> {
    return new Promise((resolve) => {
      const child = spawn('git', args, { cwd, env: { ...process.env } });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (c: Buffer) => (stdout += c.toString()));
      child.stderr?.on('data', (c: Buffer) => (stderr += c.toString()));
      child.on('error', (error) => resolve({ code: -1, stdout, stderr: error.message }));
      child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
    });
  }

  /** Paths git currently reports as conflicted (unmerged). */
  private async getConflicts(cwd: string): Promise<string[]> {
    const res = await this.gitQuiet(['diff', '--name-only', '--diff-filter=U'], cwd);
    return res.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private fail(phase: SelfUpdatePhase, message: string, conflicts?: string[]): SelfUpdateResult {
    logger.error(`Update failed at ${phase}: ${message}`);
    this.emit({ type: 'self-update', phase, status: 'error', message, conflicts });
    const result: SelfUpdateResult = { success: false, phase, message, conflicts };
    this.lastResult = result;
    return result;
  }

  // -------------------------------------------------------------------------
  // The update
  // -------------------------------------------------------------------------

  async update(): Promise<SelfUpdateResult> {
    if (this.running) {
      return { success: false, phase: 'preflight', message: 'An update is already running.' };
    }
    if (!isSelfUpdateEnabled()) {
      return {
        success: false,
        phase: 'preflight',
        message:
          'Update Prod is only available on a launcher-managed prod server with DMAKER_SELF_PROJECT set.',
      };
    }

    const cwd = getSelfProjectPath();
    if (!cwd) {
      return { success: false, phase: 'preflight', message: 'No self project path configured.' };
    }

    this.running = true;
    try {
      return await this.runUpdate(cwd);
    } finally {
      this.running = false;
    }
  }

  private async runUpdate(cwd: string): Promise<SelfUpdateResult> {
    // --- preflight ---------------------------------------------------------
    this.emit({
      type: 'self-update',
      phase: 'preflight',
      status: 'running',
      message: 'Checking the repository…',
    });

    const headRes = await this.gitQuiet(['rev-parse', 'HEAD'], cwd);
    if (headRes.code !== 0) {
      return this.fail('preflight', `${cwd} is not a git repository.`);
    }
    const preHead = headRes.stdout.trim();

    const branchRes = await this.gitQuiet(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    const branch = branchRes.stdout.trim();
    if (!branch || branch === 'HEAD') {
      return this.fail('preflight', 'HEAD is detached — check out a branch before updating.');
    }

    const existingConflicts = await this.getConflicts(cwd);
    if (existingConflicts.length > 0) {
      return this.fail(
        'preflight',
        'The working tree already has unresolved conflicts. Resolve them first.',
        existingConflicts
      );
    }

    const remoteRes = await this.gitQuiet(['remote'], cwd);
    if (!remoteRes.stdout.split('\n').some((r) => r.trim() === 'origin')) {
      return this.fail('preflight', 'No `origin` remote to pull from.');
    }

    // --- stash -------------------------------------------------------------
    const statusRes = await this.gitQuiet(['status', '--porcelain'], cwd);
    const isDirty = statusRes.stdout.trim().length > 0;
    let didStash = false;

    if (isDirty) {
      this.emit({
        type: 'self-update',
        phase: 'stash',
        status: 'running',
        message: 'Stashing local changes…',
      });
      const stash = await this.git(
        ['stash', 'push', '--include-untracked', '-m', `dmaker-update-prod ${preHead.slice(0, 8)}`],
        cwd,
        'stash'
      );
      if (stash.code !== 0) {
        return this.fail('stash', `Could not stash local changes: ${stash.stderr.trim()}`);
      }
      didStash = true;
      this.emit({
        type: 'self-update',
        phase: 'stash',
        status: 'ok',
        message: 'Local changes stashed.',
      });
    } else {
      this.emit({
        type: 'self-update',
        phase: 'stash',
        status: 'ok',
        message: 'Working tree is clean — nothing to stash.',
      });
    }

    /**
     * Put the repo back exactly as we found it: drop whatever half-finished
     * rebase or merge we are in, return to the original commit, and reapply the
     * stash onto it. Applying onto `preHead` is guaranteed to be clean, because
     * that is the commit the stash was taken from.
     */
    const rollback = async (): Promise<void> => {
      await this.gitQuiet(['rebase', '--abort'], cwd);
      await this.gitQuiet(['merge', '--abort'], cwd);
      await this.gitQuiet(['reset', '--hard', preHead], cwd);
      if (didStash) {
        await this.gitQuiet(['stash', 'pop'], cwd);
      }
    };

    // --- pull --------------------------------------------------------------
    this.emit({
      type: 'self-update',
      phase: 'pull',
      status: 'running',
      message: `Pulling origin/${branch}…`,
    });

    const pull = await this.git(['pull', '--rebase', 'origin', branch], cwd, 'pull');
    if (pull.code !== 0) {
      const conflicts = await this.getConflicts(cwd);
      await rollback();
      return this.fail(
        'pull',
        conflicts.length > 0
          ? `Pull hit conflicts in ${conflicts.length} file(s). The repo was rolled back and your local changes restored — resolve the conflicts and try again.`
          : `Pull failed: ${pull.stderr.trim() || pull.stdout.trim()}`,
        conflicts.length > 0 ? conflicts : undefined
      );
    }

    const postPullHead = (await this.gitQuiet(['rev-parse', 'HEAD'], cwd)).stdout.trim();
    this.emit({
      type: 'self-update',
      phase: 'pull',
      status: 'ok',
      message:
        postPullHead === preHead
          ? 'Already up to date with origin.'
          : `Updated to ${postPullHead.slice(0, 8)}.`,
    });

    // --- unstash -----------------------------------------------------------
    if (didStash) {
      this.emit({
        type: 'self-update',
        phase: 'unstash',
        status: 'running',
        message: 'Reapplying local changes…',
      });
      const pop = await this.git(['stash', 'pop'], cwd, 'unstash');
      if (pop.code !== 0) {
        const conflicts = await this.getConflicts(cwd);
        await rollback();
        return this.fail(
          'unstash',
          `Your local changes conflict with what was pulled (${conflicts.length} file(s)). The repo was rolled back to where it started — resolve the overlap and try again.`,
          conflicts.length > 0 ? conflicts : undefined
        );
      }
      this.emit({
        type: 'self-update',
        phase: 'unstash',
        status: 'ok',
        message: 'Local changes reapplied.',
      });
    }

    // --- install (only when the lockfile actually moved) --------------------
    const changedFiles =
      preHead === postPullHead
        ? { stdout: '', stderr: '', code: 0 }
        : await this.gitQuiet(['diff', '--name-only', preHead, postPullHead], cwd);
    const lockfileChanged = changedFiles.stdout.split('\n').some((f) => {
      const name = f.trim();
      return (
        name === 'package-lock.json' || name.endsWith('/package.json') || name === 'package.json'
      );
    });

    if (lockfileChanged) {
      this.emit({
        type: 'self-update',
        phase: 'install',
        status: 'running',
        message: 'Dependencies changed — running npm install…',
      });
      const install = await this.runCommand('npm', ['install'], cwd, 'install');
      if (install.code !== 0) {
        return this.fail(
          'install',
          `npm install failed. Prod is still running the previous build; the pulled code is in your working tree.`
        );
      }
      this.emit({
        type: 'self-update',
        phase: 'install',
        status: 'ok',
        message: 'Dependencies installed.',
      });
    }

    // --- build -------------------------------------------------------------
    // Build the packages once, then UI and server directly, rather than via the
    // `build`/`build:server` aliases which would rebuild the packages each time.
    const buildSteps: Array<{ label: string; args: string[] }> = [
      { label: 'shared packages', args: ['run', 'build:packages'] },
      { label: 'server', args: ['run', 'build', '--workspace=apps/server'] },
      { label: 'UI', args: ['run', 'build', '--workspace=apps/ui'] },
    ];

    for (const step of buildSteps) {
      this.emit({
        type: 'self-update',
        phase: 'build',
        status: 'running',
        message: `Building ${step.label}…`,
      });
      const build = await this.runCommand('npm', step.args, cwd, 'build');
      if (build.code !== 0) {
        return this.fail(
          'build',
          `Build failed while building the ${step.label}. Prod was left running the previous build — fix the build and run Update Prod again.`
        );
      }
    }

    this.emit({ type: 'self-update', phase: 'build', status: 'ok', message: 'Build complete.' });

    // --- restart -----------------------------------------------------------
    this.emit({
      type: 'self-update',
      phase: 'restart',
      status: 'running',
      message: 'Restarting the prod server…',
    });

    const result: SelfUpdateResult = {
      success: true,
      phase: 'done',
      message:
        postPullHead === preHead
          ? 'Rebuilt from the current checkout. Restarting prod…'
          : `Updated to ${postPullHead.slice(0, 8)} and rebuilt. Restarting prod…`,
      fromCommit: preHead,
      toCommit: postPullHead,
      restarting: true,
    };
    this.lastResult = result;
    this.emit({ type: 'self-update', phase: 'done', status: 'ok', message: result.message });

    // Hand back to the launcher. Running features are in the runner daemon and
    // keep going; the UI reconnects to this server once it is back on 3009.
    setTimeout(() => {
      logger.info(`Exiting with code ${RESTART_EXIT_CODE} to request a launcher restart`);
      process.exit(RESTART_EXIT_CODE);
    }, RESTART_DELAY_MS);

    return result;
  }
}
