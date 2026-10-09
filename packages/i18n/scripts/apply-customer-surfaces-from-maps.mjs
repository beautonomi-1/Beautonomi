#!/usr/bin/env node
/**
 * Apply SA + fr/ar phrase maps (English → locale) to in-scope keys still in English.
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
import { safeWriteJson } from "./_safe-write-json.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function normEn(s) {
  return String(s)
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, "...");
}

const EXTRA_MAP_FILES = new Set([
  "t-mobile-fr-ar.json",
  "t-web-a.json",
  "t-web-b.json",
  "t-customer-rest.json",
  "t-core-leftover.json",
  "t-remaining-long.json",
  "t-still-mid-a.json",
  "t-still-short.json",
  "t-sa-mobile-i18n-fix-leftover.json",
  "t-sa-mobile-ci-leftover.json",
  "t-sa-mobile-refined.json",
  "t-sa-mobile-product-shop-gate.json",
  "t-sa-mobile-auto.json",
]);

function loadMaps() {
  const maps = {};
  for (const f of fs.readdirSync(path.join(root, "_maps"))) {
    if (!f.endsWith(".json")) continue;
    if (f.startsWith("_untranslated")) continue;
    if (f.startsWith("t-sa-mobile-") && !f.includes(".built.")) {
      Object.assign(maps, JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8")));
      continue;
    }
    if (f.startsWith("t-chunk1-")) {
      Object.assign(maps, JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8")));
      continue;
    }
    if (EXTRA_MAP_FILES.has(f)) {
      Object.assign(maps, JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8")));
    }
  }
  return maps;
}

function lookup(maps, en, locale) {
  const row = maps[en] ?? maps[normEn(en)];
  return row?.[locale];
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

const maps = loadMaps();
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
    const mapped = lookup(maps, enVal, locale);
    if (typeof mapped !== "string" || mapped === enVal || isCustomerSurfaceLeftover(enVal, mapped)) continue;
    deepSet(data, key, mapped);
    locFlat.set(key, mapped);
    n += 1;
  }
  if (n > 0) {
    safeWriteJson(localePath, data);
    console.log(`${locale}: map-applied ${n} keys`);
  }
}
