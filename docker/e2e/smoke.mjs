/**
 * Proves the container can do the one thing the harness depends on: open a
 * REAL browser window on the virtual display and photograph it.
 *
 * Headed on purpose. Headless Chromium is a different code path — it skips
 * compositing and window sizing, so a page can look fine headless and be
 * broken on a real screen. If this passes, screenshots from the harness are
 * pictures of what a user would actually see.
 *
 *   docker run --rm -v <out>:/out dmaker/e2e-runner:pw1.57.0 node /work/smoke.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const OUT_DIR = process.env.DMAKER_OUT_DIR || '/out';

/**
 * Block until the compositor has actually produced frames.
 *
 * `load` only means the document parsed. On a cold headed browser the window
 * can exist with nothing composited into it yet, and asking for a screenshot
 * then fails outright with "Unable to capture screenshot" rather than
 * returning a blank image. Two nested animation frames is the cheap proof that
 * a frame was drawn and another is on its way.
 */
async function waitForFirstFrame(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })
  );
}

/**
 * Screenshot, retrying only the compositor's not-ready error.
 *
 * Anything else — a closed page, a bad path — is a real failure and is
 * rethrown immediately rather than being retried into a timeout.
 */
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

const PAGE = `
<!doctype html>
<meta charset="utf-8">
<title>DMaker E2E smoke</title>
<style>
  body { margin:0; font:16px system-ui, sans-serif; background:#0b0f17; color:#e6edf3;
         height:100vh; display:grid; place-items:center; }
  .card { padding:2rem 3rem; border-radius:12px; background:#151b26; border:1px solid #263041; }
  h1 { margin:0 0 .5rem; font-size:1.25rem; }
  code { color:#7ee787; }
</style>
<div class="card">
  <h1>Headed Chromium on Xvfb</h1>
  <div>display <code id="d"></code> · viewport <code id="v"></code></div>
</div>
<script>
  document.getElementById('d').textContent = 'ok';
  document.getElementById('v').textContent = window.innerWidth + '×' + window.innerHeight;
</script>
`;

const browser = await chromium.launch({
  headless: false,
  // Size the real X window to match the viewport. Left to itself Chromium can
  // open smaller than the page it is told to render, and a capture of a window
  // smaller than its content is what the compositor refuses to produce.
  args: ['--window-size=1280,720', '--window-position=0,0'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(PAGE, { waitUntil: 'load' });
  await waitForFirstFrame(page);

  // Read back from the live page rather than trusting the launch options, so
  // a browser that started but never really rendered fails loudly here.
  const measured = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    title: document.title,
  }));

  const shot = await screenshotWhenReady(page);
  writeFileSync(`${OUT_DIR}/smoke.png`, shot);

  const report = {
    ok: measured.width > 0 && measured.height > 0,
    display: process.env.DISPLAY,
    browserVersion: browser.version(),
    ...measured,
    screenshotBytes: shot.length,
  };
  writeFileSync(`${OUT_DIR}/smoke.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));

  if (!report.ok || shot.length < 1000) {
    throw new Error(`browser rendered nothing usable: ${JSON.stringify(report)}`);
  }
} finally {
  await browser.close();
}
