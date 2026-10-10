#!/usr/bin/env node
/**
 * Fill in-scope customer surface translations (locale JSON).
 *
 * Usage:
 *   node scripts/apply-customer-surfaces-translations.mjs
 *   node scripts/apply-customer-surfaces-translations.mjs --remote   # Wave B via Google Translate
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
  isIdentity,
  loadSaExternalMaps,
  stillMostlyEnglish,
  translate as translateWaveA,
  translateBestEffort,
} from "./_wave-a-translate.mjs";
import { loadExternalMaps, loadFrArMobileMaps, translate as translateFrArSw } from "./_wave-a-fr-ar-sw.mjs";
import extraByKey from "./leftover-tr-extra.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";
import { remoteTranslatePhrase } from "./_remote-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const useRemote = process.argv.includes("--remote");
const onlyLocale = process.argv.find((a) => a.startsWith("--locale="))?.replace("--locale=", "");

const SA = new Set(["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"]);
const FRARSW = new Set(["fr", "ar", "sw"]);
const WAVE_A_LATIN = new Set(["pt", "es"]);
const WAVE_B = new Set(["de", "hi", "id", "tr", "am", "rw", "nl", "it"]);
const EXTRA_ORDER = ["de", "hi", "it", "nl", "tr", "id", "am", "rw"];
/** When Wave B machine translation is unavailable, borrow from a Wave A sibling catalog. */
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

const BRANDS = [
  "Beautonomi",
  "Paystack",
  "Yoco",
  "WhatsApp",
  "Apple",
  "Google",
  "Instagram",
  "Facebook",
  "Mailchimp",
  "Stripe",
  "Mapbox",
  "Twilio",
];

function lockTokens(text) {
  const locks = [];
  const lock = (t) => {
    locks.push(t);
    return `\uE000${locks.length - 1}\uE001`;
  };
  let out = text;
  out = out.replace(/\n/g, () => lock("\n"));
  out = out.replace(/\{\{(\w+)\}\}/g, (m) => lock(m));
  for (const t of BRANDS.sort((a, b) => b.length - a.length)) {
    if (t && out.includes(t)) out = out.split(t).join(lock(t));
  }
  return { out, locks };
}

function unlock(text, locks) {
  return text.replace(/\uE000(\d+)\uE001/g, (_, i) => locks[Number(i)]);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function remoteTranslate(en, locale) {
  const tr = await remoteTranslatePhrase(en, locale, 80);
  return tr ?? en;
}

function loadPhraseMaps() {
  /** Skip loading entire _maps (large); SA/fr maps already merged into translate(). */
  return new Map();
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

function proposeLocal(en, key, locale, phraseMaps) {
  if (isIdentity(en)) return en;
  const mapped = phraseMaps.get(en)?.[locale];
  if (mapped && mapped !== en && varsOk(en, mapped) && !isCustomerSurfaceLeftover(en, mapped)) {
    return mapped;
  }
  if (WAVE_B.has(locale)) {
    const row = extraByKey[key];
    if (Array.isArray(row)) {
      const idx = EXTRA_ORDER.indexOf(locale);
      if (idx >= 0 && typeof row[idx] === "string") {
        const v = row[idx];
        if (v && v !== en && varsOk(en, v) && !isCustomerSurfaceLeftover(en, v)) return v;
      }
    }
  }
  if (SA.has(locale) || WAVE_A_LATIN.has(locale)) {
    for (const fn of [translateWaveA, translateBestEffort]) {
      const tr = fn(en, locale);
      if (tr && tr !== en && varsOk(en, tr) && !isCustomerSurfaceLeftover(en, tr)) return tr;
      if (tr && tr !== en && varsOk(en, tr) && en.length < 40) return tr;
    }
  }
  if (FRARSW.has(locale)) {
    const tr = translateFrArSw(en, locale);
    if (tr && tr !== en && varsOk(en, tr) && !isCustomerSurfaceLeftover(en, tr)) return tr;
    if (tr && tr !== en && varsOk(en, tr) && en.length < 40) return tr;
  }
  if (WAVE_B.has(locale)) {
    const row = extraByKey[key];
    if (Array.isArray(row)) {
      const idx = EXTRA_ORDER.indexOf(locale);
      if (idx >= 0 && typeof row[idx] === "string") {
        const tr = row[idx];
        if (tr && tr !== en && varsOk(en, tr) && !isCustomerSurfaceLeftover(en, tr)) return tr;
      }
    }
    for (const donor of WAVE_B_FALLBACK[locale] ?? []) {
      const donorVal = localeFlats.get(donor)?.get(key);
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

loadExternalMaps(path.join(root, "_maps"), fs, path);
loadFrArMobileMaps(path.join(root, "_maps"), fs, path);
loadSaExternalMaps(path.join(root, "_maps"), fs, path);
const phraseMaps = loadPhraseMaps();

const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));
/** @type {Map<string, Map<string, string>>} */
const localeFlats = new Map();
for (const loc of TARGET_LOCALES) {
  localeFlats.set(
    loc,
    flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${loc}.json`), "utf8"))),
  );
}

/** @type {Map<string, string|null>} */
const translationCache = new Map();

async function translateFor(en, key, locale) {
  const cacheKey = `${locale}\0${en}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);
  let next = proposeLocal(en, key, locale, phraseMaps);
  if (!next && useRemote) {
    next = await remoteTranslate(en, locale);
  }
  if (next && next !== en && varsOk(en, next)) {
    if (!isCustomerSurfaceLeftover(en, next) || en.length < 40) {
      translationCache.set(cacheKey, next);
      return next;
    }
  }
  translationCache.set(cacheKey, null);
  return null;
}

let totalWritten = 0;

const localesToRun = onlyLocale ? TARGET_LOCALES.filter((l) => l === onlyLocale) : TARGET_LOCALES;
if (onlyLocale && localesToRun.length === 0) {
  console.error(`Unknown locale: ${onlyLocale}`);
  process.exit(1);
}

for (const locale of localesToRun) {
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = localeFlats.get(locale) ?? flattenLocale(data);
  let written = 0;

  /** Dedupe remote/local work by English source within this locale. */
  const pendingByEn = new Map();

  for (const key of scope) {
    const enVal = enFlat.get(key);
    if (typeof enVal !== "string") continue;
    const locVal = locFlat.get(key);
    if (!isCustomerSurfaceLeftover(enVal, locVal)) continue;
    if (!pendingByEn.has(enVal)) pendingByEn.set(enVal, []);
    pendingByEn.get(enVal).push(key);
  }

  let idx = 0;
  const totalPhrases = pendingByEn.size;
  for (const [enVal, keys] of pendingByEn) {
    idx += 1;
    if (idx === 1 || idx % 25 === 0 || idx === totalPhrases) {
      console.log(`${locale}: translating phrase ${idx}/${totalPhrases}`);
    }
    const next = await translateFor(enVal, keys[0], locale);
    if (!next) continue;
    for (const key of keys) {
      const locVal = locFlat.get(key);
      if (!isCustomerSurfaceLeftover(enVal, locVal)) continue;
      deepSet(data, key, next);
      locFlat.set(key, next);
      written += 1;
    }
  }

  if (written > 0) {
    safeWriteJson(localePath, data);
    localeFlats.set(locale, flattenLocale(data));
    console.log(`${locale}: updated ${written} keys`);
    totalWritten += written;
  } else {
    console.log(`${locale}: no changes`);
  }
}

console.log(`Total keys updated: ${totalWritten}`);
const after = auditCustomerSurfaces();
console.log(`After apply — total leftover: ${after.totalLeftover}`);
