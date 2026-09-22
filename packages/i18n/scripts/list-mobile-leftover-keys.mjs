#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");
const locale = process.argv[2] || "af";

function normEn(s) {
  return String(s)
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, "...");
}

function loadCurated() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const sa = {};
  for (const f of fs.readdirSync(path.join(root, "_maps"))) {
    if (f.startsWith("t-sa-mobile-") && f.endsWith(".json") && !f.includes(".built.")) {
      Object.assign(sa, JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8")));
    }
  }
  return sa;
}

const CURATED = loadCurated();

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

function isLeftover(enVal, locVal) {
  if (isIdentity(enVal)) return false;
  const curated = CURATED[enVal]?.[locale] ?? CURATED[normEn(enVal)]?.[locale];
  if (curated && locVal === curated && locVal !== enVal) return false;
  if (locVal === enVal) return true;
  return stillMostlyEnglish(enVal, locVal);
}

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const loc = JSON.parse(fs.readFileSync(path.join(localesDir, `${locale}.json`), "utf8"));
const ef = flatten(en);
const lf = flatten(loc);

for (const [key, enVal] of ef) {
  if (!PREFIXES.some((p) => key === p || key.startsWith(`${p}.`))) continue;
  const locVal = lf.get(key);
  if (typeof locVal !== "string") continue;
  if (isLeftover(enVal, locVal)) {
    console.log(key);
    console.log("  EN:", enVal);
    console.log("  LOC:", locVal);
  }
}
