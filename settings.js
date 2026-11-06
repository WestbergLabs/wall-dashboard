"use strict";

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let working = null;   // merged settings being edited
let defaults = {};

/* ---------- Screens list (toggle, reorder, seconds) ---------- */

function renderScreenList() {
  const list = $("screen-list");
  list.replaceChildren();
  working.order.forEach((id, index) => {
    const row = el("div", "screen-row");

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = working.enabled[id] !== false;
    toggle.setAttribute("aria-label", "Show " + id);
    toggle.addEventListener("change", () => { working.enabled[id] = toggle.checked; });

    const name = el("span", "name", id);

    const secs = document.createElement("input");
    secs.type = "number";
    secs.min = "3";
    secs.max = "600";
    secs.placeholder = "default";
    secs.value = working.seconds[id] > 0 ? working.seconds[id] : "";
    secs.setAttribute("aria-label", "Seconds for " + id);
    secs.addEventListener("input", () => {
      const n = Number(secs.value);
      if (n > 0) working.seconds[id] = n; else delete working.seconds[id];
    });

    const up = el("button", "small", "↑");
    up.disabled = index === 0;
    up.setAttribute("aria-label", "Move " + id + " up");
    up.addEventListener("click", () => move(index, -1));

    const down = el("button", "small", "↓");
    down.disabled = index === working.order.length - 1;
    down.setAttribute("aria-label", "Move " + id + " down");
    down.addEventListener("click", () => move(index, 1));

    row.append(toggle, name, secs, up, down);
    list.append(row);
  });
}

function move(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= working.order.length) return;
  const order = working.order;
  [order[index], order[target]] = [order[target], order[index]];
  renderScreenList();
}

/* ---------- Scores leagues ---------- */

function renderLeagues() {
  const wrap = $("league-list");
  wrap.replaceChildren();
  const scores = working.scores || {};
  scores.enabled = scores.enabled || {};
  (scores.leagues || []).forEach((lg) => {
    const label = el("label", "row check");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = scores.enabled[lg.key] !== false;
    box.addEventListener("change", () => { scores.enabled[lg.key] = box.checked; });
    label.append(box, el("span", "", lg.label));
    wrap.append(label);
  });
  working.scores = scores;
}

/* ---------- Fill and read the form ---------- */

function fillForm() {
  const w = working;
  $("rotateSeconds").value = w.rotateSeconds;
  $("use24Hour").checked = !!(w.clock && w.clock.use24Hour);
  const zone = (w.clock && w.clock.timeZone) || "device";
  $("clockZone").value = zone === "device" || zone === "auto" ? zone : "custom";
  $("clockZoneName").value = zone === "device" || zone === "auto" ? "" : zone;

  $("weatherLocation").value = (w.weather && w.weather.location) || "fixed";
  $("weatherName").value = (w.weather && w.weather.name) || "";
  $("weatherLat").value = w.weather ? w.weather.latitude : "";
  $("weatherLon").value = w.weather ? w.weather.longitude : "";
  $("weatherUnits").value = (w.weather && w.weather.units) || "fahrenheit";
  $("weatherScene").value = (w.weather && w.weather.scene) || "auto";
  $("weatherAnimate").checked = !(w.weather && w.weather.animate === false);

  $("hideWhenEmpty").checked = !!(w.scores && w.scores.hideWhenEmpty);

  const f = w.fantasy || {};
  $("fantasyProvider").value = f.provider || "none";
  $("yahooReloadMinutes").value = f.yahooReloadMinutes || 60;
  $("liveSeconds").value = f.liveSeconds || 20;
  $("sleeperLeagueId").value = f.sleeperLeagueId || "";
  $("autoHideOffSeason").checked = !!f.autoHideOffSeason;
  $("seasonStart").value = f.seasonStart || "";
  $("seasonEnd").value = f.seasonEnd || "";

  const ph = w.photos || {};
  $("photoFolder").value = ph.folderId || "";
  $("photoKey").value = ph.apiKey || "";
  $("photoShuffle").checked = ph.shuffle !== false;
  $("photoFit").value = ph.fit || "fit";
  $("photoRefresh").value = ph.refreshMinutes || 10;

  $("theme").value = w.theme || "dark";
  $("themeAutoLightStart").value = w.themeAutoLightStart === undefined ? 7 : w.themeAutoLightStart;
  $("themeAutoLightEnd").value = w.themeAutoLightEnd === undefined ? 19 : w.themeAutoLightEnd;

  const n = w.nightMode || {};
  $("nightEnabled").checked = !!n.enabled;
  $("nightStart").value = n.startHour;
  $("nightEnd").value = n.endHour;

  renderScreenList();
  renderLeagues();
}

