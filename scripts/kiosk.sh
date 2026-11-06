#!/usr/bin/env bash
# Launch the wall dashboard full screen in Chrome kiosk mode.
#  - serves the project folder on localhost so fetch() of config.json works
#  - runs the tab controller so the Fantasy screen can show your Yahoo matchup page
#
# Optional settings go in scripts/kiosk.env (see kiosk.env.example).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$DIR/scripts/kiosk.env" ]; then
  # shellcheck disable=SC1091
  . "$DIR/scripts/kiosk.env"
fi

PORT="${DASHBOARD_PORT:-8080}"
DEBUG_PORT="${DASHBOARD_DEBUG_PORT:-9222}"
CONTROLLER_PORT="${DASHBOARD_CONTROLLER_PORT:-8081}"
PROFILE="${DASHBOARD_PROFILE:-$HOME/.config/wall-dashboard-chrome}"
YAHOO_URL="${YAHOO_MATCHUP_URL:-https://football.fantasysports.yahoo.com/f1/46800/matchup}"

cd "$DIR"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!

python3 "$DIR/scripts/tab_controller.py" \
  --debug-port "$DEBUG_PORT" \
  --listen-port "$CONTROLLER_PORT" \
  --dashboard-origin "http://127.0.0.1:${PORT}" \
  --captures-dir "$DIR/captures" \
  --yahoo-url "$YAHOO_URL" >/dev/null 2>&1 &
CONTROLLER_PID=$!

trap 'kill "$SERVER_PID" "$CONTROLLER_PID" 2>/dev/null || true' EXIT

# Keep the screen awake (ignore failures on systems without xset, e.g. Wayland).
xset s off -dpms s noblank 2>/dev/null || true

BROWSER="$(command -v google-chrome || true)"
if [ -z "$BROWSER" ]; then
  echo "Google Chrome not found. Run scripts/setup.sh first." >&2
  exit 1
fi

mkdir -p "$PROFILE"
sleep 1

# A dedicated profile keeps the Yahoo sign-in between restarts and is required for the
# remote debugging port in current Chrome versions. The port is bound to localhost.
# The background flags keep the Yahoo tab updating itself while the dashboard is in front.
"$BROWSER" \
  --kiosk \
  --user-data-dir="$PROFILE" \
  --remote-debugging-port="$DEBUG_PORT" \
  --remote-debugging-address=127.0.0.1 \
  --disable-renderer-backgrounding \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --no-first-run \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  "http://127.0.0.1:${PORT}/index.html"
