#!/usr/bin/env node
/**
 * Extend t-mobile-fr-ar.json with fr/ar English-clone rows for mobile-scope leftovers
 * (brands, tokens, and strings already curated as English in SA mobile maps).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";
import { translateMobile } from "./_mobile-fr-ar-translate.mjs";
import { translate } from "./_wave-a-fr-ar-sw.mjs";
import { heuristicMobile } from "./_mobile-fr-ar-heuristic.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
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
/** @type {Record<string, { fr: string, ar: string }>} */
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const beforeKeys = Object.keys(map).length;

const saMaps = {};
for (const f of fs.readdirSync(path.join(root, "_maps"))) {
  if (f.startsWith("t-sa-mobile-") && f.endsWith(".json") && !f.includes(".built.")) {
    Object.assign(saMaps, JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8")));
  }
}

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
  if (!fr || !varsOk(en, fr)) return false;
  if (fr === en) return true;
  if (/[àâäéèêëïîôùûüç]|’|«|»/.test(fr)) return true;
  return !stillMostlyEnglish(en, fr);
}

function arOk(en, ar) {
  if (!ar || !varsOk(en, ar)) return false;
  if (ar === en) return true;
  return /[\u0600-\u06FF]/.test(ar);
}

function saEnglishClone(en) {
  const row = saMaps[en];
  if (!row) return false;
  return Object.values(row).every((tr) => tr === en);
}

function pickTranslated(en, locale) {
  for (const fn of [
    () => translateMobile(en, locale),
    () => translate(en, locale),
    () => heuristicMobile(en, locale),
  ]) {
    const tr = fn();
    if (locale === "fr" ? frOk(en, tr) && tr !== en : arOk(en, tr) && tr !== en) return tr;
  }
  return null;
}

const enF = flatten(JSON.parse(fs.readFileSync(path.join(root, "src/locales/en.json"), "utf8")));
const frF = flatten(JSON.parse(fs.readFileSync(path.join(root, "src/locales/fr.json"), "utf8")));
const arF = flatten(JSON.parse(fs.readFileSync(path.join(root, "src/locales/ar.json"), "utf8")));

const candidates = new Set();
for (const [key, enVal] of enF) {
  if (!PREFIXES.some((p) => key === p || key.startsWith(`${p}.`))) continue;
  if (isIdentity(enVal)) continue;
  const frLoc = frF.get(key);
  const arLoc = arF.get(key);
  if (typeof frLoc !== "string" || typeof arLoc !== "string") continue;
  const frLeft = frLoc === enVal || stillMostlyEnglish(enVal, frLoc);
  const arLeft = arLoc === enVal || stillMostlyEnglish(enVal, arLoc);
  if (!frLeft && !arLeft) continue;
  if (map[enVal]) continue;
  candidates.add(enVal);
}

let addedClone = 0;
let addedTranslated = 0;
let skipped = 0;

for (const en of [...candidates].sort((a, b) => a.length - b.length)) {
  if (map[en]) continue;
  if (isIdentity(en) || saEnglishClone(en)) {
    map[en] = { fr: en, ar: en };
    addedClone += 1;
    continue;
  }
  const fr = pickTranslated(en, "fr");
  const ar = pickTranslated(en, "ar");
  if (fr && ar && frOk(en, fr) && arOk(en, ar)) {
    map[en] = { fr, ar };
    addedTranslated += 1;
  } else {
    skipped += 1;
  }
}

fs.writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
console.log({
  beforeKeys,
  afterKeys: Object.keys(map).length,
  addedClone,
  addedTranslated,
  skipped,
  candidates: candidates.size,
});
