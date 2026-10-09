#!/usr/bin/env node
/**
 * Apply Wave A translations for the 42-key integration batch.
 * Reuses existing non-English values; fills gaps via _maps + wave-a translate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  INTEGRATION_BATCH_KEYS,
  SA_WAVE_A_LOCALES,
  isBatchSameAsEnglishAllowed,
} from "./integration-batch-keys.mjs";
import { translate, translateBestEffort, isIdentity } from "./_wave-a-translate.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const localesDir = path.join(root, "src/locales");
const mapPath = path.join(root, "_maps/t-sa-integration-batch.json");

function flatten(obj, prefix = "", out = new Map()) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, full, out);
    else out.set(full, String(v ?? ""));
  }
  return out;
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

function loadFileMap() {
  if (!fs.existsSync(mapPath)) return {};
  return JSON.parse(fs.readFileSync(mapPath, "utf8"));
}

function loadCuratedMap() {
  const byEn = { ...loadFileMap() };
  const enFlat = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8")));
  for (const locale of SA_WAVE_A_LOCALES) {
    const locFlat = flatten(
      JSON.parse(fs.readFileSync(path.join(localesDir, `${locale}.json`), "utf8")),
    );
    for (const key of INTEGRATION_BATCH_KEYS) {
      const enVal = enFlat.get(key);
      const locVal = locFlat.get(key);
      if (!enVal || !locVal || locVal === enVal || isIdentity(enVal)) continue;
      byEn[enVal] ??= {};
      if (!byEn[enVal][locale]) byEn[enVal][locale] = locVal;
    }
  }
  return byEn;
}

function pickTranslation(enVal, locale, key, curated) {
  const fromMap = curated[enVal]?.[locale];
  if (fromMap && fromMap !== enVal && varsOk(enVal, fromMap)) return fromMap;

  let out = translate(enVal, locale);
  if ((!out || out === enVal) && !isIdentity(enVal)) {
    out = translateBestEffort(enVal, locale);
  }
  if (out && out !== enVal && varsOk(enVal, out)) return out;

  if (isIdentity(enVal) || isBatchSameAsEnglishAllowed(key, enVal)) return enVal;
  return null;
}

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const enFlat = flatten(en);
const curated = loadCuratedMap();
const fileMap = loadFileMap();

const stats = { updated: 0, skipped: 0, failed: 0, forced: 0 };

for (const locale of SA_WAVE_A_LOCALES) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flatten(data);

  for (const key of INTEGRATION_BATCH_KEYS) {
    const enVal = enFlat.get(key);
    if (!enVal) {
      console.error("missing in en:", key);
      stats.failed += 1;
      continue;
    }
    const cur = locFlat.get(key);
    const forced = fileMap[enVal]?.[locale];
    if (forced && forced !== enVal && varsOk(enVal, forced)) {
      deepSet(data, key, forced);
      locFlat.set(key, forced);
      stats.updated += 1;
      stats.forced += 1;
      continue;
    }
    if (cur && cur !== enVal) {
      stats.skipped += 1;
      continue;
    }

    const next = pickTranslation(enVal, locale, key, curated);
    if (!next) {
      console.warn(`[${locale}] no translation: ${key}`);
      stats.failed += 1;
      continue;
    }
    if (next === enVal && !isIdentity(enVal) && !isBatchSameAsEnglishAllowed(key, enVal)) {
      console.warn(`[${locale}] still English: ${key}`);
      stats.failed += 1;
      continue;
    }

    deepSet(data, key, next);
    locFlat.set(key, next);
    stats.updated += 1;
  }

  safeWriteJson(localePath, data);
  console.log(`applied ${locale}`);
}

console.log(JSON.stringify(stats, null, 2));
process.exitCode = stats.failed > 0 ? 1 : 0;
