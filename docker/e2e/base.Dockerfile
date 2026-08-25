# DMaker E2E base image — layer 1 of 3.
#
# The heavy, slow-moving layer: an OS, Node, and a real Chromium with the
# system libraries it needs to open a window. Everything expensive lives here
# so it is built once and shared by every project image stacked on top.
#
# Deliberately NOT the official Playwright image (~2GB): that ships three
# browser engines and a desktop's worth of fonts. Chromium alone is enough to
# drive a web app, and this comes out far smaller.
#
#   docker build -f docker/e2e/base.Dockerfile -t dmaker/e2e-base:pw1.57.0 .

FROM node:22-bookworm-slim

# Pinned to the repo's @playwright/test. A browser downloaded by one version
# is not guaranteed to be driveable by another, so these move together.
ARG PLAYWRIGHT_VERSION=1.57.0

ENV DEBIAN_FRONTEND=noninteractive \
    # Browsers go somewhere every stacked layer and every user can reach,
    # rather than into a home directory that a different USER cannot read.
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_ENV=production

# One layer on purpose. Every step below either adds files the next step
# deletes, or changes their permissions — and in a second RUN those would each
# be stored again on top of the originals rather than replacing them. Combining
# them keeps only the end state.
#
# xvfb gives Chromium a display to open a real window on; the rest are
# Chromium's own runtime libraries, installed by Playwright.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        xvfb \
        ca-certificates \
        dumb-init \
    && npx --yes playwright@${PLAYWRIGHT_VERSION} install --with-deps chromium \
    # Playwright ships a second, headless-only Chromium alongside the real one.
    # This harness runs headed so a screenshot shows a genuinely composited
    # window — the shell would never be launched, and it costs ~250MB.
    && rm -rf /ms-playwright/chromium_headless_shell-* \
    # A non-root user, because a browser rendering untrusted pages should not
    # be root. Its sandbox needs the browsers readable, hence the chmod here
    # rather than in a layer of its own.
    && useradd --create-home --shell /bin/bash runner \
    && chmod -R a+rx /ms-playwright \
    && apt-get purge -y --auto-remove \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /root/.npm /tmp/* \
        /usr/share/doc /usr/share/man /usr/share/locale

LABEL org.opencontainers.image.title="DMaker E2E base" \
      org.opencontainers.image.description="Node 22 + Chromium + Xvfb for headed browser tests" \
      dmaker.layer="base" \
      dmaker.playwright.version="${PLAYWRIGHT_VERSION}"

CMD ["node", "--version"]
