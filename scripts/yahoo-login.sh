#!/usr/bin/env bash
# One-time step: open a normal (non-kiosk) browser window on the dashboard's own profile
# so you can sign in to Yahoo and tick "Stay signed in". Close the window when done.
# Run this while the kiosk is NOT running (Chrome allows one window per profile).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$DIR/scripts/kiosk.env" ]; then
  # shellcheck disable=SC1091
  . "$DIR/scripts/kiosk.env"
fi

PROFILE="${DASHBOARD_PROFILE:-$HOME/.config/wall-dashboard-chrome}"
YAHOO_URL="${YAHOO_MATCHUP_URL:-https://football.fantasysports.yahoo.com/f1/46800/matchup}"

BROWSER="$(command -v google-chrome || true)"
if [ -z "$BROWSER" ]; then
  echo "Google Chrome not found. Run scripts/setup.sh first." >&2
  exit 1
fi

mkdir -p "$PROFILE"
exec "$BROWSER" --user-data-dir="$PROFILE" --no-first-run "$YAHOO_URL"
