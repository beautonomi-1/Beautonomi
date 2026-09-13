#!/usr/bin/env node
/**
 * Retranslate leftover English/calque values in public-flow namespaces
 * using the English source string (not the mixed locale value).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { translate as translateWaveA, stillMostlyEnglish } from "./_wave-a-translate.mjs";
import { translate as translateFrArSw } from "./_wave-a-fr-ar-sw.mjs";

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");
const WAVE = ["pt", "es", "af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const FRARSW = ["fr", "ar", "sw"];
const ALL = [...WAVE, ...FRARSW];
const ALIASES = { "pt-BR": "pt", "es-MX": "es" };

const PREFIXES = [
  "web.global.loginModal",
  "web.global.phoneInput",
  "customer.mobile.screens.partnerProfile",
  "auth",
  "authGate",
  "common",
];

const ENGLISH_MARKERS =
  /\b(with|your|when|you|instead|Need|Creating|Signing|we'll|features|beauty|near|Please|check|inbox|spam|Welcome|Logged|claim|haven't|yet|If|all |to |or |Welcome to|successfully)\b/;

function flatten(obj, prefix = "", out = new Map()) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, full, out);
    else if (typeof v === "string") out.set(full, v);
  }
  return out;
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

function inPrefix(key) {
  return PREFIXES.some((p) => key === p || key.startsWith(`${p}.`));
}

function looksCalqued(en, loc) {
  if (!loc || loc === en) return true;
  if (stillMostlyEnglish(en, loc)) return true;
  return ENGLISH_MARKERS.test(loc);
}

function translateFor(en, locale) {
  if (WAVE.includes(locale)) return translateWaveA(en, locale);
  if (FRARSW.includes(locale)) return translateFrArSw(en, locale);
  return en;
}

function writeLocale(localePath, data) {
  const payload = JSON.stringify(data, null, 2) + "\n";
  const tmp = `${localePath}.tmp`;
  let lastErr;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      fs.writeFileSync(tmp, payload);
      fs.renameSync(tmp, localePath);
      return;
    } catch (err) {
      lastErr = err;
      const until = Date.now() + 400 * (attempt + 1);
      while (Date.now() < until) {
        /* wait */
      }
    }
  }
  throw lastErr;
}

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const enFlat = flatten(en);

for (const locale of ALL) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flatten(data);
  let mapped = 0;
  let skipped = 0;
  for (const [key, enVal] of enFlat) {
    if (!inPrefix(key)) continue;
    const locVal = locFlat.get(key);
    if (typeof locVal !== "string") continue;
    if (!looksCalqued(enVal, locVal)) continue;
    const out = translateFor(enVal, locale);
    if (!out || out === enVal || out === locVal) {
      skipped += 1;
      continue;
    }
    if (WAVE.includes(locale) && stillMostlyEnglish(enVal, out)) {
      skipped += 1;
      continue;
    }
    deepSet(data, key, out);
    mapped += 1;
  }
  writeLocale(localePath, data);
  console.log(locale, "mapped", mapped, "skipped", skipped);
}

for (const [alias, src] of Object.entries(ALIASES)) {
  const aliasPath = path.join(localesDir, `${alias}.json`);
  if (!fs.existsSync(aliasPath)) continue;
  const data = JSON.parse(fs.readFileSync(aliasPath, "utf8"));
  const srcFlat = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, `${src}.json`), "utf8")));
  for (const [key] of enFlat) {
    if (!inPrefix(key)) continue;
    if (srcFlat.has(key)) deepSet(data, key, srcFlat.get(key));
  }
  writeLocale(aliasPath, data);
  console.log("updated", alias, "from", src);
}
