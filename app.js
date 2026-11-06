"use strict";

const WEATHER_CODES = {
  0: ["Clear", "☀️"], 1: ["Mostly clear", "🌤️"], 2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁️"], 45: ["Fog", "🌫️"], 48: ["Freezing fog", "🌫️"],
  51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"],
  56: ["Freezing drizzle", "🌧️"], 57: ["Freezing drizzle", "🌧️"],
  61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"], 67: ["Freezing rain", "🌧️"],
  71: ["Light snow", "🌨️"], 73: ["Snow", "❄️"], 75: ["Heavy snow", "❄️"],
  77: ["Snow grains", "🌨️"], 80: ["Rain showers", "🌦️"], 81: ["Rain showers", "🌧️"],
  82: ["Violent showers", "⛈️"], 85: ["Snow showers", "🌨️"], 86: ["Heavy snow showers", "❄️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm, hail", "⛈️"], 99: ["Thunderstorm, hail", "⛈️"]
};

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function getJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(url + " -> HTTP " + res.status);
  return res.json();
}

let settings = { rotateSeconds: 20, order: SCREEN_IDS.slice(), enabled: {}, seconds: {} };
let currentId = null;
let rotateTimer = null;
let wakeUntil = 0;

/* Runtime state that decides whether a screen can be shown right now. */
const state = {
  fantasyReady: false,
  scoresHaveGames: true
};

/* ---------- Which screens are in the rotation ---------- */

function screenAvailable(id) {
  if (settings.enabled[id] === false) return false;

  if (id === "fantasy") {
    const f = settings.fantasy || {};
    if (!f.provider || f.provider === "none") return false;
    if (f.autoHideOffSeason && !inSeason(f.seasonStart, f.seasonEnd)) return false;
    return state.fantasyReady;
  }
  if (id === "scores") {
    const s = settings.scores || {};
    if (s.hideWhenEmpty && !state.scoresHaveGames) return false;
  }
  return true;
}

function activeScreens() {
  const list = settings.order.filter(screenAvailable);
  // Never end up with an empty rotation: fall back to the clock.
  return list.length ? list : ["clock"];
}

function secondsFor(id) {
  const own = Number(settings.seconds && settings.seconds[id]);
  return own > 0 ? own : Number(settings.rotateSeconds) || 20;
}

/* ---------- Clock ---------- */

