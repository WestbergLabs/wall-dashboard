#!/usr/bin/env bash
# Launch the wall dashboard full screen in Chromium kiosk mode.
# Serves the project folder on localhost so fetch() of config.json works.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${DASHBOARD_PORT:-8080}"

cd "$DIR"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

# Keep the screen awake (ignore failures on systems without xset, e.g. Wayland).
xset s off -dpms s noblank 2>/dev/null || true

BROWSER="$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)"
if [ -z "$BROWSER" ]; then
  echo "No Chromium or Chrome found. Install one first (see README)." >&2
  exit 1
fi

sleep 1
"$BROWSER" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  "http://127.0.0.1:${PORT}/index.html"