function numberOr(value, fallback) {
  const n = Number(value);
  return value !== "" && Number.isFinite(n) ? n : fallback;
}

function readForm() {
  const base = working;
  const f = base.fantasy || {};
  const bw = base.weather || {};
  return {
    rotateSeconds: Math.min(600, Math.max(3, numberOr($("rotateSeconds").value, 20))),
    order: base.order.slice(),
    enabled: Object.assign({}, base.enabled),
    seconds: Object.assign({}, base.seconds),
    clock: {
      use24Hour: $("use24Hour").checked,
      timeZone: $("clockZone").value === "custom"
        ? ($("clockZoneName").value.trim() || "device")
        : $("clockZone").value
    },
    weather: {
      location: $("weatherLocation").value,
      name: $("weatherName").value.trim(),
      latitude: numberOr($("weatherLat").value, bw.latitude),
      longitude: numberOr($("weatherLon").value, bw.longitude),
      units: $("weatherUnits").value,
      scene: $("weatherScene").value,
      animate: $("weatherAnimate").checked,
      refreshMinutes: bw.refreshMinutes
    },
    scores: {
      enabled: Object.assign({}, (base.scores || {}).enabled),
      hideWhenEmpty: $("hideWhenEmpty").checked
    },
    fantasy: {
      provider: $("fantasyProvider").value,
      yahooReloadMinutes: Math.min(720, Math.max(5, numberOr($("yahooReloadMinutes").value, 60))),
      liveSeconds: Math.min(120, Math.max(5, numberOr($("liveSeconds").value, 20))),
      myTeamName: f.myTeamName || "",
      controllerUrl: f.controllerUrl || "http://127.0.0.1:8081",
      sleeperLeagueId: $("sleeperLeagueId").value.trim(),
      autoHideOffSeason: $("autoHideOffSeason").checked,
      seasonStart: $("seasonStart").value.trim() || f.seasonStart,
      seasonEnd: $("seasonEnd").value.trim() || f.seasonEnd
    },
    photos: {
      folderId: $("photoFolder").value.trim(),
      apiKey: $("photoKey").value.trim(),
      shuffle: $("photoShuffle").checked,
      fit: $("photoFit").value,
      refreshMinutes: Math.min(1440, Math.max(1, numberOr($("photoRefresh").value, 10)))
    },
    theme: $("theme").value,
    themeAutoLightStart: Math.min(23, Math.max(0, numberOr($("themeAutoLightStart").value, 7))),
    themeAutoLightEnd: Math.min(23, Math.max(0, numberOr($("themeAutoLightEnd").value, 19))),
    nightMode: {
      enabled: $("nightEnabled").checked,
      startHour: Math.min(23, Math.max(0, numberOr($("nightStart").value, 23))),
      endHour: Math.min(23, Math.max(0, numberOr($("nightEnd").value, 6)))
    }
  };
}

function say(text) {
  $("message").textContent = text;
}

function validate(values) {
  const md = /^\d\d-\d\d$/;
  if (!md.test(values.fantasy.seasonStart) || !md.test(values.fantasy.seasonEnd)) {
    return "Season dates must look like 09-01.";
  }
  if (values.fantasy.provider === "sleeper" && !values.fantasy.sleeperLeagueId) {
    return "Enter a Sleeper league ID or choose a different provider.";
  }
  return "";
}

$("save").addEventListener("click", () => {
  const values = readForm();
  const problem = validate(values);
  if (problem) { say(problem); return; }
  say(writeOverrides(values) ? "Saved. Open the dashboard to see the changes." : "Could not save in this browser.");
});

$("reset").addEventListener("click", async () => {
  if (!window.confirm("Reset all settings to the defaults in config.json?")) return;
  clearOverrides();
  await start();
  say("Reset to defaults.");
});

async function start() {
  const loaded = await loadSettings();
  working = loaded.settings;
  defaults = loaded.defaults;
  if (loaded.error) say("Could not read config.json: " + loaded.error.message);
  fillForm();
  applyTheme(working);
  for (const id of ["theme", "themeAutoLightStart", "themeAutoLightEnd"]) {
    $(id).addEventListener("input", () => applyTheme(readForm()));
  }
}

start();
