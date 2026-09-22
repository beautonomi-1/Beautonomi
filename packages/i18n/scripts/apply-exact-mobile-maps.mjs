#!/usr/bin/env node
/**
 * Apply ALL_EXACT + fr/ar mobile maps by English string value (no calque translators).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_EXACT, isIdentity, loadSaExternalMaps, stillMostlyEnglish } from "./_wave-a-translate.mjs";
import { EXACT as FRAR_EXACT, loadExternalMaps, loadFrArMobileMaps } from "./_wave-a-fr-ar-sw.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const localesDir = path.join(root, "src/locales");

const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const FRAR = ["fr", "ar"];
const TARGET = [...SA, ...FRAR];

const PREFIXES = [
  "common",
  "auth",
  "authGate",
  "checkout",
  "booking",
  "payments",
  "validation",
  "errors",
  "time",
  "bookingLifecycle",
  "customer.mobile",
  "provider.mobile",
  "web.global.cityWaitlist",
  "web.global.marketAvailability",
];

loadExternalMaps(path.join(root, "_maps"), fs, path);
loadFrArMobileMaps(path.join(root, "_maps"), fs, path);
loadSaExternalMaps(path.join(root, "_maps"), fs, path);

function flatten(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, full, out);
    else out.set(full, String(value ?? ""));
  }
  return out;
}

function inScope(key) {
  return PREFIXES.some((p) => key === p || key.startsWith(`${p}.`));
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
  for (const v of enVars) if (!outVars.has(v)) return false;
  return true;
}

function lookup(en, locale) {
  if (SA.includes(locale)) {
    const row = ALL_EXACT.get(en);
    return row?.[locale];
  }
  const row = FRAR_EXACT.get(en);
  return row?.[locale];
}

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const enFlat = flatten(en);

for (const locale of TARGET) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flatten(data);
  let applied = 0;
  let skipped = 0;

  for (const [key, enVal] of enFlat) {
    if (!inScope(key)) continue;
    const locVal = locFlat.get(key);
    if (typeof locVal !== "string" || isIdentity(enVal)) continue;
    if (locVal !== enVal && !stillMostlyEnglish(enVal, locVal)) continue;

    const tr = lookup(enVal, locale);
    if (!tr || tr === enVal || !varsOk(enVal, tr)) {
      skipped += 1;
      continue;
    }
    // Prefer map-backed full phrases; skip only if we'd re-apply English.
    if (stillMostlyEnglish(enVal, tr) && tr.match(/[a-z]{4,}/i) && enVal.match(/[a-z]{4,}/i)) {
      const enWords = (enVal.toLowerCase().match(/[a-z]{5,}/g) || []).filter((w) => !/^(beautonomi|paystack|google|apple|whatsapp|yoco)$/i.test(w));
      const trWords = tr.toLowerCase();
      if (enWords.length >= 3 && enWords.filter((w) => trWords.includes(w)).length >= Math.min(3, enWords.length)) {
        skipped += 1;
        continue;
      }
    }
    deepSet(data, key, tr);
    locFlat.set(key, tr);
    applied += 1;
  }

  safeWriteJson(localePath, data);
  console.log(`${locale}: exact-map applied=${applied} skipped=${skipped}`);
}
