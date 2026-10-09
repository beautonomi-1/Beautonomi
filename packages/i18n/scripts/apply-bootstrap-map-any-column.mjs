#!/usr/bin/env node
/**
 * Apply customer-surfaces-bootstrap.json: for each English phrase, use any valid locale column for targets still in English.
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

const bootstrap = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../_maps/customer-surfaces-bootstrap.json"),
    "utf8",
  ),
);

function pickForLocale(en, locale) {
  const row = bootstrap[en];
  if (!row) return null;
  if (row[locale] && !isCustomerSurfaceLeftover(en, row[locale])) return row[locale];
  for (const v of Object.values(row)) {
    if (typeof v === "string" && v !== en && !isCustomerSurfaceLeftover(en, v)) return v;
  }
  return null;
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

const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));

for (const locale of TARGET_LOCALES) {
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flattenLocale(data);
  let n = 0;
  for (const key of scope) {
    const enVal = enFlat.get(key);
    if (typeof enVal !== "string") continue;
    if (!isCustomerSurfaceLeftover(enVal, locFlat.get(key))) continue;
    const tr = pickForLocale(enVal, locale);
    if (!tr) continue;
    deepSet(data, key, tr);
    locFlat.set(key, tr);
    n += 1;
  }
  if (n > 0) {
    safeWriteJson(localePath, data);
    console.log(`${locale}: bootstrap-any ${n}`);
  }
}
console.log(`After bootstrap-any — total leftover: ${auditCustomerSurfaces().totalLeftover}`);
