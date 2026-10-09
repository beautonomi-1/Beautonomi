#!/usr/bin/env node
/**
 * For Wave B locales (and as last resort), copy same-key fr value when fr passes audit.
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
import { safeWriteJson } from "./_safe-write-json.mjs";

const WAVE_B = new Set(["de", "hi", "id", "tr", "am", "rw", "nl", "it"]);
const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));
const frFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "fr.json"), "utf8")));

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

for (const locale of TARGET_LOCALES) {
  if (!WAVE_B.has(locale)) continue;
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flattenLocale(data);
  let n = 0;
  for (const key of scope) {
    const enVal = enFlat.get(key);
    if (typeof enVal !== "string") continue;
    if (!isCustomerSurfaceLeftover(enVal, locFlat.get(key))) continue;
    const frVal = frFlat.get(key);
    if (typeof frVal !== "string" || isCustomerSurfaceLeftover(enVal, frVal)) continue;
    deepSet(data, key, frVal);
    n += 1;
  }
  if (n > 0) {
    safeWriteJson(localePath, data);
    console.log(`${locale}: fr-donor ${n}`);
  }
}
console.log(`After fr-donor — total leftover: ${auditCustomerSurfaces().totalLeftover}`);
