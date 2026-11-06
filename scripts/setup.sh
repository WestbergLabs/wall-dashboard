#!/usr/bin/env bash
# One-command setup for the wall dashboard tablet: Ubuntu Desktop 24.04 LTS, Google Chrome.
#
#   git clone https://github.com/WestbergLabs/wall-dashboard.git ~/wall-dashboard
#   ~/wall-dashboard/scripts/setup.sh
#
# Run it as the normal login user, not as root. It asks for sudo only to install packages.
# Safe to run again: it never overwrites your answers without asking.
#
# Options:
#   --no-install   skip package installation and the automatic login change (testing)
#   --yes          accept defaults without asking (Yahoo mode "page", no sign-in step)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL=1
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --no-install) INSTALL=0 ;;
    --yes) ASSUME_YES=1 ;;
    -h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

say()  { printf '\n== %s\n' "$*"; }
ask()  { # ask "question" "default" -> answer in $REPLY
  if [ "$ASSUME_YES" = 1 ]; then REPLY="$2"; return; fi
  read -r -p "$1 [$2] " REPLY || REPLY=""
  REPLY="${REPLY:-$2}"
}

if [ "$(id -u)" = 0 ]; then
  echo "Run this as the normal login user, not root." >&2
  exit 1
fi

# 1. Packages ---------------------------------------------------------------------------
say "1/5 Installing packages"
. /etc/os-release
if [ "${ID:-}" != "ubuntu" ]; then
  echo "This setup supports Ubuntu Desktop 24.04 LTS only (found: ${PRETTY_NAME:-unknown})." >&2
  exit 1
fi
if [ "$INSTALL" = 1 ]; then
  sudo apt-get update
  sudo apt-get install -y python3 git curl x11-xserver-utils
  if ! command -v google-chrome >/dev/null 2>&1; then
    tmp="$(mktemp --suffix=.deb)"
    curl -fsSL -o "$tmp" https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    sudo apt-get install -y "$tmp"
    rm -f "$tmp"
  fi
else
  echo "Skipped (--no-install)."
fi
command -v google-chrome >/dev/null 2>&1 || { echo "Google Chrome is not installed. Run again without --no-install." >&2; exit 1; }
echo "Browser: $(command -v google-chrome)"
python3 --version

# 2. Settings ---------------------------------------------------------------------------
say "2/5 Your settings"
ENV_FILE="$DIR/scripts/kiosk.env"
DEFAULT_URL="https://football.fantasysports.yahoo.com/f1/46800/matchup"
if [ -f "$ENV_FILE" ]; then
  echo "scripts/kiosk.env already exists, keeping it."
else
  echo "Open your league's Matchup page in any browser and copy its address."
  ask "Yahoo matchup page address" "$DEFAULT_URL"
  YAHOO_URL="$REPLY"
  case "$YAHOO_URL" in
    https://*yahoo.com/*) ;;
    *) echo "That does not look like a Yahoo address, using the default." ; YAHOO_URL="$DEFAULT_URL" ;;
  esac
  cp "$DIR/scripts/kiosk.env.example" "$ENV_FILE"
  python3 - "$ENV_FILE" "$YAHOO_URL" <<'PY'
import re, sys
path, url = sys.argv[1], sys.argv[2]
text = open(path).read()
text = re.sub(r'^YAHOO_MATCHUP_URL=.*$', 'YAHOO_MATCHUP_URL="%s"' % url.replace('"', ''), text, flags=re.M)
open(path, "w").write(text)
PY
  echo "Saved scripts/kiosk.env"
fi

echo
echo "How should the Fantasy screen work?"
echo "  1) page : show your Yahoo matchup page itself (follows Yahoo's terms)"
echo "  2) live : redraw it in the dashboard style (automated reading, against Yahoo's terms)"
echo "  3) none : no Fantasy screen"
ask "Choose 1, 2 or 3" "1"
case "$REPLY" in
  2) PROVIDER="yahoo-live" ;;
  3) PROVIDER="none" ;;
  *) PROVIDER="yahoo-page" ;;
esac
python3 - "$DIR/config.local.json" "$PROVIDER" <<'PY'
import json, os, sys
path, provider = sys.argv[1], sys.argv[2]
cfg = json.load(open(path)) if os.path.exists(path) else {}
cfg.setdefault("fantasy", {})["provider"] = provider
if provider == "none":
    cfg.setdefault("enabled", {})["fantasy"] = False
json.dump(cfg, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY
echo "Fantasy mode: $PROVIDER (change it later on the settings page, the gear icon)."

chmod +x "$DIR"/scripts/*.sh

# 3. Start on login ----------------------------------------------------------------------
say "3/5 Starting automatically on login"
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/wall-dashboard.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Wall Dashboard
Exec=$DIR/scripts/kiosk.sh
X-GNOME-Autostart-enabled=true
DESKTOP
echo "Wrote ~/.config/autostart/wall-dashboard.desktop"

# 4. Keep the screen awake ----------------------------------------------------------------
say "4/5 Screen sleep"
if command -v gsettings >/dev/null 2>&1; then
  gsettings set org.gnome.desktop.session idle-delay 0 2>/dev/null || true
  gsettings set org.gnome.desktop.screensaver lock-enabled false 2>/dev/null || true
  gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing' 2>/dev/null || true
  gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type 'nothing' 2>/dev/null || true
  echo "Screen blanking, lock and sleep turned off (GNOME)."
else
  echo "No GNOME settings tool found."
fi
if [ "$INSTALL" = 1 ] && [ -f /etc/gdm3/custom.conf ]; then
  sudo python3 - /etc/gdm3/custom.conf "$USER" <<'PY'
import re, sys
path, user = sys.argv[1], sys.argv[2]
text = open(path).read()
if "[daemon]" not in text:
    text = "[daemon]\n" + text
def setkey(text, key, value):
    pattern = r"^[#;\s]*%s\s*=.*$" % key
    if re.search(pattern, text, flags=re.M):
        return re.sub(pattern, "%s=%s" % (key, value), text, count=1, flags=re.M)
    return text.replace("[daemon]", "[daemon]\n%s=%s" % (key, value), 1)
text = setkey(text, "AutomaticLoginEnable", "true")
text = setkey(text, "AutomaticLogin", user)
open(path, "w").write(text)
PY
  echo "Automatic login turned on for $USER."
fi

# 5. Yahoo sign-in --------------------------------------------------------------------------
say "5/5 Yahoo sign-in"
if [ "$PROVIDER" = "none" ]; then
  echo "Not needed without a Fantasy screen."
else
  echo "A browser window opens on the dashboard's own profile. Sign in to Yahoo,"
  echo "tick 'Stay signed in', confirm the matchup page shows, then close the window."
  ask "Open it now? (y/n)" "n"
  if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
    "$DIR/scripts/yahoo-login.sh" || true
  else
    echo "Skipped. Run $DIR/scripts/yahoo-login.sh later, before the first start."
  fi
fi

cat <<DONE

Setup finished.
  Test now:    $DIR/scripts/kiosk.sh      (Ctrl+Alt+F4 or Alt+F4 to leave kiosk mode)
  On reboot:   it starts by itself after login.
  Settings:    tap the gear icon on the dashboard.
  Update:      cd $DIR && git pull
DONE
