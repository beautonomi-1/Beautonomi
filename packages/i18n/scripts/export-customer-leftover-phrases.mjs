#!/usr/bin/env node
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

const locale = process.argv[2];
const outFile =
  process.argv[3] ??
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../_work/customer-leftover-phrases.json");

const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));
/** @type {Record<string, string[]>} */
const byLocale = {};

for (const loc of locale ? [locale] : TARGET_LOCALES) {
  const locFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${loc}.json`), "utf8")));
  const phrases = [];
  for (const key of scope) {
    const en = enFlat.get(key);
    if (typeof en !== "string") continue;
    if (isCustomerSurfaceLeftover(en, locFlat.get(key))) phrases.push(en);
  }
  byLocale[loc] = [...new Set(phrases)].sort();
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(byLocale, null, 2));
console.log(Object.fromEntries(Object.entries(byLocale).map(([k, v]) => [k, v.length])));
