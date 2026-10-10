#!/usr/bin/env node
/** Retranslate in-scope calques (stillMostlyEnglish) via MyMemory. */
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
import { stillMostlyEnglish } from "./_wave-a-translate.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";
import { remoteTranslatePhrase } from "./_remote-translate.mjs";

const onlyLocale = process.argv.find((a) => a.startsWith("--locale="))?.replace("--locale=", "");
const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));
const locales = onlyLocale ? TARGET_LOCALES.filter((l) => l === onlyLocale) : TARGET_LOCALES;

for (const locale of locales) {
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flattenLocale(data);
  let n = 0;
  for (const key of scope) {
    const enVal = enFlat.get(key);
    if (typeof enVal !== "string") continue;
    const locVal = locFlat.get(key);
    if (!isCustomerSurfaceLeftover(enVal, locVal)) continue;
    if (locVal === enVal) continue;
    if (!stillMostlyEnglish(enVal, locVal)) continue;
    const tr = await remoteTranslatePhrase(enVal, locale, 80);
    if (!tr || tr === enVal || isCustomerSurfaceLeftover(enVal, tr)) continue;
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
  }
  if (n > 0) safeWriteJson(localePath, data);
  console.log(`${locale}: repaired ${n} calques`);
}
