#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditCustomerSurfaces,
  collectInScopeKeys,
  flattenLocale,
  isCustomerSurfaceLeftover,
  LOCALES_DIR,
} from "./_customer-surfaces-scope.mjs";
import { loadExternalMaps, loadFrArMobileMaps } from "./_wave-a-fr-ar-sw.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
loadExternalMaps(path.join(root, "_maps"), fs, path);
loadFrArMobileMaps(path.join(root, "_maps"), fs, path);

function loadMaps() {
  const maps = {};
  for (const f of ["t-mobile-fr-ar.json", "t-web-a.json", "t-web-b.json", "t-customer-rest.json"]) {
    const p = path.join(root, "_maps", f);
    if (fs.existsSync(p)) Object.assign(maps, JSON.parse(fs.readFileSync(p, "utf8")));
  }
  return maps;
}

function normEn(s) {
  return String(s)
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, "...");
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

for (const locale of ["fr", "ar", "sw"]) {
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flattenLocale(data);
  let n = 0;
  for (const key of scope) {
    const enVal = enFlat.get(key);
    if (typeof enVal !== "string") continue;
    if (!isCustomerSurfaceLeftover(enVal, locFlat.get(key))) continue;
    const row = maps[enVal] ?? maps[normEn(enVal)];
    const mapped = row?.[locale];
    if (typeof mapped !== "string" || isCustomerSurfaceLeftover(enVal, mapped)) continue;
    deepSet(data, key, mapped);
    n += 1;
  }
  if (n > 0) {
    safeWriteJson(localePath, data);
    console.log(`${locale}: fr-ar maps (customer scope) ${n}`);
  }
}
console.log(`After fr-ar customer maps — total leftover: ${auditCustomerSurfaces().totalLeftover}`);
