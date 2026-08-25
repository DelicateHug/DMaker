#!/usr/bin/env bash
#
# Brings up a virtual display, then hands over to whatever command was asked
# for. Chromium runs headed against this display — the browser believes it has
# a real screen, so it takes the same code paths a user's browser would, and
# screenshots come out of a genuinely rendered window.
#
# The display is invisible to anyone outside the container. Screenshots are the
# only way its contents leave, which is exactly the intent: tests run unseen
# and report back in pictures.
set -euo pipefail

DISPLAY_NUM="${DMAKER_DISPLAY_NUM:-99}"
SCREEN_GEOMETRY="${DMAKER_SCREEN_GEOMETRY:-1280x720x24}"
export DISPLAY=":${DISPLAY_NUM}"

cleanup() {
  if [[ -n "${XVFB_PID:-}" ]] && kill -0 "${XVFB_PID}" 2>/dev/null; then
    kill "${XVFB_PID}" 2>/dev/null || true
    wait "${XVFB_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

Xvfb "${DISPLAY}" -screen 0 "${SCREEN_GEOMETRY}" -nolisten tcp -noreset >/tmp/xvfb.log 2>&1 &
XVFB_PID=$!

# Xvfb creates its socket a moment after forking; starting Chromium before
# then fails with a bare "cannot open display", which reads like a config
# error rather than a race. Wait for the socket instead of sleeping blind.
for _ in $(seq 1 100); do
  if [[ -e "/tmp/.X11-unix/X${DISPLAY_NUM}" ]]; then
    break
  fi
  if ! kill -0 "${XVFB_PID}" 2>/dev/null; then
    echo "Xvfb exited before the display was ready:" >&2
    cat /tmp/xvfb.log >&2
    exit 1
  fi
  sleep 0.1
done

if [[ ! -e "/tmp/.X11-unix/X${DISPLAY_NUM}" ]]; then
  echo "Xvfb did not create display ${DISPLAY} within 10s:" >&2
  cat /tmp/xvfb.log >&2
  exit 1
fi

exec "$@"
