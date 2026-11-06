# Wall Dashboard

A rotating full-screen dashboard for an old tablet or mini PC: clock, weather, sports scores and fantasy football matchups. Static HTML, CSS and JavaScript with no build step and no API keys.

## Screens

| Screen  | Source | Notes |
|---------|--------|-------|
| Clock   | Local time | 12 or 24 hour |
| Weather | Open-Meteo | Current conditions plus a 4-day outlook, free, no key |
| Scores  | ESPN public scoreboard JSON | NFL, college football, NBA, NHL, MLB. Skipped automatically when there are no games |
| Fantasy | Yahoo feed file, or Sleeper API | Hidden outside the season window and whenever there is no data |

Tap the right half of the screen for the next screen and the left half for the previous one. Tap the faint gear in the top-right corner for settings. Night mode blacks the screen between set hours, and a tap wakes it for one minute.

## Settings page

Open `settings.html` (the gear icon). Settings are saved on that device in the browser, on top of the defaults in `config.json`:

- turn each screen on or off, reorder them, and set seconds per screen (blank uses the default)
- default seconds per screen
- clock format, weather place, coordinates and units
- which sports leagues appear, and whether to skip Scores when nothing is playing
- fantasy provider, plus **Hide automatically in the off-season** with a start and end date (default 09-01 to 01-15)
- night mode hours

"Reset to defaults" clears the saved overrides.

## Fantasy football (Yahoo)

Yahoo's API requires OAuth, so the dashboard does not call Yahoo directly. Instead it reads `data/yahoo-fantasy.json`, which a separate job (a script, or the Yahoo fantasy MCP when it is ready) can write. If the file is missing, empty, or it is the off-season, the Fantasy screen is simply left out of the rotation.

Schema (see `data/yahoo-fantasy.example.json`):

```json
{
  "updated": "2026-11-06T12:00:00Z",
  "week": 9,
  "matchups": [
    { "home": { "name": "Turf Titans", "points": 101.4 }, "away": { "name": "Example Team", "points": 88.2 } }
  ]
}
```

`data/yahoo-fantasy.json` is git-ignored so league data stays out of the repo.

## Run it on a PC to try it

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

A local server is needed because the page loads `config.json` with `fetch()`. Keep the same address on the tablet (the kiosk script uses port 8080), because saved settings are tied to the address.

## Set up the tablet (Linux)

1. Install Debian or Ubuntu, create a user named `dashboard`, and enable automatic login.
2. Install the pieces: `sudo apt install chromium python3 git` (the package may be named `chromium-browser` on Ubuntu).
3. Clone this repo into `/home/dashboard/wall-dashboard`.
4. Test with `scripts/kiosk.sh`.
5. To start on boot, copy `scripts/wall-dashboard.service` to `/etc/systemd/system/`, adjust the user and path, then `sudo systemctl enable --now wall-dashboard`.

On an old tablet battery: if the case bulges or the battery is swollen, do not leave it charging around the clock.

## Ideas for later

- A small script that pulls Yahoo matchups and writes `data/yahoo-fantasy.json`
- Team filters for scores (only favorite teams)
- Photo or calendar screen
