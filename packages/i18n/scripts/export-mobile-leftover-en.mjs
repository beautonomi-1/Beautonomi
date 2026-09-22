#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");
const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const af = JSON.parse(fs.readFileSync(path.join(localesDir, "af.json"), "utf8"));

function flatten(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, full, out);
    else out.set(full, String(value ?? ""));
  }
  return out;
}

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

const ef = flatten(en);
const afFlat = flatten(af);
const uniq = new Set();

for (const [key, enVal] of ef) {
  if (!PREFIXES.some((p) => key === p || key.startsWith(`${p}.`))) continue;
  if (isIdentity(enVal)) continue;
  const loc = afFlat.get(key);
  if (typeof loc !== "string") continue;
  if (loc === enVal || stillMostlyEnglish(enVal, loc)) uniq.add(enVal);
}

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../_work/mobile-leftover-en-now.json");
fs.writeFileSync(outPath, JSON.stringify([...uniq].sort((a, b) => a.length - b.length), null, 2) + "\n");
console.log(`Wrote ${uniq.size} strings → ${outPath}`);
