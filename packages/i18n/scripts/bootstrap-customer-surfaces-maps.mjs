#!/usr/bin/env node
/**
 * Build customer-surfaces-bootstrap.json from in-scope leftover English phrases.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectInScopeKeys,
  flattenLocale,
  isCustomerSurfaceLeftover,
  LOCALES_DIR,
  TARGET_LOCALES,
} from "./_customer-surfaces-scope.mjs";
import { EXTRA_EXACT, GLOSSARY } from "./_wave-a-lexicon.mjs";
import {
  isIdentity,
  loadSaExternalMaps,
  stillMostlyEnglish,
  translate,
  translateBestEffort,
} from "./_wave-a-translate.mjs";
import { loadExternalMaps, loadFrArMobileMaps, translate as translateFrArSw } from "./_wave-a-fr-ar-sw.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
loadExternalMaps(path.join(root, "_maps"), fs, path);
loadFrArMobileMaps(path.join(root, "_maps"), fs, path);
loadSaExternalMaps(path.join(root, "_maps"), fs, path);

const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const FRARSW = ["fr", "ar", "sw"];
const LATIN = ["pt", "es"];

function loadMergedMaps() {
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
  return maps;
}

const PHRASE = new Map(Object.entries(loadMergedMaps()));
for (const [en, row] of EXTRA_EXACT) PHRASE.set(en, row);
for (const [phrase, row] of GLOSSARY) {
  if (!PHRASE.has(phrase)) PHRASE.set(phrase, row);
}

const GLOSS = [...GLOSSARY].sort((a, b) => b[0].length - a[0].length);

function applyGlossary(en, locale) {
  const locks = [];
  const lock = (t) => {
    locks.push(t);
    return `\uE000${locks.length - 1}\uE001`;
  };
  let out = en.replace(/\{\{(\w+)\}\}/g, (m) => lock(m));
  for (const [phrase, row] of GLOSS) {
    const dest = row[locale];
    if (!dest || !phrase) continue;
    if (out.includes(phrase)) out = out.split(phrase).join(lock(dest));
  }
  return out.replace(/\uE000(\d+)\uE001/g, (_, i) => locks[Number(i)]);
}

function smartSa(en, locale) {
  const exact = PHRASE.get(en);
  if (exact?.[locale] && exact[locale] !== en && !isCustomerSurfaceLeftover(en, exact[locale])) {
    return exact[locale];
  }
  for (const fn of [
    () => translate(en, locale),
    () => applyGlossary(en, locale),
    () => translateBestEffort(en, locale),
  ]) {
    const tr = fn();
    if (tr && tr !== en && !isCustomerSurfaceLeftover(en, tr)) return tr;
  }
  return exact?.[locale] && exact[locale] !== en ? exact[locale] : null;
}

function smartFrArSw(en, locale) {
  const exact = PHRASE.get(en);
  if (exact?.[locale] && exact[locale] !== en && !isCustomerSurfaceLeftover(en, exact[locale])) {
    return exact[locale];
  }
  const tr = translateFrArSw(en, locale);
  if (tr && tr !== en && !isCustomerSurfaceLeftover(en, tr)) return tr;
  return exact?.[locale] && exact[locale] !== en ? exact[locale] : null;
}

const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));
const phrases = new Set();
for (const locale of TARGET_LOCALES) {
  const locFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), "utf8")));
  for (const key of scope) {
    const en = enFlat.get(key);
    if (typeof en !== "string" || isIdentity(en)) continue;
    if (isCustomerSurfaceLeftover(en, locFlat.get(key))) phrases.add(en);
  }
}

const out = {};
let rows = 0;
for (const en of phrases) {
  const row = {};
  for (const locale of SA) {
    const tr = smartSa(en, locale);
    if (tr) row[locale] = tr;
  }
  for (const locale of [...LATIN, ...FRARSW]) {
    const tr = FRARSW.includes(locale) ? smartFrArSw(en, locale) : smartSa(en, locale);
    if (tr) row[locale] = tr;
  }
  if (Object.keys(row).length > 0) {
    out[en] = row;
    rows += 1;
  }
}

const outPath = path.join(root, "_maps/customer-surfaces-bootstrap.json");
safeWriteJson(outPath, out);
console.log(`Bootstrap map: ${rows} phrases from ${phrases.size} leftover English sources`);
