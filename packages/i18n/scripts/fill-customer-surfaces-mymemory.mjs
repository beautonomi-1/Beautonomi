#!/usr/bin/env node
/**
 * Fill in-scope leftovers via MyMemory (cached in _maps/customer-surfaces-mt-cache.json).
 *
 * Usage:
 *   node scripts/fill-customer-surfaces-mymemory.mjs
 *   node scripts/fill-customer-surfaces-mymemory.mjs --locale=af
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
import { safeWriteJson } from "./_safe-write-json.mjs";
import { remoteTranslatePhrase } from "./_remote-translate.mjs";
import { translate as translateWaveA, translateBestEffort } from "./_wave-a-translate.mjs";
import { translate as translateFrArSw } from "./_wave-a-fr-ar-sw.mjs";
import { loadExternalMaps, loadFrArMobileMaps } from "./_wave-a-fr-ar-sw.mjs";
import { loadSaExternalMaps } from "./_wave-a-translate.mjs";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
loadExternalMaps(path.join(rootDir, "_maps"), fs, path);
loadFrArMobileMaps(path.join(rootDir, "_maps"), fs, path);
loadSaExternalMaps(path.join(rootDir, "_maps"), fs, path);

const SA = new Set(["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss", "pt", "es"]);
const FRARSW = new Set(["fr", "ar", "sw"]);
const WAVE_B = new Set(["de", "hi", "id", "tr", "am", "rw", "nl", "it"]);
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

/** @type {Map<string, Map<string, string>>} */
const donorFlats = new Map();
for (const d of ["fr", "es", "pt", "de", "sw"]) {
  donorFlats.set(
    d,
    flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${d}.json`), "utf8"))),
  );
}

function proposeLocal(en, locale, sampleKey) {
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
  if (WAVE_B.has(locale) && sampleKey) {
    for (const donor of WAVE_B_FALLBACK[locale] ?? []) {
      const donorVal = donorFlats.get(donor)?.get(sampleKey);
      if (
        typeof donorVal === "string" &&
        donorVal !== en &&
        varsOk(en, donorVal) &&
        !isCustomerSurfaceLeftover(en, donorVal)
      ) {
        return donorVal;
      }
    }
  }
  return null;
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cachePath = path.join(root, "_maps/customer-surfaces-mt-cache.json");
const onlyLocale = process.argv.find((a) => a.startsWith("--locale="))?.replace("--locale=", "");

function extractVars(str) {
  const vars = new Set();
  for (const m of String(str).matchAll(/\{\{(\w+)\}\}/g)) vars.add(m[1]);
  return vars;
}

function varsOk(en, out) {
  const enVars = extractVars(en);
  const outVars = extractVars(out);
  for (const v of enVars) {
    if (!outVars.has(v)) return false;
  }
  return true;
}

function loadCache() {
  if (!fs.existsSync(cachePath)) return {};
  return JSON.parse(fs.readFileSync(cachePath, "utf8"));
}

function saveCache(cache) {
  safeWriteJson(cachePath, cache);
}

const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));
const cache = loadCache();
const localesToRun = onlyLocale ? TARGET_LOCALES.filter((l) => l === onlyLocale) : TARGET_LOCALES;

for (const locale of localesToRun) {
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flattenLocale(data);
  const pendingByEn = new Map();

  for (const key of scope) {
    const enVal = enFlat.get(key);
    if (typeof enVal !== "string") continue;
    const locVal = locFlat.get(key);
    if (!isCustomerSurfaceLeftover(enVal, locVal)) continue;
    if (!pendingByEn.has(enVal)) pendingByEn.set(enVal, []);
    pendingByEn.get(enVal).push(key);
  }

  let written = 0;
  let idx = 0;
  const total = pendingByEn.size;
  console.log(`${locale}: ${total} unique phrases to translate`);

  for (const [enVal, keys] of pendingByEn) {
    idx += 1;
    if (idx === 1 || idx % 20 === 0 || idx === total) {
      console.log(`${locale}: phrase ${idx}/${total}`);
    }

    if (!cache[enVal]) cache[enVal] = {};
    let tr = cache[enVal][locale];
    const cachedOk =
      typeof tr === "string" && tr !== enVal && varsOk(enVal, tr) && !isCustomerSurfaceLeftover(enVal, tr);
    if (!cachedOk) {
      tr = proposeLocal(enVal, locale, keys[0]);
      if (!tr) {
        const delayMs = process.env.CUSTOMER_I18N_SLOW === "1" ? 2500 : 80;
        tr = await remoteTranslatePhrase(enVal, locale, delayMs);
      }
      if (tr && tr !== enVal && varsOk(enVal, tr) && !isCustomerSurfaceLeftover(enVal, tr)) {
        cache[enVal][locale] = tr;
        if (idx % 25 === 0) saveCache(cache);
      } else {
        tr = null;
      }
    }

    if (!tr) continue;
    for (const key of keys) {
      const locVal = locFlat.get(key);
      if (!isCustomerSurfaceLeftover(enVal, locVal)) continue;
      const parts = key.split(".");
      let cur = data;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!cur[p] || typeof cur[p] !== "object" || Array.isArray(cur[p])) cur[p] = {};
        cur = cur[p];
      }
      cur[parts[parts.length - 1]] = tr;
      locFlat.set(key, tr);
      written += 1;
    }
  }

  saveCache(cache);
  if (written > 0) safeWriteJson(localePath, data);
  console.log(`${locale}: wrote ${written} keys`);
}

const after = auditCustomerSurfaces();
console.log(`After MyMemory — total leftover: ${after.totalLeftover}`);
