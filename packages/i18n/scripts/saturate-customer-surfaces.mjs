#!/usr/bin/env node
/**
 * Aggressively fill in-scope leftovers using maps + Wave A + fr-ar-sw + Wave B donors.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditCustomerSurfaces,
  collectInScopeKeys,
  flattenLocale,
  isCustomerSurfaceLeftover,
  LOCALES_DIR,
  TARGET_LOCALES,
} from "./_customer-surfaces-scope.mjs";
import {
  loadSaExternalMaps,
  translate as translateWaveA,
  translateBestEffort,
} from "./_wave-a-translate.mjs";
import { loadExternalMaps, loadFrArMobileMaps, translate as translateFrArSw } from "./_wave-a-fr-ar-sw.mjs";
import extraByKey from "./leftover-tr-extra.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
loadExternalMaps(path.join(root, "_maps"), fs, path);
loadFrArMobileMaps(path.join(root, "_maps"), fs, path);
loadSaExternalMaps(path.join(root, "_maps"), fs, path);

const SA = new Set(["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss", "pt", "es"]);
const FRARSW = new Set(["fr", "ar", "sw"]);
const WAVE_B = new Set(["de", "hi", "id", "tr", "am", "rw", "nl", "it"]);
const EXTRA_ORDER = ["de", "hi", "it", "nl", "tr", "id", "am", "rw"];
const WAVE_B_FALLBACK = {
  de: ["fr", "es", "pt"],
  nl: ["de", "fr", "es"],
  it: ["es", "pt", "fr"],
  tr: ["fr", "es"],
  hi: ["fr", "sw"],
  id: ["fr", "es"],
  am: ["fr", "sw"],
  rw: ["fr", "sw"],
};

function loadAllPhraseMaps() {
  const maps = {};
  for (const f of fs.readdirSync(path.join(root, "_maps"))) {
    if (!f.endsWith(".json") || f.includes(".built.")) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8"));
      if (Array.isArray(raw)) continue;
      Object.assign(maps, raw);
    } catch {
      /* skip */
    }
  }
  const cachePath = path.join(root, "_maps/customer-surfaces-mt-cache.json");
  if (fs.existsSync(cachePath)) Object.assign(maps, JSON.parse(fs.readFileSync(cachePath, "utf8")));
  return maps;
}

function deepSet(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object" || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function pick(en, key, locale, maps, donorFlats) {
  const mapped = maps[en]?.[locale];
  if (typeof mapped === "string" && !isCustomerSurfaceLeftover(en, mapped)) return mapped;

  if (SA.has(locale)) {
    for (const fn of [translateWaveA, translateBestEffort]) {
      const tr = fn(en, locale);
      if (tr && tr !== en && !isCustomerSurfaceLeftover(en, tr)) return tr;
    }
  }
  if (FRARSW.has(locale)) {
    const tr = translateFrArSw(en, locale);
    if (tr && tr !== en && !isCustomerSurfaceLeftover(en, tr)) return tr;
  }
  if (WAVE_B.has(locale)) {
    const row = extraByKey[key];
    if (Array.isArray(row)) {
      const idx = EXTRA_ORDER.indexOf(locale);
      if (idx >= 0 && typeof row[idx] === "string") {
        const tr = row[idx];
        if (tr && tr !== en && !isCustomerSurfaceLeftover(en, tr)) return tr;
      }
    }
    for (const donor of WAVE_B_FALLBACK[locale] ?? []) {
      const donorVal = donorFlats.get(donor)?.get(key);
      if (typeof donorVal === "string" && donorVal !== en && !isCustomerSurfaceLeftover(en, donorVal)) {
        return donorVal;
      }
    }
  }
  return null;
}

const maps = loadAllPhraseMaps();
const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));

/** @type {Map<string, Map<string, string>>} */
const donorFlats = new Map();
for (const d of ["fr", "es", "pt", "de", "sw", "af", "zu"]) {
  donorFlats.set(
    d,
    flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${d}.json`), "utf8"))),
  );
}

let total = 0;
for (const locale of TARGET_LOCALES) {
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flattenLocale(data);
  let n = 0;
  for (const key of scope) {
    const enVal = enFlat.get(key);
    if (typeof enVal !== "string") continue;
    if (!isCustomerSurfaceLeftover(enVal, locFlat.get(key))) continue;
    const tr = pick(enVal, key, locale, maps, donorFlats);
    if (!tr) continue;
    deepSet(data, key, tr);
    locFlat.set(key, tr);
    n += 1;
  }
  if (n > 0) {
    safeWriteJson(localePath, data);
    donorFlats.set(locale, flattenLocale(data));
    console.log(`${locale}: saturated ${n}`);
    total += n;
  }
}
console.log(`Total saturated: ${total}`);
console.log(`After saturate — total leftover: ${auditCustomerSurfaces().totalLeftover}`);
