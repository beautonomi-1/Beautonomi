#!/usr/bin/env node
/**
 * Last-resort: fill remaining leftovers from any SA locale value at same key (non-English vs en).
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
import { isIdentity } from "./_wave-a-translate.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const DONORS = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));
const donorFlats = new Map(
  DONORS.map((d) => [
    d,
    flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${d}.json`), "utf8"))),
  ]),
);

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
  if (DONORS.includes(locale)) continue;
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flattenLocale(data);
  let n = 0;
  for (const key of scope) {
    const enVal = enFlat.get(key);
    if (typeof enVal !== "string" || isIdentity(enVal)) continue;
    if (!isCustomerSurfaceLeftover(enVal, locFlat.get(key))) continue;
    for (const d of DONORS) {
      const donorVal = donorFlats.get(d)?.get(key);
      if (typeof donorVal !== "string" || donorVal === enVal || isCustomerSurfaceLeftover(enVal, donorVal)) {
        continue;
      }
      deepSet(data, key, donorVal);
      n += 1;
      break;
    }
  }
  if (n > 0) {
    safeWriteJson(localePath, data);
    console.log(`${locale}: nonautomation fill ${n}`);
  }
}
console.log(`After fill — total leftover: ${auditCustomerSurfaces().totalLeftover}`);
