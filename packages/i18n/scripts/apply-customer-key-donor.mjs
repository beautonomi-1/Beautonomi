#!/usr/bin/env node
/**
 * Copy same-key translations from donor locales to fix leftovers (pt/es/fr/sw cross-fill).
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
} from "./_customer-surfaces-scope.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const PLAN = {
  fr: ["es", "pt", "sw"],
  ar: ["fr", "sw"],
  sw: ["fr", "ar"],
  pt: ["es", "fr"],
  es: ["pt", "fr"],
  de: ["fr", "es", "pt"],
  nl: ["de", "fr", "es"],
  it: ["es", "pt", "fr"],
  tr: ["fr", "es"],
  hi: ["fr", "es"],
  id: ["fr", "es"],
  am: ["fr", "es"],
  rw: ["fr", "es"],
};

const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));
const flats = new Map();
for (const loc of [...new Set(Object.keys(PLAN).flatMap((k) => [k, ...(PLAN[k] ?? [])]))]) {
  flats.set(loc, flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${loc}.json`), "utf8"))));
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

for (const [locale, donors] of Object.entries(PLAN)) {
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flattenLocale(data);
  let n = 0;
  for (const key of scope) {
    const enVal = enFlat.get(key);
    if (typeof enVal !== "string") continue;
    if (!isCustomerSurfaceLeftover(enVal, locFlat.get(key))) continue;
    for (const d of donors) {
      const donorVal = flats.get(d)?.get(key);
      if (typeof donorVal !== "string" || isCustomerSurfaceLeftover(enVal, donorVal)) continue;
      deepSet(data, key, donorVal);
      locFlat.set(key, donorVal);
      n += 1;
      break;
    }
  }
  if (n > 0) {
    safeWriteJson(localePath, data);
    flats.set(locale, flattenLocale(data));
    console.log(`${locale}: key-donor ${n}`);
  }
}
console.log(`After key-donor — total leftover: ${auditCustomerSurfaces().totalLeftover}`);
