#!/usr/bin/env node
/**
 * Build _maps/customer-surfaces-harvested.json from non-leftover in-scope strings per locale.
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

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../_maps/customer-surfaces-harvested.json");
const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));
/** @type {Record<string, Record<string, string>>} */
const maps = {};

for (const locale of TARGET_LOCALES) {
  const locFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), "utf8")));
  for (const key of scope) {
    const en = enFlat.get(key);
    if (typeof en !== "string") continue;
    const loc = locFlat.get(key);
    if (typeof loc !== "string" || isCustomerSurfaceLeftover(en, loc)) continue;
    if (!maps[en]) maps[en] = {};
    maps[en][locale] = loc;
  }
}

safeWriteJson(outPath, maps);
console.log(`Harvested ${Object.keys(maps).length} English phrases with at least one good locale`);
