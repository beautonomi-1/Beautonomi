#!/usr/bin/env node
/**
 * Retranslate in-scope keys that are still English/calques using English source.
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
import { translate as translateWaveA, stillMostlyEnglish } from "./_wave-a-translate.mjs";
import { translate as translateFrArSw } from "./_wave-a-fr-ar-sw.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const SA = new Set(["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss", "pt", "es"]);
const FRARSW = new Set(["fr", "ar", "sw"]);

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

function translateFor(en, locale) {
  if (FRARSW.has(locale)) return translateFrArSw(en, locale);
  if (SA.has(locale)) return translateWaveA(en, locale);
  return en;
}

const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));

for (const locale of TARGET_LOCALES) {
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flattenLocale(data);
  let n = 0;
  for (const key of scope) {
    const enVal = enFlat.get(key);
    if (typeof enVal !== "string") continue;
    const locVal = locFlat.get(key);
    if (!isCustomerSurfaceLeftover(enVal, locVal)) continue;
    const tr = translateFor(enVal, locale);
    if (!tr || tr === locVal || tr === enVal) continue;
    if (isCustomerSurfaceLeftover(enVal, tr)) continue;
    deepSet(data, key, tr);
    n += 1;
  }
  if (n > 0) {
    safeWriteJson(localePath, data);
    console.log(`${locale}: retranslated ${n} calques`);
  }
}
