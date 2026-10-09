#!/usr/bin/env node
/**
 * Merge _deltas/{locale}.json leaves into locale files for in-scope customer keys.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectInScopeKeys,
  flattenLocale,
  isCustomerSurfaceLeftover,
  LOCALES_DIR,
} from "./_customer-surfaces-scope.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const deltasDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../_deltas");
const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));

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

for (const file of fs.readdirSync(deltasDir).filter((f) => f.endsWith(".json"))) {
  const locale = file.replace(/\.json$/, "");
  if (locale.startsWith("en")) continue;
  const deltaPath = path.join(deltasDir, file);
  const deltaFlat = flattenLocale(JSON.parse(fs.readFileSync(deltaPath, "utf8")));
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  if (!fs.existsSync(localePath)) continue;
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flattenLocale(data);
  let n = 0;
  for (const key of scope) {
    const enVal = enFlat.get(key);
    if (typeof enVal !== "string") continue;
    const deltaVal = deltaFlat.get(key);
    if (typeof deltaVal !== "string" || deltaVal === enVal) continue;
    const cur = locFlat.get(key);
    if (!isCustomerSurfaceLeftover(enVal, cur) && cur === deltaVal) continue;
    if (isCustomerSurfaceLeftover(enVal, deltaVal)) continue;
    deepSet(data, key, deltaVal);
    locFlat.set(key, deltaVal);
    n += 1;
  }
  if (n > 0) {
    safeWriteJson(localePath, data);
    console.log(`${locale}: applied ${n} delta strings for customer scope`);
  }
}
