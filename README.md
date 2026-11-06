# Wall Dashboard

A rotating full-screen dashboard for an old tablet or mini PC: clock, weather, sports scores and fantasy football matchups. Static HTML, CSS and JavaScript with no build step and no API keys.

## Screens

| Screen  | Source | Notes |
|---------|--------|-------|
| Clock   | Local time | 12 or 24 hour |
| Weather | Open-Meteo | Current conditions plus a 4-day outlook, free, no key |
| Scores  | ESPN public scoreboard JSON | NFL, college football, NBA, NHL, MLB. Skipped automatically when there are no games |
| Fantasy | Your Yahoo matchup page, shown by the tablet's browser (or a Yahoo data file, or Sleeper) | Hidden outside the season window and whenever it is not available |

Tap the right half of the screen for the next screen and the left half for the previous one. Tap the faint gear in the top-right corner for settings. Night mode blacks the screen between set hours, and a tap wakes it for one minute.

## Settings page

Open `settings.html` (the gear icon). Settings are saved on that device in the browser, on top of the defaults in `config.json`:

- turn each screen on or off, reorder them, and set seconds per screen (blank uses the default)
- default seconds per screen
- clock format, weather place, coordinates and units
- which sports leagues appear, and whether to skip Scores when nothing is playing
- fantasy provider, how often the Yahoo page may be reopened, plus **Hide automatically in the off-season** with a start and end date (default 09-01 to 01-15)
- night mode hours

"Reset to defaults" clears the saved overrides.

## Fantasy football (Yahoo)

Yahoo's API access is not available to us, so the Fantasy screen simply shows your own Yahoo matchup page. On the tablet, Chrome keeps two tabs: the dashboard and your signed-in Yahoo matchup page. When the rotation reaches Fantasy, `scripts/tab_controller.py` brings the Yahoo tab to the front for that screen's seconds and then returns to the dashboard. The Yahoo page updates itself live during games, so the dashboard only reopens it as a safety net (default every 60 minutes).

Nothing reads, scrapes or changes the Yahoo page. The tablet just displays it in a normal browser, because Yahoo's terms prohibit automated data collection. The fantasy on/off, order, seconds and off-season settings all apply to it like any other screen.

How it behaves:
- The Fantasy screen only joins the rotation when the controller answers, so on a regular PC or browser it stays out.
- It also stays out of the rotation outside the season window, and during night mode the tab is not shown.
- Tapping inside the Yahoo page works, but the dashboard does not get your taps while Yahoo is in front.

Setup on the tablet:
1. Copy `scripts/kiosk.env.example` to `scripts/kiosk.env`.
2. Open your league's Matchup page in a browser, copy its address, and put it in `YAHOO_MATCHUP_URL`. The default is a best guess from the league ID.
3. With the kiosk not running, run `scripts/yahoo-login.sh`, sign in to Yahoo, tick "Stay signed in", and close the window. The sign-in is kept in the dashboard's own browser profile.
4. Start `scripts/kiosk.sh`.

### Yahoo live, redrawn (provider `yahoo-live`)

This option draws the matchup in the dashboard's own style instead of showing Yahoo's page. The controller keeps your signed-in Yahoo matchup page open in a background tab, reads the visible text through Chrome's local debugging port every `liveSeconds` (default 20), and the dashboard animates the changes (counting points, flashing the row that moved). Yahoo updates that tab by itself during games, with a safety reload every `yahooReloadMinutes`.

Terms note: this is automated reading of a Yahoo page, which Yahoo's terms prohibit. It reads only your own signed-in matchup, only on this tablet, and never sends anything off the device, but the risk is yours. The `yahoo-page` provider above is the compliant alternative.

The reader (`scripts/extractors/yahoo-matchup.js`) is version 0 and has not been checked against the real page. To fit it:
1. Start the kiosk with the provider set to `yahoo-live` and let the Yahoo tab load.
2. Run `scripts/capture.sh`. It saves the page HTML, text and a screenshot into `captures/` (git-ignored; it may contain your account name).
3. Share those files and the extractor gets adjusted to match.

Until then, the Fantasy screen stays out of the rotation if nothing could be read.

Other providers still exist as options on the settings page: a Yahoo data file (`data/yahoo-fantasy.json`, schema in `data/yahoo-fantasy.example.json`) and the Sleeper read-only API.

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
4. Set up the Yahoo sign-in first (see the Fantasy section above), then test with `scripts/kiosk.sh`.
5. To start on boot, copy `scripts/wall-dashboard.service` to `/etc/systemd/system/`, adjust the user and path, then `sudo systemctl enable --now wall-dashboard`.

On an old tablet battery: if the case bulges or the battery is swollen, do not leave it charging around the clock.

## Ideas for later

- A small script that pulls Yahoo matchups and writes `data/yahoo-fantasy.json`
- Team filters for scores (only favorite teams)
- Photo or calendar screen