function renderClock() {
  const now = new Date();
  const use24 = settings.clock && settings.clock.use24Hour;
  const opts = { hour: "numeric", minute: "2-digit", hour12: !use24 };
  $("clock-time").textContent = now.toLocaleTimeString([], opts).replace(/\s?[AP]M$/i, "");
  $("clock-date").textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

/* ---------- Weather ---------- */

async function refreshWeather() {
  const w = settings.weather;
  if (!w) return;
  const unit = w.units === "celsius" ? "celsius" : "fahrenheit";
  const url = "https://api.open-meteo.com/v1/forecast?latitude=" + encodeURIComponent(w.latitude) +
    "&longitude=" + encodeURIComponent(w.longitude) +
    "&current=temperature_2m,weather_code" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min" +
    "&temperature_unit=" + unit + "&timezone=auto&forecast_days=5";
  try {
    const data = await getJSON(url);
    const [desc, icon] = WEATHER_CODES[data.current.weather_code] || ["", "❓"];
    $("weather-place").textContent = w.name || "Weather";
    $("weather-icon").textContent = icon;
    $("weather-temp").textContent = Math.round(data.current.temperature_2m) + "°";
    $("weather-desc").textContent = desc;

    const days = $("weather-days");
    days.replaceChildren();
    data.daily.time.slice(1, 5).forEach((iso, i) => {
      const idx = i + 1;
      const card = el("div", "day");
      const name = new Date(iso + "T12:00:00").toLocaleDateString([], { weekday: "short" });
      card.append(el("div", "dname", name));
      card.append(el("div", "dicon", (WEATHER_CODES[data.daily.weather_code[idx]] || ["", "❓"])[1]));
      const temps = el("div", "dtemps", Math.round(data.daily.temperature_2m_max[idx]) + "° ");
      temps.append(el("span", "lo", Math.round(data.daily.temperature_2m_min[idx]) + "°"));
      card.append(temps);
      days.append(card);
    });
  } catch (err) {
    setStatus("weather: " + err.message);
  }
}

/* ---------- Scores (ESPN public scoreboard) ---------- */

async function refreshScores() {
  const s = settings.scores;
  if (!s) return;
  const leagues = (s.leagues || []).filter((lg) => !s.enabled || s.enabled[lg.key] !== false);
  const groups = [];
  for (const lg of leagues) {
    const url = "https://site.api.espn.com/apis/site/v2/sports/" + lg.sport + "/" + lg.league + "/scoreboard";
    try {
      const data = await getJSON(url);
      const events = (data.events || []).slice(0, s.maxGamesPerLeague || 6);
      groups.push({ label: lg.label, events });
    } catch (err) {
      setStatus("scores " + lg.label + ": " + err.message);
    }
  }

  const body = $("scores-body");
  body.replaceChildren();
  let any = false;
  for (const g of groups) {
    if (!g.events.length) continue;
    any = true;
    const group = el("div", "group");
    group.append(el("h3", "", g.label));
    for (const ev of g.events) group.append(gameRow(ev));
    body.append(group);
  }
  if (!any) body.append(el("div", "empty", "No games right now"));
  state.scoresHaveGames = any;
  drawDots(activeScreens());
}

function gameRow(ev) {
  const comp = ev.competitions && ev.competitions[0];
  const row = el("div", "game");
  if (!comp) return row;
  const status = comp.status && comp.status.type ? comp.status.type : {};
  if (status.state === "in") row.classList.add("live");
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  const finished = status.state === "post";
  const homeScore = Number(home.score), awayScore = Number(away.score);

  const teams = el("div", "teams");
  const mk = (c, mine, other) => {
    const t = el("span", "team");
    t.textContent = (c.team.abbreviation || c.team.shortDisplayName) + " ";
    t.append(el("span", "score", status.state === "pre" ? "" : String(c.score)));
    if (finished) t.classList.add(mine > other ? "winner" : "loser");
    return t;
  };
  teams.append(mk(away, awayScore, homeScore), el("span", "vs", "@"), mk(home, homeScore, awayScore));
  row.append(teams);
  row.append(el("div", "state", status.shortDetail || status.description || ""));
  return row;
}

/* ---------- Fantasy ---------- */

function renderMatchups(week, matchups) {
  const body = $("fantasy-body");
  body.replaceChildren();
  if (week) body.append(el("h3", "", "Week " + week));
  matchups.forEach((m) => {
    const row = el("div", "matchup");
    row.append(
      el("div", "side", m.aName),
      el("span", "pts", Number(m.aPts || 0).toFixed(2)),
      el("span", "vs", "vs"),
      el("span", "pts", Number(m.bPts || 0).toFixed(2)),
      el("div", "side right", m.bName)
    );
    body.append(row);
  });
}

async function refreshFantasy() {
  try {
    await loadFantasy();
  } finally {
    drawDots(activeScreens());
  }
}

async function loadFantasy() {
  const f = settings.fantasy;
  state.fantasyReady = false;
  if (!f || !f.provider || f.provider === "none") return;
  if (f.autoHideOffSeason && !inSeason(f.seasonStart, f.seasonEnd)) return;

  try {
    if (f.provider === "yahoo") {
      // Yahoo requires OAuth, so the dashboard reads a JSON file that a separate
      // job (script or MCP) writes. See README for the schema. No file = screen stays hidden.
      const data = await getJSON(f.yahooDataUrl || "data/yahoo-fantasy.json");
      const list = (data.matchups || []).map((m) => ({
        aName: m.home && m.home.name, aPts: m.home && m.home.points,
        bName: m.away && m.away.name, bPts: m.away && m.away.points
      }));
      if (!list.length) return;
      renderMatchups(data.week, list);
      state.fantasyReady = true;
    } else if (f.provider === "sleeper" && f.sleeperLeagueId) {
      const base = "https://api.sleeper.app/v1";
      const id = encodeURIComponent(f.sleeperLeagueId);
      const nfl = await getJSON(base + "/state/nfl");
      const week = nfl.display_week || nfl.week;
      const [users, rosters, matchups] = await Promise.all([
        getJSON(base + "/league/" + id + "/users"),
        getJSON(base + "/league/" + id + "/rosters"),
        getJSON(base + "/league/" + id + "/matchups/" + week)
      ]);
      const owners = {};
      users.forEach((u) => { owners[u.user_id] = (u.metadata && u.metadata.team_name) || u.display_name; });
      const names = {};
      rosters.forEach((r) => { names[r.roster_id] = owners[r.owner_id] || ("Team " + r.roster_id); });
      const pairs = {};
      matchups.forEach((m) => {
        if (m.matchup_id == null) return;
        (pairs[m.matchup_id] = pairs[m.matchup_id] || []).push(m);
      });
      const list = Object.values(pairs).filter((p) => p.length >= 2).map(([a, b]) => ({
        aName: names[a.roster_id], aPts: a.points, bName: names[b.roster_id], bPts: b.points
      }));
      if (!list.length) return;
      renderMatchups(week, list);
      state.fantasyReady = true;
    }
  } catch (err) {
    // A missing Yahoo file is expected until the feed exists, so only report other providers.
    if (f.provider !== "yahoo") setStatus("fantasy: " + err.message);
  }
}

/* ---------- Rotation, night mode, status ---------- */

function setStatus(msg) {
  $("status").textContent = msg;
  clearTimeout(setStatus.t);
  setStatus.t = setTimeout(() => { $("status").textContent = ""; }, 30000);
}

function drawDots(list) {
  const dots = $("dots");
  dots.replaceChildren();
  list.forEach((id) => dots.append(el("span", id === currentId ? "on" : "")));
}

function show(id) {
  currentId = id;
  SCREEN_IDS.forEach((name) => $("screen-" + name).classList.toggle("active", name === id));
  drawDots(activeScreens());
}

function step(direction) {
  clearTimeout(rotateTimer);
  const list = activeScreens();
  const at = list.indexOf(currentId);
  const next = at === -1 ? list[0] : list[(at + direction + list.length) % list.length];
  show(next);
  rotateTimer = setTimeout(() => step(1), secondsFor(next) * 1000);
}

function applyNightMode() {
  const n = settings.nightMode;
  if (!n || !n.enabled) { $("night").classList.remove("on"); return; }
  const hour = new Date().getHours();
  const inNight = n.startHour > n.endHour
    ? hour >= n.startHour || hour < n.endHour
    : hour >= n.startHour && hour < n.endHour;
  $("night").classList.toggle("on", inNight && Date.now() > wakeUntil);
}

document.addEventListener("pointerdown", (ev) => {
  if (ev.target.closest && ev.target.closest("#gear")) return;
  if ($("night").classList.contains("on")) {
    wakeUntil = Date.now() + 60000;
    applyNightMode();
    return;
  }
  step(ev.clientX < window.innerWidth / 2 ? -1 : 1);
});

function every(minutes, fn) {
  fn();
  setInterval(fn, Math.max(1, Number(minutes) || 5) * 60 * 1000);
}

async function init() {
  const loaded = await loadSettings();
  settings = loaded.settings;
  if (loaded.error) setStatus(loaded.error.message + " (using built-in defaults)");

  renderClock();
  setInterval(renderClock, 1000);
  setInterval(applyNightMode, 30000);
  applyNightMode();

  every((settings.weather || {}).refreshMinutes, refreshWeather);
  every((settings.scores || {}).refreshMinutes, refreshScores);
  every((settings.fantasy || {}).refreshMinutes, refreshFantasy);

  step(1);
}

init();
