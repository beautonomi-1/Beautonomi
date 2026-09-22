#!/usr/bin/env node
/**
 * Add mobile-scope rows to t-mobile-fr-ar.json where fr locale is still English.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadExternalMaps, translate } from "./_wave-a-fr-ar-sw.mjs";
import { translateMobile } from "./_mobile-fr-ar-translate.mjs";
import { heuristicMobile } from "./_mobile-fr-ar-heuristic.mjs";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";
import { AR_SINGLE, FR_SINGLE } from "./_mobile-fr-ar-single.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
loadExternalMaps(path.join(root, "_maps"), fs, path);

const PREFIXES = [
  "common",
  "auth",
  "authGate",
  "checkout",
  "booking",
  "payments",
  "validation",
  "errors",
  "time",
  "bookingLifecycle",
  "customer.mobile",
  "provider.mobile",
  "web.global.cityWaitlist",
  "web.global.marketAvailability",
];

const mapPath = path.join(root, "_maps/t-mobile-fr-ar.json");
const manualPath = path.join(root, "_work/mobile-fr-ar-leftover-manual.json");
const extraPath = path.join(root, "_work/mobile-fr-ar-extra.json");

/** @type {Record<string, { fr: string, ar: string }>} */
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const beforeKeys = Object.keys(map).length;

/** @type {Record<string, { fr: string, ar: string }>} */
const manual = fs.existsSync(manualPath)
  ? JSON.parse(fs.readFileSync(manualPath, "utf8"))
  : {};
/** @type {Record<string, { fr: string, ar: string }>} */
const extra = fs.existsSync(extraPath) ? JSON.parse(fs.readFileSync(extraPath, "utf8")) : {};

function flatten(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, full, out);
    else out.set(full, String(value ?? ""));
  }
  return out;
}

function extractVars(str) {
  const vars = new Set();
  for (const m of String(str).matchAll(/\{\{(\w+)\}\}/g)) vars.add(m[1]);
  return vars;
}

function varsOk(en, out) {
  for (const v of extractVars(en)) {
    if (!extractVars(out).has(v)) return false;
  }
  return true;
}

function frOk(en, fr) {
  if (!fr || fr === en || !varsOk(en, fr)) return false;
  if (/[àâäéèêëïîôùûüç]|’|«|»/.test(fr)) return true;
  return !stillMostlyEnglish(en, fr);
}

function arOk(en, ar) {
  if (!ar || ar === en || !varsOk(en, ar)) return false;
  return /[\u0600-\u06FF]/.test(ar);
}

function pick(en, locale) {
  const sources = [manual[en], extra[en]];
  for (const row of sources) {
    const tr = row?.[locale];
    if (tr && (locale === "fr" ? frOk(en, tr) : arOk(en, tr))) return tr;
  }
  for (const fn of [
    () => translateMobile(en, locale),
    () => translate(en, locale),
    () => heuristicMobile(en, locale),
    () => (locale === "fr" ? FR_SINGLE.get(en) : AR_SINGLE.get(en)),
  ]) {
    const tr = fn();
    if (tr && (locale === "fr" ? frOk(en, tr) : arOk(en, tr))) return tr;
  }
  return null;
}

const localesDir = path.join(root, "src/locales");
const enF = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8")));
const frF = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, "fr.json"), "utf8")));

const candidates = [];
for (const [key, enVal] of enF) {
  if (!PREFIXES.some((p) => key === p || key.startsWith(`${p}.`))) continue;
  if (isIdentity(enVal)) continue;
  const frLoc = frF.get(key);
  if (typeof frLoc !== "string") continue;
  if (frLoc !== enVal && !stillMostlyEnglish(enVal, frLoc)) continue;
  if (map[enVal]) continue;
  candidates.push(enVal);
}

candidates.sort((a, b) => a.length - b.length);

let added = 0;
let skipped = 0;
for (const en of candidates) {
  const fr = pick(en, "fr");
  const ar = pick(en, "ar");
  if (!fr || !ar || !frOk(en, fr) || !arOk(en, ar)) {
    skipped += 1;
    continue;
  }
  map[en] = { fr, ar };
  added += 1;
}

fs.writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);

const afterKeys = Object.keys(map).length;
console.log({
  beforeKeys,
  afterKeys,
  added,
  skipped,
  candidates: candidates.length,
  dest: mapPath,
});
