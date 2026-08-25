/**
 * Runs one scenario inside the sandbox container.
 *
 * Starts the project's app, waits for it to actually serve, then drives a real
 * headed Chromium through the steps and photographs each one. Everything it
 * produces lands in /out: one PNG per step and a report.json the server reads
 * back.
 *
 * Reads the scenario from /out/scenario.json rather than argv, because step
 * text is arbitrary user/agent content and does not survive a shell argument
 * list intact.
 *
 *   node /opt/dmaker/driver.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import net from 'net';

const OUT_DIR = process.env.DMAKER_OUT_DIR || '/out';
const WORK_DIR = process.env.DMAKER_WORK_DIR || '/project';
const APP_LOG = `${OUT_DIR}/app.log`;

const config = JSON.parse(readFileSync(`${OUT_DIR}/scenario.json`, 'utf8'));
const { scenario, app, viewport = { width: 1280, height: 720 } } = config;

const startedAt = new Date();
const t0 = Date.now();

/** Screenshot name for a step — index-prefixed so the order survives sorting. */
function shotName(index, name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'step';
  return `${String(index + 1).padStart(2, '0')}-${slug}.png`;
}

/** Resolves once something is listening, or rejects when the deadline passes. */
function waitForPort(port, deadline, isAppAlive) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      // The app dying is the common failure, and waiting out the full timeout
      // to report "not ready" hides it. Fail immediately with its log instead.
      if (!isAppAlive()) {
        reject(new Error('the app exited before it started listening'));
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`nothing listening on port ${port} within the ready timeout`));
        return;
      }
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

/**
 * Resolves once the app answers on `readyPath` with a non-5xx status.
 *
 * An open port only means something bound it. A dev server can accept
 * connections while still compiling and answer 500 for several seconds, and
 * navigating then produces a screenshot of an error page that looks like a
 * genuine test failure. Asking for a real response first removes that whole
 * class of false negative.
 */
function waitForHttpReady(port, readyPath, deadline, isAppAlive) {
  const url = `http://127.0.0.1:${port}${readyPath}`;
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      if (!isAppAlive()) {
        reject(new Error('the app exited before it answered on its ready path'));
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`${url} did not return a usable response within the ready timeout`));
        return;
      }
      try {
        const response = await fetch(url, { redirect: 'manual' });
        // Anything the server actually answered counts, including a 404 — the
        // point is that it is serving, not that this exact path exists.
        if (response.status < 500) {
          resolve();
          return;
        }
      } catch {
        // Connection refused or reset mid-boot; try again below.
      }
      setTimeout(attempt, 250);
    };
    attempt();
  });
}

/** Run a command to completion, appending its output to the app log. */
function runToCompletion(command, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-lc', command], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => appendFileSync(APP_LOG, chunk));
    child.stderr.on('data', (chunk) => appendFileSync(APP_LOG, chunk));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`\`${command}\` exited with code ${code}`));
    });
  });
}

/**
 * Block until the compositor has drawn.
 *
 * `load` only means the document parsed. On a cold headed browser the window
 * can exist with nothing composited into it, and capturing then fails outright
 * rather than returning a blank image.
 */
async function waitForFirstFrame(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}

/** Screenshot, retrying only the compositor's not-ready error. */
async function screenshotWhenReady(page, attempts = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.screenshot();
    } catch (error) {
      const notComposited = /Unable to capture screenshot/i.test(String(error?.message));
      if (!notComposited || attempt >= attempts) throw error;
      await page.waitForTimeout(250 * attempt);
      await waitForFirstFrame(page);
    }
  }
}

