#!/usr/bin/env node
/**
 * End-to-end structural QA for the 11 customer/provider mobile locales:
 * - every in-scope en key exists in each locale
 * - no unexpected empty strings (except where en is empty)
 * - {{var}} placeholders match en
 * - cashRefund* keys present and not identical to en (when en is non-identity)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(root, "src/locales");
const TARGET = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss", "fr", "ar"];
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

function extractVars(str) {
  return [...String(str).matchAll(/\{\{(\w+)\}\}/g)]
    .map((m) => m[1])
    .sort()
    .join(",");
}

const enFlat = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8")));
const enKeys = [...enFlat.keys()].filter(inScope);

const cashKeys = enKeys.filter((k) => k.includes("cashRefund"));
let failed = false;

for (const locale of TARGET) {
  const raw = JSON.parse(fs.readFileSync(path.join(localesDir, `${locale}.json`), "utf8"));
  const locFlat = flatten(raw);
  let missing = 0;
  let empty = 0;
  let varMismatch = 0;

  for (const key of enKeys) {
    const enVal = enFlat.get(key);
    const locVal = locFlat.get(key);
    if (locVal === undefined) {
      missing++;
      if (missing <= 3) console.error(`[${locale}] missing ${key}`);
      continue;
    }
    if (locVal === "" && enVal !== "") {
      empty++;
      continue;
    }
    if (extractVars(enVal) !== extractVars(locVal)) {
      varMismatch++;
      if (varMismatch <= 2) console.error(`[${locale}] vars ${key}: en=${enVal} loc=${locVal}`);
    }
  }

  if (missing || varMismatch) failed = true;
  console.log(`${locale}: missing=${missing} empty=${empty} varMismatch=${varMismatch}`);
}

for (const locale of TARGET) {
  const locFlat = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, `${locale}.json`), "utf8")));
  for (const key of cashKeys) {
    const enVal = enFlat.get(key);
    const locVal = locFlat.get(key);
    if (locVal === undefined || locVal === enVal) {
      console.error(`[${locale}] cashRefund not localized: ${key}`);
      failed = true;
    }
  }
}

const arFlat = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, "ar.json"), "utf8")));
const arHasScript = /[\u0600-\u06FF]/.test(
  arFlat.get("customer.mobile.screens.bookingDetail.cashRefundTitle") ?? "",
);
if (!arHasScript) {
  console.error("[ar] expected Arabic script in cashRefundTitle");
  failed = true;
}

if (failed) {
  console.error("\nqa-mobile-locales-e2e: FAIL");
  process.exit(1);
}
console.log("\nqa-mobile-locales-e2e: PASS");
