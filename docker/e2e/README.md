# DMaker E2E sandbox

A Linux container that runs a **real, headed Chromium** on a virtual display,
so tests and agents can drive a web app the way a person would and report back
in screenshots. Nothing appears on your desktop — the display exists only
inside the container, and pictures are the only way its contents come out.

## Why headed, not headless

Headless Chromium takes different code paths: it skips compositing, and window
sizing behaves differently. A layout can look correct headless and be broken on
a real screen. Running headed on Xvfb costs almost nothing and means a
screenshot is a photograph of what a user would actually see.

## Layers

Built as a stack so the expensive part is paid for once and project images are
cheap to add, rebuild, and throw away.

| Image                        | Built from          | Holds                                          | Rebuild cost    |
| ---------------------------- | ------------------- | ---------------------------------------------- | --------------- |
| `dmaker/e2e-base:pw1.57.0`   | `base.Dockerfile`   | Node 22, Chromium + its system libraries, Xvfb | Minutes — avoid |
| `dmaker/e2e-runner:pw1.57.0` | `runner.Dockerfile` | Playwright runner, Xvfb entrypoint             | Seconds         |
| _(per project)_              | yours               | Your app's dependencies                        | Yours           |

Docker stores each layer once, so several project images sharing this base cost
one copy of the browser between them, not one each.

## Build

```bash
docker build -f docker/e2e/base.Dockerfile   -t dmaker/e2e-base:pw1.57.0   .
docker build -f docker/e2e/runner.Dockerfile -t dmaker/e2e-runner:pw1.57.0 .
```

`PLAYWRIGHT_VERSION` is pinned to the repo's `@playwright/test`. **Move them
together** — a browser downloaded by one version is not guaranteed to be
driveable by another.

## Verify it works

```bash
docker run --rm \
  -v "$(pwd -W)/docker/e2e:/work:ro" \
  -v "/path/to/output:/out" \
  dmaker/e2e-runner:pw1.57.0 node /work/smoke.mjs
```

Writes `smoke.png` and `smoke.json`, and fails loudly if the browser started
but rendered nothing. On Git Bash, `MSYS_NO_PATHCONV=1` stops the shell
rewriting the container-side paths.

## Running a scenario

`driver.mjs` is baked into the runner at `/opt/dmaker/driver.mjs`. It reads
`/out/scenario.json`, starts the project's app, drives the browser, and writes
one PNG per step plus `report.json` back to `/out`.

The scenario arrives as a **file, not argv** — step text is arbitrary agent
content and does not survive a shell argument list intact.

```json
{
  "scenario": {
    "name": "login works",
    "steps": [
      { "name": "home", "goto": "/", "expectText": "Sign in" },
      { "name": "fill", "fill": { "selector": "#email", "value": "a@b.c" } },
      { "name": "submit", "click": "[data-testid=submit]", "expectText": "Welcome" }
    ]
  },
  "app": { "startCommand": "npm run dev", "port": 3000, "readyTimeoutMs": 120000 },
  "viewport": { "width": 1280, "height": 720 }
}
```

A failing step is photographed too — a picture of the failure is the most
useful thing it can leave behind — and the steps after it are marked `skipped`
rather than run, since they almost always depend on it and their failures would
be noise.

From the server, `E2ESandboxService` does this for you and `POST /api/e2e/run`
exposes it. A run lands in `{project}/.dmaker/e2e/{timestamp}-{scenario}/`.

### Two kinds of failure, kept apart

`status: "failed"` means the scenario ran and an assertion did not hold — a
finding. `status: "error"` with a `setupError` means it never got as far as the
browser: no Docker, image missing, app never opened its port. Collapsing the
two sends people looking in the wrong place, so they stay distinct all the way
out to the caller.

## Size

~1.3 GB, nearly all of it Chromium and the system libraries it links against.
A browser image is not small; what is avoidable was removed:

- **Headless shell (~250 MB)** — Playwright ships a second headless-only
  Chromium. This harness runs headed, so it would never launch.
- **A duplicated 148 MB layer** — `chmod -R` in its own `RUN` rewrites every
  file it touches, and Docker stores the rewritten copies _on top of_ the
  originals rather than replacing them. Permission changes belong in the same
  `RUN` that creates the files.
- Docs, man pages, and locales.

The remaining ~600 MB of browser and ~270 MB of `/usr/lib` is the floor for
running Chromium at all.

## Gotchas worth keeping

**Screenshots on a cold browser.** `load` only means the document parsed; the
compositor may not have drawn yet, and capturing then fails outright with
`Unable to capture screenshot` rather than returning a blank image. Wait for
two nested animation frames first. `smoke.mjs` shows the pattern, including a
retry that re-throws anything that is not this specific error.

**Window size.** Left alone, Chromium may open a window smaller than the page
it is asked to render, and the compositor refuses to capture that. Pass
`--window-size` to match the viewport.

**ESM cannot see `NODE_PATH`.** The runner links
`/usr/local/lib/node_modules` to `/node_modules`, which Node's resolver reaches
by walking up from any mounted directory. Setting `NODE_PATH` alone does not
work for `import`.

**Line endings.** `entrypoint.sh` is `sed`-stripped of CR during the build. A
CRLF checkout otherwise makes the kernel read `\r` as part of the interpreter
path and report a confusing "no such file".
