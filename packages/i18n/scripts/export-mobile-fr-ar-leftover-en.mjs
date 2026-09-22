#!/usr/bin/env node
/**
 * Export unique EN strings from fr/ar mobile-scope leftovers (still English in fr or ar).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(root, "src/locales");
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

function flatten(obj, prefix = "", out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, full, out);
    else out.set(full, String(v ?? ""));
  }
  return out;
}

function inScope(key) {
  return PREFIXES.some((p) => key === p || key.startsWith(`${p}.`));
}

const enF = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8")));
const frF = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, "fr.json"), "utf8")));
const arF = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, "ar.json"), "utf8")));

const uniq = new Set();
for (const [key, enVal] of enF) {
  if (!inScope(key) || isIdentity(enVal)) continue;
  const fr = frF.get(key);
  const ar = arF.get(key);
  const frLeft = typeof fr === "string" && (fr === enVal || stillMostlyEnglish(enVal, fr));
  const arLeft = typeof ar === "string" && (ar === enVal || stillMostlyEnglish(enVal, ar));
  if (frLeft || arLeft) uniq.add(enVal);
}

const outPath = path.join(root, "_work/mobile-fr-ar-leftover-en.json");
fs.writeFileSync(outPath, `${JSON.stringify([...uniq].sort((a, b) => a.length - b.length), null, 2)}\n`);
console.log(`Wrote ${uniq.size} strings → ${outPath}`);
