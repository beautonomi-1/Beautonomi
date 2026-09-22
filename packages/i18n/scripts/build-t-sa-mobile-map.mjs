#!/usr/bin/env node
/**
 * Build _maps/t-sa-mobile-auto.json from translateBestEffort for still-English mobile strings.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, loadSaExternalMaps, translateBestEffort } from "./_wave-a-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const localesDir = path.join(root, "src/locales");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

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

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const af = JSON.parse(fs.readFileSync(path.join(localesDir, "af.json"), "utf8"));
const enFlat = flatten(en);
const afFlat = flatten(af);

const unique = new Set();
for (const [key, enVal] of enFlat) {
  if (!inScope(key)) continue;
  if (isIdentity(enVal)) continue;
  if (afFlat.get(key) === enVal) unique.add(enVal);
}

const map = {};
for (const enVal of unique) {
  const row = {};
  for (const loc of SA) {
    const tr = translateBestEffort(enVal, loc);
    if (tr !== enVal) row[loc] = tr;
  }
  if (Object.keys(row).length) map[enVal] = row;
}

const dest = path.join(root, "_maps/t-sa-mobile-auto.json");
fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
console.log(`Wrote ${Object.keys(map).length} entries (${unique.size} unique EN) → ${dest}`);
