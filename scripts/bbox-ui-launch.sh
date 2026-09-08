#!/usr/bin/env bash
# Launch bbox-ui: bring the dev servers up if they are not already, then open
# the playground in its own app window.
#
# WHY idempotent rather than "start servers": this is wired to a dock icon, so
# assume it WILL be clicked twice. A second click must attach to the running
# tree and open a window, never bind a second server or kill the first.
set -euo pipefail

REPO="/home/bam/bbox-ui"
PORT="${BBOX_UI_PORT:-5193}"
URL="http://127.0.0.1:${PORT}"
LOG="${XDG_CACHE_HOME:-$HOME/.cache}/bbox-ui/demo.log"
# WHY a dedicated profile: never touch Zach's signed-in Chrome session, and
# give the dock entry a real standalone window rather than a tab in his browser.
PROFILE="${XDG_CACHE_HOME:-$HOME/.cache}/bbox-ui/chrome-profile"

mkdir -p "$(dirname "$LOG")" "$PROFILE"

up() { curl -sf -o /dev/null --max-time 2 "$URL/" 2>/dev/null; }

if ! up; then
  echo "bbox-ui: starting dev servers..." | tee -a "$LOG"
  nohup pnpm --dir "$REPO" run demo >>"$LOG" 2>&1 &
  for _ in $(seq 1 90); do
    up && break
    sleep 1
  done
fi

if ! up; then
  echo "bbox-ui: server did not come up on ${PORT}; see ${LOG}" >&2
  # Surface the failure to a desktop launcher, which has no terminal to print to.
  command -v notify-send >/dev/null 2>&1 && \
    notify-send "bbox-ui" "Dev server failed to start. See ${LOG}"
  exit 1
fi

exec /usr/bin/google-chrome-stable \
  --app="$URL" \
  --user-data-dir="$PROFILE" \
  --class=bbox-ui \
  --window-size=1600,1000
