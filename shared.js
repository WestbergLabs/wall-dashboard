"use strict";

/*
 * Settings model
 *   config.json  = shipped defaults (committed to git)
 *   localStorage = per-device overrides saved by settings.html
 * The dashboard and the settings page both call loadSettings() to get the merged result.
 */

const SETTINGS_KEY = "wallDashboard.settings";
const SCREEN_IDS = ["clock", "weather", "scores", "fantasy"];

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(base, over) {
  if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over;
  const out = Object.assign({}, base);
  for (const key of Object.keys(over)) {
    out[key] = isPlainObject(base[key]) && isPlainObject(over[key]) ? deepMerge(base[key], over[key]) : over[key];
  }
  return out;
}

function readOverrides() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return isPlainObject(parsed) ? parsed : {};
  } catch (err) {
    return {};
  }
}

function writeOverrides(obj) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj));
    return true;
  } catch (err) {
    return false;
  }
}

function clearOverrides() {
  try { localStorage.removeItem(SETTINGS_KEY); } catch (err) { /* ignore */ }
}

async function loadDefaults() {
  const res = await fetch("config.json", { cache: "no-store" });
  if (!res.ok) throw new Error("config.json -> HTTP " + res.status);
  return res.json();
}

async function loadSettings() {
  let defaults = {};
  let error = null;
  try {
    defaults = await loadDefaults();
  } catch (err) {
    error = err;
  }
  const merged = deepMerge(defaults, readOverrides());

  // Normalize screen order: keep known ids, append any that are missing.
  const order = Array.isArray(merged.order) ? merged.order.filter((id) => SCREEN_IDS.includes(id)) : [];
  SCREEN_IDS.forEach((id) => { if (!order.includes(id)) order.push(id); });
  merged.order = order;
  merged.enabled = merged.enabled || {};
  merged.seconds = merged.seconds || {};
  return { settings: merged, defaults, error };
}

/* "MM-DD" helpers for the fantasy season window. */
function monthDay(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return m + "-" + d;
}

function inSeason(start, end, date) {
  const md = monthDay(date || new Date());
  if (!/^\d\d-\d\d$/.test(start || "") || !/^\d\d-\d\d$/.test(end || "")) return true;
  return start <= end ? md >= start && md <= end : md >= start || md <= end;
}
