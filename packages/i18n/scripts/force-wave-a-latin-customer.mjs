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
import {
  loadSaExternalMaps,
  translate as translateWaveA,
  translateBestEffort,
} from "./_wave-a-translate.mjs";
import { loadExternalMaps } from "./_wave-a-fr-ar-sw.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
loadExternalMaps(path.join(root, "_maps"), fs, path);
loadSaExternalMaps(path.join(root, "_maps"), fs, path);

for (const locale of ["pt", "es"]) {
  const scope = collectInScopeKeys();
  const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flattenLocale(data);
  let n = 0;
  for (const key of scope) {
    const enVal = enFlat.get(key);
    if (typeof enVal !== "string") continue;
    if (!isCustomerSurfaceLeftover(enVal, locFlat.get(key))) continue;
    let tr = translateWaveA(enVal, locale);
    if (!tr || tr === enVal || isCustomerSurfaceLeftover(enVal, tr)) {
      tr = translateBestEffort(enVal, locale);
    }
    if (!tr || tr === enVal || isCustomerSurfaceLeftover(enVal, tr)) continue;
    const parts = key.split(".");
    let cur = data;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!cur[p] || typeof cur[p] !== "object" || Array.isArray(cur[p])) cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = tr;
    n += 1;
  }
  if (n > 0) safeWriteJson(localePath, data);
  console.log(`${locale}: wave-a latin ${n}`);
}
console.log(`After pt/es force — total leftover: ${auditCustomerSurfaces().totalLeftover}`);
