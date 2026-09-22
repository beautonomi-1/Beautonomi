#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

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

function normEn(s) {
  return String(s)
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, "...");
}

function loadMaps() {
  const maps = {};
  const files = fs
    .readdirSync(path.join(root, "_maps"))
    .filter((f) => f.startsWith("t-sa-mobile-") && f.endsWith(".json") && !f.includes(".built."))
    .sort((a, b) => {
      const ar = a.includes("refined") ? 1 : 0;
      const br = b.includes("refined") ? 1 : 0;
      if (ar !== br) return ar - br;
      return a.localeCompare(b);
    });
  for (const f of files) {
    Object.assign(maps, JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8")));
  }
  const alias = {};
  for (const [en, row] of Object.entries(maps)) {
    const n = normEn(en);
    if (n !== en && !maps[n]) alias[n] = row;
  }
  return { ...maps, ...alias };
}

function lookupRow(maps, enVal) {
  return maps[enVal] ?? maps[normEn(enVal)];
}

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
  for (const v of extractVars(en)) if (!extractVars(out).has(v)) return false;
  return true;
}

const maps = loadMaps();
const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const enFlat = flatten(en);

for (const locale of SA) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flatten(data);
  let applied = 0;

  for (const [key, enVal] of enFlat) {
    if (!inScope(key)) continue;
    const locVal = locFlat.get(key);
    if (typeof locVal !== "string" || isIdentity(enVal)) continue;
    if (locVal !== enVal && !stillMostlyEnglish(enVal, locVal)) continue;

    const row = lookupRow(maps, enVal);
    const tr = row?.[locale];
    if (!tr || tr === enVal || !varsOk(enVal, tr)) continue;

    deepSet(data, key, tr);
    locFlat.set(key, tr);
    applied += 1;
  }

  safeWriteJson(localePath, data);
  console.log(`${locale}: direct SA map applied=${applied}`);
}
