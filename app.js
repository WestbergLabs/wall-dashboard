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

/* ---------- Yahoo live: matchup redrawn from the hidden Yahoo tab ---------- */

const liveShown = { rows: [], left: 0, right: 0 };

function liveStatus(info, actual) {
  const text = info || "";
  if (/final/i.test(text)) return "final";
  if (/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/i.test(text) || /^\d{1,2}:\d{2}\s?(AM|PM)/i.test(text)) return "up";
  return actual === null || actual === undefined ? "up" : "live";
}

function tweenText(node, from, to) {
  const start = performance.now();
  function frame(now) {
    const k = Math.min(1, (now - start) / 700);
    node.textContent = (from + (to - from) * k).toFixed(2);
    if (k < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function pointsText(value) {
  return typeof value === "number" ? value.toFixed(2) : "\u2014";
}

function buildLiveDom(count) {
  const body = $("fantasy-body");
  body.replaceChildren();
  const root = el("div", "lv");

  const head = el("div", "lv-head");
  const left = el("div", "lv-teamcol");
  left.append(el("div", "lv-team lv-nameL", ""), el("div", "lv-total lv-totL", "0.00"));
  const right = el("div", "lv-teamcol r");
  right.append(el("div", "lv-team lv-nameR", ""), el("div", "lv-total lv-totR", "0.00"));
  head.append(left, el("div", "lv-vs", "vs"), right);

  const bar = el("div", "lv-bar");
  bar.append(el("div", ""));

  root.append(head, bar);
  for (let i = 0; i < count; i++) {
    const row = el("div", "lv-row");
    const mk = (cls) => {
      const side = el("div", "lv-side " + cls);
      const info = el("div", "lv-info");
      info.append(el("div", "lv-name", ""), el("div", "lv-sub", ""));
      side.append(info, el("div", "lv-pts", "\u2014"));
      return side;
    };
    row.append(mk("l"), el("div", "lv-slot", ""), mk("r"));
    root.append(row);
  }
  root.append(el("div", "lv-stamp", ""));
  body.append(root);
  liveShown.rows = [];
  liveShown.left = 0;
  liveShown.right = 0;
  return root;
}

function renderLive(data, ageSeconds) {
  const rows = (data.rows || []).filter((r) => r.slot !== "BN" && r.slot !== "IR");
  const f = settings.fantasy || {};
  let root = $("fantasy-body").querySelector(".lv");
  if (!root || root.querySelectorAll(".lv-row").length !== rows.length) root = buildLiveDom(rows.length);

  const teams = data.teams || [];
  root.querySelector(".lv-nameL").textContent = (teams[0] && teams[0].name) || f.myTeamName || "Your team";
  root.querySelector(".lv-nameR").textContent = (teams[1] && teams[1].name) || "Opponent";

  const rowEls = root.querySelectorAll(".lv-row");
  let sumL = 0, sumR = 0;
  rows.forEach((r, i) => {
    const rowEl = rowEls[i];
    rowEl.querySelector(".lv-slot").textContent = r.slot;
    [["l", r.left], ["r", r.right]].forEach(([cls, p]) => {
      const side = rowEl.querySelector(".lv-side." + cls);
      side.querySelector(".lv-name").textContent = p.name || "Empty";
      const status = liveStatus(p.info, p.actual);
      const sub = side.querySelector(".lv-sub");
      sub.replaceChildren();
      sub.append(document.createTextNode((p.team ? p.team + " \u00B7 " : "")));
      const tag = el("span", status === "live" ? "live" : "", status === "live" ? "Live" : status === "final" ? "Final" : (p.info || "Upcoming"));
      sub.append(tag);

      const ptsEl = side.querySelector(".lv-pts");
      const key = i + cls;
      const before = liveShown.rows[key];
      if (typeof p.actual === "number" && typeof before === "number" && p.actual !== before) {
        tweenText(ptsEl, before, p.actual);
        rowEl.classList.add("flash");
        setTimeout(() => rowEl.classList.remove("flash"), 900);
      } else {
        ptsEl.textContent = pointsText(p.actual);
      }
      liveShown.rows[key] = typeof p.actual === "number" ? p.actual : null;
    });
    sumL += Number(r.left.actual) || 0;
    sumR += Number(r.right.actual) || 0;
  });

  tweenText(root.querySelector(".lv-totL"), liveShown.left, sumL);
  tweenText(root.querySelector(".lv-totR"), liveShown.right, sumR);
  liveShown.left = sumL;
  liveShown.right = sumR;
  root.querySelector(".lv-bar > div").style.width = (sumL + sumR > 0 ? (100 * sumL) / (sumL + sumR) : 50).toFixed(1) + "%";

  const stamp = root.querySelector(".lv-stamp");
  const age = Number(ageSeconds) || 0;
  stamp.textContent = (data.week ? "Week " + data.week + " \u00B7 " : "") +
    (age > 90 ? "updated " + Math.round(age / 60) + " min ago" : "live");
}

function controllerUrl(f) {
  return (f.controllerUrl || "http://127.0.0.1:8081").replace(/\/$/, "");
}

function fantasyViaPage() {
  const f = settings.fantasy || {};
  return f.provider === "yahoo-page" && state.fantasyReady;
}

function callController(path) {
  fetch(controllerUrl(settings.fantasy || {}) + path, { cache: "no-store" }).catch(() => {});
}

function isNight() {
  return $("night").classList.contains("on");
}

async function loadFantasy() {
  const f = settings.fantasy;
  state.fantasyReady = false;
  if (!f || !f.provider || f.provider === "none") return;
  if (f.autoHideOffSeason && !inSeason(f.seasonStart, f.seasonEnd)) return;

  try {
    if (f.provider === "yahoo-live") {
      const url = controllerUrl(f) + "/matchup?poll=" + (Number(f.liveSeconds) || 20) +
        "&reload=" + (Number(f.yahooReloadMinutes) || 60);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      if (!body.ok || !body.data || !body.data.rows || !body.data.rows.length) return;
      renderLive(body.data, body.ageSeconds);
      state.fantasyReady = true;
    } else if (f.provider === "yahoo-page") {
      // The kiosk's tab controller flips the browser to your signed-in Yahoo matchup page
      // while this screen is up. The controller only answers on the kiosk, so on any other
      // browser this screen stays out of the rotation.
      const res = await fetch(controllerUrl(f) + "/health", { cache: "no-store" });
      if (!res.ok) return;
      $("fantasy-body").replaceChildren(el("div", "empty", "Opening your Yahoo matchup..."));
      state.fantasyReady = true;
    } else if (f.provider === "yahoo") {
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
    if (f.provider === "sleeper") setStatus("fantasy: " + err.message);
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
  const previous = currentId;
  currentId = id;
  SCREEN_IDS.forEach((name) => $("screen-" + name).classList.toggle("active", name === id));
  drawDots(activeScreens());

  if (fantasyViaPage()) {
    if (id === "fantasy" && !isNight()) {
      const reload = Number((settings.fantasy || {}).yahooReloadMinutes) || 60;
      callController("/show?seconds=" + secondsFor("fantasy") + "&reload=" + reload);
    } else if (previous === "fantasy") {
      callController("/dashboard");
    }
  }
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

  applyTheme(settings);
  setInterval(() => applyTheme(settings), 60000);
  renderClock();
  setInterval(renderClock, 1000);
  setInterval(applyNightMode, 30000);
  applyNightMode();

  every((settings.weather || {}).refreshMinutes, refreshWeather);
  every((settings.scores || {}).refreshMinutes, refreshScores);
  const fantasyCfg = settings.fantasy || {};
  if (fantasyCfg.provider === "yahoo-live") {
    refreshFantasy();
    setInterval(refreshFantasy, Math.max(5, Number(fantasyCfg.liveSeconds) || 20) * 1000);
  } else {
    every(fantasyCfg.refreshMinutes, refreshFantasy);
  }

  step(1);
}

init();
