#!/usr/bin/env bash
# Save what the hidden Yahoo tab currently shows (HTML, plain text, screenshot) into captures/
# so the matchup extractor can be tuned to the real page. Run it while the kiosk is running.
# The files contain whatever is on the page, including your account name, so look them over
# before sharing and do not commit them (captures/ is git-ignored).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$DIR/scripts/kiosk.env" ]; then
  # shellcheck disable=SC1091
  . "$DIR/scripts/kiosk.env"
fi

PORT="${DASHBOARD_PORT:-8080}"
CONTROLLER_PORT="${DASHBOARD_CONTROLLER_PORT:-8081}"

curl -fsS -H "Origin: http://127.0.0.1:${PORT}" "http://127.0.0.1:${CONTROLLER_PORT}/capture"
echo
