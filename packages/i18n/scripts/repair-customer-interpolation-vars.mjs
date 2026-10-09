#!/usr/bin/env node
/**
 * Restore missing {{var}} placeholders in in-scope keys (common MT / calque damage).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectInScopeKeys,
  flattenLocale,
  LOCALES_DIR,
  TARGET_LOCALES,
} from "./_customer-surfaces-scope.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

function extractVars(str) {
  const vars = new Set();
  for (const m of String(str).matchAll(/\{\{(\w+)\}\}/g)) vars.add(m[1]);
  return vars;
}

function varsOk(en, out) {
  const enVars = extractVars(en);
  const outVars = extractVars(out);
  for (const v of enVars) {
    if (!outVars.has(v)) return false;
  }
  return true;
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

const FIXES = {
  "customer.mobile.screens.marketAvailability.goToHost": {
    af: "Gaan na {{host}}",
    zu: "Yiya ku-{{host}}",
    xh: "Yiya ku-{{host}}",
    st: "Eya ho {{host}}",
    nso: "Eya go {{host}}",
    tn: "Tsamaya go {{host}}",
    ts: "Yiya eka {{host}}",
    ve: "Khou ya {{host}}",
    ss: "Yiya ku-{{host}}",
  },
  "web.global.marketAvailability.goToHost": {
    af: "Gaan na {{host}}",
    zu: "Yiya ku-{{host}}",
    xh: "Yiya ku-{{host}}",
    st: "Eya ho {{host}}",
    nso: "Eya go {{host}}",
    tn: "Tsamaya go {{host}}",
    ts: "Yiya eka {{host}}",
    ve: "Khou ya {{host}}",
    ss: "Yiya ku-{{host}}",
  },
  "web.search.distanceAway": {
    af: "{{km}} km ver",
    zu: "{{km}} km kude",
    xh: "{{km}} km kude",
    st: "{{km}} km hole",
    nso: "{{km}} km hole",
    tn: "{{km}} km kgole",
    ts: "{{km}} km le kule",
    ve: "{{km}} km u fhira",
    ss: "{{km}} km kude",
  },
  "customer.mobile.screens.membership.pausedBody": {
    tn: "Ukuvuselela okuzenzakalelayo ku timilwe{{until}}. Busetsa gape nako le nngwe go boloka melemo ya gago.",
  },
};

const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));

for (const locale of TARGET_LOCALES) {
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  let n = 0;
  for (const [key, byLoc] of Object.entries(FIXES)) {
    if (!scope.has(key)) continue;
    const enVal = enFlat.get(key);
    const fix = byLoc[locale];
    if (typeof fix !== "string" || !varsOk(enVal, fix)) continue;
    deepSet(data, key, fix);
    n += 1;
  }
  if (n > 0) {
    safeWriteJson(localePath, data);
    console.log(`${locale}: interpolation repaired ${n} keys`);
  }
}
