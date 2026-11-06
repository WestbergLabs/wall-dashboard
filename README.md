# Wall Dashboard

A rotating full-screen dashboard for an old tablet or mini PC: clock, weather, sports scores and fantasy football matchups. Static HTML, CSS and JavaScript with no build step and no API keys.

## Quick start (tablet)

One supported setup: **Ubuntu Desktop 24.04 LTS** with Google Chrome. About 15 minutes, most of it the OS install. You need a USB stick (8 GB or more), a keyboard for the tablet, Wi-Fi, and your Yahoo login.

**Step 1. Install Ubuntu.**
1. On another computer, download Ubuntu Desktop 24.04 LTS from https://ubuntu.com/download/desktop and write it to the USB stick with Rufus (Windows) or balenaEtcher.
2. Boot the tablet from the stick. Choose "Install Ubuntu", accept the defaults, and let it erase the disk.
3. When asked to create a user, pick any name and password. Remember the password, setup asks for it.
4. Connect to Wi-Fi when asked, finish, and restart. Remove the stick.

**Step 2. Download and run setup.** On the tablet, open Terminal (Ctrl+Alt+T) and paste these three lines one at a time:

```bash
sudo apt-get install -y git
git clone https://github.com/WestbergLabs/wall-dashboard.git ~/wall-dashboard
~/wall-dashboard/scripts/setup.sh
```

Do not put `sudo` in front of the third line. If the repository is private, `git clone` asks for your GitHub username and a personal access token as the password.

**Step 3. Answer the questions.** Press Enter to accept the value in brackets.
1. *Yahoo matchup page address.* Press Enter. The default is the Turf Titans league's matchup page, `https://football.fantasysports.yahoo.com/f1/46800/matchup`, and it only shows anything after signing in. For a different league, paste that league's Matchup page address instead.
2. *Fantasy mode.* `1` shows Yahoo's own page on the Fantasy screen. `2` redraws the matchup in the dashboard style (it reads the page automatically, which Yahoo's terms prohibit, see below). `3` turns the Fantasy screen off.
3. *Open the Yahoo sign-in now?* Type `y`. A Chrome window opens. Sign in to Yahoo, tick "Stay signed in", make sure the matchup page shows, then close the window. Skip Chrome's own sign-in prompts. Type `n` for fantasy mode 3.

Setup then finishes with a summary. It installs Python, git and Google Chrome, turns on automatic login, adds the dashboard to login startup, turns off screen sleep, and saves your answers in `scripts/kiosk.env` and `config.local.json` (both git-ignored). It is safe to run again.

**Step 4. Test.** Run `~/wall-dashboard/scripts/kiosk.sh`. The dashboard fills the screen. Press Alt+F4 to leave. If the Fantasy screen does not show up, see Troubleshooting.

**Step 5. Reboot.** The tablet logs in by itself and the dashboard starts. This is the finished state.

### Day to day

- Settings: tap the faint gear in the top-right corner.
- Next or previous screen: tap the right or left half of the screen.
- Update: open Terminal, run `cd ~/wall-dashboard && git pull`, then reboot.
- Change the Yahoo address: edit `~/wall-dashboard/scripts/kiosk.env`, then reboot.
- Sign in to Yahoo again: close the kiosk (Alt+F4), run `~/wall-dashboard/scripts/yahoo-login.sh`, sign in, close the window, then reboot.
- Change the fantasy mode: gear icon, Fantasy provider.

### Troubleshooting

- **Fantasy screen missing.** It only appears when all of these are true: the Yahoo tab is reachable, today is inside the season window (settings, default 09-01 to 01-15), it is not night mode, and in redraw mode the page could be read (see "Yahoo live, redrawn").
- **Yahoo shows a sign-in page.** Run the sign-in step again (see Day to day).
- **Blank screen or settings not remembered.** Check that nothing else uses ports 8080, 8081 or 9222. Saved settings are tied to the address `127.0.0.1:8080`.
- **Start over.** Delete `scripts/kiosk.env` and `config.local.json`, then run `~/wall-dashboard/scripts/setup.sh` again.

Old tablet batteries: if the case bulges or the battery is swollen, do not leave it charging around the clock.

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

In this mode (`yahoo-page`) nothing reads, scrapes or changes the Yahoo page. The tablet just displays it in a normal browser, because Yahoo's terms prohibit automated data collection. The fantasy on/off, order, seconds and off-season settings all apply to it like any other screen.

How it behaves:
- The Fantasy screen only joins the rotation when the controller answers, so on a regular PC or browser it stays out.
- It also stays out of the rotation outside the season window, and during night mode the tab is not shown.
- Tapping inside the Yahoo page works, but the dashboard does not get your taps while Yahoo is in front.

The Yahoo address and sign-in are handled by `scripts/setup.sh` (see Quick start). To do it by hand, copy `scripts/kiosk.env.example` to `scripts/kiosk.env`, set `YAHOO_MATCHUP_URL`, and run `scripts/yahoo-login.sh` once with the kiosk closed.

### Yahoo live, redrawn (provider `yahoo-live`)

This option draws the matchup in the dashboard's own style instead of showing Yahoo's page. The controller keeps your signed-in Yahoo matchup page open in a background tab, reads the visible text through Chrome's local debugging port every `liveSeconds` (default 20), and the dashboard animates the changes (counting points, flashing the row that moved). Yahoo updates that tab by itself during games, with a safety reload every `yahooReloadMinutes`.

Terms note: this is automated reading of a Yahoo page, which Yahoo's terms prohibit. It reads only your own signed-in matchup, only on this tablet, and never sends anything off the device, but the risk is yours. The `yahoo-page` provider above is the compliant alternative.

The reader (`scripts/extractors/yahoo-matchup.js`) is version 0 and has not been checked against the real page. Nothing needs to be run to fit it: in this mode the controller saves a capture by itself about a minute after start (page HTML, text and a screenshot), and again if the page cannot be read (at most every 6 hours, 5 per run). Everything is in `captures/` and bundled as `captures/captures.zip`. Attach that zip to the chat and the reader gets adjusted to match. The files are git-ignored and may contain your account name, so look them over first. `scripts/capture.sh` still takes one on demand.

Until then, the Fantasy screen stays out of the rotation if nothing could be read.

Other providers still exist as options on the settings page: a Yahoo data file (`data/yahoo-fantasy.json`, schema in `data/yahoo-fantasy.example.json`) and the Sleeper read-only API.

## Try it on a PC

```bash
python3 -m http.server 8080 --bind 127.0.0.1
# open http://127.0.0.1:8080
```

A local server is needed because the page loads `config.json` with `fetch()`. Fantasy stays out on a PC unless the kiosk controller is running.

## Ideas for later

- A small script that pulls Yahoo matchups and writes `data/yahoo-fantasy.json`
- Team filters for scores (only favorite teams)
- Photo or calendar screen
