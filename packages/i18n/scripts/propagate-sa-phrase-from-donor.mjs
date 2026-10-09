#!/usr/bin/env node
/**
 * When donor locale has a good translation for an English phrase, apply to other SA locales with same phrase leftover.
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

const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const DONOR_ORDER = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));

/** @type {Map<string, Map<string, string>>} */
const phraseByLocale = new Map();
for (const loc of SA) {
  const flat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${loc}.json`), "utf8")));
  const m = new Map();
  for (const key of scope) {
    const en = enFlat.get(key);
    if (typeof en !== "string") continue;
    const v = flat.get(key);
    if (typeof v === "string" && !isCustomerSurfaceLeftover(en, v)) m.set(en, v);
  }
  phraseByLocale.set(loc, m);
}

for (const locale of SA) {
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flattenLocale(data);
  let n = 0;
  for (const key of scope) {
    const enVal = enFlat.get(key);
    if (typeof enVal !== "string") continue;
    if (!isCustomerSurfaceLeftover(enVal, locFlat.get(key))) continue;
    for (const donor of DONOR_ORDER) {
      if (donor === locale) continue;
      const tr = phraseByLocale.get(donor)?.get(enVal);
      if (typeof tr !== "string" || isCustomerSurfaceLeftover(enVal, tr)) continue;
      const parts = key.split(".");
      let cur = data;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!cur[p] || typeof cur[p] !== "object" || Array.isArray(cur[p])) cur[p] = {};
        cur = cur[p];
      }
      cur[parts[parts.length - 1]] = tr;
      locFlat.set(key, tr);
      n += 1;
      break;
    }
  }
  if (n > 0) {
    safeWriteJson(localePath, data);
    phraseByLocale.set(locale, new Map());
    const flat = flattenLocale(data);
    for (const key of scope) {
      const en = enFlat.get(key);
      if (typeof en !== "string") continue;
      const v = flat.get(key);
      if (typeof v === "string" && !isCustomerSurfaceLeftover(en, v)) phraseByLocale.get(locale).set(en, v);
    }
    console.log(`${locale}: propagated ${n}`);
  }
}
console.log(`After SA propagate — total leftover: ${auditCustomerSurfaces().totalLeftover}`);
