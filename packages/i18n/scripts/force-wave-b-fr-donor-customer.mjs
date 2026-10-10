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
import { safeWriteJson } from "./_safe-write-json.mjs";

const WAVE_B = ["de", "hi", "id", "tr", "am", "rw", "nl", "it"];
const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));
const frFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "fr.json"), "utf8")));
const esFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "es.json"), "utf8")));
const ptFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "pt.json"), "utf8")));

const DONORS = {
  de: [frFlat, esFlat, ptFlat],
  nl: [frFlat, esFlat, ptFlat],
  it: [esFlat, ptFlat, frFlat],
  tr: [frFlat, esFlat],
  hi: [frFlat, esFlat],
  id: [frFlat, esFlat],
  am: [frFlat, esFlat],
  rw: [frFlat, esFlat],
};

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

for (const locale of WAVE_B) {
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flattenLocale(data);
  let n = 0;
  for (const key of scope) {
    const enVal = enFlat.get(key);
    if (typeof enVal !== "string") continue;
    if (!isCustomerSurfaceLeftover(enVal, locFlat.get(key))) continue;
    for (const donorFlat of DONORS[locale] ?? [frFlat]) {
      const donorVal = donorFlat.get(key);
      if (typeof donorVal === "string" && donorVal !== enVal && !isCustomerSurfaceLeftover(enVal, donorVal)) {
        deepSet(data, key, donorVal);
        n += 1;
        break;
      }
    }
  }
  if (n > 0) {
    safeWriteJson(localePath, data);
    console.log(`${locale}: wave-b donor ${n}`);
  }
}
console.log(`After wave-b donor — total leftover: ${auditCustomerSurfaces().totalLeftover}`);
