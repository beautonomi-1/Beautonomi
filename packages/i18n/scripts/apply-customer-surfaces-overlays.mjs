#!/usr/bin/env node
/**
 * Repair pt-BR / es-MX in-scope overrides using base pt/es where overlay is English or mixed.
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
import { stillMostlyEnglish } from "./_wave-a-translate.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));

const OVERLAYS = [
  { code: "pt-BR", base: "pt" },
  { code: "es-MX", base: "es" },
];

function isMixedOrEnglish(enVal, locVal) {
  if (typeof locVal !== "string") return true;
  if (locVal === enVal) return true;
  if (enVal.length >= 40 && stillMostlyEnglish(enVal, locVal)) return true;
  if (/[A-Za-z]{4,}/.test(locVal) && /\b(the|and|your|with|for|to)\b/i.test(locVal)) return true;
  return false;
}

for (const { code, base } of OVERLAYS) {
  const baseFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${base}.json`), "utf8")));
  const overlayPath = path.join(LOCALES_DIR, `${code}.json`);
  const data = JSON.parse(fs.readFileSync(overlayPath, "utf8"));
  const overlayFlat = flattenLocale(data);
  let n = 0;
  for (const key of scope) {
    const enVal = enFlat.get(key);
    if (typeof enVal !== "string") continue;
    if (!overlayFlat.has(key)) continue;
    const cur = overlayFlat.get(key);
    const baseVal = baseFlat.get(key);
    if (typeof baseVal !== "string" || baseVal === enVal) continue;
    if (!isMixedOrEnglish(enVal, cur) && !isCustomerSurfaceLeftover(enVal, cur)) continue;
    if (isCustomerSurfaceLeftover(enVal, baseVal)) continue;
    const parts = key.split(".");
    let o = data;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!o[p] || typeof o[p] !== "object") o[p] = {};
      o = o[p];
    }
    o[parts[parts.length - 1]] = baseVal;
    n += 1;
  }
  safeWriteJson(overlayPath, data);
  console.log(`${code}: repaired ${n} in-scope overrides from ${base}`);
}
