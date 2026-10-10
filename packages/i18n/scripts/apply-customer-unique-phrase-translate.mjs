#!/usr/bin/env node
/**
 * Translate each unique leftover English phrase per locale (Wave A / fr-ar-sw) and apply to all matching keys.
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
import { safeWriteJson } from "./_safe-write-json.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
loadExternalMaps(path.join(root, "_maps"), fs, path);
loadFrArMobileMaps(path.join(root, "_maps"), fs, path);
loadSaExternalMaps(path.join(root, "_maps"), fs, path);

const SA = new Set(["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss", "pt", "es"]);
const FRARSW = new Set(["fr", "ar", "sw"]);

function translatePhrase(en, locale) {
  if (FRARSW.has(locale)) {
    const tr = translateFrArSw(en, locale);
    if (tr && tr !== en && !isCustomerSurfaceLeftover(en, tr)) return tr;
    return null;
  }
  if (SA.has(locale)) {
    for (const fn of [translateWaveA, translateBestEffort]) {
      const tr = fn(en, locale);
      if (tr && tr !== en && !isCustomerSurfaceLeftover(en, tr)) return tr;
    }
  }
  return null;
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

const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));

for (const locale of TARGET_LOCALES) {
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flattenLocale(data);
  const pendingByEn = new Map();
  for (const key of scope) {
    const enVal = enFlat.get(key);
    if (typeof enVal !== "string") continue;
    if (!isCustomerSurfaceLeftover(enVal, locFlat.get(key))) continue;
    if (!pendingByEn.has(enVal)) pendingByEn.set(enVal, []);
    pendingByEn.get(enVal).push(key);
  }
  let n = 0;
  for (const [enVal, keys] of pendingByEn) {
    const tr = translatePhrase(enVal, locale);
    if (!tr) continue;
    for (const key of keys) {
      if (!isCustomerSurfaceLeftover(enVal, locFlat.get(key))) continue;
      deepSet(data, key, tr);
      locFlat.set(key, tr);
      n += 1;
    }
  }
  if (n > 0) {
    safeWriteJson(localePath, data);
    console.log(`${locale}: unique-phrase translate ${n} keys (${pendingByEn.size} phrases)`);
  }
}
console.log(`After unique-phrase — total leftover: ${auditCustomerSurfaces().totalLeftover}`);
