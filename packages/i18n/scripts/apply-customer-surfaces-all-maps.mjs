#!/usr/bin/env node
/** Apply every phrase map under _maps/ to in-scope customer leftovers. */
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

const mapsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../_maps");

function normEn(s) {
  return String(s)
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, "...");
}

function isPhraseMap(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const keys = Object.keys(obj).slice(0, 5);
  if (keys.length === 0) return false;
  for (const k of keys) {
    const row = obj[k];
    if (typeof row !== "object" || row === null || Array.isArray(row)) return false;
    if (!Object.values(row).some((v) => typeof v === "string")) return false;
  }
  return true;
}

function loadAllMaps() {
  const maps = {};
  for (const f of fs.readdirSync(mapsDir)) {
    if (!f.endsWith(".json")) continue;
    if (f.includes(".built.")) continue;
    const raw = JSON.parse(fs.readFileSync(path.join(mapsDir, f), "utf8"));
    if (Array.isArray(raw)) continue;
    if (!isPhraseMap(raw)) continue;
    Object.assign(maps, raw);
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

const maps = loadAllMaps();
console.log(`Loaded ${Object.keys(maps).length} English phrase rows from _maps`);

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
    if (!isCustomerSurfaceLeftover(enVal, locFlat.get(key))) continue;
    const mapped = lookup(maps, enVal, locale);
    if (typeof mapped !== "string" || mapped === enVal || isCustomerSurfaceLeftover(enVal, mapped)) continue;
    deepSet(data, key, mapped);
    locFlat.set(key, mapped);
    n += 1;
  }
  if (n > 0) {
    safeWriteJson(localePath, data);
    console.log(`${locale}: all-maps applied ${n}`);
  }
}
