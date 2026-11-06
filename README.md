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

Setup of the Yahoo address and sign-in is covered by `scripts/setup.sh` (see Quick start). To do it by hand, copy `scripts/kiosk.env.example` to `scripts/kiosk.env`, set `YAHOO_MATCHUP_URL`, and run `scripts/yahoo-login.sh` once with the kiosk closed.

### Yahoo live, redrawn (provider `yahoo-live`)

This option draws the matchup in the dashboard's own style instead of showing Yahoo's page. The controller keeps your signed-in Yahoo matchup page open in a background tab, reads the visible text through Chrome's local debugging port every `liveSeconds` (default 20), and the dashboard animates the changes (counting points, flashing the row that moved). Yahoo updates that tab by itself during games, with a safety reload every `yahooReloadMinutes`.

Terms note: this is automated reading of a Yahoo page, which Yahoo's terms prohibit. It reads only your own signed-in matchup, only on this tablet, and never sends anything off the device, but the risk is yours. The `yahoo-page` provider above is the compliant alternative.

The reader (`scripts/extractors/yahoo-matchup.js`) is version 0 and has not been checked against the real page. To fit it:
1. Start the kiosk with the provider set to `yahoo-live` and let the Yahoo tab load.
2. Run `scripts/capture.sh`. It saves the page HTML, text and a screenshot into `captures/` (git-ignored; it may contain your account name).
3. Share those files and the extractor gets adjusted to match.

Until then, the Fantasy screen stays out of the rotation if nothing could be read.

Other providers still exist as options on the settings page: a Yahoo data file (`data/yahoo-fantasy.json`, schema in `data/yahoo-fantasy.example.json`) and the Sleeper read-only API.

## Quick start (tablet)

One supported setup: **Ubuntu Desktop 24.04 LTS** with Google Chrome. Takes about 15 minutes, most of it the OS install.

1. **Install Ubuntu Desktop 24.04 LTS** on the tablet from a USB stick (https://ubuntu.com/download/desktop). Create your user (any name and password), connect to Wi-Fi, and finish the installer.
2. **Get the code and run setup.** Open a terminal on the tablet:
   ```bash
   sudo apt-get install -y git
   git clone https://github.com/WestbergLabs/wall-dashboard.git ~/wall-dashboard
   ~/wall-dashboard/scripts/setup.sh
   ```
   Run it as that user, not with `sudo`. It asks for your password only to install packages and turn on automatic login.
3. **Answer three questions.**
   - Your Yahoo matchup page address (open the Matchup page in any browser and copy it).
   - Fantasy mode: `1` show Yahoo's page, `2` redraw it in the dashboard style, `3` no Fantasy screen.
   - Whether to open the Yahoo sign-in window now. Say `y`, sign in, tick "Stay signed in", check the matchup page loads, then close the window.
4. **Test it.** Run `~/wall-dashboard/scripts/kiosk.sh`. Leave kiosk mode with Alt+F4.
5. **Reboot.** The tablet logs in by itself and the dashboard starts.

What setup does: installs Python, git and Google Chrome, turns on automatic login, writes `scripts/kiosk.env` and `config.local.json` (both git-ignored), adds a login autostart entry, and turns off screen sleep. It is safe to run again. 

Day to day:
- Settings: tap the gear icon (screens, order, seconds, weather, leagues, fantasy mode, night mode).
- Tap the right half of the screen for the next screen, the left half for the previous one.
- Update: `cd ~/wall-dashboard && git pull`, then reboot.
- Change the Yahoo address later: edit `scripts/kiosk.env`.
- Sign in to Yahoo again: close the kiosk and run `scripts/yahoo-login.sh`.

If something looks wrong:
- Fantasy screen missing: it only appears when the Yahoo tab is reachable, the date is inside the season window, and, for the redraw mode, the page could be read. See the capture steps above.
- Blank or wrong layout: check that nothing else uses port 8080, 8081 or 9222 (settings are tied to the address `127.0.0.1:8080`).

## Try it on a PC

```bash
python3 -m http.server 8080 --bind 127.0.0.1
# open http://127.0.0.1:8080
```

A local server is needed because the page loads `config.json` with `fetch()`. Fantasy stays out on a PC unless the kiosk controller is running.

Old tablet batteries: if the case bulges or the battery is swollen, do not leave it charging around the clock.

## Ideas for later

- A small script that pulls Yahoo matchups and writes `data/yahoo-fantasy.json`
- Team filters for scores (only favorite teams)
- Photo or calendar screen
