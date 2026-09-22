#!/usr/bin/env node
/**
 * Merge mobile leftover EN strings into _maps/t-mobile-fr-ar.json (no locale edits).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadExternalMaps } from "./_wave-a-fr-ar-sw.mjs";
import { translate } from "./_wave-a-fr-ar-sw.mjs";
import { translateMobile } from "./_mobile-fr-ar-translate.mjs";
import { heuristicMobile } from "./_mobile-fr-ar-heuristic.mjs";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";
import { AR_SINGLE, FR_SINGLE } from "./_mobile-fr-ar-single.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

loadExternalMaps(path.join(root, "_maps"), fs, path);

const mapPath = path.join(root, "_maps/t-mobile-fr-ar.json");
const frArList = path.join(root, "_work/mobile-fr-ar-leftover-en.json");
const leftoverPath = fs.existsSync(frArList)
  ? frArList
  : path.join(root, "_work/mobile-leftover-en-now.json");
const manualPath = path.join(root, "_work/mobile-fr-ar-leftover-manual.json");
const extraPath = path.join(root, "_work/mobile-fr-ar-extra.json");

/** @type {Record<string, { fr: string, ar: string }>} */
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const beforeKeys = Object.keys(map).length;

const leftover = JSON.parse(fs.readFileSync(leftoverPath, "utf8"));
/** @type {Record<string, { fr: string, ar: string }>} */
const manual = fs.existsSync(manualPath)
  ? JSON.parse(fs.readFileSync(manualPath, "utf8"))
  : {};
/** @type {Record<string, { fr: string, ar: string }>} */
const extra = fs.existsSync(extraPath) ? JSON.parse(fs.readFileSync(extraPath, "utf8")) : {};

/** @type {Record<string, { fr?: string, ar?: string }>} */
const tmaps = {};
for (const f of fs.readdirSync(path.join(root, "_maps"))) {
  if (f.startsWith("t-") && f.endsWith(".json") && f !== "t-mobile-fr-ar.json") {
    Object.assign(tmaps, JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8")));
  }
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

function pick(en, locale) {
  const sources = [manual[en], extra[en], tmaps[en]];
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
    if (locale === "fr" ? frOk(en, tr) : arOk(en, tr)) return tr;
  }
  return null;
}

let added = 0;
let skipped = 0;

for (const en of leftover) {
  if (map[en] || isIdentity(en)) continue;
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
  manualEntries: Object.keys(manual).length,
  dest: mapPath,
});
