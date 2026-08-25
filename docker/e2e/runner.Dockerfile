# DMaker E2E runner image — layer 2 of 3.
#
# Adds the harness on top of the base browser layer: the Xvfb entrypoint and
# the Playwright test runner. Small and quick to rebuild, so iterating on the
# harness never re-downloads a browser.
#
#   docker build -f docker/e2e/runner.Dockerfile -t dmaker/e2e-runner:pw1.57.0 .

ARG BASE_IMAGE=dmaker/e2e-base:pw1.57.0
FROM ${BASE_IMAGE}

ARG PLAYWRIGHT_VERSION=1.57.0

# Installed globally rather than into a project, so a mounted project directory
# does not have to carry its own copy of the runner.
RUN npm install -g --no-audit --no-fund \
        @playwright/test@${PLAYWRIGHT_VERSION} \
        playwright@${PLAYWRIGHT_VERSION} \
    && rm -rf /root/.npm

# Node resolves a bare import by walking up from the importing file looking for
# node_modules, ending at /node_modules — so this one link makes the runner
# importable from any mounted directory. NODE_PATH alone does not: ESM ignores
# it entirely, and a mounted project directory shadows anything placed inside
# the working directory.
RUN ln -s /usr/local/lib/node_modules /node_modules

ENV NODE_PATH=/usr/local/lib/node_modules \
    DMAKER_DISPLAY_NUM=99 \
    DMAKER_SCREEN_GEOMETRY=1280x720x24

# Baked in rather than mounted: a project layer built on top of this image
# should not have to know where DMaker keeps its harness.
COPY docker/e2e/driver.mjs /opt/dmaker/driver.mjs

COPY docker/e2e/entrypoint.sh /usr/local/bin/dmaker-entrypoint
# Checked out on Windows this file may carry CRLF endings, which the kernel
# reads as part of the interpreter path and reports as "no such file".
RUN sed -i 's/\r$//' /usr/local/bin/dmaker-entrypoint \
    && chmod +x /usr/local/bin/dmaker-entrypoint

WORKDIR /work
RUN chown runner:runner /work
USER runner

LABEL org.opencontainers.image.title="DMaker E2E runner" \
      dmaker.layer="runner" \
      dmaker.playwright.version="${PLAYWRIGHT_VERSION}"

# dumb-init reaps the browser's orphaned children, so a cancelled run does not
# leave zombie Chromium processes holding the display open.
ENTRYPOINT ["dumb-init", "--", "dmaker-entrypoint"]
CMD ["bash"]
