#!/usr/bin/env node
/**
 * Sweep leftover-English keys used by customer + provider mobile apps.
 *
 * Usage:
 *   node scripts/leftover-tr-mobile-apps.mjs --report
 *   node scripts/leftover-tr-mobile-apps.mjs --apply
 *   node scripts/leftover-tr-mobile-apps.mjs --apply --namespaces=checkout,booking,common
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isIdentity,
  loadSaExternalMaps,
  stillMostlyEnglish,
  translate as translateWaveA,
} from "./_wave-a-translate.mjs";
import {
  loadExternalMaps,
  loadFrArMobileMaps,
  translate as translateFrArSw,
} from "./_wave-a-fr-ar-sw.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const localesDir = path.join(root, "src/locales");

const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const FRAR = ["fr", "ar"];
const TARGET = [...SA, ...FRAR];

const DEFAULT_PREFIXES = [
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
  "customer.mobile.components.marketAvailability",
];

const args = process.argv.slice(2);
const reportOnly = args.includes("--report");
const apply = args.includes("--apply");
const listLocale = args.find((a) => a.startsWith("--list="))?.replace("--list=", "");
const nsArg = args.find((a) => a.startsWith("--namespaces=")) || "";
const namespaces = nsArg
  ? nsArg
      .replace("--namespaces=", "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : DEFAULT_PREFIXES;

if (!reportOnly && !apply && !listLocale) {
  console.error("Pass --report, --apply, and/or --list=<locale>");
  process.exit(1);
}

loadExternalMaps(path.join(root, "_maps"), fs, path);
loadFrArMobileMaps(path.join(root, "_maps"), fs, path);
loadSaExternalMaps(path.join(root, "_maps"), fs, path);

function normEn(s) {
  return String(s)
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, "...");
}

function loadCuratedPhraseMaps() {
  const sa = {};
  const frar = {};
  const saFiles = fs
    .readdirSync(path.join(root, "_maps"))
    .filter((f) => f.startsWith("t-sa-mobile-") && f.endsWith(".json") && !f.includes(".built."))
    .sort((a, b) => {
      const ar = a.includes("refined") ? 1 : 0;
      const br = b.includes("refined") ? 1 : 0;
      if (ar !== br) return ar - br;
      return a.localeCompare(b);
    });
  for (const f of saFiles) {
    Object.assign(sa, JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8")));
  }
  const frPath = path.join(root, "_maps/t-mobile-fr-ar.json");
  if (fs.existsSync(frPath)) Object.assign(frar, JSON.parse(fs.readFileSync(frPath, "utf8")));
  return { sa, frar };
}

const CURATED = loadCuratedPhraseMaps();

function curatedTranslation(enVal, locale) {
  const n = normEn(enVal);
  if (SA.includes(locale)) return CURATED.sa[enVal]?.[locale] ?? CURATED.sa[n]?.[locale];
  return CURATED.frar[enVal]?.[locale] ?? CURATED.frar[n]?.[locale];
}

function flatten(obj, prefix = "", out = new Map()) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, full, out);
    else if (typeof v === "string") out.set(full, v);
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

function inScope(key) {
  if (namespaces.some((p) => key === p || key.startsWith(`${p}.`))) return true;
  if (namespaces.includes("customer") && key.startsWith("customer.") && !key.startsWith("customer.mobile.")) {
    return true;
  }
  if (namespaces.includes("provider") && key.startsWith("provider.") && !key.startsWith("provider.mobile.")) {
    return true;
  }
  return false;
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

function translateFor(en, locale) {
  if (isIdentity(en)) return en;
  if (FRAR.includes(locale)) return translateFrArSw(en, locale);
  if (SA.includes(locale)) return translateWaveA(en, locale);
  return en;
}

const BRAND_ALLOWLIST = new Set([
  "Instagram",
  "Facebook",
  "Twitter",
  "Google",
  "Apple",
  "WhatsApp",
  "App Store / Play Store",
  "Paystack",
  "Yoco",
  "Beautonomi",
]);

function isLeftoverEnglish(enVal, locVal, locale) {
  if (typeof enVal !== "string" || typeof locVal !== "string") return false;
  if (isIdentity(enVal)) return false;
  if (locVal === enVal && BRAND_ALLOWLIST.has(enVal)) return false;
  const curated = curatedTranslation(enVal, locale);
  if (curated != null && locVal === curated) return false;
  if (locVal === enVal) return true;
  if (stillMostlyEnglish(enVal, locVal)) return true;
  if (FRAR.includes(locale) && /[A-Za-z]{4,}/.test(locVal) && locVal === enVal) return true;
  return false;
}

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const enFlat = flatten(en);

const summary = {};

const localesToRun = listLocale ? TARGET.filter((l) => l === listLocale) : TARGET;

for (const locale of localesToRun) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flatten(data);
  let leftover = 0;
  let mapped = 0;
  let skipped = 0;

  for (const [key, enVal] of enFlat) {
    if (!inScope(key)) continue;
    const locVal = locFlat.get(key);
    if (typeof locVal !== "string") continue;
    if (!isLeftoverEnglish(enVal, locVal, locale)) continue;
    leftover += 1;
    if (listLocale) {
      console.log(`${key}\n  en: ${enVal}\n  loc: ${locVal}\n`);
      continue;
    }
    if (!apply) continue;

    const out = translateFor(enVal, locale);
    if (!out || out === enVal || !varsOk(enVal, out)) {
      skipped += 1;
      continue;
    }
    if (FRAR.includes(locale) && stillMostlyEnglish(enVal, out)) {
      skipped += 1;
      continue;
    }
    if (SA.includes(locale) && stillMostlyEnglish(enVal, out)) {
      skipped += 1;
      continue;
    }
    deepSet(data, key, out);
    locFlat.set(key, out);
    mapped += 1;
  }

  if (apply) {
    safeWriteJson(localePath, data);
  }

  summary[locale] = { leftoverBefore: leftover, mapped, skipped };
  console.log(
    `${locale}: leftover=${leftover}${apply ? ` mapped=${mapped} skipped=${skipped}` : ""}`,
  );
}

if (reportOnly && !apply) {
  const total = Object.values(summary).reduce((n, s) => n + s.leftoverBefore, 0);
  console.log(`\nTotal leftover-English (in-scope): ${total}`);
}

console.log(JSON.stringify(summary, null, 2));