function finish(report) {
  writeFileSync(`${OUT_DIR}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, steps: report.steps.length }));
  process.exit(report.status === 'passed' ? 0 : 1);
}

const base = {
  scenario: scenario.name,
  steps: [],
  outputDir: OUT_DIR,
  startedAt: startedAt.toISOString(),
};

// ── Start the app ──────────────────────────────────────────────────────────
let appProcess = null;
let appExited = false;

if (app?.startCommand) {
  writeFileSync(APP_LOG, '');
  const appEnv = { ...process.env, ...(app.env ?? {}), PORT: String(app.port), CI: '1' };
  const readyDeadline = Date.now() + (app.readyTimeoutMs ?? 120_000);

  // Dependencies first. This can legitimately take minutes on a cold project,
  // and it shares the ready deadline rather than having one of its own so a
  // slow install cannot quietly consume the whole budget unnoticed.
  if (app.installCommand) {
    try {
      await runToCompletion(app.installCommand, WORK_DIR, appEnv);
    } catch (error) {
      finish({
        ...base,
        status: 'error',
        setupError: `install command failed: ${error.message}`,
        appLog: readFileSync(APP_LOG, 'utf8').slice(-4000),
        durationMs: Date.now() - t0,
      });
    }
  }

  appProcess = spawn('bash', ['-lc', app.startCommand], {
    cwd: WORK_DIR,
    env: appEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group, so the cleanup below can signal the whole tree.
    // Dev servers routinely spawn a child that is the one actually holding the
    // port; killing only the shell leaves that child running and the next run
    // finds the port taken.
    detached: true,
  });
  appProcess.stdout.on('data', (chunk) => appendFileSync(APP_LOG, chunk));
  appProcess.stderr.on('data', (chunk) => appendFileSync(APP_LOG, chunk));
  appProcess.on('exit', () => {
    appExited = true;
  });

  try {
    // Port first because it is cheap and rules out "never started at all",
    // then a real request because a bound port is not the same as a serving app.
    await waitForPort(app.port, readyDeadline, () => !appExited);
    await waitForHttpReady(app.port, app.readyPath ?? '/', readyDeadline, () => !appExited);
  } catch (error) {
    finish({
      ...base,
      status: 'error',
      setupError: `app did not start: ${error.message}`,
      appLog: readFileSync(APP_LOG, 'utf8').slice(-4000),
      durationMs: Date.now() - t0,
    });
  }
}

const origin = `http://127.0.0.1:${app?.port ?? 80}`;

// ── Drive the browser ──────────────────────────────────────────────────────
let browser;
try {
  browser = await chromium.launch({
    headless: false,
    // Chromium can otherwise open a window smaller than the page it renders,
    // and the compositor refuses to capture that.
    args: [`--window-size=${viewport.width},${viewport.height}`, '--window-position=0,0'],
  });
} catch (error) {
  finish({
    ...base,
    status: 'error',
    setupError: `browser failed to launch: ${error.message}`,
    durationMs: Date.now() - t0,
  });
}

const results = [];
try {
  const page = await browser.newPage({ viewport });

  // Collected per step, so a failure reports what the page complained about
  // rather than leaving the agent to guess.
  let consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error?.message ?? error)));

  for (const [index, step] of scenario.steps.entries()) {
    const stepStart = Date.now();
    consoleErrors = [];
    try {
      if (step.goto !== undefined) {
        const url = step.goto.startsWith('http') ? step.goto : `${origin}${step.goto}`;
        await page.goto(url, { waitUntil: 'load' });
      }
      if (step.waitFor) await page.locator(step.waitFor).first().waitFor({ state: 'visible' });
      if (step.fill) await page.locator(step.fill.selector).first().fill(step.fill.value);
      if (step.click) await page.locator(step.click).first().click();

      if (step.expectText) {
        const body = await page.locator('body').innerText();
        if (!body.includes(step.expectText)) {
          throw new Error(`page does not contain ${JSON.stringify(step.expectText)}`);
        }
      }

      await waitForFirstFrame(page);

      const result = {
        name: step.name,
        status: 'passed',
        durationMs: Date.now() - stepStart,
      };
      if (step.screenshot !== false) {
        const file = shotName(index, step.name);
        writeFileSync(`${OUT_DIR}/${file}`, await screenshotWhenReady(page));
        result.screenshot = file;
      }
      if (consoleErrors.length) result.consoleErrors = consoleErrors.slice(0, 10);
      results.push(result);
    } catch (error) {
      const result = {
        name: step.name,
        status: 'failed',
        error: String(error?.message ?? error),
        durationMs: Date.now() - stepStart,
      };
      // A picture of the failure is the most useful thing a failing step can
      // leave behind, so try for one even though the step already went wrong.
      try {
        const file = shotName(index, `${step.name}-failed`);
        writeFileSync(`${OUT_DIR}/${file}`, await screenshotWhenReady(page));
        result.screenshot = file;
      } catch {
        // The page may be gone entirely; the error above is the real report.
      }
      if (consoleErrors.length) result.consoleErrors = consoleErrors.slice(0, 10);
      results.push(result);

      // Later steps almost always depend on this one having worked, so their
      // failures would be noise rather than findings.
      for (const skipped of scenario.steps.slice(index + 1)) {
        results.push({ name: skipped.name, status: 'skipped', durationMs: 0 });
      }
      break;
    }
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  if (appProcess && !appExited) {
    // Kill the group: dev servers commonly spawn a child that holds the port.
    try {
      process.kill(-appProcess.pid, 'SIGTERM');
    } catch {
      appProcess.kill('SIGTERM');
    }
  }
}

finish({
  ...base,
  status: results.some((step) => step.status === 'failed') ? 'failed' : 'passed',
  steps: results,
  durationMs: Date.now() - t0,
  ...(appProcess ? { appLog: readFileSync(APP_LOG, 'utf8').slice(-4000) } : {}),
});
