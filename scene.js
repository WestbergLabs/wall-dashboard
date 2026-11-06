"use strict";

/*
 * Weather background: a drawn skyline under a sky that follows the time of day and the weather.
 *   scene "auto" picks city or town from the place's population (Open-Meteo geocoding, cached),
 *   or choose city, town, lake, farm or none on the settings page.
 * All art is generated here as SVG, so nothing is downloaded and nothing is licensed.
 */

const SCENE_CACHE_KEY = "wallDashboard.sceneGuess";

function seededRandom(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (let i = 0; i < String(seed).length; i++) {
    h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- which scene for this place ---------- */

async function guessScene(weather) {
  const key = [weather.name, weather.latitude, weather.longitude].join("|");
  try {
    const cached = JSON.parse(localStorage.getItem(SCENE_CACHE_KEY) || "null");
    if (cached && cached.key === key) return cached.scene;
  } catch (err) { /* ignore */ }

  let scene = "town";
  try {
    const place = String(weather.name || "").split(",")[0].trim();
    if (place) {
      const res = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=10&name=" + encodeURIComponent(place));
      const data = await res.json();
      let best = null, bestDist = Infinity;
      for (const r of data.results || []) {
        const d = Math.abs(r.latitude - weather.latitude) + Math.abs(r.longitude - weather.longitude);
        if (d < bestDist) { best = r; bestDist = d; }
      }
      if (best && bestDist < 0.6) scene = (best.population || 0) >= 100000 ? "city" : "town";
      else return scene; // not found: do not cache, try again next time
    }
    localStorage.setItem(SCENE_CACHE_KEY, JSON.stringify({ key, scene }));
  } catch (err) { /* offline: use the default for now */ }
  return scene;
}

/* ---------- sky ---------- */

function minutesOf(iso) {
  const m = /T(\d\d):(\d\d)/.exec(iso || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function skyState(current, daily, code) {
  const now = minutesOf(current.time);
  const rise = minutesOf(daily.sunrise && daily.sunrise[0]);
  const set = minutesOf(daily.sunset && daily.sunset[0]);
  let phase = current.is_day === 0 ? "night" : "day";
  let progress = 0.5;
  if (now !== null && rise !== null && set !== null) {
    if (now < rise - 30 || now > set + 30) phase = "night";
    else if (now < rise + 40) phase = "dawn";
    else if (now > set - 40) phase = "dusk";
    else phase = "day";
    const span = set - rise;
    progress = Math.min(1, Math.max(0, (now - rise) / span));
  }
  const cloudy = [3, 45, 48].includes(code) || (code >= 51 && code <= 99);
  const partly = code === 1 || code === 2;
  let precip = "none";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) precip = "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) precip = "snow";
  return { phase, progress, cloudy, partly, precip, fog: code === 45 || code === 48 };
}

const SKY = {
  dark: {
    night: ["#070b18", "#1a2342"], dawn: ["#262a55", "#b8664f"], day: ["#27496f", "#6a9cc4"], dusk: ["#2a2650", "#c26a4b"],
    gray: ["#2f3742", "#566170"], ground: "#0a0d12", far: "#161c27"
  },
  paper: {
    night: ["#d9d4c7", "#c6c0b1"], dawn: ["#ece6d8", "#d8cfbd"], day: ["#efebe0", "#e0dccf"], dusk: ["#ece6d8", "#d5cbb8"],
    gray: ["#e4e0d4", "#d2cdc0"], ground: "#1b1b1a", far: "#a9a496"
  }
};

function skyColors(theme, sky) {
  const set = SKY[theme] || SKY.dark;
  const grayed = (sky.cloudy || sky.fog) && sky.phase !== "night";
  const pair = grayed ? set.gray : set[sky.phase];
  return { top: pair[0], bottom: pair[1], ground: set.ground, far: set.far };
}

/* ---------- scenery (viewBox 1600 x 320, drawn along the bottom) ---------- */

function city(rand, ground, far, night) {
  const win = night ? "#f5d37a" : "none";
  let back = "", front = "", lights = "";
  let x = -20;
  while (x < 1620) {
    const w = 60 + rand() * 80, h = 80 + rand() * 120;
    back += '<rect x="' + x.toFixed(0) + '" y="' + (320 - h).toFixed(0) + '" width="' + w.toFixed(0) + '" height="' + h.toFixed(0) + '" fill="' + far + '"/>';
    x += w + 6;
  }
  x = -40;
  let towerAt = 600 + rand() * 400;
  while (x < 1640) {
    const w = 50 + rand() * 90;
    let h = 70 + rand() * 130;
    const isTower = Math.abs(x - towerAt) < 70;
    if (isTower) h = 250;
    front += '<rect x="' + x.toFixed(0) + '" y="' + (320 - h).toFixed(0) + '" width="' + w.toFixed(0) + '" height="' + h.toFixed(0) + '" fill="' + ground + '"/>';
    if (isTower) front += '<rect x="' + (x + w / 2 - 2).toFixed(0) + '" y="' + (320 - h - 50).toFixed(0) + '" width="4" height="50" fill="' + ground + '"/>';
    if (night) {
      for (let wy = 320 - h + 14; wy < 306; wy += 22) {
        for (let wx = x + 10; wx < x + w - 10; wx += 18) {
          if (rand() < 0.38) lights += '<rect x="' + wx.toFixed(0) + '" y="' + wy.toFixed(0) + '" width="6" height="8" fill="' + win + '"/>';
        }
      }
    }
    x += w + 4;
  }
  return back + front + lights;
}

function town(rand, ground, far, night) {
  let out = "";
  // distant tree line
  for (let x = -20; x < 1640; x += 40) {
    const r = 40 + rand() * 40;
    out += '<circle cx="' + x + '" cy="' + (310 - rand() * 20).toFixed(0) + '" r="' + r.toFixed(0) + '" fill="' + far + '"/>';
  }
  out += '<rect x="0" y="300" width="1600" height="20" fill="' + far + '"/>';
  const lit = night ? "#f5d37a" : "none";
  let x = 40;
  const churchAt = 780 + rand() * 120, towerAt = 1250 + rand() * 120;
  while (x < 1580) {
    if (Math.abs(x - churchAt) < 90) {
      // church with steeple
      out += '<rect x="' + (x - 40) + '" y="230" width="80" height="90" fill="' + ground + '"/>';
      out += '<polygon points="' + (x - 40) + ",230 " + x + ",190 " + (x + 40) + ',230" fill="' + ground + '"/>';
      out += '<rect x="' + (x - 14) + '" y="130" width="28" height="100" fill="' + ground + '"/>';
      out += '<polygon points="' + (x - 18) + ",132 " + x + ",70 " + (x + 18) + ',132" fill="' + ground + '"/>';
      if (night) out += '<rect x="' + (x - 5) + '" y="160" width="10" height="16" fill="' + lit + '"/>';
      x += 130;
      continue;
    }
    if (Math.abs(x - towerAt) < 70) {
      // water tower
      out += '<rect x="' + (x - 3) + '" y="200" width="6" height="120" fill="' + ground + '"/>';
      out += '<rect x="' + (x - 40) + '" y="150" width="80" height="55" rx="10" fill="' + ground + '"/>';
      out += '<polygon points="' + (x - 40) + ",152 " + x + ",128 " + (x + 40) + ',152" fill="' + ground + '"/>';
      x += 110;
      continue;
    }
    const w = 70 + rand() * 50, h = 50 + rand() * 40;
    out += '<rect x="' + x + '" y="' + (320 - h).toFixed(0) + '" width="' + w.toFixed(0) + '" height="' + h.toFixed(0) + '" fill="' + ground + '"/>';
    out += '<polygon points="' + (x - 8) + "," + (320 - h).toFixed(0) + " " + (x + w / 2).toFixed(0) + "," + (320 - h - 38).toFixed(0) + " " + (x + w + 8).toFixed(0) + "," + (320 - h).toFixed(0) + '" fill="' + ground + '"/>';
    if (night && rand() < 0.7) out += '<rect x="' + (x + w / 2 - 6).toFixed(0) + '" y="' + (320 - h + 12).toFixed(0) + '" width="12" height="14" fill="' + lit + '"/>';
    if (rand() < 0.5) {
      const tx = x + w + 22;
      out += '<circle cx="' + tx.toFixed(0) + '" cy="276" r="24" fill="' + ground + '"/><rect x="' + (tx - 3).toFixed(0) + '" y="290" width="6" height="30" fill="' + ground + '"/>';
    }
    x += w + 30 + rand() * 40;
  }
  return out;
}

function lake(rand, ground, far, night) {
  let out = "";
  // far hills
  let d = "M0,230 ";
  for (let x = 0; x <= 1600; x += 100) d += "L" + x + "," + (190 + rand() * 50).toFixed(0) + " ";
  out += '<path d="' + d + 'L1600,320 L0,320 Z" fill="' + far + '"/>';
  // water band with a few ripples
  out += '<rect x="0" y="250" width="1600" height="70" fill="' + far + '" opacity="0.55"/>';
  for (let i = 0; i < 14; i++) {
    const y = 262 + rand() * 48, x = rand() * 1500;
    out += '<rect x="' + x.toFixed(0) + '" y="' + y.toFixed(0) + '" width="' + (40 + rand() * 80).toFixed(0) + '" height="2" fill="' + ground + '" opacity="0.35"/>';
  }
  // pines left and right
  const pine = (cx, base, h) => '<polygon points="' + (cx - h * 0.22).toFixed(0) + "," + base + " " + cx + "," + (base - h) + " " + (cx + h * 0.22).toFixed(0) + "," + base + '" fill="' + ground + '"/>' +
    '<polygon points="' + (cx - h * 0.18).toFixed(0) + "," + (base - h * 0.35).toFixed(0) + " " + cx + "," + (base - h * 1.05).toFixed(0) + " " + (cx + h * 0.18).toFixed(0) + "," + (base - h * 0.35).toFixed(0) + '" fill="' + ground + '"/>';
  for (let x = -10; x < 420; x += 30 + rand() * 20) out += pine(x, 320, 120 + rand() * 120);
  for (let x = 1220; x < 1620; x += 30 + rand() * 20) out += pine(x, 320, 120 + rand() * 120);
  // dock
  out += '<rect x="640" y="268" width="260" height="6" fill="' + ground + '"/>';
  for (let x = 650; x < 900; x += 50) out += '<rect x="' + x + '" y="268" width="5" height="34" fill="' + ground + '"/>';
  return out;
}

function farm(rand, ground, far, night) {
  let out = "";
  let d = "M0,250 ";
  for (let x = 0; x <= 1600; x += 160) d += "Q" + (x + 80) + "," + (200 + rand() * 40).toFixed(0) + " " + (x + 160) + ",250 ";
  out += '<path d="' + d + 'L1600,320 L0,320 Z" fill="' + far + '"/>';
  let front = "M0,290 ";
  for (let x = 0; x <= 1600; x += 200) front += "Q" + (x + 100) + "," + (262 + rand() * 20).toFixed(0) + " " + (x + 200) + ",290 ";
  out += '<path d="' + front + 'L1600,320 L0,320 Z" fill="' + ground + '"/>';
  // barn and silo
  const bx = 980 + rand() * 120;
  out += '<rect x="' + bx.toFixed(0) + '" y="230" width="150" height="70" fill="' + ground + '"/>';
  out += '<polygon points="' + (bx - 12).toFixed(0) + ",232 " + (bx + 75).toFixed(0) + ",176 " + (bx + 162).toFixed(0) + ',232" fill="' + ground + '"/>';
  out += '<rect x="' + (bx + 160).toFixed(0) + '" y="176" width="34" height="124" fill="' + ground + '"/>';
  out += '<ellipse cx="' + (bx + 177).toFixed(0) + '" cy="176" rx="17" ry="12" fill="' + ground + '"/>';
  if (night) out += '<rect x="' + (bx + 62).toFixed(0) + '" y="255" width="26" height="24" fill="#f5d37a"/>';
  // fence
  for (let x = 120; x < 700; x += 36) out += '<rect x="' + x + '" y="268" width="4" height="30" fill="' + ground + '"/>';
  out += '<rect x="120" y="274" width="580" height="3" fill="' + ground + '"/><rect x="120" y="286" width="580" height="3" fill="' + ground + '"/>';
  // lone tree
  out += '<circle cx="420" cy="214" r="46" fill="' + ground + '"/><rect x="416" y="240" width="8" height="60" fill="' + ground + '"/>';
  return out;
}

const SCENERY = { city, town, lake, farm };

/* ---------- sky furniture ---------- */

function skyShapes(rand, sky, theme) {
  const paper = theme === "paper";
  let out = "";
  if (sky.phase === "night" && !sky.cloudy && !paper) {
    for (let i = 0; i < 70; i++) {
      out += '<circle cx="' + (rand() * 1600).toFixed(0) + '" cy="' + (rand() * 200).toFixed(0) + '" r="' + (0.8 + rand() * 1.4).toFixed(1) + '" fill="#fff" opacity="' + (0.4 + rand() * 0.5).toFixed(2) + '"/>';
    }
  }
  const showBody = !sky.cloudy || sky.partly;
  if (showBody) {
    const night = sky.phase === "night";
    const t = night ? 0.5 : sky.progress;
    const x = 200 + t * 1200;
    const y = 200 - Math.sin(t * Math.PI) * 150;
    const fill = paper ? "#1b1b1a" : night ? "#e9ecf5" : "#ffe9a8";
    out += '<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="' + (night ? 28 : 36) + '" fill="' + fill + '" opacity="' + (paper ? 0.85 : 0.95) + '"/>';
    if (night && !paper) out += '<circle cx="' + (x + 12).toFixed(0) + '" cy="' + (y - 6).toFixed(0) + '" r="26" fill="' + skyColors("dark", sky).top + '"/>';
  }
  return out;
}

function cloudShapes(rand, sky, theme) {
  if (!(sky.cloudy || sky.partly)) return "";
  const count = sky.cloudy ? 7 : 3;
  const fill = theme === "paper" ? "#ffffff" : sky.phase === "night" ? "#3a4256" : "#d9e2ee";
  const op = theme === "paper" ? 0.8 : sky.cloudy ? 0.55 : 0.4;
  let out = "";
  for (let i = 0; i < count; i++) {
    const cx = 100 + rand() * 1400, cy = 40 + rand() * 120, s = 0.8 + rand() * 1.0;
    out += '<g class="cloud" style="animation-duration:' + (90 + rand() * 80).toFixed(0) + 's;animation-delay:-' + (rand() * 90).toFixed(0) + 's" opacity="' + op + '" fill="' + fill + '">' +
      '<ellipse cx="' + cx.toFixed(0) + '" cy="' + cy.toFixed(0) + '" rx="' + (90 * s).toFixed(0) + '" ry="' + (26 * s).toFixed(0) + '"/>' +
      '<ellipse cx="' + (cx - 40 * s).toFixed(0) + '" cy="' + (cy - 14 * s).toFixed(0) + '" rx="' + (50 * s).toFixed(0) + '" ry="' + (24 * s).toFixed(0) + '"/>' +
      '<ellipse cx="' + (cx + 30 * s).toFixed(0) + '" cy="' + (cy - 18 * s).toFixed(0) + '" rx="' + (56 * s).toFixed(0) + '" ry="' + (28 * s).toFixed(0) + '"/></g>';
  }
  return out;
}

function precipLayer(rand, sky, theme) {
  if (sky.precip === "none") return "";
  const snow = sky.precip === "snow";
  const color = theme === "paper" ? "#1b1b1a" : snow ? "#ffffff" : "#bcd0e8";
  let out = "";
  for (let i = 0; i < (snow ? 60 : 70); i++) {
    const x = (rand() * 1600).toFixed(0), delay = (-rand() * 4).toFixed(2), dur = (snow ? 5 + rand() * 4 : 0.9 + rand() * 0.6).toFixed(2);
    if (snow) out += '<circle class="flake" cx="' + x + '" cy="0" r="' + (2 + rand() * 2.5).toFixed(1) + '" fill="' + color + '" opacity="0.85" style="animation-duration:' + dur + "s;animation-delay:" + delay + 's"/>';
    else out += '<line class="drop" x1="' + x + '" y1="0" x2="' + (Number(x) - 8) + '" y2="22" stroke="' + color + '" stroke-width="2" opacity="0.6" style="animation-duration:' + dur + "s;animation-delay:" + delay + 's"/>';
  }
  return out;
}

/* ---------- public ---------- */

function renderScene(container, opts) {
  // opts: scene (city|town|lake|farm|none), theme, sky, seed, animate
  if (!container) return;
  if (opts.scene === "none" || !SCENERY[opts.scene]) {
    container.replaceChildren();
    return;
  }
  const theme = opts.theme === "paper" ? "paper" : "dark";
  const colors = skyColors(theme, opts.sky);
  const night = opts.sky.phase === "night" && theme === "dark";
  const rand = seededRandom(opts.seed + opts.scene);
  const skyRand = seededRandom(opts.seed + "sky");
  const svgSky =
    '<svg class="sky" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
    "<defs><linearGradient id=\"skyg\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"" + colors.top + "\"/><stop offset=\"1\" stop-color=\"" + colors.bottom + "\"/></linearGradient></defs>" +
    '<rect width="1600" height="900" fill="url(#skyg)"/>' +
    skyShapes(skyRand, opts.sky, theme) + cloudShapes(skyRand, opts.sky, theme) +
    (opts.animate ? '<g class="precip">' + precipLayer(skyRand, opts.sky, theme) + "</g>" : "") +
    "</svg>";
  const svgLand =
    '<svg class="land" viewBox="0 0 1600 320" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">' +
    SCENERY[opts.scene](rand, colors.ground, colors.far, night) +
    "</svg>";
  container.innerHTML = svgSky + svgLand;
  container.classList.toggle("fog", !!opts.sky.fog);
}
