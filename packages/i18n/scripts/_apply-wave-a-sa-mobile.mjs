/**
 * Translate leftover-English mobile-scope keys for SA Wave A locales.
 *
 * Usage:
 *   node scripts/_apply-wave-a-sa-mobile.mjs --merge
 *   node scripts/_apply-wave-a-sa-mobile.mjs --namespaces=checkout,booking --merge
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isIdentity,
  loadSaExternalMaps,
  translate,
  translateBestEffort,
} from "./_wave-a-translate.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const localesDir = path.join(root, "src/locales");

const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

const args = process.argv.slice(2);
const merge = args.includes("--merge");
const nsArg = args.find((a) => a.startsWith("--namespaces=")) || "";
const namespaces = nsArg
  ? nsArg
      .replace("--namespaces=", "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : [
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

function inNamespaces(key) {
  return namespaces.some((ns) => key === ns || key.startsWith(`${ns}.`));
}

function extractVars(str) {
  const vars = new Set();
  for (const m of String(str).matchAll(/\{\{(\w+)\}\}/g)) vars.add(m[1]);
  return vars;
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

function translateFor(en, locale) {
  const strict = translate(en, locale);
  if (strict !== en) return strict;
  return translateBestEffort(en, locale);
}

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const enFlat = flatten(en);

for (const locale of SA) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flatten(data);
  let mapped = 0;
  let skipped = 0;

  for (const [key, enVal] of enFlat) {
    if (!inNamespaces(key)) continue;
    const locVal = locFlat.get(key);
    if (typeof locVal !== "string" || locVal !== enVal || isIdentity(enVal)) continue;

    const out = translateFor(enVal, locale);
    const enVars = extractVars(enVal);
    const outVars = extractVars(out);
    let ok = out !== enVal;
    for (const v of enVars) {
      if (!outVars.has(v)) ok = false;
    }
    if (!ok) {
      skipped += 1;
      continue;
    }
    deepSet(data, key, out);
    locFlat.set(key, out);
    mapped += 1;
  }

  if (merge) {
    safeWriteJson(localePath, data);
  }
  console.log(`${locale}: mapped=${mapped} skipped=${skipped}${merge ? " (merged)" : ""}`);
}
